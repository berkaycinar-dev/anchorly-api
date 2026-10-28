import express from "express";
import { devUser } from "./middleware/devUser.js";
import {
  createErrorHandler,
  notFoundHandler,
} from "./middleware/errorHandlers.js";
import { createSettingsRouter } from "./routes/settings.js";

export function createApp({ database, logger = console }) {
  const app = express();

  app.disable("x-powered-by");
  app.use(express.json({ limit: "100kb" }));

  app.get("/health", async (request, response) => {
    try {
      await database.ping();
      response.json({ status: "ok", database: "ok" });
    } catch {
      response.status(503).json({ status: "error", database: "unreachable" });
    }
  });

  app.use(devUser);

  app.use("/me/settings", createSettingsRouter({ db: database.db }));

  app.use(notFoundHandler);
  app.use(createErrorHandler({ logger }));

  return app;
}
