import { eq } from "drizzle-orm";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { DEV_USER } from "../src/constants/devUser.js";
import { sessions, userSettings, users } from "../src/db/schema/index.js";
import { buildOpenApiDocument } from "../src/docs/openapi.js";
import { createAccessToken } from "../src/lib/tokens.js";
import { createSession } from "../src/services/authService.js";
import { signedInAs, TEST_AUTH } from "./helpers/auth.js";
import { useTestDatabase } from "./helpers/database.js";

const HTTP_METHODS = ["get", "post", "put", "patch", "delete"];
const otherUser = {
  id: "22222222-2222-4222-8222-222222222222",
  email: "other@example.com",
};
const sampleIds = {
  id: "4cbd7450-6231-43eb-96a2-3be6d2b1d532",
  date: "2026-10-31",
};

function listProtectedOperations() {
  return Object.entries(buildOpenApiDocument().paths).flatMap(([path, item]) =>
    HTTP_METHODS.filter((method) => item[method]?.security).map((method) => [
      method,
      path.replace(/\{(\w+)\}/g, (_match, name) => sampleIds[name]),
    ]),
  );
}

describe("requireAuth", () => {
  const testDatabase = useTestDatabase();
  let app;
  let db;

  beforeEach(() => {
    app = createApp({ database: testDatabase.database, auth: TEST_AUTH });
    db = testDatabase.db;
  });

  async function openSession(userId = DEV_USER.id) {
    const { accessToken } = await createSession(db, {
      userId,
      deviceName: "Test runner",
      auth: TEST_AUTH,
    });
    const [session] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.userId, userId));

    return { accessToken, session };
  }

  function getSettings(authorization) {
    const call = request(app).get("/me/settings");

    return authorization ? call.set("Authorization", authorization) : call;
  }

  function expectUnauthorized(response) {
    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: {
        code: "UNAUTHORIZED",
        message: "A valid access token is required",
      },
    });
    expect(response.headers["www-authenticate"]).toBe(
      'Bearer realm="anchorly-api"',
    );
  }

  it("protects every documented data endpoint", async () => {
    const operations = listProtectedOperations();

    expect(operations.length).toBeGreaterThanOrEqual(18);

    for (const [method, path] of operations) {
      const response = await request(app)[method](path).send({});

      expect(response.status, `${method.toUpperCase()} ${path}`).toBe(401);
    }
  });

  it("rejects a request without an Authorization header", async () => {
    expectUnauthorized(await getSettings());
  });

  it("rejects headers that are not a single bearer token", async () => {
    const { accessToken } = await openSession();

    for (const header of [
      `Basic ${accessToken}`,
      "Bearer",
      "Bearer ",
      `Bearer ${accessToken} extra`,
      accessToken,
    ]) {
      expectUnauthorized(await getSettings(header));
    }
  });

  it("accepts a valid token and acts as its user", async () => {
    await db.insert(users).values(otherUser);
    await db
      .insert(userSettings)
      .values({ userId: otherUser.id, theme: "pink" });
    const { accessToken } = await openSession(otherUser.id);

    const response = await getSettings(`Bearer ${accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.theme).toBe("pink");
  });

  it("accepts the scheme name in any letter case", async () => {
    const { accessToken } = await openSession();

    expect((await getSettings(`bearer ${accessToken}`)).status).toBe(200);
  });

  it("rejects an expired access token", async () => {
    const { session } = await openSession();
    const expired = await createAccessToken(
      { userId: DEV_USER.id, sessionId: session.id },
      {
        secret: TEST_AUTH.jwtSecret,
        ttlSeconds: 900,
        now: new Date(Date.now() - 901 * 1000),
      },
    );

    expectUnauthorized(await getSettings(`Bearer ${expired}`));
  });

  it("rejects a token signed with another secret", async () => {
    const { session } = await openSession();
    const forged = await createAccessToken(
      { userId: DEV_USER.id, sessionId: session.id },
      { secret: "x".repeat(40), ttlSeconds: 900 },
    );

    expectUnauthorized(await getSettings(`Bearer ${forged}`));
  });

  it("rejects the token right after its session is revoked", async () => {
    const { accessToken, session } = await openSession();

    expect((await getSettings(`Bearer ${accessToken}`)).status).toBe(200);

    await db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(eq(sessions.id, session.id));

    expectUnauthorized(await getSettings(`Bearer ${accessToken}`));
  });

  it("rejects the token when its session has expired", async () => {
    const { accessToken, session } = await openSession();

    await db
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(sessions.id, session.id));

    expectUnauthorized(await getSettings(`Bearer ${accessToken}`));
  });

  it("answers 401 instead of failing when the account was deleted", async () => {
    const api = await signedInAs(app, db);

    await db.delete(users).where(eq(users.id, DEV_USER.id));

    const response = await api
      .post("/tasks")
      .send({ id: sampleIds.id, title: "Ghost task", order: 0 });

    expectUnauthorized(response);
  });

  it("rejects a token whose session belongs to another user", async () => {
    await db.insert(users).values(otherUser);
    const { session } = await openSession(otherUser.id);
    const mixed = await createAccessToken(
      { userId: DEV_USER.id, sessionId: session.id },
      { secret: TEST_AUTH.jwtSecret, ttlSeconds: 900 },
    );

    expectUnauthorized(await getSettings(`Bearer ${mixed}`));
  });

  it("keeps health, docs and auth endpoints public", async () => {
    expect((await request(app).get("/health")).status).toBe(200);
    expect((await request(app).get("/openapi.json")).status).toBe(200);
    expect((await request(app).get("/docs/")).status).toBe(200);
    expect((await request(app).post("/auth/login").send({})).status).toBe(400);
  });

  it("still answers unknown routes with 404", async () => {
    expect((await request(app).get("/does-not-exist")).status).toBe(404);
  });

  it("refuses to build the app without auth settings", () => {
    expect(() => createApp({ database: testDatabase.database })).toThrow(
      /auth settings/,
    );
  });
});
