import { asc, eq, sql } from "drizzle-orm";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { DEV_USER } from "../src/constants/devUser.js";
import {
  projects,
  routineChecks,
  routines,
  sessions,
  tasks,
  userSettings,
  users,
} from "../src/db/schema/index.js";
import { useTestDatabase } from "./helpers/database.js";

const victim = {
  id: "99999999-9999-4999-8999-999999999999",
  email: "victim@example.com",
};
const projectId = "678e4529-fa35-432c-8baa-6a1298ba43f1";
const routineId = "88444dfd-8be1-4578-956f-037a0b71e8b7";
const taskId = "4cbd7450-6231-43eb-96a2-3be6d2b1d532";
const ownTaskId = "0ddd41bd-4d45-4fa4-8c46-5cf610c1f634";
const checkDate = "2026-10-28";

const USER_DATA_TABLES = {
  users,
  user_settings: userSettings,
  projects,
  routines,
  routine_checks: routineChecks,
  sessions,
  tasks,
};

async function seedVictim(db) {
  await db.insert(users).values(victim);
  await db.insert(userSettings).values({ userId: victim.id, theme: "pink" });
  await db
    .insert(projects)
    .values({ userId: victim.id, id: projectId, name: "Victim project" });
  await db.insert(routines).values({
    userId: victim.id,
    id: routineId,
    title: "Victim routine",
    position: 0,
  });
  await db.insert(routineChecks).values({
    userId: victim.id,
    routineId,
    date: checkDate,
    checked: true,
  });
  await db.insert(tasks).values({
    userId: victim.id,
    id: taskId,
    projectId,
    title: "Victim task",
    position: 0,
  });
  await db.insert(sessions).values({
    userId: victim.id,
    tokenHash: "victim-token-hash",
    deviceName: "Victim phone",
    expiresAt: new Date("2026-11-30T00:00:00Z"),
  });
}

async function snapshotVictim(db) {
  const snapshot = {};

  for (const [name, table] of Object.entries(USER_DATA_TABLES)) {
    const ownerColumn = name === "users" ? table.id : table.userId;

    snapshot[name] = await db
      .select()
      .from(table)
      .where(eq(ownerColumn, victim.id))
      .orderBy(asc(ownerColumn));
  }

  return snapshot;
}

const ATTEMPTS = [
  {
    name: "rename the victim's project",
    send: (app) =>
      request(app).patch(`/projects/${projectId}`).send({ name: "Mine now" }),
    status: 404,
  },
  {
    name: "delete the victim's project",
    send: (app) => request(app).delete(`/projects/${projectId}`),
    status: 404,
  },
  {
    name: "rename the victim's routine",
    send: (app) =>
      request(app).patch(`/routines/${routineId}`).send({ title: "Mine now" }),
    status: 404,
  },
  {
    name: "delete the victim's routine",
    send: (app) => request(app).delete(`/routines/${routineId}`),
    status: 404,
  },
  {
    name: "uncheck the victim's routine",
    send: (app) =>
      request(app)
        .put(`/routines/${routineId}/checks/${checkDate}`)
        .send({ checked: false }),
    status: 404,
  },
  {
    name: "edit the victim's task",
    send: (app) =>
      request(app)
        .patch(`/tasks/${taskId}`)
        .send({ title: "Mine now", projectId: null }),
    status: 404,
  },
  {
    name: "delete the victim's task",
    send: (app) => request(app).delete(`/tasks/${taskId}`),
    status: 404,
  },
  {
    name: "reorder the victim's task",
    send: (app) =>
      request(app)
        .post("/tasks/reorder")
        .send({ orderedIds: [taskId] }),
    status: 404,
  },
  {
    name: "delete the victim's task in a bulk request",
    send: (app) =>
      request(app)
        .post("/tasks/bulk")
        .send({ operations: [{ type: "delete", id: taskId }] }),
    status: 404,
  },
  {
    name: "update the victim's task in a bulk request",
    send: (app) =>
      request(app)
        .post("/tasks/bulk")
        .send({
          operations: [
            {
              type: "update",
              id: taskId,
              patch: { completed: true, completedAt: checkDate },
            },
          ],
        }),
    status: 404,
  },
  {
    name: "create a task inside the victim's project",
    send: (app) =>
      request(app)
        .post("/tasks")
        .send({ id: ownTaskId, title: "Sneaky", order: 0, projectId }),
    status: 400,
  },
  {
    name: "move an own task into the victim's project",
    send: async (app) => {
      await request(app)
        .post("/tasks")
        .send({ id: ownTaskId, title: "Own", order: 0 });

      return request(app).patch(`/tasks/${ownTaskId}`).send({ projectId });
    },
    status: 400,
  },
  {
    name: "change settings",
    send: (app) => request(app).patch("/me/settings").send({ theme: "black" }),
    status: 200,
  },
  {
    name: "create a project with the victim's project id",
    send: (app) =>
      request(app)
        .post("/projects")
        .send({ id: projectId, name: "Victim project" }),
    status: 201,
  },
  {
    name: "create a task with the victim's task id",
    send: (app) =>
      request(app)
        .post("/tasks")
        .send({ id: taskId, title: "Victim task", order: 0 }),
    status: 201,
  },
];

describe("user isolation", () => {
  const testDatabase = useTestDatabase();
  let app;

  beforeEach(async () => {
    app = createApp({ database: testDatabase.database });
    await seedVictim(testDatabase.db);
  });

  it("covers every table that holds user data", async () => {
    const result = await testDatabase.db.execute(
      sql`select tablename from pg_tables where schemaname = 'public' order by tablename`,
    );

    expect(result.rows.map((row) => row.tablename)).toEqual(
      Object.keys(USER_DATA_TABLES).sort(),
    );
  });

  describe("reading never shows another user's data", () => {
    it("lists only the current user's projects, routines, checks and tasks", async () => {
      const [projectList, routineList, checkList, taskList] = await Promise.all(
        ["/projects", "/routines", "/routines/checks", "/tasks"].map((path) =>
          request(app).get(path),
        ),
      );

      expect(projectList.body).toEqual([]);
      expect(routineList.body).toEqual([]);
      expect(checkList.body).toEqual([]);
      expect(taskList.body).toEqual([]);
    });

    it("returns the current user's own settings", async () => {
      const response = await request(app).get("/me/settings");

      expect(response.body.theme).toBe("gray");
    });
  });

  describe("writing never changes another user's data", () => {
    for (const attempt of ATTEMPTS) {
      it(`cannot ${attempt.name}`, async () => {
        const before = await snapshotVictim(testDatabase.db);

        const response = await attempt.send(app);

        expect(response.status).toBe(attempt.status);
        expect(await snapshotVictim(testDatabase.db)).toEqual(before);
      });
    }
  });

  it("keeps the development user's own data separate", async () => {
    await request(app)
      .post("/projects")
      .send({ id: projectId, name: "Victim project" });

    const ownRows = await testDatabase.db
      .select()
      .from(projects)
      .where(eq(projects.userId, DEV_USER.id));

    expect(ownRows).toHaveLength(1);
    expect((await request(app).get("/projects")).body).toEqual([
      { id: projectId, name: "Victim project" },
    ]);
  });
});
