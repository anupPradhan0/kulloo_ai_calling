/**
 * Loads fixed LLM system prompts from prompts/ai-voice — no long strings in ESL handlers.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { env } from "../../config/env";

const cache = new Map<string, string>();

/** Production: `/app/prompts/...`. Local dev: `src/prompts/...` under cwd. */
function promptCandidates(rel: string): string[] {
  return [
    path.join(process.cwd(), "prompts", rel),
    path.join(process.cwd(), "src", "prompts", rel),
  ];
}

async function readFirstExisting(rel: string): Promise<string> {
  for (const p of promptCandidates(rel)) {
    try {
      return await fs.readFile(p, "utf8");
    } catch {
      /* try next */
    }
  }
  throw new Error(`Prompt file not found: ${rel}`);
}

/**
 * Returns the system prompt for a persona id (e.g. `default` → `system-default.txt`).
 * Override: `AI_SYSTEM_PROMPT_FILE` (absolute or relative to cwd).
 */
export async function getAiSystemPrompt(personaId: string): Promise<string> {
  const override = process.env.AI_SYSTEM_PROMPT_FILE?.trim();
  if (override) {
    const abs = path.isAbsolute(override) ? override : path.join(process.cwd(), override);
    const raw = await fs.readFile(abs, "utf8");
    return raw.trim();
  }

  const key = personaId || env.aiVoicePersona;
  if (cache.has(key)) {
    return cache.get(key)!;
  }

  try {
    const raw = await readFirstExisting(`ai-voice/system-${key}.txt`);
    const text = raw.trim();
    cache.set(key, text);
    return text;
  } catch {
    const raw = await readFirstExisting("ai-voice/system-default.txt");
    const text = raw.trim();
    cache.set("default", text);
    return text;
  }
}
