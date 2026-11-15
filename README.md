# ecom-backend

Interview-lab e-commerce API. The HTTP process is an Express app with a `/api/v1` prefix, liveness and MySQL readiness routes, Zod environment validation, a JSON error handler, structured request logs, and one Sequelize pool for Compose MySQL. Schema changes go through `npm run db:migrate`. Local MySQL and Redis run in Docker Compose. Startup probes MySQL before listen. SIGINT and SIGTERM drain the HTTP server and the pool. The process does not migrate on startup.

## Requirements

- Node.js 22 LTS (verified on v22.12.0)
- npm 10
- Docker Engine 28 and Docker Compose v2 (verified with Compose v2.40.3)

## Scripts

- `npm run typecheck` — strict TypeScript check of `src/`, no emit
- `npm run lab:f10` — compile `labs/f10-types` and print the narrowing demo
- `npm run lint` — ESLint, including type-aware rules for `src/` and `labs/`
- `npm run lint:fix` — ESLint with safe automatic fixes
- `npm run format:check` — Prettier check for the code files
- `npm run format` — rewrite those files with Prettier
- `npm run build` — compile `src/` to `dist/`
- `npm run dev` — compile, then run the HTTP server with `.env`
- `npm start` — run the already compiled HTTP server with `.env`
- `npm test` — compile, then run the Node.js built-in tests
- `npm run infra:check` — compile, load `.env`, then ping the Compose MySQL and Redis services
- `npm run db:migrate` — compile, then apply pending migrations to `MYSQL_DATABASE`
- `npm run db:migrate:undo` — compile, then revert the latest applied migration
- `npm run db:seed` — compile, then apply pending seeders
- `npm run db:seed:undo` — compile, then revert the latest applied seeder

`npm start` listens on `127.0.0.1`. It validates `PORT`, `LOG_LEVEL`, the MySQL settings, and the Redis settings before listen. `PORT` defaults to `3000` when unset or empty. `LOG_LEVEL` defaults to `info` (`debug`, `info`, `warn`, or `error`). Set `PORT=0` to let the OS pick a free port. A non-integer `PORT`, an unknown log level, or a missing database or Redis password exits before listen. When the settings are valid, the process probes MySQL and exits if that probe fails. Redis is not probed. SIGINT and SIGTERM stop accepting connections, finish in-flight responses, and close the pool. Copy `.env.example` to `.env` first; Node reports a missing env file before the app does.

## Docker Compose

Copy the local env file once:

```bash
cp .env.example .env
docker compose up -d
npm run infra:check
```

`docker compose ps` shows MySQL, Redis, and Adminer. `docker compose logs` shows their output. `docker compose stop` pauses them. `docker compose down` removes the containers and keeps the named MySQL volume. Adding `-v` deletes that volume.

