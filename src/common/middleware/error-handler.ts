import type { NextFunction, Request, Response } from "express";
import {
  INTERNAL_ERROR_CODE,
  isClientAppError,
  NotFoundError,
  type ErrorBody,
} from "../errors/app-error.js";

const GENERIC_MESSAGE = "Internal server error";

/**
 * Turn a miss into `NotFoundError` and pass it to `errorHandler`.
 * This function must keep three parameters. A fourth would make Express
 * treat it as an error handler and skip it on ordinary requests.
 */
export function notFoundHandler(_req: Request, _res: Response, next: NextFunction): void {
  next(new NotFoundError());
}

/**
 * Last middleware. `AppError` is returned as JSON. Every other value becomes
 * a generic 500 so a driver message or secret cannot leave the process.
 * This function must keep four parameters. Express detects an error middleware
 * with `fn.length === 4` and will not call a shorter function for errors.
 * It does not log. Request logging is a later task.
 */
export function errorHandler(err: unknown, _req: Request, res: Response, next: NextFunction): void {
  if (res.headersSent) {
    next(err);
    return;
  }

  const body = toErrorBody(err);
  res.status(body.error.status).json(body);
}

function toErrorBody(err: unknown): ErrorBody {
  if (isClientAppError(err)) {
    return {
      error: {
        status: err.statusCode,
        code: err.code,
        message: err.message,
      },
    };
  }

  return {
    error: {
      status: 500,
      code: INTERNAL_ERROR_CODE,
      message: GENERIC_MESSAGE,
    },
  };
}
