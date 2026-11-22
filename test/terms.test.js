import { eq } from "drizzle-orm";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { DEV_USER } from "../src/constants/devUser.js";
import { TERMS_VERSION } from "../src/constants/legal.js";
import { users } from "../src/db/schema/index.js";
import { buildOpenApiDocument } from "../src/docs/openapi.js";
import { createTestApp } from "./helpers/app.js";
import { signedInAs } from "./helpers/auth.js";
import { useTestDatabase } from "./helpers/database.js";

const email = "ali@example.com";
const password = "correct horse battery";

describe("terms of use", () => {
  const testDatabase = useTestDatabase();
  let app;
  let db;

  beforeEach(() => {
    app = createTestApp({ database: testDatabase.database });
    db = testDatabase.db;
  });

  async function findUser(userId) {
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    return user;
  }

  async function findUserByEmail(address) {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, address));
    return user;
  }

  function register(body) {
    return request(app)
      .post("/auth/register")
      .set("X-Anchorly-Client", "mobile")
      .send(body);
  }

  describe("POST /auth/register", () => {
    it("refuses to create an account when the terms are not accepted", async () => {
      for (const extra of [
        {},
        { acceptTerms: false },
        { acceptTerms: "true" },
        { acceptTerms: 1 },
        { acceptTerms: null },
      ]) {
        const response = await register({ email, password, ...extra });

        expect(response.status, JSON.stringify(extra)).toBe(400);
        expect(response.body.error.code).toBe("VALIDATION_ERROR");
      }

      expect(await findUserByEmail(email)).toBeUndefined();
    });

    it("records the current terms version and when they were accepted", async () => {
      const before = Date.now();
      const response = await register({ email, password, acceptTerms: true });
      const after = Date.now();
      const user = await findUser(response.body.user.id);

      expect(response.status).toBe(201);
      expect(response.body.user.termsAccepted).toBe(true);
      expect(user.termsVersion).toBe(TERMS_VERSION);
      expect(user.termsAcceptedAt.getTime()).toBeGreaterThanOrEqual(
        before - 1000,
      );
      expect(user.termsAcceptedAt.getTime()).toBeLessThanOrEqual(after + 1000);
    });

    it("does not let the client choose the terms version", async () => {
      const response = await register({
        email,
        password,
        acceptTerms: true,
        termsVersion: "1999-01-01",
      });

      expect(response.status).toBe(400);
      expect(await findUserByEmail(email)).toBeUndefined();
    });
  });

  describe("termsAccepted on the user", () => {
    it("is false for an account without a recorded acceptance", async () => {
      const agent = await signedInAs(app, db);

      const response = await agent.get("/me");

      expect(response.status).toBe(200);
      expect(response.body.user.termsAccepted).toBe(false);
    });

    it("is false when the accepted version is older than the current one", async () => {
      await db
        .update(users)
        .set({ termsVersion: "2000-01-01", termsAcceptedAt: new Date() })
        .where(eq(users.id, DEV_USER.id));
      const agent = await signedInAs(app, db);

      const response = await agent.get("/me");

      expect(response.body.user.termsAccepted).toBe(false);
    });

    it("comes back on sign-in so the app can ask right away", async () => {
      const registration = await register({
        email,
        password,
        acceptTerms: true,
      });
      await db
        .update(users)
        .set({ termsVersion: null, termsAcceptedAt: null })
        .where(eq(users.id, registration.body.user.id));

      const response = await request(app)
        .post("/auth/login")
        .set("X-Anchorly-Client", "mobile")
        .send({ email, password });

      expect(response.status).toBe(200);
      expect(response.body.user.termsAccepted).toBe(false);
    });
  });

  describe("POST /me/terms", () => {
    it("records the current version and returns the updated user", async () => {
      const agent = await signedInAs(app, db);
      const before = Date.now();

      const response = await agent.post("/me/terms").send({ accept: true });
      const user = await findUser(DEV_USER.id);

      expect(response.status).toBe(200);
      expect(response.body.user).toMatchObject({
        id: DEV_USER.id,
        termsAccepted: true,
      });
      expect(user.termsVersion).toBe(TERMS_VERSION);
      expect(user.termsAcceptedAt.getTime()).toBeGreaterThanOrEqual(
        before - 1000,
      );
      expect((await agent.get("/me")).body.user.termsAccepted).toBe(true);
    });

    it("replaces an older acceptance with the current one", async () => {
      const old = new Date("2026-01-01T00:00:00Z");
      await db
        .update(users)
        .set({ termsVersion: "2000-01-01", termsAcceptedAt: old })
        .where(eq(users.id, DEV_USER.id));
      const agent = await signedInAs(app, db);

      await agent.post("/me/terms").send({ accept: true });
      const user = await findUser(DEV_USER.id);

      expect(user.termsVersion).toBe(TERMS_VERSION);
      expect(user.termsAcceptedAt.getTime()).toBeGreaterThan(old.getTime());
    });

    it("rejects a body that does not accept the terms", async () => {
      const agent = await signedInAs(app, db);

      for (const body of [
        {},
        { accept: false },
        { accept: "yes" },
        { accept: true, version: TERMS_VERSION },
      ]) {
        const response = await agent.post("/me/terms").send(body);

        expect(response.status, JSON.stringify(body)).toBe(400);
      }

      expect((await findUser(DEV_USER.id)).termsVersion).toBeNull();
    });

    it("needs a signed-in user", async () => {
      const response = await request(app)
        .post("/me/terms")
        .send({ accept: true });

      expect(response.status).toBe(401);
    });

    it("changes only the signed-in user", async () => {
      const other = await register({
        email: "ayse@example.com",
        password,
        acceptTerms: true,
      });
      await db
        .update(users)
        .set({ termsVersion: null, termsAcceptedAt: null })
        .where(eq(users.id, other.body.user.id));
      const agent = await signedInAs(app, db);

      await agent.post("/me/terms").send({ accept: true });

      expect((await findUser(other.body.user.id)).termsVersion).toBeNull();
    });
  });

  describe("OpenAPI", () => {
    it("requires acceptTerms on registration and documents POST /me/terms", () => {
      const document = buildOpenApiDocument();
      const registerBody =
        document.paths["/auth/register"].post.requestBody.content[
          "application/json"
        ].schema;
      const termsBody =
        document.paths["/me/terms"].post.requestBody.content["application/json"]
          .schema;

      expect(registerBody.required).toContain("acceptTerms");
      expect(registerBody.properties.acceptTerms.enum).toEqual([true]);
      expect(termsBody.required).toEqual(["accept"]);
      expect(
        document.components.schemas.User.properties.termsAccepted.type,
      ).toBe("boolean");
    });
  });
});
