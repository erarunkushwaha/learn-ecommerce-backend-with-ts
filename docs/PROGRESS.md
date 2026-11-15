# Project Progress

## Status
F07 is verified. Compose `ecom` on `127.0.0.1:3307` has `schema_baseline`, `SequelizeMeta`, and `SequelizeData`. The baseline migration creates that first table and rolls it back. Tests do that on `ecom_test` and then drop it. The HTTP process still does not migrate, query, or check readiness. `sync({ force: true })` is not used.

## Current / next task
- **Task ID:** F08
- **Title:** Readiness/liveness checks, startup failure and graceful shutdown
- **Expected outcome:** liveness stays a process check. Readiness reports MySQL. Startup fails when the database is required and unavailable. SIGINT and SIGTERM drain the HTTP server and the pool.
- **Scope limits:** do not add user, catalog, or auth routes. Do not add Redis or BullMQ clients.

## Completed and verified tasks
- **F01** — Bootstrap npm, strict TypeScript, scripts, gitignore, and README. Verified 2026-11-11 on Node v22.12.0 / npm 10.9.0.
- **F02** — Express app/server, `/api/v1`, and liveness health. Verified 2026-11-11 on Node v22.12.0 / npm 10.9.0.
- **I01** — Compose MySQL 26.7.0 and Redis 8.2, host-side env contract, and connectivity check. Verified 2026-11-11 on Node v22.12.0 / npm 10.9.0, Docker Engine 28.5.1, Compose v2.40.3.
- **F03** — Zod environment schema for `PORT`, `MYSQL_*`, and `REDIS_*`. Verified 2026-11-12 on Node v22.12.0 / npm 10.9.0. Zod 4.6.7.
- **F04** — Typed `AppError` / `NotFoundError` and one Express error middleware. Verified 2026-11-12 on Node v22.12.0 / npm 10.9.0. Express 5.3.0.
- **F05** — Structured JSON logger, `X-Request-Id`, access logs, and a stderr copy of hidden errors. Verified 2026-11-13 on Node v22.12.0 / npm 10.9.0.
- **F06** — One module-cached Sequelize pool for Compose MySQL. Verified 2026-11-15 on Node v22.12.0 / npm 10.9.0. Sequelize 6.37.8, mysql2 3.24.6. Compose MySQL was healthy on `127.0.0.1:3307`.
- **F07** — Umzug migrations and seeders, disposable `ecom_test`, and the baseline migration. Verified 2026-11-15 on Node v22.12.0 / npm 10.9.0. Umzug 3.8.3. `ecom` was left migrated and seeded. `ecom_test` was dropped.

## Checks performed
- `npm test` — exit 0. Compiles with `tsc -p tsconfig.json`, then 46 passed, 0 failed (the previous seven files plus `tests/migrations.test.mjs`). The migration test created `ecom_test` as root, applied the baseline, seeded it, undid both, rejected a seed with the table gone, applied both again, and dropped `ecom_test`. `ecom`'s table list was the same before and after that test. Logs did not contain the app password or the root password.
- `npm run typecheck` — exit 0 (`tsc -p tsconfig.json --noEmit`).
- `npm run db:migrate` — exit 0. Applied `20261115140000-baseline.js` to `ecom`. A second run logged `count` 0.
- `npm run db:seed` — exit 0. Applied `20261115140000-baseline-seed.js`. A second run logged `count` 0.
- `runSchemaCommand("migrate")` after deleting `REDIS_PASSWORD`, `REDIS_HOST`, and `REDIS_PORT` — exit 0, `count` 0.
- `GET http://127.0.0.1:3000/api/v1/health` — `200` and `{ "data": { "status": "ok" } }`. The dev server was already running and was not restarted.
- Schema read on `ecom`: `schema_baseline` (`id` bigint unsigned auto-increment, `label` varchar(32) unique, `created_at` datetime(3)), one row `id` 1 / `baseline` / `2026-11-15 00:00:00.000`, plus `SequelizeMeta` and `SequelizeData`. `SHOW DATABASES LIKE 'ecom_test'` returned no row. Engine InnoDB, collation `utf8mb4_0900_ai_ci`.
- `npm audit` — exit 1. 2 moderate findings, both the existing `uuid` buffer-bounds advisory (`uuid` < 11.1.1, and Sequelize depends on it). Umzug did not add a separate advisory. Not upgraded. The runner does not call `uuid`.

## Blockers
_None for F07._

