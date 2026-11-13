import type { NextFunction, Request, Response } from "express";
import type { LogFields } from "../../config/logger.js";
import {
  AppError,
  INTERNAL_ERROR_CODE,
  isClientAppError,
  NotFoundError,
  type ErrorBody,
} from "../errors/app-error.js";
import { loggerForResponse } from "./request-log.js";

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
 * A value that is not a client `AppError` is written to the response logger
 * before the generic body is sent. The JSON envelope does not include that text.
 */
export function errorHandler(err: unknown, _req: Request, res: Response, next: NextFunction): void {
  if (!isClientAppError(err)) {
    logHiddenFailure(err, res);
  }

  if (res.headersSent) {
    next(err);
    return;
  }

  const body = toErrorBody(err);
  res.status(body.error.status).json(body);
}

/**
 * Server-side copy of a failure the client must not see.
 * A log failure is reported and then ignored so the HTTP body below still sends.
 */
function logHiddenFailure(err: unknown, res: Response): void {
  try {
    loggerForResponse(res).error("request failed", errorDetails(err));
  } catch (logError) {
    const reason = logError instanceof Error ? logError.message : "log write failed";
    process.stderr.write(`log write failed: ${reason}\n`);
  }
}

function errorDetails(err: unknown): LogFields {
  if (err instanceof Error) {
    return {
      errorName: err.name,
      errorMessage: err.message,
      ...(err instanceof AppError ? { errorCode: err.code } : {}),
      stack: err.stack ?? "",
    };
  }
  if (typeof err === "string") {
    return {
      errorName: "NonError",
      errorMessage: err,
    };
  }
  return {
    errorName: "NonError",
    errorMessage: "Non-error rejection",
  };
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
