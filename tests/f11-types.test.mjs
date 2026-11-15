import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const tsc = fileURLToPath(new URL("../node_modules/typescript/bin/tsc", import.meta.url));

function runTsc(args) {
  return spawnSync(process.execPath, [tsc, ...args], {
    cwd: root,
    encoding: "utf8",
  });
}

async function typescriptFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await typescriptFiles(path)));
    } else if (entry.name.endsWith(".ts")) {
      files.push(path);
    }
  }
  return files;
}

test("F11 lab typechecks, runs, and keeps the actor optional", async () => {
  const built = runTsc(["-p", "labs/f11-types/tsconfig.json"]);
  assert.equal(built.status, 0, `${built.stdout}\n${built.stderr}\n${built.error ?? ""}`);

  const lab = await import("../labs/f11-types/dist/index.js");
  const demo = await import("../labs/f11-types/dist/run.js");
  const lines = await demo.buildDemoLines();
  assert.deepEqual(lines, ["1 Cup ₹", "seller 7", "anonymous", "data"]);

  const printed = spawnSync(process.execPath, ["labs/f11-types/dist/run.js"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(printed.status, 0, printed.stderr);
  assert.equal(printed.stdout, `${lines.join("\n")}\n`);

  const mug = lab.readProduct({
    id: 1,
    name: "  Mug ",
    priceMinor: 100,
    currency: "INR",
  });
  assert.deepEqual(mug, { id: 1, name: "Mug", priceMinor: 100, currency: "INR" });
  assert.equal(lab.productKey(mug).id, 1);
  assert.deepEqual(Object.keys(lab.productKey(mug)), ["id"]);
  assert.equal(lab.currencySymbol("USD"), "$");
  assert.equal(lab.currencySymbol("INR"), "₹");
  assert.equal(lab.currencySymbol("EUR"), "€");
  assert.deepEqual(lab.CURRENCY_SYMBOL, { USD: "$", INR: "₹", EUR: "€" });
  assert.equal(lab.isProductDraft(mug), true);
  assert.equal(lab.isProductDraft({ ...mug, admin: true }), false);

  const renamed = lab.applyPatch(mug, { name: "  Cup " });
  assert.equal(renamed.name, "Cup");
  assert.equal(mug.name, "Mug");
  assert.equal(renamed.id, 1);
  assert.equal(renamed.priceMinor, 100);
  assert.deepEqual(lab.applyPatch(mug, {}), mug);
  assert.notEqual(lab.applyPatch(mug, {}), mug);
  assert.throws(() => lab.applyPatch(mug, { id: 9 }), {
    name: "TypeError",
    message: "product patch contains an unknown field",
  });
  assert.throws(() => lab.applyPatch(mug, { admin: true }), {
    name: "TypeError",
    message: "product patch contains an unknown field",
  });
  assert.throws(() => lab.applyPatch(mug, []), {
    name: "TypeError",
    message: "product patch must be an object",
  });

  const frozen = lab.freezeProduct(mug);
  assert.throws(() => {
    frozen.name = "Cup";
  }, TypeError);

  assert.throws(() => lab.readProduct([mug]), {
    name: "TypeError",
    message: "product must be an object",
  });
  assert.throws(() => lab.readProduct({ ...mug, admin: true }), {
    name: "TypeError",
    message: "product must contain only id, name, priceMinor, and currency",
  });
  assert.throws(() => lab.readProduct({ ...mug, id: "1" }), {
    name: "TypeError",
    message: "product id must be a positive integer",
  });
  assert.throws(() => lab.readProduct({ ...mug, name: " " }), {
    name: "TypeError",
    message: "product name is invalid",
  });
  assert.equal(lab.readProduct({ ...mug, name: "Mug\n" }).name, "Mug");
  assert.throws(() => lab.readProduct({ ...mug, name: "Mu\ng" }), {
    name: "TypeError",
    message: "product name is invalid",
  });
  assert.throws(() => lab.readProduct({ ...mug, name: "a".repeat(81) }), {
    name: "TypeError",
    message: "product name is invalid",
  });
  assert.equal(lab.readProduct({ ...mug, name: "a".repeat(80) }).name.length, 80);
  assert.throws(() => lab.readProduct({ ...mug, priceMinor: "100" }), {
    name: "TypeError",
    message: "priceMinor must be a number",
  });
  assert.throws(() => lab.readProduct({ ...mug, priceMinor: 1.5 }), {
    name: "TypeError",
    message: "priceMinor must be an integer",
  });
  assert.throws(() => lab.readProduct({ ...mug, priceMinor: -0 }), {
    name: "TypeError",
    message: "priceMinor must be an integer",
  });
  assert.throws(() => lab.readProduct({ ...mug, priceMinor: -1 }), {
    name: "TypeError",
    message: "priceMinor must be zero or greater",
  });
  assert.equal(lab.readProduct({ ...mug, priceMinor: 0 }).priceMinor, 0);
  assert.throws(() => lab.readProduct({ ...mug, currency: "GBP" }), {
    name: "TypeError",
    message: "currency is not allowed",
  });

  const createdFields = lab.readNewProduct({
    name: "Mug",
    priceMinor: 100,
    currency: "INR",
  });
  assert.deepEqual(createdFields, { name: "Mug", priceMinor: 100, currency: "INR" });
  assert.throws(
    () => lab.readNewProduct({ id: 1, name: "Mug", priceMinor: 100, currency: "INR" }),
    {
      name: "TypeError",
      message: "product must contain only name, priceMinor, and currency",
    },
  );

  const repo = lab.createMemoryRepository([]);
  const first = await repo.insert(createdFields);
  assert.deepEqual(first, { id: 1, name: "Mug", priceMinor: 100, currency: "INR" });
  const found = await repo.findById(1);
  assert.deepEqual(found, first);
  assert.notEqual(found, first);
  found.name = "Changed";
  assert.equal((await repo.findById(1)).name, "Mug");
  assert.equal(await repo.findById(9), undefined);
  assert.equal((await repo.insert({ name: "Cup", priceMinor: 50, currency: "USD" })).id, 2);
  await assert.rejects(() => repo.insert({ id: 9, name: "X", priceMinor: 1, currency: "EUR" }), {
    name: "TypeError",
    message: "insert must not include id",
  });
  await assert.rejects(() => repo.insert([]), {
    name: "TypeError",
    message: "insert fields must be an object",
  });

  const seeded = lab.createMemoryRepository([
    { id: 4, name: "Bowl", priceMinor: 10, currency: "EUR" },
  ]);
  assert.equal((await seeded.findById(4)).name, "Bowl");
  assert.equal((await seeded.insert({ name: "Plate", priceMinor: 11, currency: "EUR" })).id, 5);
  assert.throws(
    () =>
      lab.createMemoryRepository([
        { id: 1, name: "Mug", priceMinor: 1, currency: "INR" },
        { id: 1, name: "Cup", priceMinor: 1, currency: "INR" },
      ]),
    { name: "TypeError", message: "repository seed ids must be unique positive integers" },
  );
  assert.throws(() => lab.createMemoryRepository([new Date()]), {
    name: "TypeError",
    message: "repository seed must be plain objects",
  });

  const envelope = lab.ok(mug);
  assert.deepEqual(envelope, { data: mug });
  assert.equal(lab.unwrapData(envelope), mug);
  assert.equal(lab.successName(lab.ok({ name: "Mug" })), "Mug");
  assert.equal(lab.isApiSuccess({ data: mug }, lab.isProductDraft), true);
  assert.equal(lab.isApiSuccess({ data: mug, token: "secret" }, lab.isProductDraft), false);
  const reread = lab.readSuccess(
    { data: { id: 1, name: "  Mug ", priceMinor: 100, currency: "INR" } },
    lab.readProduct,
  );
  assert.deepEqual(reread, { data: mug });
  assert.throws(() => lab.readSuccess({ data: mug, token: "secret" }, lab.readProduct), {
    name: "TypeError",
    message: "success body must contain only data",
  });
  assert.throws(() => lab.readSuccess(null, lab.readProduct), {
    name: "TypeError",
    message: "success body must be an object",
  });

  assert.deepEqual(lab.numericProductKeys(), { id: true, priceMinor: true });
  assert.deepEqual(lab.stringProductKeys(), { name: true, currency: true });
  assert.equal(lab.draftId(mug), 1);
  assert.equal(lab.requireName({ id: null, name: "Mug", priceMinor: null, currency: null }), "Mug");
  assert.throws(() => lab.requireName({ id: 1, name: null, priceMinor: 1, currency: "INR" }), {
    name: "TypeError",
    message: "product name is missing",
  });

  const input = { id: 7, role: "seller" };
  const actor = lab.readActor(input);
  assert.deepEqual(actor, { id: 7, role: "seller" });
  assert.notEqual(actor, input);
  input.role = "buyer";
  assert.equal(actor.role, "seller");
  const blank = Object.create(null);
  blank.id = 3;
  blank.role = "seller";
  assert.equal(Object.getPrototypeOf(lab.readActor(blank)), Object.prototype);

  assert.throws(() => lab.readActor({ id: 7, role: "seller", admin: true }), {
    name: "TypeError",
    message: "actor must contain only id and role",
  });
  assert.throws(() => lab.readActor({ id: "7", role: "seller" }), {
    name: "TypeError",
    message: "actor id must be a positive integer",
  });
  assert.throws(() => lab.readActor({ id: 0, role: "buyer" }), {
    name: "TypeError",
    message: "actor id must be a positive integer",
  });
  assert.throws(() => lab.readActor({ id: 7, role: "admin" }), {
    name: "TypeError",
    message: "actor role is not allowed",
  });
  assert.throws(() => lab.readActor([{ id: 7, role: "seller" }]), {
    name: "TypeError",
    message: "actor must be an object",
  });
  assert.throws(() => lab.readActor(null), {
    name: "TypeError",
    message: "actor must be an object",
  });

  const carrier = {};
  assert.equal(lab.hasActor(carrier), false);
  assert.equal(lab.actorLabel(carrier), "anonymous");
  lab.assignActor(carrier, { id: 4, role: "buyer" });
  assert.equal(lab.hasActor(carrier), true);
  assert.equal(lab.actorLabel(carrier), "buyer 4");
  assert.equal(lab.hasActor({ actor: { id: 4, role: "buyer", admin: true } }), false);
  assert.equal(lab.actorLabel({ actor: { id: 4, role: "admin" } }), "anonymous");
  assert.equal(await lab.labelOnRequest({ id: 7, role: "seller" }), "seller 7");
  assert.equal(await lab.labelOnRequest(undefined), "anonymous");
  assert.throws(() => lab.labelOnRequest({ id: 7, role: "admin" }), {
    name: "TypeError",
    message: "actor role is not allowed",
  });

  assert.equal(lab.isRecord(Object.create(null)), true);
  assert.equal(lab.isRecord(["seller"]), false);
  assert.equal(lab.isPositiveId(1), true);
  assert.equal(lab.isPositiveId(0), false);
});

test("F11 rejects an unguarded actor, a readonly write, and a partial field", () => {
  const rejected = runTsc([
    "--noEmit",
    "--pretty",
    "false",
    "--strict",
    "--noUncheckedIndexedAccess",
    "--noImplicitOverride",
    "--noImplicitReturns",
    "--noFallthroughCasesInSwitch",
    "--module",
    "nodenext",
    "--moduleResolution",
    "nodenext",
    "--target",
    "ES2022",
    "--lib",
    "ES2022",
    "--verbatimModuleSyntax",
    "--isolatedModules",
    "--esModuleInterop",
    "--skipLibCheck",
    "labs/f11-types/reject/unsafe.ts",
  ]);
  assert.notEqual(rejected.status, 0);
  const output = `${rejected.stdout}\n${rejected.stderr}`;
  assert.match(output, /req\.actor/);
  assert.match(output, /possibly 'undefined'/);
  assert.match(output, /read-only property/);
  assert.match(output, /string \| undefined/);
});

test("F11 stays outside the application compile", async () => {
  const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(manifest.scripts.typecheck, "tsc -p tsconfig.json --noEmit");
  assert.equal(
    manifest.scripts["lab:f10"],
    "tsc -p labs/f10-types/tsconfig.json && node labs/f10-types/dist/run.js",
  );
  assert.equal(
    manifest.scripts["lab:f11"],
    "tsc -p labs/f11-types/tsconfig.json && node labs/f11-types/dist/run.js",
  );

  const appTsconfig = JSON.parse(
    await readFile(new URL("../tsconfig.json", import.meta.url), "utf8"),
  );
  assert.deepEqual(appTsconfig.include, ["src/**/*.ts"]);

  const labTsconfig = JSON.parse(
    await readFile(new URL("../labs/f11-types/tsconfig.json", import.meta.url), "utf8"),
  );
  assert.deepEqual(labTsconfig.include, ["./*.ts"]);
  assert.equal(labTsconfig.compilerOptions.rootDir, ".");
  assert.equal(labTsconfig.compilerOptions.outDir, "dist");
  assert.equal(labTsconfig.compilerOptions.strict, true);

  const app = await readFile(new URL("../src/app.ts", import.meta.url), "utf8");
  const server = await readFile(new URL("../src/server.ts", import.meta.url), "utf8");
  assert.equal(app.includes("labs/"), false);
  assert.equal(server.includes("labs/"), false);

  const requestSource = await readFile(
    new URL("../labs/f11-types/request.ts", import.meta.url),
    "utf8",
  );
  assert.match(requestSource, /declare module "express-serve-static-core"/);
  assert.match(requestSource, /actor\?: RequestActor/);

  const srcRoot = fileURLToPath(new URL("../src/", import.meta.url));
  for (const path of await typescriptFiles(srcRoot)) {
    const source = await readFile(path, "utf8");
    assert.equal(source.includes("express-serve-static-core"), false, path);
    assert.equal(source.includes("namespace Express"), false, path);
  }

  const labIndex = await readFile(new URL("../labs/f11-types/index.ts", import.meta.url), "utf8");
  assert.equal(/from\s+["'][^"']*src\//.test(labIndex), false);
});
