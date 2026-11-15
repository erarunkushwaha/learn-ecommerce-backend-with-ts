# Database Design

## Database
MySQL 8+ / InnoDB / utf8mb4. Use UTC timestamps, deterministic migrations, explicit foreign keys and sensible on-delete actions. Financial totals are calculated server-side; preserve price snapshots on order items.

ADR-009 is the identifier and money choice, made before the first domain table:

- Application primary keys are `BIGINT UNSIGNED` `AUTO_INCREMENT`.
- Money is `DECIMAL(12,2)` plus a `CHAR(3)` currency code. No money column exists yet.
- Timestamps that the application writes are `DATETIME(3)`. The pool sets the session time zone to `+00:00`.
- Table and column names are `snake_case`.
- Bookkeeping tables are the exception: `SequelizeMeta.name` and `SequelizeData.name` are `VARCHAR(255)` primary keys.

## Where development data lives
The baseline migration and seeder have been applied to Compose `ecom`. Two MySQL 26.7.0 servers can be running, and they do not share files.

| Server | Address | Data |
|---|---|---|
| Homebrew `mysqld` | port `3306`, datadir `/opt/homebrew/var/mysql` | Already had user databases `ecom`, `ecommerce_db`, `joins_lab`, `rb_main`, and `rb_tenant_number_1` on 2026-11-11. This repo does not connect to them. |
| Compose service `mysql` | `127.0.0.1:3307`, volume `ecom-backend_ecom_mysql_data` | Database `ecom`, charset `utf8mb4`, collation `utf8mb4_0900_ai_ci`. F07 applied `schema_baseline`, `SequelizeMeta`, and `SequelizeData` here. |

Root login to the Homebrew server without a password was rejected, so those tables were not read or copied. Redis `8.2` listens on `127.0.0.1:6379` and has no cache keys yet. See `docs/learning/I01-docker-mysql-redis.md` before copying anything between the two MySQL servers.

## Client
F06 keeps one Sequelize 6 pool in `src/database/sequelize.ts`. The process entry builds it from `loadConfig` and does not run a query or a migration. The host default is `127.0.0.1:3307`. The pool cap is 5 connections and the minimum is 0, so an idle process holds no MySQL socket. Session time zone is `+00:00` and the connection charset is `utf8mb4`. `sync()` is not called. `npm run infra:check` still uses its own short-lived connection.

`npm run db:migrate` and `npm run db:seed` open a second, short-lived pool from `readMysqlSettings`. They load compiled files with Umzug. `npm run db:migrate:undo` and `npm run db:seed:undo` revert the latest applied file of that kind. Undo the seeder before undoing the migration that drops its table.

## Disposable test database
`tests/migrations.test.mjs` connects as Compose `root`, drops and creates `ecom_test` with `utf8mb4` / `utf8mb4_0900_ai_ci`, grants `MYSQL_USER`@`%` all privileges on that database, runs the migration and seeder as that user, revokes the grant, and drops `ecom_test`. The name is fixed. The test refuses any other name. It records the table list of `ecom` and requires that list to be unchanged. `MYSQL_ROOT_PASSWORD` stays out of the application schema. After the suite on 2026-11-15, `SHOW DATABASES LIKE 'ecom_test'` returned no row.

## Implemented tables
Observed on Compose `ecom` after `npm run db:migrate` and `npm run db:seed` on 2026-11-15. A second run of each command applied nothing.

| Table | Columns | Notes |
|---|---|---|
| `schema_baseline` | `id` `bigint unsigned` NOT NULL AUTO_INCREMENT PRIMARY KEY; `label` `varchar(32)` NOT NULL UNIQUE; `created_at` `datetime(3)` NOT NULL | InnoDB, `utf8mb4_0900_ai_ci`. Migration `20261115140000-baseline.js`. Not a user, catalog, or auth table. `down` drops it. |
| `SequelizeMeta` | `name` `varchar(255)` NOT NULL PRIMARY KEY | InnoDB, `utf8mb4_0900_ai_ci`. One row: `20261115140000-baseline.js`. Created by the runner, not by a migration file. Undo deletes the row and leaves the table. |
| `SequelizeData` | `name` `varchar(255)` NOT NULL PRIMARY KEY | InnoDB, `utf8mb4_0900_ai_ci`. One row: `20261115140000-baseline-seed.js`. Same lifecycle as `SequelizeMeta`. |

