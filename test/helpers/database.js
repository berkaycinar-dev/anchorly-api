import { sql } from "drizzle-orm";
import { expect } from "vitest";
import { loadConfig } from "../../src/config.js";
import { createDatabase } from "../../src/db/client.js";
import { runMigrations } from "../../src/db/migrations.js";

export function createTestDatabase() {
  return createDatabase(loadConfig().databaseUrl);
}

export async function resetDatabase(db) {
  const result = await db.execute(sql`select current_database() as name`);
  const databaseName = result.rows[0].name;

  if (!databaseName.endsWith("_test")) {
    throw new Error(
      `Refusing to reset "${databaseName}": only databases ending in _test can be reset`,
    );
  }

  await db.execute(sql`drop schema if exists drizzle cascade`);
  await db.execute(sql`drop schema if exists public cascade`);
  await db.execute(sql`create schema public`);
  await runMigrations(db);
}

export async function expectDatabaseError(promise, code) {
  const error = await promise.then(
    () => null,
    (caught) => caught,
  );

  expect(error, `expected database error ${code}`).not.toBeNull();
  expect(error.cause?.code ?? error.code).toBe(code);
}
