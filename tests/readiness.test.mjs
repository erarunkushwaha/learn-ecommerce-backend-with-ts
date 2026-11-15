import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { createServer as createNetServer } from "node:net";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { Writable } from "node:stream";
import { createApp } from "../dist/app.js";
import { loadConfig } from "../dist/config/env.js";
import { createLogger } from "../dist/config/logger.js";
import { createSequelize, probeMysql } from "../dist/database/sequelize.js";
import { drainServer, listeningUrl, startServer, stopServer } from "../dist/server.js";

const NOT_READY_BODY = {
  error: {
    status: 503,
    code: "not_ready",
    message: "MySQL is unavailable",
  },
};

const READY_BODY = { data: { mysql: "ok" } };
const HEALTH_BODY = { data: { status: "ok" } };

/**
 * Pool idle timeout is 10s. A shutdown that leaves that socket open stays
 * alive longer than this budget.
 */
const EXIT_BUDGET_MS = 5_000;

test("liveness does not run the readiness probe", async () => {
  let calls = 0;
  await withApp(
    createApp({
      checkReady: async () => {
        calls += 1;
      },
    }),
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/v1/health`);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), HEALTH_BODY);
    },
  );
  assert.equal(calls, 0);
});

test("GET /api/v1/ready returns the MySQL envelope when the probe succeeds", async () => {
  await withApp(
    createApp({
      checkReady: async () => {},
    }),
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/v1/ready`);
      assert.equal(response.status, 200);
      assert.match(response.headers.get("content-type") ?? "", /application\/json/);
      assert.deepEqual(await response.json(), READY_BODY);
    },
  );
});

test("a failed probe is 503 and the client body hides the driver text", async () => {
  const captured = captureLogs();
  const driver = "connect ECONNREFUSED 127.0.0.1:9";
  await withApp(
    createApp({
      logger: captured.logger,
      checkReady: async () => {
        throw new Error(driver);
      },
    }),
    async (baseUrl) => {
      const ready = await fetch(`${baseUrl}/api/v1/ready`, {
        headers: { "x-request-id": "ready-down" },
      });
      const raw = await ready.text();
      const health = await fetch(`${baseUrl}/api/v1/health`);

      assert.equal(ready.status, 503);
      assert.equal(ready.headers.get("x-request-id"), "ready-down");
      assert.deepEqual(JSON.parse(raw), NOT_READY_BODY);
      assert.equal(raw.includes("ECONNREFUSED"), false);
      assert.equal(health.status, 200);
      assert.deepEqual(await health.json(), HEALTH_BODY);
    },
  );

  const logs = captured.text();
  assert.match(logs, /"message":"mysql readiness check failed"/);
  assert.match(logs, /ECONNREFUSED/);
  assert.match(logs, /"requestId":"ready-down"/);
  assert.match(logs, /"path":"\/api\/v1\/ready"/);
  assert.match(logs, /"status":503/);
});

