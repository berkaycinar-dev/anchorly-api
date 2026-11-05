import { eq } from "drizzle-orm";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { DEV_USER } from "../src/constants/devUser.js";
import { projects, tasks, users } from "../src/db/schema/index.js";
import { importResultResponse } from "../src/docs/responseSchemas.js";
import { signedInAs } from "./helpers/auth.js";
import { createTestApp } from "./helpers/app.js";
import { useTestDatabase } from "./helpers/database.js";

const ids = {
  projectA: "bbbbbbbb-0000-4000-8000-0000000000a1",
  projectB: "bbbbbbbb-0000-4000-8000-0000000000a2",
  routineA: "bbbbbbbb-0000-4000-8000-0000000000b1",
  routineB: "bbbbbbbb-0000-4000-8000-0000000000b2",
  taskA: "bbbbbbbb-0000-4000-8000-0000000000c1",
  taskB: "bbbbbbbb-0000-4000-8000-0000000000c2",
  taskC: "bbbbbbbb-0000-4000-8000-0000000000c3",
  missingProject: "bbbbbbbb-0000-4000-8000-0000000000ff",
  missingRoutine: "bbbbbbbb-0000-4000-8000-0000000000fe",
};
const otherUser = {
  id: "22222222-2222-4222-8222-222222222222",
  email: "other@example.com",
};

function task(id, overrides = {}) {
  return { id, title: `Task ${id.slice(-2)}`, order: 0, ...overrides };
}

function payload(overrides = {}) {
  return {
    projects: [
      { id: ids.projectA, name: "Alpha" },
      { id: ids.projectB, name: "Beta" },
    ],
    routines: [
      { id: ids.routineA, title: "Read" },
      { id: ids.routineB, title: "Run" },
    ],
    routineChecks: [
      { routineId: ids.routineA, date: "2026-11-01", checked: true },
      { routineId: ids.routineB, date: "2026-11-02", checked: false },
    ],
    tasks: [
      task(ids.taskA, { order: 0, projectId: ids.projectA }),
      task(ids.taskB, { order: 1, completed: true, completedAt: "2026-11-03" }),
      task(ids.taskC, { order: 2, date: "2026-11-05", repeat: "daily" }),
    ],
    ...overrides,
  };
}

