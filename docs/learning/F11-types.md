# F11 — Generics, utility types, mapped and conditional types, Express Request

## What this task is
There is no new HTTP route. `labs/f11-types/` is a separate TypeScript program, on the same split as F10. `npm run lab:f11` compiles it to `labs/f11-types/dist/` and prints four lines. `npm run typecheck` still checks `src/` only. `npm test` compiles the lab, checks the runtime results, and compiles `labs/f11-types/reject/unsafe.ts` expecting `tsc` to fail.

The four lines are `1 Cup ₹`, `seller 7`, `anonymous`, and `data`. The first is a repository-assigned id, a patched name, and a currency symbol. The next two are labels from a real Express request. The last is the only key of the success envelope.

## Request flow
`src/app.ts` and `src/server.ts` do not import the lab. Health, readiness, and the request id are unchanged. F05 still stores that id on a child logger in a `WeakMap`.

`labelOnRequest` builds a separate Express app, disables `X-Powered-By`, and listens on `127.0.0.1` port 0. It parses the actor before `listen`. `undefined` leaves `req.actor` unset. Any other value goes through `readActor`, and the handler then calls `assignActor`. The response body is `actorLabel(req)`. The server closes before the promise resolves. That listener is not the process in `src/server.ts`.

## Generics
`ApiSuccess<T>` is `{ data: T }`. That is the same envelope as `SuccessBody<T>` in `src/app.ts`. The lab defines it again so the program does not import the HTTP app. `ok` returns that object. `isApiSuccess` is a generic type predicate: the caller passes `isData`, and a true result narrows the whole envelope. The predicate does not copy. `readSuccess` does, and it rejects a body whose only key is not `data`.

`Repository<TFields>` has `findById` and `insert`. The type argument is the insert payload. `FieldsWithoutId<ProductDraft>` is `never` because `id` is already a key, so `insert` accepts `never` and a product object does not typecheck. `NewProduct` is the payload that does. An empty array is still assignable to `readonly never[]`, so that mistake is reported on `insert`, not on the empty seed. `WithId<T>` is the stored row.

The memory repository is not the Sequelize pool. `findById` returns a copy, or `undefined`. `insert` copies enumerable own fields, assigns `max(id) + 1`, and refuses an own `id` by rejecting the promise. A throw inside `then` is that rejection. A bad seed throws from the factory itself, before a promise exists. The repository does not know which other keys a future entity allows. `readNewProduct` is the product boundary: exact keys `name`, `priceMinor`, and `currency`.

## Utility types
`ProductPatch` is `Partial<Pick<ProductDraft, "name" | "priceMinor" | "currency">>`. A typed caller cannot put `id` in the patch. `Partial` still means each field is `string | undefined` or the matching optional type, so `patch.name` is not a `string` until a check. `applyPatch` treats `undefined` as "leave the stored value" and throws on any other key, including `id`.

`NewProduct` is `Omit<ProductDraft, "id">`. `productKey` returns `Pick<ProductDraft, "id">`.

`CURRENCY_SYMBOL` is `as const satisfies Record<CurrencyCode, string>`. A new currency with no symbol fails the build. `Readonly` shows up as the return type of `freezeProduct`. The annotation is erased. `Object.freeze` on a fresh copy is what blocks `frozen.name = "Cup"` at runtime. The freeze is shallow. This product's fields are primitives, so there is no nested object left mutable.

## Mapped and conditional types
`Nullable<T>` maps every field to `T[K] | null`. That is not `Partial`. The field is still required, and the extra value is `null`, not a missing property. `requireName` narrows `name === null` and then reads a `string`. The other fields may stay `null`.

`KeysOfType<T, V>` keeps the keys whose values extend `V`, then indexes with `[keyof T]` to make a union. `-?` includes optional fields. `numericProductKeys` returns `{ id: true, priceMinor: true }`. `stringProductKeys` returns `{ name: true, currency: true }` because the currency union extends `string`. Those objects are handwritten. A missing key fails `tsc`. The mapped type does not loop at runtime.

`UnwrapData<T>` is `T extends ApiSuccess<infer D> ? D : never`. `successName` assigns `body.data` to that type, so the conditional has to resolve to `{ name: string }`. `IdOf<T>` uses `infer` on `{ id: infer I }`. `draftId` returns `IdOf<ProductDraft>`, which is `number` because the argument is concrete. A naked type parameter distributes: `IdOf<A | B>` becomes `IdOf<A> | IdOf<B>`.

## Express Request
`declare module "express-serve-static-core"` adds `actor?: RequestActor` to the `Request` interface that `import { Request } from "express"` extends. The field is optional. A required `actor` would let a public handler read `req.actor.id` when no check had run. `no-namespace` rejects the other documented hook, `namespace Express` inside `declare global`, in this `.ts` module. The module merge is the one the lab uses. It applies only to a compilation that loads `request.ts`. `src/` does not load it.

