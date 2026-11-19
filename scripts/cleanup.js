import { loadConfig, loadEnvFile } from "../src/config.js";
import { createDatabase } from "../src/db/client.js";
import { runCleanup } from "../src/services/cleanupService.js";

loadEnvFile();

const database = createDatabase(loadConfig().databaseUrl);

try {
  console.log("Cleanup removed", await runCleanup(database.db));
} finally {
  await database.close();
}
