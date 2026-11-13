# Project Progress

## Status
F05 is verified. Each response carries `X-Request-Id`. Access logs are one JSON object per line on stdout. A failure the client must not see is an `error` line on stderr, including the message and stack. The JSON envelopes are unchanged. There is still no Sequelize pool, auth, or readiness check.

## Current / next task
- **Task ID:** F06
- **Title:** Configure MySQL + Sequelize pooled singleton/module instance
- **Expected outcome:** one pooled Sequelize connection for the process, using the I01 env vars and Compose MySQL on `127.0.0.1:3307`
- **Scope limits:** do not add migrations, seeders, models, readiness, or Redis/BullMQ. Keep Homebrew MySQL on port 3306 out of this app.

## Completed and verified tasks
- **F01** — Bootstrap npm, strict TypeScript, scripts, gitignore, and README. Verified 2026-11-11 on Node v22.12.0 / npm 10.9.0.
- **F02** — Express app/server, `/api/v1`, and liveness health. Verified 2026-11-11 on Node v22.12.0 / npm 10.9.0.
- **I01** — Compose MySQL 26.7.0 and Redis 8.2, host-side env contract, and connectivity check. Verified 2026-11-11 on Node v22.12.0 / npm 10.9.0, Docker Engine 28.5.1, Compose v2.40.3.
- **F03** — Zod environment schema for `PORT`, `MYSQL_*`, and `REDIS_*`. Verified 2026-11-12 on Node v22.12.0 / npm 10.9.0. Zod 4.6.7.
- **F04** — Typed `AppError` / `NotFoundError` and one Express error middleware. Verified 2026-11-12 on Node v22.12.0 / npm 10.9.0. Express 5.3.0.
- **F05** — Structured JSON logger, `X-Request-Id`, access logs, and a stderr copy of hidden errors. Verified 2026-11-13 on Node v22.12.0 / npm 10.9.0.

## Checks performed
- `npm test` — exit 0. Compiles with `tsc -p tsconfig.json`, then 40 passed, 0 failed (`tests/bootstrap.test.mjs`, `tests/config.test.mjs`, `tests/data-stores.test.mjs`, `tests/errors.test.mjs`, `tests/health.test.mjs`, `tests/logging.test.mjs`).
- `npm run typecheck` — exit 0 (`tsc -p tsconfig.json --noEmit`).

## Blockers
_None for F05._

## Decisions made in implementation
- ADR-001 (accepted): ESM with TypeScript `NodeNext`.
- ADR-002 (accepted): Express 5, `createApp()` does not listen, `/api/v1`, success body `{ data }`, loopback bind, liveness-only health.
- ADR-003 (accepted): Compose MySQL 26.7.0 on `127.0.0.1:3307` with a named volume, Redis 8.2 on `127.0.0.1:6379`, Node on the host, ping only. Homebrew datadir stays separate.
- ADR-004 (accepted): one Zod schema in `src/config/env.ts`. `MYSQL_ROOT_PASSWORD` stays out of the app config. `startServer()` with no argument validates the full contract. `startServer(port)` is the in-process test seam.
- ADR-005 (accepted): error body `{ "error": { "status", "code", "message" } }`. `not_found` and `internal_error` are the codes defined now. Unknown methods and paths are JSON 404s. Express 5 needs no async wrapper. `errorHandler` must keep four parameters.
- ADR-006 (accepted): one JSON log object per line. `info` on stdout, `error` on stderr. `LOG_LEVEL` defaults to `info`. `X-Request-Id` is the correlation header and is not part of the JSON body. Hidden failures are logged with message and stack. Client `AppError`s are not repeated as error lines.

## Known limitations
- An `Error.message` or stack on stderr can contain a password. The client body does not. Field redaction is B07.
- Access logs omit the query string, headers, and body. A secret placed in the path is still logged.
- `LOG_LEVEL=error` hides the listen line and access logs. Hidden failures are still logged. The request id header is still set.
- The request id is not a field on the success or error JSON.
- A log write that fails on both stdout and stderr is dropped. The logger does not handle backpressure. A connection that closes before the response finishes does not get an access line.
- `POST /api/v1/health` is a 404, not a 405. `Allow` is not sent.
- Health does not check MySQL or Redis. A wrong password still lets the process listen. Readiness and graceful shutdown are F08.
- `startServer(port)` with an explicit port does not validate the data-store variables. The process entry does. A later pool should call `loadConfig` itself.
- `MYSQL_HOST` / `MYSQL_PORT` are the host mapping. An app container must use `mysql:3306`. The schema accepts that pair; the default remains `127.0.0.1:3307`.
- Shell variables win over `.env`. `npm start` and `npm run dev` require the file to exist.
- Redis `/data` is an anonymous volume created by the image. No keys are stored.
- The example passwords are local Compose credentials. They do not authenticate to Homebrew MySQL.
- Startup config failures stay plain `Error` text on stderr. They happen before a response exists.

## Recent task handoff (keep <= 12 lines)
- Completed: F05
- Next task: F06 (Sequelize pool on `127.0.0.1:3307`; no migrations or models)
- Logger: `src/config/logger.ts`. Middleware: `src/common/middleware/request-log.ts`
- Order: request id, access log, routes, JSON 404, error handler
- `X-Request-Id` is the header. It is not inside `{ data }` or `{ error }`
- Access line is `info` on stdout. Hidden failures are `error` on stderr
- Path comes from `originalUrl` without the query. `req.path` drops `/api/v1` inside the router
- `LOG_LEVEL` defaults to `info`. Config failures stay plain text on stderr
- `errorHandler.length` must stay 4. Client `AppError`s are not error-logged
- Health stays liveness-only. MySQL from the host: `127.0.0.1:3307`, database `ecom`, user `ecom`
- Redis: `127.0.0.1:6379` with `REDIS_PASSWORD`; no cache and no BullMQ
- Keep the volume: `docker compose down` is safe; do not add `-v`
