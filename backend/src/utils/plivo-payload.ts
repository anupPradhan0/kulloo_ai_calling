/**
 * Reads Plivo Answer URL parameters and body fields without depending on Express request types.
 * Plivo sends call identifiers and echoed SIP headers in inconsistent shapes (string vs array, different key names).
 * The Plivo answer controller uses these helpers so XML generation stays small and testable.
 */

/**
 * Returns the first non-empty string from a query or body value Plivo may send as a string or single-element array.
 * @param val Raw value from Plivo (string, array of strings, or something else).
 * @returns Trimmed string or undefined when nothing usable is present.
 */
export function firstPlivoString(val: unknown): string | undefined {
  if (typeof val === "string" && val.trim().length > 0) return val.trim();
  if (Array.isArray(val) && typeof val[0] === "string" && val[0].trim()) return val[0].trim();
  return undefined;
}

const KULLOO_CALL_ID_KEYS = [
  "kullooCallId",
  "X-PH-KullooCallId",
  "x-ph-kulloocallid",
  "X_PH_KullooCallId",
  "SipHeader_X-PH-KullooCallId",
] as const;

/**
 * Finds the Mongo call identifier Plivo or FreeSWITCH may expose under several header or query names.
 * @param query Parsed query object from the Answer URL request.
 * @param body Parsed body object when Plivo posts form fields.
 * @returns A 24-character hexadecimal ObjectId string, or undefined when absent or invalid.
 */
export function extractKullooCallIdFromSources(
  query: Record<string, unknown>,
  body: Record<string, unknown>,
): string | undefined {
  for (const src of [query, body]) {
    for (const key of KULLOO_CALL_ID_KEYS) {
      const v = firstPlivoString(src[key]);
      if (v && /^[a-fA-F0-9]{24}$/.test(v)) return v;
    }
  }

  for (const src of [query, body]) {
    for (const [key, val] of Object.entries(src)) {
      if (/kulloocallid/i.test(key)) {
        const v = firstPlivoString(val);
        if (v && /^[a-fA-F0-9]{24}$/.test(v)) return v;
      }
    }
  }

  return undefined;
}

/**
 * Reads Plivo’s call UUID from query or body (used to correlate logs and optional warnings).
 * @param query Parsed query object.
 * @param body Parsed body object.
 * @returns Plivo CallUUID when present, otherwise undefined.
 */
export function extractPlivoCallUuidFromSources(
  query: Record<string, unknown>,
  body: Record<string, unknown>,
): string | undefined {
  return firstPlivoString(query.CallUUID) ?? firstPlivoString(body.CallUUID);
}
