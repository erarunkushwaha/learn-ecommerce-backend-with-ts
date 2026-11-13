import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { pathToFileURL } from "node:url";
import { createApp } from "./app.js";
import { loadConfig } from "./config/env.js";
import { createLogger, type Logger } from "./config/logger.js";

export const LISTEN_HOST = "127.0.0.1";

const PORT_ERROR = "PORT must be an integer from 0 through 65535";

/**
 * Listen on the loopback interface.
 * Pass `0` to let the operating system choose a free port.
 * An omitted port loads the Zod config and uses `config.port`.
 * An explicit port is the test seam: it checks that number only.
 * `logger` is the access log and the listen line. When it is omitted, an
 * omitted port uses `config.logLevel` and an explicit port uses `info`.
 */
export function startServer(port?: number, logger?: Logger): Promise<Server> {
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

    const server = createServer(createApp({ logger: appLogger }));
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
 * This is a hard stop for tests and local shutdown. Draining in-flight
 * requests on SIGINT/SIGTERM is a later task.
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
  startServer().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Server failed to start";
    console.error(message);
    process.exitCode = 1;
  });
}
