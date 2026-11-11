# Granular Implementation Roadmap

Each unchecked entry is **planned**, not implemented. Work on only one task per Agent chat. Tasks are ordered by prerequisites; do not start dependent tasks early.

## Task completion criteria
- Requirements for the selected task met; strict TS/typecheck passes; relevant tests pass or recorded as blocked.
- Only the selected task is checked after verification; `PROGRESS.md` updated.
- Learning notes and interview-checklist items updated when genuinely addressed.
- No automatic progression to next task.

## Foundation & TypeScript

- [x] **F01** — Bootstrap npm, strict TypeScript, scripts, gitignore and README
- [x] **F02** — Create Express app/server, route versioning and health endpoint
- [ ] **F03** — Validate environment with Zod and config conventions
- [ ] **F04** — Create typed error classes and global async error handling
- [ ] **F05** — Structured logger, request IDs and HTTP request logging
- [ ] **F06** — Configure MySQL + Sequelize pooled singleton/module instance. Use the I01 env vars and the Compose MySQL on `127.0.0.1:3307`. Keep Homebrew MySQL on port 3306 out of this app.
- [ ] **F07** — Migrations, seeders, disposable test DB and first migration runner
- [ ] **F08** — Readiness/liveness checks, startup failure and graceful shutdown
- [ ] **F09** — Add ESLint/formatting and reliable typecheck/test scripts
- [ ] **F10** — TypeScript lab: types/interfaces/unions/intersections/narrowing
- [ ] **F11** — TypeScript lab: generics, utility types, conditional/mapped types and safe Express Request augmentation

## Development infrastructure

- [x] **I01** — Docker Compose for development MySQL 26.7 and Redis 8.2. Node.js stays on the host. Connectivity check only.

## Users, Authentication & Authorization

- [ ] **A01** — User model/migration with uniqueness and repository
- [ ] **A02** — User registration with Zod, password hashing and duplicate handling
- [ ] **A03** — Login and access JWT creation/verification
- [ ] **A04** — Typed authentication middleware and protected profile route
- [ ] **A05** — Refresh session table and rotating hashed refresh-token lifecycle
- [ ] **A06** — Logout, session revocation, reuse detection and tests
- [ ] **A07** — Forgot/reset password with expiring hashed tokens
- [ ] **A08** — Email verification with local mail adapter and tests
- [ ] **A09** — Security lab: cookies, SameSite, CSRF, sessions vs JWT trade-offs
- [ ] **R01** — Roles, permissions and join-table migrations
- [ ] **R02** — Sequelize M:N associations and initial role seed data
- [ ] **R03** — RBAC permission middleware and tests
- [ ] **R04** — Ownership/object-level authorization, IDOR prevention and tests
- [ ] **R05** — Admin role assignment with least privilege and audit design

## Catalog, API design & Sequelize

- [ ] **P01** — Category schema, hierarchy and CRUD endpoints
- [ ] **P02** — Product model/CRUD with seller ownership
- [ ] **P03** — Variant/SKU schema, associations and validation
- [ ] **P04** — Inventory schema, constraints and inventory CRUD for sellers
- [ ] **P05** — Product filter/sort/search with allowlisted query builder
- [ ] **P06** — Offset pagination with stable ordering and limits
- [ ] **P07** — Cursor/keyset pagination with stable tie-break keys
- [ ] **P08** — Upload image metadata with safe validation/local dev adapter
- [ ] **P09** — Sequelize association lab: 1:1, 1:N, M:N and eager/lazy loading
- [ ] **P10** — ORM lab: N+1 detection, scopes, hooks and transaction interactions
- [ ] **P11** — HTTP lab: idempotent methods, status codes, headers and content negotiation

## Cart, Checkout, Orders & Payments

- [ ] **O01** — Cart and item schema, unique items and FKs
- [ ] **O02** — Cart add/update/remove with stock-independent validation
- [ ] **O03** — Order and line-item schema with immutable price snapshots
- [ ] **O04** — Create order with explicit multi-table transaction and rollback tests
- [ ] **O05** — Inventory availability check and atomic stock changes
- [ ] **O06** — Oversell concurrency test and SELECT FOR UPDATE/conditional update
- [ ] **O07** — Order state machine, authorization and cancellation
- [ ] **O08** — Idempotency key storage and duplicate checkout protection
- [ ] **E01** — Payment records and mock processor abstraction
- [ ] **E02** — Payment Strategy and Factory patterns with tests
- [ ] **E03** — Mock payment callbacks, webhook signature simulation and replay protection
- [ ] **E04** — Coupon model and discount validation
- [ ] **E05** — Coupon redemption concurrency and constraints
- [ ] **E06** — Product reviews, purchase eligibility and ownership
- [ ] **E07** — Repository/DI pattern comparison and Singleton trade-off lab

