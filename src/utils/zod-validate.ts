import { ZodType } from "zod";
import { ApiError } from "./api-error";

export function parseWithSchema<T>(schema: ZodType<T>, payload: unknown): T {
  const result = schema.safeParse(payload);

  if (!result.success) {
    const firstIssue = result.error.issues[0];
    throw new ApiError(firstIssue?.message ?? "Validation failed", 400);
  }

  return result.data;
}
