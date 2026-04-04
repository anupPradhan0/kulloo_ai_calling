/** Mongoose connection with retries (used from `server.ts` before ESL/HTTP). */
import mongoose from "mongoose";
import { env } from "./env";

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
