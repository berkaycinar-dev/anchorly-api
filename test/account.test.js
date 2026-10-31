import { eq } from "drizzle-orm";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { DEV_USER } from "../src/constants/devUser.js";
import { sessions, users } from "../src/db/schema/index.js";
import { createTestApp } from "./helpers/app.js";
import { signedInAs } from "./helpers/auth.js";
import { useTestDatabase } from "./helpers/database.js";

const email = "ali@example.com";
const password = "correct horse battery";
const newPassword = "brand new passphrase";

describe("account", () => {
  const testDatabase = useTestDatabase();
  let app;
  let db;

  beforeEach(() => {
    app = createTestApp({ database: testDatabase.database });
    db = testDatabase.db;
  });

  async function registerAli() {
    const response = await request(app)
      .post("/auth/register")
      .set("X-Anchorly-Client", "mobile")
      .send({ email, password, displayName: "Ali" });

    return response.body;
  }

  function login(chosenPassword) {
    return request(app)
      .post("/auth/login")
      .set("X-Anchorly-Client", "mobile")
      .send({ email, password: chosenPassword });
  }

  function as(accessToken) {
    return {
      get: (path) =>
        request(app).get(path).set("Authorization", `Bearer ${accessToken}`),
      patch: (path) =>
        request(app).patch(path).set("Authorization", `Bearer ${accessToken}`),
      post: (path) =>
        request(app).post(path).set("Authorization", `Bearer ${accessToken}`),
    };
  }

  describe("GET /me", () => {
    it("returns the signed-in user", async () => {
      const { accessToken, user } = await registerAli();

      const response = await as(accessToken).get("/me");

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ user });
    });

    it("requires an access token", async () => {
      expect((await request(app).get("/me")).status).toBe(401);
    });
  });

  describe("PATCH /me", () => {
    it("changes and trims the display name", async () => {
      const { accessToken } = await registerAli();

      const response = await as(accessToken)
        .patch("/me")
        .send({ displayName: "  Ali Veli  " });

      expect(response.status).toBe(200);
      expect(response.body.user.displayName).toBe("Ali Veli");
      expect((await as(accessToken).get("/me")).body.user.displayName).toBe(
        "Ali Veli",
      );
    });

    it("clears the display name with null", async () => {
      const { accessToken } = await registerAli();

      const response = await as(accessToken)
        .patch("/me")
        .send({ displayName: null });

      expect(response.body.user.displayName).toBeNull();
    });

    it("rejects an empty or very long name and fields it does not own", async () => {
      const { accessToken } = await registerAli();

      for (const body of [
        { displayName: "   " },
        { displayName: "x".repeat(101) },
        {},
        { displayName: "Ali", email: "other@example.com" },
        { displayName: "Ali", emailVerifiedAt: "2026-11-01T00:00:00Z" },
      ]) {
        const response = await as(accessToken).patch("/me").send(body);

        expect(response.status, JSON.stringify(body)).toBe(400);
      }

      const [stored] = await db
        .select()
        .from(users)
        .where(eq(users.email, email));
      expect(stored).toMatchObject({
        displayName: "Ali",
        emailVerifiedAt: null,
      });
    });
  });

  describe("POST /me/password", () => {
    function changePassword(accessToken, body) {
      return as(accessToken).post("/me/password").send(body);
    }

    it("sets the new password and retires the old one", async () => {
      const { accessToken } = await registerAli();

      const response = await changePassword(accessToken, {
        currentPassword: password,
        newPassword,
      });

      expect(response.status).toBe(204);
      expect((await login(newPassword)).status).toBe(200);
      expect((await login(password)).status).toBe(401);
    });

    it("signs out other devices but keeps this session", async () => {
      const current = await registerAli();
      const otherDevice = (await login(password)).body;

      await changePassword(current.accessToken, {
        currentPassword: password,
        newPassword,
      });

      expect((await as(otherDevice.accessToken).get("/me")).status).toBe(401);
      expect(
        (
          await request(app)
            .post("/auth/refresh")
            .send({ refreshToken: otherDevice.refreshToken })
        ).status,
      ).toBe(401);
      expect((await as(current.accessToken).get("/me")).status).toBe(200);
      expect(
        (
          await request(app)
            .post("/auth/refresh")
            .send({ refreshToken: current.refreshToken })
        ).status,
      ).toBe(200);
    });

    it("rejects a wrong current password without changing anything", async () => {
      const current = await registerAli();
      const otherDevice = (await login(password)).body;

      const response = await changePassword(current.accessToken, {
        currentPassword: "not my password",
        newPassword,
      });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("INVALID_CURRENT_PASSWORD");
      expect((await login(password)).status).toBe(200);
      expect((await as(otherDevice.accessToken).get("/me")).status).toBe(200);
    });

    it("sends an account without a password to forgot password", async () => {
      const api = await signedInAs(app, db);

      const response = await api
        .post("/me/password")
        .send({ currentPassword: "anything", newPassword });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("PASSWORD_NOT_SET");
      const [devUser] = await db
        .select()
        .from(users)
        .where(eq(users.id, DEV_USER.id));
      expect(devUser.passwordHash).toBeNull();
    });

    it("applies the password rules to the new password", async () => {
      const { accessToken } = await registerAli();

      for (const body of [
        { currentPassword: password, newPassword: "short" },
        { currentPassword: password, newPassword: "x".repeat(129) },
        { currentPassword: "", newPassword },
        { currentPassword: password },
      ]) {
        const response = await changePassword(accessToken, body);

        expect(response.status, JSON.stringify(body)).toBe(400);
        expect(response.body.error.code).toBe("VALIDATION_ERROR");
      }
    });

    it("does not touch the email verification", async () => {
      const { accessToken } = await registerAli();

      await changePassword(accessToken, {
        currentPassword: password,
        newPassword,
      });

      const [stored] = await db
        .select()
        .from(users)
        .where(eq(users.email, email));
      expect(stored.emailVerifiedAt).toBeNull();
    });

    it("leaves sessions of other users alone", async () => {
      const ali = await registerAli();
      const ayse = (
        await request(app)
          .post("/auth/register")
          .set("X-Anchorly-Client", "mobile")
          .send({ email: "ayse@example.com", password })
      ).body;

      await changePassword(ali.accessToken, {
        currentPassword: password,
        newPassword,
      });

      const [ayseSession] = await db
        .select()
        .from(sessions)
        .where(eq(sessions.userId, ayse.user.id));
      expect(ayseSession.revokedAt).toBeNull();
    });

    it("requires an access token", async () => {
      const response = await request(app)
        .post("/me/password")
        .send({ currentPassword: password, newPassword });

      expect(response.status).toBe(401);
    });
  });
});
