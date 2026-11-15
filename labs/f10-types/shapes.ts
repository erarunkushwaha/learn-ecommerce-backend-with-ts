import { assertNever } from "./narrow.js";

/**
 * Object contract for a catalog row.
 * The second declaration merges `updatedAt` into this same interface.
 */
export interface CatalogRecord {
  id: number;
}

export interface CatalogRecord {
  updatedAt: string;
}

/** A string union. An interface cannot name this set of alternatives. */
export type CurrencyCode = "USD" | "INR" | "EUR";

export interface ProductCard extends CatalogRecord {
  kind: "product";
  name: string;
  currency: CurrencyCode;
}

export interface CategoryCard extends CatalogRecord {
  kind: "category";
  title: string;
}

/** Each card is one alternative. The alias is the union of the two interfaces. */
export type CatalogCard = ProductCard | CategoryCard;

export interface EmailIdentity {
  email: string;
}

export interface DisplayIdentity {
  displayName: string;
}

/** One identity shape or the other. */
export type Identity = EmailIdentity | DisplayIdentity;

/** Both identity fields at once. */
export type SellerAccount = EmailIdentity & DisplayIdentity;

export interface OpenListing {
  state: "open";
  stock: number;
}

export interface ClosedListing {
  state: "closed";
  reason: string;
}

export type Listing = OpenListing | ClosedListing;

/**
 * These two variants share the discriminant `state` and disagree on it.
 * The intersection is `never`, not an object that still has `stock` and `reason`.
 */
export type ListingConflict = OpenListing & ClosedListing;

export interface StringId {
  id: string;
  name: string;
}

export interface NumericId {
  id: number;
  name: string;
}

/** `id` is `string & number`, so it is `never`. `name` stays `string`. */
export type ConflictingId = StringId & NumericId;

export function recordStamp(record: CatalogRecord): string {
  return `${record.id} @ ${record.updatedAt}`;
}

export function currencySymbol(code: CurrencyCode): string {
  switch (code) {
    case "USD":
      return "$";
    case "INR":
      return "₹";
    case "EUR":
      return "€";
    default:
      return assertNever(code);
  }
}

export function cardLabel(card: CatalogCard): string {
  switch (card.kind) {
    case "product":
      return `${card.name} ${currencySymbol(card.currency)}`;
    case "category":
      return card.title;
    default:
      return assertNever(card);
  }
}

/**
 * `"email" in identity` splits the union.
 * A seller account has both fields, so this returns the email.
 */
export function identityLabel(identity: Identity): string {
  if ("email" in identity) {
    return identity.email;
  }
  return identity.displayName;
}

export function sellerAccount(email: string, displayName: string): SellerAccount {
  return { email, displayName };
}

export function labelAccount(account: SellerAccount): string {
  return identityLabel(account);
}

export function describeListing(listing: Listing): string {
  switch (listing.state) {
    case "open":
      return `open ${listing.stock}`;
    case "closed":
      return `closed ${listing.reason}`;
    default:
      return assertNever(listing);
  }
}

export function assertListingConflict(listing: ListingConflict): never {
  return assertNever(listing);
}

export function readConflictingId(row: ConflictingId): never {
  return assertNever(row.id);
}
