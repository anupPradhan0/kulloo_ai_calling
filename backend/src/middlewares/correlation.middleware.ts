/**
 * Assigns a stable request identifier for tracing a single HTTP request through logs and optional downstream systems.
 * If the client sends X-Correlation-Id, that value is reused so distributed traces can stay aligned across services.
 */

/** Layer: HTTP middleware — reads or generates a correlation id and attaches it to the request and response headers. */
import { NextFunction, Request, Response } from "express";
import { randomUUID } from "node:crypto";

/**
 * Ensures every request has req.correlationId and echoes it on the response for clients to reuse on retries.
 * @param req Express request (mutated with correlationId).
 * @param res Express response (X-Correlation-Id header set).
 * @param next Continues the middleware chain.
 */
export function correlationIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header("X-Correlation-Id")?.trim();
  const correlationId = incoming && incoming.length > 0 ? incoming : randomUUID();
  res.setHeader("X-Correlation-Id", correlationId);
  req.correlationId = correlationId;
  next();
}
