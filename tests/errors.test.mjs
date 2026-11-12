import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import express from "express";
import test from "node:test";
import { createApp } from "../dist/app.js";
import { AppError, NotFoundError } from "../dist/common/errors/app-error.js";
import { errorHandler, notFoundHandler } from "../dist/common/middleware/error-handler.js";

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

test("an unknown route returns the JSON 404 envelope", async () => {
  await withServer(createApp(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/missing?token=super-secret`);
    const raw = await response.text();

    assert.equal(response.status, 404);
    assert.equal(response.headers.get("x-powered-by"), null);
    assert.match(response.headers.get("content-type") ?? "", /application\/json/);
    assert.deepEqual(JSON.parse(raw), NOT_FOUND_BODY);
    assert.equal(raw.includes("super-secret"), false);
    assert.equal(raw.includes("<!DOCTYPE"), false);
  });
});

test("paths outside /api/v1 and the wrong health method use the same 404", async () => {
  await withServer(createApp(), async (baseUrl) => {
    const outside = await fetch(`${baseUrl}/health`);
    const otherVersion = await fetch(`${baseUrl}/api/v2/health`);
    const wrongMethod = await fetch(`${baseUrl}/api/v1/health`, { method: "POST" });

    assert.deepEqual(await outside.json(), NOT_FOUND_BODY);
    assert.equal(otherVersion.status, 404);
    assert.deepEqual(await otherVersion.json(), NOT_FOUND_BODY);
    assert.equal(wrongMethod.status, 404);
    assert.deepEqual(await wrongMethod.json(), NOT_FOUND_BODY);
  });
});

test("a thrown AppError keeps its status and message", async () => {
  const app = express();
  app.get("/api/v1/missing-product", () => {
    throw new NotFoundError("Product not found");
  });
  app.get("/api/v1/conflict", () => {
    throw new AppError(409, "conflict", "Cart line already exists");
  });
  app.use(notFoundHandler);
  app.use(errorHandler);

  await withServer(app, async (baseUrl) => {
    const missing = await fetch(`${baseUrl}/api/v1/missing-product`);
    const conflict = await fetch(`${baseUrl}/api/v1/conflict`);

    assert.equal(missing.status, 404);
    assert.deepEqual(await missing.json(), {
      error: { status: 404, code: "not_found", message: "Product not found" },
    });
    assert.equal(conflict.status, 409);
    assert.deepEqual(await conflict.json(), {
      error: { status: 409, code: "conflict", message: "Cart line already exists" },
    });
  });
});

test("a rejected async handler becomes a generic 500", async () => {
  const app = express();
  app.get("/api/v1/boom", async () => {
    throw new Error("mysql password=super-secret");
  });
  app.get("/api/v1/reject", () => Promise.reject("super-secret-token"));
  app.use(notFoundHandler);
  app.use(errorHandler);

  await withServer(app, async (baseUrl) => {
    const thrown = await fetch(`${baseUrl}/api/v1/boom`);
    const thrownRaw = await thrown.text();
    const rejected = await fetch(`${baseUrl}/api/v1/reject`);
    const rejectedRaw = await rejected.text();

    assert.equal(thrown.status, 500);
    assert.match(thrown.headers.get("content-type") ?? "", /application\/json/);
    assert.deepEqual(JSON.parse(thrownRaw), INTERNAL_BODY);
    assert.equal(thrownRaw.includes("super-secret"), false);
    assert.equal(thrownRaw.includes("stack"), false);
    assert.equal(rejected.status, 500);
    assert.deepEqual(JSON.parse(rejectedRaw), INTERNAL_BODY);
    assert.equal(rejectedRaw.includes("super-secret-token"), false);
  });
});

test("next(error) reaches the same JSON handler", async () => {
  const app = express();
  app.get("/api/v1/next", (_req, _res, next) => {
    next(new NotFoundError("Cart not found"));
  });
  app.use(notFoundHandler);
  app.use(errorHandler);

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/next`);
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), {
      error: { status: 404, code: "not_found", message: "Cart not found" },
    });
  });
});

test("Express can only see this error middleware if it has four parameters", () => {
  assert.equal(notFoundHandler.length, 3);
  assert.equal(errorHandler.length, 4);
});

test("AppError rejects a success status, a bad code, and an empty message", () => {
  assert.throws(() => new AppError(200, "ok", "nope"), /400 through 599/);
  assert.throws(() => new AppError(404, "NotFound", "nope"), /lowercase identifier/);
  assert.throws(() => new NotFoundError("   "), /must not be empty/);
});

test("NotFoundError is an AppError and does not use the URL as its message", () => {
  const error = new NotFoundError();
  assert.equal(error instanceof AppError, true);
  assert.equal(error instanceof NotFoundError, true);
  assert.equal(error.name, "NotFoundError");
  assert.equal(error.statusCode, 404);
  assert.equal(error.code, "not_found");
  assert.equal(error.message, "Not found");
  assert.equal(error.stack?.includes("app-error"), false);
});

test("a mutated AppError code is not returned to the client", () => {
  const error = new NotFoundError("Product not found");
  error.code = "mysql password=super-secret";

  /** @type {unknown} */
  let body;
  const res = {
    headersSent: false,
    status() {
      return this;
    },
    json(payload) {
      body = payload;
    },
  };

  errorHandler(error, {}, res, () => {
    assert.fail("headers were not sent");
  });

  assert.deepEqual(body, INTERNAL_BODY);
  assert.equal(JSON.stringify(body).includes("super-secret"), false);
  assert.equal(JSON.stringify(body).includes("Product not found"), false);
});

test("errorHandler does not write JSON after the response has started", () => {
  let statusCalled = false;
  let jsonCalled = false;
  /** @type {unknown} */
  let forwarded;
  const res = {
    headersSent: true,
    status() {
      statusCalled = true;
      return this;
    },
    json() {
      jsonCalled = true;
    },
  };

  errorHandler(new Error("mysql password=super-secret"), {}, res, (err) => {
    forwarded = err;
  });

  assert.equal(statusCalled, false);
  assert.equal(jsonCalled, false);
  assert.ok(forwarded instanceof Error);
  assert.equal(forwarded.message, "mysql password=super-secret");
});

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
