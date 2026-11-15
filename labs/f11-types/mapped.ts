import type { ProductDraft } from "./product.js";

/**
 * Mapped type. Each field of `T` accepts `null` as well as its own type.
 * This is not `Partial`: a missing field is still required, and the extra
 * value is `null`, not `undefined`.
 */
export type Nullable<T> = {
  [K in keyof T]: T[K] | null;
};

/**
 * Mapped type plus a conditional type. The key is kept when the field
 * extends `V`. `-?` includes optional fields. The `[keyof T]` step turns
 * the object of keys into a union. The type is erased at runtime.
 */
export type KeysOfType<T, V> = {
  [K in keyof T]-?: T[K] extends V ? K : never;
}[keyof T];

/**
 * Conditional type. A naked type parameter distributes, so a union of rows
 * becomes a union of their id types. `never` is the result when `id` is absent.
 */
export type IdOf<T> = T extends { id: infer I } ? I : never;

/** The handwritten object has to list every numeric field or `tsc` fails. */
export function numericProductKeys(): Record<KeysOfType<ProductDraft, number>, true> {
  return { id: true, priceMinor: true };
}

/**
 * `currency` is a string union, so it extends `string` and belongs here.
 * `id` and `priceMinor` do not.
 */
export function stringProductKeys(): Record<KeysOfType<ProductDraft, string>, true> {
  return { name: true, currency: true };
}

/** `IdOf<ProductDraft>` resolves to `number` because the argument is concrete. */
export function draftId(product: ProductDraft): IdOf<ProductDraft> {
  return product.id;
}

/** After the `null` check, `name` is `string`. The other fields may stay `null`. */
export function requireName(row: Nullable<ProductDraft>): string {
  if (row.name === null) {
    throw new TypeError("product name is missing");
  }
  return row.name;
}
