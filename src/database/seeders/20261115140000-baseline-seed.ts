import type { QueryInterface } from "sequelize";
import { BASELINE_CREATED_AT, BASELINE_LABEL, BASELINE_TABLE } from "../baseline.js";

/**
 * One deterministic row in `schema_baseline`.
 * Run migrations first. Undo deletes this label only, then a later migration
 * undo can drop the table.
 */

type Seeder = {
  context: QueryInterface;
};

export async function up({ context }: Seeder): Promise<void> {
  await context.bulkInsert(BASELINE_TABLE, [
    {
      label: BASELINE_LABEL,
      created_at: BASELINE_CREATED_AT,
    },
  ]);
}

export async function down({ context }: Seeder): Promise<void> {
  await context.bulkDelete(BASELINE_TABLE, { label: BASELINE_LABEL });
}
