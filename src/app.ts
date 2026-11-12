import express from "express";
import { errorHandler, notFoundHandler } from "./common/middleware/error-handler.js";

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

/**
 * Build the Express application without opening a socket.
 * Listening belongs in `server.ts` so tests can import this module safely.
 */
export function createApp(): express.Express {
  const app = express();
  app.disable("x-powered-by");

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
