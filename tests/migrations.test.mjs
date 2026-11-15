import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parseEnv } from "node:util";
import { Writable } from "node:stream";
import mysql from "mysql2/promise";
import { loadConfig } from "../dist/config/env.js";
import { createLogger } from "../dist/config/logger.js";
import {
  BASELINE_CREATED_AT,
  BASELINE_LABEL,
  BASELINE_TABLE,
} from "../dist/database/baseline.js";
import { parseSchemaCommand, runSchemaCommand } from "../dist/database/cli.js";
import { MIGRATION_HISTORY_TABLE, SEEDER_HISTORY_TABLE } from "../dist/database/migrator.js";

const DISPOSABLE_DATABASE = "ecom_test";

test("schema commands reject unknown argv and do not call sync", async () => {
  assert.equal(parseSchemaCommand(["migrate"]), "migrate");
  assert.equal(parseSchemaCommand(["migrate:undo"]), "migrate:undo");
  assert.equal(parseSchemaCommand(["seed"]), "seed");
  assert.equal(parseSchemaCommand(["seed:undo"]), "seed:undo");
  assert.throws(() => parseSchemaCommand([]), /Usage:/);
  assert.throws(() => parseSchemaCommand(["migrate", "ecom"]), /Usage:/);
  assert.throws(() => parseSchemaCommand(["sync"]), /Usage:/);

  const files = [
    "../src/database/migrator.ts",
    "../src/database/cli.ts",
    "../src/database/sequelize.ts",
    "../src/database/migrations/20261115140000-baseline.ts",
    "../src/database/seeders/20261115140000-baseline-seed.ts",
    "../src/server.ts",
  ];
  for (const file of files) {
    const source = await readFile(new URL(file, import.meta.url), "utf8");
    assert.equal(source.includes(".sync("), false, file);
    assert.equal(source.includes("force: true"), false, file);
    assert.equal(source.includes("force:true"), false, file);
    assert.equal(source.includes("MYSQL_ROOT_PASSWORD"), false, file);
  }

  const cli = await readFile(new URL("../src/database/cli.ts", import.meta.url), "utf8");
  assert.match(cli, /readMysqlSettings/);
  assert.match(cli, /createSequelize/);
  assert.equal(cli.includes("getSequelize"), false);

  const server = await readFile(new URL("../src/server.ts", import.meta.url), "utf8");
  assert.equal(server.includes("database/migrator.js"), false);
  assert.equal(server.includes("database/cli.js"), false);
});

