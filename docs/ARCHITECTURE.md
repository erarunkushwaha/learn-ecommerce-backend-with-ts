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

As of F02, `src/` contains `index.ts`, `app.ts`, and `server.ts` only. The other folders above are not created yet.

## Request lifecycle
Target path for later tasks. F02 only disables `X-Powered-By`, mounts `/api/v1`, and serves `GET /health` on that router.

Client -> reverse proxy (optional) -> Express middleware (request-id/logger/security/CORS/rate-limit/parsers, in correct order) -> auth -> ownership/permissions -> Zod validation -> route -> controller -> service -> repository -> Sequelize/parameterized SQL -> MySQL. Global error middleware last. Middleware placement depends on endpoint needs; do not authenticate public routes.

## Implemented HTTP (F02)
`createApp()` in `src/app.ts` builds Express and does not listen. `src/server.ts` listens on `127.0.0.1` and can close that server. Routes are mounted at `/api/v1`. `GET /api/v1/health` returns `200` and `{ "data": { "status": "ok" } }`. That is process liveness only. It does not check MySQL or any other dependency.

Successful JSON uses one envelope: `{ "data": <payload> }`. Error JSON, readiness, request logging, and SIGINT/SIGTERM draining are not implemented. `PORT` may be an integer from 0 through 65535; when it is unset or empty the process uses 3000. A non-integer `PORT` throws. Zod configuration replaces that parse later. The server does not send `X-Powered-By`.

## Contracts
- Version prefix `/api/v1`.
- Typed request inputs validated at boundaries; never trust input or cast it blindly.
- Success JSON is `{ "data": <payload> }` (see F02). Stable error codes are not defined yet. Use standard HTTP statuses.
- Use async/await; ensure thrown errors propagate to centralized error handling. Never leak stack traces to clients.
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
