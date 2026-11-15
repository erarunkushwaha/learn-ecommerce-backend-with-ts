/**
 * Reachable when every alternative has already been ruled out.
 * The `never` annotation is erased. A JavaScript caller can still pass a value.
 * The message reports `typeof` and does not include the value itself.
 */
export function assertNever(value: never): never {
  throw new Error(`unexpected value ${typeof value}`);
}

/** Boundary helper. The parameter stays `unknown` until a check narrows it. */
export function minorUnits(value: unknown): number {
  if (typeof value !== "number") {
    throw new TypeError("minor units must be a number");
  }
  if (!Number.isInteger(value)) {
    throw new TypeError("minor units must be an integer");
  }
  if (value < 0) {
    throw new TypeError("minor units must be zero or greater");
  }
  return value;
}

/** `=== null` removes `null` from the union. `trim` is then safe. */
export function optionalNote(note: string | null): string {
  if (note === null) {
    return "";
  }
  return note.trim();
}

/** A class has a runtime prototype, so `instanceof` can narrow `unknown`. */
export class LabeledPrice {
  readonly label: string;

  constructor(label: string) {
    if (label.trim() === "") {
      throw new TypeError("price label must not be empty");
    }
    this.label = label;
  }
}

export function priceLabel(value: unknown): string | undefined {
  if (value instanceof LabeledPrice) {
    return value.label;
  }
  return undefined;
}

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
