# Architecture Decision Records

This log distinguishes **proposed defaults** from **approved implementation choices**. Add a dated ADR for material decisions instead of rewriting history.

## Proposed defaults (not yet approved by running code)
- Modular monolith, not microservices.
- Feature-based modules and an HTTP/controller/service/repository separation where useful.
- MySQL 8+/InnoDB, Sequelize migrations, parameterized raw SQL.
- Access JWT plus short-lived, rotating, hashed server-stored refresh tokens.
- Mock payment provider first. Redis cache and BullMQ stay in later phases. A local Redis process is introduced only by an explicit infrastructure task.

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

### ADR-003: Development MySQL and Redis run in Compose
- **Status:** Accepted
- **Context:** The HTTP API has no database client yet. Homebrew MySQL 26.7.0 already listens on port 3306 and stores data in `/opt/homebrew/var/mysql`, including the user databases `ecom`, `ecommerce_db`, `joins_lab`, `rb_main`, and `rb_tenant_number_1`. Login as root without a password was rejected. This repository has no migration files. F06 is the Sequelize pool, F08 is readiness, B01–B04 are cache and workers, and S08 is the application image.
- **Decision:** `docker-compose.yml` runs `mysql:26.7.0` and `redis:8.2` while Node stays on the host. MySQL uses the named volume `ecom_mysql_data`, utf8mb4 / utf8mb4_0900_ai_ci, and an `ecom` user. The host mapping is `127.0.0.1:3307`. Redis requires a password and is published on `127.0.0.1:6379`. Credentials come from `.env`. `src/config/data-stores.ts` reads that contract and can ping both services; `npm run infra:check` is the ping. The HTTP server does not import it. The Homebrew datadir was left in place and was not imported.
- **Alternatives:** Using port 3306 would attach this repo to the existing Homebrew data. Bind-mounting that datadir would let two server processes own one set of files. An older `mysql:8.0` image would not match the installed server. Opening a Sequelize pool, cache, or BullMQ worker here would implement F06 and B01–B04 early. Containerizing Node is S08.
- **Consequences:** The Compose database starts empty. `MYSQL_HOST` and `MYSQL_PORT` are the address from the host. S08 must use the Compose hostname `mysql` and container port `3306` for a containerized app. `docker compose down` keeps named volumes; adding `-v` deletes the Compose database. The Redis image also attaches an anonymous volume at `/data`. I01 writes no keys. F03 should validate these variables with Zod. F06 should pool MySQL with these settings.
- **Related task:** I01
- **Date:** 2026-11-11
