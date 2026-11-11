import net from "node:net";
import mysql from "mysql2/promise";

/**
 * Host-side addresses for the Compose MySQL and Redis services.
 * The HTTP server does not open these connections.
 * F06 adds the Sequelize pool. Cache and job clients stay in later tasks.
 */

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

type Env = Record<string, string | undefined>;

const MYSQL_HOST_DEFAULT = "127.0.0.1";
const MYSQL_PORT_DEFAULT = 3307;
const REDIS_HOST_DEFAULT = "127.0.0.1";
const REDIS_PORT_DEFAULT = 6379;
const PORT_ERROR = "must be an integer from 1 through 65535";

export function readMysqlSettings(env: Env): MysqlSettings {
  return {
    host: readDefault(env, "MYSQL_HOST", MYSQL_HOST_DEFAULT),
    port: readPort(env, "MYSQL_PORT", MYSQL_PORT_DEFAULT),
    database: readRequired(env, "MYSQL_DATABASE"),
    user: readRequired(env, "MYSQL_USER"),
    password: readRequired(env, "MYSQL_PASSWORD"),
  };
}

export function readRedisSettings(env: Env): RedisSettings {
  return {
    host: readDefault(env, "REDIS_HOST", REDIS_HOST_DEFAULT),
    port: readPort(env, "REDIS_PORT", REDIS_PORT_DEFAULT),
    password: readRequired(env, "REDIS_PASSWORD"),
  };
}

/** Open one MySQL connection, run `SELECT 1`, and close it. */
export async function checkMysqlConnection(settings: MysqlSettings): Promise<void> {
  if (settings.password === "") {
    throw new Error("MYSQL_PASSWORD is required");
  }

  const connection = await mysql.createConnection({
    host: settings.host,
    port: settings.port,
    user: settings.user,
    password: settings.password,
    database: settings.database,
    connectTimeout: 5000,
  });

  try {
    await connection.query("SELECT 1 AS ok");
  } finally {
    await connection.end();
  }
}

/** Send AUTH and PING. This does not store keys or start a worker. */
export function checkRedisConnection(
  settings: RedisSettings,
  timeoutMs = 5000,
): Promise<void> {
  if (settings.password === "") {
    return Promise.reject(new Error("REDIS_PASSWORD is required"));
  }

  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: settings.host, port: settings.port });
    const chunks: Buffer[] = [];
    let settled = false;

    const finish = (error?: Error): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      if (error) {
        reject(error);
        return;
      }
      resolve();
    };

    const timer = setTimeout(() => {
      finish(new Error("Redis ping timed out"));
    }, timeoutMs);

    socket.on("error", (error: Error) => {
      finish(error);
    });

    socket.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
      const text = Buffer.concat(chunks).toString("utf8");
      if (text.includes("+PONG")) {
        finish();
        return;
      }
      const failure = text
        .split("\r\n")
        .find((line) => line.startsWith("-"));
      if (failure !== undefined) {
        finish(new Error(`Redis rejected the ping: ${failure}`));
      }
    });

    socket.on("connect", () => {
      socket.write(encodeCommand("AUTH", settings.password));
      socket.write(encodeCommand("PING"));
    });
  });
}

function readDefault(env: Env, name: string, fallback: string): string {
  const value = env[name];
  if (value === undefined || value === "") {
    return fallback;
  }
  return value;
}

function readRequired(env: Env, name: string): string {
  const value = env[name];
  if (value === undefined || value === "") {
    throw new Error(`${name} is required`);
  }
  return value;
}

function readPort(env: Env, name: string, fallback: number): number {
  const value = env[name];
  if (value === undefined || value === "") {
    return fallback;
  }
  if (!/^\d{1,5}$/.test(value)) {
    throw new Error(`${name} ${PORT_ERROR}`);
  }
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${name} ${PORT_ERROR}`);
  }
  return port;
}

function encodeCommand(...parts: string[]): string {
  const lines = [`*${parts.length}`];
  for (const part of parts) {
    lines.push(`$${Buffer.byteLength(part)}`);
    lines.push(part);
  }
  return `${lines.join("\r\n")}\r\n`;
}
