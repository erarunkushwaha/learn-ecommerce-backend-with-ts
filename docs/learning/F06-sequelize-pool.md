# F06 — One Sequelize pool for the process

## Where the pool sits
`src/database/sequelize.ts` exports three functions.

`createSequelize(settings, logger)` builds a Sequelize 6 instance from a `MysqlSettings` object. It does not read the environment. Tests and a future disposable database use it when they need a different target than the process.

`getSequelize(env)` calls `loadConfig` on that object, or on `process.env` when the argument is omitted. The first successful call stores the instance in a module-level variable. Every later call returns that same object and ignores a new environment. Node evaluates this module once per process, so another file that imports `getSequelize` sees the same variable. That is the module cache. A class with a private constructor is not required.

`closeSequelize()` drops the variable and then drains the pool. The next `getSequelize` can build a new instance.

`startServer(port)` is the in-process test seam: it checks the port and does not build a pool. `createApp()` does not import this module. `GET /api/v1/health` stays liveness. F08's process entry calls `getSequelize()`, then `probeMysql`, then `startServer()`. It still does not call `sync`.

`npm run infra:check` is unchanged. It opens one `mysql2` connection, runs `SELECT 1`, and closes it. That connection is not borrowed from the pool.

## What the instance is configured to do
The host, port, database, user, and password come from the F03 schema. On this machine the defaults are `127.0.0.1` and `3307`, which is the Compose publish address. Sequelize's own default host is `localhost` and its MySQL dialect fills in port `3306` when the port is missing. Both are passed explicitly so a forgotten field cannot land on the Homebrew server.

The pool is `max: 5`, `min: 0`, `acquire: 10000`, `idle: 10000`. `min: 0` means construction creates the pool object and opens no socket. The first query borrows a connection. Idle connections are closed after 10 seconds. `acquire` is how long a caller waits for a free slot, not how long the TCP handshake may take. The handshake limit is `connectTimeout: 5000` on the `mysql2` options. Five is a starting cap. Measuring it is a later capacity task.

The session time zone is the constant `+00:00`. Sequelize sends `SET time_zone = '+00:00'` when a connection opens, and it interpolates that string. The constant is not read from the environment, so a quote in `.env` cannot change the statement. The connection charset is `utf8mb4`, which matches the Compose server. There are still no tables. `sync()` is not called.

SQL logging is `false` unless the logger level is `debug`. A debug line is one JSON object with `message: "sql"` and a `statement` field. `logQueryParameters` is false, so bind values are not added to that line. `LOG_LEVEL` defaults to `info`, so a normal process does not write SQL.

## A query against Compose
The pool test reads `.env`, checks that the address is `127.0.0.1:3307`, and runs:

```sql
SELECT $secret AS secret, DATABASE() AS databaseName, @@hostname AS hostname,
       @@port AS serverPort, @@session.time_zone AS timeZone,
       @@character_set_connection AS charset
```

`$secret` is a bind parameter. The returned secret matched the JavaScript string, including a quote. The debug SQL contained `SELECT` and did not contain the secret or the MySQL password. `DATABASE()` was `ecom`. `@@session.time_zone` was `+00:00`. `@@character_set_connection` was `utf8mb4`. `@@port` was `3306` because that is the port inside the container. The client dialed `3307`. `@@hostname` was not this machine's hostname. A second instance with the wrong password was rejected, and the error text did not contain either password. After the successful query the pool size was between 1 and 5.

A separate test points `createSequelize` at a local TCP port that only counts sockets. The count stays 0 until `query`, then it increases. That is the check that building the pool does not connect.

## Why this is not a Singleton class
A Singleton class hides the instance behind `getInstance()` and often constructs it at an awkward time. The module variable is the same idea with less code: one evaluation, one object, visible in the file. The trade-off is also visible. The first successful `getSequelize` wins until `closeSequelize`. A test that needs another database calls `createSequelize` or closes the process instance first. Construction is synchronous, so two calls in the same turn cannot both miss the cache. `closeSequelize` clears the variable before `close` finishes. A call that arrives during that drain gets a new instance. Signal handling is not wired yet, so this race is not exercised on shutdown.

`getSequelize` uses `loadConfig`, not `readMysqlSettings`. The process contract includes Redis. A pool that started with only the MySQL slice could boot while `REDIS_PASSWORD` was missing, and the HTTP entry would then fail a moment later. One schema keeps that failure in one place. The pool still does not talk to Redis.

## Security
The password is a connection option. It is not written into the debug SQL line by this logger. `bind` keeps a value out of the statement text. `replacements` are escaped and then copied into the SQL string, so a secret passed that way would appear in a debug line. Prefer `bind` for values that must stay out of logs. Do not build SQL by concatenating request input.

A refused login used to let the process listen. F08 runs `probeMysql` before listen, so a wrong password exits, and `GET /api/v1/ready` reports a later refusal. Health remains liveness on purpose.

The access-denied error names the database user and not the password. A later `Error.message` can still contain a secret if a caller puts one in a query. The F05 error log would then copy that message to stderr. Field redaction is still a later task.

## Interview questions
1. Why one pool per process? Each connection is a thread or a memory slot on MySQL. A new Sequelize on every request opens another pool of up to 5 and does not share them. One module-level instance is the share.
2. Why not a Singleton class? The module cache already guarantees one evaluation. A class would add a private constructor and a static accessor without changing the lifetime. The cache is the mechanism to be able to explain.
3. Why does `new Sequelize` not connect? `min` is 0, and sequelize-pool creates sockets in `acquire`, which the first query triggers. `startServer(port)` can listen while Compose is stopped. The process entry calls `probeMysql` before listen (F08), so that executable exits when MySQL is down.
4. Why can `GET /api/v1/health` stay green when MySQL is down? F02 defined that route as process liveness. It does not call the probe. After a successful startup probe, a later MySQL failure leaves the process up and health green. `GET /api/v1/ready` reports that failure (F08).
5. Why is the client port 3307 when `@@port` is 3306? `3307` is the host publish port. Inside the container MySQL listens on `3306`. Homebrew already uses host port `3306` and a different datadir. The pool dials the configured host port, which defaults to `3307`.
6. Why does `getSequelize` parse Redis settings it does not use? It calls the same `loadConfig` as the process entry. A partial parse would let the pool exist while the rest of the contract was invalid.
7. Why does a second `getSequelize` ignore a new host? The cache would be useless if every call rebuilt the pool. `createSequelize` is the explicit way to build another one. `closeSequelize` is the way to drop the process instance.
8. What is the difference between `bind` and string concatenation? Concatenation treats a quote in the value as SQL. `bind` sends the value out of band, and this dialect rewrites `$name` to `?`. The debug line stores the statement, not the bind list.
9. Why set charset and time zone before any table exists? They are session settings on each borrowed connection. Waiting for the first migration would leave those connections on the server default. The time zone value is a constant because Sequelize interpolates it.
10. What happens to this pool on SIGINT? The process entry drains the HTTP server and then calls `closeSequelize` (F08). `stopServer` is still the test hard stop and does not close the pool. An idle pooled connection is a socket. Leaving it open keeps the process alive until the 10 second idle timeout.

## From-scratch exercise
In an empty folder, install `sequelize` and `mysql2`. Write a module with `getDb()` that constructs one Sequelize for `127.0.0.1:3307` on the first call and returns it thereafter, and `closeDb()` that drains it. Call `getDb()` twice and log `Object.is` on the results. Then call `closeDb()`, call `getDb()` again, and log `Object.is` against the first result. Explain why a route handler that calls `new Sequelize` would be a different result every time, and why `min: 0` lets the first log happen while MySQL is stopped.
