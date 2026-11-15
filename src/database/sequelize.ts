import { Sequelize, type Options } from "sequelize";
import { loadConfig, type Env, type MysqlSettings } from "../config/env.js";
import { createLogger, type Logger } from "../config/logger.js";

/**
 * One MySQL pool for this process.
 * `getSequelize` calls `loadConfig` itself and keeps the instance in module
 * scope. Construction does not open a socket: `min` is 0, and Sequelize
 * acquires a connection on the first query. There are no models and no
 * `sync()`. This module does not run migrations. `probeMysql` is the
 * readiness query. The HTTP process calls it before listen and on
 * `GET /api/v1/ready`.
 * The host and port come from config. The host default is `127.0.0.1:3307`,
 * which is Compose. Port `3306` is not selected here.
 */

export const SEQUELIZE_POOL = {
  max: 5,
  min: 0,
  acquire: 10_000,
  idle: 10_000,
} as const;

const CONNECT_TIMEOUT_MS = 5_000;

/**
 * Sequelize interpolates this into `SET time_zone`. It is a constant, not
 * an environment value, so that statement cannot carry a quote from config.
 */
const SESSION_TIME_ZONE = "+00:00";

let cached: Sequelize | undefined;

/**
 * Build a pool from settings that were already parsed.
 * Callers that want the process instance use `getSequelize`.
 * `logging` is off unless `logger.level` is `debug`. Debug lines contain the
 * SQL text and not bind parameters (`logQueryParameters` is false).
 */
export function createSequelize(mysql: MysqlSettings, logger?: Logger): Sequelize {
  const options: Options = {
    host: mysql.host,
    port: mysql.port,
    dialect: "mysql",
    timezone: SESSION_TIME_ZONE,
    pool: { ...SEQUELIZE_POOL },
    logging: sqlLogger(logger),
    logQueryParameters: false,
    dialectOptions: {
      charset: "utf8mb4",
      connectTimeout: CONNECT_TIMEOUT_MS,
    },
  };
  return new Sequelize(mysql.database, mysql.user, mysql.password, options);
}

/**
 * Return the process pool, creating it from `env` on the first call.
 * A later call returns that same instance and ignores `env`.
 * `closeSequelize` drops it. Construction is synchronous, so two calls in
 * one turn cannot both miss the cache.
 */
export function getSequelize(env: Env = process.env): Sequelize {
  if (cached !== undefined) {
    return cached;
  }
  const config = loadConfig(env);
  const created = createSequelize(config.mysql, createLogger({ level: config.logLevel }));
  cached = created;
  return created;
}

/**
 * Borrow one connection and run Sequelize's authenticate query,
 * `SELECT 1+1 AS result`. Pool construction does not do this.
 * The rejection is the driver error. HTTP callers replace it with a safe message.
 */
export async function probeMysql(sequelize: Sequelize): Promise<void> {
  await sequelize.authenticate();
}

/**
 * Drain the process pool and allow a later `getSequelize` to build another.
 * The cache is cleared before `close` resolves. A call that arrives during
 * close receives a new instance. The process entry calls this after a failed
 * startup probe, after a failed listen, and after the HTTP drain on
 * SIGINT and SIGTERM.
 */
export async function closeSequelize(): Promise<void> {
  const current = cached;
  if (current === undefined) {
    return;
  }
  cached = undefined;
  await current.close();
}

function sqlLogger(logger: Logger | undefined): false | ((sql: string) => void) {
  if (logger === undefined || logger.level !== "debug") {
    return false;
  }
  return (sql: string) => {
    logger.debug("sql", { statement: sql });
  };
}
