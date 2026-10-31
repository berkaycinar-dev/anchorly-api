import { eq } from "drizzle-orm";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { userSettings, users } from "../src/db/schema/index.js";
import { verifyPassword } from "../src/lib/password.js";
import { registerUser } from "../src/services/authService.js";
import { useTestDatabase } from "./helpers/database.js";

const password = "correct horse battery";

function failOnSettingsInsert(target) {
  return new Proxy(target, {
    get(object, property) {
      if (property === "insert") {
        return (table) => {
          if (table === userSettings) {
            throw new Error("settings insert failed");
          }

          return object.insert(table);
        };
      }

      if (property === "transaction") {
        return (callback) =>
          object.transaction((tx) => callback(failOnSettingsInsert(tx)));
      }

      const value = Reflect.get(object, property, object);

      return typeof value === "function" ? value.bind(object) : value;
    },
  });
}

describe("POST /auth/register", () => {
  const testDatabase = useTestDatabase();
  let app;
  let db;

  beforeEach(() => {
    app = createApp({ database: testDatabase.database });
    db = testDatabase.db;
  });

  async function findUser(email) {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  function register(body) {
    return request(app).post("/auth/register").send(body);
  }

  it("creates an account and returns the public user fields", async () => {
    const response = await register({
      email: "ali@example.com",
      password,
      displayName: "Ali",
    });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      user: {
        id: expect.stringMatching(/^[0-9a-f-]{36}$/),
        email: "ali@example.com",
        displayName: "Ali",
        emailVerifiedAt: null,
        createdAt: expect.any(String),
      },
    });
    expect(new Date(response.body.user.createdAt).toString()).not.toBe(
      "Invalid Date",
    );
  });

  it("stores an argon2id hash and never sends it back", async () => {
    const response = await register({ email: "ali@example.com", password });
    const user = await findUser("ali@example.com");

    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    expect(user.passwordHash).not.toContain(password);
    await expect(verifyPassword(user.passwordHash, password)).resolves.toBe(
      true,
    );
    expect(JSON.stringify(response.body)).not.toContain("argon2");
    expect(response.body.user).not.toHaveProperty("passwordHash");
  });

  it("creates default settings for the new account", async () => {
    const response = await register({ email: "ali@example.com", password });

    const [settings] = await db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, response.body.user.id));

    expect(settings).toMatchObject({
      theme: "gray",
      language: "tr",
      fontFamily: "Inter",
      weekStartDay: "monday",
    });
  });

  it("trims the email and stores it in lowercase", async () => {
    const response = await register({
      email: "  Ali.Veli@Example.COM ",
      password,
    });

    expect(response.status).toBe(201);
    expect(response.body.user.email).toBe("ali.veli@example.com");
    expect(await findUser("ali.veli@example.com")).toBeDefined();
  });

  it("keeps spaces at the edges of the password", async () => {
    await register({ email: "ali@example.com", password: `  ${password}  ` });
    const user = await findUser("ali@example.com");

    await expect(
      verifyPassword(user.passwordHash, `  ${password}  `),
    ).resolves.toBe(true);
    await expect(verifyPassword(user.passwordHash, password)).resolves.toBe(
      false,
    );
  });

  it("trims the display name and leaves it empty when it is not sent", async () => {
    const named = await register({
      email: "ali@example.com",
      password,
      displayName: "  Ali Veli  ",
    });
    const unnamed = await register({ email: "ayse@example.com", password });

    expect(named.body.user.displayName).toBe("Ali Veli");
    expect(unnamed.body.user.displayName).toBeNull();
  });

  it("rejects an email that is already registered, in any letter case", async () => {
    const first = await register({ email: "ali@example.com", password });

    const second = await register({
      email: " ALI@example.com",
      password: "a different password",
    });

    expect(second.status).toBe(409);
    expect(second.body).toEqual({
      error: {
        code: "EMAIL_TAKEN",
        message: "An account with this email already exists",
      },
    });

    const rows = await db
      .select()
      .from(users)
      .where(eq(users.email, "ali@example.com"));
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(first.body.user.id);
    await expect(verifyPassword(rows[0].passwordHash, password)).resolves.toBe(
      true,
    );
  });

  it("creates only one account when the same email registers twice at once", async () => {
    const responses = await Promise.all([
      register({ email: "ali@example.com", password }),
      register({ email: "ali@example.com", password }),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([
      201, 409,
    ]);
    expect(
      await db.select().from(users).where(eq(users.email, "ali@example.com")),
    ).toHaveLength(1);
  });

  it("accepts passwords of 8 and 128 characters", async () => {
    const shortest = await register({
      email: "short@example.com",
      password: "x".repeat(8),
    });
    const longest = await register({
      email: "long@example.com",
      password: "x".repeat(128),
    });

    expect(shortest.status).toBe(201);
    expect(longest.status).toBe(201);
  });

  it("rejects a password that is too short or too long", async () => {
    const tooShort = await register({
      email: "ali@example.com",
      password: "x".repeat(7),
    });
    const tooLong = await register({
      email: "ali@example.com",
      password: "x".repeat(129),
    });

    expect(tooShort.status).toBe(400);
    expect(tooShort.body.error.details[0].path).toBe("body.password");
    expect(tooLong.status).toBe(400);
    expect(tooLong.body.error.details[0].path).toBe("body.password");
    expect(await findUser("ali@example.com")).toBeUndefined();
  });

  it("rejects a missing or malformed email", async () => {
    for (const email of [
      undefined,
      "",
      "not-an-email",
      "ali@",
      "@example.com",
    ]) {
      const response = await register({ email, password });

      expect(response.status, String(email)).toBe(400);
      expect(response.body.error.details[0].path).toBe("body.email");
    }
  });

  it("rejects an email longer than 254 characters", async () => {
    const email = `${"a".repeat(64)}@${"b".repeat(61)}.${"c".repeat(61)}.${"d".repeat(61)}.com`;

    expect(email).toHaveLength(254);
    expect((await register({ email, password })).status).toBe(201);
    expect((await register({ email: `a${email}`, password })).status).toBe(400);
  });

  it("rejects an empty or very long display name", async () => {
    const empty = await register({
      email: "ali@example.com",
      password,
      displayName: "   ",
    });
    const long = await register({
      email: "ali@example.com",
      password,
      displayName: "x".repeat(101),
    });

    expect(empty.status).toBe(400);
    expect(long.status).toBe(400);
  });

  it("refuses fields that the client must not set", async () => {
    for (const extra of [
      { passwordHash: "$argon2id$fake" },
      { emailVerifiedAt: "2026-10-31T12:00:00Z" },
      { id: "11111111-1111-4111-8111-111111111111" },
    ]) {
      const response = await register({
        email: "ali@example.com",
        password,
        ...extra,
      });

      expect(response.status, Object.keys(extra)[0]).toBe(400);
    }

    expect(await findUser("ali@example.com")).toBeUndefined();
  });

  it("does not leave a user behind when creating the settings fails", async () => {
    await expect(
      registerUser(failOnSettingsInsert(db), {
        email: "ali@example.com",
        password,
      }),
    ).rejects.toThrow("settings insert failed");

    expect(await findUser("ali@example.com")).toBeUndefined();
  });
});
