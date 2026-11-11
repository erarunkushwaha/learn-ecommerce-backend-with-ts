# Backend Interview Coverage Checklist

The checklist tracks **concept coverage**, not application tasks. Do not mark a topic complete until it is explained in a `LEARNING.md`/lab and supported by implemented code or a runnable experiment. Keep evidence links or task IDs next to checked items.

## TypeScript

- [x] strictNullChecks / noImplicitAny — F01, `tsconfig.json` (`"strict": true`), `docs/learning/F01-bootstrap.md`
- [ ] interface vs type; union/intersection; discriminated union
- [ ] generics and reusable response/repository types
- [ ] utility types Partial/Pick/Omit/Record/Readonly
- [ ] mapped/conditional types and type guards
- [ ] Express Request extension, runtime validation vs TS types

## Node.js

- [ ] V8, call stack and JavaScript runtime
- [ ] libuv event loop phases and nonblocking I/O
- [ ] microtasks, process.nextTick, setImmediate, timers
- [ ] Promises, async/await, error propagation
- [ ] libuv thread pool vs worker threads vs child processes
- [ ] EventEmitter and events
- [ ] Streams, Buffers, pipeline and backpressure
- [x] CommonJS vs ESM; module cache — F01, ADR-001, `docs/learning/F01-bootstrap.md`
- [ ] CPU-bound vs IO-bound workloads, profiling and memory leaks
- [ ] process signals, graceful shutdown and clustering/load balancer discussion

## Express / HTTP

- [ ] request-response lifecycle and middleware order
- [ ] controllers/services/repositories separation
- [ ] sync/async errors and global handler
- [ ] authentication vs authorization / ownership checks
- [ ] validation and HTTP status semantics
- [ ] CORS, CSRF, cookies and security headers
- [ ] versioning, filtering, pagination, rate limits — `/api/v1` prefix only (F02); filtering, pagination, and rate limits are later
- [ ] health and readiness; logging and correlation IDs — liveness `GET /api/v1/health` only (F02); readiness is F08; logging and correlation IDs are F05

## MySQL / DBMS

- [ ] ER design and 1:1,1:N,M:N relationships
- [ ] PK/FK/UNIQUE/CHECK/NOT NULL/DEFAULT
- [ ] 1NF,2NF,3NF/BCNF and denormalization
- [ ] INNER/LEFT/RIGHT/SELF joins, anti joins
- [ ] GROUP BY/HAVING and aggregates
- [ ] subqueries, correlated queries, EXISTS
- [ ] CTEs, recursive CTE and windows
- [ ] views, stored procedures and triggers (study)
- [ ] indexes: B-tree, composite, covering, cardinality/selectivity
- [ ] EXPLAIN and practical query optimization
- [ ] ACID, MVCC and isolation anomalies
- [ ] transaction isolation levels, deadlocks and retries
- [ ] optimistic/pessimistic locking and race conditions
- [ ] offset vs cursor pagination
- [ ] SQL injection and parameterization

## Sequelize

- [ ] model definition/types, query options
- [ ] hasOne/belongsTo/hasMany/belongsToMany
- [ ] eager/lazy loading, N+1 and batch reads
- [ ] scopes, hooks, validations and lifecycle
- [ ] migrations/seeders and schema versioning
- [ ] transactions, locks, isolation and connection pools
- [ ] raw SQL and performance trade-offs
- [ ] soft delete/paranoid and uniqueness implications

## Authentication / security

- [ ] hashing vs encryption, password storage
- [ ] JWT vs session; access/refresh lifecycle
- [ ] refresh-token hashing, rotation, revocation and reuse
- [ ] secure cookie/SameSite/CSRF decisions
- [ ] RBAC/permission/resource ownership and IDOR
- [ ] rate limiting, injection, mass assignment, XSS
- [ ] OWASP risks and audit logs
- [ ] idempotency and replay defense

## Design patterns / architecture

- [ ] SOLID / separation of concerns
- [ ] Singleton vs Node module caching and connection pooling
- [ ] Repository Pattern and dependency injection
- [ ] Strategy / Factory for payments
- [ ] Observer/events, outbox vs direct events
- [ ] modular monolith vs microservices
- [ ] stateless APIs and load balancers
- [ ] transaction boundaries and eventual consistency

## Performance / operations

- [ ] Redis cache-aside, TTL/invalidation
- [ ] queues, workers, retry/backoff and dead letter
- [ ] logging, metrics, health checks — liveness response only (F02); logging and metrics are later
- [ ] unit/integration/e2e/security/concurrency tests
- [ ] Docker Compose and CI — local MySQL and Redis Compose is I01; the app image and CI remain S08 and S09
- [ ] reverse proxy, horizontal scaling, bottlenecks
- [ ] load test, DB pool sizing and throughput

## Interview and rebuild

- [ ] LEARNING.md explains important choices per module
- [ ] 5-10 interview questions and answers per module
- [ ] hands-on from-scratch exercises
- [ ] runnable Node and DBMS concept labs
- [ ] demonstrate key endpoints end-to-end
- [ ] complete project retrospective and alternative designs
