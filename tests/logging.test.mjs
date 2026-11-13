import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { Writable } from "node:stream";
import express from "express";
import test from "node:test";
import { createApp } from "../dist/app.js";
import { createLogger } from "../dist/config/logger.js";
import { NotFoundError } from "../dist/common/errors/app-error.js";
import { errorHandler, notFoundHandler } from "../dist/common/middleware/error-handler.js";
import { accessLog, loggerForResponse, requestContext } from "../dist/common/middleware/request-log.js";
import { listeningUrl, startServer, stopServer } from "../dist/server.js";

const NOT_FOUND_BODY = {
  error: {
    status: 404,
    code: "not_found",
    message: "Not found",
  },
};

const INTERNAL_BODY = {
  error: {
    status: 500,
    code: "internal_error",
    message: "Internal server error",
  },
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

test("logger writes one JSON line and keeps error lines on the error stream", () => {
  const out = captureLogs();
  const err = captureLogs();
  const logger = createLogger({
    level: "error",
    destination: out.stream,
    errorDestination: err.stream,
  });

  logger.info("request", { path: "/api/v1/health" });
  logger.child({ message: "hijack", requestId: "abc" }).error("request failed", {
    errorMessage: "mysql password=super-secret\ninjected",
  });

  assert.equal(out.text(), "");
  const entries = err.entries();
  assert.equal(entries.length, 1);
  assert.equal(entries[0].level, "error");
  assert.equal(entries[0].message, "request failed");
  assert.equal(entries[0].requestId, "abc");
  assert.equal(entries[0].errorMessage, "mysql password=super-secret\ninjected");
  assert.match(entries[0].time, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(err.text().split("\n").filter((line) => line !== "").length, 1);
});

test("a health request echoes a request id and omits the query string", async () => {
  const captured = captureLogs();
  await withServer(createApp({ logger: captured.logger }), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/health?token=super-secret`);
    const requestId = response.headers.get("x-request-id");

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { data: { status: "ok" } });
    assert.match(requestId ?? "", UUID);

    const entries = captured.entries();
    assert.equal(entries.length, 1);
    assert.equal(entries[0].message, "request");
    assert.equal(entries[0].level, "info");
    assert.equal(entries[0].requestId, requestId);
    assert.equal(entries[0].method, "GET");
    assert.equal(entries[0].path, "/api/v1/health");
    assert.equal(entries[0].status, 200);
    assert.equal(Number.isInteger(entries[0].durationMs), true);
    assert.equal(entries[0].durationMs >= 0, true);
    assert.equal(captured.text().includes("super-secret"), false);
    assert.equal(captured.text().includes("token"), false);
  });
});

test("a safe inbound request id is echoed and an unsafe one is replaced", async () => {
  const captured = captureLogs();
  const longId = "a".repeat(128);
  await withServer(createApp({ logger: captured.logger }), async (baseUrl) => {
    const accepted = await fetch(`${baseUrl}/api/v1/health`, {
      headers: { "X-Request-Id": "client-123.abc_DEF" },
    });
    const sized = await fetch(`${baseUrl}/api/v1/health`, {
      headers: { "X-Request-Id": longId },
    });
    const spaced = await fetch(`${baseUrl}/api/v1/health`, {
      headers: { "X-Request-Id": "bad id" },
    });
    const quoted = await fetch(`${baseUrl}/api/v1/health`, {
      headers: { "X-Request-Id": 'bad"id' },
    });
    const slashed = await fetch(`${baseUrl}/api/v1/health`, {
      headers: { "X-Request-Id": "a/b" },
    });

    assert.equal(accepted.headers.get("x-request-id"), "client-123.abc_DEF");
    assert.equal(sized.headers.get("x-request-id"), longId);
    assert.match(spaced.headers.get("x-request-id") ?? "", UUID);
    assert.match(quoted.headers.get("x-request-id") ?? "", UUID);
    assert.match(slashed.headers.get("x-request-id") ?? "", UUID);
    assert.equal(captured.text().includes("bad id"), false);
    assert.equal(captured.text().includes('bad"id'), false);
    assert.equal(captured.text().includes("a/b"), false);
    assert.equal(captured.text().includes(longId), true);
  });
});

test("requestContext replaces a request id that contains a newline", () => {
  const captured = captureLogs();
  /** @type {Map<string, string>} */
  const headers = new Map();
  const req = {
    get() {
      return "has\nnewline";
    },
  };
  const res = {
    setHeader(name, value) {
      headers.set(name, String(value));
    },
  };
  requestContext(captured.logger)(req, res, () => {});
  loggerForResponse(res).info("request", { path: "/api/v1/health" });
  const requestId = headers.get("X-Request-Id");
  assert.match(requestId ?? "", UUID);
  assert.equal(requestId?.includes("\n"), false);
  assert.equal(captured.entries()[0].requestId, requestId);
  assert.equal(captured.text().includes("newline"), false);
});

test("an unknown route keeps the JSON 404 envelope and logs the status", async () => {
  const captured = captureLogs();
  await withServer(createApp({ logger: captured.logger }), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/missing?token=super-secret`, {
      headers: { "X-Request-Id": "route-404" },
    });
    const wrongMethod = await fetch(`${baseUrl}/api/v1/health`, { method: "POST" });

    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), NOT_FOUND_BODY);
    assert.equal(response.headers.get("x-request-id"), "route-404");
    assert.equal(wrongMethod.status, 404);
    assert.deepEqual(await wrongMethod.json(), NOT_FOUND_BODY);
    assert.match(wrongMethod.headers.get("x-request-id") ?? "", UUID);

    const misses = captured.entries().filter((entry) => entry.status === 404);
    assert.equal(misses.length, 2);
    assert.equal(misses[0].path, "/api/v1/missing");
    assert.equal(misses[0].requestId, "route-404");
    assert.equal(captured.entries().some((entry) => entry.level === "error"), false);
    assert.equal(captured.text().includes("super-secret"), false);
  });
});

