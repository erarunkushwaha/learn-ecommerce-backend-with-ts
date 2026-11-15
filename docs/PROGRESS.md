# Project Progress

## Status
F10 is verified. `labs/f10-types/` is a separate TypeScript program for interfaces, unions, intersections, and narrowing. `npm run lab:f10` compiles it and prints the demo. `npm run typecheck` is still `tsc --noEmit` for `src/` only. `npm run lint` is ESLint 9 with type-aware rules on `src/` and on the lab project. `npm run format:check` is Prettier on the code files, including `labs/`. `npm test` compiles `src/`, then runs Node's test runner on a quoted `tests/**/*.test.mjs` glob. The F10 tests compile the lab again. `GET /api/v1/health` is still liveness. `GET /api/v1/ready` reports MySQL. The process entry runs that probe before listen and exits when MySQL is refused or the password is rejected. SIGINT and SIGTERM drain the HTTP server and then the pool. Redis is not probed. Migrations still do not run at startup. `sync({ force: true })` is not used.

## Current / next task
- **Task ID:** F11
- **Title:** TypeScript lab: generics, utility types, conditional/mapped types and safe Express Request augmentation
- **Expected outcome:** A runnable lab for those type concepts, including a safe Express `Request` augmentation. Do not start it in the F10 session.
- **Scope limits:** do not add user, catalog, or auth routes. Do not add Redis or BullMQ clients. Do not start F11 here.

## Completed and verified tasks
- **F01** — Bootstrap npm, strict TypeScript, scripts, gitignore, and README. Verified 2026-11-11 on Node v22.12.0 / npm 10.9.0.
- **F02** — Express app/server, `/api/v1`, and liveness health. Verified 2026-11-11 on Node v22.12.0 / npm 10.9.0.
- **I01** — Compose MySQL 26.7.0 and Redis 8.2, host-side env contract, and connectivity check. Verified 2026-11-11 on Node v22.12.0 / npm 10.9.0, Docker Engine 28.5.1, Compose v2.40.3.
- **F03** — Zod environment schema for `PORT`, `MYSQL_*`, and `REDIS_*`. Verified 2026-11-12 on Node v22.12.0 / npm 10.9.0. Zod 4.6.7.
- **F04** — Typed `AppError` / `NotFoundError` and one Express error middleware. Verified 2026-11-12 on Node v22.12.0 / npm 10.9.0. Express 5.3.0.
- **F05** — Structured JSON logger, `X-Request-Id`, access logs, and a stderr copy of hidden errors. Verified 2026-11-13 on Node v22.12.0 / npm 10.9.0.
- **F06** — One module-cached Sequelize pool for Compose MySQL. Verified 2026-11-15 on Node v22.12.0 / npm 10.9.0. Sequelize 6.37.8, mysql2 3.24.6. Compose MySQL was healthy on `127.0.0.1:3307`.
- **F07** — Umzug migrations and seeders, disposable `ecom_test`, and the baseline migration. Verified 2026-11-15 on Node v22.12.0 / npm 10.9.0. Umzug 3.8.3. `ecom` was left migrated and seeded. `ecom_test` was dropped.
- **F08** — Liveness stays process-only. Readiness reports MySQL. Startup exits when that probe fails. SIGINT and SIGTERM drain HTTP and the pool. Verified 2026-11-15 on Node v22.12.0 / npm 10.9.0. Compose MySQL was healthy on `127.0.0.1:3307`.
- **F09** — ESLint 9 flat config, Prettier, and a quoted Node test glob. `typecheck` stays no-emit. Verified 2026-11-15 on Node v22.12.0 / npm 10.9.0. ESLint 9.39.5, typescript-eslint 8.72.2, Prettier 3.10.1.
- **F10** — TypeScript lab for interfaces, unions, intersections, and narrowing under `labs/f10-types/`. The HTTP app does not import it. Verified 2026-11-15 on Node v22.12.0 / npm 10.9.0. TypeScript 5.9.3.

## Checks performed
- `npm run typecheck` — exit 0. `tsc -p tsconfig.json --noEmit`.
- `npm run lint` — exit 0. `eslint .`
- `npm run format:check` — exit 0. Prettier reported all matched files use its style.
- `npm run lab:f10` — exit 0. Printed `Mug ₹`, `Kitchen`, `card visa 4242`, and `seller@example.com`.
- `npm test` — exit 0. Compiled `src/`, then 63 passed, 0 failed (the previous 60 plus three tests in `tests/f10-types.test.mjs`). The spec reporter printed `ℹ pass 63` / `ℹ fail 0`. Compose MySQL on `127.0.0.1:3307` accepted the existing database tests.
- `npm audit` was not run. No dependency was added.
- The dev process already listening on `127.0.0.1:3000` was not restarted. `npm test` recompiled `dist`. The listening process is still the previous one. F10 does not change the HTTP contract.

## Blockers
_None for F10._

