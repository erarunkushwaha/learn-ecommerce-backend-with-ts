import { request as httpRequest } from "node:http";
import express from "express";
import type { Request } from "express";

import { hasExactKeys, isPositiveId, isRecord } from "./record.js";

/**
 * Identity established by a check, not by the client choosing a role name.
 * `admin` is intentionally absent. Assignment of that role is a later task.
 */
export interface RequestActor {
  id: number;
  role: "buyer" | "seller";
}

/**
 * Optional on purpose. A required `actor` would make every route look
 * authenticated, including a route that never ran the check.
 * `Request` from `express` extends this interface. The merge applies only
 * to compilations that load this module. `src/` does not, so the HTTP
 * `Request` type is unchanged.
 */
declare module "express-serve-static-core" {
  interface Request {
    actor?: RequestActor;
  }
}

type ActorParse =
  | { ok: true; actor: RequestActor }
  | {
      ok: false;
      message: string;
    };

function parseActor(value: unknown): ActorParse {
  if (!isRecord(value)) {
    return { ok: false, message: "actor must be an object" };
  }
  if (!hasExactKeys(value, ["id", "role"])) {
    return { ok: false, message: "actor must contain only id and role" };
  }
  if (!isPositiveId(value.id)) {
    return { ok: false, message: "actor id must be a positive integer" };
  }
  if (!isActorRole(value.role)) {
    return { ok: false, message: "actor role is not allowed" };
  }
  return { ok: true, actor: { id: value.id, role: value.role } };
}

export function isRequestActor(value: unknown): value is RequestActor {
  return parseActor(value).ok;
}

/** Copies `id` and `role` into a new object. Extra fields are not copied. */
export function readActor(value: unknown): RequestActor {
  const parsed = parseActor(value);
  if (!parsed.ok) {
    throw new TypeError(parsed.message);
  }
  return parsed.actor;
}

/**
 * Type predicate. The true branch sees `actor` as required.
 * The check runs again so a value placed on the request without `readActor`
 * is not trusted just because the property is present.
 */
export function hasActor(req: Request): req is Request & { actor: RequestActor } {
  return isRequestActor(req.actor);
}

export function assignActor(req: Request, value: unknown): RequestActor {
  const actor = readActor(value);
  req.actor = actor;
  return actor;
}

export function actorLabel(req: Request): string {
  if (!hasActor(req)) {
    return "anonymous";
  }
  return `${req.actor.role} ${req.actor.id}`;
}

/**
 * Lab-only listener on `127.0.0.1` port 0. It is not `src/server.ts`.
 * `undefined` leaves `actor` unset. Any other value is parsed before listen.
 */
export function labelOnRequest(actor: unknown): Promise<string> {
  const parsed = actor === undefined ? undefined : readActor(actor);
  const app = express();
  app.disable("x-powered-by");
  app.get("/actor", (req, res) => {
    if (parsed !== undefined) {
      assignActor(req, parsed);
    }
    res.type("text/plain; charset=utf-8").send(actorLabel(req));
  });

  const server = app.listen(0, "127.0.0.1");

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error: unknown, body?: string): void => {
      if (settled) {
        return;
      }
      settled = true;
      server.close((closeError) => {
        if (error !== undefined) {
          reject(error instanceof Error ? error : new Error("actor demo failed"));
          return;
        }
        if (closeError) {
          reject(closeError);
          return;
        }
        resolve(body ?? "");
      });
    };

    server.once("error", (error: Error) => {
      finish(error);
    });

    server.once("listening", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        finish(new TypeError("actor demo is not listening on a port"));
        return;
      }

      const client = httpRequest(
        {
          hostname: "127.0.0.1",
          port: address.port,
          path: "/actor",
          method: "GET",
        },
        (response) => {
          const chunks: Buffer[] = [];
          response.on("data", (chunk: Buffer | string) => {
            chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
          });
          response.once("error", (error: Error) => {
            finish(error);
          });
          response.on("end", () => {
            if (response.statusCode !== 200) {
              finish(new TypeError("actor demo request failed"));
              return;
            }
            finish(undefined, Buffer.concat(chunks).toString("utf8"));
          });
        },
      );
      client.once("error", (error: Error) => {
        finish(error);
      });
      client.end();
    });
  });
}

function isActorRole(value: unknown): value is RequestActor["role"] {
  return value === "buyer" || value === "seller";
}