## SQL, DBMS & Sequelize deep dive

- [ ] **D01** — Constraints/normalization lab: 1NF, 2NF, 3NF, functional dependencies
- [ ] **D02** — Raw SQL INNER/LEFT/RIGHT/SELF joins and anti-joins
- [ ] **D03** — Aggregations, GROUP BY/HAVING and conditional aggregates
- [ ] **D04** — Subqueries, correlated subqueries and EXISTS/NOT EXISTS
- [ ] **D05** — CTEs, recursive CTE and window functions
- [ ] **D06** — Analytics reporting endpoints built with parameterized raw SQL
- [ ] **D07** — Index experiments: EXPLAIN/ANALYZE, composite and covering indexes
- [ ] **D08** — Offset vs keyset performance comparison with seeded data
- [ ] **D09** — ACID/isolation lab: dirty/nonrepeatable/phantom reads and MVCC
- [ ] **D10** — Deadlock reproduction, timeout handling and bounded retry
- [ ] **D11** — Optimistic vs pessimistic locking lab and version conflicts
- [ ] **D12** — Connection pool capacity, slow queries and ORM vs SQL comparison
- [ ] **D13** — SQL views, stored procedures and triggers as optional study lab

## Redis, asynchronous processing & runtime internals

- [ ] **B01** — Redis cache-aside on catalog reads with TTL. Use the I01 Redis service.
- [ ] **B02** — Invalidate cache on product updates and discuss stampedes
- [ ] **B03** — BullMQ notification worker and job producer
- [ ] **B04** — Worker retries, backoff, deduplication and dead-letter strategy
- [ ] **B05** — EventEmitter/Observer with order-created events
- [ ] **B06** — Outbox pattern lab for atomic event persistence
- [ ] **B07** — Audit logging with sensitive-field redaction
- [ ] **B08** — CSV export via Node streams, transforms and backpressure
- [ ] **N01** — Node lab: V8, libuv, event-loop phases and execution order
- [ ] **N02** — Node lab: promises, nextTick, timers, microtasks, async errors
- [ ] **N03** — Node lab: libuv threadpool, worker_threads and child_process
- [ ] **N04** — Node lab: Buffers, streams, pipe, pipeline and backpressure
- [ ] **N05** — Node lab: EventEmitter, modules, ESM vs CommonJS and caching
- [ ] **N06** — Node lab: CPU blocking, memory leaks, profiling and process metrics
- [ ] **N07** — Express lab: routing/middleware order, error flow and request lifecycle

## Security, testing, performance & deployment

- [ ] **S01** — Rate limit login and sensitive APIs; secure headers and CORS
- [ ] **S02** — Security lab: SQL injection, XSS, CSRF, input/output and mass assignment
- [ ] **S03** — Authn/authz audit: token theft, IDOR, permission escalation and tests
- [ ] **S04** — Unit tests with mocks and service-level edge cases
- [ ] **S05** — Integration tests with disposable MySQL and realistic fixtures
- [ ] **S06** — Concurrency/property-focused tests for checkout and stock invariants
- [ ] **S07** — Generate OpenAPI and document endpoint examples/errors
- [ ] **S08** — Dockerfile and Compose application image. I01 already runs MySQL and Redis; keep the existing MySQL volume.
- [ ] **S09** — CI pipeline for lint/typecheck/tests and safe migrations
- [ ] **S10** — Load test, bottleneck analysis, latency metrics and log correlation
- [ ] **S11** — Reverse proxy and horizontal scaling lab: stateless replicas and load balancer
- [ ] **S12** — System design lab: DB bottlenecks, pools, cache, queues and scaling failure modes
- [ ] **S13** — Production checklist, health/readiness review and final interview walkthrough

## Handling dependencies
Auth tables follow DB setup; authorization follows user/auth; checkout follows cart, order and inventory schema; payments follow orders; caching/queues follow stable modules and the I01 Redis service; scaling and comprehensive tests follow the working implementation. I01 does not block F03. F06 uses the Compose MySQL from I01. If needed, add explicit prerequisite notes to a task before starting it.

## Verification rule
If tests cannot run because MySQL/Redis/Docker is unavailable, write the exact blocker in PROGRESS.md, keep the checkbox open, and stop or perform limited documented validation.
