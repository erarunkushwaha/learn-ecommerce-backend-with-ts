import assert from "node:assert/strict";
import { createServer } from "node:net";
import { hostname } from "node:os";
import { readFile } from "node:fs/promises";
import test, { after } from "node:test";
import { parseEnv } from "node:util";
import { Writable } from "node:stream";
import { loadConfig } from "../dist/config/env.js";
import { createLogger } from "../dist/config/logger.js";
import {
  SEQUELIZE_POOL,
  closeSequelize,
  createSequelize,
  getSequelize,
} from "../dist/database/sequelize.js";

after(async () => {
  await closeSequelize();
});

test("createSequelize keeps the configured port and does not connect until a query", async () => {
  let connections = 0;
  const server = createServer((socket) => {
    connections += 1;
    socket.destroy();
  });
  const port = await listen(server);
  const db = createSequelize({
    host: "127.0.0.1",
    port,
    database: "ecom",
    user: "ecom",
    password: "local-only",
  });

  try {
    assert.equal(db.options.host, "127.0.0.1");
    assert.equal(db.options.port, port);
    assert.equal(db.options.timezone, "+00:00");
    assert.equal(db.options.logQueryParameters, false);
    assert.deepEqual(db.options.pool, { ...SEQUELIZE_POOL });
    await delay(50);
    assert.equal(connections, 0);
    await assert.rejects(() => db.query("SELECT 1 AS ok"));
    assert.ok(connections >= 1);
  } finally {
    await db.close();
    server.close();
  }
});

test("sql logging stays off unless the logger level is debug", async () => {
  const settings = {
    host: "127.0.0.1",
    port: 1,
    database: "ecom",
    user: "ecom",
    password: "local-only",
  };
  const silent = createSequelize(settings);
  const info = createSequelize(settings, createLogger({ level: "info" }));
  const debug = createSequelize(settings, createLogger({ level: "debug" }));

  try {
    assert.equal(silent.options.logging, false);
    assert.equal(info.options.logging, false);
    assert.equal(typeof debug.options.logging, "function");
  } finally {
    await silent.close();
    await info.close();
    await debug.close();
  }
});

test("getSequelize returns one instance and does not keep a failed parse", async () => {
  assert.throws(() => getSequelize({}), /MYSQL_DATABASE is required/);

  const env = {
    MYSQL_HOST: "127.0.0.1",
    MYSQL_PORT: "1",
    MYSQL_DATABASE: "ecom",
    MYSQL_USER: "ecom",
    MYSQL_PASSWORD: "local-only",
    REDIS_PASSWORD: "local-only",
  };
  const first = getSequelize(env);
  const second = getSequelize({
    ...env,
    MYSQL_HOST: "mysql",
    MYSQL_PORT: "3306",
  });

  assert.equal(first, second);
  assert.equal(first.options.host, "127.0.0.1");
  assert.equal(first.options.port, 1);

  await closeSequelize();
  const third = getSequelize(env);
  assert.notEqual(third, first);
  assert.equal(third.options.port, 1);
  await closeSequelize();
});

test("the process pool queries Compose MySQL on 127.0.0.1:3307", { timeout: 15_000 }, async () => {
  const mysql = await composeMysql();
  const secret = "o'hara-pool-secret";
  const captured = captureLogs();
  const db = createSequelize(mysql, captured.logger);

  try {
    const [rows] = await db.query(
      "SELECT $secret AS secret, DATABASE() AS databaseName, @@hostname AS hostname, @@port AS serverPort, @@session.time_zone AS timeZone, @@character_set_connection AS charset",
      { bind: { secret } },
    );
    const row = Array.isArray(rows) ? rows[0] : undefined;
    assert.ok(row !== undefined && typeof row === "object");
    assert.equal(row.secret, secret);
    assert.equal(row.databaseName, mysql.database);
    assert.equal(Number(row.serverPort), 3306);
    assert.equal(row.timeZone, "+00:00");
    assert.equal(row.charset, "utf8mb4");
    assert.notEqual(row.hostname, hostname());

    const pool = db.connectionManager.pool;
    assert.equal(typeof pool, "object");
    assert.ok(pool !== null);
    assert.equal(pool.maxSize, SEQUELIZE_POOL.max);
    assert.ok(pool.size >= 1);
    assert.ok(pool.size <= SEQUELIZE_POOL.max);

    const text = captured.text();
    assert.match(text, /"message":"sql"/);
    assert.match(text, /SELECT/);
    assert.equal(text.includes(secret), false);
    assert.equal(text.includes(mysql.password), false);
  } finally {
    await db.close();
  }

  const denied = createSequelize({ ...mysql, password: "wrong-password" });
  try {
    await assert.rejects(
      () => denied.query("SELECT 1 AS ok"),
      (error) => {
        assert.ok(error instanceof Error);
        assert.equal(error.message.includes(mysql.password), false);
        assert.equal(error.message.includes("wrong-password"), false);
        return true;
      },
    );
  } finally {
    await denied.close();
  }
});

async function composeMysql() {
  const parsed = parseEnv(await readFile(new URL("../.env", import.meta.url), "utf8"));
  const config = loadConfig(parsed);
  assert.equal(config.mysql.host, "127.0.0.1");
  assert.equal(config.mysql.port, 3307);
  return config.mysql;
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
    logger: createLogger({ destination: stream, errorDestination: stream, level: "debug" }),
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
 * @param {number} ms
 */
function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
