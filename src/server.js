import { createApp } from "./app.js";
import {
  loadAuthConfig,
  loadConfig,
  loadEnvFile,
  loadMailConfig,
} from "./config.js";
import { createDatabase } from "./db/client.js";
import { startCleanupSchedule } from "./jobs/cleanupSchedule.js";
import { createMailer } from "./mail/mailers.js";
import { runCleanup } from "./services/cleanupService.js";

loadEnvFile();

const config = loadConfig();
const auth = loadAuthConfig();
const mail = loadMailConfig();
const database = createDatabase(config.databaseUrl);
const mailer = createMailer(mail);

const server = createApp({
  database,
  auth,
  mailer,
  appUrl: mail.appUrl,
  trustProxy: config.trustProxy,
}).listen(config.port, () => {
  console.log(`anchorly-api listening on http://localhost:${config.port}`);
  console.log(`Emails: ${mail.provider}, links point to ${mail.appUrl}`);
  console.log(`Trusted proxies: ${config.trustProxy}`);
});

const cleanup = startCleanupSchedule({ run: () => runCleanup(database.db) });

function shutdown() {
  cleanup.stop();
  server.close(async () => {
    await database.close();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
