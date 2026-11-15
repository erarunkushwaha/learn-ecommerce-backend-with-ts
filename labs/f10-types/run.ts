import { pathToFileURL } from "node:url";

import { cardLabel, describePayment, readPayment, sellerAccount } from "./index.js";

export const demoLines = [
  cardLabel({
    kind: "product",
    id: 1,
    updatedAt: "2026-11-15T00:00:00.000Z",
    name: "Mug",
    currency: "INR",
  }),
  cardLabel({
    kind: "category",
    id: 2,
    updatedAt: "2026-11-15T00:00:00.000Z",
    title: "Kitchen",
  }),
  describePayment(readPayment({ method: "card", last4: "4242", brand: "visa" })),
  sellerAccount("seller@example.com", "Ada").email,
];

const invokedPath = process.argv[1];

if (invokedPath !== undefined && import.meta.url === pathToFileURL(invokedPath).href) {
  for (const line of demoLines) {
    console.log(line);
  }
}
