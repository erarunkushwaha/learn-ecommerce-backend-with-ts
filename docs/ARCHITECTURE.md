# Architecture & Conventions (initial proposal)

## Style
Modular monolith. Scale with disciplined module boundaries before considering services. `src/app.ts` assembles Express; `src/server.ts` starts and stops network/process resources. Controller = HTTP adaptation; service = business rules; repository = persistence. Avoid adding a layer that only forwards calls.

The package is ECMAScript modules (`"type": "module"`). TypeScript compiles with `NodeNext`, so a relative import in a `.ts` file uses the emitted `.js` specifier. See ADR-001.

```text
src/
  app.ts
  server.ts
  config/                # validated env, logger, db/redis config
  common/
    errors/ middleware/ types/ utils/
  database/
    migrations/ seeders/ models/  # only shared Sequelize setup if needed
  modules/
    auth/                 # route/controller/service/repo/schema/types as needed
    users/ authorization/ categories/ products/ inventory/
    cart/ orders/ payments/ coupons/ reviews/
    notifications/ analytics/ audit/
tests/                     # test utilities and cross-module integration tests
labs/                      # independent TypeScript/Node/DBMS experiments
docs/learning/             # notes if module-local learning docs are impractical
```

As of F08, `src/` contains `index.ts`, `app.ts`, `server.ts`, `config/env.ts`, `config/logger.ts`, `config/data-stores.ts`, `database/sequelize.ts`, `database/baseline.ts`, `database/migrator.ts`, `database/cli.ts`, `database/migrations/20261115140000-baseline.ts`, `database/seeders/20261115140000-baseline-seed.ts`, `common/errors/app-error.ts`, `common/middleware/request-log.ts`, and `common/middleware/error-handler.ts`. The HTTP process validates its environment, assigns a request id, writes JSON logs, and answers known and unknown routes with JSON. The process entry builds one Sequelize pool, probes MySQL before listen, and does not run migrations. `createApp()` does not open MySQL or Redis. There is no `models/` directory.

F10 adds `labs/f10-types/`. That directory is its own TypeScript program (`labs/f10-types/tsconfig.json`, same strict flags, `NodeNext`). It emits `labs/f10-types/dist/`. The application `tsconfig.json` still includes only `src/**/*.ts` and still emits `dist/`. `src/app.ts` and `src/server.ts` do not import the lab. `npm run typecheck` checks `src/` only. `npm run lab:f10` compiles the lab and prints the demo. See ADR-012.

F11 adds `labs/f11-types/` on the same split. `npm run lab:f11` compiles it and prints the generics demo. The lab merges an optional `actor` onto `express-serve-static-core`'s `Request`. That merge is not part of the application program, so `src/` still has no `actor` field. The request id remains on the response logger from F05. See ADR-013.

## Request lifecycle
Target path for later tasks. F02 disables `X-Powered-By` and mounts `/api/v1`. F04 adds the JSON 404 and the final error middleware. F05 adds the request id and the access log in front of the routes. Auth, validation, and the other middleware in this list are not installed yet.

Client -> reverse proxy (optional) -> Express middleware (request-id/logger/security/CORS/rate-limit/parsers, in correct order) -> auth -> ownership/permissions -> Zod validation -> route -> controller -> service -> repository -> Sequelize/parameterized SQL -> MySQL. Global error middleware last. Middleware placement depends on endpoint needs; do not authenticate public routes.

## Implemented HTTP (F02, F03, F04, F05, F08)
`createApp()` in `src/app.ts` builds Express and does not listen. `src/server.ts` listens on `127.0.0.1` and can close that server. Routes are mounted at `/api/v1`. `GET /api/v1/health` returns `200` and `{ "data": { "status": "ok" } }`. That is process liveness only. It does not check MySQL or any other dependency.

