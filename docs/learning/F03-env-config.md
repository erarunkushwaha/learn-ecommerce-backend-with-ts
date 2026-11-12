# F03 — Zod environment config

## Startup flow
`npm start` and `npm run dev` load `.env` with Node's `--env-file`, then run `dist/server.js`. The direct-run path calls `startServer()` with no argument. That call parses `process.env` through `loadConfig` before `listen`.

`loadConfig` checks `PORT`, the MySQL settings, and the Redis settings with one Zod object. The returned value is an `AppConfig`: a listen port plus `mysql` and `redis` objects. Field names such as `MYSQL_PORT` stay at the boundary. Later code reads `config.mysql.port`.

A valid result is a shape check. The process then binds `127.0.0.1` and serves `GET /api/v1/health`. It still does not open MySQL or Redis. `npm run infra:check` is the connectivity check. It reuses `readMysqlSettings` and `readRedisSettings`, which are slices of the same field schemas, and then pings.

`createApp()` does not read the environment. Importing `src/config/env.ts` does not read it either. Tests pass a plain object, or they spawn the process with an explicit environment.

## Why the rules look like this
`process.env` values are strings when they are present. TypeScript can describe `AppConfig`, and that description does not inspect the machine. Zod runs at startup and is what rejects `PORT=nope`.

Empty and missing values share a meaning. `PORT`, `MYSQL_HOST`, `MYSQL_PORT`, `REDIS_HOST`, and `REDIS_PORT` fall back to `3000`, `127.0.0.1`, `3307`, `127.0.0.1`, and `6379`. `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD`, and `REDIS_PASSWORD` have no safe default, so an empty string is a startup error.

`PORT` may be `0`, which asks the operating system for a free port. `MYSQL_PORT` and `REDIS_PORT` start at `1` because `0` is not a service port. The decimal check is `^\d{1,5}$` plus the numeric range, so `3306abc`, `65536`, and `1.5` fail. Leading zeros are ordinary decimals: `0007` is `7`.

Strings are not trimmed. Trimming would change a password that intentionally contains spaces, and the same rule is used for every value.

`MYSQL_ROOT_PASSWORD` is required by Compose and is not part of `AppConfig`. The application user is `ecom`. The root password stays out of the Node process. `MYSQL_HOST=mysql` and `MYSQL_PORT=3306` are valid; those are the values a future app container needs. The host-side default remains `127.0.0.1:3307`.

The listen address is still the constant `127.0.0.1` in `src/server.ts`. It is not an environment variable in this task.

## The explicit-port seam
`startServer(0)` checks that argument and does not parse the rest of the environment. The in-process tests use it so they can bind without a `.env`. The process entry never passes a port, so `node dist/server.js` always parses the full schema. A later pool should call `loadConfig` itself rather than assume every `startServer` call already did.

## Node, Zod, and errors
`safeParse` collects every failing field. The thrown `Error` message is one line per rule, for example `MYSQL_PASSWORD is required`. The message names the variable and the rule. It does not include the supplied value, so a rejected password is not written to stderr.

`npm start` depends on `.env` existing. Node does not replace variables that are already set in the shell. A stale exported `MYSQL_PORT` wins over the file.

There is no cached config object. Each call parses the object it is given. That keeps tests independent and avoids a module-level secret that was captured at import time.

## Security
Failing closed on a missing password is the point of the schema. A present but wrong password still lets the process listen, because this task does not connect. Readiness is a later task. Validation here is not authentication.

`.env` stays untracked. The example values are local Compose credentials. Error logs are safe to keep only because the formatter copies Zod's message text and not the issue input.

## Interview questions
1. Why can `AppConfig` not replace Zod? The type describes a correct object after parsing. `process.env` is a bag of optional strings, and TypeScript does not open `.env` while compiling.
2. Why parse before `listen`? A process with a missing `REDIS_PASSWORD` should exit before it looks healthy. Waiting until the first cache call hides the mistake.
3. Why is a wrong Redis password still allowed to boot? The schema checks presence and shape. A round trip is the connectivity check, and health remains liveness.
4. Why is `PORT=0` valid while `MYSQL_PORT=0` is not? `0` is the kernel's "choose a port" value for a new listener. A database port has to name a service.
5. Why default MySQL to `3307`? On this machine port `3306` is the Homebrew server. Compose publishes MySQL on `127.0.0.1:3307`. The schema still accepts `3306` when a container should dial the Compose DNS name `mysql`.
6. Why leave `MYSQL_ROOT_PASSWORD` out? The app connects as `ecom`. Putting the root password in the Node config would give the process a credential it does not need.
7. Why not parse at import time? Importing `server.ts` or `env.ts` must be side-effect free. Tests supply different objects, and an import-time singleton would freeze the first environment, including secrets.
8. Why does `startServer(0)` skip the data-store fields? It is the test seam for "bind this port." The executable entry calls `startServer()` with no argument and parses the full contract. Pool setup should call `loadConfig` on its own.
9. What should a config error contain? The variable name and the broken rule. The raw value can be a password, and a stack trace does not help the operator fix `.env`.
10. How is this different from request validation? Both use Zod at a boundary. This boundary is the process environment, once, before listen. Request bodies are untrusted input on every call and get HTTP status codes. That handler arrives with the global error layer.

## From-scratch exercise
In an empty folder, install Zod and write a script that reads `PORT` and `API_TOKEN` from an object. Empty `PORT` becomes `3000`. `PORT` must be an integer from 0 through 65535. Empty `API_TOKEN` throws. On failure, print a message that contains the field name and not the token value. Run it with `{ PORT: "nope", API_TOKEN: "secret" }` and confirm the output contains `PORT` and does not contain `secret`. Then explain why a typed `port: number` field is still true after a successful parse and says nothing about the real environment.
