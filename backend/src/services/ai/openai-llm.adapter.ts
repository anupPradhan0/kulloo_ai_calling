/**
 * OpenAI Chat Completions with sliding-window clip on non-system messages (see plan).
 */

import { env } from "../../config/env";
import { logger } from "../../utils/logger";
import type { ChatMessage, LlmCompleteResult } from "./types";

function clipMessages(messages: ChatMessage[], maxNonSystem: number): ChatMessage[] {
  if (messages.length === 0) {
    return messages;
  }
  const system = messages[0]?.role === "system" ? [messages[0]] : [];
  const rest = messages[0]?.role === "system" ? messages.slice(1) : [...messages];
  while (rest.length > maxNonSystem) {
    rest.shift();
    if (rest.length > maxNonSystem) {
      rest.shift();
    }
  }
  return [...system, ...rest];
}

export class OpenAiLlmAdapter {
  async complete(messages: ChatMessage[], options?: { signal?: AbortSignal }): Promise<LlmCompleteResult> {
    const key = env.openaiApiKey;
    if (!key) {
      throw new Error("OPENAI_API_KEY is not set");
    }

    const clipped = clipMessages(messages, env.aiHistoryMaxTurns);

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: env.aiLlmModel,
        messages: clipped.map((m) => ({ role: m.role, content: m.content })),
        temperature: 0.6,
      }),
      signal: options?.signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      logger.error("openai_chat_http_error", { status: res.status, body: errText.slice(0, 800) });
      throw new Error(`OpenAI error ${res.status}`);
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const text = json.choices?.[0]?.message?.content?.trim() ?? "";
    return {
      text,
      usage: {
        promptTokens: json.usage?.prompt_tokens,
        completionTokens: json.usage?.completion_tokens,
      },
    };
  }

  /** Post-call operator summary (full transcript — not the sliding window). */
  async summarizeTranscript(fullTranscript: string, options?: { signal?: AbortSignal }): Promise<string> {
    const key = env.openaiApiKey;
    if (!key) {
      throw new Error("OPENAI_API_KEY is not set");
    }

    const prompt = [
      "Summarize this phone call in 2-4 short bullet points for a CRM operator.",
      "Focus on intent, outcome, and any follow-up needed.",
      "",
      fullTranscript,
    ].join("\n");

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: env.aiLlmModel,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
      }),
      signal: options?.signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      logger.error("openai_summary_http_error", { status: res.status, body: errText.slice(0, 500) });
      throw new Error(`OpenAI summary error ${res.status}`);
    }

    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return json.choices?.[0]?.message?.content?.trim() ?? "";
  }
}
