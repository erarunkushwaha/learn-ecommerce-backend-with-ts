import assert from "node:assert/strict";
import { createServer } from "node:net";
import test from "node:test";
import { checkRedisConnection } from "../dist/config/data-stores.js";

test("checkRedisConnection resolves after AUTH and PING", async () => {
  const server = createServer((socket) => {
    let buffer = "";
    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      if (buffer.includes("PING")) {
        assert.match(buffer, /\r\nAUTH\r\n/);
        assert.match(buffer, /\r\nsecret\r\n/);
        socket.write("+OK\r\n+PONG\r\n");
      }
    });
  });

  const port = await listen(server);
  try {
    await checkRedisConnection({ host: "127.0.0.1", port, password: "secret" });
  } finally {
    server.close();
  }
});

test("checkRedisConnection rejects an error reply", async () => {
  const server = createServer((socket) => {
    socket.on("data", () => {
      socket.write("-WRONGPASS invalid username-password pair\r\n");
    });
  });

  const port = await listen(server);
  try {
    await assert.rejects(
      () => checkRedisConnection({ host: "127.0.0.1", port, password: "secret" }),
      /Redis rejected the ping: -WRONGPASS/,
    );
  } finally {
    server.close();
  }
});

test("checkRedisConnection times out when Redis does not answer", async () => {
  const server = createServer(() => {
    // Accept the socket and send nothing.
  });

  const port = await listen(server);
  try {
    await assert.rejects(
      () => checkRedisConnection({ host: "127.0.0.1", port, password: "secret" }, 100),
      /Redis ping timed out/,
    );
  } finally {
    server.close();
  }
});

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
