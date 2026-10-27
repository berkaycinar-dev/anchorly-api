import express from "express";

export function createApp({ database }) {
  const app = express();

  app.disable("x-powered-by");

  app.get("/health", async (request, response) => {
    try {
      await database.ping();
      response.json({ status: "ok", database: "ok" });
    } catch {
      response.status(503).json({ status: "error", database: "unreachable" });
    }
  });

  return app;
}
