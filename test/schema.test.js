import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { DEV_USER } from "../src/constants/devUser.js";
import {
  projects,
  routineChecks,
  routines,
  tasks,
  userSettings,
  users,
} from "../src/db/schema/index.js";
import { seedDevUser } from "../src/db/seedDevUser.js";
import { expectDatabaseError } from "./helpers/assertions.js";
import { useTestDatabase } from "./helpers/database.js";

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
const taskId = "4cbd7450-6231-43eb-96a2-3be6d2b1d532";

describe("database schema", () => {
  const testDatabase = useTestDatabase({ seed: false });
  let db;

  beforeEach(async () => {
    db = testDatabase.db;
    await db.insert(users).values([alice, bob]);
  });

  it("creates the application tables", async () => {
    const result = await db.execute(
      sql`select table_name from information_schema.tables where table_schema = 'public' order by table_name`,
    );

    expect(result.rows.map((row) => row.table_name)).toEqual([
      "projects",
      "routine_checks",
      "routines",
      "tasks",
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
    await db.insert(tasks).values({
      userId: alice.id,
      id: taskId,
      projectId: sharedProjectId,
      title: "Write report",
      position: 0,
    });

    await db.delete(users).where(eq(users.id, alice.id));

    expect(await db.select().from(userSettings)).toEqual([]);
    expect(await db.select().from(projects)).toEqual([]);
    expect(await db.select().from(routines)).toEqual([]);
    expect(await db.select().from(tasks)).toEqual([]);
  });

  it("fills a new task with the default values", async () => {
    const [task] = await db
      .insert(tasks)
      .values({
        userId: alice.id,
        id: taskId,
        title: "Write report",
        position: 0,
      })
      .returning();

    expect(task).toMatchObject({
      projectId: null,
      category: "Work",
      date: null,
      completed: false,
      completedAt: null,
      description: "",
      steps: [],
      repeat: "none",
      repeatGroupId: null,
      deletedAt: null,
    });
  });

  it("keeps task steps and a millisecond position unchanged", async () => {
    const steps = [
      {
        id: "a3f1c2d4-0000-4000-8000-000000000001",
        text: "Taslağı yaz",
        done: true,
      },
      {
        id: "a3f1c2d4-0000-4000-8000-000000000002",
        text: "Gözden geçir",
        done: false,
      },
    ];

    await db.insert(tasks).values({
      userId: alice.id,
      id: taskId,
      title: "Write report",
      date: "2026-10-28",
      steps,
      position: 1761500000000,
    });

    const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));

    expect(task.steps).toEqual(steps);
    expect(task.position).toBe(1761500000000);
    expect(task.date).toBe("2026-10-28");
  });

  it("accepts every task category used by the frontend", async () => {
    const rows = [
      "Work",
      "Personal",
      "Self Development",
      "Health",
      "Other",
      "Project",
    ].map((category, index) => ({
      userId: alice.id,
      id: `5a5a5a5a-0000-4000-8000-00000000000${index}`,
      title: category,
      category,
      position: index,
    }));

    await db.insert(tasks).values(rows);

    expect(await db.select().from(tasks)).toHaveLength(6);
  });

  it("rejects an unknown category, repeat rule or steps value", async () => {
    const base = { userId: alice.id, id: taskId, title: "Task", position: 0 };

    await expectDatabaseError(
      db.insert(tasks).values({ ...base, category: "Shopping" }),
      CHECK_VIOLATION,
    );
    await expectDatabaseError(
      db.insert(tasks).values({ ...base, repeat: "monthly" }),
      CHECK_VIOLATION,
    );
    await expectDatabaseError(
      db.insert(tasks).values({ ...base, steps: { text: "not a list" } }),
      CHECK_VIOLATION,
    );
  });

  it("links a task to a project of the same user", async () => {
    await db
      .insert(projects)
      .values({ userId: alice.id, id: sharedProjectId, name: "Portfolio" });

    await db.insert(tasks).values({
      userId: alice.id,
      id: taskId,
      projectId: sharedProjectId,
      title: "Update case study",
      category: "Project",
      position: 0,
    });

    const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));

    expect(task.projectId).toBe(sharedProjectId);
  });

  it("rejects a task that points to another user's project", async () => {
    await db
      .insert(projects)
      .values({ userId: alice.id, id: sharedProjectId, name: "Portfolio" });

    await expectDatabaseError(
      db.insert(tasks).values({
        userId: bob.id,
        id: taskId,
        projectId: sharedProjectId,
        title: "Sneaky task",
        position: 0,
      }),
      FOREIGN_KEY_VIOLATION,
    );
  });

  it("lets two users keep a task with the same id", async () => {
    await db.insert(tasks).values([
      { userId: alice.id, id: taskId, title: "Demo task", position: 0 },
      { userId: bob.id, id: taskId, title: "Demo task", position: 0 },
    ]);

    expect(
      await db.select().from(tasks).where(eq(tasks.id, taskId)),
    ).toHaveLength(2);
  });

  it("indexes tasks by user and repeat group", async () => {
    const result = await db.execute(
      sql`select indexdef from pg_indexes where indexname = 'tasks_user_repeat_group_idx'`,
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].indexdef).toContain("(user_id, repeat_group_id)");
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
