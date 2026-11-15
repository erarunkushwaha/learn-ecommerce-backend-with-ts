/**
 * Plain data objects and `Object.create(null)`.
 * Arrays and class instances are rejected before a property is read.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  // `Object.getPrototypeOf` is declared as returning `any` in the ES5 lib.
  // `Reflect.getPrototypeOf` returns `object | null`, so the check stays typed.
  const prototype = Reflect.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * Same prototype check as `isRecord`, without a type predicate.
 * A predicate would narrow a generic parameter to `Record<string, unknown>`
 * and drop the caller's field types.
 */
export function isPlainData(value: unknown): boolean {
  return isRecord(value);
}

/** Own keys match `keys` in any order. A missing or extra key fails. */
export function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const present = Object.keys(value);
  if (present.length !== keys.length) {
    return false;
  }
  return keys.every((key) => present.includes(key));
}

/** Positive safe integer. Numeric strings and `0` are rejected. */
export function isPositiveId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}
