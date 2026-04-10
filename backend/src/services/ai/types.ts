/**
 * AI voice pipeline contracts — STT / LLM / TTS adapters (see doc/plan/ai-voice-pipeline.md).
 */

export type SttEventKind = "final" | "interim";

export interface SttEvent {
  kind: SttEventKind;
  text: string;
}

export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface LlmCompleteResult {
  text: string;
  usage?: { promptTokens?: number; completionTokens?: number };
}
