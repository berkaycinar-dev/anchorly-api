import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { DEV_USER } from "../src/constants/devUser.js";
import {
  emailTokens,
  projects,
  rateLimits,
  routineChecks,
  routines,
  sessions,
  tasks,
} from "../src/db/schema/index.js";
import { runCleanup } from "../src/services/cleanupService.js";
import { useTestDatabase } from "./helpers/database.js";

const NOW = new Date("2026-11-19T12:00:00.000Z");
const DAY_IN_MS = 24 * 60 * 60 * 1000;
const userId = DEV_USER.id;

function daysAgo(days) {
  return new Date(NOW.getTime() - days * DAY_IN_MS);
}

describe("cleanup", () => {
  const testDatabase = useTestDatabase();

  async function addTask(deletedAt, projectId = null) {
    const id = randomUUID();
    await testDatabase.db
      .insert(tasks)
      .values({ userId, id, title: "Task", position: 1, projectId, deletedAt });
    return id;
  }

  async function addProject(deletedAt) {
    const id = randomUUID();
    await testDatabase.db
      .insert(projects)
      .values({ userId, id, name: "Project", deletedAt });
    return id;
  }

  async function addRoutine(deletedAt) {
    const id = randomUUID();
    await testDatabase.db
      .insert(routines)
      .values({ userId, id, title: "Routine", position: 1, deletedAt });
    return id;
  }

  async function addSession({ expiresAt, revokedAt = null }) {
    const id = randomUUID();
    await testDatabase.db.insert(sessions).values({
      id,
      userId,
      tokenHash: randomUUID(),
      expiresAt,
      revokedAt,
    });
    return id;
  }

  async function ids(table) {
    return (await testDatabase.db.select({ id: table.id }).from(table))
      .map((row) => row.id)
      .sort();
  }

  it("removes tasks, projects and routines deleted more than 30 days ago", async () => {
    const oldTask = await addTask(daysAgo(31));
    const recentTask = await addTask(daysAgo(29));
    const activeTask = await addTask(null);
    const oldProject = await addProject(daysAgo(31));
    const recentProject = await addProject(daysAgo(29));
    const oldRoutine = await addRoutine(daysAgo(31));
    const recentRoutine = await addRoutine(daysAgo(29));

    const removed = await runCleanup(testDatabase.db, { now: NOW });

    expect(removed).toMatchObject({ tasks: 1, projects: 1, routines: 1 });
    expect(await ids(tasks)).toEqual([recentTask, activeTask].sort());
    expect(await ids(tasks)).not.toContain(oldTask);
    expect(await ids(projects)).toEqual([recentProject]);
    expect(await ids(projects)).not.toContain(oldProject);
    expect(await ids(routines)).toEqual([recentRoutine]);
    expect(await ids(routines)).not.toContain(oldRoutine);
  });

  it("keeps rows deleted exactly 30 days ago", async () => {
    await addTask(daysAgo(30));

    expect((await runCleanup(testDatabase.db, { now: NOW })).tasks).toBe(0);
  });

  it("removes the checks of a removed routine", async () => {
    const routineId = await addRoutine(daysAgo(31));
    await testDatabase.db
      .insert(routineChecks)
      .values({ userId, routineId, date: "2026-10-01", checked: true });

    await runCleanup(testDatabase.db, { now: NOW });

    expect(await testDatabase.db.select().from(routineChecks)).toEqual([]);
  });

  it("removes an old project together with its old deleted tasks", async () => {
    const projectId = await addProject(daysAgo(40));
    await addTask(daysAgo(35), projectId);

    const removed = await runCleanup(testDatabase.db, { now: NOW });

    expect(removed).toMatchObject({ tasks: 1, projects: 1 });
  });

  it("keeps an old project that a task still points to", async () => {
    const projectId = await addProject(daysAgo(40));
    const taskId = await addTask(daysAgo(5), projectId);

    const removed = await runCleanup(testDatabase.db, { now: NOW });

    expect(removed).toMatchObject({ tasks: 0, projects: 0 });
    expect(await ids(projects)).toEqual([projectId]);
    expect(await ids(tasks)).toEqual([taskId]);
  });

  it("removes expired sessions and sessions closed more than 30 days ago", async () => {
    const expired = await addSession({ expiresAt: daysAgo(1) });
    const closedLongAgo = await addSession({
      expiresAt: daysAgo(-10),
      revokedAt: daysAgo(31),
    });
    const closedRecently = await addSession({
      expiresAt: daysAgo(-10),
      revokedAt: daysAgo(2),
    });
    const active = await addSession({ expiresAt: daysAgo(-10) });

    const removed = await runCleanup(testDatabase.db, { now: NOW });

    expect(removed.sessions).toBe(2);
    expect(await ids(sessions)).toEqual([closedRecently, active].sort());
    expect(await ids(sessions)).not.toContain(expired);
    expect(await ids(sessions)).not.toContain(closedLongAgo);
  });

  it("removes expired email links and rate limit counters", async () => {
    await testDatabase.db.insert(emailTokens).values([
      {
        userId,
        purpose: "verify_email",
        tokenHash: "expired",
        email: DEV_USER.email,
        expiresAt: daysAgo(1),
      },
      {
        userId,
        purpose: "verify_email",
        tokenHash: "open",
        email: DEV_USER.email,
        expiresAt: daysAgo(-1),
      },
    ]);
    await testDatabase.db.insert(rateLimits).values([
      { key: "login:old", hits: 3, resetAt: daysAgo(1) },
      { key: "login:new", hits: 3, resetAt: daysAgo(-1) },
    ]);

    const removed = await runCleanup(testDatabase.db, { now: NOW });

    expect(removed).toMatchObject({ emailTokens: 1, rateLimits: 1 });
    expect(
      (await testDatabase.db.select().from(emailTokens)).map(
        (row) => row.tokenHash,
      ),
    ).toEqual(["open"]);
    expect(
      (await testDatabase.db.select().from(rateLimits)).map((row) => row.key),
    ).toEqual(["login:new"]);
  });

  it("removes nothing from an empty database and says so", async () => {
    await testDatabase.db.delete(sessions).where(eq(sessions.userId, userId));

    expect(await runCleanup(testDatabase.db, { now: NOW })).toEqual({
      tasks: 0,
      projects: 0,
      routines: 0,
      sessions: 0,
      emailTokens: 0,
      rateLimits: 0,
    });
  });
});
