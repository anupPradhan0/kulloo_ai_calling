/**
 * Listens for inbound TCP connections from FreeSWITCH when the dialplan runs the socket application (outbound ESL pattern).
 * Each connection drives one media leg: answer, tone, record to WAV, optional early DTMF stop, hangup, and Mongo updates through CallService.
 * Recovery jobs use getActiveProviderCallIds to avoid closing calls that still have an open ESL session in this process.
 */

/** Layer: telephony infrastructure — Event Socket server and media scripting; all persistence goes through CallService. */
import { Server as EslServer, Connection } from "modesl";
import { CallService } from "../../modules/calls/services/call.service";
import type { CallDocument } from "../../modules/calls/models/call.model";
import { randomUUID } from "crypto";
import path from "path";
import { toE164BestEffort } from "../../utils/phone-normalize";
import fs from "node:fs/promises";
import { metrics } from "../observability/metrics.service";
import { logger, serializeError } from "../../utils/logger";
import type { AgentWsService } from "../agent/agent-ws.service";
import { env } from "../../config/env";
import {
  buildDatePartitionedRecordingKey,
  isS3Enabled,
  uploadWavToS3,
} from "../storage/s3.service";
import { runAiVoiceEslFlow } from "../ai/ai-voice-esl.runner";

/** Constructor options for the ESL TCP server: listen address, port, and where WAV files are written. */
export interface EslCallHandlerOptions {
  port: number;
  host?: string;
  recordingsDir?: string;
  mediaServer?: null;
  /** Optional AgentWsService — required when AGENT_MODE=webrtc to broadcast call events to the browser. */
  agentWs?: AgentWsService | null;
}

/** Manages the modesl server, per-connection hello script, and coordination with orphan recovery via active channel tracking. */
export class EslCallHandlerService {
  private server: EslServer | null = null;
  private callService: CallService;
  private port: number;
  private host: string;
  private recordingsDir: string;
  /** Absolute path; same base for FS `record_session`, Node `stat`, and DB `filePath`. */
  private readonly recordingsBase: string;
  private readonly activeProviderCallIds = new Set<string>();
  /** Optional reference to broadcast real-time call events to connected agent browsers. */
  private agentWs: AgentWsService | null = null;

  private log(
    ctx: { correlationId?: string; callId?: string; uuid?: string } | null,
    level: "info" | "error",
    message: string,
    extra?: unknown,
  ): void {
    const stableCallSid = ctx?.callId;
    const meta: Record<string, unknown> = {
      component: "esl",
      ...(ctx?.correlationId ? { correlationId: ctx.correlationId } : {}),
      ...(ctx?.callId ? { callId: ctx.callId } : {}),
      ...(stableCallSid ? { callSid: stableCallSid } : {}),
      ...(ctx?.uuid ? { channelUuid: ctx.uuid } : {}),
    };
    if (extra !== undefined && extra !== "") {
      meta.extra = extra instanceof Error ? serializeError(extra) : extra;
    }
    if (level === "error") {
      logger.error(message, meta);
    } else {
      logger.info(message, meta);
    }
  }

  private static readonly ANSWER_TIMEOUT_MS = 5000;
  private static readonly PLAYBACK_TIMEOUT_MS = 15000;
  private static readonly SLEEP_TIMEOUT_MS = 25000;
  private static readonly STOP_RECORD_TIMEOUT_MS = 5000;
  private static readonly HANGUP_TIMEOUT_MS = 3000;
  private static readonly GETVAR_TIMEOUT_MS = 2000;

