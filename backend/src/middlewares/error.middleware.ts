/**
 * Centralizes HTTP error responses so route handlers can call next(error) instead of repeating status and JSON shapes.
 * ApiError instances become their status code; other errors become 500 while still returning a JSON body with a message.
 */

/** Layer: HTTP middleware — maps errors to JSON responses and logs server errors with correlation context. */
import { NextFunction, Request, Response } from "express";
import { ApiError } from "../utils/api-error";
import { logger } from "../utils/logger";

/**
 * Turns unmatched routes into a 404 ApiError so the error handler formats the response consistently.
 */
export function notFoundHandler(_req: Request, _res: Response, next: NextFunction): void {
  next(new ApiError("Route not found", 404));
}

/**
 * Formats any error as JSON, logs 5xx with full detail and 4xx as warnings, and includes correlationId when present.
 * @param err Error passed from controllers or earlier middleware.
 * @param req Used for correlationId, path, and method in logs.
 * @param res Express response written with status and JSON body.
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const statusCode = err instanceof ApiError ? err.statusCode : 500;
  const correlationId = req.correlationId;
  const path = req.originalUrl || req.url;
  const method = req.method;

  if (statusCode >= 500) {
    logger.error("http_request_error", {
      correlationId,
      method,
      path,
      statusCode,
      err,
    });
  } else {
    logger.warn("http_request_client_error", {
      correlationId,
      method,
      path,
      statusCode,
      message: err.message,
    });
  }

  res.status(statusCode).json({
    success: false,
    message: err.message || "Internal Server Error",
    ...(correlationId ? { correlationId } : {}),
  });
}
