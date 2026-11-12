import net from "node:net";
import mysql from "mysql2/promise";
import type { MysqlSettings, RedisSettings } from "./env.js";

/**
 * One-shot pings for the Compose MySQL and Redis services.
 * Settings are parsed in `env.ts`. This file does not choose defaults.
 * The HTTP server does not import this module.
 * F06 adds the Sequelize pool. Cache and job clients stay in later tasks.
 */

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

function encodeCommand(...parts: string[]): string {
  const lines = [`*${parts.length}`];
  for (const part of parts) {
    lines.push(`$${Buffer.byteLength(part)}`);
    lines.push(part);
  }
  return `${lines.join("\r\n")}\r\n`;
}
