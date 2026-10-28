import { loadEnvFile } from "../src/config.js";
import { createTestDatabase, prepareTestDatabase } from "./helpers/database.js";

export default async function setup() {
  loadEnvFile(".env.test");

  try {
    const database = createTestDatabase();

    try {
      await prepareTestDatabase(database.db);
    } finally {
      await database.close();
    }
  } catch (error) {
    const cause = error.cause?.code ?? error.cause?.message;
    const details = cause ? `${error.message}\nCause: ${cause}` : error.message;

    console.error(`\nTest database setup failed:\n${details}\n`);
    throw error;
  }
}
