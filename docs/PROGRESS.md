# Project Progress

## Status
F06 is verified. The process holds one Sequelize 6 pool, created from `loadConfig`, aimed at Compose MySQL on `127.0.0.1:3307`. Building the pool opens no socket. A query borrows a connection. Health is still liveness. There are no models, migrations, or readiness checks.

## Current / next task
- **Task ID:** F07
- **Title:** Migrations, seeders, disposable test DB and first migration runner
- **Expected outcome:** a migration path for the Compose database, plus a disposable test database. The first migration can create and roll back. `sync({ force: true })` stays forbidden.
- **Scope limits:** do not add user, catalog, or auth models beyond what the first migration runner needs. Do not add Redis, BullMQ, or a readiness probe.

## Completed and verified tasks
- **F01** — Bootstrap npm, strict TypeScript, scripts, gitignore, and README. Verified 2026-11-11 on Node v22.12.0 / npm 10.9.0.
- **F02** — Express app/server, `/api/v1`, and liveness health. Verified 2026-11-11 on Node v22.12.0 / npm 10.9.0.
- **I01** — Compose MySQL 26.7.0 and Redis 8.2, host-side env contract, and connectivity check. Verified 2026-11-11 on Node v22.12.0 / npm 10.9.0, Docker Engine 28.5.1, Compose v2.40.3.
- **F03** — Zod environment schema for `PORT`, `MYSQL_*`, and `REDIS_*`. Verified 2026-11-12 on Node v22.12.0 / npm 10.9.0. Zod 4.6.7.
- **F04** — Typed `AppError` / `NotFoundError` and one Express error middleware. Verified 2026-11-12 on Node v22.12.0 / npm 10.9.0. Express 5.3.0.
- **F05** — Structured JSON logger, `X-Request-Id`, access logs, and a stderr copy of hidden errors. Verified 2026-11-13 on Node v22.12.0 / npm 10.9.0.
- **F06** — One module-cached Sequelize pool for Compose MySQL. Verified 2026-11-15 on Node v22.12.0 / npm 10.9.0. Sequelize 6.37.8, mysql2 3.24.6. Compose MySQL was healthy on `127.0.0.1:3307`.

## Checks performed
- `npm test` — exit 0. Compiles with `tsc -p tsconfig.json`, then 44 passed, 0 failed (`tests/bootstrap.test.mjs`, `tests/config.test.mjs`, `tests/data-stores.test.mjs`, `tests/database.test.mjs`, `tests/errors.test.mjs`, `tests/health.test.mjs`, `tests/logging.test.mjs`). The pool test bound a quoted secret, read `DATABASE()`, `@@port` 3306, time zone `+00:00`, charset `utf8mb4`, and a container hostname, and rejected a wrong password.
- `npm run typecheck` — exit 0 (`tsc -p tsconfig.json --noEmit`).
- `npm audit` — 1 moderate advisory: Sequelize depends on `uuid` 8.x (`Missing buffer bounds check` when `buf` is passed). This pool does not call `uuid`. Not upgraded.

## Blockers
_None for F06._

## Decisions made in implementation
- ADR-001 (accepted): ESM with TypeScript `NodeNext`.
- ADR-002 (accepted): Express 5, `createApp()` does not listen, `/api/v1`, success body `{ data }`, loopback bind, liveness-only health.
- ADR-003 (accepted): Compose MySQL 26.7.0 on `127.0.0.1:3307` with a named volume, Redis 8.2 on `127.0.0.1:6379`, Node on the host, ping only. Homebrew datadir stays separate.
- ADR-004 (accepted): one Zod schema in `src/config/env.ts`. `MYSQL_ROOT_PASSWORD` stays out of the app config. `startServer()` with no argument validates the full contract. `startServer(port)` is the in-process test seam.
- ADR-005 (accepted): error body `{ "error": { "status", "code", "message" } }`. `not_found` and `internal_error` are the codes defined now. Unknown methods and paths are JSON 404s. Express 5 needs no async wrapper. `errorHandler` must keep four parameters.
- ADR-006 (accepted): one JSON log object per line. `info` on stdout, `error` on stderr. `LOG_LEVEL` defaults to `info`. `X-Request-Id` is the correlation header and is not part of the JSON body. Hidden failures are logged with message and stack. Client `AppError`s are not repeated as error lines.
- ADR-007 (accepted): one Sequelize instance in module scope. `getSequelize` calls `loadConfig`. The process entry builds it and does not query. Pool `max` 5, `min` 0. No models and no `sync()`.

