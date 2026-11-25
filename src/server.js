import { createApp } from "./app.js";
import {
  loadAuthConfig,
  loadConfig,
  loadEnvFile,
  loadMailConfig,
} from "./config.js";
import { createDatabase } from "./db/client.js";
import { startCleanupSchedule } from "./jobs/cleanupSchedule.js";
import { createLogger } from "./lib/logger.js";
import { createMailer } from "./mail/mailers.js";
import { runCleanup } from "./services/cleanupService.js";

loadEnvFile();

const config = loadConfig();
const logger = createLogger({ level: config.logLevel });

process.on("unhandledRejection", (reason) => {
  logger.error({ err: reason }, "Unhandled promise rejection");
});

process.on("uncaughtException", (error) => {
  logger.fatal({ err: error }, "Uncaught exception");
  process.exit(1);
});

const auth = loadAuthConfig();
const mail = loadMailConfig();
const database = createDatabase(config.databaseUrl);
const mailer = createMailer(mail, { logger });

const server = createApp({
  database,
  logger,
  logRequests: true,
  auth,
  mailer,
  appUrl: mail.appUrl,
  trustProxy: config.trustProxy,
}).listen(config.port, () => {
  logger.info(
    {
      port: config.port,
      mailProvider: mail.provider,
      appUrl: mail.appUrl,
      trustProxy: config.trustProxy,
    },
    "anchorly-api is listening",
  );
});

const cleanup = startCleanupSchedule({
  run: () => runCleanup(database.db),
  logger,
});

function shutdown() {
  cleanup.stop();
  server.close(async () => {
    await database.close();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
