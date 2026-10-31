import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { TEST_AUTH } from "./helpers/auth.js";

const reachableDatabase = { ping: () => Promise.resolve() };

function createTestApp() {
  return createApp({ database: reachableDatabase, auth: TEST_AUTH });
}

describe("http basics", () => {
  it("answers an unknown route with a JSON 404 error", async () => {
    const response = await request(createTestApp()).get("/does-not-exist");

    expect(response.status).toBe(404);
    expect(response.headers["content-type"]).toMatch(/application\/json/);
    expect(response.body).toEqual({
      error: {
        code: "NOT_FOUND",
        message: "Route GET /does-not-exist not found",
      },
    });
  });

  it("rejects a body that is not valid JSON", async () => {
    const response = await request(createTestApp())
      .post("/does-not-exist")
      .set("Content-Type", "application/json")
      .send('{"title": ');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_JSON");
  });

  it("rejects a body larger than 100 kilobytes", async () => {
    const response = await request(createTestApp())
      .post("/does-not-exist")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ data: "x".repeat(110 * 1024) }));

    expect(response.status).toBe(413);
    expect(response.body.error.code).toBe("PAYLOAD_TOO_LARGE");
  });
});
