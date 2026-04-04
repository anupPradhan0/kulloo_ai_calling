/**
 * Connects Mongoose to MongoDB with several retries so short-lived network blips during container startup do not crash the process.
 * server.ts awaits this before starting Redis checks, ESL, and HTTP so all layers see a live database connection.
 */

/** Layer: database bootstrap — only establishes the Mongoose connection; no business rules. */
import mongoose from "mongoose";
import { env } from "./env";

/**
 * Attempts mongoose.connect up to a fixed number of times with a delay between failures, then throws the last error.
 * @returns Resolves when connected; never resolves on repeated failure except by throwing after the final attempt.
 */
export async function connectDatabase(): Promise<void> {
  const maxAttempts = 10;
  const retryDelayMs = 1500;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await mongoose.connect(env.mongoUri);
      return;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      if (attempt === maxAttempts) {
        throw error;
      }

      // eslint-disable-next-line no-console
      console.warn(
        `MongoDB connection attempt ${attempt}/${maxAttempts} failed (${detail}). Retrying in ${retryDelayMs}ms...`,
      );
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }
}
