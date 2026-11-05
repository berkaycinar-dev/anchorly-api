import { eq } from "drizzle-orm";
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { emailTokens, userSettings, users } from "../src/db/schema/index.js";
import { hashToken } from "../src/lib/tokens.js";
import { createErrorHandler } from "../src/middleware/errorHandlers.js";
import { createRequireVerifiedEmail } from "../src/middleware/requireVerifiedEmail.js";
import {
  createFailingMailer,
  createTestApp,
  readTokenFromEmail,
  TEST_APP_URL,
} from "./helpers/app.js";
import { useTestDatabase } from "./helpers/database.js";

const email = "ali@example.com";
const password = "correct horse battery";
const HOUR_IN_MS = 60 * 60 * 1000;

describe("email verification", () => {
  const testDatabase = useTestDatabase();
  let app;
  let db;

  beforeEach(() => {
    app = createTestApp({ database: testDatabase.database });
    db = testDatabase.db;
  });

  function register(body = {}, targetApp = app) {
    return request(targetApp)
      .post("/auth/register")
      .set("X-Anchorly-Client", "mobile")
      .send({ email, password, displayName: "Ali", ...body });
  }

  function verify(token) {
    return request(app).post("/auth/verify-email").send({ token });
  }

  function lastToken() {
    return readTokenFromEmail(app.locals.mailer.sent.at(-1));
  }

  async function findUser() {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  function expectInvalidToken(response) {
    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: {
        code: "INVALID_EMAIL_TOKEN",
        message: "The link is invalid, expired or already used",
      },
    });
  }

  describe("on registration", () => {
    it("sends one verification email with a link to the frontend", async () => {
      await register();

      expect(app.locals.mailer.sent).toHaveLength(1);
      const [message] = app.locals.mailer.sent;
      expect(message.to).toBe(email);
      expect(message.subject).toBe("Anchorly: e-posta adresini doğrula");
      expect(message.text).toContain("Merhaba Ali,");
      expect(message.text).toContain(`${TEST_APP_URL}/verify-email#token=`);
      expect(lastToken()).toMatch(/^[A-Za-z0-9_-]{43}$/);
    });

    it("stores only the hash of the token, valid for 24 hours", async () => {
      const before = Date.now();
      await register();
      const [row] = await db.select().from(emailTokens);

      expect(row.purpose).toBe("verify_email");
      expect(row.email).toBe(email);
      expect(row.tokenHash).toBe(hashToken(lastToken()));
      expect(row.usedAt).toBeNull();
      expect(row.expiresAt.getTime()).toBeGreaterThanOrEqual(
        before + 24 * HOUR_IN_MS - 1000,
      );
      expect(row.expiresAt.getTime()).toBeLessThanOrEqual(
        Date.now() + 24 * HOUR_IN_MS,
      );
    });

    it("writes the email and stores the settings in the chosen language", async () => {
      const response = await register({ language: "en" });
      const [settings] = await db
        .select()
        .from(userSettings)
        .where(eq(userSettings.userId, response.body.user.id));

      expect(settings.language).toBe("en");
      expect(app.locals.mailer.sent[0].subject).toBe(
        "Anchorly: verify your email address",
      );
    });

    it("still creates the account when the email cannot be sent", async () => {
      const logger = { error: vi.fn(), info: vi.fn() };
      const failingApp = createTestApp({
        database: testDatabase.database,
        mailer: createFailingMailer(),
        logger,
      });

      const response = await register({}, failingApp);

      expect(response.status).toBe(201);
      expect(response.body.accessToken).toEqual(expect.any(String));
      expect(await findUser()).toBeDefined();
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ message: "mail server is down" }),
      );
    });

    it("rejects an unknown language", async () => {
      expect((await register({ language: "de" })).status).toBe(400);
    });
  });

  describe("POST /auth/verify-email", () => {
    it("marks the email as verified and returns the user", async () => {
      await register();

      const response = await verify(lastToken());
      const user = await findUser();

      expect(response.status).toBe(200);
      expect(response.body.user.email).toBe(email);
      expect(new Date(response.body.user.emailVerifiedAt).getTime()).toBe(
        user.emailVerifiedAt.getTime(),
      );
      expect((await db.select().from(emailTokens))[0].usedAt).toBeInstanceOf(
        Date,
      );
    });

    it("accepts each link only once", async () => {
      await register();
      const token = lastToken();

      expect((await verify(token)).status).toBe(200);
      expectInvalidToken(await verify(token));
    });

    it("rejects an expired link", async () => {
      await register();
      await db
        .update(emailTokens)
        .set({ expiresAt: new Date(Date.now() - 1000) });

      expectInvalidToken(await verify(lastToken()));
      expect((await findUser()).emailVerifiedAt).toBeNull();
    });

    it("rejects a token it never issued", async () => {
      await register();

      expectInvalidToken(await verify("A".repeat(43)));
    });

    it("does not accept a password reset token", async () => {
      await register();
      await db.update(emailTokens).set({ purpose: "reset_password" });

      expectInvalidToken(await verify(lastToken()));
    });

    it("rejects a link sent to an address the account no longer uses", async () => {
      await register();
      await db
        .update(users)
        .set({ email: "new-address@example.com" })
        .where(eq(users.email, email));

      expectInvalidToken(await verify(lastToken()));
    });

    it("keeps the first verification time when verified again", async () => {
      const registration = await register();
      await verify(lastToken());
      const firstTime = (await findUser()).emailVerifiedAt;
      await db.insert(emailTokens).values({
        userId: registration.body.user.id,
        purpose: "verify_email",
        tokenHash: hashToken("second-link-token"),
        email,
        expiresAt: new Date(Date.now() + HOUR_IN_MS),
      });

      const response = await verify("second-link-token");

      expect(response.status).toBe(200);
      expect((await findUser()).emailVerifiedAt).toEqual(firstTime);
    });

    it("rejects a missing or empty token", async () => {
      for (const body of [{}, { token: "" }, { token: "x", extra: true }]) {
        const response = await request(app)
          .post("/auth/verify-email")
          .send(body);

        expect(response.status).toBe(400);
        expect(response.body.error.code).toBe("VALIDATION_ERROR");
      }
    });
  });

  describe("POST /auth/resend-verification", () => {
    async function registerAndGetAccessToken(targetApp = app) {
      const response = await register({}, targetApp);

      return response.body.accessToken;
    }

    function resend(accessToken, targetApp = app) {
      return request(targetApp)
        .post("/auth/resend-verification")
        .set("Authorization", `Bearer ${accessToken}`);
    }

    it("sends a new link and makes the old one stop working", async () => {
      const accessToken = await registerAndGetAccessToken();
      const oldToken = lastToken();

      const response = await resend(accessToken);
      const newToken = lastToken();

      expect(response.status).toBe(204);
      expect(app.locals.mailer.sent).toHaveLength(2);
      expect(newToken).not.toBe(oldToken);
      expect(await db.select().from(emailTokens)).toHaveLength(1);
      expectInvalidToken(await verify(oldToken));
      expect((await verify(newToken)).status).toBe(200);
    });

    it("uses the language from the user's settings", async () => {
      const accessToken = await registerAndGetAccessToken();
      await db.update(userSettings).set({ language: "en" });

      await resend(accessToken);

      expect(app.locals.mailer.sent.at(-1).subject).toBe(
        "Anchorly: verify your email address",
      );
    });

    it("refuses when the email is already verified", async () => {
      const accessToken = await registerAndGetAccessToken();
      await verify(lastToken());

      const response = await resend(accessToken);

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("EMAIL_ALREADY_VERIFIED");
      expect(app.locals.mailer.sent).toHaveLength(1);
    });

    it("reports when the email cannot be sent", async () => {
      const logger = { error: vi.fn(), info: vi.fn() };
      const failingApp = createTestApp({
        database: testDatabase.database,
        mailer: createFailingMailer(),
        logger,
      });
      const accessToken = await registerAndGetAccessToken(failingApp);
      logger.error.mockClear();

      const response = await resend(accessToken, failingApp);

      expect(response.status).toBe(503);
      expect(response.body.error.code).toBe("EMAIL_NOT_SENT");
      expect(logger.error).toHaveBeenCalledTimes(1);
    });

    it("requires an access token", async () => {
      const response = await request(app).post("/auth/resend-verification");

      expect(response.status).toBe(401);
    });
  });

  describe("requireVerifiedEmail", () => {
    function createGuardedApp(userId) {
      const guarded = express();

      guarded.get(
        "/secret",
        (request, response, next) => {
          request.user = { id: userId };
          next();
        },
        createRequireVerifiedEmail({ db }),
        (request, response) => {
          response.json({ ok: true });
        },
      );
      guarded.use(createErrorHandler({ logger: { error() {} } }));

      return guarded;
    }

    it("blocks a user whose email is not verified", async () => {
      const registration = await register();

      const response = await request(
        createGuardedApp(registration.body.user.id),
      ).get("/secret");

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("EMAIL_NOT_VERIFIED");
    });

    it("lets a verified user through", async () => {
      const registration = await register();
      await verify(lastToken());

      const response = await request(
        createGuardedApp(registration.body.user.id),
      ).get("/secret");

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ ok: true });
    });
  });
});
