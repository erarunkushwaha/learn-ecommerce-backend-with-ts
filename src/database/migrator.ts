import { fileURLToPath, pathToFileURL } from "node:url";
import type { QueryInterface, Sequelize } from "sequelize";
import { Umzug, type MigrationParams, type Resolver, type UmzugStorage } from "umzug";
import type { LogFields, Logger } from "../config/logger.js";

/**
 * Schema changes and seed data for one MySQL database.
 * The HTTP process does not call this module. `src/database/cli.ts` does.
 * Files are the compiled JavaScript next to this module, under `migrations/`
 * and `seeders/`. `npm run db:migrate` compiles before it runs.
 * History tables are created with `CREATE TABLE IF NOT EXISTS`.
 * Application code does not call sync, and it does not drop with force.
 * MySQL commits each DDL statement on its own. A later statement cannot
 * roll that back. `down` has to undo what `up` did.
 */

export const MIGRATION_HISTORY_TABLE = "SequelizeMeta";
export const SEEDER_HISTORY_TABLE = "SequelizeData";

const HISTORY_TABLES = [MIGRATION_HISTORY_TABLE, SEEDER_HISTORY_TABLE] as const;

type HistoryTable = (typeof HISTORY_TABLES)[number];
type SchemaContext = QueryInterface;
type SchemaStep = (params: MigrationParams<SchemaContext>) => Promise<void>;

type HistorySql = {
  ensure: string;
  insert: string;
  remove: string;
  list: string;
};

/**
 * Remember applied file names.
 * The primary key is the file name, not a BIGINT. Umzug treats the last name
 * in ascending order as the latest migration, so new files need a timestamp
 * prefix that sorts after the files already applied.
 */
class HistoryStorage implements UmzugStorage<SchemaContext> {
  constructor(
    private readonly sequelize: Sequelize,
    private readonly table: HistoryTable,
  ) {}

  async logMigration(params: MigrationParams<SchemaContext>): Promise<void> {
    const sql = historySql(this.table);
    await this.sequelize.query(sql.ensure);
    await this.sequelize.query(sql.insert, { bind: { name: params.name } });
  }

  async unlogMigration(params: MigrationParams<SchemaContext>): Promise<void> {
    const sql = historySql(this.table);
    await this.sequelize.query(sql.ensure);
    await this.sequelize.query(sql.remove, { bind: { name: params.name } });
  }

  async executed(): Promise<string[]> {
    const sql = historySql(this.table);
    await this.sequelize.query(sql.ensure);
    const queried: unknown = await this.sequelize.query(sql.list);
    return historyNames(firstResult(queried));
  }
}

export function createMigrator(sequelize: Sequelize, logger?: Logger): Umzug<SchemaContext> {
  return createRunner(sequelize, "migrations", MIGRATION_HISTORY_TABLE, logger);
}

export function createSeeder(sequelize: Sequelize, logger?: Logger): Umzug<SchemaContext> {
  return createRunner(sequelize, "seeders", SEEDER_HISTORY_TABLE, logger);
}

export async function applyMigrations(sequelize: Sequelize, logger?: Logger): Promise<string[]> {
  const applied = await createMigrator(sequelize, logger).up();
  return applied.map((migration) => migration.name);
}

export async function revertMigrations(sequelize: Sequelize, logger?: Logger): Promise<string[]> {
  const reverted = await createMigrator(sequelize, logger).down();
  return reverted.map((migration) => migration.name);
}

export async function applySeeders(sequelize: Sequelize, logger?: Logger): Promise<string[]> {
  const applied = await createSeeder(sequelize, logger).up();
  return applied.map((seeder) => seeder.name);
}

export async function revertSeeders(sequelize: Sequelize, logger?: Logger): Promise<string[]> {
  const reverted = await createSeeder(sequelize, logger).down();
  return reverted.map((seeder) => seeder.name);
}

function createRunner(
  sequelize: Sequelize,
  kind: "migrations" | "seeders",
  table: HistoryTable,
  logger: Logger | undefined,
): Umzug<SchemaContext> {
  return new Umzug<SchemaContext>({
    migrations: {
      glob: ["*.js", { cwd: schemaDirectory(kind) }],
      resolve: resolveSchemaFile,
    },
    context: sequelize.getQueryInterface(),
    storage: new HistoryStorage(sequelize, table),
    logger: logger === undefined ? undefined : umzugLogger(logger),
  });
}

