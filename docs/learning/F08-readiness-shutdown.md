# F08 — Liveness, MySQL readiness, and a signal drain

## Request flow
`GET /api/v1/health` is unchanged. It returns `200` and `{ "data": { "status": "ok" } }`. The handler does not call the readiness probe. A process that can accept HTTP is alive. That is the only claim this route makes.

`GET /api/v1/ready` is the MySQL check. `createApp({ checkReady })` awaits that function. The process entry passes `probeMysql`, which calls Sequelize `authenticate`. The MySQL dialect's authenticate statement is `SELECT 1+1 AS result`. It borrows one pooled connection. Success returns `200` and `{ "data": { "mysql": "ok" } }`. A rejection becomes `NotReadyError`: `503`, code `not_ready`, message `MySQL is unavailable`. The same body is used when no probe was injected. `POST /api/v1/ready` stays a JSON 404.

`createApp()` still does not import the pool and does not read the environment. Tests can mount the route with a fake probe. `startServer(port)` remains that seam: an explicit port checks the number, listens, and does not build a pool or install signal handlers.

## Startup
`dist/server.js` is the process entry. It loads the Zod config, builds the module-cached pool with `getSequelize()`, and runs `probeMysql` before `listen`. Redis must still be present in the environment because `loadConfig` checks it. Nothing dials Redis.

A refused connection or a rejected password is logged as one JSON `error` line with the driver name, message, and stack. The pool is closed. The entry then prints the plain line `MySQL is unavailable` and sets exit code 1. The listen line is absent. Invalid `PORT` or a missing password still fails in `loadConfig`, before the probe, as a plain message on stderr.

After a successful probe the process listens on `127.0.0.1`. A later MySQL failure does not exit. Health stays `200`. Ready returns `503`. A supervisor that restarts on process death should use the exit code at boot. A load balancer that wants to stop sending traffic uses ready, so a short outage does not restart the process.

Migrations stay `npm run db:migrate`. Startup does not apply them.

## Shutdown
Handlers for SIGINT and SIGTERM are installed only after listen, and only in this entry, so a test that calls `startServer(0)` does not catch the test runner's signals. The first signal logs `shutdown started`, calls `drainServer`, then `closeSequelize`, then logs `shutdown finished`. A second signal does not start another drain.

`drainServer` calls `server.close()`, which stops accepting new connections and waits for current ones. Every 50ms it calls `closeIdleConnections`. That second step matters: a request that finishes during the drain becomes a keep-alive socket, and `server.close()` would otherwise wait for Node's keep-alive timeout. A request still running after 10 seconds (`SHUTDOWN_DRAIN_MS`) is destroyed with `closeAllConnections`.

The pool is closed after the HTTP drain so an in-flight request can still query. `closeSequelize` clears the module cache and then drains the pool. An idle connection from the startup probe would keep the process alive until the 10 second pool idle timeout. Closing it lets the process exit. The handlers do not call `process.exit`. When the server and the pool are closed, the event loop is empty and Node exits 0.

`stopServer` is still the test hard stop. It closes the listener and destroys sockets immediately. It does not close the pool.

## Security
The client body for a failed probe is a fixed sentence. It names MySQL and includes no host, user, or password. The driver message is on the error log, next to the request id, because `NotReadyError` is a client `AppError` and the error handler does not log those. A secret placed in `Error.message` would be in that log line. Field redaction is B07. The startup log is the same trade-off: operators see `ECONNREFUSED` or `Access denied for user ... (using password: YES)`, and the password value stays out of the Sequelize message this driver produces.

Ready does not grant access to data. It answers whether this process should receive traffic that needs MySQL.

## Interview questions
1. Why are health and ready different routes? Health answers "is the process up?" Ready answers "should this process receive traffic?" A health check that queries MySQL makes a database outage look like a dead process. A supervisor then restarts it, and the new process fails the same way.
2. Why fail startup when MySQL is down, and also keep a ready route? Boot is fail-closed: a bad password or a stopped server never listens. After listen, a later failure stays on `/ready` and the process remains up. Exit is for a dependency that was required and missing at boot. The status code is for a dependency that dropped afterwards.
3. Why is the probe `SELECT 1+1 AS result` and not a read of `schema_baseline`? Authenticate proves the server accepts the configured user and can run a statement. It does not prove a migration has been applied. Schema version is the migration command's job. A ready check that required a table would mix connectivity with schema.
4. Why inject `checkReady` instead of calling `getSequelize` inside `createApp()`? Importing the app would then parse the environment and could open a pool. Tests and a future worker need the app without that. The process entry is the place that owns the pool.
5. Why is a failed probe `503` / `not_ready` and not `500` / `internal_error`? The failure is expected and the message is safe. `500` is the bucket for errors whose text must be hidden. The driver text is still hidden. The code tells a client this is readiness, and the log keeps the cause.
6. Why does SIGTERM not call `closeAllConnections` immediately? That drops a response the handler is still writing. `server.close()` finishes current responses. The idle sweep drops keep-alive sockets that are not in a request. The 10 second deadline is the bound for a handler that does not finish.
7. Why close the pool after the HTTP server? An in-flight ready or later request may still be borrowing a connection. Closing the pool first would fail that request. Closing it after the drain releases the socket that would otherwise hold the process open.
8. Why can the process still hesitate after the HTTP deadline? `closeSequelize` waits until checked-out connections are released. Destroying the socket does not cancel a query the handler is still awaiting. A stuck query delays the final exit. The tests cover the idle-pool case, which exits well inside the 10 second idle timeout.
9. Why is Redis required in the environment and absent from ready? `getSequelize` uses the full `loadConfig` schema, so a missing `REDIS_PASSWORD` still fails before listen. No Redis client exists yet. Dialing Redis here would invent the cache task. Ready reports the dependency this process actually uses.
10. What does `startServer(port)` still skip? It does not read MySQL settings, does not probe, and does not install SIGINT or SIGTERM. That is why an in-process test can listen while Compose is stopped, and why a signal sent to the test runner is not caught by the server under test.

## From-scratch exercise
Write a Node `http` server with two routes. `GET /health` returns `{ "status": "ok" }` and does not call a probe. `GET /ready` awaits a `probe()` function you pass in: resolve for `200` and `{ "mysql": "ok" }`, reject for `503` and a fixed message that does not include the rejection text. In the process entry, await `probe()` before `listen`, and on failure print one safe line and set a non-zero exit code. On SIGTERM, stop accepting connections, wait for the current request, then close the resource the probe used. Explain why a keep-alive connection left open after the response can delay that wait, and why health staying green during a later probe failure is the useful outcome.
