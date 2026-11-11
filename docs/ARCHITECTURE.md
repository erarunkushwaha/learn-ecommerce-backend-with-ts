# Architecture & Conventions (initial proposal)

## Style
Modular monolith. Scale with disciplined module boundaries before considering services. `src/app.ts` assembles Express; `src/server.ts` starts and stops network/process resources. Controller = HTTP adaptation; service = business rules; repository = persistence. Avoid adding a layer that only forwards calls.

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

## Request lifecycle
Client -> reverse proxy (optional) -> Express middleware (request-id/logger/security/CORS/rate-limit/parsers, in correct order) -> auth -> ownership/permissions -> Zod validation -> route -> controller -> service -> repository -> Sequelize/parameterized SQL -> MySQL. Global error middleware last. Middleware placement depends on endpoint needs; do not authenticate public routes.

## Contracts
- Version prefix `/api/v1`.
- Typed request inputs validated at boundaries; never trust input or cast it blindly.
- Consistent success responses, stable error codes, standard HTTP statuses; define examples when HTTP setup task is implemented.
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
