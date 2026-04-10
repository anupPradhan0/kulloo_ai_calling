/**
 * AI voice ESL loop: record chunks → Deepgram → OpenAI → VEXYL → playback (buffer/temp WAV handover).
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Connection } from "modesl";
import { env } from "../../config/env";
import { logger } from "../../utils/logger";
import type { CallDocument } from "../../modules/calls/models/call.model";
import type { CallService } from "../../modules/calls/services/call.service";
import { DeepgramSttAdapter } from "./deepgram-stt.adapter";
import { OpenAiLlmAdapter } from "./openai-llm.adapter";
import { VexylTtsAdapter } from "./vexyl-tts.adapter";
import { getAiSystemPrompt } from "./prompt-loader";
import type { ChatMessage } from "./types";

const stt = new DeepgramSttAdapter();
const llm = new OpenAiLlmAdapter();
const tts = new VexylTtsAdapter();

export interface AiVoiceEslRunnerCtx {
  correlationId: string;
  callId: string;
  channelUuid: string;
}

function log(ctx: AiVoiceEslRunnerCtx, message: string, extra?: unknown): void {
  logger.info(message, {
    component: "ai_voice_esl",
    correlationId: ctx.correlationId,
    callId: ctx.callId,
    channelUuid: ctx.channelUuid,
    ...(extra !== undefined ? { extra } : {}),
  });
}

async function sendRecvApi(conn: Connection, cmd: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    conn.sendRecv(cmd, (evt: unknown) => {
      const e = evt as { getBody?: () => unknown } | undefined;
      const body = typeof e?.getBody === "function" ? String(e.getBody() ?? "") : "";
      if (body.startsWith("-ERR")) {
        reject(new Error(body));
        return;
      }
      resolve();
    });
  });
}

async function execAndWait(
  conn: Connection,
  app: string,
  arg: string,
  timeoutMs: number,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let timer: NodeJS.Timeout | undefined;
    const onComplete = (evt: unknown) => {
      const eslEvent = evt as { getHeader?: (name: string) => string | undefined };
      const getHeader = (name: string): string | undefined =>
        eslEvent.getHeader ? eslEvent.getHeader(name) : undefined;
      const application = getHeader("Application");
      const applicationData = getHeader("Application-Data");
      if (application !== app) return;
      if (arg && (applicationData ?? "") !== arg) return;
      conn.off("esl::event::CHANNEL_EXECUTE_COMPLETE::*", onComplete);
      if (timer) clearTimeout(timer);
      resolve();
    };

    conn.on("esl::event::CHANNEL_EXECUTE_COMPLETE::*", onComplete);
    timer = setTimeout(() => {
      conn.off("esl::event::CHANNEL_EXECUTE_COMPLETE::*", onComplete);
      reject(new Error(`Timeout after ${timeoutMs}ms: exec ${app}`));
    }, timeoutMs);

    conn.execute(app, arg, (reply: unknown) => {
      const r = reply as { getBody?: () => unknown } | undefined;
      const body = typeof r?.getBody === "function" ? r.getBody() : "";
      if (typeof body === "string" && body.startsWith("-ERR")) {
        conn.off("esl::event::CHANNEL_EXECUTE_COMPLETE::*", onComplete);
        if (timer) clearTimeout(timer);
        reject(new Error(body));
      }
    });
  });
}

/** DTMF `#` ends recording early; `*` during playback triggers uuid_break (barge-in). */
function waitForDtmf(
  conn: Connection,
  timeoutMs: number,
  accept: Set<string>,
): Promise<string | "timeout"> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v: string | "timeout") => {
      if (done) return;
      done = true;
      conn.off("esl::event::DTMF::*", onDtmf);
      conn.off("esl::event::CHANNEL_DTMF::*", onDtmf);
      clearTimeout(timer);
      resolve(v);
    };

    const onDtmf = (evt: unknown) => {
      const eslEvent = evt as { getHeader?: (name: string) => string | undefined };
      const digit =
        (eslEvent.getHeader?.("DTMF-Digit") ?? eslEvent.getHeader?.("digit") ?? eslEvent.getHeader?.("Key")) ??
        "";
      const d = String(digit).trim();
      if (!d) return;
      if (accept.has(d)) finish(d);
    };

    conn.on("esl::event::DTMF::*", onDtmf);
    conn.on("esl::event::CHANNEL_DTMF::*", onDtmf);
    const timer = setTimeout(() => finish("timeout"), timeoutMs);
  });
}

