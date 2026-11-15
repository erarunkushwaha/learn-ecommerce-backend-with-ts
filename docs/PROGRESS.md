# Project Progress

## Status
F09 is verified. `npm run lint` is ESLint 9 with type-aware rules on `src`. `npm run format:check` is Prettier on the code files. `npm run typecheck` is still `tsc --noEmit`. `npm test` compiles, then runs Node's test runner on a quoted `tests/**/*.test.mjs` glob. `GET /api/v1/health` is still liveness. `GET /api/v1/ready` reports MySQL. The process entry runs that probe before listen and exits when MySQL is refused or the password is rejected. SIGINT and SIGTERM drain the HTTP server and then the pool. Redis is not probed. Migrations still do not run at startup. `sync({ force: true })` is not used.

## Current / next task
- **Task ID:** F10
- **Title:** TypeScript lab: types/interfaces/unions/intersections/narrowing
- **Expected outcome:** A runnable lab for those type concepts. Do not start it in the F09 session.
- **Scope limits:** do not add user, catalog, or auth routes. Do not add Redis or BullMQ clients. Do not start F10 here.

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

## Checks performed
- `npm run typecheck && npm run lint && npm run format:check && npm test` — exit 0. `typecheck` was `tsc -p tsconfig.json --noEmit`. `lint` was `eslint .`. `format:check` reported all matched files use Prettier. `npm test` compiled, then 60 passed, 0 failed (the previous 58 plus two tests in `tests/tooling.test.mjs`). The spec reporter printed `ℹ pass 60` / `ℹ fail 0`.
- `sh -c 'printf "%s\n" tests/*.test.mjs'` printed 10 paths. `sh -c 'printf "%s\n" tests/**/*.test.mjs'` printed the literal `tests/**/*.test.mjs` (globstar is off, so `**` did not expand).
- `npm audit` — exit 1. 9 moderate, 0 high, 0 critical. `minimatch` GHSA-g3hv-75wg-m249 through `typescript-eslint` 8.72.2. `uuid` GHSA-w5hq-g745-h8pq through `sequelize`, same as F07. `npm audit fix --force` would install `typescript-eslint@8.36.0` or `sequelize@3.30.0`. It was not run.
- `docker compose ps` — `mysql` and `redis` up and healthy. Adminer up.
- The dev process already listening on `127.0.0.1:3000` was not restarted. `npm test` recompiled `dist`. The listening process is still the previous one. F09 does not change the HTTP contract.

## Blockers
_None for F09._

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
- ADR-011 (accepted): ESLint 9 flat config and Prettier. Type-aware rules apply to `src/**/*.ts` only. `npm run typecheck` does not emit. `npm test` quotes `tests/**/*.test.mjs` and uses the spec reporter. ESLint 10 was not installed because it rejects Node 22.12.0. Jest and Vitest stay later.

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
- Type-aware ESLint rules do not cover `tests/**/*.mjs` or `scripts/**/*.mjs`. Those files are outside `tsconfig.json`.
- Prettier does not format markdown, `docs/`, or `prompts/`. Print width is 100.
- `npm test` writes `dist`. `npm run typecheck` does not. Two compiles writing `dist` at the same time can interleave.
- `HistoryTable` is the union of the two exported history-table names. The unused runtime array was removed so lint would accept the file. The legal names are unchanged.

## Recent task handoff (keep <= 12 lines)
- Completed: F09
- Next task: F10 (TypeScript types/interfaces/unions/intersections/narrowing lab). Do not start it here
- Lint: `npm run lint` (ESLint 9, type-aware on `src`). Format: `npm run format:check` (Prettier, not markdown)
- `npm run typecheck` is `tsc --noEmit` and does not write `dist`
- `npm test` compiles, then `node --test --test-reporter=spec "tests/**/*.test.mjs"`
- ESLint 10 was skipped: its engines reject Node 22.12.0. Jest/Vitest and CI stay later
- Health and ready are unchanged. Redis is not dialed. Migrations do not run at startup
- The process on port 3000 was not restarted. F09 does not change the HTTP contract
- `npm audit` is 9 moderate. Audit fix was not applied
- See ADR-011 and `docs/learning/F09-lint-format.md`
- Keep the volume: `docker compose down` is safe; do not add `-v`
