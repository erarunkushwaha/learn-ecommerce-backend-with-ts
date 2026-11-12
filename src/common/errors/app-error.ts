/**
 * Client-visible error body. Success responses stay `{ data }` and do not use this shape.
 * `message` is safe to show. A stack trace is never part of this object.
 */
export type ErrorBody = {
  error: {
    status: number;
    code: string;
    message: string;
  };
};

/** Machine code for an unmatched method or path. */
export const NOT_FOUND_CODE = "not_found";

/** Machine code for any failure that is not an `AppError`. */
export const INTERNAL_ERROR_CODE = "internal_error";

const ERROR_CODE_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;

/**
 * An expected HTTP failure whose message may be returned to the client.
 * Unexpected failures stay ordinary `Error`s so the handler can hide their text.
 */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(statusCode: number, code: string, message: string) {
    if (!Number.isInteger(statusCode) || statusCode < 400 || statusCode > 599) {
      throw new Error("AppError statusCode must be an integer from 400 through 599");
    }
    if (!ERROR_CODE_PATTERN.test(code)) {
      throw new Error("AppError code must be a lowercase identifier");
    }
    if (message.trim() === "") {
      throw new Error("AppError message must not be empty");
    }

    super(message);
    this.name = new.target.name;
    this.statusCode = statusCode;
    this.code = code;
    Error.captureStackTrace(this, new.target);
  }
}

/** No route matched this method and path. The default message does not echo the URL. */
export class NotFoundError extends AppError {
  constructor(message = "Not found") {
    super(404, NOT_FOUND_CODE, message);
  }
}

/** Narrow `unknown` thrown values without a cast. */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/**
 * Runtime check for the JSON handler.
 * `readonly` is a type-level constraint, so a field can still be overwritten
 * after construction. A code that no longer matches the token pattern is not sent.
 */
export function isClientAppError(error: unknown): error is AppError {
  return (
    isAppError(error) &&
    Number.isInteger(error.statusCode) &&
    error.statusCode >= 400 &&
    error.statusCode <= 599 &&
    ERROR_CODE_PATTERN.test(error.code) &&
    error.message.trim() !== ""
  );
}
