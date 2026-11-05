import { createApp } from "../../src/app.js";
import { TEST_AUTH } from "./auth.js";

export const TEST_APP_URL = "http://localhost:5173";

export function createMemoryMailer() {
  const sent = [];

  return {
    sent,
    async send(message) {
      sent.push(message);
    },
  };
}

export function createFailingMailer() {
  return {
    async send() {
      throw new Error("mail server is down");
    },
  };
}

export function readTokenFromEmail(message) {
  const link = message.text.match(/https?:\/\/\S+#token=\S+/)?.[0];

  return link
    ? new URLSearchParams(new URL(link).hash.slice(1)).get("token")
    : null;
}

export function createTestApp({
  database,
  auth = TEST_AUTH,
  mailer = createMemoryMailer(),
  logger = { error() {}, info() {} },
  rateLimits = {},
  ...overrides
}) {
  const backgroundTasks = [];
  const app = createApp({
    database,
    auth,
    mailer,
    appUrl: TEST_APP_URL,
    logger,
    rateLimits,
    runInBackground: (task) => {
      backgroundTasks.push(task().catch((error) => logger.error(error)));
    },
    ...overrides,
  });

  app.locals.mailer = mailer;
  app.locals.backgroundTasks = backgroundTasks;
  return app;
}

export async function settleBackgroundTasks(app) {
  await Promise.all(app.locals.backgroundTasks.splice(0));
}