test("ready without a probe is 503 and does not query MySQL", async () => {
  const captured = captureLogs();
  await withApp(createApp({ logger: captured.logger }), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/ready`);
    const raw = await response.text();
    assert.equal(response.status, 503);
    assert.deepEqual(JSON.parse(raw), NOT_READY_BODY);
  });
  assert.equal(captured.text().includes("mysql readiness check failed"), false);
});

test("ready is mounted only on GET /api/v1/ready", async () => {
  await withApp(createApp(), async (baseUrl) => {
    const unversioned = await fetch(`${baseUrl}/ready`);
    const wrongMethod = await fetch(`${baseUrl}/api/v1/ready`, { method: "POST" });
    assert.equal(unversioned.status, 404);
    assert.equal(wrongMethod.status, 404);
  });
});

test("probeMysql queries Compose MySQL and leaves the password out of the SQL log", {
  timeout: 15_000,
}, async () => {
  const mysql = await composeMysql();
  const captured = captureLogs("debug");
  const db = createSequelize(mysql, captured.logger);
  try {
    await probeMysql(db);
    const text = captured.text();
    assert.match(text, /SELECT 1\+1 AS result/);
    assert.equal(text.includes(mysql.password), false);
  } finally {
    await db.close();
  }
});

test("a live server reports 503 when the MySQL probe is denied", { timeout: 15_000 }, async () => {
  const mysql = await composeMysql();
  const captured = captureLogs();
  const wrong = "wrong-password";
  const db = createSequelize({ ...mysql, password: wrong }, captured.logger);
  const server = await startServer(0, captured.logger, {
    checkReady: () => probeMysql(db),
  });
  try {
    const ready = await fetch(`${listeningUrl(server)}/api/v1/ready`);
    const raw = await ready.text();
    const health = await fetch(`${listeningUrl(server)}/api/v1/health`);

    assert.equal(ready.status, 503);
    assert.deepEqual(JSON.parse(raw), NOT_READY_BODY);
    assert.equal(raw.includes(mysql.password), false);
    assert.equal(raw.includes(wrong), false);
    assert.equal(health.status, 200);
    assert.equal(server.listening, true);
  } finally {
    await stopServer(server);
    await db.close();
  }

  const logs = captured.text();
  assert.equal(logs.includes(mysql.password), false);
  assert.equal(logs.includes(wrong), false);
  assert.match(logs, /mysql readiness check failed/);
});

test("drainServer waits for an in-flight request", async () => {
  const gate = deferred();
  const started = deferred();
  const server = await startServer(0, undefined, {
    checkReady: async () => {
      started.resolve();
      await gate.promise;
    },
  });
  const pending = fetch(`${listeningUrl(server)}/api/v1/ready`);
  let settled = false;
  try {
    await started.promise;
    const drained = drainServer(server).then(() => {
      settled = true;
    });
    await delay(50);
    assert.equal(settled, false);
    gate.resolve();
    await drained;
    const response = await pending;
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), READY_BODY);
    assert.equal(server.listening, false);
  } finally {
    gate.resolve();
    await stopServer(server);
  }
});

test("drainServer destroys a request that outlives the deadline", async () => {
  const gate = deferred();
  const started = deferred();
  const server = await startServer(0, undefined, {
    checkReady: async () => {
      started.resolve();
      await gate.promise;
    },
  });
  const pending = fetch(`${listeningUrl(server)}/api/v1/ready`).then(
    () => "completed",
    () => "closed",
  );
  try {
    await started.promise;
    await drainServer(server, 200);
    assert.equal(server.listening, false);
    gate.resolve();
    assert.equal(await pending, "closed");
  } finally {
    gate.resolve();
    await stopServer(server);
  }
});

test("process entry serves liveness and readiness without dialing Redis, then SIGTERM drains", {
  timeout: 15_000,
}, async () => {
  await assertSignalDrain("SIGTERM", { countRedis: true });
});

test("process entry drains on SIGINT", { timeout: 15_000 }, async () => {
  await assertSignalDrain("SIGINT", { countRedis: false });
});

test("process entry exits before listen when MySQL refuses the connection", {
  timeout: 10_000,
}, async () => {
  const child = spawnServer({
    PORT: "0",
    MYSQL_HOST: "127.0.0.1",
    MYSQL_PORT: "1",
    MYSQL_DATABASE: "ecom",
    MYSQL_USER: "ecom",
    MYSQL_PASSWORD: "local-only",
    REDIS_PASSWORD: "local-only",
  });
  const [code] = await once(child.process, "exit");
  await child.stdioClosed;
  const stderr = child.stderrText();
  const stdout = child.stdoutText();

  assert.equal(stderr.includes("local-only"), false);
  assert.equal(stdout.includes("local-only"), false);
  assert.equal(code, 1);
  assert.equal(stdout.includes("listening"), false);
  assert.match(stderr, /MySQL is unavailable/);
  assert.match(stderr, /ECONNREFUSED/);
});

test("process entry exits before listen when MySQL rejects the password", {
  timeout: 15_000,
}, async () => {
  const mysql = await composeMysql();
  const wrong = "wrong-password";
  const child = spawnServer({
    PORT: "0",
    MYSQL_HOST: mysql.host,
    MYSQL_PORT: String(mysql.port),
    MYSQL_DATABASE: mysql.database,
    MYSQL_USER: mysql.user,
    MYSQL_PASSWORD: wrong,
    REDIS_PASSWORD: "local-only",
  });
  const [code] = await once(child.process, "exit");
  await child.stdioClosed;
  const stderr = child.stderrText();
  const stdout = child.stdoutText();

  assert.equal(stderr.includes(mysql.password), false);
  assert.equal(stderr.includes(wrong), false);
  assert.equal(stdout.includes(mysql.password), false);
  assert.equal(code, 1);
  assert.equal(stdout.includes("listening"), false);
  assert.match(stderr, /MySQL is unavailable/);
  assert.match(stderr, /Access denied/);
});

/**
 * @param {"SIGINT" | "SIGTERM"} signal
 * @param {{ countRedis: boolean }} options
 */
async function assertSignalDrain(signal, options) {
  const mysql = await composeMysql();
  const redis = await composeRedis();
  let redisConnections = 0;
  /** @type {import("node:net").Server | undefined} */
  let counter;
  let redisPort = "1";
  if (options.countRedis) {
    counter = createNetServer((socket) => {
      redisConnections += 1;
      socket.destroy();
    });
    redisPort = String(await listen(counter));
  }

  const child = spawnServer({
    PORT: "0",
    LOG_LEVEL: "info",
    MYSQL_HOST: mysql.host,
    MYSQL_PORT: String(mysql.port),
    MYSQL_DATABASE: mysql.database,
    MYSQL_USER: mysql.user,
    MYSQL_PASSWORD: mysql.password,
    REDIS_HOST: "127.0.0.1",
    REDIS_PORT: redisPort,
    REDIS_PASSWORD: redis.password,
  });

  try {
    const baseUrl = await waitForListenUrl(child);
    const health = await fetch(`${baseUrl}/api/v1/health`);
    const ready = await fetch(`${baseUrl}/api/v1/ready`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), HEALTH_BODY);
    assert.equal(ready.status, 200);
    assert.deepEqual(await ready.json(), READY_BODY);

    child.process.kill(signal);
    const [code, signalCode] = await waitForExit(child.process, signal);
    await child.stdioClosed;
    const stdout = child.stdoutText();
    const stderr = child.stderrText();

    assert.equal(stdout.includes(mysql.password), false);
    assert.equal(stderr.includes(mysql.password), false);
    assert.equal(stdout.includes(redis.password), false);
    assert.equal(stderr.includes(redis.password), false);
    assert.equal(code, 0);
    assert.equal(signalCode, null);
    assert.equal(stderr, "");
    assert.match(stdout, /shutdown started/);
    assert.match(stdout, new RegExp(`"signal":"${signal}"`));
    assert.match(stdout, /shutdown finished/);
    if (options.countRedis) {
      assert.equal(redisConnections, 0);
    }
  } finally {
    if (child.process.exitCode === null && child.process.signalCode === null) {
      child.process.kill("SIGKILL");
      await once(child.process, "exit");
    }
    if (counter !== undefined) {
      counter.close();
    }
  }
}

async function composeMysql() {
  const config = await composeConfig();
  assert.equal(config.mysql.host, "127.0.0.1");
  assert.equal(config.mysql.port, 3307);
  return config.mysql;
}

async function composeRedis() {
  const config = await composeConfig();
  return config.redis;
}

async function composeConfig() {
  const parsed = parseEnv(await readFile(new URL("../.env", import.meta.url), "utf8"));
  return loadConfig(parsed);
}

/**
 * @param {Record<string, string>} env
 */
function spawnServer(env) {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const merged = {
    ...process.env,
    LOG_LEVEL: "info",
    REDIS_HOST: "127.0.0.1",
    REDIS_PORT: "1",
    ...env,
  };
  const child = spawn(process.execPath, ["dist/server.js"], {
    cwd: root,
    env: merged,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  const stdioClosed = Promise.all([once(child.stdout, "end"), once(child.stderr, "end")]);

  return {
    process: child,
    stdioClosed,
    stdoutText: () => stdout,
    stderrText: () => stderr,
  };
}

/**
 * @param {ReturnType<typeof spawnServer>} child
 */
function waitForListenUrl(child) {
  const line = /ecom-backend listening on (http:\/\/127\.0\.0\.1:\d+)/;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      finish(new Error(`server did not listen\n${child.stderrText()}`));
    }, 8_000);

    const finish = (error, url) => {
      clearTimeout(timeout);
      child.process.stdout.off("data", onStdout);
      child.process.off("exit", onExit);
      if (error) {
        reject(error);
        return;
      }
      resolve(url);
    };

    const onStdout = () => {
      const match = line.exec(child.stdoutText());
      if (match?.[1] === undefined) {
        return;
      }
      finish(undefined, match[1]);
    };

    const onExit = (code) => {
      finish(new Error(`server exited ${String(code)} before listening\n${child.stderrText()}`));
    };

    child.process.stdout.on("data", onStdout);
    child.process.once("exit", onExit);
    onStdout();
  });
}

/**
 * @param {import("express").Express | ReturnType<typeof createApp>} app
 * @param {(baseUrl: string) => Promise<void>} fn
 */
async function withApp(app, fn) {
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

/**
 * @param {"info" | "debug"} [level]
 */
function captureLogs(level = "info") {
  /** @type {string[]} */
  const chunks = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk));
      callback();
    },
  });
  return {
    logger: createLogger({ destination: stream, errorDestination: stream, level }),
    text() {
      return chunks.join("");
    },
  };
}

/**
 * @param {import("node:net").Server} server
 */
function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        reject(new Error("test server has no TCP port"));
        return;
      }
      resolve(address.port);
    });
  });
}

/**
 * @param {import("node:child_process").ChildProcess} child
 * @param {string} signal
 * @returns {Promise<[number | null, NodeJS.Signals | null]>}
 */
function waitForExit(child, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`${signal} did not exit within ${EXIT_BUDGET_MS}ms`));
    }, EXIT_BUDGET_MS);
    child.once("exit", (code, signalCode) => {
      clearTimeout(timer);
      resolve([code, signalCode]);
    });
  });
}

function deferred() {
  /** @type {(value?: unknown) => void} */
  let resolve = () => {};
  const promise = new Promise((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

/**
 * @param {number} ms
 */
function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
