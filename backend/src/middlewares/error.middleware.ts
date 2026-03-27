import { NextFunction, Request, Response } from "express";
import { ApiError } from "../utils/api-error";

export function notFoundHandler(_req: Request, _res: Response, next: NextFunction): void {
  next(new ApiError("Route not found", 404));
}

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const statusCode = err instanceof ApiError ? err.statusCode : 500;

  res.status(statusCode).json({
    success: false,
    message: err.message || "Internal Server Error",
  });
}
