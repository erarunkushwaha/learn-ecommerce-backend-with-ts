# F10 — Types, interfaces, unions, intersections, and narrowing

## What this task is
There is no new HTTP route. `labs/f10-types/` is a separate TypeScript program. `npm run lab:f10` compiles it to `labs/f10-types/dist/` and prints four lines. `npm run typecheck` still checks `src/` only. `npm test` compiles the lab, checks the runtime results, and compiles `labs/f10-types/reject/cheque.ts` expecting `tsc` to fail.

The application `tsconfig.json` has `rootDir` set to `src`. A lesson file under `src/` would be emitted into the HTTP `dist/`. The lab tsconfig uses the same strict flags and `NodeNext`, and its `include` is `./*.ts` in `labs/f10-types/`. The `reject/` file sits outside that include on purpose.

## Request flow
None. `src/app.ts` and `src/server.ts` do not import the lab. `isAppError` in `src/common/errors/app-error.ts` is the same kind of `instanceof` narrowing the lab practices with `LabeledPrice`. This task does not change that handler.

## `interface` and `type`
`CatalogRecord` is declared twice in `shapes.ts`. The two declarations merge, so a value needs both `id` and `updatedAt`. `ProductCard extends CatalogRecord` adds `kind`, `name`, and `currency`. Declaration merging and `extends` are interface features.

`CurrencyCode` is `"USD" | "INR" | "EUR"`. `CatalogCard` is `ProductCard | CategoryCard`. Those aliases are type aliases. An interface describes a single object shape; it does not list alternatives.

`SellerAccount` is `EmailIdentity & DisplayIdentity`, so it has both `email` and `displayName`. `ConflictingId` is `StringId & NumericId`: `name` stays `string`, and `id` is `string & number`, which is `never`. `ListingConflict` is `OpenListing & ClosedListing`. Those two interfaces are variants of one discriminant, so the whole intersection is `never` rather than an object that still carries `stock` and `reason`.

## Narrowing that still exists at runtime
Annotations are erased. The functions are the part Node runs.

- `minorUnits` starts from `unknown` and uses `typeof` before it treats the value as a number.
- `optionalNote` uses `note === null` and then calls `trim`.
- `priceLabel` uses `instanceof LabeledPrice`. A plain object with a `label` field stays `undefined`.
- `identityLabel` uses `"email" in identity`. `labelAccount` passes a `SellerAccount` into that union. The account has both fields, so the `in` check takes the email branch.
- `cardLabel`, `currencySymbol`, `describeListing`, and `describePayment` switch on a literal discriminant. The `default` arm calls `assertNever`. If a variant is added and the switch is not updated, `tsc` fails because the leftover value is not `never`.
- `isWallet` is a type predicate: `payment is WalletPayment`. After a true result, TypeScript treats the value as a wallet.
- `readPayment` accepts `unknown`. Each `method === "..."` branch returns a fresh object. `brand === "visa" || brand === "mastercard"` narrows `unknown` to those two literals. A negative check on `unknown` would not. `isRecord` uses `Reflect.getPrototypeOf`, whose return type is `object | null`. `Object.getPrototypeOf` is declared as returning `any` in the ES5 library, and that assignment fails the type-aware lint rule.

`assertListingConflict` and `readConflictingId` show the erasure. Their parameter or property is `never`, so a typed caller cannot build a valid argument. The compiled functions still run. The test calls them from JavaScript. `assertListingConflict` throws `unexpected value object`. `readConflictingId` reads `id` and throws `unexpected value string`.

## Security
A union is not a validator. `describePayment` trusts a `Payment`. `readPayment` is the boundary: `isRecord` rejects `null`, arrays, and class instances, including `Date` and `LabeledPrice`. `Object.create(null)` is accepted. The card branch copies `last4` and `brand` into a new object. A `pan` field on the input is not copied. `last4` has to be four digits. That is a shape check, not a card-number check, and the lab stores no PAN.

`assertNever` interpolates `typeof value` only. A bad runtime object can still reach that throw if a caller skips `readPayment`. The message does not dump the object, so a card number placed on it is not written into the error text.

Types do not authorize a request. They do not replace Zod on an HTTP body. F03 already validates environment variables at startup; request-body schemas are a later task.

`labs/f10-types/reject/cheque.ts` is the compile-time counterpart. `describePayment({ method: "cheque", last4: "4242" })` is rejected by `tsc`. The same payload fails at runtime inside `readPayment` with `payment method is not supported`. ESLint ignores `labs/**/reject/**` so a file that must fail `tsc` is not a lint failure.

## Interview questions
1. When do you pick an interface, and when a type alias? An interface for an object contract you may `extend` or merge. A type alias for a union, an intersection, a primitive, or a tuple. `CatalogCard` and `CurrencyCode` are aliases because they are alternatives.
2. What is declaration merging? Two `interface CatalogRecord` blocks in the same module become one type. A `type` alias with the same name would be a duplicate declaration, not a merge.
3. What is the difference between `|` and `&`? `Identity` is an email object or a display-name object. `SellerAccount` is an object with both fields. `StringId & NumericId` leaves `name: string` and `id: never`. `OpenListing & ClosedListing` is `never` entirely, because the shared discriminant disagrees.
4. Why put a shared literal on each variant? `method` and `kind` and `state` let a `switch` narrow the rest of the object. `"email" in identity` also narrows, and it prefers the email branch whenever both fields are present.
5. What does the `never` default buy? A missing `case` stops the build. The check disappears from the emitted JavaScript. `assertNever` throws if a JavaScript caller reaches it anyway, and the message keeps the value out of the string.
6. Why is `readPayment` typed as `unknown` while `describePayment` takes `Payment`? Untrusted input has no type until a check runs. Code that already holds a `Payment` can switch on `method` without parsing again.
7. Why does `brand !== "visa" && brand !== "mastercard"` fail to narrow `unknown`? Excluding literals from `unknown` leaves `unknown`. A positive `===` comparison produces the literal type.
8. What does `instanceof` require? A runtime constructor. An interface has none. `priceLabel` can see `LabeledPrice` and cannot see `ProductCard`.
9. Why is this lab outside `src/`? The application tsconfig emits everything under `src/` into the HTTP `dist/`. The lab has its own `outDir`. `npm run typecheck` stays the application check.

## From-scratch exercise
In an empty folder, add a strict `tsconfig.json` with `noEmit` and `noFallthroughCasesInSwitch`. Write `payment.ts` with a `card | cod` union and a `switch` whose `default` assigns the value to `never`. Run `npx tsc --noEmit` and confirm it passes. Add a `wallet` variant and confirm `tsc` fails until the switch handles it. Then write `readPayment(value: unknown)` that returns the union only after `method` and the matching fields have been checked, and confirm a call with `{ method: "cheque" }` fails both `tsc` (when passed straight to the switch function) and the runtime parser.
