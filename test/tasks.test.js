import { and, eq } from "drizzle-orm";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { DEV_USER } from "../src/constants/devUser.js";
import { projects, tasks, users } from "../src/db/schema/index.js";
import { useTestDatabase } from "./helpers/database.js";

const taskId = "4cbd7450-6231-43eb-96a2-3be6d2b1d532";
const secondTaskId = "7847517c-0da1-474d-8f46-fb2f9fc009fc";
const missingId = "9d1c3b7e-0000-4000-8000-000000000000";
const projectId = "678e4529-fa35-432c-8baa-6a1298ba43f1";
const deletedProjectId = "f9eeef00-3cc4-4b6f-9f33-29dc56ba3508";
const repeatGroupId = "c0ffee00-0000-4000-8000-000000000001";
const otherUser = {
  id: "22222222-2222-4222-8222-222222222222",
  email: "other@example.com",
};

const defaultTask = {
  category: "Work",
  date: "",
  completed: false,
  completedAt: null,
  projectId: null,
  description: "",
  steps: [],
  repeat: "none",
  repeatGroupId: null,
  attachments: [],
};

const fullTask = {
  id: taskId,
  title: "Write report",
  category: "Project",
  date: "2026-10-28",
  completed: true,
  completedAt: "2026-10-28",
  projectId,
  description: "Quarterly numbers",
  steps: [
    { id: "a3f1c2d4-0000-4000-8000-000000000001", text: "Draft", done: true },
    { id: "a3f1c2d4-0000-4000-8000-000000000002", text: "Review", done: false },
  ],
  order: 1761500000000,
  repeat: "daily",
  repeatGroupId,
  attachments: [],
};

