import { and, eq, isNull, sql } from "drizzle-orm";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { emailTokens, users } from "../src/db/schema/index.js";
import {
  createFailingMailer,
  createMemoryMailer,
  createTestApp,
  readTokenFromEmail,
  settleBackgroundTasks,
} from "./helpers/app.js";
import { useTestDatabase } from "./helpers/database.js";

const email = "ali@example.com";
const newEmail = "ali.new@example.com";
const password = "correct horse battery";

describe("email change", () => {
  const testDatabase = useTestDatabase();
  let app;
  let accessToken;

  function appWith(overrides = {}) {
    return createTestApp({ database: testDatabase.database, ...overrides });
  }

  async function register(targetApp, address = email) {
    const response = await request(targetApp)
      .post("/auth/register")
      .set("X-Anchorly-Client", "mobile")
      .send({
        email: address,
        password,
        displayName: "Ali",
        acceptTerms: true,
      });

    targetApp.locals.mailer.sent.length = 0;
    return response.body;
  }

  function requestChange(body, token = accessToken, targetApp = app) {
    return request(targetApp)
      .post("/me/email")
      .set("Authorization", `Bearer ${token}`)
      .send({ newEmail, password, ...body });
  }

  function confirm(token, targetApp = app) {
    return request(targetApp)
      .post("/auth/confirm-email-change")
      .send({ token });
  }

  function login(address, targetApp = app) {
    return request(targetApp)
      .post("/auth/login")
      .set("X-Anchorly-Client", "mobile")
      .send({ email: address, password });
  }

  async function findUser(userId) {
    const [user] = await testDatabase.db
      .select()
      .from(users)
      .where(eq(users.id, userId));

    return user;
  }

  async function requestLink(targetApp = app) {
    const response = await requestChange({}, accessToken, targetApp);

    expect(response.status).toBe(202);
    return readTokenFromEmail(targetApp.locals.mailer.sent.at(-1));
  }

  beforeEach(async () => {
    app = appWith();
    ({ accessToken } = await register(app));
  });

  describe("asking for a change", () => {
    it("sends a link to the new address and keeps the old one for now", async () => {
      const response = await requestChange({});

      expect(response.status).toBe(202);
      expect(response.body).toEqual({ pendingEmail: newEmail });
      expect(app.locals.mailer.sent).toHaveLength(1);
      expect(app.locals.mailer.sent[0].to).toBe(newEmail);
      expect(app.locals.mailer.sent[0].text).toContain("/confirm-email#token=");
      expect((await login(email)).status).toBe(200);
      expect((await login(newEmail)).status).toBe(401);
    });

    it("lets a user who never verified the first address ask", async () => {
      const me = await request(app)
        .get("/me")
        .set("Authorization", `Bearer ${accessToken}`);

      expect(me.body.user.emailVerifiedAt).toBeNull();
      expect((await requestChange({})).status).toBe(202);
    });

    it("stores the new address in lower case", async () => {
      await requestChange({ newEmail: "  Ali.NEW@Example.com " });

      expect(app.locals.mailer.sent[0].to).toBe(newEmail);
    });

    it("needs the current password", async () => {
      const response = await requestChange({ password: "wrong password" });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("INVALID_CURRENT_PASSWORD");
      expect(app.locals.mailer.sent).toHaveLength(0);
    });

    it("refuses the current address", async () => {
      const response = await requestChange({ newEmail: "ALI@example.com" });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("EMAIL_UNCHANGED");
      expect(app.locals.mailer.sent).toHaveLength(0);
    });

    it("refuses an address another account uses", async () => {
      await register(app, newEmail);

      const response = await requestChange({});

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("EMAIL_TAKEN");
      expect(app.locals.mailer.sent).toHaveLength(0);
    });

    it("checks the password before telling whether an address is taken", async () => {
      await register(app, newEmail);

      const response = await requestChange({ password: "wrong password" });

      expect(response.body.error.code).toBe("INVALID_CURRENT_PASSWORD");
    });

    it("reports when the email cannot be sent", async () => {
      const failingApp = appWith({ mailer: createFailingMailer() });

      const response = await requestChange({}, accessToken, failingApp);

      expect(response.status).toBe(503);
      expect(response.body.error.code).toBe("EMAIL_NOT_SENT");
    });

    it("replaces an earlier link with the newest one", async () => {
      const first = await requestLink();
      const second = await requestLink();

      expect((await confirm(first)).status).toBe(400);
      expect((await confirm(second)).status).toBe(200);
    });

    it("needs a signed-in user", async () => {
      const response = await request(app)
        .post("/me/email")
        .send({ newEmail, password });

      expect(response.status).toBe(401);
    });
  });

  describe("confirming the change", () => {
    it("switches the address, marks it verified and tells the old address", async () => {
      const token = await requestLink();
      app.locals.mailer.sent.length = 0;

      const response = await confirm(token);
      await settleBackgroundTasks(app);

      expect(response.status).toBe(200);
      expect(response.body.user.email).toBe(newEmail);
      expect(response.body.user.emailVerifiedAt).not.toBeNull();
      expect(app.locals.mailer.sent).toHaveLength(1);
      expect(app.locals.mailer.sent[0].to).toBe(email);
      expect(app.locals.mailer.sent[0].text).toContain(newEmail);
      expect((await login(newEmail)).status).toBe(200);
      expect((await login(email)).status).toBe(401);
    });

    it("keeps every session signed in", async () => {
      const other = (await login(email)).body;
      const token = await requestLink();

      await confirm(token);

      const me = await request(app)
        .get("/me")
        .set("Authorization", `Bearer ${other.accessToken}`);
      const refreshed = await request(app)
        .post("/auth/refresh")
        .set("X-Anchorly-Client", "mobile")
        .send({ refreshToken: other.refreshToken });

      expect(me.status).toBe(200);
      expect(me.body.user.email).toBe(newEmail);
      expect(refreshed.status).toBe(200);
    });

    it("works only once", async () => {
      const token = await requestLink();

      expect((await confirm(token)).status).toBe(200);
      const again = await confirm(token);

      expect(again.status).toBe(400);
      expect(again.body.error.code).toBe("INVALID_EMAIL_TOKEN");
    });

    it("refuses an expired link", async () => {
      const token = await requestLink();
      await testDatabase.db
        .update(emailTokens)
        .set({ expiresAt: sql`now() - interval '1 second'` });

      const response = await confirm(token);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("INVALID_EMAIL_TOKEN");
    });

    it("refuses a verification or reset token", async () => {
      await request(app)
        .post("/auth/resend-verification")
        .set("Authorization", `Bearer ${accessToken}`);
      const verificationToken = readTokenFromEmail(
        app.locals.mailer.sent.at(-1),
      );

      const response = await confirm(verificationToken);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("INVALID_EMAIL_TOKEN");
    });

    it("keeps the address when another account took it in the meantime", async () => {
      const token = await requestLink();
      const userId = (await login(email)).body.user.id;
      await register(app, newEmail);

      const response = await confirm(token);

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("EMAIL_TAKEN");
      expect((await findUser(userId)).email).toBe(email);
    });

    it("drops open verification links for the old address", async () => {
      await request(app)
        .post("/auth/resend-verification")
        .set("Authorization", `Bearer ${accessToken}`);
      const userId = (await login(email)).body.user.id;
      const token = await requestLink();

      await confirm(token);

      const open = await testDatabase.db
        .select()
        .from(emailTokens)
        .where(
          and(
            eq(emailTokens.userId, userId),
            eq(emailTokens.purpose, "verify_email"),
            isNull(emailTokens.usedAt),
          ),
        );

      expect(open).toEqual([]);
    });

    it("still changes the address when the notice cannot be sent", async () => {
      const mailer = createMemoryMailer();
      const flakyApp = appWith({
        mailer: {
          sent: mailer.sent,
          async send(message) {
            if (message.to === email) {
              throw new Error("mail server is down");
            }

            await mailer.send(message);
          },
        },
      });
      const token = await requestLink(flakyApp);

      const response = await confirm(token, flakyApp);
      await settleBackgroundTasks(flakyApp);

      expect(response.status).toBe(200);
      expect((await login(newEmail, flakyApp)).status).toBe(200);
    });
  });
});
