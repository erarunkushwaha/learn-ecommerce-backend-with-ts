import express from "express";
import { createLogger, type Logger } from "./config/logger.js";
import { errorHandler, notFoundHandler } from "./common/middleware/error-handler.js";
import { accessLog, requestContext } from "./common/middleware/request-log.js";

/** Path prefix for the first public API version. */
export const API_V1_PREFIX = "/api/v1";

/**
 * JSON body for a successful response.
 * `T` is the payload; callers should not add a second envelope.
 */
export type SuccessBody<T> = {
  data: T;
};

/** Liveness payload. It does not report database or dependency state. */
export type HealthData = {
  status: "ok";
};

export type CreateAppOptions = {
  /** Defaults to an info logger on stdout and stderr. */
  logger?: Logger;
};

/**
 * Build the Express application without opening a socket.
 * Listening belongs in `server.ts` so tests can import this module safely.
 * Request id and the access log run before routes. The JSON 404 and the
 * error handler stay last.
 */
export function createApp(options: CreateAppOptions = {}): express.Express {
  const logger = options.logger ?? createLogger();
  const app = express();
  app.disable("x-powered-by");
  app.use(requestContext(logger));
  app.use(accessLog());

  const v1 = express.Router();
  v1.get("/health", (_req, res) => {
    const body: SuccessBody<HealthData> = {
      data: { status: "ok" },
    };
    res.status(200).json(body);
  });

  app.use(API_V1_PREFIX, v1);
  // After every route. An unknown method or path is a JSON 404, then the error handler.
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