## Decisions made in implementation
- ADR-001 (accepted): ESM with TypeScript `NodeNext`.
- ADR-002 (accepted): Express 5, `createApp()` does not listen, `/api/v1`, success body `{ data }`, loopback bind, liveness-only health.
- ADR-003 (accepted): Compose MySQL 26.7.0 on `127.0.0.1:3307` with a named volume, Redis 8.2 on `127.0.0.1:6379`, Node on the host, ping only. Homebrew datadir stays separate.
- ADR-004 (accepted): one Zod schema in `src/config/env.ts`. `MYSQL_ROOT_PASSWORD` stays out of the app config. `startServer()` with no argument validates the full contract. `startServer(port)` is the in-process test seam.
- ADR-005 (accepted): error body `{ "error": { "status", "code", "message" } }`. `not_found`, `not_ready`, and `internal_error` are the codes defined now. Unknown methods and paths are JSON 404s. Express 5 needs no async wrapper. `errorHandler` must keep four parameters.
- ADR-006 (accepted): one JSON log object per line. `info` on stdout, `error` on stderr. `LOG_LEVEL` defaults to `info`. `X-Request-Id` is the correlation header and is not part of the JSON body. Hidden failures are logged with message and stack. Client `AppError`s are not repeated as error lines.
- ADR-007 (accepted): one Sequelize instance in module scope. `getSequelize` calls `loadConfig`. Pool `max` 5, `min` 0. No models and no `sync()`. ADR-010 supersedes the "wrong password still listens" and unwired-`closeSequelize` consequences.
- ADR-008 (accepted): Umzug runners for compiled migration and seeder files. History tables `SequelizeMeta` and `SequelizeData`. The CLI uses `readMysqlSettings`. The HTTP process does not migrate. Tests use disposable `ecom_test`.
- ADR-009 (accepted): application ids are `BIGINT UNSIGNED AUTO_INCREMENT`. Money, when a table has a price, is `DECIMAL(12,2)` plus `CHAR(3)` currency. Timestamps are `DATETIME(3)` at session `+00:00`.
- ADR-010 (accepted): health stays liveness. `GET /api/v1/ready` uses an injected probe. The process entry passes `probeMysql` (`SELECT 1+1 AS result`), exits before listen on failure, and on SIGINT/SIGTERM drains HTTP for up to 10 seconds and then closes the pool. `createApp()` does not import the pool. Redis is not probed.
- ADR-011 (accepted): ESLint 9 flat config and Prettier. Type-aware rules apply to `src/**/*.ts`. `npm run typecheck` does not emit. `npm test` quotes `tests/**/*.test.mjs` and uses the spec reporter. ESLint 10 was not installed because it rejects Node 22.12.0. Jest and Vitest stay later. ADR-012 extends lint and Prettier to the lab project.
- ADR-012 (accepted): `labs/f10-types/` compiles with its own tsconfig to `labs/f10-types/dist/`. `npm run typecheck` stays the `src/` check. `npm run lab:f10` runs the demo. `reject/cheque.ts` is outside the lab program and must fail `tsc`. The HTTP modules do not import the lab.