const resolveSchemaFile: Resolver<SchemaContext> = ({ name, path: filepath }) => {
  if (filepath === undefined) {
    throw new Error(`Schema file ${name} has no path`);
  }
  const filePath = filepath;
  return {
    name,
    path: filePath,
    async up(params) {
      const step = await loadSchemaFile(filePath);
      await step.up(params);
    },
    async down(params) {
      const step = await loadSchemaFile(filePath);
      await step.down(params);
    },
  };
};

async function loadSchemaFile(filepath: string): Promise<{ up: SchemaStep; down: SchemaStep }> {
  const imported: unknown = await import(pathToFileURL(filepath).href);
  if (!isRecord(imported)) {
    throw new Error(`Schema file ${filepath} did not export a module`);
  }
  return {
    up: asStep(imported.up, filepath, "up"),
    down: asStep(imported.down, filepath, "down"),
  };
}

function asStep(value: unknown, filepath: string, exportName: string): SchemaStep {
  if (!isSchemaStep(value)) {
    throw new Error(`Schema file ${filepath} does not export ${exportName}`);
  }
  return (params) => Promise.resolve(value(params)).then(() => undefined);
}

function isSchemaStep(value: unknown): value is (params: MigrationParams<SchemaContext>) => unknown {
  return typeof value === "function";
}

function schemaDirectory(kind: "migrations" | "seeders"): string {
  return fileURLToPath(new URL(`./${kind}/`, import.meta.url));
}

function umzugLogger(logger: Logger): {
  info: (message: Record<string, unknown>) => void;
  warn: (message: Record<string, unknown>) => void;
  error: (message: Record<string, unknown>) => void;
  debug: (message: Record<string, unknown>) => void;
} {
  return {
    info: (record) => writeUmzug(logger, "info", record),
    warn: (record) => writeUmzug(logger, "warn", record),
    error: (record) => writeUmzug(logger, "error", record),
    debug: (record) => writeUmzug(logger, "debug", record),
  };
}

function writeUmzug(
  logger: Logger,
  level: "debug" | "info" | "warn" | "error",
  record: Record<string, unknown>,
): void {
  const event = typeof record.event === "string" ? record.event : "schema";
  const fields: LogFields = {};
  if (typeof record.name === "string") {
    fields.name = record.name;
  }
  if (typeof record.durationSeconds === "number" && Number.isFinite(record.durationSeconds)) {
    fields.durationSeconds = record.durationSeconds;
  }
  logger[level](event, fields);
}

/**
 * SQL text is fixed per table. The file name is bound, not concatenated.
 */
function historySql(table: HistoryTable): HistorySql {
  switch (table) {
    case "SequelizeMeta":
      return {
        ensure:
          "CREATE TABLE IF NOT EXISTS SequelizeMeta (name VARCHAR(255) NOT NULL, PRIMARY KEY (name)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci",
        insert: "INSERT INTO SequelizeMeta (name) VALUES ($name)",
        remove: "DELETE FROM SequelizeMeta WHERE name = $name",
        list: "SELECT name FROM SequelizeMeta ORDER BY name ASC",
      };
    case "SequelizeData":
      return {
        ensure:
          "CREATE TABLE IF NOT EXISTS SequelizeData (name VARCHAR(255) NOT NULL, PRIMARY KEY (name)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci",
        insert: "INSERT INTO SequelizeData (name) VALUES ($name)",
        remove: "DELETE FROM SequelizeData WHERE name = $name",
        list: "SELECT name FROM SequelizeData ORDER BY name ASC",
      };
    default: {
      const unexpected: never = table;
      throw new Error(`Unknown history table ${String(unexpected)}`);
    }
  }
}

function firstResult(queried: unknown): unknown {
  if (!Array.isArray(queried) || queried.length === 0) {
    throw new Error("History query returned no result");
  }
  return queried[0];
}

function historyNames(rows: unknown): string[] {
  if (!Array.isArray(rows)) {
    throw new Error("History query did not return rows");
  }
  return rows.map((row) => {
    if (!isRecord(row) || typeof row.name !== "string") {
      throw new Error("History query returned an unexpected row");
    }
    return row.name;
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
