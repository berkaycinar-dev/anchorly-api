import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { DEV_USER } from "../src/constants/devUser.js";
import { HttpError, notFoundError } from "../src/lib/httpError.js";
import {
  createErrorHandler,
  notFoundHandler,
} from "../src/middleware/errorHandlers.js";
import { validate } from "../src/middleware/validate.js";

function createTestApp(addRoutes, logger = { error: vi.fn() }) {
  const app = express();

  app.use(express.json());
  addRoutes(app);
  app.use(notFoundHandler);
  app.use(createErrorHandler({ logger }));

  return app;
}

describe("validate", () => {
  const schemas = {
    params: z.object({ id: z.uuid() }),
    query: z.object({ limit: z.coerce.number().int().min(1).optional() }),
    body: z.strictObject({ name: z.string().trim().min(1) }),
  };

  function createValidatingApp() {
    return createTestApp((app) => {
      app.post("/items/:id", validate(schemas), (request, response) => {
        response.json(request.validated);
      });
    });
  }

  it("passes the parsed request parts to the route", async () => {
    const response = await request(createValidatingApp())
      .post(`/items/${DEV_USER.id}?limit=5`)
      .send({ name: "  Portfolio  " });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      params: { id: DEV_USER.id },
      query: { limit: 5 },
      body: { name: "Portfolio" },
    });
  });

  it("reports every invalid field with its location", async () => {
    const response = await request(createValidatingApp())
      .post("/items/not-a-uuid?limit=0")
      .send({ name: "", color: "blue" });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(response.body.error.details.map((detail) => detail.path)).toEqual([
      "params.id",
      "query.limit",
      "body.name",
      "body",
    ]);
    expect(response.body.error.details[3].message).toContain("color");
  });

  it("stops the request before the route runs", async () => {
    const route = vi.fn();
    const app = createTestApp((testApp) => {
      testApp.post("/items/:id", validate(schemas), route);
    });

    await request(app).post("/items/not-a-uuid").send({ name: "Portfolio" });

    expect(route).not.toHaveBeenCalled();
  });
});

describe("error handler", () => {
  it("uses the status and code of an HttpError", async () => {
    const app = createTestApp((testApp) => {
      testApp.get("/conflict", () => {
        throw new HttpError(409, "CONFLICT", "Already exists");
      });
      testApp.get("/missing", () => {
        throw notFoundError("Project not found");
      });
    });

    const conflict = await request(app).get("/conflict");
    const missing = await request(app).get("/missing");

    expect(conflict.status).toBe(409);
    expect(conflict.body).toEqual({
      error: { code: "CONFLICT", message: "Already exists" },
    });
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual({
      error: { code: "NOT_FOUND", message: "Project not found" },
    });
  });

  it("hides the details of an unexpected error and logs it", async () => {
    const logger = { error: vi.fn() };
    const failure = new Error("password=secret leaked in a query");
    const app = createTestApp((testApp) => {
      testApp.get("/broken", () => {
        throw failure;
      });
    }, logger);

    const response = await request(app).get("/broken");

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: { code: "INTERNAL_ERROR", message: "Something went wrong" },
    });
    expect(JSON.stringify(response.body)).not.toContain("secret");
    expect(logger.error).toHaveBeenCalledWith(failure);
  });

  it("catches errors thrown inside async routes", async () => {
    const app = createTestApp((testApp) => {
      testApp.get("/async", async () => {
        await Promise.resolve();
        throw notFoundError("Task not found");
      });
    });

    const response = await request(app).get("/async");

    expect(response.status).toBe(404);
    expect(response.body.error.message).toBe("Task not found");
  });
});
