# F05 — Structured logs and request IDs

## Request flow
`createApp()` mounts middleware in this order: `requestContext`, `accessLog`, the `/api/v1` routes, `notFoundHandler`, `errorHandler`.

`requestContext` reads `X-Request-Id`. The value is kept when it is 1–128 characters and matches `^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$`. A missing value, a space, a slash, a quote, or a newline is thrown away and replaced with `crypto.randomUUID()`. The chosen id is set on the response as `X-Request-Id` and stored on a child logger in a `WeakMap` keyed by the response. `Express.Request` is not given a new field. That augmentation is a later lab.

`accessLog` records the path from `req.originalUrl` before the router runs, and drops the query string. Inside the `/api/v1` router, `req.path` would later be `/health` for `GET /api/v1/health`. The original URL keeps the prefix. When the response finishes, one JSON line is written:

```json
{"requestId":"...","method":"GET","path":"/api/v1/health","status":200,"durationMs":2,"time":"...","level":"info","message":"request"}
```

`info` lines go to stdout. A client `AppError`, including the JSON 404, does not get a second error line. The access line already has the status. A connection that closes before `finish` does not get that line.

A thrown `Error`, a rejected string, or an `AppError` whose code was overwritten is not safe for the client. `errorHandler` writes this to stderr, then sends the same generic body as F04:

```json
{"requestId":"...","errorName":"Error","errorMessage":"mysql password=...","stack":"Error: ...","time":"...","level":"error","message":"request failed"}
```

The response body is still `{ "error": { "status": 500, "code": "internal_error", "message": "Internal server error" } }`. The id is only the header.

After a successful `listen`, `startServer` writes `ecom-backend listening on http://127.0.0.1:<port>` as an info line. A failed `loadConfig` is still plain text on stderr. That failure happens before the JSON logger is the right tool: the message is already the variable name and the rule, and it must not be wrapped in a way that hides it.

## Why the logger looks like this
Each line is one JSON object so a later search can filter on `requestId` or `status` without parsing English. `JSON.stringify` escapes newlines, so a stack stays on one line.

`LOG_LEVEL` lives on the same Zod schema as the other process settings. Empty or missing means `info`. `debug`, `info`, `warn`, and `error` are the only names, and they are case-sensitive. `createApp()` does not read the environment. `startServer()` with no port does, and it builds the logger at `config.logLevel`. `startServer(port, logger)` is the test seam: the number is checked, the environment is not read, and the provided logger receives both the listen line and the access line.

pino and winston already solve levels, child loggers, and transports. This task writes the lines itself so the allowed fields stay visible in the repo. The `Logger` methods are the seam a faster writer can sit behind later. Nothing here opens a socket to a log vendor.

The child logger copies `requestId` onto later lines. Fields named `time`, `level`, or `message` cannot replace the ones the writer sets.

## Security
The access line has method, path, status, and duration. It does not have the query string, headers, or body. A `token` query parameter therefore stays out of the log. The path itself is logged, so a secret placed in the path would still appear.

An inbound id that fails the token pattern is not copied into the line. Node's HTTP parser already rejects a raw CR or LF in a header value. The pattern is the gate for values that do arrive, including a space or a slash. The newline case is covered by calling `requestContext` with a fake request, because a normal client cannot put a newline in the header.

The error line is the operator's copy of the failure the client must not see. `Error.message` and `stack` are written even when they contain a password. That is deliberate. Hiding them on the server would bring back the F04 gap. Redacting fields such as `password` and `authorization` inside structured logs is a later audit task. Callers must not pass those objects as log fields in the meantime.

A value that is neither an `Error` nor a string is logged as `Non-error rejection`. The raw object is not serialized, so a rejected `{ password: "..." }` does not get copied.

`LOG_LEVEL=error` still returns `X-Request-Id` and still writes hidden failures. It suppresses the listen line and the access line.

If the log stream throws, the writer tries stderr once. If stderr throws too, the line is dropped. The HTTP body is still sent. A full stdout buffer is not drained; this logger does not handle backpressure.

## Interview questions
1. Why one JSON object per line? A collector can split on newlines and parse each object. A stack or a message that contains a newline stays inside the string, so one failure cannot look like two events.
2. Why stdout for access logs and stderr for errors? An operator can keep the failure stream separate. A successful health check writes nothing to stderr. Config failures stay plain text on stderr because they are not request logs.
3. Why is the request id a header and not a JSON field? ADR-005 fixes the error envelope at `status`, `code`, and `message`. The success envelope stays `{ "data" }`. The header is present on both, and the client can send it back on the next call.
4. Why reject some inbound ids? The client may send one so a gateway and the app share an id. A newline, a space, or a huge value would either break the line or fill the disk. A UUID is generated instead, and the rejected text is not logged.
5. Why log `originalUrl` instead of `req.path`? The access middleware is mounted on the app. The route then runs inside the `/api/v1` router, which strips that prefix from `req.path` before `finish`. `originalUrl` still has `/api/v1/health`. The query string is removed so a token in `?token=` is not stored.
6. Why log a secret that the client must not see? The 500 body is for the caller. The stderr line is for the person debugging the process. Without it, a database error disappears. The trade-off is that log access is as sensitive as database access.
7. Why skip an error line for `NotFoundError`? The message is already the client body, and the access line has status 404. An error line is reserved for the text the handler hides.
8. Why a `WeakMap` instead of `req.requestId`? Express chooses an error middleware by `function.length`. The handler stays at four parameters and reads the logger from the response. Adding a field to `Request` is a later TypeScript lab. The map entry disappears with the response object.
9. Why can `LOG_LEVEL=error` hide the listen line? The listen line is `info`. Error level means "failures only." The default is `info`, so a normal start still prints the URL.
10. What does this logging not do? It does not prove MySQL is up, it does not redact passwords inside `Error.message`, and it does not ship logs off the machine. Readiness is F08. Redaction is B07.

## From-scratch exercise
In an empty folder, write an Express middleware that sets `X-Request-Id` to a UUID when the inbound header is missing or contains a space. On `res` `finish`, write one `JSON.stringify` line with `requestId`, `method`, the path without `?`, and `status`. Add `app.get("/boom", () => { throw new Error("password=secret"); })` and a four-argument error handler that logs `err.message` and responds with a fixed sentence. Request `/boom?token=abc` and `/health?token=abc`. Confirm both responses carry the same id you logged, neither body contains `secret` or `token`, the boom log contains `secret`, and the access path does not contain `token`.
