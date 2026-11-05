import { eq } from "drizzle-orm";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { sessions } from "../src/db/schema/index.js";
import { createTestApp } from "./helpers/app.js";
import { useTestDatabase } from "./helpers/database.js";

const email = "ali@example.com";
const password = "correct horse battery";

describe("/me/sessions", () => {
  const testDatabase = useTestDatabase();
  let app;
  let db;

  beforeEach(() => {
    app = createTestApp({ database: testDatabase.database });
    db = testDatabase.db;
  });

  async function register() {
    const response = await request(app)
      .post("/auth/register")
      .set("X-Anchorly-Client", "mobile")
      .send({ email, password, deviceName: "Laptop" });

    return response.body;
  }

  async function login(deviceName) {
    const response = await request(app)
      .post("/auth/login")
      .set("X-Anchorly-Client", "mobile")
      .send({ email, password, deviceName });

    return response.body;
  }

  function as(accessToken) {
    return {
      get: (path) =>
        request(app).get(path).set("Authorization", `Bearer ${accessToken}`),
      delete: (path) =>
        request(app).delete(path).set("Authorization", `Bearer ${accessToken}`),
    };
  }

  function sessionIdOf(accessToken) {
    const payload = accessToken.split(".")[1];

    return JSON.parse(Buffer.from(payload, "base64url").toString()).sid;
  }

  async function readSession(id) {
    const [row] = await db.select().from(sessions).where(eq(sessions.id, id));

    return row;
  }

  function refresh(refreshToken) {
    return request(app)
      .post("/auth/refresh")
      .set("X-Anchorly-Client", "mobile")
      .send({ refreshToken });
  }

  describe("GET /me/sessions", () => {
    it("lists the active sessions with the current one first", async () => {
      const laptop = await register();
      const phone = await login("Phone");
      await as(laptop.accessToken).get("/me");

      const response = await as(phone.accessToken).get("/me/sessions");

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(2);
      expect(response.body[0]).toEqual({
        id: sessionIdOf(phone.accessToken),
        deviceName: "Phone",
        createdAt: expect.any(String),
        lastUsedAt: expect.any(String),
        expiresAt: expect.any(String),
        current: true,
      });
      expect(response.body[1]).toMatchObject({
        id: sessionIdOf(laptop.accessToken),
        deviceName: "Laptop",
        current: false,
      });
    });

    it("orders the other sessions by when they were last used", async () => {
      const first = await register();
      await login("Second");
      const third = await login("Third");
      await db
        .update(sessions)
        .set({ lastUsedAt: new Date("2026-01-01T00:00:00Z") })
        .where(eq(sessions.id, sessionIdOf(third.accessToken)));

      const response = await as(first.accessToken).get("/me/sessions");

      expect(response.body.map((session) => session.deviceName)).toEqual([
        "Laptop",
        "Second",
        "Third",
      ]);
    });

    it("leaves out signed-out and expired sessions", async () => {
      const laptop = await register();
      const signedOut = await login("Signed out");
      const expired = await login("Expired");
      await request(app)
        .post("/auth/logout")
        .set("Authorization", `Bearer ${signedOut.accessToken}`)
        .set("X-Anchorly-Client", "mobile")
        .send({ refreshToken: signedOut.refreshToken });
      await db
        .update(sessions)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(sessions.id, sessionIdOf(expired.accessToken)));

      const response = await as(laptop.accessToken).get("/me/sessions");

      expect(response.body.map((session) => session.deviceName)).toEqual([
        "Laptop",
      ]);
    });

    it("never shows token hashes", async () => {
      const laptop = await register();

      const response = await as(laptop.accessToken).get("/me/sessions");

      expect(Object.keys(response.body[0])).not.toContain("tokenHash");
      expect(JSON.stringify(response.body)).not.toMatch(/hash/i);
    });

    it("needs a signed-in user", async () => {
      const response = await request(app).get("/me/sessions");

      expect(response.status).toBe(401);
    });
  });

  describe("DELETE /me/sessions/:id", () => {
    it("signs out another device", async () => {
      const laptop = await register();
      const phone = await login("Phone");
      const phoneId = sessionIdOf(phone.accessToken);

      const response = await as(laptop.accessToken).delete(
        `/me/sessions/${phoneId}`,
      );

      expect(response.status).toBe(204);
      expect(response.headers["set-cookie"]).toBeUndefined();
      expect((await readSession(phoneId)).revokedAt).toBeInstanceOf(Date);
      expect((await as(phone.accessToken).get("/me")).status).toBe(401);
      expect((await refresh(phone.refreshToken)).status).toBe(401);
      expect((await as(laptop.accessToken).get("/me")).status).toBe(200);
    });

    it("signs out the current session and clears the refresh cookie", async () => {
      const laptop = await register();
      const laptopId = sessionIdOf(laptop.accessToken);

      const response = await as(laptop.accessToken).delete(
        `/me/sessions/${laptopId}`,
      );

      expect(response.status).toBe(204);
      expect(response.headers["set-cookie"][0]).toMatch(
        /^anchorly_refresh=;.*Expires=Thu, 01 Jan 1970/,
      );
      expect((await as(laptop.accessToken).get("/me")).status).toBe(401);
    });

    it("returns 404 for a session that is already signed out", async () => {
      const laptop = await register();
      const phone = await login("Phone");
      const phoneId = sessionIdOf(phone.accessToken);
      await as(laptop.accessToken).delete(`/me/sessions/${phoneId}`);
      const revokedAt = (await readSession(phoneId)).revokedAt;

      const response = await as(laptop.accessToken).delete(
        `/me/sessions/${phoneId}`,
      );

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("NOT_FOUND");
      expect((await readSession(phoneId)).revokedAt).toEqual(revokedAt);
    });

    it("returns 404 for an expired session", async () => {
      const laptop = await register();
      const phone = await login("Phone");
      const phoneId = sessionIdOf(phone.accessToken);
      await db
        .update(sessions)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(sessions.id, phoneId));

      const response = await as(laptop.accessToken).delete(
        `/me/sessions/${phoneId}`,
      );

      expect(response.status).toBe(404);
      expect((await readSession(phoneId)).revokedAt).toBeNull();
    });

    it("returns 404 for an unknown id", async () => {
      const laptop = await register();

      const response = await as(laptop.accessToken).delete(
        "/me/sessions/2f6a1d9e-3a0b-4c7d-9e1f-5b8a6c4d2e10",
      );

      expect(response.status).toBe(404);
    });

    it("rejects an id that is not a uuid", async () => {
      const laptop = await register();

      const response = await as(laptop.accessToken).delete(
        "/me/sessions/not-a-uuid",
      );

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("DELETE /me/sessions", () => {
    it("signs out every other device and keeps the current one", async () => {
      const laptop = await register();
      const phone = await login("Phone");
      const tablet = await login("Tablet");

      const response = await as(laptop.accessToken).delete("/me/sessions");

      expect(response.status).toBe(204);
      expect(response.headers["set-cookie"]).toBeUndefined();
      expect((await as(laptop.accessToken).get("/me")).status).toBe(200);
      expect((await as(phone.accessToken).get("/me")).status).toBe(401);
      expect((await as(tablet.accessToken).get("/me")).status).toBe(401);
      expect((await refresh(tablet.refreshToken)).status).toBe(401);
      expect((await refresh(laptop.refreshToken)).status).toBe(200);
    });

    it("does not move the sign-out time of sessions that already ended", async () => {
      const laptop = await register();
      const phone = await login("Phone");
      const phoneId = sessionIdOf(phone.accessToken);
      const earlier = new Date("2026-01-01T00:00:00Z");
      await db
        .update(sessions)
        .set({ revokedAt: earlier })
        .where(eq(sessions.id, phoneId));

      await as(laptop.accessToken).delete("/me/sessions");

      expect((await readSession(phoneId)).revokedAt).toEqual(earlier);
    });

    it("succeeds when there is no other device", async () => {
      const laptop = await register();

      const response = await as(laptop.accessToken).delete("/me/sessions");

      expect(response.status).toBe(204);
      expect(
        (await as(laptop.accessToken).get("/me/sessions")).body,
      ).toHaveLength(1);
    });
  });
});
