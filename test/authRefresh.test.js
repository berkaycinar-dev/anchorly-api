import { eq } from "drizzle-orm";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { sessions, users } from "../src/db/schema/index.js";
import { hashToken, verifyAccessToken } from "../src/lib/tokens.js";
import { refreshSession } from "../src/services/authService.js";
import { TEST_AUTH } from "./helpers/auth.js";
import { useTestDatabase } from "./helpers/database.js";

const email = "ali@example.com";
const password = "correct horse battery";
const DAY_IN_MS = 24 * 60 * 60 * 1000;

describe("auth sessions", () => {
  const testDatabase = useTestDatabase();
  let app;
  let db;
  let signIn;

  beforeEach(async () => {
    app = createApp({ database: testDatabase.database, auth: TEST_AUTH });
    db = testDatabase.db;

    await request(app).post("/auth/register").send({ email, password });
    await db.delete(sessions);

    signIn = async () =>
      (await request(app).post("/auth/login").send({ email, password })).body;
  });

  function refresh(refreshToken) {
    return request(app).post("/auth/refresh").send({ refreshToken });
  }

  function getSettings(accessToken) {
    return request(app)
      .get("/me/settings")
      .set("Authorization", `Bearer ${accessToken}`);
  }

  async function readSession(refreshToken) {
    const [session] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.tokenHash, hashToken(refreshToken)));

    return session;
  }

  async function updateOnlySession(values) {
    await db.update(sessions).set(values);
  }

  async function onlySession() {
    const rows = await db.select().from(sessions);

    expect(rows).toHaveLength(1);
    return rows[0];
  }

  function expectInvalidRefreshToken(response) {
    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: {
        code: "INVALID_REFRESH_TOKEN",
        message: "The refresh token is invalid, expired or revoked",
      },
    });
  }

  describe("POST /auth/refresh", () => {
    it("returns the user with a new pair of tokens for the same session", async () => {
      const login = await signIn();
      const session = await onlySession();

      const response = await refresh(login.refreshToken);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        user: expect.objectContaining({ id: login.user.id, email }),
        accessToken: expect.any(String),
        accessTokenExpiresIn: 900,
        refreshToken: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
        refreshTokenExpiresAt: expect.any(String),
      });
      expect(response.body.refreshToken).not.toBe(login.refreshToken);
      await expect(
        verifyAccessToken(response.body.accessToken, {
          secret: TEST_AUTH.jwtSecret,
        }),
      ).resolves.toEqual({ userId: login.user.id, sessionId: session.id });
      expect((await getSettings(response.body.accessToken)).status).toBe(200);
    });

    it("rotates the stored hashes and records the time of use", async () => {
      const login = await signIn();
      const before = await onlySession();

      const response = await refresh(login.refreshToken);
      const after = await onlySession();

      expect(after.id).toBe(before.id);
      expect(after.tokenHash).toBe(hashToken(response.body.refreshToken));
      expect(after.previousTokenHash).toBe(hashToken(login.refreshToken));
      expect(after.rotatedAt).toBeInstanceOf(Date);
      expect(after.lastUsedAt.getTime()).toBeGreaterThanOrEqual(
        before.lastUsedAt.getTime(),
      );
    });

    it("extends the session by the full lifetime on every refresh", async () => {
      const login = await signIn();
      await updateOnlySession({ expiresAt: new Date(Date.now() + DAY_IN_MS) });

      const response = await refresh(login.refreshToken);
      const session = await onlySession();

      expect(session.expiresAt.getTime()).toBeGreaterThan(
        Date.now() + 29 * DAY_IN_MS,
      );
      expect(new Date(response.body.refreshTokenExpiresAt).getTime()).toBe(
        session.expiresAt.getTime(),
      );
    });

    it("keeps working along a chain of refreshes", async () => {
      let { refreshToken } = await signIn();

      for (let step = 0; step < 3; step += 1) {
        const response = await refresh(refreshToken);

        expect(response.status, `step ${step}`).toBe(200);
        refreshToken = response.body.refreshToken;
      }

      expect((await onlySession()).revokedAt).toBeNull();
    });

    it("lets the previous token retry within the grace period", async () => {
      const login = await signIn();
      const first = await refresh(login.refreshToken);
      const rotatedAt = (await onlySession()).rotatedAt;

      const retry = await refresh(login.refreshToken);
      const session = await onlySession();

      expect(retry.status).toBe(200);
      expect(retry.body.refreshToken).not.toBe(first.body.refreshToken);
      expect(session.revokedAt).toBeNull();
      expect(session.rotatedAt).toEqual(rotatedAt);
      expectInvalidRefreshToken(await refresh(first.body.refreshToken));
      expect((await onlySession()).revokedAt).toBeNull();
      expect((await refresh(retry.body.refreshToken)).status).toBe(200);
    });

    it("revokes the whole session when an old token comes back later", async () => {
      const login = await signIn();
      const rotated = await refresh(login.refreshToken);
      await updateOnlySession({ rotatedAt: new Date(Date.now() - 31 * 1000) });

      const reuse = await refresh(login.refreshToken);

      expectInvalidRefreshToken(reuse);
      expect((await onlySession()).revokedAt).toBeInstanceOf(Date);
      expectInvalidRefreshToken(await refresh(rotated.body.refreshToken));
      expect((await getSettings(rotated.body.accessToken)).status).toBe(401);
    });

    it("draws the grace period line at exactly 30 seconds", async () => {
      const start = new Date("2026-10-31T12:00:00Z");
      const firstLogin = await signIn();
      const secondLogin = await signIn();

      await refreshSession(db, {
        refreshToken: firstLogin.refreshToken,
        auth: TEST_AUTH,
        now: start,
      });
      await refreshSession(db, {
        refreshToken: secondLogin.refreshToken,
        auth: TEST_AUTH,
        now: start,
      });

      await expect(
        refreshSession(db, {
          refreshToken: firstLogin.refreshToken,
          auth: TEST_AUTH,
          now: new Date(start.getTime() + 30_000),
        }),
      ).resolves.toHaveProperty("refreshToken");
      await expect(
        refreshSession(db, {
          refreshToken: secondLogin.refreshToken,
          auth: TEST_AUTH,
          now: new Date(start.getTime() + 30_001),
        }),
      ).rejects.toMatchObject({ code: "INVALID_REFRESH_TOKEN" });
    });

    it("rejects a token it has never issued without touching sessions", async () => {
      await signIn();
      const before = await onlySession();

      expectInvalidRefreshToken(await refresh("Aa".repeat(21) + "A"));
      expect(await onlySession()).toEqual(before);
    });

    it("rejects the token of a revoked session", async () => {
      const login = await signIn();
      await updateOnlySession({ revokedAt: new Date() });

      expectInvalidRefreshToken(await refresh(login.refreshToken));
    });

    it("rejects the token of an expired session", async () => {
      const login = await signIn();
      await updateOnlySession({ expiresAt: new Date(Date.now() - 1000) });

      expectInvalidRefreshToken(await refresh(login.refreshToken));
    });

    it("rejects the token after the account is deleted", async () => {
      const login = await signIn();
      await db.delete(users).where(eq(users.email, email));

      expectInvalidRefreshToken(await refresh(login.refreshToken));
    });

    it("gives one working token when the same token is sent twice at once", async () => {
      const login = await signIn();

      const responses = await Promise.all([
        refresh(login.refreshToken),
        refresh(login.refreshToken),
      ]);
      const session = await onlySession();
      const working = responses.filter(
        (response) =>
          session.tokenHash === hashToken(response.body.refreshToken),
      );

      expect(responses.map((response) => response.status)).toEqual([200, 200]);
      expect(working).toHaveLength(1);
      expect(session.revokedAt).toBeNull();
    });

    it("rejects a missing token or extra fields", async () => {
      for (const body of [
        {},
        { refreshToken: "" },
        { refreshToken: "x", userId: "me" },
      ]) {
        const response = await request(app).post("/auth/refresh").send(body);

        expect(response.status).toBe(400);
        expect(response.body.error.code).toBe("VALIDATION_ERROR");
      }
    });

    it("does not need an access token", async () => {
      const login = await signIn();

      const response = await request(app)
        .post("/auth/refresh")
        .set("Authorization", "Bearer not-a-token")
        .send({ refreshToken: login.refreshToken });

      expect(response.status).toBe(200);
    });
  });

  describe("POST /auth/logout", () => {
    it("closes the current session and stops both of its tokens", async () => {
      const login = await signIn();

      const response = await request(app)
        .post("/auth/logout")
        .set("Authorization", `Bearer ${login.accessToken}`);

      expect(response.status).toBe(204);
      expect(response.text).toBe("");
      expect((await onlySession()).revokedAt).toBeInstanceOf(Date);
      expect((await getSettings(login.accessToken)).status).toBe(401);
      expectInvalidRefreshToken(await refresh(login.refreshToken));
    });

    it("leaves the user's other sessions signed in", async () => {
      const phone = await signIn();
      const laptop = await signIn();

      await request(app)
        .post("/auth/logout")
        .set("Authorization", `Bearer ${phone.accessToken}`);

      expect((await getSettings(laptop.accessToken)).status).toBe(200);
      expect((await readSession(laptop.refreshToken)).revokedAt).toBeNull();
      expect((await refresh(laptop.refreshToken)).status).toBe(200);
    });

    it("requires an access token", async () => {
      const response = await request(app).post("/auth/logout");

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe("UNAUTHORIZED");
    });
  });
});