`RequestActor` is `{ id: number, role: "buyer" | "seller" }`. `admin` is not a role. `readActor` accepts a plain object with exactly those two keys, requires a positive safe integer id, and returns a new object. A numeric string, `0`, an array, `null`, a class instance, and an extra key all fail. `Object.create(null)` with the two fields is accepted, and the copy's prototype is `Object.prototype`.

`hasActor` is `req is Request & { actor: RequestActor }`. The true branch can read `req.actor.id` without a further `undefined` check. The predicate calls `isRequestActor`, so a property that was attached without `readActor` is still checked. Extra keys fail closed and `actorLabel` returns `anonymous`. `assignActor` stores the copy from `readActor`.

## Security
A generic, a utility type, and a module augmentation are all erased. None of them rejects a JSON body. `readProduct`, `readNewProduct`, `readSuccess`, and `readActor` are the boundaries. They throw `TypeError` and the message does not include the rejected value, so a long name or an unexpected field is not copied into the error text. A product name is trimmed first. A trailing newline is stripped with the other surrounding whitespace. A newline between characters is still rejected. The stored name is at most 80 UTF-16 code units.

`readSuccess` rejects any key other than `data`. `readActor` rejects any key other than `id` and `role`, which drops a smuggled `admin: true` by failing the call rather than storing it. The role allowlist is the authorization stand-in for this lab. It is not a session and it is not the HTTP app.

The memory repository will copy extra enumerable fields if a caller skips `readNewProduct`. That is the limitation of a generic insert. The parser is the allowlist.

`labs/f11-types/reject/unsafe.ts` is outside the lab program. `tsc` reports three errors: `req.actor` is possibly `undefined`, `frozen.name` is read-only, and `patch.name` is `string | undefined`. ESLint ignores `labs/**/reject/**`. Loading `readActor` from that file is what brings the module merge into the reject compilation. Without that import, `actor` would be an unknown property instead of an optional one.

## Interview questions
1. Why `Repository<TFields>` instead of one repository that returns `any`? The type argument is the insert payload. `findById` returns that payload plus `id`, or `undefined`. Naming `ProductDraft` makes the payload `never`, so `insert` rejects a product object. `NewProduct` is the type argument that typechecks. An empty seed does not catch it, because `[]` is assignable to `readonly never[]`.
2. What does `Omit<ProductDraft, "id">` change at runtime? Nothing. `readNewProduct` is the check that rejects an `id` key. `insert` rejects an own `id` again and assigns the next integer.
3. How do `Partial`, `Nullable`, and `Readonly` differ? `Partial` adds `undefined` and makes the field optional. `Nullable` adds `null` and leaves the field required. `Readonly` forbids assignment in `tsc` and disappears from the emitted JavaScript. `Object.freeze` is the runtime block, and it is shallow.
4. Why does `patch.name` not have type `string`? `ProductPatch` is a `Partial`. The property type is `string | undefined`. An empty patch is valid. `applyPatch` skips `undefined` and validates any value that is present.
5. What does `satisfies Record<CurrencyCode, string>` catch? A currency with no symbol fails the build. `KeysOfType` does the same job for the numeric and string field sets: the returned object has to name every matching key.
6. What does `infer` bind in `UnwrapData`? The payload inside `ApiSuccess<...>`. A value that is not that envelope becomes `never`. `successName` forces the conditional to resolve on a concrete `{ name: string }` body.
7. Why is `actor` optional? The field is missing until a check assigns it. Health does not run that check. A required field would type `req.actor.id` as a number on every request.
8. Why does `hasActor` call `isRequestActor` again? The annotation is erased. Any JavaScript can set `req.actor`. The predicate fails closed when the value is not exactly `id` and an allowed role.
9. Why doesn't `src/` see `actor`? The application `tsconfig.json` includes `src/**/*.ts` only. The merge lives in a module that `src/` never loads. F05 still uses the `WeakMap` for the request id.
10. Why is a type predicate not enough at the boundary? `isApiSuccess` and `isRequestActor` narrow the existing object. `readSuccess` and `readActor` return new objects and reject unexpected keys. A predicate that returns true leaves those keys in place.

## From-scratch exercise
In an empty folder, add a strict `tsconfig.json` with `noEmit`. Declare an interface with `id: number` and `name: string`, and `type Patch<T> = Partial<Pick<T, "name">>`. Assign `patch.name` to a `string` and confirm `tsc` fails until you check for `undefined`. Then add `declare module "express-serve-static-core" { interface Request { actor?: { id: number } } }` and a function that returns `req.actor.id` with no check. Confirm `tsc` fails. Narrow with `req.actor !== undefined` and confirm it passes. Call that function from JavaScript with `{}` and confirm the type error is gone and the runtime still needs a check.
