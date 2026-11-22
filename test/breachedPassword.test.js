import { eq } from "drizzle-orm";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { users } from "../src/db/schema/index.js";
import { buildOpenApiDocument } from "../src/docs/openapi.js";
import { createPwnedPasswordChecker } from "../src/lib/pwnedPasswords.js";
import {
  createTestApp,
  readTokenFromEmail,
  settleBackgroundTasks,
} from "./helpers/app.js";
import { useTestDatabase } from "./helpers/database.js";

const email = "ali@example.com";
const password = "correct horse battery";
const breachedPassword = "password123";
const newPassword = "brand new passphrase";

describe("breached password check", () => {
  const testDatabase = useTestDatabase();
  let isPasswordBreached;

  beforeEach(() => {
    isPasswordBreached = vi.fn(async (value) => value === breachedPassword);
  });

  function appWith(overrides = {}) {
    return createTestApp({
      database: testDatabase.database,
      isPasswordBreached,
      ...overrides,
    });
  }

  function register(app, chosenPassword) {
    return request(app)
      .post("/auth/register")
      .set("X-Anchorly-Client", "mobile")
      .send({ email, password: chosenPassword, acceptTerms: true });
  }

  function login(app, chosenPassword) {
    return request(app)
      .post("/auth/login")
      .set("X-Anchorly-Client", "mobile")
      .send({ email, password: chosenPassword });
  }

  function expectBreached(response) {
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("PASSWORD_BREACHED");
  }

  async function findUser() {
    const [user] = await testDatabase.db
      .select()
      .from(users)
      .where(eq(users.email, email));

    return user;
  }

  describe("registration", () => {
    it("rejects a breached password and creates no account", async () => {
      const app = appWith();

      expectBreached(await register(app, breachedPassword));
      expect(isPasswordBreached).toHaveBeenCalledWith(breachedPassword);
      expect(await findUser()).toBeUndefined();
    });

    it("accepts a password that is not breached", async () => {
      const app = appWith();

      expect((await register(app, password)).status).toBe(201);
      expect(isPasswordBreached).toHaveBeenCalledWith(password);
    });

    it("checks the password only after the body is valid", async () => {
      const app = appWith();

      const response = await register(app, "short");

      expect(response.body.error.code).toBe("VALIDATION_ERROR");
      expect(isPasswordBreached).not.toHaveBeenCalled();
    });

    it("signs up when the breach service cannot be reached", async () => {
      const app = appWith({
        isPasswordBreached: createPwnedPasswordChecker({
          fetch: async () => {
            throw new TypeError("fetch failed");
          },
          logger: { error() {} },
        }),
      });

      expect((await register(app, breachedPassword)).status).toBe(201);
    });
  });

  describe("signing in", () => {
    it("does not check the password", async () => {
      const app = appWith();
      await register(app, password);
      isPasswordBreached.mockClear();

      expect((await login(app, password)).status).toBe(200);
      expect(isPasswordBreached).not.toHaveBeenCalled();
    });
  });

  describe("password reset", () => {
    async function requestResetToken(app) {
      await request(app).post("/auth/forgot-password").send({ email });
      await settleBackgroundTasks(app);

      return readTokenFromEmail(app.locals.mailer.sent.at(-1));
    }

    function reset(app, token, chosenPassword) {
      return request(app)
        .post("/auth/reset-password")
        .send({ token, password: chosenPassword });
    }

    it("rejects a breached password and keeps the link usable", async () => {
      const app = appWith();
      await register(app, password);
      const token = await requestResetToken(app);

      expectBreached(await reset(app, token, breachedPassword));
      expect((await login(app, password)).status).toBe(200);

      expect((await reset(app, token, newPassword)).status).toBe(204);
      expect((await login(app, newPassword)).status).toBe(200);
    });
  });

  describe("password change", () => {
    async function signUp(app) {
      return (await register(app, password)).body.accessToken;
    }

    function changePassword(app, accessToken, currentPassword, chosenPassword) {
      return request(app)
        .post("/me/password")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ currentPassword, newPassword: chosenPassword });
    }

    it("rejects a breached new password and keeps the old one", async () => {
      const app = appWith();
      const accessToken = await signUp(app);

      expectBreached(
        await changePassword(app, accessToken, password, breachedPassword),
      );
      expect(isPasswordBreached).toHaveBeenLastCalledWith(breachedPassword);
      expect((await login(app, password)).status).toBe(200);
    });

    it("does not count breached passwords as wrong password attempts", async () => {
      const app = appWith({
        rateLimits: { passwordCheck: { windowMs: 60 * 1000, limit: 1 } },
      });
      const accessToken = await signUp(app);

      for (let attempt = 0; attempt < 3; attempt += 1) {
        expectBreached(
          await changePassword(app, accessToken, password, breachedPassword),
        );
      }

      const response = await changePassword(
        app,
        accessToken,
        "wrong password",
        newPassword,
      );

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("INVALID_CURRENT_PASSWORD");
    });
  });

  it("documents the error on exactly the operations that check passwords", () => {
    const documented = [];

    for (const [path, item] of Object.entries(buildOpenApiDocument().paths)) {
      for (const [method, operation] of Object.entries(item)) {
        if (
          operation.responses?.[400]?.description.includes("PASSWORD_BREACHED")
        ) {
          documented.push(`${method.toUpperCase()} ${path}`);
        }
      }
    }

    expect(documented.sort()).toEqual([
      "POST /auth/register",
      "POST /auth/reset-password",
      "POST /me/password",
    ]);
  });
});
