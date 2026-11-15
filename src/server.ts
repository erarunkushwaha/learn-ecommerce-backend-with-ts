import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { pathToFileURL } from "node:url";
import { MYSQL_UNAVAILABLE_MESSAGE } from "./common/errors/app-error.js";
import { createApp, type ReadyCheck } from "./app.js";
import { loadConfig } from "./config/env.js";
import { createLogger, type LogFields, type Logger } from "./config/logger.js";
import { closeSequelize, getSequelize, probeMysql } from "./database/sequelize.js";

export const LISTEN_HOST = "127.0.0.1";

/**
 * How long `drainServer` waits for in-flight responses before it destroys
 * the remaining sockets. Idle keep-alive connections are closed immediately.
 */
export const SHUTDOWN_DRAIN_MS = 10_000;

const PORT_ERROR = "PORT must be an integer from 0 through 65535";

export type StartServerOptions = {
  /**
   * Passed through to `GET /api/v1/ready`. The process entry passes `probeMysql`.
   * An explicit port used by tests can omit it.
   */
  checkReady?: ReadyCheck;
};

/**
 * Listen on the loopback interface.
 * Pass `0` to let the operating system choose a free port.
 * An omitted port loads the Zod config and uses `config.port`.
 * An explicit port is the test seam: it checks that number only and does
 * not create the Sequelize pool. The process entry probes MySQL before it
 * calls this function.
 * `logger` is the access log and the listen line. When it is omitted, an
 * omitted port uses `config.logLevel` and an explicit port uses `info`.
 */
export function startServer(
  port?: number,
  logger?: Logger,
  options: StartServerOptions = {},
): Promise<Server> {
  return new Promise((resolve, reject) => {
    let listenPort: number;
    let appLogger: Logger;
    try {
      if (port === undefined) {
        const config = loadConfig(process.env);
        listenPort = config.port;
        appLogger = logger ?? createLogger({ level: config.logLevel });
      } else {
        listenPort = port;
        appLogger = logger ?? createLogger();
      }
      assertListenPort(listenPort);
    } catch (error) {
      reject(error instanceof Error ? error : new Error("Server failed to start"));
      return;
    }

    const server = createServer(
      createApp({ logger: appLogger, checkReady: options.checkReady }),
    );
    const onError = (error: Error): void => {
      // A failed bind may not be listening. Always surface the listen error.
      server.close(() => {
        reject(error);
      });
    };
    server.once("error", onError);
    server.listen(listenPort, LISTEN_HOST, () => {
      server.off("error", onError);
      const url = listeningUrl(server);
      appLogger.info(`ecom-backend listening on ${url}`, { url });
      resolve(server);
    });
  });
}

/**
 * Close the listener and existing sockets.
 * This is a hard stop for tests. It does not wait for a handler to finish.
 * SIGINT and SIGTERM use `drainServer` instead.
 */
export function stopServer(server: Server): Promise<void> {
  if (!server.listening) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
    server.closeAllConnections();
  });
}

/**
 * Stop accepting connections and wait until current responses finish.
 * Idle keep-alive sockets are closed immediately, and again while draining,
 * because a request that finishes after the first sweep would otherwise hold
 * the process until Node's keep-alive timeout. A request still running when
 * `timeoutMs` elapses is destroyed.
 */
export function drainServer(server: Server, timeoutMs = SHUTDOWN_DRAIN_MS): Promise<void> {
  if (!server.listening) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const idleSweep = setInterval(() => {
      server.closeIdleConnections();
    }, 50);
    const force = setTimeout(() => {
      server.closeAllConnections();
    }, timeoutMs);
    server.close((error) => {
      clearInterval(idleSweep);
      clearTimeout(force);
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
    server.closeIdleConnections();
  });
}

export function listeningUrl(server: Server): string {
  const address = server.address();
  if (!isTcpAddress(address)) {
    throw new Error("HTTP server is not listening on a TCP port");
  }
  return `http://${address.address}:${address.port}`;
}

function assertListenPort(port: number): void {
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(PORT_ERROR);
  }
}

function isTcpAddress(address: string | AddressInfo | null): address is AddressInfo {
  return address !== null && typeof address !== "string";
}

const invokedPath = process.argv[1];

if (
  invokedPath !== undefined &&
  import.meta.url === pathToFileURL(invokedPath).href
) {
  startProcess().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Server failed to start";
    console.error(message);
    process.exitCode = 1;
  });
}

/**
 * Probe MySQL, then listen. A refused database exits before `listen`.
 * Redis is validated by `loadConfig` and is not probed. Migrations stay a
 * separate command. SIGINT and SIGTERM drain HTTP, then the pool.
 */
async function startProcess(): Promise<void> {
  const config = loadConfig(process.env);
  const logger = createLogger({ level: config.logLevel });
  const sequelize = getSequelize();
  try {
    await probeMysql(sequelize);
  } catch (error) {
    logger.error("mysql is unavailable", failureFields(error));
    await closePool(logger);
    throw new Error(MYSQL_UNAVAILABLE_MESSAGE);
  }

  let server: Server;
  try {
    server = await startServer(undefined, logger, {
      checkReady: () => probeMysql(sequelize),
    });
  } catch (error) {
    await closePool(logger);
    throw error;
  }
  installShutdown(server, logger);
}

/**
 * Drain the listener, then the pool. A second signal does not start another
 * drain. Handlers are installed only after listen, and only in this entry,
 * so an in-process `startServer(port)` does not catch the test runner's signals.
 */
function installShutdown(server: Server, logger: Logger): void {
  let shuttingDown = false;
  const onSignal = (signal: NodeJS.Signals): void => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    logger.info("shutdown started", { signal });
    drainServer(server)
      .then(() => closeSequelize())
      .then(() => {
        logger.info("shutdown finished", { signal });
      })
      .catch((error: unknown) => {
        logger.error("shutdown failed", failureFields(error));
        process.exitCode = 1;
      });
  };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);
}

async function closePool(logger: Logger): Promise<void> {
  try {
    await closeSequelize();
  } catch (error) {
    logger.error("mysql pool close failed", failureFields(error));
  }
}

function failureFields(error: unknown): LogFields {
  if (error instanceof Error) {
    return {
      errorName: error.name,
      errorMessage: error.message,
      stack: error.stack ?? "",
    };
  }
  return {
    errorName: "NonError",
    errorMessage: "Non-error rejection",
  };
}
