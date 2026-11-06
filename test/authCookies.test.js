import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { sessions } from "../src/db/schema/index.js";
import { hashToken } from "../src/lib/tokens.js";
import { TEST_AUTH } from "./helpers/auth.js";
import { createTestApp } from "./helpers/app.js";
import { useTestDatabase } from "./helpers/database.js";

const email = "ali@example.com";
const password = "correct horse battery";
const THIRTY_DAYS_IN_SECONDS = 30 * 24 * 60 * 60;

function findRefreshCookie(response) {
  const cookies = response.headers["set-cookie"] ?? [];
  const header = cookies.find((cookie) =>
    cookie.startsWith("anchorly_refresh="),
  );

  if (!header) {
    return null;
  }

  const [pair, ...attributes] = header.split(";").map((part) => part.trim());

  return {
    value: pair.slice("anchorly_refresh=".length),
    attributes: attributes.map((attribute) => attribute.toLowerCase()),
    header,
  };
}

function expectClearedCookie(response) {
  const cookie = findRefreshCookie(response);

  expect(cookie).not.toBeNull();
  expect(cookie.value).toBe("");
  expect(cookie.attributes).toContain("expires=thu, 01 jan 1970 00:00:00 gmt");
  expect(cookie.attributes).toContain("path=/auth");
}

describe("refresh token cookie", () => {
  const testDatabase = useTestDatabase();
  let app;
  let db;

  beforeEach(async () => {
    app = createTestApp({ database: testDatabase.database });
    db = testDatabase.db;

    await request(app)
      .post("/auth/register")
      .set("X-Anchorly-Client", "mobile")
      .send({ email, password });
    await db.delete(sessions);
  });

  function webLogin() {
    return request(app).post("/auth/login").send({ email, password });
  }

  function refreshWithCookie(value, extraHeaders = {}) {
    let call = request(app)
      .post("/auth/refresh")
      .set("Cookie", `theme=dark; anchorly_refresh=${value}`);

    for (const [name, headerValue] of Object.entries(extraHeaders)) {
      call = call.set(name, headerValue);
    }

    return call.send({});
  }

  async function onlySession() {
    const rows = await db.select().from(sessions);

    expect(rows).toHaveLength(1);
    return rows[0];
  }

  it("signs a web client in with an HttpOnly cookie instead of a body token", async () => {
    const response = await webLogin();
    const cookie = findRefreshCookie(response);

    expect(response.status).toBe(200);
    expect(response.body).not.toHaveProperty("refreshToken");
    expect(response.body).toHaveProperty("accessToken");
    expect(response.body).toHaveProperty("refreshTokenExpiresAt");
    expect(cookie.value).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(cookie.attributes).toEqual(
      expect.arrayContaining([
        "httponly",
        "secure",
        "samesite=strict",
        "path=/auth",
      ]),
    );
    expect((await onlySession()).tokenHash).toBe(hashToken(cookie.value));
  });

  it("lets the cookie live as long as the session", async () => {
    const cookie = findRefreshCookie(await webLogin());
    const maxAge = Number(
      cookie.attributes
        .find((attribute) => attribute.startsWith("max-age="))
        .split("=")[1],
    );

    expect(maxAge).toBeGreaterThan(THIRTY_DAYS_IN_SECONDS - 10);
    expect(maxAge).toBeLessThanOrEqual(THIRTY_DAYS_IN_SECONDS);
  });

  it("sets the cookie for web registrations too", async () => {
    const response = await request(app)
      .post("/auth/register")
      .send({ email: "ayse@example.com", password });

    expect(response.status).toBe(201);
    expect(response.body).not.toHaveProperty("refreshToken");
    expect(findRefreshCookie(response)).not.toBeNull();
  });

  it("gives mobile clients the token in the body and no cookie", async () => {
    const response = await request(app)
      .post("/auth/login")
      .set("X-Anchorly-Client", "Mobile ")
      .send({ email, password });

    expect(response.body.refreshToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(findRefreshCookie(response)).toBeNull();
  });

  it("refreshes from the cookie and answers with a new cookie only", async () => {
    const first = findRefreshCookie(await webLogin());

    const response = await refreshWithCookie(first.value);
    const second = findRefreshCookie(response);

    expect(response.status).toBe(200);
    expect(response.body).not.toHaveProperty("refreshToken");
    expect(second.value).not.toBe(first.value);
    expect((await onlySession()).tokenHash).toBe(hashToken(second.value));
  });

  it("never moves a cookie token into the body, even for a client claiming to be mobile", async () => {
    const first = findRefreshCookie(await webLogin());

    const response = await refreshWithCookie(first.value, {
      "X-Anchorly-Client": "mobile",
    });

    expect(response.status).toBe(200);
    expect(response.body).not.toHaveProperty("refreshToken");
    expect(findRefreshCookie(response)).not.toBeNull();
  });

  it("answers a body refresh in the body without setting a cookie", async () => {
    const login = await request(app)
      .post("/auth/login")
      .set("X-Anchorly-Client", "mobile")
      .send({ email, password });

    const response = await request(app)
      .post("/auth/refresh")
      .send({ refreshToken: login.body.refreshToken });

    expect(response.status).toBe(200);
    expect(response.body.refreshToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(findRefreshCookie(response)).toBeNull();
  });

  it("rejects a refresh without a body token or cookie", async () => {
    const response = await request(app).post("/auth/refresh").send({});

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("INVALID_REFRESH_TOKEN");
  });

  it("clears the cookie when it holds an unknown token", async () => {
    const response = await refreshWithCookie("A".repeat(43));

    expect(response.status).toBe(401);
    expectClearedCookie(response);
  });

  it("clears the cookie and closes the session when an old cookie comes back late", async () => {
    const first = findRefreshCookie(await webLogin());
    await refreshWithCookie(first.value);
    await db
      .update(sessions)
      .set({ rotatedAt: new Date(Date.now() - 301 * 1000) });

    const response = await refreshWithCookie(first.value);

    expect(response.status).toBe(401);
    expectClearedCookie(response);
    expect((await onlySession()).revokedAt).toBeInstanceOf(Date);
  });

  it("clears the cookie on logout", async () => {
    const login = await webLogin();

    const response = await request(app)
      .post("/auth/logout")
      .set("Authorization", `Bearer ${login.body.accessToken}`);

    expect(response.status).toBe(204);
    expectClearedCookie(response);
    expect((await onlySession()).revokedAt).toBeInstanceOf(Date);
  });

  it("uses the configured cookie path and secure flag", async () => {
    const proxiedApp = createTestApp({
      database: testDatabase.database,
      auth: { ...TEST_AUTH, cookiePath: "/api/auth", cookieSecure: false },
    });

    const response = await request(proxiedApp)
      .post("/auth/login")
      .send({ email, password });
    const cookie = findRefreshCookie(response);

    expect(cookie.attributes).toContain("path=/api/auth");
    expect(cookie.attributes).not.toContain("secure");
    expect(cookie.attributes).toContain("httponly");
  });
});
