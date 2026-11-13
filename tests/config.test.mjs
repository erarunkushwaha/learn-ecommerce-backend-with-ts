import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { loadConfig, readMysqlSettings, readRedisSettings } from "../dist/config/env.js";

const REQUIRED = {
  MYSQL_DATABASE: "ecom",
  MYSQL_USER: "ecom",
  MYSQL_PASSWORD: "local-only",
  REDIS_PASSWORD: "local-only",
};

test("loadConfig applies the host-side defaults", () => {
  const config = loadConfig(REQUIRED);

  assert.equal(config.port, 3000);
  assert.equal(config.logLevel, "info");
  assert.deepEqual(config.mysql, {
    host: "127.0.0.1",
    port: 3307,
    database: "ecom",
    user: "ecom",
    password: "local-only",
  });
  assert.deepEqual(config.redis, {
    host: "127.0.0.1",
    port: 6379,
    password: "local-only",
  });
});

test("empty PORT and host values use defaults, and PORT 0 stays available", () => {
  const config = loadConfig({
    ...REQUIRED,
    PORT: "",
    MYSQL_HOST: "",
    REDIS_HOST: "",
  });

  assert.equal(config.port, 3000);
  assert.equal(config.mysql.host, "127.0.0.1");
  assert.equal(config.redis.host, "127.0.0.1");
  assert.equal(loadConfig({ ...REQUIRED, PORT: "0" }).port, 0);
  assert.equal(loadConfig({ ...REQUIRED, PORT: "65535" }).port, 65535);
  assert.throws(
    () => loadConfig({ ...REQUIRED, PORT: "65536" }),
    /PORT must be an integer from 0 through 65535/,
  );
});

test("a container MySQL address is a valid host mapping", () => {
  const config = loadConfig({
    ...REQUIRED,
    MYSQL_HOST: "mysql",
    MYSQL_PORT: "3306",
  });

  assert.equal(config.mysql.host, "mysql");
  assert.equal(config.mysql.port, 3306);
});

test("loadConfig reports every broken field and omits secret values", () => {
  const password = "super-secret-redis-value";
  assert.throws(
    () =>
      loadConfig({
        PORT: "nope",
        MYSQL_PORT: "0",
        REDIS_PASSWORD: password,
      }),
    (error) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /PORT must be an integer from 0 through 65535/);
      assert.match(error.message, /MYSQL_PORT must be an integer from 1 through 65535/);
      assert.match(error.message, /MYSQL_DATABASE is required/);
      assert.match(error.message, /MYSQL_USER is required/);
      assert.match(error.message, /MYSQL_PASSWORD is required/);
      assert.equal(error.message.includes(password), false);
      return true;
    },
  );
});

test("LOG_LEVEL defaults to info and rejects an unknown name", () => {
  assert.equal(loadConfig({ ...REQUIRED, LOG_LEVEL: "" }).logLevel, "info");
  assert.equal(loadConfig({ ...REQUIRED, LOG_LEVEL: "error" }).logLevel, "error");
  assert.throws(
    () => loadConfig({ ...REQUIRED, LOG_LEVEL: "verbose" }),
    /LOG_LEVEL must be debug, info, warn, or error/,
  );
  assert.throws(
    () => loadConfig({ ...REQUIRED, LOG_LEVEL: "warn\nsuper-secret" }),
    (error) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /LOG_LEVEL must be debug, info, warn, or error/);
      assert.equal(error.message.includes("super-secret"), false);
      assert.equal(error.message.includes("\n"), false);
      return true;
    },
  );
});

test("MYSQL_ROOT_PASSWORD is not part of the application config", () => {
  const config = loadConfig({
    ...REQUIRED,
    MYSQL_ROOT_PASSWORD: "root-secret",
    PATH: "/usr/bin",
  });

  assert.equal(JSON.stringify(config).includes("root-secret"), false);
  assert.equal(Object.hasOwn(config, "MYSQL_ROOT_PASSWORD"), false);
});

test("MySQL settings default to the Compose host port", () => {
  const settings = readMysqlSettings({
    MYSQL_DATABASE: "ecom",
    MYSQL_USER: "ecom",
    MYSQL_PASSWORD: "local-only",
  });

  assert.equal(settings.host, "127.0.0.1");
  assert.equal(settings.port, 3307);
  assert.equal(settings.database, "ecom");
  assert.equal(settings.user, "ecom");
  assert.equal(settings.password, "local-only");
});

test("MySQL settings reject a missing password and an invalid port", () => {
  assert.throws(
    () =>
      readMysqlSettings({
        MYSQL_DATABASE: "ecom",
        MYSQL_USER: "ecom",
      }),
    /MYSQL_PASSWORD is required/,
  );
  assert.throws(
    () =>
      readMysqlSettings({
        MYSQL_DATABASE: "ecom",
        MYSQL_USER: "ecom",
        MYSQL_PASSWORD: "",
        MYSQL_PORT: "3306abc",
      }),
    (error) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /MYSQL_PASSWORD is required/);
      assert.match(error.message, /MYSQL_PORT must be an integer from 1 through 65535/);
      return true;
    },
  );
});

test("Redis settings require a password and default the host port", () => {
  assert.throws(() => readRedisSettings({}), /REDIS_PASSWORD is required/);
  assert.throws(
    () => readRedisSettings({ REDIS_PASSWORD: "local-only", REDIS_PORT: "0" }),
    /REDIS_PORT must be an integer from 1 through 65535/,
  );

  const settings = readRedisSettings({ REDIS_PASSWORD: "local-only" });
  assert.equal(settings.host, "127.0.0.1");
  assert.equal(settings.port, 6379);
  assert.equal(settings.password, "local-only");
});

test("the HTTP entry imports config and does not import the database client", async () => {
  const source = await readFile(new URL("../src/server.ts", import.meta.url), "utf8");
  assert.match(source, /from "\.\/config\/env\.js"/);
  assert.equal(source.includes("mysql2"), false);
  assert.equal(source.includes("data-stores"), false);
});
