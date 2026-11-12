import { z } from "zod";

/**
 * Validated process environment.
 * Pass `process.env` or a test object. Importing this module does not read
 * the environment and does not open MySQL or Redis.
 * `MYSQL_ROOT_PASSWORD` belongs to Compose and is intentionally absent here.
 */

export type Env = Record<string, string | undefined>;

export type MysqlSettings = {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
};

export type RedisSettings = {
  host: string;
  port: number;
  password: string;
};

export type AppConfig = {
  port: number;
  mysql: MysqlSettings;
  redis: RedisSettings;
};

const DEFAULT_PORT = 3000;
const DEFAULT_MYSQL_HOST = "127.0.0.1";
const DEFAULT_MYSQL_PORT = 3307;
const DEFAULT_REDIS_HOST = "127.0.0.1";
const DEFAULT_REDIS_PORT = 6379;

/**
 * Accept an unsigned decimal string in range.
 * An empty or missing value becomes `fallback`. `min` is 0 only for `PORT`,
 * because port 0 asks the OS for a free port. Service ports start at 1.
 */
function integerPort(name: string, fallback: number, min: number) {
  const message = `${name} must be an integer from ${min} through 65535`;
  return z.preprocess(
    (value: unknown) => (value === undefined || value === "" ? String(fallback) : value),
    z
      .string(message)
      .regex(/^\d{1,5}$/, message)
      .transform((value) => Number(value))
      .refine((value) => Number.isInteger(value) && value >= min && value <= 65535, message),
  );
}

/** A missing or empty value is a configuration error. Values are not trimmed. */
function requiredText(name: string) {
  const message = `${name} is required`;
  return z.preprocess(
    (value: unknown) => (value === undefined || value === "" ? undefined : value),
    z.string(message),
  );
}

function textWithDefault(name: string, fallback: string) {
  const message = `${name} must be a string`;
  return z.preprocess(
    (value: unknown) => (value === undefined || value === "" ? fallback : value),
    z.string(message),
  );
}

const fields = {
  PORT: integerPort("PORT", DEFAULT_PORT, 0),
  MYSQL_HOST: textWithDefault("MYSQL_HOST", DEFAULT_MYSQL_HOST),
  MYSQL_PORT: integerPort("MYSQL_PORT", DEFAULT_MYSQL_PORT, 1),
  MYSQL_DATABASE: requiredText("MYSQL_DATABASE"),
  MYSQL_USER: requiredText("MYSQL_USER"),
  MYSQL_PASSWORD: requiredText("MYSQL_PASSWORD"),
  REDIS_HOST: textWithDefault("REDIS_HOST", DEFAULT_REDIS_HOST),
  REDIS_PORT: integerPort("REDIS_PORT", DEFAULT_REDIS_PORT, 1),
  REDIS_PASSWORD: requiredText("REDIS_PASSWORD"),
};

const appEnvSchema = z.object(fields);

const mysqlEnvSchema = z.object({
  MYSQL_HOST: fields.MYSQL_HOST,
  MYSQL_PORT: fields.MYSQL_PORT,
  MYSQL_DATABASE: fields.MYSQL_DATABASE,
  MYSQL_USER: fields.MYSQL_USER,
  MYSQL_PASSWORD: fields.MYSQL_PASSWORD,
});

const redisEnvSchema = z.object({
  REDIS_HOST: fields.REDIS_HOST,
  REDIS_PORT: fields.REDIS_PORT,
  REDIS_PASSWORD: fields.REDIS_PASSWORD,
});

/** Parse the full application contract: listen port plus both data stores. */
export function loadConfig(env: Env): AppConfig {
  const parsed = parseSchema(appEnvSchema, env);
  return {
    port: parsed.PORT,
    mysql: toMysqlSettings(parsed),
    redis: toRedisSettings(parsed),
  };
}

/** Parse the MySQL settings used by the one-shot connectivity check. */
export function readMysqlSettings(env: Env): MysqlSettings {
  return toMysqlSettings(parseSchema(mysqlEnvSchema, env));
}

/** Parse the Redis settings used by the one-shot connectivity check. */
export function readRedisSettings(env: Env): RedisSettings {
  return toRedisSettings(parseSchema(redisEnvSchema, env));
}

function toMysqlSettings(parsed: {
  MYSQL_HOST: string;
  MYSQL_PORT: number;
  MYSQL_DATABASE: string;
  MYSQL_USER: string;
  MYSQL_PASSWORD: string;
}): MysqlSettings {
  return {
    host: parsed.MYSQL_HOST,
    port: parsed.MYSQL_PORT,
    database: parsed.MYSQL_DATABASE,
    user: parsed.MYSQL_USER,
    password: parsed.MYSQL_PASSWORD,
  };
}

function toRedisSettings(parsed: {
  REDIS_HOST: string;
  REDIS_PORT: number;
  REDIS_PASSWORD: string;
}): RedisSettings {
  return {
    host: parsed.REDIS_HOST,
    port: parsed.REDIS_PORT,
    password: parsed.REDIS_PASSWORD,
  };
}

function parseSchema<Schema extends z.ZodType>(schema: Schema, env: Env): z.output<Schema> {
  const result = schema.safeParse(env);
  if (!result.success) {
    throw environmentError(result.error.issues);
  }
  return result.data;
}

function environmentError(issues: readonly { message: string }[]): Error {
  const lines: string[] = [];
  const seen = new Set<string>();
  for (const issue of issues) {
    if (seen.has(issue.message)) {
      continue;
    }
    seen.add(issue.message);
    lines.push(issue.message);
  }
  if (lines.length === 0) {
    return new Error("Invalid environment");
  }
  return new Error(lines.join("\n"));
}
