import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach } from "vitest";
import { loadConfig } from "../../src/config.js";
import { createDatabase } from "../../src/db/client.js";
import { runMigrations } from "../../src/db/migrations.js";
import { seedDevUser } from "../../src/db/seedDevUser.js";

export function createTestDatabase() {
  return createDatabase(loadConfig().databaseUrl);
}

export async function assertTestDatabase(db) {
  const result = await db.execute(sql`select current_database() as name`);
  const databaseName = result.rows[0].name;

  if (!databaseName.endsWith("_test")) {
    throw new Error(
      `Refusing to use "${databaseName}" in tests: only databases ending in _test are allowed`,
    );
  }
}

export async function prepareTestDatabase(db) {
  await assertTestDatabase(db);
  await db.execute(sql`drop schema if exists drizzle cascade`);
  await db.execute(sql`drop schema if exists public cascade`);
  await db.execute(sql`create schema public`);
  await runMigrations(db);
}

export async function truncateAllTables(db) {
  const result = await db.execute(
    sql`select tablename from pg_tables where schemaname = 'public'`,
  );
  const tableNames = result.rows.map((row) => `"${row.tablename}"`);

  if (tableNames.length > 0) {
    await db.execute(
      sql.raw(`truncate table ${tableNames.join(", ")} cascade`),
    );
  }
}

export function useTestDatabase({ seed = true } = {}) {
  const context = {};

  beforeAll(async () => {
    context.database = createTestDatabase();
    context.db = context.database.db;
    await assertTestDatabase(context.db);
  });

  beforeEach(async () => {
    await truncateAllTables(context.db);

    if (seed) {
      await seedDevUser(context.db);
    }
  });

  afterAll(async () => {
    await context.database?.close();
  });

  return context;
}
