import { readFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { DEV_USER } from "../src/constants/devUser.js";
import {
  projects,
  tasks,
  userSettings,
  users,
} from "../src/db/schema/index.js";
import {
  assertTestDatabase,
  truncateAllTables,
  useTestDatabase,
} from "./helpers/database.js";

const projectId = "678e4529-fa35-432c-8baa-6a1298ba43f1";

function fakeDatabaseNamed(name) {
  return { execute: async () => ({ rows: [{ name }] }) };
}

describe("test database helpers", () => {
  const testDatabase = useTestDatabase();

  it("connects to a database whose name ends in _test", async () => {
    const result = await testDatabase.db.execute(
      sql`select current_database() as name`,
    );

    expect(result.rows[0].name).toMatch(/_test$/);
  });

  it("refuses to work on a database that is not a test database", async () => {
    await expect(
      assertTestDatabase(fakeDatabaseNamed("anchorly_dev")),
    ).rejects.toThrow(/anchorly_dev/);
    await expect(
      assertTestDatabase(fakeDatabaseNamed("anchorly_test")),
    ).resolves.toBeUndefined();
  });

  it("applies every migration once before the tests run", async () => {
    const journal = JSON.parse(
      readFileSync("drizzle/meta/_journal.json", "utf8"),
    );
    const result = await testDatabase.db.execute(
      sql`select count(*)::int as count from drizzle.__drizzle_migrations`,
    );

    expect(result.rows[0].count).toBe(journal.entries.length);
  });

  it("starts every test with only the development user", async () => {
    const allUsers = await testDatabase.db.select().from(users);
    const allSettings = await testDatabase.db.select().from(userSettings);

    expect(allUsers.map((user) => user.id)).toEqual([DEV_USER.id]);
    expect(allSettings).toHaveLength(1);
  });

  it("lets a test write data", async () => {
    await testDatabase.db
      .insert(projects)
      .values({ userId: DEV_USER.id, id: projectId, name: "Portfolio" });

    expect(await testDatabase.db.select().from(projects)).toHaveLength(1);
  });

  it("does not show the data written by the previous test", async () => {
    expect(await testDatabase.db.select().from(projects)).toEqual([]);
  });

  it("empties every table when truncating", async () => {
    await testDatabase.db
      .insert(projects)
      .values({ userId: DEV_USER.id, id: projectId, name: "Portfolio" });
    await testDatabase.db.insert(tasks).values({
      userId: DEV_USER.id,
      id: "4cbd7450-6231-43eb-96a2-3be6d2b1d532",
      projectId,
      title: "Write report",
      position: 0,
    });

    await truncateAllTables(testDatabase.db);

    const result = await testDatabase.db.execute(sql`
      select
        (select count(*) from users)::int as users,
        (select count(*) from user_settings)::int as settings,
        (select count(*) from projects)::int as projects,
        (select count(*) from tasks)::int as tasks
    `);

    expect(result.rows[0]).toEqual({
      users: 0,
      settings: 0,
      projects: 0,
      tasks: 0,
    });
  });
});
