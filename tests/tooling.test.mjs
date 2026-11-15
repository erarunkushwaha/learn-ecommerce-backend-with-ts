import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("lint, format, typecheck, and test scripts stay split", async () => {
  const packageUrl = new URL("../package.json", import.meta.url);
  const manifest = JSON.parse(await readFile(packageUrl, "utf8"));
  const scripts = manifest.scripts;

  assert.equal(scripts.typecheck, "tsc -p tsconfig.json --noEmit");
  assert.equal(
    scripts.test,
    'tsc -p tsconfig.json && node --test --test-reporter=spec "tests/**/*.test.mjs"',
  );
  assert.equal(scripts.lint, "eslint .");
  assert.equal(scripts["lint:fix"], "eslint . --fix");
  assert.equal(scripts.format.includes("--write"), true);
  assert.equal(scripts.format.replace("--write", "--check"), scripts["format:check"]);
  assert.equal(scripts.typecheck.includes("--noEmit"), true);
  assert.equal(scripts.test.includes("tsc -p tsconfig.json"), true);
  assert.equal(scripts.test.includes("tests/*.test.mjs"), false);
});

test("eslint flat config loads and prettier leaves markdown alone", async () => {
  const config = await import("../eslint.config.js");
  assert.ok(Array.isArray(config.default));
  assert.ok(config.default.length >= 2);

  const prettier = JSON.parse(
    await readFile(new URL("../.prettierrc.json", import.meta.url), "utf8"),
  );
  assert.equal(prettier.semi, true);
  assert.equal(prettier.singleQuote, false);
  assert.equal(prettier.printWidth, 100);
  assert.equal(prettier.endOfLine, "lf");

  const ignore = await readFile(new URL("../.prettierignore", import.meta.url), "utf8");
  assert.match(ignore, /^dist$/m);
  assert.match(ignore, /^package-lock\.json$/m);
  assert.match(ignore, /^\*\.md$/m);
});
