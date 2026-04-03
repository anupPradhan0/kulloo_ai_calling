import { NextFunction, Request, Response } from "express";
import { ApiError } from "../utils/api-error";
import { logger } from "../utils/logger";

export function notFoundHandler(_req: Request, _res: Response, next: NextFunction): void {
  next(new ApiError("Route not found", 404));
}

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
