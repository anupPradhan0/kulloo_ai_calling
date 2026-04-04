/**
 * Bridges Zod parsing to ApiError so invalid request bodies or params become a 400 response with a clear message.
 * Controllers call this with a schema and raw input; on success they get a typed value without manual checks.
 */

import { ZodType } from "zod";
import { ApiError } from "./api-error";

/**
 * Parses unknown input with a Zod schema and throws ApiError(400) when validation fails.
 * @param schema Zod schema describing the expected shape of payload.
 * @param payload Typically req.body, req.query, or req.params from Express.
 * @returns The parsed and typed data when validation succeeds.
 */
export function parseWithSchema<T>(schema: ZodType<T>, payload: unknown): T {
  const result = schema.safeParse(payload);

  if (!result.success) {
    const firstIssue = result.error.issues[0];
    throw new ApiError(firstIssue?.message ?? "Validation failed", 400);
  }

  return result.data;
}