describe("/tasks", () => {
  const testDatabase = useTestDatabase();
  let app;

  beforeEach(async () => {
    app = createApp({ database: testDatabase.database });
    await testDatabase.db.insert(projects).values([
      { userId: DEV_USER.id, id: projectId, name: "Portfolio" },
      {
        userId: DEV_USER.id,
        id: deletedProjectId,
        name: "Old",
        deletedAt: new Date(),
      },
    ]);
  });

  function createTask(body) {
    return request(app).post("/tasks").send(body);
  }

  function patchTask(id, body) {
    return request(app).patch(`/tasks/${id}`).send(body);
  }

  async function readTaskRow(userId, id) {
    const [row] = await testDatabase.db
      .select()
      .from(tasks)
      .where(and(eq(tasks.userId, userId), eq(tasks.id, id)));

    return row;
  }

  async function addOtherUserTask(id) {
    await testDatabase.db.insert(users).values(otherUser);
    await testDatabase.db
      .insert(tasks)
      .values({ userId: otherUser.id, id, title: "Secret", position: 0 });
  }

  describe("GET /", () => {
    it("returns an empty list when the user has no tasks", async () => {
      const response = await request(app).get("/tasks");

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });

    it("lists the user's active tasks in the order they were created", async () => {
      await addOtherUserTask(missingId);
      await createTask({ id: taskId, title: "First", order: 5 });
      await createTask({ id: secondTaskId, title: "Second", order: 1 });
      await createTask({ id: missingId, title: "Deleted", order: 2 });
      await request(app).delete(`/tasks/${missingId}`);

      const response = await request(app).get("/tasks");

      expect(response.body).toEqual([
        { ...defaultTask, id: taskId, title: "First", order: 5 },
        { ...defaultTask, id: secondTaskId, title: "Second", order: 1 },
      ]);
    });
  });

  describe("POST /", () => {
    it("fills the frontend defaults for a minimal task", async () => {
      const response = await createTask({
        id: taskId,
        title: "  Write report  ",
        order: 0,
      });

      expect(response.status).toBe(201);
      expect(response.body).toEqual({
        ...defaultTask,
        id: taskId,
        title: "Write report",
        order: 0,
      });
      expect((await readTaskRow(DEV_USER.id, taskId)).date).toBeNull();
    });

    it("stores every field of a full task", async () => {
      const response = await createTask(fullTask);

      expect(response.status).toBe(201);
      expect(response.body).toEqual(fullTask);
      expect((await request(app).get("/tasks")).body).toEqual([fullTask]);
    });

    it("ignores attachments until they get their own storage", async () => {
      const response = await createTask({
        id: taskId,
        title: "With file",
        order: 0,
        attachments: [
          { id: "x", name: "a.png", data: "data:image/png;base64" },
        ],
      });

      expect(response.status).toBe(201);
      expect(response.body.attachments).toEqual([]);
    });

    it("answers a repeated identical request with the existing task", async () => {
      await createTask(fullTask);

      const response = await createTask(fullTask);

      expect(response.status).toBe(200);
      expect(response.body).toEqual(fullTask);
      expect(await testDatabase.db.select().from(tasks)).toHaveLength(1);
    });

    it("rejects an existing or deleted id with conflicting data", async () => {
      await createTask(fullTask);
      await createTask({ id: secondTaskId, title: "Gone", order: 0 });
      await request(app).delete(`/tasks/${secondTaskId}`);

      const changedTitle = await createTask({ ...fullTask, title: "Other" });
      const changedStep = await createTask({
        ...fullTask,
        steps: [{ ...fullTask.steps[0], done: false }, fullTask.steps[1]],
      });
      const deletedId = await createTask({
        id: secondTaskId,
        title: "Gone",
        order: 0,
      });

      expect(changedTitle.status).toBe(409);
      expect(changedStep.status).toBe(409);
      expect(deletedId.status).toBe(409);
    });

    it("allows an id that another user already uses", async () => {
      await addOtherUserTask(taskId);

      const response = await createTask({
        id: taskId,
        title: "Mine",
        order: 0,
      });

      expect(response.status).toBe(201);
    });

    it("rejects a completion date on an unfinished task", async () => {
      const response = await createTask({
        id: taskId,
        title: "Not done",
        order: 0,
        completedAt: "2026-10-28",
      });

      expect(response.status).toBe(400);
      expect(response.body.error.details[0].path).toBe("body.completedAt");
    });

    it("rejects a project that is missing, deleted or not the user's", async () => {
      await addOtherUserTask(missingId);
      await testDatabase.db
        .insert(projects)
        .values({ userId: otherUser.id, id: missingId, name: "Foreign" });

      for (const id of [
        "aaaaaaaa-0000-4000-8000-000000000000",
        deletedProjectId,
        missingId,
      ]) {
        const response = await createTask({
          id: taskId,
          title: "Task",
          order: 0,
          projectId: id,
        });

        expect(response.status).toBe(400);
        expect(response.body.error.details[0].path).toBe("body.projectId");
      }

      expect(await readTaskRow(DEV_USER.id, taskId)).toBeUndefined();
    });

    it("rejects invalid task data", async () => {
      const valid = { id: taskId, title: "Task", order: 0 };
      const step = fullTask.steps[0];
      const cases = [
        { id: taskId, order: 0 },
        { id: taskId, title: "Task" },
        { ...valid, category: "Shopping" },
        { ...valid, date: "2026-1-5" },
        { ...valid, order: -1 },
        { ...valid, order: 1.5 },
        { ...valid, repeat: "monthly" },
        { ...valid, steps: [{ text: "No id", done: false }] },
        { ...valid, steps: [{ ...step, color: "red" }] },
        { ...valid, color: "blue" },
      ];

      for (const body of cases) {
        const response = await createTask(body);

        expect(response.status).toBe(400);
      }

      expect(await testDatabase.db.select().from(tasks)).toEqual([]);
    });
  });

  describe("PATCH /:id", () => {
    beforeEach(async () => {
      await createTask({ id: taskId, title: "Write report", order: 0 });
    });

    it("accepts the whole task object the frontend sends", async () => {
      const response = await patchTask(taskId, {
        ...fullTask,
        attachments: [{ id: "x", name: "a.png", data: "data:image/png" }],
      });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(fullTask);
    });

    it("changes only the fields that are sent", async () => {
      const response = await patchTask(taskId, { title: "Final report" });

      expect(response.body).toEqual({
        ...defaultTask,
        id: taskId,
        title: "Final report",
        order: 0,
      });
    });

    it("completes and reopens a task", async () => {
      const done = await patchTask(taskId, {
        completed: true,
        completedAt: "2026-10-28",
      });
      const reopened = await patchTask(taskId, {
        completed: false,
        completedAt: null,
      });

      expect(done.body.completedAt).toBe("2026-10-28");
      expect(reopened.body).toMatchObject({
        completed: false,
        completedAt: null,
      });
    });

    it("rejects a change that leaves an unfinished task with a completion date", async () => {
      await patchTask(taskId, { completed: true, completedAt: "2026-10-28" });

      const reopenOnly = await patchTask(taskId, { completed: false });

      expect(reopenOnly.status).toBe(400);
      expect(reopenOnly.body.error.details[0].path).toBe("body.completedAt");
      expect((await readTaskRow(DEV_USER.id, taskId)).completed).toBe(true);
    });

    it("rejects a completion date on an unfinished task", async () => {
      const response = await patchTask(taskId, { completedAt: "2026-10-28" });

      expect(response.status).toBe(400);
    });

    it("clears the date with an empty string", async () => {
      await patchTask(taskId, { date: "2026-10-28" });

      const response = await patchTask(taskId, { date: "" });

      expect(response.body.date).toBe("");
      expect((await readTaskRow(DEV_USER.id, taskId)).date).toBeNull();
    });

    it("moves a task into and out of a project", async () => {
      const assigned = await patchTask(taskId, { projectId });
      const removed = await patchTask(taskId, { projectId: null });
      const deleted = await patchTask(taskId, { projectId: deletedProjectId });

      expect(assigned.body.projectId).toBe(projectId);
      expect(removed.body.projectId).toBeNull();
      expect(deleted.status).toBe(400);
    });

    it("refuses to change the task id", async () => {
      const response = await patchTask(taskId, {
        id: secondTaskId,
        title: "Renamed",
      });

      expect(response.status).toBe(400);
      expect(response.body.error.details[0].path).toBe("body.id");
      expect((await readTaskRow(DEV_USER.id, taskId)).title).toBe(
        "Write report",
      );
    });

    it("rejects an unknown field", async () => {
      const response = await patchTask(taskId, { titel: "Typo" });

      expect(response.status).toBe(400);
      expect(response.body.error.details[0].message).toContain("titel");
    });

    it("answers 404 for a missing, deleted or foreign task", async () => {
      await addOtherUserTask(missingId);
      await createTask({ id: secondTaskId, title: "Gone", order: 1 });
      await request(app).delete(`/tasks/${secondTaskId}`);

      for (const id of [
        "aaaaaaaa-0000-4000-8000-000000000000",
        secondTaskId,
        missingId,
      ]) {
        const response = await patchTask(id, { title: "Renamed" });

        expect(response.status).toBe(404);
      }

      expect((await readTaskRow(otherUser.id, missingId)).title).toBe("Secret");
    });
  });

  describe("DELETE /:id", () => {
    it("hides the task but keeps its row", async () => {
      await createTask({ id: taskId, title: "Write report", order: 0 });

      const response = await request(app).delete(`/tasks/${taskId}`);

      expect(response.status).toBe(204);
      expect((await request(app).get("/tasks")).body).toEqual([]);
      expect((await readTaskRow(DEV_USER.id, taskId)).deletedAt).toBeInstanceOf(
        Date,
      );
    });

    it("answers 404 for a missing, deleted or foreign task", async () => {
      await addOtherUserTask(missingId);
      await createTask({ id: taskId, title: "Write report", order: 0 });
      await request(app).delete(`/tasks/${taskId}`);

      for (const id of [secondTaskId, taskId, missingId]) {
        const response = await request(app).delete(`/tasks/${id}`);

        expect(response.status).toBe(404);
      }

      expect((await readTaskRow(otherUser.id, missingId)).deletedAt).toBeNull();
    });
  });
});
