import express from "express";

export function createApp() {
  const app = express();

  app.disable("x-powered-by");

  app.get("/health", (request, response) => {
    response.json({ status: "ok" });
  });

  return app;
}
