/**
 * The first reversible table.
 * It is not a user, catalog, or auth table. Later migrations add those.
 * The id and timestamp columns are the application conventions from ADR-009.
 * Bookkeeping tables are keyed by filename and do not use this id shape.
 */

export const BASELINE_TABLE = "schema_baseline";

/** Only row the baseline seeder writes. Undo deletes this label and no other. */
export const BASELINE_LABEL = "baseline";

/**
 * Clock time stored for the baseline row.
 * The pool sets the session time zone to +00:00, so this string is UTC.
 * It is not `CURRENT_TIMESTAMP`, so a second machine stores the same value.
 */
export const BASELINE_CREATED_AT = "2026-11-15 00:00:00.000";
