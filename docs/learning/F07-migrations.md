# F07 — Migrations, seeders, and a disposable database

## Where this sits
The HTTP process still does not change the schema. `src/server.ts` builds the pool and listens. `npm run db:migrate` compiles TypeScript, then runs `dist/database/cli.js migrate` with `.env`.

`parseSchemaCommand` accepts `migrate`, `migrate:undo`, `seed`, or `seed:undo`. `runSchemaCommand` calls `readMysqlSettings`, builds a short-lived pool with `createSequelize`, runs one Umzug runner, and closes the pool. It does not call `loadConfig`, so Redis settings are not required. A call made after deleting `REDIS_PASSWORD`, `REDIS_HOST`, and `REDIS_PORT` still applied zero pending migrations to `ecom`.

Umzug reads `*.js` from the directory next to the compiled migrator. `npm run db:migrate` compiles first, so the files it runs are `dist/database/migrations/*.js` and `dist/database/seeders/*.js`. Each file exports `up` and `down`. The function receives `{ context }`, and `context` is Sequelize's `QueryInterface`.

## What the first files do
`20261115140000-baseline.ts` creates `schema_baseline` and `down` drops it. The columns are `id` `BIGINT UNSIGNED` auto-increment, `label` `VARCHAR(32)` unique, and `created_at` `DATETIME(3)`. The table is InnoDB and `utf8mb4_0900_ai_ci`. It is not a user, product, or auth table. Nothing in the HTTP app reads it.

`20261115140000-baseline-seed.ts` inserts one row: label `baseline`, `created_at` `2026-11-15 00:00:00.000`. `down` deletes only that label. The clock string is stored as written because the session time zone is `+00:00`. It is not `CURRENT_TIMESTAMP`, so another machine inserts the same value.

On Compose `ecom` the first `db:migrate` logged `migrated` for `20261115140000-baseline.js`. The first `db:seed` logged the same event name for `20261115140000-baseline-seed.js`, then a summary line `seeders applied`. Umzug uses the event name `migrating` for both runners. The summary line is what distinguishes the command. A second migrate and a second seed each logged `count` 0.

## How a run is remembered
`SequelizeMeta` stores migration filenames. `SequelizeData` stores seeder filenames. Both are `VARCHAR(255)` primary keys, InnoDB, `utf8mb4_0900_ai_ci`. The runner creates them with `CREATE TABLE IF NOT EXISTS` before it reads or writes. That is not `Model.sync()`, and it is not `sync({ force: true })`.

Umzug treats the last name in ascending order as the latest file. `down` with no arguments reverts that one name. A new file needs a timestamp prefix that sorts after files already applied. Undo deletes the history row and leaves the history table. After `migrate:undo` on the disposable database, `schema_baseline` was gone and `SequelizeMeta` still existed with zero rows.

MySQL commits a `CREATE TABLE` by itself. A transaction around that statement cannot put the table back if a later statement fails. `down` is the rollback. The baseline `up` is one `createTable`, so the gap between the DDL and the history insert is small. A crash in that gap would leave the table without a history row, and the next `up` would fail on the existing table. There is no migration lock if two commands run at once.

## The disposable database
The `ecom` user can change `ecom` only. `tests/migrations.test.mjs` reads `MYSQL_ROOT_PASSWORD` from `.env`, connects as `root`, and refuses every name other than `ecom_test`. It drops and creates that database, grants the app user `ALL` on `ecom_test.*`, and runs `runSchemaCommand` with `MYSQL_DATABASE=ecom_test`. The assertions then check the table, the history rows, the seeded clock time, undo, a seed that fails while the table is gone, and a second create. The grant is revoked and the database is dropped. The test compares `ecom` table names before and after and requires the same list. After the suite, `ecom_test` was not on the server.

The test proved create and roll back. The Compose database was migrated only by `npm run db:migrate` and `npm run db:seed`, and those were left applied.

## Identifiers and money
ADR-009 fixes the rules before a user or price table exists. Application primary keys are `BIGINT UNSIGNED AUTO_INCREMENT`. Money will be `DECIMAL(12,2)` plus a `CHAR(3)` currency code. `schema_baseline` has the id and the timestamp. It has no money column, because it has no price. History tables stay keyed by filename.

The seeded `id` came back as the JSON number `1`. This pool does not set mysql2's big-number options. A `BIGINT` larger than `Number.MAX_SAFE_INTEGER` is not exact as a JavaScript number. The first repository that reads ids has to handle that.

## Security
The migration command uses the application user and the database named in `MYSQL_DATABASE`. It cannot create `ecom_test`. Root is used only by the test, and the password is not passed to `loadConfig`. History inserts bind the filename. The baseline seeder passes the label through `bulkInsert` and `bulkDelete` rather than concatenating it. Logs from the test did not contain the MySQL password or the root password. The CLI prints `error.message` and not the Umzug context object, because that object is the query interface.

`schema_baseline` is still a real table on the shared development database. Do not put secrets or application rows in it.

## Interview questions
1. Why are migrations the source of truth? `sync({ force: true })` drops tables to match models. A migration file is an ordered change that can be reviewed and reverted. The database and the files meet when every filename in the directory has a row in `SequelizeMeta`.
2. What does `SequelizeMeta` store? The basename of each applied migration, such as `20261115140000-baseline.js`. It does not store the SQL. The SQL lives in the file.
3. Why not test against `ecom`? That database is the shared development copy. A test that drops `schema_baseline` there races the next person using it. `ecom_test` is created for the test and dropped at the end.
4. Why does the test connect as root? `SHOW GRANTS` for `ecom`@`%` is `USAGE` globally and `ALL` on `ecom.*` only. Creating `ecom_test` needs a user who can create a database. The migration itself still runs as `ecom`.
5. Why is `down` required if MySQL has transactions? DDL such as `CREATE TABLE` commits implicitly. The open transaction does not remove the table. `down` has to drop what `up` created.
6. Why `BIGINT UNSIGNED` instead of `INT` or UUID? A signed `INT` tops out near two billion. UUID keys are wider and arrive out of order. The database assigns the auto-increment value, so a client does not choose its id.
7. Why `DECIMAL(12,2)` for money? `FLOAT` cannot represent every decimal amount. Integer cents avoid that too, and this project chose a fixed scale of two digits plus a separate currency code. The type holds up to `9999999999.99`. Currencies with three minor digits do not fit this rule.
8. Why not migrate inside `startServer`? Every replica would try to change the schema on boot. The command is an operator step. The process can listen while the migration has not run. Health remains liveness.
9. How is a seeder different from a migration? A migration changes schema. A seeder inserts a known row and records that fact in `SequelizeData`, not in `SequelizeMeta`. Undo the seeder before dropping the table it fills.
10. Why does undo leave `SequelizeMeta` behind? The history table is how the runner knows what is pending. Dropping it would make every migration look new. Undo removes the filename, not the bookkeeping table.

## From-scratch exercise
In an empty folder, install `sequelize`, `mysql2`, and `umzug`. Point one Sequelize instance at a database you can drop. Write `up` that creates `notes(id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, body VARCHAR(80) NOT NULL)` and `down` that drops `notes`. Run `up`, then select the row from `information_schema.COLUMNS`. Run `down` and select again. Explain why the history table can still be there when `notes` is gone, and why wrapping `up` in a Sequelize transaction would not remove `notes` if `down` were never called.