describe("POST /import", () => {
  const testDatabase = useTestDatabase();
  let app;
  let api;

  beforeEach(async () => {
    app = createTestApp({ database: testDatabase.database });
    api = await signedInAs(app, testDatabase.db);
  });

  it("adds everything the device had and reports the counts", async () => {
    const response = await api.post("/import").send(payload());

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      projects: { imported: 2, skipped: 0 },
      routines: { imported: 2, skipped: 0 },
      routineChecks: { imported: 2, skipped: 0 },
      tasks: { imported: 3, skipped: 0 },
    });
    expect(() => importResultResponse.parse(response.body)).not.toThrow();
  });

  it("keeps the order of projects, routines and tasks", async () => {
    await api.post("/import").send(payload());

    const projectList = (await api.get("/projects")).body;
    const routineList = (await api.get("/routines")).body;
    const taskList = (await api.get("/tasks")).body;

    expect(projectList.map((project) => project.id)).toEqual([
      ids.projectA,
      ids.projectB,
    ]);
    expect(routineList.map((routine) => routine.id)).toEqual([
      ids.routineA,
      ids.routineB,
    ]);
    expect(taskList.map((item) => item.id)).toEqual([
      ids.taskA,
      ids.taskB,
      ids.taskC,
    ]);
    expect(taskList.map((item) => item.order)).toEqual([0, 1, 2]);
  });

  it("keeps the sent order even when the ids sort differently", async () => {
    await api.post("/import").send(
      payload({
        projects: [
          { id: ids.projectB, name: "Beta" },
          { id: ids.projectA, name: "Alpha" },
        ],
        tasks: [
          task(ids.taskC, { order: 0 }),
          task(ids.taskA, { order: 1 }),
          task(ids.taskB, { order: 2 }),
        ],
      }),
    );

    expect((await api.get("/projects")).body.map((item) => item.id)).toEqual([
      ids.projectB,
      ids.projectA,
    ]);
    expect((await api.get("/tasks")).body.map((item) => item.id)).toEqual([
      ids.taskC,
      ids.taskA,
      ids.taskB,
    ]);
  });

  it("stores the task fields and the routine checks", async () => {
    await api.post("/import").send(payload());

    const taskList = (await api.get("/tasks")).body;
    const checks = (await api.get("/routines/checks")).body;

    expect(taskList[0].projectId).toBe(ids.projectA);
    expect(taskList[1]).toMatchObject({
      completed: true,
      completedAt: "2026-11-03",
    });
    expect(taskList[2]).toMatchObject({ date: "2026-11-05", repeat: "daily" });
    expect(checks).toEqual([
      { routineId: ids.routineA, date: "2026-11-01", checked: true },
      { routineId: ids.routineB, date: "2026-11-02", checked: false },
    ]);
  });

  it("adds new routines after the ones the account already has", async () => {
    await api.post("/routines").send({ id: ids.missingRoutine, title: "Old" });

    await api.post("/import").send(payload());

    const routineList = (await api.get("/routines")).body;

    expect(routineList.map((routine) => routine.id)).toEqual([
      ids.missingRoutine,
      ids.routineA,
      ids.routineB,
    ]);
  });

  it("creates no copies when the same data is sent twice", async () => {
    await api.post("/import").send(payload());

    const second = await api.post("/import").send(payload());

    expect(second.body).toEqual({
      projects: { imported: 0, skipped: 2 },
      routines: { imported: 0, skipped: 2 },
      routineChecks: { imported: 0, skipped: 2 },
      tasks: { imported: 0, skipped: 3 },
    });
    expect((await api.get("/tasks")).body).toHaveLength(3);
    expect((await api.get("/projects")).body).toHaveLength(2);
  });

  it("keeps the server version when an id already exists", async () => {
    await api.post("/projects").send({ id: ids.projectA, name: "Server" });
    await api.post("/tasks").send(task(ids.taskA, { title: "Server task" }));
    await api.post("/routines").send({ id: ids.routineA, title: "Server" });
    await api
      .put(`/routines/${ids.routineA}/checks/2026-11-01`)
      .send({ checked: false });

    const response = await api.post("/import").send(payload());

    expect(response.body.projects).toEqual({ imported: 1, skipped: 1 });
    expect(response.body.tasks).toEqual({ imported: 2, skipped: 1 });
    expect(response.body.routines).toEqual({ imported: 1, skipped: 1 });
    expect(response.body.routineChecks).toEqual({ imported: 1, skipped: 1 });
    expect((await api.get("/projects")).body[0].name).toBe("Server");
    expect(
      (await api.get("/tasks")).body.find((item) => item.id === ids.taskA)
        .title,
    ).toBe("Server task");
    expect(
      (await api.get("/routines/checks")).body.find(
        (check) => check.routineId === ids.routineA,
      ).checked,
    ).toBe(false);
  });

  it("does not bring back a task that was deleted", async () => {
    await api.post("/tasks").send(task(ids.taskA));
    await api.delete(`/tasks/${ids.taskA}`);

    const response = await api.post("/import").send(payload());

    expect(response.body.tasks).toEqual({ imported: 2, skipped: 1 });
    expect(
      (await api.get("/tasks")).body.some((item) => item.id === ids.taskA),
    ).toBe(false);
  });

  it("clears a project the account does not have from a task", async () => {
    const response = await api.post("/import").send(
      payload({
        projects: [],
        tasks: [task(ids.taskA, { projectId: ids.missingProject })],
      }),
    );

    expect(response.status).toBe(200);
    expect((await api.get("/tasks")).body[0].projectId).toBeNull();
  });

  it("links a task to a project the account already had", async () => {
    await api.post("/projects").send({ id: ids.projectA, name: "Existing" });

    await api.post("/import").send(
      payload({
        projects: [],
        tasks: [task(ids.taskA, { projectId: ids.projectA })],
      }),
    );

    expect((await api.get("/tasks")).body[0].projectId).toBe(ids.projectA);
  });

  it("skips checks for routines that do not exist", async () => {
    const response = await api.post("/import").send(
      payload({
        routineChecks: [
          { routineId: ids.routineA, date: "2026-11-01", checked: true },
          { routineId: ids.missingRoutine, date: "2026-11-01", checked: true },
        ],
      }),
    );

    expect(response.body.routineChecks).toEqual({ imported: 1, skipped: 1 });
  });

  it("accepts an empty import", async () => {
    const response = await api.post("/import").send({});

    expect(response.status).toBe(200);
    expect(response.body.tasks).toEqual({ imported: 0, skipped: 0 });
  });

  it("ignores attachments sent with a task", async () => {
    const response = await api.post("/import").send(
      payload({
        projects: [],
        tasks: [
          task(ids.taskA, { attachments: [{ id: "x", data: "base64" }] }),
        ],
      }),
    );

    expect(response.status).toBe(200);
    expect((await api.get("/tasks")).body[0].attachments).toEqual([]);
  });

  it("accepts a body larger than the normal 100 KB limit", async () => {
    const manyTasks = Array.from({ length: 400 }, (_, index) => ({
      id: `cccccccc-0000-4000-8000-${String(index).padStart(12, "0")}`,
      title: `Task ${index}`,
      order: index,
      description: "x".repeat(1000),
    }));

    const response = await api.post("/import").send({ tasks: manyTasks });

    expect(response.status).toBe(200);
    expect(response.body.tasks).toEqual({ imported: 400, skipped: 0 });
  });

  it("still limits the size of an import", async () => {
    const response = await api
      .post("/import")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ padding: "x".repeat(9 * 1024 * 1024) }));

    expect(response.status).toBe(413);
  });

  it("keeps the normal body limit on other routes", async () => {
    const response = await api
      .post("/tasks")
      .send(task(ids.taskA, { description: "x".repeat(200 * 1024) }));

    expect(response.status).toBe(413);
  });

  it("rejects the whole import when one record is invalid", async () => {
    const response = await api.post("/import").send(
      payload({
        tasks: [task(ids.taskA), task(ids.taskB, { category: "Unknown" })],
      }),
    );

    expect(response.status).toBe(400);
    expect((await api.get("/projects")).body).toEqual([]);
    expect((await api.get("/tasks")).body).toEqual([]);
  });

  it("rejects repeated ids in one import", async () => {
    const response = await api
      .post("/import")
      .send(payload({ tasks: [task(ids.taskA), task(ids.taskA)] }));

    expect(response.status).toBe(400);
  });

  it("rejects fields it does not know", async () => {
    const response = await api.post("/import").send({ settings: {} });

    expect(response.status).toBe(400);
  });

  it("rejects too many tasks", async () => {
    const tooMany = Array.from({ length: 5001 }, (_, index) => ({
      id: `dddddddd-0000-4000-8000-${String(index).padStart(12, "0")}`,
      title: "T",
      order: index,
    }));

    const response = await api.post("/import").send({ tasks: tooMany });

    expect(response.status).toBe(400);
  });

  it("needs a signed-in user", async () => {
    const response = await request(app).post("/import").send(payload());

    expect(response.status).toBe(401);
  });

  it("keeps other users' data apart", async () => {
    await testDatabase.db.insert(users).values(otherUser);
    await testDatabase.db
      .insert(projects)
      .values({ userId: otherUser.id, id: ids.projectA, name: "Theirs" });
    await testDatabase.db.insert(tasks).values({
      userId: otherUser.id,
      id: ids.taskA,
      title: "Theirs",
      position: 0,
    });

    const response = await api.post("/import").send(payload());

    expect(response.body.projects).toEqual({ imported: 2, skipped: 0 });
    expect(response.body.tasks).toEqual({ imported: 3, skipped: 0 });
    const theirs = await testDatabase.db
      .select()
      .from(tasks)
      .where(eq(tasks.userId, otherUser.id));

    expect(theirs).toHaveLength(1);
    expect(theirs[0].title).toBe("Theirs");
    expect(
      (await testDatabase.db.select().from(tasks)).filter(
        (row) => row.userId === DEV_USER.id,
      ),
    ).toHaveLength(3);
  });
});
