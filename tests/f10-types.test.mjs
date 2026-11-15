import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
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

test("F10 lab typechecks, runs, and narrows values", async () => {
  const built = runTsc(["-p", "labs/f10-types/tsconfig.json"]);
  assert.equal(built.status, 0, `${built.stdout}\n${built.stderr}\n${built.error ?? ""}`);

  const lab = await import("../labs/f10-types/dist/index.js");
  const demo = await import("../labs/f10-types/dist/run.js");

  assert.deepEqual(demo.demoLines, ["Mug ₹", "Kitchen", "card visa 4242", "seller@example.com"]);

  const printed = spawnSync(process.execPath, ["labs/f10-types/dist/run.js"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(printed.status, 0, printed.stderr);
  assert.equal(printed.stdout, `${demo.demoLines.join("\n")}\n`);

  assert.equal(
    lab.recordStamp({ id: 7, updatedAt: "2026-11-15T00:00:00.000Z" }),
    "7 @ 2026-11-15T00:00:00.000Z",
  );
  assert.equal(lab.currencySymbol("USD"), "$");
  assert.equal(lab.currencySymbol("EUR"), "€");
  assert.equal(lab.currencySymbol("INR"), "₹");
  assert.equal(
    lab.cardLabel({
      kind: "product",
      id: 1,
      updatedAt: "2026-11-15T00:00:00.000Z",
      name: "Mug",
      currency: "INR",
    }),
    "Mug ₹",
  );
  assert.equal(
    lab.cardLabel({
      kind: "category",
      id: 2,
      updatedAt: "2026-11-15T00:00:00.000Z",
      title: "Kitchen",
    }),
    "Kitchen",
  );

  assert.equal(lab.identityLabel({ email: "a@example.com" }), "a@example.com");
  assert.equal(lab.identityLabel({ displayName: "Ada" }), "Ada");
  const account = lab.sellerAccount("a@example.com", "Ada");
  assert.deepEqual(account, { email: "a@example.com", displayName: "Ada" });
  assert.equal(lab.labelAccount(account), "a@example.com");

  assert.equal(lab.describeListing({ state: "open", stock: 3 }), "open 3");
  assert.equal(lab.describeListing({ state: "closed", reason: "sold out" }), "closed sold out");
  assert.throws(() => lab.assertListingConflict({ state: "open", stock: 1, reason: "sold out" }), {
    name: "Error",
    message: "unexpected value object",
  });
  assert.throws(() => lab.readConflictingId({ id: "sku-1", name: "Mug" }), {
    name: "Error",
    message: "unexpected value string",
  });

  assert.equal(lab.minorUnits(0), 0);
  assert.equal(lab.minorUnits(2500), 2500);
  assert.throws(() => lab.minorUnits("2500"), {
    name: "TypeError",
    message: "minor units must be a number",
  });
  assert.throws(() => lab.minorUnits(1.5), {
    name: "TypeError",
    message: "minor units must be an integer",
  });
  assert.throws(() => lab.minorUnits(-1), {
    name: "TypeError",
    message: "minor units must be zero or greater",
  });

  assert.equal(lab.optionalNote(null), "");
  assert.equal(lab.optionalNote("  hello "), "hello");
  assert.equal(lab.priceLabel(new lab.LabeledPrice("12.00 INR")), "12.00 INR");
  assert.equal(lab.priceLabel({ label: "12.00 INR" }), undefined);
  assert.throws(() => new lab.LabeledPrice("  "), {
    name: "TypeError",
    message: "price label must not be empty",
  });

  assert.equal(lab.isRecord({ method: "cod" }), true);
  assert.equal(lab.isRecord(Object.create(null)), true);
  assert.equal(lab.isRecord(["cod"]), false);
  assert.equal(lab.isRecord(null), false);
  assert.equal(lab.isRecord(new Date()), false);
  assert.equal(lab.isRecord(new lab.LabeledPrice("12.00 INR")), false);

  const card = lab.readPayment({
    method: "card",
    last4: "4242",
    brand: "visa",
    pan: "4242424242424242",
  });
  assert.deepEqual(card, { method: "card", last4: "4242", brand: "visa" });
  assert.equal(lab.isWallet(card), false);
  assert.equal(lab.describePayment(card), "card visa 4242");

  const wallet = lab.readPayment({ method: "wallet", balanceMinor: 100 });
  assert.equal(lab.isWallet(wallet), true);
  assert.equal(lab.describePayment(wallet), "wallet 100");
  assert.equal(
    lab.describePayment(lab.readPayment({ method: "cod", collectOnDelivery: true })),
    "cash on delivery",
  );

  assert.throws(() => lab.readPayment(null), {
    name: "TypeError",
    message: "payment must be an object",
  });
  assert.throws(() => lab.readPayment([{ method: "cod", collectOnDelivery: true }]), {
    name: "TypeError",
    message: "payment must be an object",
  });
  assert.throws(() => lab.readPayment({ method: "cheque", last4: "4242" }), {
    name: "TypeError",
    message: "payment method is not supported",
  });
  assert.throws(() => lab.readPayment({ method: "card", last4: "4242", brand: "amex" }), {
    name: "TypeError",
    message: "card brand must be visa or mastercard",
  });
  assert.throws(() => lab.readPayment({ method: "card", last4: "424", brand: "visa" }), {
    name: "TypeError",
    message: "card last4 must be four digits",
  });
  assert.throws(() => lab.readPayment({ method: "cod", collectOnDelivery: false }), {
    name: "TypeError",
    message: "cod requires collectOnDelivery true",
  });
  assert.throws(() => lab.readPayment({ method: "wallet", balanceMinor: "100" }), {
    name: "TypeError",
    message: "minor units must be a number",
  });
});

test("F10 rejects a payment method outside the union", () => {
  const rejected = runTsc([
    "--noEmit",
    "--pretty",
    "false",
    "--strict",
    "--noUncheckedIndexedAccess",
    "--noImplicitReturns",
    "--noFallthroughCasesInSwitch",
    "--module",
    "nodenext",
    "--moduleResolution",
    "nodenext",
    "--target",
    "ES2022",
    "--verbatimModuleSyntax",
    "--isolatedModules",
    "labs/f10-types/reject/cheque.ts",
  ]);
  assert.notEqual(rejected.status, 0);
  const output = `${rejected.stdout}\n${rejected.stderr}`;
  assert.match(output, /cheque/);
  assert.match(output, /not assignable/i);
});

test("F10 stays outside the application compile", async () => {
  const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(manifest.scripts.typecheck, "tsc -p tsconfig.json --noEmit");
  assert.equal(
    manifest.scripts["lab:f10"],
    "tsc -p labs/f10-types/tsconfig.json && node labs/f10-types/dist/run.js",
  );
  assert.equal(manifest.scripts.format.includes('"labs"'), true);
  assert.equal(manifest.scripts["format:check"].includes('"labs"'), true);

  const appTsconfig = JSON.parse(
    await readFile(new URL("../tsconfig.json", import.meta.url), "utf8"),
  );
  assert.deepEqual(appTsconfig.include, ["src/**/*.ts"]);

  const labTsconfig = JSON.parse(
    await readFile(new URL("../labs/f10-types/tsconfig.json", import.meta.url), "utf8"),
  );
  assert.deepEqual(labTsconfig.include, ["./*.ts"]);
  assert.equal(labTsconfig.compilerOptions.rootDir, ".");
  assert.equal(labTsconfig.compilerOptions.outDir, "dist");
  assert.equal(labTsconfig.compilerOptions.strict, true);

  const app = await readFile(new URL("../src/app.ts", import.meta.url), "utf8");
  const server = await readFile(new URL("../src/server.ts", import.meta.url), "utf8");
  assert.equal(app.includes("labs/"), false);
  assert.equal(server.includes("labs/"), false);
});
