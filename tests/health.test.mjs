import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createApp } from "../dist/app.js";
import { listeningUrl, startServer, stopServer } from "../dist/server.js";

test("GET /api/v1/health returns the liveness envelope", async () => {
  await withApp(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/health`);
    const contentType = response.headers.get("content-type");

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-powered-by"), null);
    assert.ok(contentType !== null && contentType.includes("application/json"));
    assert.deepEqual(await response.json(), { data: { status: "ok" } });
  });
});

test("health is mounted only on the /api/v1 prefix", async () => {
  await withApp(async (baseUrl) => {
    const unversioned = await fetch(`${baseUrl}/health`);
    const otherVersion = await fetch(`${baseUrl}/api/v2/health`);

    assert.equal(unversioned.status, 404);
    assert.equal(otherVersion.status, 404);
  });
});

test("startServer binds loopback and stopServer closes it", async () => {
  const server = await startServer(0);
  try {
    const address = server.address();
    if (address === null || typeof address === "string") {
      assert.fail("server has no TCP address");
    }
    assert.equal(address.address, "127.0.0.1");

    const response = await fetch(`${listeningUrl(server)}/api/v1/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { data: { status: "ok" } });
  } finally {
    await stopServer(server);
  }
  assert.equal(server.listening, false);
});

test("server entry serves health when PORT=0", { timeout: 10_000 }, async () => {
  const child = spawnServer({ PORT: "0" });
  try {
    const baseUrl = await waitForListenUrl(child);
    const response = await fetch(`${baseUrl}/api/v1/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { data: { status: "ok" } });
    assert.equal(child.stderrText(), "");
  } finally {
    await stopChild(child.process);
  }
});

test("server entry rejects a non-integer PORT", { timeout: 10_000 }, async () => {
  const child = spawnServer({ PORT: "nope" });
  const [code] = await once(child.process, "exit");
  await child.stdioClosed;

  assert.equal(code, 1);
  assert.equal(child.stdoutText(), "");
  assert.match(child.stderrText(), /PORT must be an integer from 0 through 65535/);
});

/**
 * @param {(baseUrl: string) => Promise<void>} fn
 */
async function withApp(fn) {
  const server = createServer(createApp());
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("test server has no TCP address");
    }
    await fn(`http://127.0.0.1:${address.port}`);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
}

/**
 * @param {Record<string, string>} env
 */
function spawnServer(env) {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const child = spawn(process.execPath, ["dist/server.js"], {
    cwd: root,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  const stdioClosed = Promise.all([once(child.stdout, "end"), once(child.stderr, "end")]);

  return {
    process: child,
    stdioClosed,
    stdoutText: () => stdout,
    stderrText: () => stderr,
  };
}

/**
 * @param {ReturnType<typeof spawnServer>} child
 */
function waitForListenUrl(child) {
  const line = /ecom-backend listening on (http:\/\/127\.0\.0\.1:\d+)/;
  return new Promise((resolve, reject) => {
    const finish = (error) => {
      child.process.stdout.off("data", onStdout);
      child.process.off("exit", onExit);
      if (error) {
        reject(error);
        return;
      }
    };

    const onStdout = () => {
      const match = line.exec(child.stdoutText());
      if (match?.[1] === undefined) {
        return;
      }
      const url = match[1];
      finish();
      resolve(url);
    };

    const onExit = (code) => {
      finish(new Error(`server exited ${String(code)} before listening`));
    };

    child.process.stdout.on("data", onStdout);
    child.process.once("exit", onExit);
    onStdout();
  });
}

/**
 * @param {import("node:child_process").ChildProcess} child
 */
async function stopChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }
  const exited = once(child, "exit");
  child.kill("SIGTERM");
  const killer = setTimeout(() => {
    child.kill("SIGKILL");
  }, 2000);
  await exited;
  clearTimeout(killer);
}
