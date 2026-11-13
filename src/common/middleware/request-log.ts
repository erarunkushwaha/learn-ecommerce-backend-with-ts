import { randomUUID } from "node:crypto";
import type { Request, RequestHandler } from "express";
import { createLogger, type Logger } from "../../config/logger.js";

/** Response header that echoes the id also written on each log line. */
export const REQUEST_ID_HEADER = "X-Request-Id";

/**
 * Printable token, 1–128 characters. Spaces, slashes, and quotes are rejected.
 * A newline would split one JSON log line into two. Anything that fails the
 * pattern is discarded, so the client-supplied text is never copied into a line.
 */
const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

const responseLoggers = new WeakMap<object, Logger>();

/**
 * Used when a caller invokes `errorHandler` without `requestContext`.
 * `createApp` always binds a child logger first.
 */
const fallbackLogger = createLogger();

/**
 * Remember which logger carries this response's request id.
 * `errorHandler` stays a four-argument function, and `Express.Request` is
 * not augmented. The map entry goes away with the response object.
 */
export function bindResponseLogger(res: object, logger: Logger): void {
  responseLoggers.set(res, logger);
}

/** The bound child logger, or the process fallback when nothing was bound. */
export function loggerForResponse(res: object): Logger {
  return responseLoggers.get(res) ?? fallbackLogger;
}

/**
 * First middleware. Sets `X-Request-Id` and binds a child logger.
 * An inbound id is kept only when it matches the token pattern.
 */
export function requestContext(logger: Logger): RequestHandler {
  return function requestContextMiddleware(req, res, next): void {
    const requestId = resolveRequestId(req);
    res.setHeader(REQUEST_ID_HEADER, requestId);
    bindResponseLogger(res, logger.child({ requestId }));
    next();
  };
}

/**
 * Writes one access line after the response finishes.
 * `req.path` has no query string. Headers and bodies are not fields.
 * Register this before routes so `finish` is already listening.
 */
export function accessLog(): RequestHandler {
  return function accessLogMiddleware(req, res, next): void {
    const started = process.hrtime.bigint();
    // Read the path now. Inside a mounted router, `req.path` later drops the
    // mount prefix, and `req.originalUrl` keeps the query string.
    const path = pathWithoutQuery(req.originalUrl);
    res.on("finish", () => {
      const durationMs = Number((process.hrtime.bigint() - started) / 1_000_000n);
      loggerForResponse(res).info("request", {
        method: req.method,
        path,
        status: res.statusCode,
        durationMs,
      });
    });
    next();
  };
}

function pathWithoutQuery(url: string): string {
  const queryAt = url.indexOf("?");
  if (queryAt === -1) {
    return url;
  }
  return url.slice(0, queryAt);
}

function resolveRequestId(req: Request): string {
  const header: unknown = req.get(REQUEST_ID_HEADER);
  if (typeof header === "string" && REQUEST_ID_PATTERN.test(header)) {
    return header;
  }
  return randomUUID();
}
