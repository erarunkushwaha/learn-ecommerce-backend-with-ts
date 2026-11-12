# F04 — Typed errors and the global handler

## Request flow
`createApp()` mounts `/api/v1`, then `notFoundHandler`, then `errorHandler`. That last function is the only place that writes an error response.

`GET /api/v1/health` still returns `200` and `{ "data": { "status": "ok" } }`. A path or method that matches no route reaches `notFoundHandler`. It calls `next(new NotFoundError())`. The error middleware turns that into `404` and this JSON:

```json
{ "error": { "status": 404, "code": "not_found", "message": "Not found" } }
```

The message does not include the path or the query string. A query can carry a token, and the client already knows which URL it called.

`POST /api/v1/health` uses the same 404. This process does not answer `405 Method Not Allowed` yet. A route that exists for one method and not another is still a miss until a later HTTP task says otherwise.

A route that throws `AppError` keeps that status, code, and message. A route that throws `Error`, returns a rejected promise, or rejects with a string becomes:

```json
{ "error": { "status": 500, "code": "internal_error", "message": "Internal server error" } }
```

Startup failures are unchanged. `loadConfig` still throws a plain `Error` before `listen`, and `src/server.ts` prints `error.message` to stderr. There is no HTTP response yet, so the JSON handler is not involved.

## Why the classes look like this
`AppError` is the expected failure. Its message is written for the client. `NotFoundError` fixes the status at `404` and the code at `not_found`. Later tasks add a subclass when they have a new status and code, for example a conflict or a validation failure. They should not invent a second JSON shape.

The constructor accepts a status from 400 through 599, a code matching `^[a-z][a-z0-9_]{0,63}$`, and a message that is not blank. Those checks fail the programmer at the `throw` site. `Error.captureStackTrace` drops the constructor frames so a future server log points at the caller.

`isAppError` is the type guard. `isClientAppError` repeats the status, code, and message checks. `readonly` disappears at runtime, so a field can be overwritten after `new`. A code that no longer matches the token pattern is treated as an unknown failure and the original message is not sent.

## Express, promises, and `function.length`
Express 5's router calls a handler inside `try/catch`. If the handler returns a native promise, a rejection calls `next(error)`. An `async` route can `throw` and the error still reaches the four-argument middleware. This app does not wrap routes in a helper.

Express decides which function is an error middleware by reading `fn.length`. `errorHandler` has four parameters, so it receives `(err, req, res, next)`. `notFoundHandler` has three. A fourth parameter on the 404 function would make Express skip it for normal requests. A third parameter on the error function would make Express skip it for errors, and the default HTML handler would answer instead.

If `res.headersSent` is already true, the handler calls `next(err)` and does not write JSON. The default final handler then closes the connection.

## Security
Unknown errors can embed a SQL fragment, a filesystem path, or a password. The client receives `internal_error` and a fixed sentence. The response has no `stack` field.

`AppError.message` is the exception. Callers must put only client-safe text there. The handler does not know which ordinary `Error` is safe, so it hides all of them.

The handler does not log. Until the logger task, a 500 is visible to the client as a generic body and is not written to stderr. That is a gap, chosen so this task does not grow a second logging path.

`X-Powered-By` stays off. The 404 and 500 bodies are JSON.

## Interview questions
1. Why one error middleware? Routes stay on the success path. Status mapping and the "what may the client see?" decision live in one function, so a new route cannot forget them.
2. Why does the error middleware need four parameters? Express uses `fn.length === 4` to tell an error handler from a request handler. A TypeScript `_next` that is deleted to silence a warning would drop the length to three and the handler would never run.
3. Why is there no `asyncHandler` wrapper? Express 5 already forwards a thrown exception and a rejected native promise to `next(err)`. A wrapper would duplicate that and drift if a route called `next` itself.
4. Why hide `Error.message`? The message is for the programmer. Database drivers put query text and connection details there. `AppError` exists so the messages we wrote on purpose are the only ones that leave the process.
5. Why give errors a `code` as well as an HTTP status? Several failures share one status. Clients can branch on `not_found` without parsing English. The code is a short token, not a sentence.
6. Why is the 404 message generic? Repeating `req.originalUrl` copies the query string into the body. The status and `not_found` already tell the client what happened.
7. Why is `POST /api/v1/health` a 404? No route registered that method. `405` needs an `Allow` header and a list of methods that exist for the path. That response is a later HTTP task.
8. Why subclass `Error`? `instanceof` works across the async boundary, stacks still exist for a future logger, and a non-error rejection stays distinguishable. A plain object with a status field would need its own convention.
9. When does `instanceof AppError` fail? It fails if a second copy of the module is loaded, because each copy has its own class. This package has one ESM evaluation per process. The handler still re-checks the fields so a broken instance becomes a generic 500.
10. Why not log the real error here? A `console.error` in the handler would be a logger with no levels, no redaction, and no request id. The logging task owns that. The client contract does not depend on it.

## From-scratch exercise
In an empty folder, install Express 5 and write a four-parameter error middleware. Add `app.get("/boom", async () => { throw new Error("password=secret"); })` and a final three-parameter middleware that always calls `next` with a 404 error. Request `/boom` and `/missing`. Confirm both bodies are JSON, `/boom` does not contain `secret`, and neither body contains `stack`. Then delete one parameter from the error middleware, restart, and explain why the response changes.
