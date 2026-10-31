import { eq } from "drizzle-orm";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { DEV_USER } from "../src/constants/devUser.js";
import {
  emailTokens,
  projects,
  routineChecks,
  routines,
  sessions,
  tasks,
  userSettings,
  users,
} from "../src/db/schema/index.js";
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
      delete: (path) =>
        request(app).delete(path).set("Authorization", `Bearer ${accessToken}`),
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

  describe("DELETE /me", () => {
    const projectId = "678e4529-fa35-432c-8baa-6a1298ba43f1";
    const routineId = "88444dfd-8be1-4578-956f-037a0b71e8b7";
    const taskId = "4cbd7450-6231-43eb-96a2-3be6d2b1d532";

    async function registerAliWithData() {
      const ali = await registerAli();
      const api = as(ali.accessToken);

      await api.post("/projects").send({ id: projectId, name: "Portfolio" });
      await api.post("/routines").send({ id: routineId, title: "Read" });
      await request(app)
        .put(`/routines/${routineId}/checks/2026-11-01`)
        .set("Authorization", `Bearer ${ali.accessToken}`)
        .send({ checked: true });
      await api
        .post("/tasks")
        .send({ id: taskId, title: "Write report", order: 0, projectId });

      return ali;
    }

    async function countRows(userId) {
      const counts = {};

      for (const [name, table, column] of [
        ["users", users, users.id],
        ["settings", userSettings, userSettings.userId],
        ["projects", projects, projects.userId],
        ["routines", routines, routines.userId],
        ["checks", routineChecks, routineChecks.userId],
        ["tasks", tasks, tasks.userId],
        ["sessions", sessions, sessions.userId],
        ["emailTokens", emailTokens, emailTokens.userId],
      ]) {
        counts[name] = (
          await db.select().from(table).where(eq(column, userId))
        ).length;
      }

      return counts;
    }

    it("deletes the user and every row that belongs to them", async () => {
      const ali = await registerAliWithData();
      await db.insert(emailTokens).values({
        userId: ali.user.id,
        purpose: "reset_password",
        tokenHash: "pending-reset-hash",
        email,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      });
      const before = await countRows(ali.user.id);

      const response = await as(ali.accessToken)
        .delete("/me")
        .send({ password });

      expect(response.status).toBe(204);
      expect(Object.values(before).every((count) => count > 0)).toBe(true);
      expect(await countRows(ali.user.id)).toEqual({
        users: 0,
        settings: 0,
        projects: 0,
        routines: 0,
        checks: 0,
        tasks: 0,
        sessions: 0,
        emailTokens: 0,
      });
    });

    it("stops the tokens of the deleted account and clears the cookie", async () => {
      const ali = await registerAli();

      const response = await as(ali.accessToken)
        .delete("/me")
        .send({ password });

      expect(
        (response.headers["set-cookie"] ?? []).some((cookie) =>
          cookie.startsWith("anchorly_refresh=;"),
        ),
      ).toBe(true);
      expect((await as(ali.accessToken).get("/me")).status).toBe(401);
      expect(
        (
          await request(app)
            .post("/auth/refresh")
            .send({ refreshToken: ali.refreshToken })
        ).status,
      ).toBe(401);
      expect((await login(password)).status).toBe(401);
    });

    it("lets the same email register again afterwards", async () => {
      const ali = await registerAli();
      await as(ali.accessToken).delete("/me").send({ password });

      const again = await registerAli();

      expect(again.user.email).toBe(email);
      expect(again.user.id).not.toBe(ali.user.id);
    });

    it("keeps everything when the password is wrong", async () => {
      const ali = await registerAliWithData();
      const before = await countRows(ali.user.id);

      const response = await as(ali.accessToken)
        .delete("/me")
        .send({ password: "not my password" });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("INVALID_CURRENT_PASSWORD");
      expect(await countRows(ali.user.id)).toEqual(before);
    });

    it("asks an account without a password to set one first", async () => {
      const api = await signedInAs(app, db);

      const response = await api.delete("/me").send({ password: "anything" });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("PASSWORD_NOT_SET");
      expect(
        await db.select().from(users).where(eq(users.id, DEV_USER.id)),
      ).toHaveLength(1);
    });

    it("leaves other users and their data alone", async () => {
      const ali = await registerAli();
      const ayse = (
        await request(app)
          .post("/auth/register")
          .set("X-Anchorly-Client", "mobile")
          .send({ email: "ayse@example.com", password })
      ).body;
      await as(ayse.accessToken)
        .post("/projects")
        .send({ id: projectId, name: "Ayşe's project" });
      const before = await countRows(ayse.user.id);

      await as(ali.accessToken).delete("/me").send({ password });

      expect(await countRows(ayse.user.id)).toEqual(before);
      expect((await as(ayse.accessToken).get("/projects")).body).toHaveLength(
        1,
      );
    });

    it("requires the password in the body and an access token", async () => {
      const ali = await registerAli();

      for (const body of [{}, { password: "" }, { password, force: true }]) {
        const response = await as(ali.accessToken).delete("/me").send(body);

        expect(response.status, JSON.stringify(body)).toBe(400);
      }
      expect((await request(app).delete("/me").send({ password })).status).toBe(
        401,
      );
      expect((await as(ali.accessToken).get("/me")).status).toBe(200);
    });
  });
});
