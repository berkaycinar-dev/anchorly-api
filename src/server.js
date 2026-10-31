import { createApp } from "./app.js";
import {
  loadAuthConfig,
  loadConfig,
  loadEnvFile,
  loadMailConfig,
} from "./config.js";
import { createDatabase } from "./db/client.js";
import { createMailer } from "./mail/mailers.js";

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
}).listen(config.port, () => {
  console.log(`anchorly-api listening on http://localhost:${config.port}`);
  console.log(`Emails: ${mail.provider}, links point to ${mail.appUrl}`);
});

function shutdown() {
  server.close(async () => {
    await database.close();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