## Known limitations
- An `Error.message` or stack on stderr can contain a password. The client body does not. Field redaction is B07.
- Access logs omit the query string, headers, and body. A secret placed in the path is still logged.
- `LOG_LEVEL=error` hides the listen line and access logs. Hidden failures are still logged. The request id header is still set.
- The request id is not a field on the success or error JSON.
- A log write that fails on both stdout and stderr is dropped. The logger does not handle backpressure. A connection that closes before the response finishes does not get an access line.
- `POST /api/v1/health` is a 404, not a 405. `Allow` is not sent.
- Health does not check MySQL or Redis. A wrong password still lets the process listen. The pool object exists either way. Readiness and graceful shutdown are F08. `closeSequelize` is not called on SIGINT or SIGTERM. `stopServer` closes the HTTP socket only.
- `startServer(port)` does not validate the data-store variables and does not create the pool. The process entry calls `getSequelize()`, which calls `loadConfig`.
- `getSequelize` requires `REDIS_PASSWORD` because it uses the full schema. The pool does not open Redis.
- The first successful `getSequelize` wins until `closeSequelize`. A call during `closeSequelize` receives a new instance.
- The pool cap is 5. It was not load-tested. `min: 0` means an idle process holds no MySQL socket. After a query, idle connections wait for the 10 second idle timeout.
- Debug SQL logging is off at `info`. `bind` values stay out of the debug statement. `replacements` are escaped and then copied into that statement.
- Sequelize interpolates the time-zone constant `+00:00` into `SET time_zone`. It is not an environment value.
- No application tables exist. `sync()` is not used. `npm run infra:check` still opens a separate connection.
- `MYSQL_HOST` / `MYSQL_PORT` are the host mapping. An app container must use `mysql:3306`. The schema accepts that pair; the default remains `127.0.0.1:3307`.
- Shell variables win over `.env`. `npm start` and `npm run dev` require the file to exist.
- Redis `/data` is an anonymous volume created by the image. No keys are stored.
- The example passwords are local Compose credentials. They do not authenticate to Homebrew MySQL.
- Startup config failures stay plain `Error` text on stderr. They happen before a response exists.
- Sequelize 6.37.8 depends on `uuid` 8.x. `npm audit` reports a moderate advisory when a caller passes `buf`. This task does not call `uuid`.

## Recent task handoff (keep <= 12 lines)
- Completed: F06
- Next task: F07 (migrations, seeders, disposable test DB; no `sync({ force: true })`)
- Pool: `src/database/sequelize.ts`. `getSequelize` calls `loadConfig` and caches one instance
- Entry calls `getSequelize()` then `startServer()`. It does not `authenticate` or `query`
- `startServer(port)` and `createApp()` do not build the pool. Health stays liveness
- `min: 0`, `max: 5`, charset `utf8mb4`, time zone `+00:00`. Client port `3307`; `@@port` inside Compose is `3306`
- `closeSequelize` drains the cache. SIGINT does not call it. `infra:check` is a separate connection
- SQL at `debug` only. `logQueryParameters` is false. Prefer `bind` over `replacements` for secrets
- No models, no migrations, no Redis client. Homebrew `3306` stays out of the default
- Keep the volume: `docker compose down` is safe; do not add `-v`
