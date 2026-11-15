import { pathToFileURL } from "node:url";

import {
  applyPatch,
  createMemoryRepository,
  currencySymbol,
  labelOnRequest,
  ok,
  readNewProduct,
  type NewProduct,
} from "./index.js";

export async function buildDemoLines(): Promise<readonly string[]> {
  const repo = createMemoryRepository<NewProduct>([]);
  const created = await repo.insert(
    readNewProduct({ name: "Mug", priceMinor: 100, currency: "INR" }),
  );
  const renamed = applyPatch(created, { name: "Cup" });
  const body = ok(renamed);
  const seller = await labelOnRequest({ id: 7, role: "seller" });
  const anonymous = await labelOnRequest(undefined);
  return [
    `${body.data.id} ${body.data.name} ${currencySymbol(body.data.currency)}`,
    seller,
    anonymous,
    Object.keys(body).join(","),
  ];
}

const invokedPath = process.argv[1];

if (invokedPath !== undefined && import.meta.url === pathToFileURL(invokedPath).href) {
  const lines = await buildDemoLines();
  for (const line of lines) {
    console.log(line);
  }
}
