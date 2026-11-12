# Project Progress

## Status
F03 is verified. `src/config/env.ts` validates `PORT` and the I01 MySQL and Redis variables with Zod before the process listens. `GET /api/v1/health` is still liveness only. There is no Sequelize pool, auth, logger, cache, or job worker.

## Current / next task
- **Task ID:** F04
- **Title:** Create typed error classes and global async error handling
- **Expected outcome:** typed application errors and one Express error middleware that turns them into safe JSON responses
- **Scope limits:** do not add a logger, request IDs, Sequelize, auth, or readiness. Unknown routes still need a decision inside that error task; do not start F05.

## Completed and verified tasks
- **F01** — Bootstrap npm, strict TypeScript, scripts, gitignore, and README. Verified 2026-11-11 on Node v22.12.0 / npm 10.9.0.
- **F02** — Express app/server, `/api/v1`, and liveness health. Verified 2026-11-11 on Node v22.12.0 / npm 10.9.0.
- **I01** — Compose MySQL 26.7.0 and Redis 8.2, host-side env contract, and connectivity check. Verified 2026-11-11 on Node v22.12.0 / npm 10.9.0, Docker Engine 28.5.1, Compose v2.40.3.
- **F03** — Zod environment schema for `PORT`, `MYSQL_*`, and `REDIS_*`. Verified 2026-11-12 on Node v22.12.0 / npm 10.9.0. Zod 4.6.7.

## Checks performed
- `npm install zod` — exit 0. Installed `zod@^4.6.7` (resolved 4.6.7). npm reported 0 vulnerabilities.
- `npm run typecheck` — exit 0 (`tsc -p tsconfig.json --noEmit`).
- `npm test` — exit 0. 20 passed, 0 failed (`tests/bootstrap.test.mjs`, `tests/config.test.mjs`, `tests/data-stores.test.mjs`, `tests/health.test.mjs`).
- `npm run infra:check` — exit 0. Logged `MySQL ok 127.0.0.1:3307/ecom user ecom` and `Redis ok 127.0.0.1:6379`.
- `PORT=0 node --env-file=.env dist/server.js` — listened on `http://127.0.0.1:52724`. `GET /api/v1/health` returned `200` and `{ "data": { "status": "ok" } }`. The process was stopped after that request.
- A probe without `PORT=0` passed validation and then failed with `EADDRINUSE` on `127.0.0.1:3000`. The process already listening there was left running.

## Blockers
_None for F03._

## Decisions made in implementation
- ADR-001 (accepted): ESM with TypeScript `NodeNext`.
- ADR-002 (accepted): Express 5, `createApp()` does not listen, `/api/v1`, success body `{ data }`, loopback bind, liveness-only health.
- ADR-003 (accepted): Compose MySQL 26.7.0 on `127.0.0.1:3307` with a named volume, Redis 8.2 on `127.0.0.1:6379`, Node on the host, ping only. Homebrew datadir stays separate.
- ADR-004 (accepted): one Zod schema in `src/config/env.ts`. `MYSQL_ROOT_PASSWORD` stays out of the app config. `startServer()` with no argument validates the full contract. `startServer(port)` is the in-process test seam.

## Known limitations
- Unknown routes still use Express's HTML 404. JSON errors are F04.
- Health does not check MySQL or Redis. A wrong password still lets the process listen. Readiness and graceful shutdown are F08.
- No structured logger or request IDs (F05).
- `startServer(port)` with an explicit port does not validate the data-store variables. The process entry does. A later pool should call `loadConfig` itself.
- `MYSQL_HOST` / `MYSQL_PORT` are the host mapping. An app container must use `mysql:3306`. The schema accepts that pair; the default remains `127.0.0.1:3307`.
- Shell variables win over `.env`. `npm start` and `npm run dev` require the file to exist.
- Redis `/data` is an anonymous volume created by the image. No keys are stored.
- The example passwords are local Compose credentials. They do not authenticate to Homebrew MySQL.

## Recent task handoff (keep <= 12 lines)
- Completed: F03
- Next task: F04 (typed errors and global async error handling; do not add a logger)
- Config: `src/config/env.ts`. Pings stay in `src/config/data-stores.ts`
- `npm start` and `npm run dev` use `node --env-file=.env`
- Full validation runs only when `startServer()` is called with no port argument
- MySQL from the host: `127.0.0.1:3307`, database `ecom`, user `ecom`
- Redis: `127.0.0.1:6379` with `REDIS_PASSWORD`; no cache and no BullMQ
- `MYSQL_ROOT_PASSWORD` is Compose-only
- Health stays liveness-only
- Keep the volume: `docker compose down` is safe; do not add `-v`
- Read next: `docs/ROADMAP.md` F04, ADR-004, `docs/learning/F03-env-config.md`
