/**
 * Writes structured log lines to the console with a configurable minimum level and JSON or pretty format.
 * Production defaults to one JSON object per line so operators can grep or ship logs to aggregators; development can use prettier output.
 * Call sites pass a short message key plus a metadata object rather than building strings by hand.
 */

import { env } from "../config/env";

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function envLevel(): LogLevel {
  const raw = env.logLevel?.toLowerCase().trim();
  if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error") {
    return raw;
  }
  return env.nodeEnv === "production" ? "info" : "debug";
}

const minRank = () => LEVEL_RANK[envLevel()];

function useJsonLines(): boolean {
  if (env.logFormat?.toLowerCase() === "pretty") return false;
  return env.nodeEnv === "production";
}

/**
 * Turns any thrown value into plain fields safe to embed in a log metadata object.
 * @param err Unknown error from a catch block or callback.
 * @returns A small record with name, message, and optional stack when the value is an Error.
 */
export function serializeError(err: unknown): Record<string, string | undefined> {
  if (err instanceof Error) {
    return {
      errName: err.name,
      errMessage: err.message,
      errStack: err.stack,
    };
  }
  return { errMessage: typeof err === "string" ? err : JSON.stringify(err) };
}

function emit(level: LogLevel, msg: string, meta?: Record<string, unknown>): void {
  if (LEVEL_RANK[level] < minRank()) {
    return;
  }
  const ts = new Date().toISOString();
  const base = { ts, level, msg, ...meta };

  if (useJsonLines()) {
    const line = JSON.stringify(base);
    if (level === "error") {
      // eslint-disable-next-line no-console
      console.error(line);
    } else if (level === "warn") {
      // eslint-disable-next-line no-console
      console.warn(line);
    } else {
      // eslint-disable-next-line no-console
      console.log(line);
    }
    return;
  }

  const metaStr =
    meta && Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : "";
  const line = `[${ts}] ${level.toUpperCase()} ${msg}${metaStr}`;
  if (level === "error") {
    // eslint-disable-next-line no-console
    console.error(line);
  } else if (level === "warn") {
    // eslint-disable-next-line no-console
    console.warn(line);
  } else {
    // eslint-disable-next-line no-console
    console.log(line);
  }
}

/**
 * Application logger: four levels, each accepts a message key and optional structured metadata.
 * The error helper flattens an optional err field into serializable properties on the log line.
 */
export const logger = {
  debug(msg: string, meta?: Record<string, unknown>): void {
    emit("debug", msg, meta);
  },
  info(msg: string, meta?: Record<string, unknown>): void {
    emit("info", msg, meta);
  },
  warn(msg: string, meta?: Record<string, unknown>): void {
    emit("warn", msg, meta);
  },
  error(msg: string, meta?: Record<string, unknown> & { err?: unknown }): void {
    const { err, ...rest } = meta ?? {};
    const errFields = err !== undefined ? serializeError(err) : {};
    emit("error", msg, { ...rest, ...errFields });
  },
};
