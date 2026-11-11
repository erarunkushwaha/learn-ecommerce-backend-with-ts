import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("package.json is a private ESM app with toolchain scripts", async () => {
  const packageUrl = new URL("../package.json", import.meta.url);
  const manifest = JSON.parse(await readFile(packageUrl, "utf8"));

  assert.equal(manifest.private, true);
  assert.equal(manifest.type, "module");
  assert.equal(typeof manifest.scripts.build, "string");
  assert.equal(typeof manifest.scripts.typecheck, "string");
  assert.equal(typeof manifest.scripts.dev, "string");
  assert.equal(typeof manifest.scripts.test, "string");
});