async function playbackWithOptionalInterrupt(
  conn: Connection,
  channelUuid: string,
  wavPath: string,
  playbackTimeoutMs: number,
): Promise<"played" | "interrupted"> {
  return await new Promise((resolve, reject) => {
    let timer: NodeJS.Timeout | undefined;
    let settled = false;

    const onComplete = (evt: unknown) => {
      const eslEvent = evt as { getHeader?: (name: string) => string | undefined };
      const getHeader = (name: string): string | undefined =>
        eslEvent.getHeader ? eslEvent.getHeader(name) : undefined;
      if (getHeader("Application") !== "playback") return;
      if ((getHeader("Application-Data") ?? "") !== wavPath) return;
      cleanup();
      if (!settled) {
        settled = true;
        resolve("played");
      }
    };

    const onDtmf = async (evt: unknown) => {
      const eslEvent = evt as { getHeader?: (name: string) => string | undefined };
      const digit = String(
        eslEvent.getHeader?.("DTMF-Digit") ?? eslEvent.getHeader?.("digit") ?? "",
      ).trim();
      if (digit !== "*") return;
      try {
        await sendRecvApi(conn, `api uuid_break ${channelUuid} all`);
      } catch (e) {
        logger.warn("ai_voice_uuid_break_failed", { err: e });
      }
      cleanup();
      if (!settled) {
        settled = true;
        resolve("interrupted");
      }
    };

    const cleanup = () => {
      conn.off("esl::event::CHANNEL_EXECUTE_COMPLETE::*", onComplete);
      conn.off("esl::event::DTMF::*", onDtmf);
      conn.off("esl::event::CHANNEL_DTMF::*", onDtmf);
      if (timer) clearTimeout(timer);
    };

    conn.on("esl::event::CHANNEL_EXECUTE_COMPLETE::*", onComplete);
    conn.on("esl::event::DTMF::*", onDtmf);
    conn.on("esl::event::CHANNEL_DTMF::*", onDtmf);
    timer = setTimeout(() => {
      cleanup();
      if (!settled) {
        settled = true;
        reject(new Error(`playback timeout ${playbackTimeoutMs}ms`));
      }
    }, playbackTimeoutMs);

    conn.execute("playback", wavPath, (reply: unknown) => {
      const r = reply as { getBody?: () => unknown } | undefined;
      const body = typeof r?.getBody === "function" ? r.getBody() : "";
      if (typeof body === "string" && body.startsWith("-ERR")) {
        cleanup();
        reject(new Error(body));
      }
    });
  });
}

async function enqueueHangupSummary(callService: CallService, callId: string): Promise<void> {
  if (!env.aiSummaryOnHangup) {
    return;
  }
  try {
    const doc = await callService.findCallDocumentById(callId);
    const turns = doc?.aiVoice?.turns ?? [];
    if (turns.length === 0) {
      return;
    }
    const lines = turns.map((t) => `${t.role}: ${t.text}`).join("\n");
    const summary = await llm.summarizeTranscript(lines);
    await callService.setAiVoiceOperatorSummary(callId, summary);
    logger.info("ai_voice_operator_summary_stored", {
      component: "ai_voice_esl",
      callId,
      correlationId: doc?.correlationId,
      channelUuid: doc?.providerCallId,
    });
  } catch (e) {
    logger.error("ai_voice_hangup_summary_failed", { callId, err: e });
  }
}