Adminer is at [http://127.0.0.1:8080](http://127.0.0.1:8080). The server field is `mysql`. Use `MYSQL_USER`, `MYSQL_PASSWORD`, and `MYSQL_DATABASE` from `.env`. After this file changes, start the new container with `docker compose up -d` in your own terminal.

The HTTP process stays on the host:

```bash
npm run dev
```

`GET /api/v1/health` does not connect to MySQL or Redis. `GET /api/v1/ready` checks MySQL through the process pool. `npm run infra:check` opens one MySQL connection and a Redis ping, then closes them. That ping is separate from the pool and is described with the pool in `docs/learning/F06-sequelize-pool.md` and `docs/learning/F08-readiness-shutdown.md`. From this machine the database is `127.0.0.1:3307`. A Homebrew MySQL may already be using port `3306`; that server is a different data directory. Details and a later copy procedure are in `docs/learning/I01-docker-mysql-redis.md`.

## Migrations

`npm run db:migrate` and `npm run db:seed` use `MYSQL_USER` against `MYSQL_DATABASE`. They do not read Redis settings and they do not create a database. Run the seeder after the migration. Undo with `npm run db:seed:undo` before `npm run db:migrate:undo`. The first migration creates `schema_baseline`. The first seeder inserts one row labeled `baseline`. See `docs/learning/F07-migrations.md`.

`npm test` creates `ecom_test` on the Compose server with `MYSQL_ROOT_PASSWORD`, migrates that database, and drops it. It does not roll back `ecom`.

## Health

`GET /api/v1/health` returns `200` and `{ "data": { "status": "ok" } }`. That means the process can serve HTTP. It does not check the Sequelize pool. `GET /api/v1/ready` returns `200` and `{ "data": { "mysql": "ok" } }` when MySQL accepts `SELECT 1+1 AS result`. A failed probe returns `503` and `{ "error": { "status": 503, "code": "not_ready", "message": "MySQL is unavailable" } }`. The driver text stays in the error log. Startup runs the same probe and exits before listen when it fails. See `docs/learning/F08-readiness-shutdown.md`.

An unknown path or method returns `404` and `{ "error": { "status": 404, "code": "not_found", "message": "Not found" } }`. An unexpected throw returns `500` with code `internal_error` and the message `Internal server error`. The body does not include a stack. The process writes that failure, including the message and stack, as one JSON line on stderr. Every response sets `X-Request-Id`. Send a token of letters, digits, `.`, `_`, or `-` to reuse it; any other value is replaced. Access logs are JSON lines on stdout and do not include the query string. See ADR-005 and ADR-006.

## Module format

The package is ECMAScript modules (`"type": "module"`). TypeScript uses `NodeNext`, so relative imports use a `.js` specifier. See ADR-001, ADR-002, ADR-004, ADR-005, ADR-006, ADR-007, ADR-010, and ADR-011 in `docs/DECISIONS.md`.

`npm run typecheck` does not write `dist`. `npm test` compiles first, then runs `node --test` on the quoted pattern `tests/**/*.test.mjs`, so the shell does not expand it. `npm run lint` and `npm run format:check` do not replace that pair. Prettier formats `src/`, `tests/`, `scripts/`, `labs/`, `eslint.config.js`, and `package.json`. It does not format markdown. See `docs/learning/F09-lint-format.md`.

`npm run lab:f10` compiles `labs/f10-types` to `labs/f10-types/dist` and prints four demo lines. That program is not imported by the HTTP app. `npm run typecheck` does not compile it. `npm test` does. See `docs/learning/F10-types.md` and ADR-012.

## Layout

- `src/app.ts` — Express app, `/api/v1`, health and ready routes, request id, access log, JSON 404, error middleware; does not listen or open a pool
- `src/server.ts` — process entry that validates config, probes MySQL, listens, and drains on SIGINT and SIGTERM
- `src/config/env.ts` — Zod schema for `PORT`, `LOG_LEVEL`, MySQL, and Redis
- `src/config/logger.ts` — one JSON object per log line
- `src/config/data-stores.ts` — one-shot MySQL and Redis pings
- `src/database/sequelize.ts` — one module-cached Sequelize pool and `probeMysql`; no models and no `sync()`
- `src/database/migrator.ts` — Umzug runners for migrations and seeders
- `src/database/cli.ts` — `migrate`, `migrate:undo`, `seed`, and `seed:undo`
- `src/database/migrations/20261115140000-baseline.ts` — creates and drops `schema_baseline`
- `src/database/seeders/20261115140000-baseline-seed.ts` — one deterministic baseline row
- `src/common/errors/app-error.ts` — `AppError`, `NotFoundError`, `NotReadyError`, and the error envelope
- `src/common/middleware/request-log.ts` — `X-Request-Id` and the access log
- `src/common/middleware/error-handler.ts` — JSON 404, the global error middleware, and the hidden-error log
- `src/index.ts` — F01 toolchain module; not the HTTP entry
- `tests/health.test.mjs` — health, version prefix, listen, and invalid `PORT`
- `tests/readiness.test.mjs` — MySQL readiness, startup failure, and SIGINT/SIGTERM drain
- `tests/config.test.mjs` — environment defaults, rejects, and secret-safe errors
- `tests/database.test.mjs` — pool identity, lazy connect, and a Compose MySQL query
- `tests/migrations.test.mjs` — baseline migrate, seed, undo, and disposable `ecom_test`
- `tests/errors.test.mjs` — JSON 404, `AppError` responses, and hidden unexpected errors
- `tests/logging.test.mjs` — request ids, access logs, and the stderr copy of a hidden error
- `tests/tooling.test.mjs` — lint, format, typecheck, and test script contract
- `labs/f10-types/` — TypeScript lab for interfaces, unions, intersections, and narrowing
- `tests/f10-types.test.mjs` — lab narrowing behavior and the rejected `cheque` method
- `eslint.config.js` — ESLint flat config
- `.prettierrc.json` — Prettier options
- `.prettierignore` — generated files and markdown