## Decisions made in implementation
- ADR-001 (accepted): ESM with TypeScript `NodeNext`.
- ADR-002 (accepted): Express 5, `createApp()` does not listen, `/api/v1`, success body `{ data }`, loopback bind, liveness-only health.
- ADR-003 (accepted): Compose MySQL 26.7.0 on `127.0.0.1:3307` with a named volume, Redis 8.2 on `127.0.0.1:6379`, Node on the host, ping only. Homebrew datadir stays separate.
- ADR-004 (accepted): one Zod schema in `src/config/env.ts`. `MYSQL_ROOT_PASSWORD` stays out of the app config. `startServer()` with no argument validates the full contract. `startServer(port)` is the in-process test seam.
- ADR-005 (accepted): error body `{ "error": { "status", "code", "message" } }`. `not_found` and `internal_error` are the codes defined now. Unknown methods and paths are JSON 404s. Express 5 needs no async wrapper. `errorHandler` must keep four parameters.
- ADR-006 (accepted): one JSON log object per line. `info` on stdout, `error` on stderr. `LOG_LEVEL` defaults to `info`. `X-Request-Id` is the correlation header and is not part of the JSON body. Hidden failures are logged with message and stack. Client `AppError`s are not repeated as error lines.
- ADR-007 (accepted): one Sequelize instance in module scope. `getSequelize` calls `loadConfig`. The process entry builds it and does not query. Pool `max` 5, `min` 0. No models and no `sync()`.
- ADR-008 (accepted): Umzug runners for compiled migration and seeder files. History tables `SequelizeMeta` and `SequelizeData`. The CLI uses `readMysqlSettings`. The HTTP process does not migrate. Tests use disposable `ecom_test`.
- ADR-009 (accepted): application ids are `BIGINT UNSIGNED AUTO_INCREMENT`. Money, when a table has a price, is `DECIMAL(12,2)` plus `CHAR(3)` currency. Timestamps are `DATETIME(3)` at session `+00:00`.

## Known limitations
- An `Error.message` or stack on stderr can contain a password. The client body does not. The migration CLI prints `error.message` only. Field redaction is B07.
- Access logs omit the query string, headers, and body. A secret placed in the path is still logged.
- `LOG_LEVEL=error` hides the listen line and access logs. Hidden failures are still logged. The request id header is still set. The migration CLI does not read `LOG_LEVEL`. Its logger is `info`, so it does not write SQL.
- The request id is not a field on the success or error JSON.
- A log write that fails on both stdout and stderr is dropped. The logger does not handle backpressure. A connection that closes before the response finishes does not get an access line.
- `POST /api/v1/health` is a 404, not a 405. `Allow` is not sent.
- Health does not check MySQL or Redis. A wrong password still lets the process listen. Readiness and graceful shutdown are F08. `closeSequelize` is not called on SIGINT or SIGTERM. `stopServer` closes the HTTP socket only.
- `startServer(port)` does not validate the data-store variables and does not create the pool. The process entry calls `getSequelize()`, which calls `loadConfig`. It does not migrate.
- `getSequelize` requires `REDIS_PASSWORD` because it uses the full schema. The migration CLI does not.
- The first successful `getSequelize` wins until `closeSequelize`. A call during `closeSequelize` receives a new instance.
- The pool cap is 5. It was not load-tested. `min: 0` means an idle process holds no MySQL socket. After a query, idle connections wait for the 10 second idle timeout.
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
- Startup config failures stay plain `Error` text on stderr. They happen before a response exists.
- Sequelize 6.37.8 depends on `uuid` 8.x. `npm audit` reports a moderate advisory when a caller passes `buf`. This task does not call `uuid`. Installing Umzug warned that `lodash.get` and `lodash.isequal` are deprecated. They were not replaced.

## Recent task handoff (keep <= 12 lines)
- Completed: F07
- Next task: F08 (readiness, startup failure, graceful shutdown). Do not start it here
- Commands: `db:migrate`, `db:migrate:undo`, `db:seed`, `db:seed:undo`. CLI is `src/database/cli.ts`
- Runner: `src/database/migrator.ts`. Files compile to `dist/database/migrations` and `seeders`
- `ecom` is migrated and seeded. `ecom_test` is created by the test and dropped. Root stays out of app config
- Undo seeders before `migrate:undo`. History tables remain. MySQL DDL is not transactional
- HTTP entry still does not migrate or query. Health is liveness. `sync()` is not called
- Ids: `BIGINT UNSIGNED`. Money later: `DECIMAL(12,2)` plus `CHAR(3)`. See ADR-009
- `schema_baseline` is the runner proof table, not a user or product table
- Keep the volume: `docker compose down` is safe; do not add `-v`
