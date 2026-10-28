import express from "express";
import { devUser } from "./middleware/devUser.js";
import {
  createErrorHandler,
  notFoundHandler,
} from "./middleware/errorHandlers.js";
import { createProjectsRouter } from "./routes/projects.js";
import { createRoutinesRouter } from "./routes/routines.js";
import { createSettingsRouter } from "./routes/settings.js";
import { createTasksRouter } from "./routes/tasks.js";

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
  app.use("/projects", createProjectsRouter({ db: database.db }));
  app.use("/routines", createRoutinesRouter({ db: database.db }));
  app.use("/tasks", createTasksRouter({ db: database.db }));

  app.use(notFoundHandler);
  app.use(createErrorHandler({ logger }));

  return app;
}
