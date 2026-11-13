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

As of F05, `src/` contains `index.ts`, `app.ts`, `server.ts`, `config/env.ts`, `config/logger.ts`, `config/data-stores.ts`, `common/errors/app-error.ts`, `common/middleware/request-log.ts`, and `common/middleware/error-handler.ts`. The HTTP process validates its environment, assigns a request id, writes JSON logs, and answers known and unknown routes with JSON. It does not open MySQL or Redis. The other folders above are not created yet.

## Request lifecycle
Target path for later tasks. F02 disables `X-Powered-By` and mounts `/api/v1`. F04 adds the JSON 404 and the final error middleware. F05 adds the request id and the access log in front of the routes. Auth, validation, and the other middleware in this list are not installed yet.

Client -> reverse proxy (optional) -> Express middleware (request-id/logger/security/CORS/rate-limit/parsers, in correct order) -> auth -> ownership/permissions -> Zod validation -> route -> controller -> service -> repository -> Sequelize/parameterized SQL -> MySQL. Global error middleware last. Middleware placement depends on endpoint needs; do not authenticate public routes.

## Implemented HTTP (F02, F03, F04, F05)
`createApp()` in `src/app.ts` builds Express and does not listen. `src/server.ts` listens on `127.0.0.1` and can close that server. Routes are mounted at `/api/v1`. `GET /api/v1/health` returns `200` and `{ "data": { "status": "ok" } }`. That is process liveness only. It does not check MySQL or any other dependency.

Successful JSON uses one envelope: `{ "data": <payload> }`. Error JSON uses a second envelope: `{ "error": { "status", "code", "message" } }`. `requestContext` runs first and sets `X-Request-Id`. `accessLog` runs next and writes one JSON line when the response finishes. `notFoundHandler` runs after the routes and forwards `NotFoundError`. `errorHandler` is last. An `AppError` that still has a 400–599 status, a lowercase `code` token, and a non-empty message is serialized as that object. Every other thrown or rejected value becomes `500`, code `internal_error`, message `Internal server error`, with no stack and no original message in the body. That hidden value is written to stderr as an `error` line that includes the message and stack. The request id is a response header and a log field. It is not added to either JSON envelope. `POST /api/v1/health` is that same 404, because no 405 response is defined yet. Express 5 forwards thrown handler exceptions and rejected native promises, so routes are not wrapped. Readiness and SIGINT/SIGTERM draining are not implemented.

Before listen, `startServer()` with no explicit port loads `src/config/env.ts`. `PORT` may be an integer from 0 through 65535; when it is unset or empty the process uses 3000. Invalid config prints the variable names and rules, then exits. That startup failure is a plain `Error` on stderr, not the HTTP error envelope and not a JSON log line. After a successful bind, the process writes one JSON info line: `ecom-backend listening on <url>`. The listen address remains the constant `127.0.0.1`. The server does not send `X-Powered-By`.

## Local data stores (I01)
Node.js stays on the host. `docker-compose.yml` runs MySQL `26.7.0` and Redis `8.2`. Published ports bind to `127.0.0.1` only: MySQL host port `3307` (container port `3306`) and Redis `6379`. MySQL data is the named volume `ecom_mysql_data`. A Homebrew MySQL `26.7.0` already listens on port `3306` with its own datadir; Compose does not mount that directory.

`src/config/env.ts` validates `PORT`, `LOG_LEVEL`, `MYSQL_*`, and `REDIS_*` with one Zod schema. `LOG_LEVEL` is optional and defaults to `info`. `MYSQL_ROOT_PASSWORD` stays a Compose variable. `src/config/data-stores.ts` can open a one-shot MySQL `SELECT 1` plus a Redis `AUTH`/`PING` from those settings. `npm run infra:check` runs those checks. `createApp()` does not read the environment. `startServer()` with no explicit port validates the variables and does not connect, so liveness stays independent of the containers. `startServer(port)` is the in-process test seam and checks that number only. Sequelize pooling is F06. Cache and BullMQ are B01–B04. Readiness is F08. The application image is S08. Inside a future app container, the MySQL address is the Compose DNS name `mysql` on port `3306`, because `3307` is only the host mapping. The schema accepts that address.

## Contracts
- Version prefix `/api/v1`.
- Typed request inputs validated at boundaries; never trust input or cast it blindly.
- Success JSON is `{ "data": <payload> }` (see F02). Error JSON is `{ "error": { "status", "code", "message" } }` (see F04, ADR-005). The codes defined now are `not_found` and `internal_error`. A later failure adds a code by subclassing `AppError`.
- Use async/await. Express 5 forwards handler throws and rejections to `src/common/middleware/error-handler.ts`. Never leak stack traces to clients.
- Domain services handle policy and transactional decisions; repositories do not invoke web/email side effects within open DB transactions.
- Transactions are explicit for multi-row invariants. Checkout enforces inventory correctness using row locking/conditional updates; retries are bounded and idempotent.
- Use a single configured Sequelize instance per Node process with connection pooling (module caching may already suffice); don't instantiate a DB client per request. Avoid unnecessary Singleton classes.
- Authentication: short-lived access token, server-revocable rotating refresh token (stored hashed), appropriately secure transport/cookie policies; authorization includes both RBAC and object ownership.

## Design patterns to demonstrate, not force
Repository (storage boundary); Strategy + Factory (mock payment processors); Observer/event dispatcher (order-created notification); dependency injection for test seams; singleton/module-cached DB instance with trade-off explanation. Consider outbox when reliability exercise arrives.

## Testing and operations
Separate unit tests from integration tests. Use a disposable MySQL instance; avoid tests against production DB. Database migrations are source of truth; seeds deterministic. Include lint, typecheck and focused test scripts, health/readiness distinction, structured logs, request correlation, graceful SIGINT/SIGTERM handling.

## Scale-up discussion
Single deployable first. Study stateless API replicas behind load balancer, shared sessions/token persistence, Redis/DB bottlenecks, pool sizing, queues and backpressure. **Do not implement microservices purely to demonstrate scaling.**

## Review policy
This document describes intended architecture. When a task changes a convention, update this file and add an ADR to `DECISIONS.md`. Do not represent planned patterns as existing implementations.
