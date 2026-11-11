# Project Brief — E-Commerce Backend Interview Lab

## Goal
Create an interview-ready **reference backend** for a developer refreshing backend skills after a gap. It should teach implementation **and** explain internals, trade-offs, security, DBMS theory, performance and system design. Code is generated module-by-module by Cursor, studied, and later reconstructed from scratch in a separate practice repository.

## Stack
- Supported Node.js LTS; Express; strict TypeScript; npm; ESM/CJS choice documented early.
- MySQL 8+ with InnoDB; Sequelize ORM with migrations/seeders; parameterized raw SQL for deep SQL practice.
- Zod; password hashing (argon2 or bcrypt with rationale); short-lived access JWT and rotating revocable refresh tokens; secure cookie/CSRF strategy documented.
- Redis + BullMQ **later**; structured logger; OpenAPI; Jest or Vitest + Supertest (choose one, document); Docker Compose; CI basics.
- Payments via a **mock processor** only; no real charges or credentials needed. Email provider via local fake/console first. Optional object-storage mock for uploads.

## Business modules
1. Users, addresses, sessions, email verification, password reset.
2. Roles, permissions, user-role assignments and resource-level ownership (customer/seller/admin/super-admin).
3. Categories, products, variants, inventory, reviews and upload metadata.
4. Cart, checkout, orders, order items, order status transitions, refunds/cancellations as mock flows.
5. Payment strategies (mock card/COD), idempotency keys and state machines.
6. Coupons/redemptions, notifications, admin dashboards, audit trails and reporting.

## Engineering capabilities
- API design, HTTP status semantics, request validation, versioning, error schema, health/readiness, CORS, security headers, rate limiting, request IDs.
- SOLID principles where useful; repository, strategy, factory, dependency-injection, singleton/module instance, event observer patterns; testability and trade-offs.
- CRUD, Sequelize associations, scopes/hooks (with pitfalls), transactions, seeding, eager/lazy loading, N+1 detection, migrations.
- Raw SQL: all primary join types, grouping, HAVING, subqueries, CTEs, windows, correlated queries, conditional aggregation, pagination.
- MySQL: normalization, functional dependencies, indexes (composite/covering), EXPLAIN, locking, ACID, isolation anomalies, deadlocks, consistency, query tuning.
- Concurrency: stock reservation / overselling, idempotency, retries, transaction boundaries, eventual consistency and outbox (advanced).
- Redis caching, TTL, invalidation, worker queues, retries, deduplication, dead-letter handling, stream/CSV export/backpressure.
- Testing: unit/integration/API/concurrency, test DB, deterministic fixtures, security tests; logging/metrics/performance and graceful shutdown.
- Deployment: Docker, environment secrets, connection pools, reverse proxy/load balancer, stateless replicas, operational failure modes.

## Required standalone interview labs
Implement simple runnable labs (not feature bloat) for TypeScript advanced types; Node event loop/libuv, concurrency, promises, streams/buffers, event emitters, memory/performance; Express middleware/order; SQL isolation/locks/deadlocks and EXPLAIN; horizontal scaling/load balancer design exercises.

## Output discipline
- Implement exactly one roadmap task at a time, keeping app runnable.
- Add concise module learning notes and linked interview checklist items.
- Code quality/security/trade-offs matter more than number of endpoints.
- Keep all documentation truthful to actual state (planned != implemented).
- No payment secrets, real payment provider, service mesh or microservices by default.

## Definition of done for *the whole project*
Every roadmap task is either completed with recorded checks or transparently deferred, all critical API flows pass integration tests, database migrations work from an empty DB, modules have learning notes, and interview coverage is reviewed. **A generated file alone is not evidence of completion.**
