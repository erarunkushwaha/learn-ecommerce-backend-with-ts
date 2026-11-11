import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { pathToFileURL } from "node:url";
import { createApp } from "./app.js";

export const DEFAULT_PORT = 3000;
export const LISTEN_HOST = "127.0.0.1";

const PORT_ERROR = "PORT must be an integer from 0 through 65535";

/**
 * Listen on the loopback interface.
 * Pass `0` to let the operating system choose a free port.
 * An omitted port uses `PORT` when it is a valid integer, and otherwise 3000.
 * Zod-validated configuration replaces this in a later task.
 */
export function startServer(port?: number): Promise<Server> {
  return new Promise((resolve, reject) => {
    let listenPort: number;
    try {
      listenPort = port === undefined ? readListenPort() : port;
      assertListenPort(listenPort);
    } catch (error) {
      reject(error instanceof Error ? error : new Error("Server failed to start"));
      return;
    }

    const server = createServer(createApp());
    const onError = (error: Error): void => {
      // A failed bind may not be listening. Always surface the listen error.
      server.close(() => {
        reject(error);
      });
    };
    server.once("error", onError);
    server.listen(listenPort, LISTEN_HOST, () => {
      server.off("error", onError);
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

function readListenPort(): number {
  const raw = process.env.PORT;
  if (raw === undefined || raw === "") {
    return DEFAULT_PORT;
  }
  if (!/^\d{1,5}$/.test(raw)) {
    throw new Error(PORT_ERROR);
  }
  return Number(raw);
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
  startServer().then(
    (server) => {
      console.log(`ecom-backend listening on ${listeningUrl(server)}`);
    },
    (error: unknown) => {
      const message = error instanceof Error ? error.message : "Server failed to start";
      console.error(message);
      process.exitCode = 1;
    },
  );
}
