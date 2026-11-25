import request from "supertest";
import { describe, expect, it } from "vitest";
import { createLogger } from "../src/lib/logger.js";
import { createTestApp } from "./helpers/app.js";

function createCapture() {
  const lines = [];

  return {
    lines,
    destination: {
      write(chunk) {
        lines.push(JSON.parse(chunk));
      },
    },
  };
}

function createBrokenDatabase() {
  return {
    ping: async () => {},
    db: new Proxy(
      {},
      {
        get() {
          return () => {
            throw new Error("database is down");
          };
        },
      },
    ),
  };
}

function setup({ database = createBrokenDatabase() } = {}) {
  const capture = createCapture();
  const logger = createLogger({
    level: "info",
    destination: capture.destination,
  });
  const app = createTestApp({ database, logger, logRequests: true });

  return { app, lines: capture.lines, logger };
}

function requestLines(lines) {
  return lines.filter((line) => line.res);
}

describe("createLogger", () => {
  it("writes JSON lines with the service name, an ISO time and the level", () => {
    const capture = createCapture();
    const logger = createLogger({ destination: capture.destination });

    logger.info({ port: 3000 }, "listening");

    expect(capture.lines[0]).toMatchObject({
      level: 30,
      service: "anchorly-api",
      port: 3000,
      msg: "listening",
    });
    expect(new Date(capture.lines[0].time).toISOString()).toBe(
      capture.lines[0].time,
    );
  });

  it("hides passwords and tokens wherever they appear", () => {
    const capture = createCapture();
    const logger = createLogger({ destination: capture.destination });

    logger.info(
      {
        password: "secret-one",
        body: {
          password: "secret-five",
          newPassword: "secret-two",
          refreshToken: "secret-three",
        },
        token: "secret-four",
      },
      "sensitive",
    );

    const output = JSON.stringify(capture.lines[0]);
    expect(output).not.toMatch(/secret-/);
    expect(capture.lines[0].password).toBe("[redacted]");
    expect(capture.lines[0].body).toEqual({
      password: "[redacted]",
      newPassword: "[redacted]",
      refreshToken: "[redacted]",
    });
  });

  it("keeps the cause of an error", () => {
    const capture = createCapture();
    const logger = createLogger({ destination: capture.destination });

    logger.error(
      new Error("Cleanup failed", { cause: new Error("connection reset") }),
    );

    expect(capture.lines[0].err.message).toContain("Cleanup failed");
    expect(JSON.stringify(capture.lines[0].err)).toContain("connection reset");
  });

  it("writes nothing when the level is silent", () => {
    const capture = createCapture();
    const logger = createLogger({
      level: "silent",
      destination: capture.destination,
    });

    logger.error(new Error("hidden"));

    expect(capture.lines).toEqual([]);
  });
});

describe("request logging", () => {
  it("logs one line per request with the method, path, status and time", async () => {
    const { app, lines } = setup();

    await request(app).get("/openapi.json");

    const [line] = requestLines(lines);
    expect(line).toMatchObject({
      level: 30,
      req: { method: "GET", url: "/openapi.json" },
      res: { statusCode: 200 },
      msg: "GET /openapi.json 200",
    });
    expect(line.responseTime).toEqual(expect.any(Number));
    expect(Object.keys(line.req).sort()).toEqual(["id", "method", "url"]);
    expect(Object.keys(line.res)).toEqual(["statusCode"]);
  });

  it("gives every request an id and sends it back in X-Request-Id", async () => {
    const { app, lines } = setup();

    const response = await request(app).get("/openapi.json");

    expect(response.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
    expect(requestLines(lines)[0].req.id).toBe(
      response.headers["x-request-id"],
    );
  });

  it("keeps a well-formed incoming request id and replaces a bad one", async () => {
    const { app } = setup();

    const kept = await request(app)
      .get("/openapi.json")
      .set("X-Request-Id", "render-abc12345");
    const replaced = await request(app)
      .get("/openapi.json")
      .set("X-Request-Id", "bad id with spaces!");

    expect(kept.headers["x-request-id"]).toBe("render-abc12345");
    expect(replaced.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("leaves out the query string, headers, cookies, body and IP address", async () => {
    const { app, lines } = setup();

    await request(app)
      .post("/auth/login?next=secret-query")
      .set("Authorization", "Bearer secret-token")
      .set("Cookie", "anchorly_refresh=secret-cookie")
      .set("X-Forwarded-For", "203.0.113.9")
      .send({ email: "ali@example.com", password: "secret-password" });

    const output = JSON.stringify(lines);
    expect(requestLines(lines)[0].req.url).toBe("/auth/login");
    expect(output).not.toMatch(/secret-/);
    expect(output).not.toContain("203.0.113.9");
    expect(output).not.toContain("ali@example.com");
  });

  it("logs client errors as warnings", async () => {
    const { app, lines } = setup();

    await request(app).get("/no-such-route");

    expect(requestLines(lines)[0]).toMatchObject({
      level: 40,
      res: { statusCode: 404 },
    });
  });

  it("logs server errors with the error and the same request id", async () => {
    const { app, lines } = setup();

    const response = await request(app)
      .post("/auth/login")
      .send({ email: "ali@example.com", password: "long enough" });

    expect(response.status).toBe(500);
    const errorLine = lines.find((line) => line.err && !line.res);
    const [requestLine] = requestLines(lines);

    expect(errorLine).toMatchObject({
      level: 50,
      req: { id: response.headers["x-request-id"] },
    });
    expect(errorLine.err.message).toContain("database is down");
    expect(requestLine).toMatchObject({ level: 50, res: { statusCode: 500 } });
  });

  it("stays quiet for the ping and health checks", async () => {
    const { app, lines } = setup();

    await request(app).get("/ping");
    await request(app).get("/health");

    expect(lines).toEqual([]);
  });

  it("is off unless asked for", async () => {
    const capture = createCapture();
    const logger = createLogger({ destination: capture.destination });
    const app = createTestApp({ database: createBrokenDatabase(), logger });

    const response = await request(app).get("/openapi.json");

    expect(response.headers["x-request-id"]).toBeUndefined();
    expect(capture.lines).toEqual([]);
  });
});
