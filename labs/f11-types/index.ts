/**
 * F11 TypeScript lab. Notes: docs/learning/F11-types.md
 * Run: npm run lab:f11
 */

export { draftId, numericProductKeys, requireName, stringProductKeys } from "./mapped.js";
export type { IdOf, KeysOfType, Nullable } from "./mapped.js";

export {
  applyPatch,
  currencySymbol,
  CURRENCIES,
  CURRENCY_SYMBOL,
  freezeProduct,
  isProductDraft,
  PATCH_KEYS,
  productKey,
  readNewProduct,
  readProduct,
} from "./product.js";
export type { CurrencyCode, NewProduct, PatchKey, ProductDraft, ProductPatch } from "./product.js";

export { hasExactKeys, isPlainData, isPositiveId, isRecord } from "./record.js";

export { createMemoryRepository } from "./repository.js";
export type { Repository, WithId } from "./repository.js";

export {
  actorLabel,
  assignActor,
  hasActor,
  isRequestActor,
  labelOnRequest,
  readActor,
} from "./request.js";
export type { RequestActor } from "./request.js";

export { isApiSuccess, ok, readSuccess, successName, unwrapData } from "./response.js";
export type { ApiSuccess, UnwrapData } from "./response.js";
