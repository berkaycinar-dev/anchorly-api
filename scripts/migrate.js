import { loadConfig, loadEnvFile } from "../src/config.js";
import { createDatabase } from "../src/db/client.js";
import { runMigrations } from "../src/db/migrations.js";

loadEnvFile();

const database = createDatabase(loadConfig().databaseUrl);

try {
  await runMigrations(database.db);
  console.log("Migrations applied");
} finally {
  await database.close();
}
