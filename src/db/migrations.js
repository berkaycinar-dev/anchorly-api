import { migrate } from "drizzle-orm/node-postgres/migrator";

export const MIGRATIONS_FOLDER = "./drizzle";

export function runMigrations(db) {
  return migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
}
