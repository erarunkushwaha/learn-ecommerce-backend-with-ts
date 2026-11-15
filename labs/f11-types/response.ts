import { hasExactKeys, isRecord } from "./record.js";

/**
 * Success envelope. The payload type is the type argument.
 * This is the same `{ data }` shape as `SuccessBody<T>` in `src/app.ts`.
 * The lab defines it again so this program does not import the HTTP app.
 */
export type ApiSuccess<T> = {
  data: T;
};

/**
 * Conditional type. `infer` binds the payload inside a success envelope.
 * A value that is not that envelope becomes `never`.
 */
export type UnwrapData<T> = T extends ApiSuccess<infer D> ? D : never;

export function ok<T>(data: T): ApiSuccess<T> {
  return { data };
}

export function unwrapData<T>(body: ApiSuccess<T>): T {
  return body.data;
}

/**
 * Concrete use of `UnwrapData`. The conditional type has to resolve to
 * `{ name: string }` or this assignment fails.
 */
export function successName(body: ApiSuccess<{ name: string }>): string {
  const data: UnwrapData<typeof body> = body.data;
  return data.name;
}

/**
 * Generic type predicate. `isData` narrows the payload; this function narrows
 * the envelope. It does not copy. `readSuccess` is the boundary that does.
 */
export function isApiSuccess<T>(
  value: unknown,
  isData: (data: unknown) => data is T,
): value is ApiSuccess<T> {
  if (!isRecord(value)) {
    return false;
  }
  const keys = Object.keys(value);
  if (keys.length !== 1 || !keys.includes("data")) {
    return false;
  }
  return isData(value.data);
}

/** Fresh envelope. The reader decides what a fresh payload is. */
export function readSuccess<T>(value: unknown, readData: (data: unknown) => T): ApiSuccess<T> {
  if (!isRecord(value)) {
    throw new TypeError("success body must be an object");
  }
  if (!hasExactKeys(value, ["data"])) {
    throw new TypeError("success body must contain only data");
  }
  return { data: readData(value.data) };
}
