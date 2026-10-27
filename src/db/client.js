import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

export function createDatabase(databaseUrl) {
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    max: 10,
    connectionTimeoutMillis: 5000,
  });

  pool.on("error", (error) => {
    console.error(
      `Unexpected error on an idle database client: ${error.message}`,
    );
  });

  const db = drizzle({ client: pool, casing: "snake_case" });

  async function ping() {
    await db.execute(sql`select 1`);
  }

  function close() {
    return pool.end();
  }

  return { db, ping, close };
}
