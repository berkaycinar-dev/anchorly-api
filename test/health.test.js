import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestApp } from "./helpers/app.js";
import { createTestDatabase } from "./helpers/database.js";

describe("GET /health", () => {
  let database;

  beforeAll(() => {
    database = createTestDatabase();
  });

  afterAll(async () => {
    await database?.close();
  });

  it("reports the api and the database as ok", async () => {
    const response = await request(createTestApp({ database })).get("/health");

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toMatch(/application\/json/);
    expect(response.body).toEqual({ status: "ok", database: "ok" });
  });

  it("does not reveal the server framework", async () => {
    const response = await request(createTestApp({ database })).get("/health");

    expect(response.headers["x-powered-by"]).toBeUndefined();
  });

  it("responds with 503 when the database is unreachable", async () => {
    const unreachableDatabase = {
      ping: () => Promise.reject(new Error("connection refused")),
    };

    const response = await request(
      createTestApp({ database: unreachableDatabase }),
    ).get("/health");

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      status: "error",
      database: "unreachable",
    });
  });
});

describe("GET /ping", () => {
  it("answers without asking the database", async () => {
    const ping = vi.fn(() => Promise.reject(new Error("must not be called")));

    const response = await request(createTestApp({ database: { ping } })).get(
      "/ping",
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
    expect(ping).not.toHaveBeenCalled();
  });
});
