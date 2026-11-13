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

### ADR-004: Validate the process environment with one Zod schema
- **Status:** Accepted
- **Context:** F02 parsed `PORT` with a hand-written integer check in `src/server.ts`. I01 parsed `MYSQL_*` and `REDIS_*` with a second hand-written check in `src/config/data-stores.ts`. Both inputs are optional strings on `process.env`. The HTTP process still must not open a Sequelize pool, cache, or worker. Compose already requires `MYSQL_ROOT_PASSWORD`; the Node process only needs the `ecom` user.
- **Decision:** `src/config/env.ts` is the only environment parser. `loadConfig` returns `{ port, mysql, redis }`. Empty or unset `PORT` defaults to `3000` and allows `0`. MySQL and Redis hosts default to `127.0.0.1`, MySQL's port defaults to `3307`, and Redis's port defaults to `6379`. Service ports must be integers from 1 through 65535. `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD`, and `REDIS_PASSWORD` are required, non-empty, and not trimmed. `MYSQL_ROOT_PASSWORD` is not in the schema. `startServer()` with no port argument calls `loadConfig(process.env)` before `listen`. `startServer(port)` checks that explicit number and is the in-process test seam. Importing the module does not read or cache the environment. `npm start` and `npm run dev` load `.env` with `--env-file`. Failures throw an `Error` whose message lists variable names and rules, not supplied values. `readMysqlSettings` and `readRedisSettings` are slices of the same field schemas. `src/config/data-stores.ts` only pings.
- **Alternatives:** Leave the two hand parsers until F06. Add the `dotenv` package even though Node 22.12 already loads an env file. Parse once at import time and export a singleton. Include the MySQL root password in the app config so one object mirrors every Compose variable. Reject `MYSQL_PORT=3306` so the host cannot point at Homebrew MySQL.
- **Consequences:** The executable fails closed when the contract is incomplete, and it still listens when a password is present but wrong. `src/server.ts` does not import `mysql2`. Tests that spawn `dist/server.js` must supply the required variables; tests that call `startServer(0)` do not. A pool created later should call `loadConfig` itself. Shell variables win over `.env`. `MYSQL_HOST=mysql` and port `3306` remain valid for a future app container. Typed error classes are still F04.
- **Related task:** F03
- **Date:** 2026-11-12

### ADR-005: One JSON error envelope and a four-argument handler
- **Status:** Accepted
- **Context:** Unknown routes still used Express's HTML 404. Routes had no shared way to report an expected HTTP failure, and an unexpected `Error.message` can contain SQL or a secret. F05 owns logging and request IDs. Request-body validation, auth, and a 405 response are later tasks. Express 5.3 already forwards thrown values and rejected native promises to `next(err)`.
- **Decision:** `AppError` carries an HTTP status from 400 through 599, a lowercase `code` token, and a client-safe message. `NotFoundError` is the 404 subclass (`not_found`). `createApp()` mounts routes, then `notFoundHandler`, then `errorHandler`. The error body is `{ "error": { "status", "code", "message" } }`. An `AppError` whose fields still match those rules is returned as written. Any other value, including a mutated code, becomes `500` / `internal_error` / `Internal server error`. The handler does not write a stack or a log line. If headers were already sent, it calls `next(err)`. The 404 message does not echo the URL. `POST /api/v1/health` stays a 404. Startup errors from `loadConfig` stay plain `Error`s on stderr. No `async` wrapper is added.
- **Alternatives:** Keep Express's HTML 404 until the logger exists. Put only `status` and `message` in the body and postpone `code`. Add `asyncHandler` around every route. Map every unmatched method to `405` now. Log `console.error(err)` inside the handler. Reflect `req.originalUrl` in the 404 message. Treat `AppError.message` as unsafe too, which would leave no way to tell the client why a known request failed.
- **Consequences:** Clients can branch on `code` without parsing English. A thrown `Error` cannot leak its message. A 500 is not recorded anywhere until F05, so operators cannot see the cause from this handler alone. New expected failures subclass `AppError` and keep this envelope. `errorHandler.length` must stay 4 and `notFoundHandler.length` must stay 3, because Express uses arity to choose the function. `405` and field-level validation details are still absent.
- **Related task:** F04
- **Date:** 2026-11-12

### ADR-006: JSON logs and a request id header
- **Status:** Accepted
- **Context:** F04 returns a generic 500 and keeps the cause inside the process. Operators cannot tie a client report to a server line. ADR-005 fixes the error JSON and leaves logging here. The process still must not open Sequelize, Redis, or a readiness check. A config failure is already plain text on stderr, and it happens before a log level is known to be valid.
- **Decision:** `src/config/logger.ts` writes one JSON object per line. `debug`, `info`, and `warn` go to stdout. `error` goes to stderr. The default level is `info`. `LOG_LEVEL` is optional on the F03 schema: `debug`, `info`, `warn`, or `error`; empty means `info`. `createApp()` runs `requestContext`, then `accessLog`, then routes, then the JSON 404, then `errorHandler`. A missing or unsafe `X-Request-Id` is replaced with `crypto.randomUUID()`. A safe inbound id is echoed. The id is that response header and a field on a child logger stored in a `WeakMap`. It is not added to either JSON envelope. The access line records method, path, status, and duration. The path is taken from `originalUrl` with the query string removed, because a mounted router later changes `req.path`. Headers and bodies are not logged. `errorHandler` writes an `error` line for every value that is not a client `AppError`, including the message and stack, then sends the ADR-005 body. Client `AppError`s are not repeated as error lines. `startServer` writes `ecom-backend listening on <url>` through the same logger after bind. Config failures stay `console.error` of the safe message. `Express.Request` is not augmented.
- **Alternatives:** pino or winston. `console.error` inside the handler. Put `requestId` in the error JSON. Log `req.originalUrl` or `req.path`. Accept any inbound id. Extend `Express.Request` in this task.
- **Consequences:** A 500 on stderr can be matched to the client's `X-Request-Id`. A secret inside `Error.message` is in that server line on purpose; the client body still hides it. Query tokens are not in the access log. `LOG_LEVEL=error` hides the listen line and the access log. A write that fails on both streams is dropped so the HTTP body can still be sent. Backpressure on the log stream is ignored. pino can replace the writer later without changing the middleware. Field redaction is B07. Request augmentation is F11.
- **Related task:** F05
- **Date:** 2026-11-13