  /**
   * Races an async ESL operation against a timer so a stuck FreeSWITCH leg cannot hang the Node process forever.
   */
  private async withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error(`Timeout after ${ms}ms: ${label}`)), ms);
    });
    try {
      return await Promise.race([promise, timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /**
   * Sends an ESL api/getvar style command and parses the reply, rejecting on FreeSWITCH -ERR responses.
   */
  private async sendRecvAsync(
    conn: Connection,
    command: string,
  ): Promise<{ body: string; replyText?: string }> {
    return await new Promise<{ body: string; replyText?: string }>((resolve, reject) => {
      conn.sendRecv(command, (evt: unknown) => {
        const e = evt as { getBody?: () => unknown; getHeader?: (name: string) => unknown } | undefined;
        const body = typeof e?.getBody === "function" ? String(e.getBody() ?? "") : "";
        const replyTextRaw =
          typeof e?.getHeader === "function" ? e.getHeader("Reply-Text") : undefined;
        const replyText = typeof replyTextRaw === "string" ? replyTextRaw : undefined;
        const errText = (replyText && replyText.startsWith("-ERR")) ? replyText : (body && body.startsWith("-ERR") ? body : "");
        if (errText) return reject(new Error(errText));
        resolve({ body, replyText });
      });
    });
  }

  /**
   * Reads a channel variable from FreeSWITCH with a timeout; returns null when undefined or on failure.
   */
  private async getVar(conn: Connection, name: string): Promise<string | null> {
    try {
      const { body, replyText } = await this.withTimeout(
        this.sendRecvAsync(conn, `getvar ${name}`),
        EslCallHandlerService.GETVAR_TIMEOUT_MS,
        `getvar ${name}`,
      );
      const raw = (body || replyText || "").trim();

      // FreeSWITCH commonly returns: "+OK <value>" in Reply-Text
      const text = (replyText ?? "").trim();
      if (text.startsWith("+OK")) {
        const val = text.slice(3).trim();
        if (!val || val === "_undef_" || val === "UNDEF") return null;
        return val;
      }

      // Sometimes value comes in body.
      if (!raw || raw === "_undef_" || raw === "UNDEF") return null;
      return raw;
    } catch {
      return null;
    }
  }

  private pickFirstNonEmpty(...values: Array<string | null | undefined>): string | null {
    for (const v of values) {
      if (v == null) continue;
      const s = String(v).trim();
      if (s) return s;
    }
    return null;
  }

  /**
   * Maps common FreeSWITCH channel header names to caller, callee, name, and UUID with fallbacks when headers differ by trunk.
   */
  private parseChannelHeaders(
    getHeader: (name: string) => string | null,
  ): { callUuid: string; fromRaw: string | null; toRaw: string | null; callerName: string | null } {
    const callUuid =
      this.pickFirstNonEmpty(
        getHeader("Channel-Call-UUID"),
        getHeader("Unique-ID"),
        getHeader("variable_uuid"),
      ) ?? randomUUID();

    const fromRaw = this.pickFirstNonEmpty(
      getHeader("Caller-Caller-ID-Number"),
      getHeader("variable_effective_caller_id_number"),
      getHeader("variable_caller_id_number"),
      getHeader("variable_sip_from_user"),
      getHeader("variable_sip_p_asserted_identity"),
      getHeader("variable_sip_rpid"),
      getHeader("variable_sip_from_uri"),
      getHeader("variable_plivo_from"), // if present
    );

    const toRaw = this.pickFirstNonEmpty(
      getHeader("Caller-Destination-Number"),
      getHeader("variable_effective_callee_id_number"),
      getHeader("variable_destination_number"),
      getHeader("variable_sip_to_user"),
      getHeader("variable_sip_req_user"),
      getHeader("variable_sip_to_uri"),
      getHeader("variable_plivo_to"), // if present
    );

    const callerName = this.pickFirstNonEmpty(
      getHeader("Caller-Caller-ID-Name"),
      getHeader("variable_effective_caller_id_name"),
      getHeader("variable_caller_id_name"),
    );

    return { callUuid, fromRaw, toRaw, callerName };
  }

  private parseHeaderLines(lines: unknown): Record<string, string> {
    const out: Record<string, string> = {};
    const arr: unknown[] = Array.isArray(lines)
      ? lines
      : lines && typeof lines === "object"
        ? Object.values(lines as Record<string, unknown>)
        : [];
    if (!arr.length) return out;
    for (const item of arr) {
      const obj = (item && typeof item === "object") ? (item as Record<string, unknown>) : null;
      const raw = obj ? obj["raw"] : undefined;
      const str = typeof item === "string" ? item : typeof raw === "string" ? raw : null;
      if (!str) continue;
      const idx = str.indexOf(":");
      if (idx <= 0) continue;
      const key = str.slice(0, idx).trim();
      const val = str.slice(idx + 1).trim();
      if (!key) continue;
      out[key] = val;
    }
    return out;
  }

  /** Prefer embedded `headers` on ESL events; otherwise parse the event payload. */
  private eslEventHeaderSource(evt: unknown): unknown {
    if (evt !== null && typeof evt === "object" && "headers" in evt) {
      return (evt as { headers: unknown }).headers;
    }
    return evt;
  }

  /** Value = `Call._id` hex (stable telephony correlation id); SIP header name remains `KullooCallId`. */
  private extractKullooCallId(headersObj: Record<string, unknown>): string | null {
    const candidates = Object.entries(headersObj)
      .filter(([k]) => k.toLowerCase().includes("kulloocallid"))
      .map(([, v]) => String(v ?? "").trim())
      .filter(Boolean);
    const val = candidates[0] ?? null;
    if (!val) return null;
    return /^[a-fA-F0-9]{24}$/.test(val) ? val : null;
  }

  /**
   * Runs a dialplan application (playback, sleep, hangup, etc.) and waits for CHANNEL_EXECUTE_COMPLETE or times out.
   */
  private async execAndWait(conn: Connection, app: string, arg = "", timeoutMs?: number): Promise<void> {
    const ms = timeoutMs ?? EslCallHandlerService.PLAYBACK_TIMEOUT_MS;
    await new Promise<void>((resolve, reject) => {
      let timer: NodeJS.Timeout | undefined;
      const onComplete = (evt: unknown) => {
        try {
          const eslEvent = evt as { getHeader?: (name: string) => string | undefined };
          const getHeader = (name: string): string | undefined => (eslEvent.getHeader ? eslEvent.getHeader(name) : undefined);
          const application = getHeader("Application");
          const applicationData = getHeader("Application-Data");
          if (application !== app) return;
          if ((arg ?? "") && (applicationData ?? "") !== (arg ?? "")) return;
          conn.off("esl::event::CHANNEL_EXECUTE_COMPLETE::*", onComplete);
          if (timer) clearTimeout(timer);
          resolve();
        } catch (err) {
          conn.off("esl::event::CHANNEL_EXECUTE_COMPLETE::*", onComplete);
          if (timer) clearTimeout(timer);
          reject(err);
        }
      };

      conn.on("esl::event::CHANNEL_EXECUTE_COMPLETE::*", onComplete);

      timer = setTimeout(() => {
        conn.off("esl::event::CHANNEL_EXECUTE_COMPLETE::*", onComplete);
        reject(new Error(`Timeout after ${ms}ms: exec ${app} ${arg}`.trim()));
      }, ms);

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

  /**
   * Listens for DTMF events until digit 1 or the timeout; used to shorten the recording window interactively.
   */
  private waitForDtmf1(
    conn: Connection,
    timeoutMs: number,
    onDigit?: (digit: string) => void,
  ): Promise<"dtmf-1" | "timeout"> {
    return new Promise((resolve) => {
      let done = false;
      const finish = (result: "dtmf-1" | "timeout") => {
        if (done) return;
        done = true;
        conn.off("esl::event::DTMF::*", onDtmf);
        conn.off("esl::event::CHANNEL_DTMF::*", onDtmf);
        clearTimeout(timer);
        resolve(result);
      };

      const onDtmf = (evt: unknown) => {
        const eslEvent = evt as { getHeader?: (name: string) => string | undefined };
        const digit =
          (eslEvent.getHeader ? eslEvent.getHeader("DTMF-Digit") : undefined) ??
          (eslEvent.getHeader ? eslEvent.getHeader("digit") : undefined) ??
          (eslEvent.getHeader ? eslEvent.getHeader("Key") : undefined);
        if (!digit) return;
        const d = String(digit).trim();
        onDigit?.(d);
        if (d === "1") finish("dtmf-1");
      };

      conn.on("esl::event::DTMF::*", onDtmf);
      conn.on("esl::event::CHANNEL_DTMF::*", onDtmf);

      const timer = setTimeout(() => finish("timeout"), timeoutMs);
    });
  }

  /**
   * Marks the call failed in Mongo when possible, increments failure metrics, and attempts to hang up the channel.
   */
  private async failAndHangup(input: {
    conn: Connection;
    callId?: string;
    stage: string;
    error: unknown;
  }): Promise<void> {
    const message = input.error instanceof Error ? input.error.message : String(input.error);
    this.log(null, "error", `Call failure at stage=${input.stage}: ${message}`, input.error);

    if (input.callId) {
      try {
        await this.callService.setStatus(input.callId, "failed", { failedAt: new Date() }, message);
      } catch (err) {
        this.log(null, "error", "Failed to set call status=failed", err);
      }

      try {
        const call = await this.callService.findCallDocumentById(input.callId);
        if (call) {
          await this.callService.pushEvent(call, "failed", { stage: input.stage, error: message });
        }
      } catch (err) {
        this.log(null, "error", "Failed to push failed event", err);
      }
    }

    metrics.incCounter("failedCalls");

    // Best-effort hangup with timeout
    try {
      await this.execAndWait(input.conn, "hangup", "", EslCallHandlerService.HANGUP_TIMEOUT_MS);
    } catch (err) {
      this.log(null, "error", "Hangup attempt failed", err);
      try {
        input.conn.execute("hangup", "", () => {});
      } catch {
        // ignore
      }
    }
  }

  /**
   * Subscribes to DTMF events for metrics and CallEvent rows; returns a detach function for cleanup after the flow.
   */
  private attachDtmfLogger(conn: Connection, stableCallId: string): () => void {
    // Both DTMF and CHANNEL_DTMF may fire; dedupe very close duplicates.
    let last: { digit: string; at: number } | null = null;

    const handler = (evt: unknown) => {
      const eslEvent = evt as { getHeader?: (name: string) => string | undefined };
      const digit =
        (eslEvent.getHeader ? eslEvent.getHeader("DTMF-Digit") : undefined) ??
        (eslEvent.getHeader ? eslEvent.getHeader("digit") : undefined) ??
        (eslEvent.getHeader ? eslEvent.getHeader("Key") : undefined);
      if (!digit) return;
      const d = String(digit).trim();
      if (!d) return;

      const now = Date.now();
      if (last && last.digit === d && now - last.at < 250) return;
      last = { digit: d, at: now };

      this.log({ callId: stableCallId }, "info", `DTMF received: ${d}`);
      metrics.incCounter("dtmfCount");
      this.callService.findCallDocumentByStableCallId(stableCallId).then((call) => {
        if (!call) return;
        return this.callService.pushEvent(call, "dtmf", { digit: d, at: new Date().toISOString() });
      }).catch((err) => {
        this.log(null, "error", "Failed to persist DTMF event", err);
      });
    };

    conn.on("esl::event::DTMF::*", handler);
    conn.on("esl::event::CHANNEL_DTMF::*", handler);

    return () => {
      conn.off("esl::event::DTMF::*", handler);
      conn.off("esl::event::CHANNEL_DTMF::*", handler);
    };
  }

  /** Stores listen configuration and constructs CallService used for all database updates from this handler. */
  constructor(options: EslCallHandlerOptions) {
    this.port = options.port;
    this.host = options.host || "0.0.0.0";
    this.recordingsDir = options.recordingsDir || "/recordings";
    this.recordingsBase = path.resolve(this.recordingsDir);
    this.callService = new CallService();
    this.agentWs = options.agentWs ?? null;
  }

  /**
   * Starts the TCP server; resolves when listening, rejects on bind errors, and registers per-connection handlers.
   */
  async listen(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.server = new EslServer({ port: this.port, host: this.host }, () => {
          logger.info("esl_server_listening", { component: "esl", host: this.host, port: this.port });
          resolve();
        });

        this.server.on("connection::open", (conn: Connection) => {
          // modesl emits `error` on broken pipes (EPIPE) when FS closes the socket while Node is still
          // writing — without a listener, EventEmitter treats this as fatal and crashes the process.
          conn.on("error", (err: unknown) => {
            logger.warn("esl_connection_io_error", {
              component: "esl",
              err: err instanceof Error ? serializeError(err) : err,
            });
          });

          // Log the remote address of the connecting FreeSWITCH instance.
          // In multi-instance deployments (fs1, fs2, ...) this tells us which FS handled the call.
          // modesl Connection wraps a net.Socket — access it via the internal socket property.
          const socket = (conn as unknown as { socket?: { remoteAddress?: string; remotePort?: number } }).socket;
          const fsRemoteAddress = socket?.remoteAddress ?? "unknown";
          const fsRemotePort = socket?.remotePort ?? "unknown";
          logger.info("esl_connection_open", {
            component: "esl",
            fsRemoteAddress,
            fsRemotePort,
            note: "FreeSWITCH instance connected for outbound ESL socket",
          });
          this.handleConnection(conn).catch((err: unknown) => {
            logger.error("esl_connection_handler_failed", { component: "esl", fsRemoteAddress, err });
          });
        });

        this.server.on("connection::close", (_conn: Connection) => {
          logger.debug("esl_connection_socket_closed", { component: "esl" });
        });

        this.server.on("error", (err: Error) => {
          logger.error("esl_server_error", { component: "esl", err });
          reject(err);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Parses channel identity from initial ESL events and variables, tracks active UUID, then runs executeCallFlow for the hello script.
   */
  private async handleConnection(conn: Connection): Promise<void> {
    let callUuid: string | null = null;

    try {
      // Wait for connection ready and get initial channel data
      const connectDataFromInfo = await new Promise<{
        callUuid: string;
        fromRaw: string | null;
        toRaw: string | null;
        callerName: string | null;
        kullooCallId: string | null;
      }>((resolve) => {
        conn.on("esl::ready", () => {
          logger.info("esl_channel_ready", { component: "esl" });
          
          // In outbound mode, FreeSWITCH sends channel data immediately
          // Access it via getInfo() which returns the initial headers
          const info = (conn as unknown as { getInfo?: () => unknown }).getInfo?.();
          // modesl getInfo() varies by version; headers may be an array of header lines.
          const rawHeaders =
            info && typeof info === "object" && "headers" in info ? (info.headers as unknown) : (info as unknown);
          const headersObj =
            rawHeaders && typeof rawHeaders === "object" && !Array.isArray(rawHeaders)
              ? (rawHeaders as Record<string, unknown>)
              : this.parseHeaderLines(rawHeaders);
          logger.debug("esl_channel_info_headers", {
            component: "esl",
            headerKeys: Object.keys(headersObj || {}).slice(0, 30),
          });

          // Parse headers from initial channel data
          const getHeader = (name: string): string | null => {
            return headersObj && headersObj[name] != null ? String(headersObj[name]) : null;
          };

          const parsed = this.parseChannelHeaders(getHeader);
          const kullooCallId = this.extractKullooCallId(headersObj);
          logger.info("esl_parsed_call_info", {
            component: "esl",
            channelUuid: parsed.callUuid,
            fromRaw: parsed.fromRaw,
            toRaw: parsed.toRaw,
            callerName: parsed.callerName,
            kullooCallId,
          });
          resolve({ ...parsed, kullooCallId });
        });
      });

      // Subscribe to channel events as early as possible
      conn.send("myevents");
      logger.debug("esl_subscribed_myevents", { component: "esl" });

      // Prefer CHANNEL_DATA (has full variables) if it arrives quickly.
      const connectData = await Promise.race([
        new Promise<{
          callUuid: string;
          fromRaw: string | null;
          toRaw: string | null;
          callerName: string | null;
          kullooCallId: string | null;
        }>((resolve) => {
          const onChannelData = (evt: unknown) => {
            const eslEvent = evt as { getHeader?: (name: string) => string | undefined };
            const getHeader = (name: string): string | null =>
              eslEvent.getHeader ? (eslEvent.getHeader(name) ?? null) : null;

            const parsed = this.parseChannelHeaders(getHeader);
            // If Plivo passed a SIP header, FreeSWITCH usually exposes it as `variable_sip_h_X-PH-KullooCallId`.
            const headersObj = this.parseHeaderLines(this.eslEventHeaderSource(evt));
            const kullooCallId = this.extractKullooCallId(headersObj);
            logger.info("esl_parsed_channel_data", {
              component: "esl",
              channelUuid: parsed.callUuid,
              fromRaw: parsed.fromRaw,
              toRaw: parsed.toRaw,
              callerName: parsed.callerName,
              kullooCallId,
            });

            conn.off("esl::event::CHANNEL_DATA::*", onChannelData);
            resolve({ ...parsed, kullooCallId });
          };

          conn.on("esl::event::CHANNEL_DATA::*", onChannelData);
        }),
        new Promise<typeof connectDataFromInfo>((resolve) => setTimeout(() => resolve(connectDataFromInfo), 250)),
      ]);

      callUuid = connectData.callUuid;

      // Reliable fallback: query FreeSWITCH for vars if caller/callee still missing.
      // This avoids "unknown" when upstream SIP headers aren't present in the initial connect headers.
      // NOTE: in outbound event socket, prefer per-channel `getvar` over global `uuid_getvar`.
      let fromRaw = connectData.fromRaw;
      let toRaw = connectData.toRaw;
      let callerName = connectData.callerName;
      let kullooCallId = connectData.kullooCallId;

      if (!fromRaw) fromRaw = await this.getVar(conn, "effective_caller_id_number");
      if (!fromRaw) fromRaw = await this.getVar(conn, "caller_id_number");
      if (!fromRaw) fromRaw = await this.getVar(conn, "sip_from_user");

      if (!toRaw) toRaw = await this.getVar(conn, "destination_number");
      if (!toRaw) toRaw = await this.getVar(conn, "effective_callee_id_number");
      if (!toRaw) toRaw = await this.getVar(conn, "sip_to_user");
      if (!toRaw) toRaw = await this.getVar(conn, "sip_req_user");

      if (!callerName) callerName = await this.getVar(conn, "effective_caller_id_name");
      if (!callerName) callerName = await this.getVar(conn, "caller_id_name");

      // Correlation: try to fetch our custom Plivo SIP header as a channel var.
      if (!kullooCallId) {
        kullooCallId =
          (await this.getVar(conn, "sip_h_X-PH-KullooCallId")) ??
          (await this.getVar(conn, "sip_h_X_PH_KullooCallId")) ??
          (await this.getVar(conn, "variable_sip_h_X-PH-KullooCallId"));
        if (kullooCallId && !/^[a-fA-F0-9]{24}$/.test(kullooCallId)) {
          kullooCallId = null;
        }
      }

      // If our parsed UUID was random/incorrect, fetch the real per-channel UUID.
      const uuidFromVar = await this.getVar(conn, "uuid");
      if (uuidFromVar && uuidFromVar !== callUuid) {
        logger.info("esl_uuid_corrected", {
          component: "esl",
          previousUuid: callUuid,
          channelUuid: uuidFromVar,
        });
        callUuid = uuidFromVar;
      }

      if (callUuid) {
        this.activeProviderCallIds.add(callUuid);
      }

      if (fromRaw || toRaw || callerName) {
        logger.debug("esl_parsed_getvar", {
          component: "esl",
          channelUuid: callUuid,
          fromRaw,
          toRaw,
          callerName,
          kullooCallId,
        });
      }

      const fromE164 = connectData.fromRaw ? toE164BestEffort(connectData.fromRaw) : undefined;
      const toE164 = connectData.toRaw ? toE164BestEffort(connectData.toRaw) : undefined;

      const finalFromE164 = fromRaw ? toE164BestEffort(fromRaw) : undefined;
      const finalToE164 = toRaw ? toE164BestEffort(toRaw) : undefined;

      logger.info("esl_processing_call", {
        component: "esl",
        channelUuid: callUuid,
        fromE164: finalFromE164 ?? fromRaw,
        toE164: finalToE164 ?? toRaw,
        kullooCallId,
      });

      conn.on("esl::end", () => {
        logger.info("esl_connection_end", { component: "esl", channelUuid: callUuid });
        if (callUuid) {
          this.activeProviderCallIds.delete(callUuid);
        }
      });

      // Execute call flow (final recording + hangup status is applied inside executeCallFlow;
      // outer callId was previously null during CHANNEL_HANGUP/RECORD_STOP, so those listeners never ran.)
      await this.executeCallFlow(conn, {
        callUuid: callUuid ?? connectData.callUuid,
        fromRaw,
        toRaw,
        fromE164: finalFromE164,
        toE164: finalToE164,
        callerName: callerName ?? undefined,
        kullooCallId,
      });
    } catch (error) {
      logger.error("esl_connection_handler_error", { component: "esl", channelUuid: callUuid, err: error });
      if (callUuid) {
        this.activeProviderCallIds.delete(callUuid);
      }
    }
  }

  /**
   * Returns channel UUIDs currently in an active ESL session so orphan sweeps skip them.
   */
  getActiveProviderCallIds(): ReadonlySet<string> {
    return this.activeProviderCallIds;
  }

  /**
   * Core call flow dispatcher: routes to the WebRTC agent bridge or the hello IVR script based on AGENT_MODE.
   * @returns Mongo call id string and filesystem path to the WAV for logging; throws on unrecoverable ESL errors.
   */
  private async executeCallFlow(
    conn: Connection,
    input: {
      callUuid: string;
      fromRaw: string | null;
      toRaw: string | null;
      fromE164?: string;
      toE164?: string;
      callerName?: string;
      kullooCallId?: string | null;
    },
  ): Promise<{ callId: string; recordingPath: string }> {
    if (env.agentMode === "webrtc") {
      return this.executeAgentBridgeFlow(conn, input);
    }
    if (env.agentMode === "ai_voice") {
      return this.executeAiVoiceFlow(conn, input);
    }
    return this.executeHelloFlow(conn, input);
  }

  /**
   * AI voice loop (AGENT_MODE=ai_voice): Deepgram → OpenAI → VEXYL-TTS over ESL.
   * Falls back to hello IVR when API keys are missing.
   */
  private async executeAiVoiceFlow(
    conn: Connection,
    input: {
      callUuid: string;
      fromRaw: string | null;
      toRaw: string | null;
      fromE164?: string;
      toE164?: string;
      callerName?: string;
      kullooCallId?: string | null;
    },
  ): Promise<{ callId: string; recordingPath: string }> {
    if (!env.deepgramApiKey || !env.openaiApiKey) {
      this.log(null, "info", "AGENT_MODE=ai_voice but DEEPGRAM_API_KEY or OPENAI_API_KEY is unset — using hello IVR");
      return this.executeHelloFlow(conn, input);
    }

    const from = input.fromE164 ?? input.fromRaw ?? "unknown";
    const to = input.toE164 ?? input.toRaw ?? "unknown";
    this.log(null, "info", `[ai-voice] Starting AI voice flow for ${input.callUuid} (${from} -> ${to})`);

    const now = new Date();
    const correlationId = randomUUID();

    let call: CallDocument | null = null;
    let created = false;
    const kullooCallId = input.kullooCallId && typeof input.kullooCallId === "string" ? input.kullooCallId : null;

    if (kullooCallId && /^[a-fA-F0-9]{24}$/.test(kullooCallId)) {
      const existing = await this.callService.findCallDocumentByStableCallId(kullooCallId);
      if (existing) {
        const updated = await this.callService.updateCallDocument(existing._id.toString(), {
          provider: "freeswitch",
          providerCallId: input.callUuid,
          direction: "outbound",
          from: existing.from,
          to: existing.to,
          fromRaw: input.fromRaw ?? existing.fromRaw,
          toRaw: input.toRaw ?? existing.toRaw,
          fromE164: input.fromE164 ?? existing.fromE164,
          toE164: input.toE164 ?? input.toE164,
          callerName: input.callerName ?? existing.callerName,
        });
        call = updated ?? existing;
      }
    }

    if (!call) {
      const result = await this.callService.findOrCreateCallByProviderCallId("freeswitch", input.callUuid, {
        direction: "inbound",
        provider: "freeswitch",
        from,
        to,
        fromRaw: input.fromRaw ?? undefined,
        toRaw: input.toRaw ?? undefined,
        fromE164: input.fromE164,
        toE164: input.toE164,
        callerName: input.callerName,
        status: "received",
        correlationId,
        providerCallId: input.callUuid,
        recordingEnabled: true,
        timestamps: { receivedAt: now },
      });
      call = result.call;
      created = result.created;
    }

    const callId = call._id.toString();
    metrics.incActiveCalls();
    const ctx = { correlationId: call.correlationId, callId, uuid: input.callUuid };

    if (created) {
      await this.callService.pushEvent(call, "received", {
        from,
        to,
        fromRaw: input.fromRaw ?? undefined,
        toRaw: input.toRaw ?? undefined,
        fromE164: input.fromE164,
        toE164: input.toE164,
        callUuid: input.callUuid,
      });
    }

    try {
      const { recordingPath } = await runAiVoiceEslFlow({
        conn,
        callService: this.callService,
        call,
        ctx: { correlationId: call.correlationId, callId, channelUuid: input.callUuid },
        recordingsBase: this.recordingsBase,
      });
      metrics.decActiveCalls();
      return { callId, recordingPath };
    } catch (error) {
      metrics.decActiveCalls();
      try {
        await this.failAndHangup({
          conn,
          callId,
          stage: "executeAiVoiceFlow",
          error,
        });
      } catch (err) {
        this.log(ctx, "error", "failAndHangup after ai_voice failed", err);
      }
      throw error;
    }
  }

  /**
   * WebRTC agent bridge flow (AGENT_MODE=webrtc):
   * Answers the channel, starts recording, bridges to the registered agent sip.js endpoint.
   * The call stays bridged until either party hangs up.
   */
  private async executeAgentBridgeFlow(
    conn: Connection,
    input: {
      callUuid: string;
      fromRaw: string | null;
      toRaw: string | null;
      fromE164?: string;
      toE164?: string;
      callerName?: string;
      kullooCallId?: string | null;
    },
  ): Promise<{ callId: string; recordingPath: string }> {
    try {
      const from = input.fromE164 ?? input.fromRaw ?? "unknown";
      const to   = input.toE164   ?? input.toRaw   ?? "unknown";
      this.log(null, "info", `[agent-bridge] Executing agent bridge flow for ${input.callUuid} (${from} -> ${to})`);

      const now = new Date();
      const correlationId = randomUUID();

      // ---- 1. Find or create Mongo Call doc (same logic as hello flow) ----
      let call: CallDocument | null = null;
      let created = false;
      const kullooCallId = input.kullooCallId && typeof input.kullooCallId === "string" ? input.kullooCallId : null;

      if (kullooCallId && /^[a-fA-F0-9]{24}$/.test(kullooCallId)) {
        const existing = await this.callService.findCallDocumentByStableCallId(kullooCallId);
        if (existing) {
          const updated = await this.callService.updateCallDocument(existing._id.toString(), {
            provider: "freeswitch",
            providerCallId: input.callUuid,
            direction: "outbound",
            from: existing.from,
            to: existing.to,
            fromRaw: input.fromRaw ?? existing.fromRaw,
            toRaw: input.toRaw ?? existing.toRaw,
            fromE164: input.fromE164 ?? existing.fromE164,
            toE164: existing.toE164 ?? input.toE164,
            callerName: input.callerName ?? existing.callerName,
          });
          call = updated ?? existing;
        }
      }

      if (!call) {
        const result = await this.callService.findOrCreateCallByProviderCallId(
          "freeswitch",
          input.callUuid,
          {
            direction: "inbound",
            provider: "freeswitch",
            from,
            to,
            fromRaw: input.fromRaw ?? undefined,
            toRaw: input.toRaw ?? undefined,
            fromE164: input.fromE164,
            toE164: input.toE164,
            callerName: input.callerName,
            status: "received",
            correlationId,
            providerCallId: input.callUuid,
            recordingEnabled: true,
            timestamps: { receivedAt: now },
          },
        );
        call = result.call;
        created = result.created;
      }

      const callId = call._id.toString();
      metrics.incActiveCalls();
      const ctx = { correlationId: call.correlationId, callId, uuid: input.callUuid };

      if (created) {
        await this.callService.pushEvent(call, "received", { from, to, callUuid: input.callUuid });
      }

      // ---- 2. Broadcast inbound_call.offered to agent browsers ----
      this.agentWs?.broadcast({
        type: "inbound_call.offered",
        callId,
        from,
        to,
        calledAt: now.toISOString(),
      });
      this.log(ctx, "info", "[agent-bridge] Broadcast inbound_call.offered");

      // ---- 3. Answer the channel to hold the PSTN caller ----
      await this.execAndWait(conn, "answer", "", EslCallHandlerService.ANSWER_TIMEOUT_MS);
      this.log(ctx, "info", "[agent-bridge] Channel answered");
      await this.callService.setStatus(callId, "answered", { answeredAt: new Date() });
      await this.callService.pushEvent(call, "answered");

      // ---- 4. Start recording before bridge ----
      const recordingPath = path.join(this.recordingsBase, `${input.callUuid}.wav`);
      await this.callService.setStatus(callId, "recording_started", { recordingStartedAt: new Date() });
      await this.callService.pushEvent(call, "recording_started");

      const providerRecordingId = input.callUuid;
      const retrievalUrl = `/api/recordings/local/${providerRecordingId}`;
      const existingRec = await this.callService.findRecordingDocumentByProviderRecordingId(providerRecordingId);
      if (existingRec) {
        await this.callService.updateRecordingDocument(existingRec._id.toString(), { status: "pending", storage: "local", filePath: recordingPath, retrievalUrl });
      } else {
        await this.callService.createRecordingDocument({ callId: call._id, provider: "freeswitch", providerRecordingId, status: "pending", storage: "local", filePath: recordingPath, retrievalUrl });
      }
      conn.execute("record_session", recordingPath, () => {});
      this.log(ctx, "info", `[agent-bridge] Recording started: ${recordingPath}`);

      // ---- 5. Enable DTMF capture during the bridge ----
      conn.send("event plain DTMF");
      conn.send("event plain CHANNEL_DTMF");
      const detachDtmfLogger = this.attachDtmfLogger(conn, callId);

      // ---- 6. Bridge caller to agent WebRTC endpoint ----
      // This blocks until (a) the agent answers + hangs up, (b) the caller hangs up,
      // or (c) the bridge times out (120s safety net).
      //
      // Disable RTP/media timeouts on both legs — FreeSWITCH may otherwise kill the
      // WebRTC B-leg after 30s if it doesn't detect bidirectional RTP (even though
      // audio IS flowing). Also disable session timers on the bridge leg.
      conn.execute("set", "rtp_timeout_sec=0", () => {});
      conn.execute("set", "rtp_hold_timeout_sec=0", () => {});
      conn.execute("set", "bridge_generate_comfort_noise=true", () => {});
      // Disable session timers on the B-leg (agent) to prevent re-INVITE that kills the call
      conn.execute("set", "sip_session_refresh=false", () => {});
      conn.execute("set", "sip_enable_timer=false", () => {});
      // Pass the same timeout settings to the bridge leg (B-leg)
      conn.execute("set", "bridge_channel_vars=rtp_timeout_sec,rtp_hold_timeout_sec", () => {});

      const bridgeTarget = `{rtp_timeout_sec=0,rtp_hold_timeout_sec=0,sip_enable_timer=false}user/${env.agentSipUsername}@${env.freeswitchDomain}`;
      this.log(ctx, "info", `[agent-bridge] Bridging to ${bridgeTarget}`);

      try {
        await this.execAndWait(conn, "bridge", bridgeTarget, 120_000);
        this.log(ctx, "info", "[agent-bridge] Bridge returned (call ended normally)");
      } catch (bridgeErr) {
        // Bridge can return an error if the agent didn't answer or the caller hung up — treat as normal end.
        this.log(ctx, "info", "[agent-bridge] Bridge ended with error (likely hangup/no-answer)", bridgeErr);
      }

      // ---- 7. Stop recording and finalize ----
      detachDtmfLogger();
      try {
        await this.execAndWait(conn, "stop_record_session", recordingPath, EslCallHandlerService.STOP_RECORD_TIMEOUT_MS);
      } catch {
        // Best-effort — channel may already be gone
      }
      try {
        await this.handleRecordingComplete(callId, input.callUuid, recordingPath);
      } catch (err) {
        this.log(ctx, "error", "[agent-bridge] handleRecordingComplete failed", err);
      }

      // ---- 8. Finalize Mongo and broadcast call.ended ----
      const hangupAt = new Date();
      await this.callService.setStatus(callId, "hangup",    { hangupAt });
      await this.callService.pushEvent(call, "hangup");
      await this.callService.setStatus(callId, "completed", { completedAt: new Date() });
      await this.callService.pushEvent(call, "completed");

      this.agentWs?.broadcast({ type: "call.ended", callId, reason: "completed" });
      this.log(ctx, "info", "[agent-bridge] Call completed");

      metrics.decActiveCalls();
      return { callId, recordingPath };
    } catch (error) {
      try {
        const existing = await this.callService.findCallDocumentByProviderCallId(input.callUuid);
        const callId = existing?._id?.toString();
        if (callId) {
          this.agentWs?.broadcast({ type: "call.ended", callId, reason: "failed" });
        }
        await this.failAndHangup({ conn, callId, stage: "executeAgentBridgeFlow", error });
      } catch (err) {
        this.log(null, "error", "[agent-bridge] failAndHangup wrapper failed", err);
      }
      throw error;
    }
  }

  /**
   * Original hello IVR script (AGENT_MODE=hello, unchanged):
   * answer → tone → record → DTMF 1 early stop → hangup.
   * @returns Mongo call id string and filesystem path to the WAV for logging; throws on unrecoverable ESL errors after failAndHangup attempt.
   */
  private async executeHelloFlow(
    conn: Connection,
    input: {
      callUuid: string;
      fromRaw: string | null;
      toRaw: string | null;
      fromE164?: string;
      toE164?: string;
      callerName?: string;
      kullooCallId?: string | null;
    },
  ): Promise<{ callId: string; recordingPath: string }> {
    try {
      const from = input.fromE164 ?? input.fromRaw ?? "unknown";
      const to = input.toE164 ?? input.toRaw ?? "unknown";
      this.log(null, "info", `Executing call flow for ${input.callUuid} (${from} -> ${to})`);

      const now = new Date();
      const correlationId = randomUUID();

      // If this ESL session corresponds to an API-initiated outbound call, attach to that call record.
      let call: CallDocument | null = null;
      let created = false;
      const kullooCallId = input.kullooCallId && typeof input.kullooCallId === "string" ? input.kullooCallId : null;
      if (kullooCallId && /^[a-fA-F0-9]{24}$/.test(kullooCallId)) {
        const existing = await this.callService.findCallDocumentByStableCallId(kullooCallId);
        if (existing) {
          // Keep API `from` / `to` (dialed PSTN); FreeSWITCH often reports extension (e.g. 1000) as destination_number.
          const updated = await this.callService.updateCallDocument(existing._id.toString(), {
            provider: "freeswitch",
            providerCallId: input.callUuid,
            direction: "outbound",
            from: existing.from,
            to: existing.to,
            fromRaw: input.fromRaw ?? existing.fromRaw,
            toRaw: input.toRaw ?? existing.toRaw,
            fromE164: input.fromE164 ?? existing.fromE164,
            toE164: existing.toE164 ?? input.toE164,
            callerName: input.callerName ?? existing.callerName,
          });
          call = updated ?? existing;
        }
      }

      if (!call) {
        const result = await this.callService.findOrCreateCallByProviderCallId(
          "freeswitch",
          input.callUuid,
          {
            direction: "inbound",
            provider: "freeswitch",
            from,
            to,
            fromRaw: input.fromRaw ?? undefined,
            toRaw: input.toRaw ?? undefined,
            fromE164: input.fromE164,
            toE164: input.toE164,
            callerName: input.callerName,
            status: "received",
            correlationId,
            providerCallId: input.callUuid,
            recordingEnabled: true,
            timestamps: { receivedAt: now },
          },
        );
        call = result.call;
        created = result.created;
      }

      const callId = call._id.toString();
      metrics.incActiveCalls();
      const ctx = { correlationId: call.correlationId, callId, uuid: input.callUuid };

      if (created) {
        await this.callService.pushEvent(call, "received", {
          from,
          to,
          fromRaw: input.fromRaw ?? undefined,
          toRaw: input.toRaw ?? undefined,
          fromE164: input.fromE164,
          toE164: input.toE164,
          callUuid: input.callUuid,
        });
      }

      await this.execAndWait(conn, "answer", "", EslCallHandlerService.ANSWER_TIMEOUT_MS);
      this.log(ctx, "info", "Call answered");

      await this.callService.setStatus(callId, "answered", { answeredAt: new Date() });
      await this.callService.pushEvent(call, "answered");

      await this.execAndWait(conn, "sleep", "500", 2000);
      this.log(ctx, "info", "Sleep 500ms complete");

      await this.execAndWait(
        conn,
        "playback",
        "tone_stream://%(1000,0,440)",
        EslCallHandlerService.PLAYBACK_TIMEOUT_MS,
      );
      this.log(ctx, "info", "Playback complete");

      await this.callService.setStatus(callId, "played", { playedAt: new Date() });
      await this.callService.pushEvent(call, "played", { message: "Tone played" });

      const recordingPath = path.join(this.recordingsBase, `${input.callUuid}.wav`);
      
      await this.callService.setStatus(callId, "recording_started", { recordingStartedAt: new Date() });
      await this.callService.pushEvent(call, "recording_started");

      // Create/Upsert a recording row immediately so every WAV has a DB record,
      // even if the backend restarts before RECORD_STOP is processed.
      const providerRecordingId = input.callUuid;
      const retrievalUrl = `/api/recordings/local/${providerRecordingId}`;
      const existingRecording = await this.callService.findRecordingDocumentByProviderRecordingId(providerRecordingId);
      if (existingRecording) {
        await this.callService.updateRecordingDocument(existingRecording._id.toString(), {
          status: "pending",
          storage: "local",
          filePath: recordingPath,
          retrievalUrl,
        });
      } else {
        await this.callService.createRecordingDocument({
          callId: call._id,
          provider: "freeswitch",
          providerRecordingId,
          status: "pending",
          storage: "local",
          filePath: recordingPath,
          retrievalUrl,
        });
      }

      conn.execute("record_session", recordingPath, () => {});
      this.log(ctx, "info", `Recording started: ${recordingPath}`);

      // Enable DTMF events so we can stop early on "1"
      conn.send("event plain DTMF");
      conn.send("event plain CHANNEL_DTMF");
      const detachDtmfLogger = this.attachDtmfLogger(conn, callId);

      const outcome = await Promise.race([
        this.waitForDtmf1(conn, 20000),
        (async () => {
          await this.execAndWait(conn, "sleep", "20000", EslCallHandlerService.SLEEP_TIMEOUT_MS);
          return "timeout" as const;
        })(),
      ]);

      if (outcome === "dtmf-1") {
        this.log(ctx, "info", "DTMF 1 received: stopping recording early");
      } else {
        this.log(ctx, "info", "Recording duration complete");
      }

      await this.execAndWait(conn, "stop_record_session", recordingPath, EslCallHandlerService.STOP_RECORD_TIMEOUT_MS);
      this.log(ctx, "info", "Recording stopped");

      // Do not rely on RECORD_STOP / CHANNEL_HANGUP handlers in handleConnection — outer `callId` was null until now.
      try {
        await this.handleRecordingComplete(callId, input.callUuid, recordingPath);
      } catch (err) {
        this.log(ctx, "error", "handleRecordingComplete failed after stop_record_session", err);
      }

      if (outcome === "dtmf-1") {
        // Confirmation tone (no external sound files required)
        await this.execAndWait(conn, "playback", "tone_stream://%(200,0,880)", 5000);
      }

      detachDtmfLogger();
      // Hard hangup to enforce max duration; this matches the desired outbound behavior.
      await this.execAndWait(conn, "hangup", "", EslCallHandlerService.HANGUP_TIMEOUT_MS);
      this.log(ctx, "info", "Call hung up (ESL)");

      const hangupAt = new Date();
      await this.callService.setStatus(callId, "hangup", { hangupAt });
      await this.callService.pushEvent(call, "hangup");
      await this.callService.setStatus(callId, "completed", { completedAt: new Date() });
      await this.callService.pushEvent(call, "completed");

      this.log(ctx, "info", `Call flow setup completed for ${input.callUuid}`);
      metrics.decActiveCalls();
      return { callId, recordingPath };
    } catch (error) {
      // Handle failure: update DB + hangup; then rethrow so upstream logs also capture it.
      // Note: at this point we should always have a callId because we create/find it early.
      try {
        const existing = await this.callService.findCallDocumentByProviderCallId(input.callUuid);
        await this.failAndHangup({
          conn,
          callId: existing?._id?.toString(),
          stage: "executeCallFlow",
          error,
        });
      } catch (err) {
        this.log(null, "error", "failAndHangup wrapper failed", err);
      }
      throw error;
    }
  }

  /**
   * After stop_record_session, waits for a non-empty WAV, then marks Recording and CallEvent rows completed or failed.
   */
  private async handleRecordingComplete(callId: string, callUuid: string, recordingPath: string): Promise<void> {
    try {
      const filePath = path.join(this.recordingsBase, `${callUuid}.wav`);
      
      const call = await this.callService.findCallDocumentByStableCallId(callId);
      if (!call) {
        this.log({ callId, uuid: callUuid }, "error", "Call not found for recording completion");
        return;
      }

      // Recording integrity: wait briefly for file flush and ensure non-trivial size.
      // WAV header is ~44 bytes; treat anything <= 44 bytes as invalid/empty.
      let st: { size: number } | null = null;
      for (let attempt = 1; attempt <= 10; attempt += 1) {
        try {
          const stat = await fs.stat(filePath);
          if (stat.size > 44) {
            st = { size: stat.size };
            break;
          }
        } catch {
          // file not there yet
        }
        await new Promise((r) => setTimeout(r, 200 * attempt));
      }

      const existing = await this.callService.findRecordingDocumentByProviderRecordingId(callUuid);

      if (!st) {
        // If the file never materialized (early hangup/crash), mark recording failed but keep the row.
        if (existing) {
          await this.callService.updateRecordingDocument(existing._id.toString(), {
            status: "failed",
            storage: "local",
            filePath,
            retrievalUrl: `/api/recordings/local/${callUuid}`,
          });
        } else {
          await this.callService.createRecordingDocument({
            callId: call._id,
            provider: "freeswitch",
            providerRecordingId: callUuid,
            status: "failed",
            storage: "local",
            filePath,
            retrievalUrl: `/api/recordings/local/${callUuid}`,
          });
        }
        await this.callService.pushEvent(call, "recording_failed", {
          providerRecordingId: callUuid,
          reason: "file_missing_or_empty",
        });
        metrics.incCounter("recordingFailed");
        this.log(
          { correlationId: call.correlationId, callId: call._id.toString(), uuid: callUuid },
          "error",
          `Recording file missing/empty after retries: ${filePath}`,
        );
        return;
      }

      const patch = {
        status: "recorded" as const,
        storage: "local" as const,
        durationSec: 20,
        filePath,
        retrievalUrl: `/api/recordings/local/${callUuid}`,
      };

      const recording = existing
        ? await this.callService.updateRecordingDocument(existing._id.toString(), patch)
        : await this.callService.createRecordingDocument({
            callId: call._id,
            provider: "freeswitch",
            providerRecordingId: callUuid,
            status: "recorded",
            storage: "local",
            durationSec: 20,
            filePath,
            retrievalUrl: `/api/recordings/local/${callUuid}`,
          });

      if (!recording) {
        this.log(
          { correlationId: call.correlationId, callId: call._id.toString(), uuid: callUuid },
          "error",
          "Failed to upsert recording metadata",
        );
        return;
      }

      // If S3 is configured, upload after finalizing the local WAV.
      if (isS3Enabled()) {
        const s3Key = buildDatePartitionedRecordingKey({ callUuid, at: new Date() });
        const location = { bucket: env.s3Bucket!, key: s3Key, region: env.s3Region! };

        await this.callService.updateRecordingDocument(recording._id.toString(), {
          status: "uploading",
          storage: "local",
          s3Bucket: location.bucket,
          s3Key: location.key,
          s3Region: location.region,
        });

        await uploadWavToS3({ localPath: filePath, location });

        await this.callService.updateRecordingDocument(recording._id.toString(), {
          status: "completed",
          storage: "s3",
          uploadedAt: new Date(),
          // Once uploaded, prefer the canonical file endpoint which will redirect to a pre-signed URL.
          retrievalUrl: `/api/recordings/${recording._id.toString()}/file`,
        });

        // Delete local file after successful upload.
        try {
          await fs.unlink(filePath);
        } catch (err) {
          this.log({ correlationId: call.correlationId, callId: call._id.toString(), uuid: callUuid }, "error", "Failed to delete local WAV after S3 upload", err);
        }
      }

      // Only emit completion event once (avoid duplicates on retries).
      if (!existing || existing.status !== "completed") {
        await this.callService.pushEvent(call, "recording_completed", {
          providerRecordingId: callUuid,
          recordingId: recording._id.toString(),
        });
      }

      this.log(
        { correlationId: call.correlationId, callId: call._id.toString(), uuid: callUuid },
        "info",
        "Recording metadata saved to MongoDB",
      );
    } catch (error) {
      this.log({ callId, uuid: callUuid }, "error", "Error handling recording completion", error);
    }
  }

  /**
   * Stops accepting new ESL connections and closes the underlying TCP server (used on shutdown or tests).
   */
  close(): void {
    if (this.server) {
      logger.info("esl_server_closing", { component: "esl" });
      this.server.close();
      this.server = null;
    }
  }
}