export async function runAiVoiceEslFlow(input: {
  conn: Connection;
  callService: CallService;
  call: CallDocument;
  ctx: AiVoiceEslRunnerCtx;
  recordingsBase: string;
}): Promise<{ recordingPath: string }> {
  const { conn, callService, call, ctx, recordingsBase } = input;
  const callId = call._id.toString();
  const channelUuid = ctx.channelUuid;

  conn.send("event plain DTMF");
  conn.send("event plain CHANNEL_DTMF");

  const systemPrompt = await getAiSystemPrompt(env.aiVoicePersona);
  const messages: ChatMessage[] = [{ role: "system", content: systemPrompt }];

  await execAndWait(conn, "answer", "", 8000);
  log(ctx, "ai_voice_answered");

  await callService.setStatus(callId, "answered", { answeredAt: new Date() });
  await callService.pushEvent(call, "answered");

  // Opening line
  const greetingText =
    "Hi, this is the Kulloo voice assistant. What can I help you with?";
  const greetWav = path.join(os.tmpdir(), `kulloo-${callId}-greet.wav`);
  try {
    const { wav } = await tts.synthesize(greetingText);
    await fs.writeFile(greetWav, wav);
    await playbackWithOptionalInterrupt(conn, channelUuid, greetWav, 60_000);
    await callService.appendAiVoiceTurn(callId, { role: "assistant", text: greetingText });
    messages.push({ role: "assistant", content: greetingText });
  } finally {
    await fs.unlink(greetWav).catch(() => undefined);
  }

  let round = 0;
  const maxRounds = env.aiVoiceMaxRounds;
  const sliceMs = env.aiVoiceUserSliceMs;

  while (round < maxRounds) {
    round += 1;
    const userWav = path.join(recordingsBase, `${channelUuid}_ai_u${round}.wav`);

    conn.execute("record_session", userWav, () => {});
    log(ctx, "ai_voice_user_slice_started", { round, path: userWav });

    const dtmf = await waitForDtmf(conn, sliceMs, new Set(["#"]));
    await execAndWait(conn, "stop_record_session", userWav, 8000).catch(() => undefined);

    if (dtmf === "#") {
      log(ctx, "ai_voice_user_slice_stopped_hash");
    }

    const userText = await stt.transcribeFile(userWav, {
      sampleRate: env.aiAudioForkSampleRate,
    });
    await fs.unlink(userWav).catch(() => undefined);

    if (!userText.trim()) {
      log(ctx, "ai_voice_empty_stt", { round });
      continue;
    }
    if (/\b(goodbye|bye bye|hang up|that's all)\b/i.test(userText)) {
      await callService.appendAiVoiceTurn(callId, { role: "user", text: userText });
      messages.push({ role: "user", content: userText });
      break;
    }

    await callService.appendAiVoiceTurn(callId, { role: "user", text: userText });
    messages.push({ role: "user", content: userText });

    const ac = new AbortController();
    let reply: string;
    try {
      const out = await llm.complete(messages, { signal: ac.signal });
      reply = out.text;
    } catch (e) {
      log(ctx, "ai_voice_llm_failed", { err: e });
      reply = "Sorry, I did not catch that. Could you repeat?";
    }

    await callService.appendAiVoiceTurn(callId, { role: "assistant", text: reply });
    messages.push({ role: "assistant", content: reply });

    const playPath = path.join(os.tmpdir(), `kulloo-${callId}-a${round}.wav`);
    try {
      const { wav } = await tts.synthesize(reply);
      await fs.writeFile(playPath, wav);
      const pb = await playbackWithOptionalInterrupt(conn, channelUuid, playPath, 120_000);
      if (pb === "interrupted") {
        log(ctx, "ai_voice_barge_in");
        ac.abort();
      }
    } finally {
      await fs.unlink(playPath).catch(() => undefined);
    }
  }

  await execAndWait(conn, "hangup", "", 5000).catch(() => undefined);

  const hangupAt = new Date();
  await callService.setStatus(callId, "hangup", { hangupAt });
  await callService.pushEvent(call, "hangup");
  await callService.setStatus(callId, "completed", { completedAt: new Date() });
  await callService.pushEvent(call, "completed");

  setImmediate(() => {
    void enqueueHangupSummary(callService, callId);
  });

  return { recordingPath: path.join(recordingsBase, `${channelUuid}.wav`) };
}
