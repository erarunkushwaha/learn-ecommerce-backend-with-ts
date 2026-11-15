import { pathToFileURL } from "node:url";
import { createLogger, type Logger } from "../config/logger.js";
import { readMysqlSettings, type Env } from "../config/env.js";
import { createSequelize } from "./sequelize.js";
import { applyMigrations, applySeeders, revertMigrations, revertSeeders } from "./migrator.js";

/**
 * Apply or roll back schema files against `MYSQL_*`.
 * This process is not the HTTP server. It reads MySQL settings only, so it
 * does not require `REDIS_PASSWORD` and it does not use the cached pool.
 * It does not create or drop databases. The configured database must exist.
 * Undo reverts the latest applied file of that kind. Undo seeders before
 * undoing a migration that drops their table.
 */

const SCHEMA_COMMANDS = ["migrate", "migrate:undo", "seed", "seed:undo"] as const;

export type SchemaCommand = (typeof SCHEMA_COMMANDS)[number];

const USAGE = "Usage: node dist/database/cli.js <migrate|migrate:undo|seed|seed:undo>";

export function parseSchemaCommand(argv: readonly string[]): SchemaCommand {
  const [command, extra] = argv;
  if (extra !== undefined || !isSchemaCommand(command)) {
    throw new Error(USAGE);
  }
  return command;
}

export async function runSchemaCommand(
  command: SchemaCommand,
  env: Env = process.env,
  logger: Logger = createLogger(),
): Promise<void> {
  const mysql = readMysqlSettings(env);
  const sequelize = createSequelize(mysql, logger);
  try {
    switch (command) {
      case "migrate": {
        const names = await applyMigrations(sequelize, logger);
        logger.info("migrations applied", { count: names.length, names });
        return;
      }
      case "migrate:undo": {
        const names = await revertMigrations(sequelize, logger);
        logger.info("migrations reverted", { count: names.length, names });
        return;
      }
      case "seed": {
        const names = await applySeeders(sequelize, logger);
        logger.info("seeders applied", { count: names.length, names });
        return;
      }
      case "seed:undo": {
        const names = await revertSeeders(sequelize, logger);
        logger.info("seeders reverted", { count: names.length, names });
        return;
      }
      default: {
        const unexpected: never = command;
        throw new Error(`Unknown schema command ${String(unexpected)}`);
      }
    }
  } finally {
    await sequelize.close();
  }
}

function isSchemaCommand(value: string | undefined): value is SchemaCommand {
  return SCHEMA_COMMANDS.some((command) => command === value);
}

const invokedPath = process.argv[1];

if (invokedPath !== undefined && import.meta.url === pathToFileURL(invokedPath).href) {
  runSchemaCommand(parseSchemaCommand(process.argv.slice(2))).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Schema command failed";
    console.error(message);
    process.exitCode = 1;
  });
}
