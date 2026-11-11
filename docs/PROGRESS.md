# Project Progress

## Status
I01 is verified. Docker Compose runs MySQL 26.7.0 and Redis 8.2. The HTTP process is unchanged: `GET /api/v1/health` is liveness only. There is no Sequelize pool, Zod config, auth, logger, cache, or job worker.

## Current / next task
- **Task ID:** F03
- **Title:** Validate environment with Zod and config conventions
- **Expected outcome:** a validated config module replaces the temporary `PORT` parse in `src/server.ts` and should validate the I01 `MYSQL_*` and `REDIS_*` variables in the same place
- **Scope limits:** do not open a Sequelize pool, do not add cache or BullMQ, and do not start auth. Keep the Compose MySQL on `127.0.0.1:3307`.

## Completed and verified tasks
- **F01** — Bootstrap npm, strict TypeScript, scripts, gitignore, and README. Verified 2026-11-11 on Node v22.12.0 / npm 10.9.0.
- **F02** — Express app/server, `/api/v1`, and liveness health. Verified 2026-11-11 on Node v22.12.0 / npm 10.9.0.
- **I01** — Compose MySQL 26.7.0 and Redis 8.2, host-side env contract, and connectivity check. Verified 2026-11-11 on Node v22.12.0 / npm 10.9.0, Docker Engine 28.5.1, Compose v2.40.3.

## Checks performed
- `npm install mysql2` — exit 0. Installed `mysql2@^3.24.6`. npm reported 0 vulnerabilities.
- `npm run typecheck` — exit 0 (`tsc -p tsconfig.json --noEmit`).
- `npm test` — exit 0. 12 passed, 0 failed (`tests/bootstrap.test.mjs`, `tests/data-stores.test.mjs`, `tests/health.test.mjs`).
- `npm run build` — exit 0 (emitted `dist/`).
- `docker compose up -d` — exit 0. Pulled `mysql:26.7.0` and `redis:8.2`. Created volume `ecom-backend_ecom_mysql_data`. Both containers reached `healthy`.
- `npm run infra:check` — exit 0. Logged `MySQL ok 127.0.0.1:3307/ecom user ecom` and `Redis ok 127.0.0.1:6379`.
- Compose SQL — `@@version` `26.7.0`, `@@character_set_server` `utf8mb4`, `@@collation_server` `utf8mb4_0900_ai_ci`. Table count in database `ecom` was `0`.
- Ports — MySQL `3306/tcp -> 127.0.0.1:3307`, Redis `6379/tcp -> 127.0.0.1:6379`. MySQL mount is volume `ecom-backend_ecom_mysql_data` at `/var/lib/mysql`.
- Homebrew MySQL pid 682 still listened on `*:3306`. `/opt/homebrew/var/mysql/ecom` still contained `customers.ibd`, `employees.ibd`, `orders.ibd`, `products.ibd`, and `suppliers.ibd`.
- `docker volume ls` after startup added `ecom-backend_ecom_mysql_data` and one anonymous Redis volume for `/data`. Volumes that already existed were still listed.

## Blockers
_None for I01._ Homebrew root login without a password was rejected, so row counts in the existing databases were not read. Copying that data was not required and was not run.

## Decisions made in implementation
- ADR-001 (accepted): ESM with TypeScript `NodeNext`.
- ADR-002 (accepted): Express 5, `createApp()` does not listen, `/api/v1`, success body `{ data }`, loopback bind, liveness-only health.
- ADR-003 (accepted): Compose MySQL 26.7.0 on `127.0.0.1:3307` with a named volume, Redis 8.2 on `127.0.0.1:6379`, Node on the host, ping only. Homebrew datadir stays separate.

## Known limitations
- Unknown routes still use Express's HTML 404. JSON errors are F04.
- Health does not check MySQL or Redis. Readiness and graceful shutdown are F08.
- No structured logger or request IDs (F05).
- `src/config/data-stores.ts` parses env by hand. F03 should fold those variables into Zod.
- `MYSQL_HOST` / `MYSQL_PORT` are the host mapping. An app container must use `mysql:3306`.
- Redis `/data` is an anonymous volume created by the image. No keys are stored.
- The example passwords are local Compose credentials. They do not authenticate to Homebrew MySQL.

## Recent task handoff (keep <= 12 lines)
- Completed: I01
- Next task: F03 (validate `PORT` and the I01 data-store variables; do not open Sequelize)
- Compose: `docker compose up -d`, then `npm run infra:check`
- MySQL from the host: `127.0.0.1:3307`, database `ecom`, user `ecom`, empty tables
- Homebrew MySQL remains on port `3306` with its own datadir
- Redis: `127.0.0.1:6379` with `REDIS_PASSWORD`; no cache and no BullMQ
- HTTP entry is still `src/server.ts`; health stays liveness-only
- Keep the volume: `docker compose down` is safe; do not add `-v`
- Read next: `docs/ROADMAP.md` F03, ADR-003, `docs/learning/I01-docker-mysql-redis.md`