`GET /api/v1/ready` returns `200` and `{ "data": { "mysql": "ok" } }` when its probe resolves. The process entry passes `probeMysql`. A rejection, and a missing probe, return `503` with code `not_ready` and the message `MySQL is unavailable`. The driver text is one error log carrying the request id. It is not the response body. `createApp()` does not import the pool.

Successful JSON uses one envelope: `{ "data": <payload> }`. Error JSON uses a second envelope: `{ "error": { "status", "code", "message" } }`. `requestContext` runs first and sets `X-Request-Id`. `accessLog` runs next and writes one JSON line when the response finishes. `notFoundHandler` runs after the routes and forwards `NotFoundError`. `errorHandler` is last. An `AppError` that still has a 400–599 status, a lowercase `code` token, and a non-empty message is serialized as that object. Every other thrown or rejected value becomes `500`, code `internal_error`, message `Internal server error`, with no stack and no original message in the body. That hidden value is written to stderr as an `error` line that includes the message and stack. A client `AppError`, including `NotReadyError`, is not written a second time. The request id is a response header and a log field. It is not added to either JSON envelope. `POST /api/v1/health` and `POST /api/v1/ready` are that same 404, because no 405 response is defined yet. Express 5 forwards thrown handler exceptions and rejected native promises, so routes are not wrapped.

Before listen, the process entry loads `src/config/env.ts` and runs `probeMysql`. `PORT` may be an integer from 0 through 65535; when it is unset or empty the process uses 3000. Invalid config prints the variable names and rules, then exits. That startup failure is a plain `Error` on stderr, not the HTTP error envelope and not a JSON log line. A failed MySQL probe writes a JSON error line, closes the pool, prints `MySQL is unavailable`, and does not listen. Redis is required by the schema and is not probed. After a successful bind, the process writes one JSON info line: `ecom-backend listening on <url>`. The listen address remains the constant `127.0.0.1`. The server does not send `X-Powered-By`. SIGINT and SIGTERM drain the listener and then the pool. `startServer(port)` does not probe and does not install those handlers.

## Local data stores (I01)
Node.js stays on the host. `docker-compose.yml` runs MySQL `26.7.0`, Redis `8.2`, and Adminer `6.3.0`. Published ports bind to `127.0.0.1` only: MySQL host port `3307` (container port `3306`), Redis `6379`, and Adminer `8080`. Adminer reaches MySQL at the Compose name `mysql`. MySQL data is the named volume `ecom_mysql_data`. A Homebrew MySQL `26.7.0` already listens on port `3306` with its own datadir; Compose does not mount that directory.

`src/config/env.ts` validates `PORT`, `LOG_LEVEL`, `MYSQL_*`, and `REDIS_*` with one Zod schema. `LOG_LEVEL` is optional and defaults to `info`. `MYSQL_ROOT_PASSWORD` stays a Compose variable. `src/config/data-stores.ts` can open a one-shot MySQL `SELECT 1` plus a Redis `AUTH`/`PING` from those settings. `npm run infra:check` runs those checks. That ping is not the process pool.

`src/database/sequelize.ts` is the MySQL pool (F06, ADR-007). `getSequelize()` calls `loadConfig` and stores one Sequelize 6 instance in module scope. `createSequelize` is the seam for a different target. The pool uses the configured host and port, dialect `mysql`, `utf8mb4`, session time zone `+00:00`, and `max: 5` / `min: 0`. Construction does not open a socket. The first query borrows a connection. SQL logging is off unless the logger level is `debug`, and bind parameters are not written into that line. The process entry in `src/server.ts` calls `getSequelize()`, then `probeMysql`, then `startServer()`. `probeMysql` runs Sequelize `authenticate` (`SELECT 1+1 AS result`). A failed probe closes the pool and exits before listen. The entry does not call `sync` or run migrations. `createApp()` does not read the environment and does not import the pool. It takes a `checkReady` function, and the process entry passes `probeMysql` into `GET /api/v1/ready`. `startServer(port)` is the in-process test seam: it checks that number only and does not create the pool. Liveness stays independent of MySQL. After listen, SIGINT and SIGTERM call `drainServer` and then `closeSequelize()`. `stopServer` remains a hard close for tests. Redis is not probed. Cache and BullMQ are B01–B04. The application image is S08. Inside a future app container, the MySQL address is the Compose DNS name `mysql` on port `3306`, because `3307` is only the host mapping. The schema accepts that address.

