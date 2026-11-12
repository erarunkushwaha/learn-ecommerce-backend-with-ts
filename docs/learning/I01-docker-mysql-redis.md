# I01 — Docker Compose for MySQL and Redis

## What runs where
`npm run dev` still compiles TypeScript and starts `dist/server.js` on the host. That process binds `127.0.0.1` and serves `GET /api/v1/health`. It does not open MySQL or Redis.

`docker compose up -d` starts two containers:

| Service | Image | Host address | Persistence |
|---|---|---|---|
| `mysql` | `mysql:26.7.0` | `127.0.0.1:3307` | named volume `ecom_mysql_data` |
| `redis` | `redis:8.2` | `127.0.0.1:6379` | anonymous volume at `/data` |

Inside the Compose network the MySQL port is still `3306`. `3307` exists only so the host can reach the container while Homebrew MySQL keeps port `3306`. Both published ports are bound to loopback.

`src/config/env.ts` reads the host-side addresses from the environment. `npm run infra:check` loads `.env`, opens one MySQL connection, runs `SELECT 1`, closes it, then sends Redis `AUTH` and `PING`. No query string is built from user input. The check writes no Redis keys and runs no migration.

## Why the Homebrew server stays separate
On 2026-11-11 the machine already had Homebrew MySQL 26.7.0, process datadir `/opt/homebrew/var/mysql`, listening on port `3306`. The datadir contained user databases `ecom`, `ecommerce_db`, `joins_lab`, `rb_main`, and `rb_tenant_number_1`, and the `ecom` directory contained table files. There is no `my.cnf` for that server. `mysql -u root` without a password was rejected.

This repository had no `.env`, no MySQL client, and no migrations. Those Homebrew databases are practice data and other apps. The Compose file mounts a new named volume, creates an empty `ecom` database on first start, and sets `utf8mb4` / `utf8mb4_0900_ai_ci`. After startup that database had zero tables. The Homebrew `ecom` table files were still on disk, and that `mysqld` was still listening on port `3306`.

A copy is a separate decision. It was not required to give this repo a database, and it was not run.

## Copying a Homebrew database later
Do this only when you want one named Homebrew database inside Compose. Leave both servers running.

1. Dump with your own Homebrew credentials. The client will prompt for the password:

   ```bash
   mysqldump --host=127.0.0.1 --port=3306 --user=<user> --single-transaction --routines --databases <name> > backup.sql
   ```

2. Load the file into the Compose server, again at a password prompt:

   ```bash
   mysql --host=127.0.0.1 --port=3307 --user=root -p < backup.sql
   ```

Both servers are MySQL 26.7.0, so this is a same-version load. Skip it when the empty Compose `ecom` database is what later migrations should use. `docker compose down` keeps the named volume. `docker compose down -v` and `docker volume rm` delete Compose data; they were not used.

## Environment
`.env.example` is the template. `.env` is gitignored. Compose refuses to start when a required variable is missing. The Node check requires `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD`, and `REDIS_PASSWORD`. Host and port fall back to `127.0.0.1:3307` and `127.0.0.1:6379`. The HTTP process validates those same variables, plus `PORT`, before it listens. That check still does not open a connection.

The values in the example are local lab passwords. They are the Compose credentials, not production secrets, and they do not unlock the Homebrew server.

F03 validates these variables with Zod in `src/config/env.ts`. The ping reads that config and still opens no pool. F06 should create one Sequelize pool from the same variables. B01 is the first task that stores Redis keys. S08 is the task that builds an app image; that container must call hostname `mysql` on port `3306`.

## Security
The app user is `ecom`. The check connects as that user. Root is present for the image's first-time initialization and for an optional later import. Redis `requirepass` is set, and the host port is loopback-only. The password still appears in the container command because Redis receives `--requirepass` from Compose interpolation. That is acceptable for this local file and is a reason the real `.env` stays untracked.

Health checks prove the container processes answer `mysqladmin ping` and `redis-cli ping`. They do not prove the host-side Node client can authenticate. `npm run infra:check` is that second proof. `GET /api/v1/health` remains process liveness.

## Interview questions
1. Why keep Node on the host? The API process is already the local dev loop. Compose is only the data services until the application image task. A containerized app would need a different MySQL hostname.
2. Why is the MySQL host port 3307? Port 3306 is already the Homebrew server. Publishing Compose there would fail to bind or would hide which server a client reached.
3. Why a named volume instead of the Homebrew datadir? A datadir has one owner. Mounting it into a second `mysqld` risks corruption. A named volume starts empty and survives `docker compose down`.
4. What does an empty `ecom` database mean? The image created the schema and the user on first boot. Application tables arrive with migrations. The zero table count shows the Homebrew table files were not imported.
5. Why can liveness stay green when MySQL is stopped? F02 defined health as "the process can serve HTTP". Readiness is the later check that should fail when a dependency is down.
6. Why ping Redis with `AUTH` and no `SET`? Connectivity needs a round trip. A write would start the cache behavior reserved for the catalog cache task.
7. Why require a Redis password on loopback? Loopback limits who can open the port. A password still stops another local process from issuing commands if it can reach `6379`.
8. What is the difference between `docker compose down` and `down -v`? The first removes containers and the project network. The second also removes declared volumes, which deletes the MySQL data files.
9. Why match image `mysql:26.7.0`? That is the Homebrew server version. A dump from that server can load into this image. An older major would make a later copy a downgrade.
10. Where should the Sequelize instance live? One module-cached pool per process, created from these settings. A new pool per request exhausts connections. That pool is the next database task, not this ping.

## From-scratch exercise
In an empty directory, write a Compose file that publishes MySQL on `127.0.0.1:3307` with a named volume and a health check. Start it, connect with the `mysql` client, and run `SHOW TABLES`. Then explain which directory holds those files, and why a server already listening on port `3306` is unaffected.
