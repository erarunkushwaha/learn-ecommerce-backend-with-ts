# Project Progress

## Status
F04 is verified. `AppError` and `NotFoundError` are the typed HTTP failures. `createApp()` mounts routes, then a JSON 404, then one error middleware. Unexpected throws become a generic 500 with no stack and no original message. There is still no logger, request ID, Sequelize pool, auth, or readiness check.

## Current / next task
- **Task ID:** F05
- **Title:** Structured logger, request IDs and HTTP request logging
- **Expected outcome:** a structured logger and request IDs, including a server-side record of the real error that the F04 handler hides
- **Scope limits:** do not add Sequelize, auth, readiness, or Redis/BullMQ. The error JSON envelope stays as ADR-005 defined it.

## Completed and verified tasks
- **F01** — Bootstrap npm, strict TypeScript, scripts, gitignore, and README. Verified 2026-11-11 on Node v22.12.0 / npm 10.9.0.
- **F02** — Express app/server, `/api/v1`, and liveness health. Verified 2026-11-11 on Node v22.12.0 / npm 10.9.0.
- **I01** — Compose MySQL 26.7.0 and Redis 8.2, host-side env contract, and connectivity check. Verified 2026-11-11 on Node v22.12.0 / npm 10.9.0, Docker Engine 28.5.1, Compose v2.40.3.
- **F03** — Zod environment schema for `PORT`, `MYSQL_*`, and `REDIS_*`. Verified 2026-11-12 on Node v22.12.0 / npm 10.9.0. Zod 4.6.7.
- **F04** — Typed `AppError` / `NotFoundError` and one Express error middleware. Verified 2026-11-12 on Node v22.12.0 / npm 10.9.0. Express 5.3.0.

## Checks performed
- `npm test` — exit 0. Compiles with `tsc -p tsconfig.json`, then 30 passed, 0 failed (`tests/bootstrap.test.mjs`, `tests/config.test.mjs`, `tests/data-stores.test.mjs`, `tests/errors.test.mjs`, `tests/health.test.mjs`).
- `npm run typecheck` — exit 0 (`tsc -p tsconfig.json --noEmit`).

## Blockers
_None for F04._

## Decisions made in implementation
- ADR-001 (accepted): ESM with TypeScript `NodeNext`.
- ADR-002 (accepted): Express 5, `createApp()` does not listen, `/api/v1`, success body `{ data }`, loopback bind, liveness-only health.
- ADR-003 (accepted): Compose MySQL 26.7.0 on `127.0.0.1:3307` with a named volume, Redis 8.2 on `127.0.0.1:6379`, Node on the host, ping only. Homebrew datadir stays separate.
- ADR-004 (accepted): one Zod schema in `src/config/env.ts`. `MYSQL_ROOT_PASSWORD` stays out of the app config. `startServer()` with no argument validates the full contract. `startServer(port)` is the in-process test seam.
- ADR-005 (accepted): error body `{ "error": { "status", "code", "message" } }`. `not_found` and `internal_error` are the codes defined now. Unknown methods and paths are JSON 404s. The handler does not log. Express 5 needs no async wrapper. `errorHandler` must keep four parameters.

## Known limitations
- A 500 is not written to stderr. The client sees `internal_error` and the process keeps no copy of the cause. Logging and request IDs are F05.
- `POST /api/v1/health` is a 404, not a 405. `Allow` is not sent.
- Health does not check MySQL or Redis. A wrong password still lets the process listen. Readiness and graceful shutdown are F08.
- `startServer(port)` with an explicit port does not validate the data-store variables. The process entry does. A later pool should call `loadConfig` itself.
- `MYSQL_HOST` / `MYSQL_PORT` are the host mapping. An app container must use `mysql:3306`. The schema accepts that pair; the default remains `127.0.0.1:3307`.
- Shell variables win over `.env`. `npm start` and `npm run dev` require the file to exist.
- Redis `/data` is an anonymous volume created by the image. No keys are stored.
- The example passwords are local Compose credentials. They do not authenticate to Homebrew MySQL.
- Startup config failures stay plain `Error` text on stderr. They happen before a response exists.

## Recent task handoff (keep <= 12 lines)
- Completed: F04
- Next task: F05 (structured logger, request IDs, HTTP logging; do not add Sequelize)
- Errors: `src/common/errors/app-error.ts`, handler `src/common/middleware/error-handler.ts`
- Error JSON is `{ "error": { "status", "code", "message" } }`. Success stays `{ "data" }`
- Unknown `Error.message` is hidden. `AppError.message` is client-visible
- `errorHandler.length` must stay 4. `notFoundHandler.length` must stay 3
- The handler does not log a 500. F05 should record the real error server-side
- Health stays liveness-only. `POST /api/v1/health` is 404
- MySQL from the host: `127.0.0.1:3307`, database `ecom`, user `ecom`
- Redis: `127.0.0.1:6379` with `REDIS_PASSWORD`; no cache and no BullMQ
- Keep the volume: `docker compose down` is safe; do not add `-v`
- Read next: `docs/ROADMAP.md` F05, ADR-005, `docs/learning/F04-error-handling.md`
