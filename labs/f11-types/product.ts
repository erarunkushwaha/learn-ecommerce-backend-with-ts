import { hasExactKeys, isPositiveId, isRecord } from "./record.js";

export const CURRENCIES = ["USD", "INR", "EUR"] as const;

/** A string union. `Record<CurrencyCode, ...>` has to list every member. */
export type CurrencyCode = (typeof CURRENCIES)[number];

export interface ProductDraft {
  id: number;
  name: string;
  priceMinor: number;
  currency: CurrencyCode;
}

export const PATCH_KEYS = ["name", "priceMinor", "currency"] as const;

export type PatchKey = (typeof PATCH_KEYS)[number];

/** `Pick` keeps the writable fields. `Partial` makes each one optional. */
export type ProductPatch = Partial<Pick<ProductDraft, PatchKey>>;

/** `Omit` removes the key the repository assigns. The client does not send `id`. */
export type NewProduct = Omit<ProductDraft, "id">;

/**
 * `satisfies Record<...>` fails the build when a currency has no symbol.
 * `as const` keeps the symbol literals. Both are erased at runtime.
 */
export const CURRENCY_SYMBOL = {
  USD: "$",
  INR: "₹",
  EUR: "€",
} as const satisfies Record<CurrencyCode, string>;

export function currencySymbol(currency: CurrencyCode): string {
  return CURRENCY_SYMBOL[currency];
}

export function isProductDraft(value: unknown): value is ProductDraft {
  if (!isRecord(value) || !hasExactKeys(value, ["id", "name", "priceMinor", "currency"])) {
    return false;
  }
  return (
    isPositiveId(value.id) &&
    isProductName(value.name) &&
    isPriceMinor(value.priceMinor) &&
    isCurrency(value.currency)
  );
}

/** Copies `id`, `name`, `priceMinor`, and `currency`. Any other field is rejected. */
export function readProduct(value: unknown): ProductDraft {
  if (!isRecord(value)) {
    throw new TypeError("product must be an object");
  }
  if (!hasExactKeys(value, ["id", "name", "priceMinor", "currency"])) {
    throw new TypeError("product must contain only id, name, priceMinor, and currency");
  }
  if (!isPositiveId(value.id)) {
    throw new TypeError("product id must be a positive integer");
  }
  if (!isProductName(value.name)) {
    throw new TypeError("product name is invalid");
  }
  if (!isPriceMinor(value.priceMinor)) {
    throw new TypeError(
      priceProblem(value.priceMinor) ?? "priceMinor must be a non-negative integer",
    );
  }
  if (!isCurrency(value.currency)) {
    throw new TypeError("currency is not allowed");
  }
  return {
    id: value.id,
    name: value.name.trim(),
    priceMinor: value.priceMinor,
    currency: value.currency,
  };
}

/** Insert payload. `id` is not a field here, and an extra key is rejected. */
export function readNewProduct(value: unknown): NewProduct {
  if (!isRecord(value)) {
    throw new TypeError("product must be an object");
  }
  if (!hasExactKeys(value, PATCH_KEYS)) {
    throw new TypeError("product must contain only name, priceMinor, and currency");
  }
  if (!isProductName(value.name)) {
    throw new TypeError("product name is invalid");
  }
  if (!isPriceMinor(value.priceMinor)) {
    throw new TypeError(
      priceProblem(value.priceMinor) ?? "priceMinor must be a non-negative integer",
    );
  }
  if (!isCurrency(value.currency)) {
    throw new TypeError("currency is not allowed");
  }
  return {
    name: value.name.trim(),
    priceMinor: value.priceMinor,
    currency: value.currency,
  };
}

/**
 * Re-reads `product`, then copies only the patch keys that are present.
 * `undefined` means "leave the stored value". `id` is not a patch key.
 */
export function applyPatch(product: ProductDraft, patch: unknown): ProductDraft {
  const next = readProduct(product);
  if (!isRecord(patch)) {
    throw new TypeError("product patch must be an object");
  }
  for (const key of Object.keys(patch)) {
    if (!isPatchKey(key)) {
      throw new TypeError("product patch contains an unknown field");
    }
  }
  if (patch.name !== undefined) {
    if (!isProductName(patch.name)) {
      throw new TypeError("product name is invalid");
    }
    next.name = patch.name.trim();
  }
  if (patch.priceMinor !== undefined) {
    if (!isPriceMinor(patch.priceMinor)) {
      throw new TypeError(
        priceProblem(patch.priceMinor) ?? "priceMinor must be a non-negative integer",
      );
    }
    next.priceMinor = patch.priceMinor;
  }
  if (patch.currency !== undefined) {
    if (!isCurrency(patch.currency)) {
      throw new TypeError("currency is not allowed");
    }
    next.currency = patch.currency;
  }
  return next;
}

/** `Readonly` is erased. `Object.freeze` is what actually blocks assignment. */
export function freezeProduct(product: ProductDraft): Readonly<ProductDraft> {
  return Object.freeze(readProduct(product));
}

/** `Pick` keeps `id` and drops the other fields from the return type. */
export function productKey(product: ProductDraft): Pick<ProductDraft, "id"> {
  return { id: readProduct(product).id };
}

function isCurrency(value: unknown): value is CurrencyCode {
  for (const candidate of CURRENCIES) {
    if (candidate === value) {
      return true;
    }
  }
  return false;
}

function isPatchKey(key: string): key is PatchKey {
  for (const candidate of PATCH_KEYS) {
    if (candidate === key) {
      return true;
    }
  }
  return false;
}

function isProductName(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }
  const name = value.trim();
  if (name.length === 0 || name.length > 80) {
    return false;
  }
  for (const char of name) {
    const code = char.codePointAt(0);
    if (code !== undefined && code < 0x20) {
      return false;
    }
  }
  return true;
}

function isPriceMinor(value: unknown): value is number {
  return priceProblem(value) === undefined;
}

function priceProblem(value: unknown): string | undefined {
  if (typeof value !== "number") {
    return "priceMinor must be a number";
  }
  if (!Number.isSafeInteger(value) || Object.is(value, -0)) {
    return "priceMinor must be an integer";
  }
  if (value < 0) {
    return "priceMinor must be zero or greater";
  }
  return undefined;
}
