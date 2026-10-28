import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DEV_USER } from "../src/constants/devUser.js";
import {
  projects,
  routineChecks,
  routines,
  userSettings,
  users,
} from "../src/db/schema/index.js";
import { seedDevUser } from "../src/db/seedDevUser.js";
import {
  createTestDatabase,
  expectDatabaseError,
  resetDatabase,
} from "./helpers/database.js";

const CHECK_VIOLATION = "23514";
const UNIQUE_VIOLATION = "23505";
const FOREIGN_KEY_VIOLATION = "23503";

const alice = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "alice@example.com",
};
const bob = {
  id: "22222222-2222-4222-8222-222222222222",
  email: "bob@example.com",
};
const sharedProjectId = "678e4529-fa35-432c-8baa-6a1298ba43f1";
const routineId = "88444dfd-8be1-4578-956f-037a0b71e8b7";

describe("database schema", () => {
  let database;
  let db;

  beforeAll(async () => {
    database = createTestDatabase();
    db = database.db;
    await resetDatabase(db);
  });

  afterAll(async () => {
    await database?.close();
  });

  beforeEach(async () => {
    await db.execute(sql`truncate table users cascade`);
    await db.insert(users).values([alice, bob]);
  });

  it("creates the five application tables", async () => {
    const result = await db.execute(
      sql`select table_name from information_schema.tables where table_schema = 'public' order by table_name`,
    );

    expect(result.rows.map((row) => row.table_name)).toEqual([
      "projects",
      "routine_checks",
      "routines",
      "user_settings",
      "users",
    ]);
  });

  it("rejects a second user with the same email", async () => {
    await expectDatabaseError(
      db.insert(users).values({ email: alice.email }),
      UNIQUE_VIOLATION,
    );
  });

  it("fills user settings with the default values", async () => {
    const [settings] = await db
      .insert(userSettings)
      .values({ userId: alice.id })
      .returning();

    expect(settings).toMatchObject({
      theme: "gray",
      language: "tr",
      fontFamily: "Inter",
      weekStartDay: "monday",
    });
  });

  it("rejects settings values outside the allowed lists", async () => {
    await expectDatabaseError(
      db.insert(userSettings).values({ userId: alice.id, theme: "orange" }),
      CHECK_VIOLATION,
    );
    await expectDatabaseError(
      db.insert(userSettings).values({ userId: alice.id, language: "de" }),
      CHECK_VIOLATION,
    );
    await expectDatabaseError(
      db.insert(userSettings).values({ userId: alice.id, fontFamily: "Arial" }),
      CHECK_VIOLATION,
    );
    await expectDatabaseError(
      db
        .insert(userSettings)
        .values({ userId: alice.id, weekStartDay: "friday" }),
      CHECK_VIOLATION,
    );
  });

  it("lets two users keep a project with the same id", async () => {
    await db.insert(projects).values([
      { userId: alice.id, id: sharedProjectId, name: "Portfolio" },
      { userId: bob.id, id: sharedProjectId, name: "Portfolio" },
    ]);

    const rows = await db
      .select()
      .from(projects)
      .where(eq(projects.id, sharedProjectId));

    expect(rows).toHaveLength(2);
  });

  it("rejects a duplicate project id for the same user", async () => {
    await db
      .insert(projects)
      .values({ userId: alice.id, id: sharedProjectId, name: "Portfolio" });

    await expectDatabaseError(
      db
        .insert(projects)
        .values({ userId: alice.id, id: sharedProjectId, name: "Copy" }),
      UNIQUE_VIOLATION,
    );
  });

  it("rejects a routine check that points to another user's routine", async () => {
    await db
      .insert(routines)
      .values({ userId: alice.id, id: routineId, title: "Read", position: 0 });

    await expectDatabaseError(
      db.insert(routineChecks).values({
        userId: bob.id,
        routineId,
        date: "2026-10-28",
        checked: true,
      }),
      FOREIGN_KEY_VIOLATION,
    );
  });

  it("removes the checks of a routine when the routine row is deleted", async () => {
    await db
      .insert(routines)
      .values({ userId: alice.id, id: routineId, title: "Read", position: 0 });
    await db.insert(routineChecks).values({
      userId: alice.id,
      routineId,
      date: "2026-10-28",
      checked: true,
    });

    await db.delete(routines).where(eq(routines.id, routineId));

    expect(await db.select().from(routineChecks)).toEqual([]);
  });

  it("removes all data of a user when the user row is deleted", async () => {
    await db.insert(userSettings).values({ userId: alice.id });
    await db
      .insert(projects)
      .values({ userId: alice.id, id: sharedProjectId, name: "Portfolio" });
    await db
      .insert(routines)
      .values({ userId: alice.id, id: routineId, title: "Read", position: 0 });

    await db.delete(users).where(eq(users.id, alice.id));

    expect(await db.select().from(userSettings)).toEqual([]);
    expect(await db.select().from(projects)).toEqual([]);
    expect(await db.select().from(routines)).toEqual([]);
  });

  it("seeds the development user only once", async () => {
    await seedDevUser(db);
    await seedDevUser(db);

    const seededUsers = await db
      .select()
      .from(users)
      .where(eq(users.id, DEV_USER.id));
    const seededSettings = await db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, DEV_USER.id));

    expect(seededUsers).toHaveLength(1);
    expect(seededUsers[0].email).toBe(DEV_USER.email);
    expect(seededSettings).toHaveLength(1);
  });
});
