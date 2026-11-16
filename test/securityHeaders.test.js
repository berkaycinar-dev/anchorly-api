import request from "supertest";
import { describe, expect, it } from "vitest";
import { createTestApp } from "./helpers/app.js";

const API_POLICY = "default-src 'none';frame-ancestors 'none'";

function createApp() {
  return createTestApp({ database: { ping: async () => {} } });
}

function expectApiHeaders(response) {
  expect(response.headers["content-security-policy"]).toBe(API_POLICY);
  expect(response.headers["x-frame-options"]).toBe("DENY");
  expect(response.headers["x-content-type-options"]).toBe("nosniff");
  expect(response.headers["referrer-policy"]).toBe("no-referrer");
  expect(response.headers["cross-origin-resource-policy"]).toBe("same-origin");
  expect(response.headers["strict-transport-security"]).toMatch(/^max-age=\d+/);
}

describe("security headers", () => {
  it("sends a strict policy with json responses", async () => {
    const response = await request(createApp()).get("/ping");

    expect(response.status).toBe(200);
    expectApiHeaders(response);
  });

  it("sends the strict policy with unknown routes", async () => {
    const response = await request(createApp()).get("/missing");

    expect(response.status).toBe(404);
    expectApiHeaders(response);
  });

  it("sends the strict policy when the request body is not valid json", async () => {
    const response = await request(createApp())
      .post("/auth/login")
      .set("Content-Type", "application/json")
      .send("{");

    expect(response.status).toBe(400);
    expectApiHeaders(response);
  });

  it("sends the strict policy when the request is not signed in", async () => {
    const response = await request(createApp()).get("/tasks");

    expect(response.status).toBe(401);
    expectApiHeaders(response);
  });

  it("treats paths that only start with docs as api paths", async () => {
    const response = await request(createApp()).get("/docsx");

    expect(response.status).toBe(404);
    expectApiHeaders(response);
  });

  it("lets the docs page load its own scripts and styles", async () => {
    const response = await request(createApp()).get("/docs/");
    const policy = response.headers["content-security-policy"];

    expect(response.status).toBe(200);
    expect(policy).toContain("default-src 'self'");
    expect(policy).toContain("script-src 'self'");
    expect(policy).toContain("frame-ancestors 'self'");
    expect(response.headers["x-frame-options"]).toBe("SAMEORIGIN");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("serves a docs page without inline scripts", async () => {
    const response = await request(createApp()).get("/docs/");
    const scripts = response.text.match(/<script[^>]*>/g) ?? [];

    expect(scripts.length).toBeGreaterThan(0);

    for (const script of scripts) {
      expect(script).toMatch(/src="\.\//);
    }
  });

  it("keeps the docs policy on the docs assets", async () => {
    const response = await request(createApp()).get("/docs/swagger-ui-init.js");

    expect(response.status).toBe(200);
    expect(response.headers["content-security-policy"]).toContain(
      "script-src 'self'",
    );
  });
});
