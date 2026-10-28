import { DEV_USER } from "../src/constants/devUser.js";
import { loadConfig, loadEnvFile } from "../src/config.js";
import { createDatabase } from "../src/db/client.js";
import { seedDevUser } from "../src/db/seedDevUser.js";

loadEnvFile();

const database = createDatabase(loadConfig().databaseUrl);

try {
  await seedDevUser(database.db);
  console.log(`Development user ready: ${DEV_USER.email}`);
} finally {
  await database.close();
}
