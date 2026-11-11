# Architecture Decision Records

This log distinguishes **proposed defaults** from **approved implementation choices**. Add a dated ADR for material decisions instead of rewriting history.

## Proposed defaults (not yet approved by running code)
- Modular monolith, not microservices.
- Feature-based modules and an HTTP/controller/service/repository separation where useful.
- MySQL 8+/InnoDB, Sequelize migrations, parameterized raw SQL.
- Access JWT plus short-lived, rotating, hashed server-stored refresh tokens.
- Mock payment provider first; Redis/jobs only in later phases.

## ADR template
### ADR-000: Title
- **Status:** Proposed | Accepted | Superseded
- **Context:** What problem/constraints prompted choice?
- **Decision:** What will we do?
- **Alternatives:** What else was considered?
- **Consequences:** Pros, cons, security/performance trade-offs
- **Related task:** ID
- **Date:** YYYY-MM-DD

## Accepted decisions

### ADR-001: Use ECMAScript modules
- **Status:** Accepted
- **Context:** The stack requires a supported Node.js LTS and an early ESM or CommonJS choice. Node 22.12.0 is the verified runtime. Later tasks add Express, but the module format has to be fixed before the first compiled file.
- **Decision:** `"type": "module"` in `package.json`. TypeScript uses `module` and `moduleResolution` set to `NodeNext`. Relative imports in TypeScript must use the runtime `.js` extension.
- **Alternatives:** CommonJS (`"type"` omitted, `module: CommonJS`) matches older Express examples and needs no extensions. It fights Node's current default and makes a later migration touch every import.
- **Consequences:** Native `import`/`export` and top-level await stay available. Tooling must be ESM-aware. `require` is not the app's module loader. The module cache is still one evaluation per URL per process; a database client placed in a module scope is reused until the process exits.
- **Related task:** F01
- **Date:** 2026-11-11

### ADR-002: Split the Express app from the listening process
- **Status:** Accepted
- **Context:** F02 needs a versioned HTTP API and a health route before configuration, MySQL, auth, logging, or a global error handler exist. Express 5.3 is the current major and ships without its own `.d.ts` files. `@types/express` 5 matches that major.
- **Decision:** `createApp()` returns an Express application and does not bind a port. `src/server.ts` is the process entry: it listens on `127.0.0.1`, logs the URL, and exports a hard `stopServer` for tests. Routes mount on an Express router at `/api/v1`. Successful JSON is `{ "data": <payload> }`. `GET /api/v1/health` returns `200` with `{ "data": { "status": "ok" } }` and does not check dependencies. `X-Powered-By` is disabled. Health stays a route handler because a controller and service would only forward a constant. `PORT` accepts an integer `0`–`65535` and defaults to `3000` when unset or empty; invalid values fail startup. Tests use the Node.js built-in runner against compiled `dist/`.
- **Alternatives:** Express 4.22 is the older maintenance line and matches most legacy tutorials. One file that both builds the app and calls `listen` at import time would open a port whenever a test loaded it. A bare `{ "status": "ok" }` body would not give later routes a shared success shape.
- **Consequences:** Tests can import the app without binding a socket. Clients must use the `/api/v1` prefix. This health check can stay green while a future database is down. The temporary `PORT` parse moves into Zod config later. Graceful signal handling, readiness, CORS, security headers, and JSON error bodies are still absent. `stopServer` drops open sockets instead of draining them.
- **Related task:** F02
- **Date:** 2026-11-11
