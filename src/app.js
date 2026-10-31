import express from "express";
import swaggerUi from "swagger-ui-express";
import { buildOpenApiDocument } from "./docs/openapi.js";
import {
  createErrorHandler,
  notFoundHandler,
} from "./middleware/errorHandlers.js";
import { createRequireAuth } from "./middleware/requireAuth.js";
import { PUBLIC_ROUTERS, RESOURCE_ROUTERS } from "./routes/index.js";

export function createApp({ database, logger = console, auth }) {
  if (!auth?.jwtSecret) {
    throw new Error("createApp needs the auth settings (see loadAuthConfig)");
  }

  const app = express();
  const requireAuth = createRequireAuth({ db: database.db, auth });
  const openApiDocument = buildOpenApiDocument();

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

  app.get("/openapi.json", (request, response) => {
    response.json(openApiDocument);
  });
  app.use("/docs", swaggerUi.serve, swaggerUi.setup(openApiDocument));

  for (const [path, createRouter] of PUBLIC_ROUTERS) {
    app.use(path, createRouter({ db: database.db, auth }));
  }

  for (const [path, createRouter] of RESOURCE_ROUTERS) {
    app.use(path, requireAuth, createRouter({ db: database.db }));
  }

  app.use(notFoundHandler);
  app.use(createErrorHandler({ logger }));

  return app;
}
