# Project Progress

## Status
F02 is verified. The process entry is an Express server. `GET /api/v1/health` returns liveness JSON. There is no database, auth, Zod config, logger, or JSON error handler.

## Current / next task
- **Task ID:** F03
- **Title:** Validate environment with Zod and config conventions
- **Expected outcome:** a validated config module replaces the temporary `PORT` parse in `src/server.ts`
- **Scope limits:** do not start F03 in the F02 session; no MySQL, auth, Redis, or extra feature modules

## Completed and verified tasks
- **F01** — Bootstrap npm, strict TypeScript, scripts, gitignore, and README. Verified 2026-11-11 on Node v22.12.0 / npm 10.9.0.
- **F02** — Express app/server, `/api/v1`, and liveness health. Verified 2026-11-11 on Node v22.12.0 / npm 10.9.0.

## Checks performed
- `npm install express@5` — exit 0. Installed `express@^5.3.0`. npm reported 0 vulnerabilities.
- `npm install --save-dev @types/express@5` — exit 0. Installed `@types/express@^5.0.6`. npm reported 0 vulnerabilities.
- `npm run typecheck` — exit 0 (`tsc -p tsconfig.json --noEmit`).
- `npm test` — exit 0. 6 passed, 0 failed (`tests/bootstrap.test.mjs`, `tests/health.test.mjs`). The script compiles before Node's test runner.
- `npm run build` — exit 0 (emitted `dist/`).
- `PORT=0 npm start` — exit path after a manual stop. Logged `ecom-backend listening on http://127.0.0.1:52531`. `curl` of `GET /api/v1/health` returned `HTTP/1.1 200 OK`, `Content-Type: application/json; charset=utf-8`, body `{"data":{"status":"ok"}}`, and no `X-Powered-By`.
- `npm run dev` — not run as its own command. It is `tsc` then `node dist/server.js`, and both of those succeeded via `build` and `start`.

## Blockers
_None._

## Decisions made in implementation
- ADR-001 (accepted): ESM with TypeScript `NodeNext`.
- ADR-002 (accepted): Express 5, `createApp()` does not listen, `/api/v1`, success body `{ data }`, loopback bind, liveness-only health. `PORT` parsing in `server.ts` is temporary until F03. `stopServer` is a hard close. No signal handlers yet.

## Known limitations
- Unknown routes still use Express's HTML 404. JSON errors are F04.
- Health does not check dependencies. Readiness and graceful shutdown are F08.
- No structured logger or request IDs (F05).
- `npm run dev` / `npm start` run `dist/server.js`. `src/index.ts` is no longer the HTTP entry.

## Recent task handoff (keep <= 12 lines)
- Completed: F02
- Next task: F03 (start only in a new session)
- Runtime verified: Node v22.12.0, npm 10.9.0
- HTTP entry: `src/server.ts`; app composition: `src/app.ts`
- Health: `GET /api/v1/health` → `200` `{ "data": { "status": "ok" } }`
- Listen: `127.0.0.1`, default port 3000, `PORT=0` picks a free port
- Express `^5.3.0` and `@types/express` `^5.0.6` (ADR-002)
- Zod, MySQL, auth, and Redis are not started
- Read next: `docs/ROADMAP.md` F03, `docs/ARCHITECTURE.md`, ADR-002
