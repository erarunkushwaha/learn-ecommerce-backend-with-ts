import express from "express";
import { NotReadyError } from "./common/errors/app-error.js";
import { errorHandler, notFoundHandler } from "./common/middleware/error-handler.js";
import { accessLog, loggerForResponse, requestContext } from "./common/middleware/request-log.js";
import { createLogger, type LogFields, type Logger } from "./config/logger.js";

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

/** Readiness payload. `ok` means the injected MySQL probe succeeded. */
export type ReadyData = {
  mysql: "ok";
};

/**
 * Startup and `GET /api/v1/ready` await this. A rejection is a driver error.
 * `createApp` does not import the pool; the process entry passes `probeMysql`.
 */
export type ReadyCheck = () => Promise<void>;

export type CreateAppOptions = {
  /** Defaults to an info logger on stdout and stderr. */
  logger?: Logger;
  /**
   * Probe for `GET /api/v1/ready`. When omitted, that route is 503 and opens
   * no socket. Liveness does not call it.
   */
  checkReady?: ReadyCheck;
};

/**
 * Build the Express application without opening a socket.
 * Listening belongs in `server.ts` so tests can import this module safely.
 * Request id and the access log run before routes. The JSON 404 and the
 * error handler stay last.
 */
export function createApp(options: CreateAppOptions = {}): express.Express {
  const logger = options.logger ?? createLogger();
  const checkReady = options.checkReady;
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

  v1.get("/ready", async (_req, res) => {
    if (checkReady === undefined) {
      throw new NotReadyError();
    }
    try {
      await checkReady();
    } catch (error) {
      // `NotReadyError` is a client AppError, so the error handler will not
      // log it. The driver text is recorded here and stays out of the body.
      loggerForResponse(res).error("mysql readiness check failed", failureFields(error));
      throw new NotReadyError();
    }
    const body: SuccessBody<ReadyData> = {
      data: { mysql: "ok" },
    };
    res.status(200).json(body);
  });

  app.use(API_V1_PREFIX, v1);
  // After every route. An unknown method or path is a JSON 404, then the error handler.
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

function failureFields(error: unknown): LogFields {
  if (error instanceof Error) {
    return {
      errorName: error.name,
      errorMessage: error.message,
      stack: error.stack ?? "",
    };
  }
  return {
    errorName: "NonError",
    errorMessage: "Non-error rejection",
  };
}
