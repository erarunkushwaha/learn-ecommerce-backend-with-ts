import { isPlainData, isPositiveId } from "./record.js";

/** Row stored by the memory repository. `id` is assigned in `insert`. */
export type WithId<T extends object> = T & { id: number };

/**
 * The type argument is the insert payload, not the stored row.
 * A parameter that already has `id` is `never`, so the call does not typecheck.
 */
type FieldsWithoutId<T extends object> = "id" extends keyof T ? never : T;

export interface Repository<TFields extends object> {
  findById(id: number): Promise<WithId<TFields> | undefined>;
  insert(fields: TFields): Promise<WithId<TFields>>;
}

/**
 * In-memory stand-in for a repository. It is not the Sequelize pool.
 * `insert` copies enumerable own fields and refuses an own `id`.
 * It does not know which other keys a future entity allows. Parse first.
 */
export function createMemoryRepository<TFields extends object>(
  seed: readonly WithId<FieldsWithoutId<TFields>>[],
): Repository<FieldsWithoutId<TFields>> {
  type Fields = FieldsWithoutId<TFields>;
  type Row = WithId<Fields>;
  const rows: Row[] = [];
  const seen = new Set<number>();

  for (const entry of seed) {
    if (!isPlainData(entry)) {
      throw new TypeError("repository seed must be plain objects");
    }
    if (!isPositiveId(entry.id) || seen.has(entry.id)) {
      throw new TypeError("repository seed ids must be unique positive integers");
    }
    seen.add(entry.id);
    rows.push(Object.assign({}, entry));
  }

  return {
    findById(id: number): Promise<Row | undefined> {
      const found = rows.find((row) => row.id === id);
      if (found === undefined) {
        return Promise.resolve(undefined);
      }
      return Promise.resolve(Object.assign({}, found));
    },
    // A throw inside `then` rejects. Callers see the same failure shape as a database insert.
    insert(fields: Fields): Promise<Row> {
      return Promise.resolve().then(() => {
        if (!isPlainData(fields)) {
          throw new TypeError("insert fields must be an object");
        }
        if (Object.hasOwn(fields, "id")) {
          throw new TypeError("insert must not include id");
        }
        const id = nextId(rows);
        const row = Object.assign({}, fields, { id });
        rows.push(row);
        return Object.assign({}, row);
      });
    },
  };
}

function nextId(rows: readonly { id: number }[]): number {
  let max = 0;
  for (const row of rows) {
    if (row.id > max) {
      max = row.id;
    }
  }
  const id = max + 1;
  if (!Number.isSafeInteger(id)) {
    throw new TypeError("repository id is exhausted");
  }
  return id;
}
