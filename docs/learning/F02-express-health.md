# F02 — Express app, versioned routes, and liveness

## Request flow
`npm start` runs `dist/server.js`. That file calls `startServer()`, which binds `127.0.0.1` and hands each connection to the Express app from `createApp()`.

`createApp()` does not listen. It turns off `X-Powered-By` and mounts a router at `/api/v1`. A request to `GET /api/v1/health` enters that router as `GET /health`. The handler sends `200` and this JSON:

```json
{ "data": { "status": "ok" } }
```

`GET /health` and `GET /api/v2/health` do not hit that handler. Express still answers those with its default HTML `404`. A stable JSON error body arrives with the global error handler later.

Importing `src/app.ts` or `src/server.ts` does not open a port. The listen call sits behind the same direct-run check used by the F01 entry: it runs only when Node's `process.argv[1]` is this file.

## Why the split looks like this
`app.ts` is composition. `server.ts` is the process: choose a port, listen, and close the socket. Tests can build the app or call `startServer(0)` without a module side effect.

Health is one route function. A controller and a service would only return a constant, so those layers are not added yet.

The success shape is `{ "data": payload }`. Later JSON responses should reuse `SuccessBody<T>` instead of inventing another wrapper. `"ok"` means this process accepted an HTTP request. It does not mean MySQL is up. That second check is readiness, and it is a later task.

## Node and TypeScript
`startServer` returns a Promise. Invalid `PORT` and a failed `listen` reject that Promise. The process entry prints `error.message` and sets `process.exitCode`. It does not print a stack to the client, because this failure happens before any response exists.

`createServer(createApp())` works because an Express app is a request listener: `(req, res) => void`. The relative import is `./app.js` even though the source file is `app.ts` (ADR-001).

`PORT` is validated by `src/config/env.ts` before listen. Unset or empty means `3000`. `0` means "ask the OS for a free port," which is how the tests avoid colliding with a busy port. Anything that is not an integer from 0 through 65535 fails startup. The same module requires the MySQL and Redis settings. See `docs/learning/F03-env-config.md`.

`stopServer` stops accepting connections and then closes sockets that are already open. That keeps tests from hanging on an idle keep-alive connection. It does not wait for in-flight work. Signal handlers are not installed, so `SIGTERM` still uses Node's default: exit immediately.

## Security
The development server binds `127.0.0.1`, so another machine on the network cannot open it. `X-Powered-By: Express` is disabled so responses do not advertise the framework. The health handler ignores the query string and body, and it does not read secrets. CORS, Helmet, and rate limits are later tasks. The HTML `404` for unknown paths is a known gap until error responses are standardized.

## Interview questions
1. Why keep `listen` out of `createApp()`? An import should not bind a socket. Tests and future workers can reuse the app, and a process entry is the only place that owns the port.
2. What does this health check prove? The Node process is running and the `/api/v1` router is mounted. It does not prove a database connection, a migration, or that the process should receive traffic.
3. Why put the version in the path? Clients and proxies can see the contract without a custom header. A second version can be mounted beside `/api/v1` when a breaking change needs it. Unversioned `/health` is intentionally not the API.
4. Why wrap success JSON in `data`? Callers learn one shape. Metadata can sit beside `data` later without changing every payload. The payload itself stays free of transport fields.
5. Why disable `X-Powered-By`? It fingerprints the stack and does not help the client. Hiding it is not a full security-header policy.
6. Why bind loopback only? This lab is a local process. Binding all interfaces would expose an unfinished API on the LAN. A deployment task can choose a different host.
7. Why is there no controller for health? Controller, service, and repository layers earn their place when HTTP, policy, and persistence differ. A constant response does not need three files.
8. What happens if `PORT=nope`? Startup rejects before `listen`. The process prints one message and exits non-zero. It does not open a port.
9. Why can `stopServer` cut a live request? It is a test and local hard stop. A production shutdown should stop receiving, finish or time out current requests, then close. That signal path is not built yet.
10. Why does Express 5 still need `@types/express`? The published `express@5.3.0` package has no `.d.ts`. The matching DefinitelyTyped package supplies the types under `strict` TypeScript.

## From-scratch exercise
In an empty folder, install Express and write two files. `app.js` exports `createApp()` with `GET /api/v1/health` returning `{ "data": { "status": "ok" } }` and no `listen` call. `server.js` listens on `127.0.0.1` only when it is the process entry. Hit the route with `fetch`, then request `/health` and confirm it is not the same handler. Explain why a green health check can still be the wrong signal once a database exists.
