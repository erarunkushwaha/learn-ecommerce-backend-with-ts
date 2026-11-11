# Project Progress

## Status
F01 is verified. The repository typechecks, builds, and runs a bootstrap entry. There is no HTTP server yet.

## Current / next task
- **Task ID:** F02
- **Title:** Create Express app/server, route versioning and health endpoint
- **Expected outcome:** `src/app.ts` and `src/server.ts`, a versioned route prefix, and a health endpoint
- **Scope limits:** do not start F02 in the F01 session; no MySQL, auth, Redis, or extra modules

## Completed and verified tasks
- **F01** — Bootstrap npm, strict TypeScript, scripts, gitignore, and README. Verified 2026-11-11 on Node v22.12.0 / npm 10.9.0.

## Checks performed
- `npm install --save-dev typescript@5 @types/node@22` — exit 0. Installed `typescript@^5.9.3` and `@types/node@^22.20.5`. npm reported 0 vulnerabilities.
- `npm run typecheck` — exit 0 (`tsc -p tsconfig.json --noEmit`).
- `npm run build` — exit 0 (emitted `dist/`).
- `npm test` — exit 0. 1 passed, 0 failed (`tests/bootstrap.test.mjs`).
- `npm run dev` — exit 0. Printed `ecom-backend: TypeScript bootstrap ready`.
- `npm start` — exit 0. Printed the same line.

## Blockers
_None._

## Decisions made in implementation
- ADR-001 (accepted): ESM with TypeScript `NodeNext`. Dev dependencies: `typescript`, `@types/node`. No runtime dependencies yet.

## Recent task handoff (keep <= 12 lines)
- Completed: F01
- Next task: F02 (start only in a new session)
- Runtime verified: Node v22.12.0, npm 10.9.0; `engines.node` is `>=22.12.0`
- Module format: `"type": "module"`; relative imports need a `.js` specifier (ADR-001)
- Entry today: `src/index.ts` logs only when Node runs that file directly
- Express, env validation, and MySQL are not started
- Read next: `docs/ROADMAP.md` F02, `docs/ARCHITECTURE.md`, `docs/PROJECT.md`
