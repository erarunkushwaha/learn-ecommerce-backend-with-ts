# ecom-backend

Interview-lab e-commerce API. The HTTP process is an Express app with a `/api/v1` prefix and a liveness health route. Configuration, error JSON, logging, and MySQL are later roadmap tasks.

## Requirements

- Node.js 22 LTS (verified on v22.12.0)
- npm 10

## Scripts

- `npm run typecheck` — strict TypeScript check, no emit
- `npm run build` — compile `src/` to `dist/`
- `npm run dev` — compile, then run the HTTP server
- `npm start` — run the already compiled HTTP server
- `npm test` — compile, then run the Node.js built-in tests

`npm start` listens on `127.0.0.1`. `PORT` defaults to `3000` when unset or empty. Set `PORT=0` to let the OS pick a free port. A non-integer `PORT` exits before listen.

## Health

`GET /api/v1/health` returns `200` and `{ "data": { "status": "ok" } }`. That means the process can serve HTTP. It does not check a database.

## Module format

The package is ECMAScript modules (`"type": "module"`). TypeScript uses `NodeNext`, so relative imports use a `.js` specifier. See ADR-001 and ADR-002 in `docs/DECISIONS.md`.

## Layout

- `src/app.ts` — Express app, `/api/v1`, health route; does not listen
- `src/server.ts` — process entry that listens and can close the server
- `src/index.ts` — F01 toolchain module; not the HTTP entry
- `tests/health.test.mjs` — health, version prefix, listen, and invalid `PORT`