test("the baseline migration creates and rolls back on a disposable database", { timeout: 30_000 }, async () => {
  const envFile = parseEnv(await readFile(new URL("../.env", import.meta.url), "utf8"));
  const config = loadConfig(envFile);
  assert.equal(config.mysql.host, "127.0.0.1");
  assert.equal(config.mysql.port, 3307);
  const rootPassword = envFile.MYSQL_ROOT_PASSWORD;
  assert.equal(typeof rootPassword, "string");
  assert.ok(rootPassword !== undefined && rootPassword.length > 0);

  const before = await tableNames(config.mysql, config.mysql.database);
  const logs = captureLogs();
  const testEnv = { ...envFile, MYSQL_DATABASE: DISPOSABLE_DATABASE };

  try {
    await withDisposableDatabase(config.mysql, rootPassword, async () => {
      await runSchemaCommand("migrate", testEnv, logs.logger);
      await runSchemaCommand("migrate", testEnv, logs.logger);
      let names = await historyNames(config.mysql, MIGRATION_HISTORY_TABLE);
      assert.deepEqual(names, ["20261115140000-baseline.js"]);
      assert.deepEqual(await tableNames(config.mysql, DISPOSABLE_DATABASE), [
        MIGRATION_HISTORY_TABLE,
        BASELINE_TABLE,
      ]);
      await assertBaselineShape(config.mysql);
      assert.deepEqual(await baselineRows(config.mysql), []);

      await runSchemaCommand("seed", testEnv, logs.logger);
      await runSchemaCommand("seed", testEnv, logs.logger);
      names = await historyNames(config.mysql, SEEDER_HISTORY_TABLE);
      assert.deepEqual(names, ["20261115140000-baseline-seed.js"]);
      assert.deepEqual(await baselineRows(config.mysql), [
        { label: BASELINE_LABEL, createdAt: BASELINE_CREATED_AT },
      ]);
      assert.deepEqual(await tableNames(config.mysql, DISPOSABLE_DATABASE), [
        SEEDER_HISTORY_TABLE,
        MIGRATION_HISTORY_TABLE,
        BASELINE_TABLE,
      ]);

      await runSchemaCommand("seed:undo", testEnv, logs.logger);
      assert.deepEqual(await historyNames(config.mysql, SEEDER_HISTORY_TABLE), []);
      assert.deepEqual(await baselineRows(config.mysql), []);
      assert.ok((await tableNames(config.mysql, DISPOSABLE_DATABASE)).includes(BASELINE_TABLE));

      await runSchemaCommand("migrate:undo", testEnv, logs.logger);
      assert.deepEqual(await historyNames(config.mysql, MIGRATION_HISTORY_TABLE), []);
      assert.deepEqual(await tableNames(config.mysql, DISPOSABLE_DATABASE), [
        SEEDER_HISTORY_TABLE,
        MIGRATION_HISTORY_TABLE,
      ]);

      await assert.rejects(
        () => runSchemaCommand("seed", testEnv, logs.logger),
        (error) => {
          assert.ok(error instanceof Error);
          assert.equal(error.message.includes(config.mysql.password), false);
          assert.equal(error.message.includes(rootPassword), false);
          return true;
        },
      );
      assert.equal(
        (await tableNames(config.mysql, DISPOSABLE_DATABASE)).includes(BASELINE_TABLE),
        false,
      );

      await runSchemaCommand("migrate", testEnv, logs.logger);
      await runSchemaCommand("seed", testEnv, logs.logger);
      assert.deepEqual(await baselineRows(config.mysql), [
        { label: BASELINE_LABEL, createdAt: BASELINE_CREATED_AT },
      ]);
      const current = await scalar(
        config.mysql,
        DISPOSABLE_DATABASE,
        "SELECT DATABASE() AS db",
      );
      assert.equal(current, DISPOSABLE_DATABASE);
    });
  } finally {
    const after = await tableNames(config.mysql, config.mysql.database);
    assert.deepEqual(after, before);
  }

  const text = logs.text();
  assert.match(text, /"message":"migrations applied"/);
  assert.match(text, /20261115140000-baseline\.js/);
  assert.match(text, /"message":"migrations reverted"/);
  assert.match(text, /"message":"seeders applied"/);
  assert.match(text, /20261115140000-baseline-seed\.js/);
  assert.equal(text.includes(config.mysql.password), false);
  assert.equal(text.includes(rootPassword), false);
});

/**
 * @param {import("../dist/config/env.js").MysqlSettings} mysqlSettings
 * @param {string} rootPassword
 * @param {() => Promise<void>} fn
 */
async function withDisposableDatabase(mysqlSettings, rootPassword, fn) {
  assertDisposable(DISPOSABLE_DATABASE);
  const root = await mysql.createConnection({
    host: mysqlSettings.host,
    port: mysqlSettings.port,
    user: "root",
    password: rootPassword,
    multipleStatements: false,
  });
  let granted = false;
  try {
    await root.query("DROP DATABASE IF EXISTS ??", [DISPOSABLE_DATABASE]);
    await root.query(
      "CREATE DATABASE ?? CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci",
      [DISPOSABLE_DATABASE],
    );
    await root.query("GRANT ALL PRIVILEGES ON ??.* TO ??@?", [
      DISPOSABLE_DATABASE,
      mysqlSettings.user,
      "%",
    ]);
    granted = true;
    await fn();
  } finally {
    if (granted) {
      await root.query("REVOKE ALL PRIVILEGES ON ??.* FROM ??@?", [
        DISPOSABLE_DATABASE,
        mysqlSettings.user,
        "%",
      ]);
    }
    await root.query("DROP DATABASE IF EXISTS ??", [DISPOSABLE_DATABASE]);
    await root.end();
  }
}

/** @param {string} name */
function assertDisposable(name) {
  if (name !== "ecom_test") {
    throw new Error("Refusing to create or drop this database");
  }
}

/**
 * @param {import("../dist/config/env.js").MysqlSettings} mysqlSettings
 * @param {string} database
 */
async function tableNames(mysqlSettings, database) {
  const rows = await select(
    mysqlSettings,
    database,
    "SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME",
    [database],
  );
  return rows
    .map((row) => {
      assert.equal(typeof row.name, "string");
      return row.name;
    })
    .sort();
}

/**
 * @param {import("../dist/config/env.js").MysqlSettings} mysqlSettings
 * @param {string} table
 */
