import { eq } from "drizzle-orm";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  emailTokens,
  sessions,
  userSettings,
  users,
} from "../src/db/schema/index.js";
import { hashToken } from "../src/lib/tokens.js";
import {
  createFailingMailer,
  createTestApp,
  readTokenFromEmail,
  settleBackgroundTasks,
  TEST_APP_URL,
} from "./helpers/app.js";
import { useTestDatabase } from "./helpers/database.js";

const email = "ali@example.com";
const password = "correct horse battery";
const newPassword = "brand new passphrase";
const HOUR_IN_MS = 60 * 60 * 1000;

describe("password reset", () => {
  const testDatabase = useTestDatabase();
  let app;
  let db;
  let registration;

  beforeEach(async () => {
    app = createTestApp({ database: testDatabase.database });
    db = testDatabase.db;
    registration = await request(app)
      .post("/auth/register")
      .set("X-Anchorly-Client", "mobile")
      .send({ email, password, displayName: "Ali" });
    app.locals.mailer.sent.length = 0;
    await db.delete(emailTokens);
  });

  async function forgot(address, targetApp = app) {
    const response = await request(targetApp)
      .post("/auth/forgot-password")
      .send({ email: address });

    await settleBackgroundTasks(targetApp);
    return response;
  }

  function reset(token, chosenPassword = newPassword) {
    return request(app)
      .post("/auth/reset-password")
      .send({ token, password: chosenPassword });
  }

  function login(chosenPassword) {
    return request(app)
      .post("/auth/login")
      .set("X-Anchorly-Client", "mobile")
      .send({ email, password: chosenPassword });
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
    expect(response.body.error.code).toBe("INVALID_EMAIL_TOKEN");
  }

  describe("POST /auth/forgot-password", () => {
    it("answers before looking up the account", async () => {
      const pending = [];
      const deferredApp = createTestApp({
        database: testDatabase.database,
        runInBackground: (task) => pending.push(task),
      });

      const response = await request(deferredApp)
        .post("/auth/forgot-password")
        .send({ email });

      expect(response.status).toBe(202);
      expect(pending).toHaveLength(1);
      expect(await db.select().from(emailTokens)).toEqual([]);
      expect(deferredApp.locals.mailer.sent).toEqual([]);

      await pending[0]();

      expect(await db.select().from(emailTokens)).toHaveLength(1);
      expect(deferredApp.locals.mailer.sent).toHaveLength(1);
    });

    it("sends a reset link that works for one hour", async () => {
      const before = Date.now();
      const response = await forgot(email);
      const [row] = await db.select().from(emailTokens);
      const [message] = app.locals.mailer.sent;

      expect(response.status).toBe(202);
      expect(response.text).toBe("");
      expect(message.to).toBe(email);
      expect(message.subject).toBe("Anchorly: parolanı sıfırla");
      expect(message.text).toContain(`${TEST_APP_URL}/reset-password#token=`);
      expect(message.text).toContain("1 saat");
      expect(row.purpose).toBe("reset_password");
      expect(row.tokenHash).toBe(hashToken(lastToken()));
      expect(row.expiresAt.getTime()).toBeGreaterThanOrEqual(
        before + HOUR_IN_MS - 1000,
      );
      expect(row.expiresAt.getTime()).toBeLessThanOrEqual(
        Date.now() + HOUR_IN_MS,
      );
    });

    it("answers an unknown email exactly like a known one and sends nothing", async () => {
      const known = await forgot(email);
      app.locals.mailer.sent.length = 0;
      await db.delete(emailTokens);

      const unknown = await forgot("nobody@example.com");

      expect(unknown.status).toBe(known.status);
      expect(unknown.text).toBe(known.text);
      expect(unknown.headers["content-length"]).toBe(
        known.headers["content-length"],
      );
      expect(app.locals.mailer.sent).toEqual([]);
      expect(await db.select().from(emailTokens)).toEqual([]);
    });

    it("finds the account with spaces and capital letters in the email", async () => {
      await forgot("  ALI@Example.com ");

      expect(app.locals.mailer.sent).toHaveLength(1);
    });

    it("keeps only the newest link working", async () => {
      await forgot(email);
      const first = lastToken();
      await forgot(email);
      const second = lastToken();

      expectInvalidToken(await reset(first));
      expect((await reset(second)).status).toBe(204);
    });

    it("writes the email in the user's language", async () => {
      await db.update(userSettings).set({ language: "en" });

      await forgot(email);

      expect(app.locals.mailer.sent[0].subject).toBe(
        "Anchorly: reset your password",
      );
    });

    it("still answers 202 when the email cannot be sent", async () => {
      const logger = { error: vi.fn(), info: vi.fn() };
      const failingApp = createTestApp({
        database: testDatabase.database,
        mailer: createFailingMailer(),
        logger,
      });

      const response = await forgot(email, failingApp);

      expect(response.status).toBe(202);
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ message: "mail server is down" }),
      );
    });

    it("rejects a malformed email", async () => {
      const response = await forgot("not-an-email");

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("POST /auth/reset-password", () => {
    async function requestToken() {
      await forgot(email);
      return lastToken();
    }

    it("sets the new password and retires the old one", async () => {
      const response = await reset(await requestToken());

      expect(response.status).toBe(204);
      expect((await login(newPassword)).status).toBe(200);
      expect((await login(password)).status).toBe(401);
    });

    it("signs the user out everywhere", async () => {
      const otherDevice = await login(password);

      await reset(await requestToken());
      expect(await db.select().from(sessions)).toHaveLength(2);
      for (const session of await db.select().from(sessions)) {
        expect(session.revokedAt).toBeInstanceOf(Date);
      }
      for (const accessToken of [
        registration.body.accessToken,
        otherDevice.body.accessToken,
      ]) {
        const settings = await request(app)
          .get("/me/settings")
          .set("Authorization", `Bearer ${accessToken}`);
        expect(settings.status).toBe(401);
      }
      const refresh = await request(app)
        .post("/auth/refresh")
        .send({ refreshToken: otherDevice.body.refreshToken });
      expect(refresh.status).toBe(401);
    });

    it("clears the refresh cookie of a web client", async () => {
      const response = await reset(await requestToken());
      const cookie = (response.headers["set-cookie"] ?? []).find((value) =>
        value.startsWith("anchorly_refresh=;"),
      );

      expect(cookie).toBeDefined();
    });

    it("marks an unverified email as verified", async () => {
      expect((await findUser()).emailVerifiedAt).toBeNull();

      await reset(await requestToken());

      expect((await findUser()).emailVerifiedAt).toBeInstanceOf(Date);
    });

    it("keeps an earlier verification time", async () => {
      const verifiedAt = new Date("2026-10-01T10:00:00Z");
      await db
        .update(users)
        .set({ emailVerifiedAt: verifiedAt })
        .where(eq(users.email, email));

      await reset(await requestToken());

      expect((await findUser()).emailVerifiedAt).toEqual(verifiedAt);
    });

    it("accepts each link only once", async () => {
      const token = await requestToken();

      expect((await reset(token)).status).toBe(204);
      expectInvalidToken(await reset(token, "another new passphrase"));
      expect((await login(newPassword)).status).toBe(200);
    });

    it("rejects an expired link", async () => {
      const token = await requestToken();
      await db
        .update(emailTokens)
        .set({ expiresAt: new Date(Date.now() - 1000) });

      expectInvalidToken(await reset(token));
      expect((await login(password)).status).toBe(200);
    });

    it("does not accept an email verification token", async () => {
      const token = await requestToken();
      await db.update(emailTokens).set({ purpose: "verify_email" });

      expectInvalidToken(await reset(token));
    });

    it("rejects a link sent to an address the account no longer uses", async () => {
      const token = await requestToken();
      await db
        .update(users)
        .set({ email: "new-address@example.com" })
        .where(eq(users.email, email));

      expectInvalidToken(await reset(token));
    });

    it("keeps the link usable when the new password is too short", async () => {
      const token = await requestToken();

      const tooShort = await reset(token, "short");

      expect(tooShort.status).toBe(400);
      expect(tooShort.body.error.details[0].path).toBe("body.password");
      expect((await reset(token)).status).toBe(204);
    });

    it("rejects a token it never issued", async () => {
      expectInvalidToken(await reset("A".repeat(43)));
    });
  });
});
