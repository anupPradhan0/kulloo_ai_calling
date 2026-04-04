/**
 * Normalizes caller or callee strings from SIP headers and similar sources into a best-effort international format.
 * FreeSWITCH and carriers often send numbers without a leading plus or embedded inside a SIP URI; this file extracts usable digits.
 * ESL and persistence code use this so Mongo stores a consistent shape when possible.
 */

/**
 * Converts a raw phone string into something like E.164 when the input is clearly numeric; returns undefined when it cannot be trusted.
 * @param input Raw value from a header or variable (may include sip:, tel:, or punctuation).
 * @returns A string starting with + and digits, or undefined when the value is empty or too ambiguous.
 */
export function toE164BestEffort(input: string): string | undefined {
  const raw = input.trim();
  if (!raw) return undefined;

  // If it's already E.164-ish, keep it.
  if (raw.startsWith("+") && /^\+\d{8,15}$/.test(raw)) {
    return raw;
  }

  // If it's digits-only (common from SIP/telephony headers), prefix '+'.
  if (/^\d{8,15}$/.test(raw)) {
    return `+${raw}`;
  }

  // Try to salvage digits from things like 'sip:9177...@host' or 'tel:+9177...'
  const digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+") && /^\+\d{8,15}$/.test(digits)) {
    return digits;
  }
  const digitsOnly = digits.replace(/[^\d]/g, "");
  if (/^\d{8,15}$/.test(digitsOnly)) {
    return `+${digitsOnly}`;
  }

  return undefined;
}