test("error level still returns a request id and writes no access line", async () => {
  const captured = captureLogs();
  const logger = createLogger({
    level: "error",
    destination: captured.stream,
    errorDestination: captured.stream,
  });
  await withServer(createApp({ logger }), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/health`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("x-request-id") ?? "", UUID);
    assert.equal(captured.text(), "");
  });
});

test("a thrown error is logged and stays out of the JSON body", async () => {
  const captured = captureLogs();
  const app = stack(captured.logger, (router) => {
    router.get("/api/v1/boom", () => {
      throw new Error("mysql password=super-secret\ninjected");
    });
  });

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/boom?token=query-secret`, {
      headers: { "X-Request-Id": "boom-1" },
    });
    const raw = await response.text();

    assert.equal(response.status, 500);
    assert.equal(response.headers.get("x-request-id"), "boom-1");
    assert.deepEqual(JSON.parse(raw), INTERNAL_BODY);
    assert.equal(raw.includes("super-secret"), false);
    assert.equal(raw.includes("injected"), false);
    assert.equal(raw.includes("stack"), false);

    const failed = captured.entries().find((entry) => entry.message === "request failed");
    const access = captured.entries().find((entry) => entry.message === "request");
    assert.ok(failed);
    assert.equal(failed.level, "error");
    assert.equal(failed.requestId, "boom-1");
    assert.equal(failed.errorName, "Error");
    assert.equal(failed.errorMessage, "mysql password=super-secret\ninjected");
    assert.equal(typeof failed.stack, "string");
    assert.equal(failed.stack.includes("super-secret"), true);
    assert.ok(access);
    assert.equal(access.status, 500);
    assert.equal(access.path, "/api/v1/boom");
    assert.equal(access.requestId, "boom-1");
    assert.equal(captured.text().includes("query-secret"), false);
    assert.equal(captured.entries().length, 2);
  });
});

test("a rejected string is logged and a client AppError is not an error line", async () => {
  const captured = captureLogs();
  const app = stack(captured.logger, (router) => {
    router.get("/api/v1/reject", () => Promise.reject("super-secret-token"));
    router.get("/api/v1/missing-product", () => {
      throw new NotFoundError("Product not found");
    });
  });

  await withServer(app, async (baseUrl) => {
    const rejected = await fetch(`${baseUrl}/api/v1/reject`);
    const missing = await fetch(`${baseUrl}/api/v1/missing-product`);
    const rejectedRaw = await rejected.text();

    assert.equal(rejected.status, 500);
    assert.deepEqual(JSON.parse(rejectedRaw), INTERNAL_BODY);
    assert.equal(rejectedRaw.includes("super-secret-token"), false);
    assert.equal(missing.status, 404);
    assert.deepEqual(await missing.json(), {
      error: { status: 404, code: "not_found", message: "Product not found" },
    });

    const failed = captured.entries().filter((entry) => entry.level === "error");
    assert.equal(failed.length, 1);
    assert.equal(failed[0].errorMessage, "super-secret-token");
    assert.equal(failed[0].requestId, rejected.headers.get("x-request-id"));
    const product = captured.entries().find((entry) => entry.path === "/api/v1/missing-product");
    assert.ok(product);
    assert.equal(product.status, 404);
    assert.equal(product.level, "info");
  });
});

test("startServer writes the listen line and the access line to the provided logger", async () => {
  const captured = captureLogs();
  const server = await startServer(0, captured.logger);
  try {
    const response = await fetch(`${listeningUrl(server)}/api/v1/health`);
    assert.equal(response.status, 200);
    const entries = captured.entries();
    const listen = entries.find((entry) => entry.url !== undefined);
    const access = entries.find((entry) => entry.message === "request");
    assert.ok(listen);
    assert.match(listen.message, /^ecom-backend listening on http:\/\/127\.0\.0\.1:\d+$/);
    assert.equal(listen.url, listeningUrl(server));
    assert.equal(listen.level, "info");
    assert.ok(access);
    assert.equal(access.status, 200);
    assert.equal(access.path, "/api/v1/health");
  } finally {
    await stopServer(server);
  }
});

/**
 * Same middleware order as `createApp`, with room for a throwing route.
 * @param {import("../dist/config/logger.js").Logger} logger
 * @param {(app: import("express").Express) => void} mount
 */
function stack(logger, mount) {
  const app = express();
  app.disable("x-powered-by");
  app.use(requestContext(logger));
  app.use(accessLog());
  mount(app);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

function captureLogs() {
  /** @type {string[]} */
  const chunks = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk));
      callback();
    },
  });
  return {
    stream,
    logger: createLogger({ destination: stream, errorDestination: stream, level: "debug" }),
    text() {
      return chunks.join("");
    },
    entries() {
      return chunks
        .join("")
        .split("\n")
        .filter((line) => line !== "")
        .map((line) => JSON.parse(line));
    },
  };
}

/**
 * @param {import("express").Express} app
 * @param {(baseUrl: string) => Promise<void>} fn
 */
async function withServer(app, fn) {
  const server = createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("test server has no TCP address");
    }
    await fn(`http://127.0.0.1:${address.port}`);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
}
