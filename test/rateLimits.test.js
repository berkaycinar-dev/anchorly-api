import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { RATE_LIMITS } from "../src/constants/rateLimits.js";
import { buildOpenApiDocument } from "../src/docs/openapi.js";
import { TEST_AUTH } from "./helpers/auth.js";
import {
  createMemoryMailer,
  createTestApp,
  TEST_APP_URL,
  readTokenFromEmail,
  settleBackgroundTasks,
} from "./helpers/app.js";
import { useTestDatabase } from "./helpers/database.js";

const password = "correct horse battery";
const newPassword = "brand new passphrase";
const twoPerMinute = { windowMs: 60 * 1000, limit: 2 };

describe("rate limits", () => {
  const testDatabase = useTestDatabase();

  function appWith(rateLimits) {
    return createTestApp({ database: testDatabase.database, rateLimits });
  }

  async function register(app, email) {
    const response = await request(app)
      .post("/auth/register")
      .set("X-Anchorly-Client", "mobile")
      .send({ email, password });

    return response.body;
  }

  function login(app, email, chosenPassword = password) {
    return request(app)
      .post("/auth/login")
      .set("X-Anchorly-Client", "mobile")
      .send({ email, password: chosenPassword });
  }

  async function statuses(count, send) {
    const result = [];

    for (let index = 0; index < count; index += 1) {
      result.push((await send(index)).status);
    }

    return result;
  }

  function expectTooManyRequests(response, policy) {
    expect(response.status).toBe(429);
    expect(response.body).toEqual({
      error: {
        code: "TOO_MANY_REQUESTS",
        message: "Too many requests, try again later",
      },
    });
    expect(Number(response.headers["retry-after"])).toBeGreaterThan(0);
    expect(response.headers["ratelimit-policy"]).toContain(`"${policy}"`);
  }

  it("is off in tests unless a rule is given", async () => {
    const app = createTestApp({ database: testDatabase.database });
    await register(app, "ali@example.com");

    expect(
      await statuses(15, () => login(app, "ali@example.com", "wrong password")),
    ).toEqual(Array(15).fill(401));
  });

  it("uses the rules from decision 11 by default", async () => {
    expect(RATE_LIMITS).toEqual({
      loginByIp: { windowMs: 15 * 60 * 1000, limit: 10 },
      loginByEmail: { windowMs: 15 * 60 * 1000, limit: 10 },
      register: { windowMs: 60 * 60 * 1000, limit: 5 },
      refresh: { windowMs: 15 * 60 * 1000, limit: 60 },
      verifyEmail: { windowMs: 15 * 60 * 1000, limit: 10 },
      resendVerification: { windowMs: 60 * 60 * 1000, limit: 5 },
      forgotPasswordByIp: { windowMs: 60 * 60 * 1000, limit: 5 },
      forgotPasswordByEmail: { windowMs: 60 * 60 * 1000, limit: 3 },
      resetPassword: { windowMs: 15 * 60 * 1000, limit: 10 },
      passwordCheck: { windowMs: 15 * 60 * 1000, limit: 10 },
    });

    const app = createApp({
      database: testDatabase.database,
      auth: TEST_AUTH,
      mailer: createMemoryMailer(),
      appUrl: TEST_APP_URL,
      logger: { error() {}, info() {} },
    });
    const results = await statuses(11, (index) =>
      login(app, `user${index}@example.com`, "wrong password"),
    );

    expect(results).toEqual([...Array(10).fill(401), 429]);
  });

  describe("POST /auth/login", () => {
    it("limits attempts from one address whatever the email", async () => {
      const app = appWith({ loginByIp: twoPerMinute });
      await register(app, "ali@example.com");
      await login(app, "first@example.com", "wrong password");
      await login(app, "second@example.com", "wrong password");

      const response = await login(app, "ali@example.com");

      expectTooManyRequests(response, "loginByIp");
      expect(response.body.accessToken).toBeUndefined();
    });

    it("counts requests that fail validation", async () => {
      const app = appWith({ loginByIp: twoPerMinute });

      const results = await statuses(3, () =>
        request(app).post("/auth/login").send({ email: "not-an-email" }),
      );

      expect(results).toEqual([400, 400, 429]);
    });

    it("limits failed attempts for one email", async () => {
      const app = appWith({ loginByEmail: twoPerMinute });
      await register(app, "ali@example.com");
      await register(app, "veli@example.com");
      await login(app, "ali@example.com", "wrong password");
      await login(app, "ALI@example.com ", "wrong password");

      expectTooManyRequests(
        await login(app, "ali@example.com"),
        "loginByEmail",
      );
      expect((await login(app, "veli@example.com")).status).toBe(200);
    });

    it("forgets earlier failures after a successful sign-in", async () => {
      const app = appWith({ loginByEmail: twoPerMinute });
      await register(app, "ali@example.com");

      const results = await statuses(4, (index) =>
        login(
          app,
          "ali@example.com",
          index === 1 ? password : "wrong password",
        ),
      );

      expect(results).toEqual([401, 200, 401, 401]);
      expect((await login(app, "ali@example.com")).status).toBe(429);
    });
  });

  it("limits sign-ups", async () => {
    const app = appWith({ register: twoPerMinute });

    const results = await statuses(3, (index) =>
      request(app)
        .post("/auth/register")
        .set("X-Anchorly-Client", "mobile")
        .send({ email: `user${index}@example.com`, password }),
    );

    expect(results).toEqual([201, 201, 429]);
  });

  it("limits refresh requests", async () => {
    const app = appWith({ refresh: twoPerMinute });

    const results = await statuses(3, () =>
      request(app)
        .post("/auth/refresh")
        .set("X-Anchorly-Client", "mobile")
        .send({ refreshToken: "a".repeat(43) }),
    );

    expect(results).toEqual([401, 401, 429]);
  });

  it("limits email verification attempts", async () => {
    const app = appWith({ verifyEmail: twoPerMinute });

    const results = await statuses(3, () =>
      request(app)
        .post("/auth/verify-email")
        .send({ token: "a".repeat(43) }),
    );

    expect(results.at(-1)).toBe(429);
    expect(results.slice(0, 2)).not.toContain(429);
  });

  it("limits password reset attempts", async () => {
    const app = appWith({ resetPassword: twoPerMinute });

    const results = await statuses(3, () =>
      request(app)
        .post("/auth/reset-password")
        .send({ token: "a".repeat(43), password: newPassword }),
    );

    expect(results.at(-1)).toBe(429);
    expect(results.slice(0, 2)).not.toContain(429);
  });

  it("limits verification emails per user", async () => {
    const app = appWith({ resendVerification: twoPerMinute });
    const ali = await register(app, "ali@example.com");
    const veli = await register(app, "veli@example.com");
    const resend = (session) =>
      request(app)
        .post("/auth/resend-verification")
        .set("Authorization", `Bearer ${session.accessToken}`);

    const results = await statuses(3, () => resend(ali));

    expect(results).toEqual([204, 204, 429]);
    expect((await resend(veli)).status).toBe(204);
  });

  describe("POST /auth/forgot-password", () => {
    function forgot(app, email) {
      return request(app).post("/auth/forgot-password").send({ email });
    }

    it("limits requests from one address", async () => {
      const app = appWith({ forgotPasswordByIp: twoPerMinute });

      const results = await statuses(3, (index) =>
        forgot(app, `user${index}@example.com`),
      );

      expect(results).toEqual([202, 202, 429]);
    });

    it("stops sending emails to one address without telling the caller", async () => {
      const app = appWith({ forgotPasswordByEmail: twoPerMinute });
      await register(app, "ali@example.com");
      await register(app, "veli@example.com");
      app.locals.mailer.sent.length = 0;

      const responses = [];

      for (let index = 0; index < 4; index += 1) {
        responses.push(await forgot(app, "ali@example.com"));
      }

      const other = await forgot(app, "veli@example.com");
      await settleBackgroundTasks(app);

      for (const response of [...responses, other]) {
        expect(response.status).toBe(202);
        expect(response.headers["retry-after"]).toBeUndefined();
        expect(response.headers.ratelimit).toBeUndefined();
        expect(response.headers["ratelimit-policy"]).toBeUndefined();
      }

      expect(
        app.locals.mailer.sent.map((message) => message.to).sort(),
      ).toEqual(["ali@example.com", "ali@example.com", "veli@example.com"]);
    });

    it("keeps the newest link that was sent working", async () => {
      const app = appWith({ forgotPasswordByEmail: twoPerMinute });
      await register(app, "ali@example.com");
      app.locals.mailer.sent.length = 0;

      await statuses(3, () => forgot(app, "ali@example.com"));
      await settleBackgroundTasks(app);
      const token = readTokenFromEmail(app.locals.mailer.sent.at(-1));
      const response = await request(app)
        .post("/auth/reset-password")
        .send({ token, password: newPassword });

      expect(response.status).toBe(204);
    });
  });

  describe("current password checks", () => {
    function as(app, session) {
      return {
        changePassword: (currentPassword) =>
          request(app)
            .post("/me/password")
            .set("Authorization", `Bearer ${session.accessToken}`)
            .send({ currentPassword, newPassword }),
        deleteAccount: (chosenPassword) =>
          request(app)
            .delete("/me")
            .set("Authorization", `Bearer ${session.accessToken}`)
            .send({ password: chosenPassword }),
      };
    }

    it("limits wrong passwords per user across password change and account deletion", async () => {
      const app = appWith({ passwordCheck: twoPerMinute });
      const ali = as(app, await register(app, "ali@example.com"));
      const veli = as(app, await register(app, "veli@example.com"));

      expect((await ali.changePassword("wrong password")).status).toBe(400);
      expect((await ali.deleteAccount("wrong password")).status).toBe(400);
      expectTooManyRequests(
        await ali.changePassword(password),
        "passwordCheck",
      );
      expect((await ali.deleteAccount(password)).status).toBe(429);
      expect((await veli.changePassword(password)).status).toBe(204);
    });

    it("does not count successful checks", async () => {
      const app = appWith({ passwordCheck: twoPerMinute });
      const session = await register(app, "ali@example.com");
      const ali = as(app, session);
      const changeBack = () =>
        request(app)
          .post("/me/password")
          .set("Authorization", `Bearer ${session.accessToken}`)
          .send({ currentPassword: newPassword, newPassword: password });

      expect((await ali.changePassword(password)).status).toBe(204);
      expect((await changeBack()).status).toBe(204);
      expect((await ali.changePassword(password)).status).toBe(204);
      expect((await ali.changePassword("wrong password")).status).toBe(400);
    });
  });

  it("documents 429 on every limited operation and nowhere else", () => {
    const document = buildOpenApiDocument();
    const limited = [];

    for (const [path, item] of Object.entries(document.paths)) {
      for (const [method, operation] of Object.entries(item)) {
        if (operation.responses?.[429]) {
          limited.push(`${method.toUpperCase()} ${path}`);
        }
      }
    }

    expect(limited.sort()).toEqual(
      [
        "POST /auth/register",
        "POST /auth/login",
        "POST /auth/refresh",
        "POST /auth/verify-email",
        "POST /auth/resend-verification",
        "POST /auth/forgot-password",
        "POST /auth/reset-password",
        "POST /me/password",
        "DELETE /me",
      ].sort(),
    );
  });
});