`schema_baseline` has one seeded row: `id` 1, `label` `baseline`, `created_at` `2026-11-15 00:00:00.000`. The seeder deletes only that label. The HTTP process does not read the row.

## Planned tables / relationships
| Table | Primary fields (illustrative) | Relationships / notes |
|---|---|---|
| users | id, email UNIQUE, password_hash, status | 1:N addresses, orders, reviews; Never return hash |
| addresses | id, user_id FK, ... | ownership enforced |
| roles | id, name UNIQUE | M:N users via user_roles |
| permissions | id, code UNIQUE | M:N roles via role_permissions |
| user_roles | user_id, role_id | composite UNIQUE and FKs |
| role_permissions | role_id, permission_id | composite UNIQUE and FKs |
| refresh_sessions | id, user_id, token_hash, expires_at, revoked_at | hashed rotating refresh token chain |
| verification_tokens | id, user_id, token_hash, type, expires_at | email verification and reset flows |
| categories | id, parent_id nullable, name, slug UNIQUE | hierarchical self-reference |
| products | id, seller_id, category_id, name, status | soft-delete policy deliberate |
| product_variants | id, product_id, sku UNIQUE, price DECIMAL | product 1:N variants |
| inventory | variant_id UNIQUE, available_quantity, reserved_quantity | stock invariant/nonnegative checks |
| carts | id, user_id UNIQUE | 1:N cart_items |
| cart_items | id, cart_id, variant_id, quantity | UNIQUE(cart_id,variant_id) |
| orders | id, user_id, status, subtotal, discount, total, currency | state transitions + indexes |
| order_items | id, order_id, variant_id, quantity, unit_price | snapshot at checkout |
| payments | id, order_id, provider, external_ref, status | mock processor; idempotency |
| idempotency_keys | id, user_id, key, request_hash, result | request replay protection |
| coupons | id, code UNIQUE, rule data, valid_until | explicit eligibility rules |
| coupon_redemptions | id, coupon_id, user_id, order_id | constraints prevent misuse |
| reviews | id, product_id, user_id, rating, text | ownership / purchase rules |
| notifications | id, user_id, type, status, payload | async delivery |
| audit_logs | id, actor_id, action, entity_type, entity_id, changes | redact sensitive fields |
| outbox_events (advanced) | id, event_type, payload, published_at | atomic event record for job delivery |

## Normalization exercises
Document 1NF, 2NF, 3NF and functional dependencies. Why orders/order_items are separate, why prices are snapshotted, why many-to-many join tables are required, and selective denormalization for reporting.

## Required SQL and ORM coverage
- PK, FK, UNIQUE, CHECK, NOT NULL, DEFAULT, CASCADE/RESTRICT choices; joins (INNER/LEFT/RIGHT/SELF; FULL OUTER JOIN simulated in MySQL if needed), GROUP BY, HAVING, aggregate queries.
- Subqueries, correlated subqueries, EXISTS/NOT EXISTS, CTE/recursive CTE, ROW_NUMBER/RANK/DENSE_RANK, running totals; parameterized raw SQL via Sequelize query API.
- Sequelize hasOne, belongsTo, hasMany, belongsToMany; eager vs lazy loading, N+1, scopes, hooks (avoid hidden business side effects), raw queries, transactions, migrations and seeders.
- EXPLAIN/EXPLAIN ANALYZE, index cardinality/selectivity, composite leftmost-prefix rule, covering indexes, index trade-offs, LIMIT/OFFSET vs keyset pagination.
- ACID, transaction isolation (Read Uncommitted/Committed, Repeatable Read, Serializable), dirty/non-repeatable/phantom reads, MVCC, row vs gap locks, deadlocks, optimistic versioning and pessimistic SELECT ... FOR UPDATE.
- Optional interview labs: SQL views, stored procedures, triggers (do not put core business logic there without a design decision).

## Index candidates (confirm using actual query plans)
- users(email UNIQUE), product_variants(sku UNIQUE)
- products(category_id, status, id), orders(user_id, created_at, id)
- order_items(order_id), payments(order_id), audit_logs(actor_id, created_at)
Indexes are hypotheses until explained by measured query plans. Don't index every column.

## Operational rules
- Always use migrations; `sync({force:true})` prohibited for shared/prod DB.
- Never concatenate user data into SQL. Use replacements/bind parameters.
- Test rollback, oversell prevention, retry behavior and migration from clean database.
- Record actual migrations, column choices and deviations **as implemented**, not as assumptions.