async function historyNames(mysqlSettings, table) {
  const sql =
    table === MIGRATION_HISTORY_TABLE
      ? "SELECT name FROM SequelizeMeta ORDER BY name ASC"
      : table === SEEDER_HISTORY_TABLE
        ? "SELECT name FROM SequelizeData ORDER BY name ASC"
        : undefined;
  if (sql === undefined) {
    throw new Error("Refusing to read this history table");
  }
  const listed = await select(mysqlSettings, DISPOSABLE_DATABASE, sql, []);
  return listed.map((row) => {
    assert.equal(typeof row.name, "string");
    return row.name;
  });
}

/**
 * @param {import("../dist/config/env.js").MysqlSettings} mysqlSettings
 */
async function assertBaselineShape(mysqlSettings) {
  const tables = await select(
    mysqlSettings,
    DISPOSABLE_DATABASE,
    "SELECT ENGINE AS engine, TABLE_COLLATION AS collation FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?",
    [DISPOSABLE_DATABASE, BASELINE_TABLE],
  );
  assert.equal(tables.length, 1);
  assert.equal(tables[0].engine, "InnoDB");
  assert.equal(tables[0].collation, "utf8mb4_0900_ai_ci");

  const columns = await select(
    mysqlSettings,
    DISPOSABLE_DATABASE,
    "SELECT COLUMN_NAME AS name, COLUMN_TYPE AS columnType, IS_NULLABLE AS nullable, COLUMN_KEY AS columnKey, EXTRA AS extra FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION",
    [DISPOSABLE_DATABASE, BASELINE_TABLE],
  );
  assert.deepEqual(columns, [
    {
      name: "id",
      columnType: "bigint unsigned",
      nullable: "NO",
      columnKey: "PRI",
      extra: "auto_increment",
    },
    {
      name: "label",
      columnType: "varchar(32)",
      nullable: "NO",
      columnKey: "UNI",
      extra: "",
    },
    {
      name: "created_at",
      columnType: "datetime(3)",
      nullable: "NO",
      columnKey: "",
      extra: "",
    },
  ]);

  const history = await select(
    mysqlSettings,
    DISPOSABLE_DATABASE,
    "SELECT TABLE_NAME AS name, ENGINE AS engine, TABLE_COLLATION AS collation FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?",
    [DISPOSABLE_DATABASE, MIGRATION_HISTORY_TABLE],
  );
  assert.equal(history.length, 1);
  assert.equal(history[0].engine, "InnoDB");
  assert.equal(history[0].collation, "utf8mb4_0900_ai_ci");
}

/**
 * @param {import("../dist/config/env.js").MysqlSettings} mysqlSettings
 */
async function baselineRows(mysqlSettings) {
  const rows = await select(
    mysqlSettings,
    DISPOSABLE_DATABASE,
    "SELECT label, CAST(created_at AS CHAR) AS createdAt FROM schema_baseline ORDER BY label",
    [],
  );
  return rows.map((row) => {
    assert.equal(typeof row.label, "string");
    assert.equal(typeof row.createdAt, "string");
    return { label: row.label, createdAt: row.createdAt };
  });
}

/**
 * @param {import("../dist/config/env.js").MysqlSettings} mysqlSettings
 * @param {string} database
 * @param {string} sql
 */
async function scalar(mysqlSettings, database, sql) {
  const rows = await select(mysqlSettings, database, sql, []);
  assert.equal(rows.length, 1);
  const row = rows[0];
  assert.ok(row !== undefined);
  const value = row.db;
  assert.equal(typeof value, "string");
  return value;
}

/**
 * @param {import("../dist/config/env.js").MysqlSettings} mysqlSettings
 * @param {string} database
 * @param {string} sql
 * @param {string[]} values
 */
async function select(mysqlSettings, database, sql, values) {
  if (database !== DISPOSABLE_DATABASE && database !== mysqlSettings.database) {
    throw new Error("Refusing to query this database");
  }
  const connection = await mysql.createConnection({
    host: mysqlSettings.host,
    port: mysqlSettings.port,
    user: mysqlSettings.user,
    password: mysqlSettings.password,
    database,
    multipleStatements: false,
  });
  try {
    const [rows] = await connection.query(sql, values);
    assert.ok(Array.isArray(rows));
    return rows.map((row) => {
      assert.ok(row !== null && typeof row === "object");
      return /** @type {Record<string, unknown>} */ (row);
    });
  } finally {
    await connection.end();
  }
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
    logger: createLogger({ destination: stream, errorDestination: stream, level: "info" }),
    text() {
      return chunks.join("");
    },
  };
}
