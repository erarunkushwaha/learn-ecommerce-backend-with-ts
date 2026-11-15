/**
 * This file is outside labs/f11-types/tsconfig.json.
 * Compiling it is expected to fail.
 * `actor` is optional, so `req.actor.id` is an error.
 * `Readonly` rejects assignment to `name`.
 * `Partial` leaves `patch.name` as `string | undefined`.
 */
import type { Request } from "express";

import { freezeProduct, type ProductPatch } from "../product.js";
import { readActor } from "../request.js";

void readActor({ id: 1, role: "buyer" });

export function unsafeActorId(req: Request): number {
  const patch: ProductPatch = {};
  const frozen = freezeProduct({
    id: 1,
    name: "Mug",
    priceMinor: 100,
    currency: "INR",
  });
  frozen.name = "Cup";
  const name: string = patch.name;
  return req.actor.id + name.length;
}
