# ecom-backend

Interview-lab e-commerce API. The HTTP process is an Express app with a `/api/v1` prefix, a liveness health route, Zod environment validation, a JSON error handler, and structured request logs. Local MySQL and Redis run in Docker Compose. The Sequelize pool is a later roadmap task.

## Requirements

- Node.js 22 LTS (verified on v22.12.0)
- npm 10
- Docker Engine 28 and Docker Compose v2 (verified with Compose v2.40.3)

## Scripts

- `npm run typecheck` — strict TypeScript check, no emit
- `npm run build` — compile `src/` to `dist/`
- `npm run dev` — compile, then run the HTTP server with `.env`
- `npm start` — run the already compiled HTTP server with `.env`
- `npm test` — compile, then run the Node.js built-in tests
- `npm run infra:check` — compile, load `.env`, then ping the Compose MySQL and Redis services

`npm start` listens on `127.0.0.1`. It validates `PORT`, `LOG_LEVEL`, the MySQL settings, and the Redis settings before listen. `PORT` defaults to `3000` when unset or empty. `LOG_LEVEL` defaults to `info` (`debug`, `info`, `warn`, or `error`). Set `PORT=0` to let the OS pick a free port. A non-integer `PORT`, an unknown log level, or a missing database or Redis password exits before listen. Startup does not open those services. Copy `.env.example` to `.env` first; Node reports a missing env file before the app does.

## Docker Compose

Copy the local env file once:

```bash
cp .env.example .env
docker compose up -d
npm run infra:check
```

`docker compose ps` shows MySQL and Redis. `docker compose logs` shows their output. `docker compose stop` pauses them. `docker compose down` removes the containers and keeps the named MySQL volume. Adding `-v` deletes that volume.

The HTTP process stays on the host:

```bash
npm run dev
```

`GET /api/v1/health` does not connect to MySQL or Redis. `npm run infra:check` does. From this machine the database is `127.0.0.1:3307`. A Homebrew MySQL may already be using port `3306`; that server is a different data directory. Details and a later copy procedure are in `docs/learning/I01-docker-mysql-redis.md`.

## Health

`GET /api/v1/health` returns `200` and `{ "data": { "status": "ok" } }`. That means the process can serve HTTP. It does not check a database.

An unknown path or method returns `404` and `{ "error": { "status": 404, "code": "not_found", "message": "Not found" } }`. An unexpected throw returns `500` with code `internal_error` and the message `Internal server error`. The body does not include a stack. The process writes that failure, including the message and stack, as one JSON line on stderr. Every response sets `X-Request-Id`. Send a token of letters, digits, `.`, `_`, or `-` to reuse it; any other value is replaced. Access logs are JSON lines on stdout and do not include the query string. See ADR-005 and ADR-006.

## Module format

The package is ECMAScript modules (`"type": "module"`). TypeScript uses `NodeNext`, so relative imports use a `.js` specifier. See ADR-001, ADR-002, ADR-004, ADR-005, and ADR-006 in `docs/DECISIONS.md`.

## Layout

- `src/app.ts` — Express app, `/api/v1`, health route, request id, access log, JSON 404, error middleware; does not listen
- `src/server.ts` — process entry that validates config, listens, and can close the server
- `src/config/env.ts` — Zod schema for `PORT`, `LOG_LEVEL`, MySQL, and Redis
- `src/config/logger.ts` — one JSON object per log line
- `src/config/data-stores.ts` — one-shot MySQL and Redis pings
- `src/common/errors/app-error.ts` — `AppError`, `NotFoundError`, and the error envelope
- `src/common/middleware/request-log.ts` — `X-Request-Id` and the access log
- `src/common/middleware/error-handler.ts` — JSON 404, the global error middleware, and the hidden-error log
- `src/index.ts` — F01 toolchain module; not the HTTP entry
- `tests/health.test.mjs` — health, version prefix, listen, and invalid `PORT`
- `tests/config.test.mjs` — environment defaults, rejects, and secret-safe errors
- `tests/errors.test.mjs` — JSON 404, `AppError` responses, and hidden unexpected errors
- `tests/logging.test.mjs` — request ids, access logs, and the stderr copy of a hidden error