Migrations and seeders are a separate command (F07, ADR-008). `npm run db:migrate` and `npm run db:seed` compile, then `src/database/cli.ts` opens a pool with `readMysqlSettings` and `createSequelize`. That command does not use the cached process pool and does not require Redis. It does not run on HTTP startup. Umzug loads the compiled files in `dist/database/migrations` and `dist/database/seeders`. Applied names are stored in `SequelizeMeta` and `SequelizeData`. Those two tables are created with `CREATE TABLE IF NOT EXISTS`. The first migration creates `schema_baseline` and its `down` drops that table. Tests create and drop the database `ecom_test` on the Compose server. They do not migrate `ecom`.

## Contracts
- Version prefix `/api/v1`.
- Typed request inputs validated at boundaries; never trust input or cast it blindly.
- Success JSON is `{ "data": <payload> }` (see F02). Error JSON is `{ "error": { "status", "code", "message" } }` (see F04, ADR-005). The codes defined now are `not_found`, `not_ready`, and `internal_error`. A later failure adds a code by subclassing `AppError`.
- Use async/await. Express 5 forwards handler throws and rejections to `src/common/middleware/error-handler.ts`. Never leak stack traces to clients.
- Domain services handle policy and transactional decisions; repositories do not invoke web/email side effects within open DB transactions.
- Transactions are explicit for multi-row invariants. Checkout enforces inventory correctness using row locking/conditional updates; retries are bounded and idempotent.
- Use a single configured Sequelize instance per Node process with connection pooling. F06 does this with module scope in `src/database/sequelize.ts`, not a Singleton class, and not a new client per request.
- Authentication: short-lived access token, server-revocable rotating refresh token (stored hashed), appropriately secure transport/cookie policies; authorization includes both RBAC and object ownership.

## Design patterns to demonstrate, not force
Repository (storage boundary); Strategy + Factory (mock payment processors); Observer/event dispatcher (order-created notification); dependency injection for test seams; singleton/module-cached DB instance with trade-off explanation. Consider outbox when reliability exercise arrives.

## Testing and operations
Separate unit tests from integration tests. Use a disposable MySQL instance; avoid tests against production DB. Database migrations are source of truth; seeds deterministic. F09 adds `npm run lint`, `npm run format:check`, and keeps `npm run typecheck` and `npm test` as separate commands. Lint is ESLint 9 with type-aware rules on `src/**/*.ts` and on `labs/**/*.ts` whose nearest tsconfig includes them. `labs/**/reject/**` is ignored by ESLint because those files are expected to fail `tsc`. Prettier formats `src/`, `tests/`, `scripts/`, `labs/`, `eslint.config.js`, and `package.json`, and it does not format markdown. `typecheck` is `tsc --noEmit` and does not write `dist`. `npm test` compiles with the same `tsconfig.json`, then runs the Node.js test runner on a quoted `tests/**/*.test.mjs` glob. Jest or Vitest is still a later choice. Health and readiness stay distinct. Logs are structured, requests carry a correlation id, and SIGINT and SIGTERM drain the process.

## Scale-up discussion
Single deployable first. Study stateless API replicas behind load balancer, shared sessions/token persistence, Redis/DB bottlenecks, pool sizing, queues and backpressure. **Do not implement microservices purely to demonstrate scaling.**

## Review policy
This document describes intended architecture. When a task changes a convention, update this file and add an ADR to `DECISIONS.md`. Do not represent planned patterns as existing implementations.
