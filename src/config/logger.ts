import type { Writable } from "node:stream";

/**
 * Process log levels. `info` is the default.
 * `error` lines go to stderr. Every other level goes to stdout.
 */
export const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

/** JSON-safe value. Callers should not pass secrets under their own keys. */
export type LogValue = string | number | boolean | null | LogValue[] | { [key: string]: LogValue };

export type LogFields = { [key: string]: LogValue };

/**
 * One JSON object per line.
 * `child` copies fields onto later lines. `time`, `level`, and `message` always
 * come from the logger, so a child cannot replace them.
 */
export type Logger = {
  readonly level: LogLevel;
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
  child(fields: LogFields): Logger;
};

export type LoggerOptions = {
  level?: LogLevel;
  /** Destination for debug, info, and warn. Defaults to stdout. */
  destination?: Writable;
  /** Destination for error. Defaults to stderr. */
  errorDestination?: Writable;
  base?: LogFields;
};

/**
 * Build a logger. Importing this module does not read the environment and
 * does not write a line.
 */
export function createLogger(options: LoggerOptions = {}): Logger {
  const level = options.level ?? "info";
  const destination = options.destination ?? process.stdout;
  const errorDestination = options.errorDestination ?? process.stderr;
  const base = options.base ?? {};

  const write = (entryLevel: LogLevel, message: string, fields?: LogFields): void => {
    if (LEVEL_RANK[entryLevel] < LEVEL_RANK[level]) {
      return;
    }

    const payload: LogFields = {
      ...base,
      ...(fields ?? {}),
      time: new Date().toISOString(),
      level: entryLevel,
      message,
    };
    const stream = entryLevel === "error" ? errorDestination : destination;
    // A log write must not replace the HTTP response that is already decided.
    writeLine(stream, payload);
  };

  return {
    level,
    debug(message, fields) {
      write("debug", message, fields);
    },
    info(message, fields) {
      write("info", message, fields);
    },
    warn(message, fields) {
      write("warn", message, fields);
    },
    error(message, fields) {
      write("error", message, fields);
    },
    child(fields) {
      return createLogger({
        level,
        destination,
        errorDestination,
        base: { ...base, ...fields },
      });
    },
  };
}

function writeLine(stream: Writable, payload: LogFields): void {
  const line = `${JSON.stringify(payload)}\n`;
  try {
    stream.write(line);
  } catch (error) {
    if (stream === process.stderr) {
      // The error stream itself failed. There is no further destination.
      return;
    }
    const reason = error instanceof Error ? error.message : "log write failed";
    try {
      process.stderr.write(
        `${JSON.stringify({
          time: new Date().toISOString(),
          level: "error",
          message: "log write failed",
          reason,
        })}\n`,
      );
    } catch {
      // stderr is closed too. There is no destination left, and the request
      // still needs to finish with its HTTP body.
    }
  }
}
