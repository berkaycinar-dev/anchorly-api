import express from "express";
import swaggerUi from "swagger-ui-express";
import { RATE_LIMITS } from "./constants/rateLimits.js";
import { buildOpenApiDocument } from "./docs/openapi.js";
import {
  createErrorHandler,
  notFoundHandler,
} from "./middleware/errorHandlers.js";
import { createRateLimiters } from "./middleware/rateLimits.js";
import { createRequireAuth } from "./middleware/requireAuth.js";
import { PUBLIC_ROUTERS, RESOURCE_ROUTERS } from "./routes/index.js";

export function createApp({
  database,
  logger = console,
  auth,
  mailer,
  appUrl,
  rateLimits = RATE_LIMITS,
  trustProxy = 0,
  runInBackground = (task) => {
    task().catch((error) => logger.error(error));
  },
}) {
  if (!auth?.jwtSecret) {
    throw new Error("createApp needs the auth settings (see loadAuthConfig)");
  }

  if (!mailer || !appUrl) {
    throw new Error(
      "createApp needs a mailer and the app url (see loadMailConfig)",
    );
  }

  const app = express();
  const requireAuth = createRequireAuth({ db: database.db, auth });
  const limiters = createRateLimiters(rateLimits);
  const openApiDocument = buildOpenApiDocument();

  app.disable("x-powered-by");
  app.set("trust proxy", trustProxy > 0 ? trustProxy : false);
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
    app.use(
      path,
      createRouter({
        db: database.db,
        auth,
        requireAuth,
        mailer,
        appUrl,
        logger,
        limiters,
        runInBackground,
      }),
    );
  }

  for (const [path, createRouter] of RESOURCE_ROUTERS) {
    app.use(
      path,
      requireAuth,
      createRouter({ db: database.db, auth, limiters }),
    );
  }

  app.use(notFoundHandler);
  app.use(createErrorHandler({ logger }));

  return app;
}
