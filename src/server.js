import { createApp } from "./app.js";
import { loadConfig, loadEnvFile } from "./config.js";
import { createDatabase } from "./db/client.js";

loadEnvFile();

const config = loadConfig();
const database = createDatabase(config.databaseUrl);

const server = createApp({ database }).listen(config.port, () => {
  console.log(`anchorly-api listening on http://localhost:${config.port}`);
});

function shutdown() {
  server.close(async () => {
    await database.close();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
