import { eq } from "drizzle-orm";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { DEV_USER } from "../src/constants/devUser.js";
import { sessions } from "../src/db/schema/index.js";
import { hashToken, verifyAccessToken } from "../src/lib/tokens.js";
import { TEST_AUTH } from "./helpers/auth.js";
import { useTestDatabase } from "./helpers/database.js";

const email = "ali@example.com";
const password = "correct horse battery";
const chromeOnWindows =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const DAY_IN_MS = 24 * 60 * 60 * 1000;

describe("POST /auth/login", () => {
  const testDatabase = useTestDatabase();
  let app;
  let db;
  let userId;

  beforeEach(async () => {
    app = createApp({ database: testDatabase.database, auth: TEST_AUTH });
    db = testDatabase.db;

    const registration = await request(app)
      .post("/auth/register")
      .send({ email, password, displayName: "Ali" });
    userId = registration.body.user.id;
    await db.delete(sessions);
  });

  function login(body, userAgent) {
    const call = request(app).post("/auth/login");

    return (
      userAgent === undefined ? call : call.set("User-Agent", userAgent)
    ).send(body);
  }

  async function listSessions() {
    return db.select().from(sessions).where(eq(sessions.userId, userId));
  }

  it("signs in and returns the user with a new pair of tokens", async () => {
    const response = await login({ email, password });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      user: {
        id: userId,
        email,
        displayName: "Ali",
        emailVerifiedAt: null,
        createdAt: expect.any(String),
      },
      accessToken: expect.any(String),
      accessTokenExpiresIn: 900,
      refreshToken: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
      refreshTokenExpiresAt: expect.any(String),
    });
  });

  it("stores the session with only the hash of the refresh token", async () => {
    const before = Date.now();
    const response = await login({ email, password });
    const [session] = await listSessions();

    expect(session.tokenHash).toBe(hashToken(response.body.refreshToken));
    expect(session.tokenHash).not.toBe(response.body.refreshToken);
    expect(session.revokedAt).toBeNull();
    expect(session.expiresAt.getTime()).toBeGreaterThanOrEqual(
      before + 30 * DAY_IN_MS - 1000,
    );
    expect(session.expiresAt.getTime()).toBeLessThanOrEqual(
      Date.now() + 30 * DAY_IN_MS,
    );
    expect(new Date(response.body.refreshTokenExpiresAt).getTime()).toBe(
      session.expiresAt.getTime(),
    );
  });

  it("issues an access token for this user and this session", async () => {
    const response = await login({ email, password });
    const [session] = await listSessions();

    await expect(
      verifyAccessToken(response.body.accessToken, {
        secret: TEST_AUTH.jwtSecret,
      }),
    ).resolves.toEqual({ userId, sessionId: session.id });
  });

  it("opens a separate session for every sign-in", async () => {
    const first = await login({ email, password });
    const second = await login({ email, password });

    expect(first.body.refreshToken).not.toBe(second.body.refreshToken);
    expect(await listSessions()).toHaveLength(2);
  });

  it("accepts the email with spaces and in any letter case", async () => {
    const response = await login({ email: "  ALI@Example.com ", password });

    expect(response.status).toBe(200);
    expect(response.body.user.id).toBe(userId);
  });

  it("names the device from the user agent", async () => {
    await login({ email, password }, chromeOnWindows);

    const [session] = await listSessions();
    expect(session.deviceName).toBe("Chrome · Windows");
  });

  it("prefers the device name sent by the client and trims it", async () => {
    await login(
      { email, password, deviceName: "  Pixel 7  " },
      chromeOnWindows,
    );

    const [session] = await listSessions();
    expect(session.deviceName).toBe("Pixel 7");
  });

  it("leaves the device name empty for unknown clients", async () => {
    await login({ email, password }, "curl/8.4.0");

    const [session] = await listSessions();
    expect(session.deviceName).toBeNull();
  });

  it("rejects a wrong password without opening a session", async () => {
    const response = await login({ email, password: "wrong password" });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: {
        code: "INVALID_CREDENTIALS",
        message: "The email or password is incorrect",
      },
    });
    expect(await listSessions()).toEqual([]);
  });

  it("gives the same answer for an unknown email as for a wrong password", async () => {
    const unknown = await login({ email: "nobody@example.com", password });
    const wrong = await login({ email, password: "wrong password" });

    expect(unknown.status).toBe(wrong.status);
    expect(unknown.body).toEqual(wrong.body);
    expect(await db.select().from(sessions)).toEqual([]);
  });

  it("rejects an account that has no password", async () => {
    const response = await login({ email: DEV_USER.email, password });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("rejects a missing password, a malformed email or extra fields", async () => {
    const missingPassword = await login({ email });
    const malformedEmail = await login({ email: "not-an-email", password });
    const tooLong = await login({ email, password: "x".repeat(129) });
    const extraField = await login({ email, password, remember: true });
    const longDeviceName = await login({
      email,
      password,
      deviceName: "x".repeat(101),
    });

    for (const response of [
      missingPassword,
      malformedEmail,
      tooLong,
      extraField,
      longDeviceName,
    ]) {
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    }
    expect(await listSessions()).toEqual([]);
  });
});
