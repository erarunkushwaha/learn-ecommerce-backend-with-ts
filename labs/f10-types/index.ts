/**
 * F10 TypeScript lab. Notes: docs/learning/F10-types.md
 * Run: npm run lab:f10
 */

export {
  assertListingConflict,
  cardLabel,
  currencySymbol,
  describeListing,
  identityLabel,
  labelAccount,
  readConflictingId,
  recordStamp,
  sellerAccount,
} from "./shapes.js";
export type {
  CatalogCard,
  CatalogRecord,
  CategoryCard,
  ClosedListing,
  ConflictingId,
  CurrencyCode,
  DisplayIdentity,
  EmailIdentity,
  Identity,
  Listing,
  ListingConflict,
  OpenListing,
  ProductCard,
  SellerAccount,
} from "./shapes.js";

export {
  assertNever,
  isRecord,
  LabeledPrice,
  minorUnits,
  optionalNote,
  priceLabel,
} from "./narrow.js";

export { describePayment, isWallet, readPayment } from "./payment.js";
export type { CardPayment, CodPayment, Payment, WalletPayment } from "./payment.js";