## Known limitations
- An `Error.message` or stack on stderr can contain a password. The client body does not. The migration CLI prints `error.message` only. Field redaction is B07. The readiness and startup logs copy the driver message for the same reason.
- Access logs omit the query string, headers, and body. A secret placed in the path is still logged.
- `LOG_LEVEL=error` hides the listen line, the access logs, and the shutdown info lines. Hidden failures, including a failed startup probe, are still logged. The request id header is still set. The migration CLI does not read `LOG_LEVEL`. Its logger is `info`, so it does not write SQL.
- The request id is not a field on the success or error JSON.
- A log write that fails on both stdout and stderr is dropped. The logger does not handle backpressure. A connection that closes before the response finishes does not get an access line.
- `POST /api/v1/health` and `POST /api/v1/ready` are 404s, not 405s. `Allow` is not sent.
- After a successful startup probe, a later MySQL failure leaves the process up. Health stays `200`. Ready returns `503`. The process does not exit on that later failure.
- Redis is validated by `loadConfig` and is not dialed. A closed Redis port still lets the process listen.
- Signal handlers are installed after listen. A signal during the startup probe uses Node's default termination. A second signal does not start a second drain.
- `drainServer` destroys sockets that are still running after 10 seconds. `closeSequelize` then waits for a connection a handler has not released, so a stuck query can delay the final exit.
- `startServer(port)` does not validate the data-store variables, does not create the pool, and does not install signal handlers. Without `checkReady`, `GET /api/v1/ready` is `503` and opens no socket.
- `getSequelize` requires `REDIS_PASSWORD` because it uses the full schema. The migration CLI does not.
- The first successful `getSequelize` wins until `closeSequelize`. A call during `closeSequelize` receives a new instance.
- The pool cap is 5. It was not load-tested. `min: 0` means an idle process holds no MySQL socket until the startup probe borrows one. After a query, idle connections wait for the 10 second idle timeout unless shutdown closes the pool.
- Debug SQL logging is off at `info`. `bind` values stay out of the debug statement. `replacements` are escaped and then copied into that statement.
- Sequelize interpolates the time-zone constant `+00:00` into `SET time_zone`. It is not an environment value.
- `npm run infra:check` still opens a separate connection. `db:migrate` opens another short-lived pool. Neither uses the process cache.
- MySQL DDL commits immediately. `down` is the rollback. A crash after `CREATE TABLE` and before the history insert leaves the table applied with no history row. Two overlapping `db:migrate` processes are not locked.
- `migrate:undo` reverts one latest file by sorted filename. Undo seeders before undoing a migration that drops their table. History tables are not dropped.
- Umzug logs `migrating` and `migrated` for seeders too. The summary line says `seeders applied` or `seeders reverted`.
- `schema_baseline` is not a domain table. The HTTP app does not read it. Later tasks should add their own tables.
- The seeded id was the number `1`. mysql2 big-number strings are not enabled. A `BIGINT` past `Number.MAX_SAFE_INTEGER` is not exact in JavaScript.
- No money column exists yet. `DECIMAL(12,2)` assumes two minor digits.
- `MYSQL_HOST` / `MYSQL_PORT` are the host mapping. An app container must use `mysql:3306`. The schema accepts that pair; the default remains `127.0.0.1:3307`.
- Shell variables win over `.env`. `npm start`, `npm run dev`, and the `db:*` scripts require the file to exist.
- Redis `/data` is an anonymous volume created by the image. No keys are stored.
- The example passwords are local Compose credentials. They do not authenticate to Homebrew MySQL.
- Invalid config stays plain `Error` text on stderr. A failed MySQL probe adds one JSON error line and then the plain message `MySQL is unavailable`.
- Sequelize 6.37.8 depends on `uuid` 8.x. `npm audit` reports GHSA-w5hq-g745-h8pq (moderate) when a caller passes `buf`. This code does not call `uuid`. The forced fix would downgrade Sequelize to 3.30.0, so it was not applied.
- `typescript-eslint` 8.72.2 depends on `minimatch` that `npm audit` reports as GHSA-g3hv-75wg-m249 (moderate). The forced fix would downgrade `typescript-eslint` to 8.36.0. It was not applied. Lint uses the installed 8.72.2.
- npm warned that `eslint@9.39.5` is unsupported upstream, and that nested `eslint-visitor-keys@5.0.1` wants Node `^20.19.0 || ^22.13.0 || >=24`. ESLint 10 has that same engines field. `npm run lint` still exited 0 on Node 22.12.0.
- Type-aware ESLint rules cover `src/**/*.ts` and `labs/f10-types/*.ts`. They do not cover `tests/**/*.mjs`, `scripts/**/*.mjs`, or `labs/**/reject/**`. The reject file is an ESLint ignore because it is expected to fail `tsc`.
- Prettier formats `labs/` and does not format markdown, `docs/`, or `prompts/`. Print width is 100. The ignore pattern `dist` also skips `labs/f10-types/dist/`.
- `npm test` writes `dist`. The F10 test also writes `labs/f10-types/dist/`. `npm run typecheck` writes neither. Two compiles writing the same `outDir` at the same time can interleave.
- The lab's two tsconfigs (application and `labs/f10-types`) can drift. `npm run typecheck` can pass while the lab is broken. `npm test` and `npm run lab:f10` are the lab checks.
- Annotations in the lab are erased. `describePayment` trusts a `Payment`. `readPayment` is the `unknown` boundary. A `pan` field on the input is not copied. `last4` is a four-digit shape check.
- `"email" in identity` takes the email branch when both fields are present. `labelAccount` therefore returns the email.
- `OpenListing & ClosedListing` is `never`. `StringId & NumericId` keeps `name: string` and makes `id` `never`. `assertNever` throws `unexpected value` plus `typeof`, and it does not print the value.
- `isRecord` accepts plain objects and `Object.create(null)`. It rejects arrays, `null`, and class instances. `instanceof LabeledPrice` fails for a plain object and for an instance from another realm.
- `labs/f10-types/reject/cheque.ts` fails `tsc` because `"cheque"` is not a payment method. The same payload fails `readPayment` at runtime with `payment method is not supported`.
- `HistoryTable` is the union of the two exported history-table names. The unused runtime array was removed so lint would accept the file. The legal names are unchanged.

## Recent task handoff (keep <= 12 lines)
- Completed: F10
- Next task: F11 (generics, utility types, conditional/mapped types, Express Request augmentation). Do not start it here
- Lab: `labs/f10-types/`. Run: `npm run lab:f10`. Notes: `docs/learning/F10-types.md`, ADR-012
- `npm run typecheck` still checks `src/` only and does not emit
- `npm test`: 63 passed, 0 failed. It also compiles the lab and expects `reject/cheque.ts` to fail `tsc`
- Lint type-checks `src/` and `labs/f10-types/*.ts`. `labs/**/reject/**` is ignored. Prettier includes `labs/`
- Health and ready are unchanged. Redis is not dialed. Migrations do not run at startup
- The process on port 3000 was not restarted. F10 does not change the HTTP contract
- No new dependency. `npm audit` was not run
- Keep the volume: `docker compose down` is safe; do not add `-v`
