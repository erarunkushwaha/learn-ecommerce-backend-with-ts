import { DataTypes, type QueryInterface } from "sequelize";
import { BASELINE_TABLE } from "../baseline.js";

/**
 * First migration.
 * Creates and drops `schema_baseline` only. Users, catalog, and auth tables
 * are later files. Money columns are not invented here; ADR-009 records
 * DECIMAL(12,2) plus a currency code for the first table that stores a price.
 */

type Migration = {
  context: QueryInterface;
};

export async function up({ context }: Migration): Promise<void> {
  await context.createTable(
    BASELINE_TABLE,
    {
      id: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: false,
        primaryKey: true,
        autoIncrement: true,
      },
      label: {
        type: DataTypes.STRING(32),
        allowNull: false,
        unique: true,
      },
      created_at: {
        type: DataTypes.DATE(3),
        allowNull: false,
      },
    },
    {
      engine: "InnoDB",
      charset: "utf8mb4",
      collate: "utf8mb4_0900_ai_ci",
    },
  );
}

export async function down({ context }: Migration): Promise<void> {
  await context.dropTable(BASELINE_TABLE);
}
