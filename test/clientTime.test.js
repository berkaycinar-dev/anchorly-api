import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { DEV_USER } from "../src/constants/devUser.js";
import {
  projects,
  routineChecks,
  routines,
  tasks,
  userSettings,
} from "../src/db/schema/index.js";
import { signedInAs } from "./helpers/auth.js";
import { createTestApp } from "./helpers/app.js";
import { useTestDatabase } from "./helpers/database.js";

const taskId = "4cbd7450-6231-43eb-96a2-3be6d2b1d532";
const secondTaskId = "7847517c-0da1-474d-8f46-fb2f9fc009fc";
const projectId = "678e4529-fa35-432c-8baa-6a1298ba43f1";
const routineId = "0f5b3c1e-0000-4000-8000-000000000001";
const missingId = "9d1c3b7e-0000-4000-8000-000000000000";

function minutesAgo(minutes) {
  return new Date(Date.now() - minutes * 60000);
}

function at(date) {
  return date.toISOString();
}

describe("client time (last writer wins)", () => {
  const testDatabase = useTestDatabase();
  let app;
  let api;

  beforeEach(async () => {
    app = createTestApp({ database: testDatabase.database });
    api = await signedInAs(app, testDatabase.db);
  });

  async function insertTask(id, updatedAt, overrides = {}) {
    await testDatabase.db.insert(tasks).values({
      userId: DEV_USER.id,
      id,
      title: "Original",
      position: 1,
      updatedAt,
      ...overrides,
    });
  }

  async function readTask(id) {
    const [row] = await testDatabase.db
      .select()
      .from(tasks)
      .where(and(eq(tasks.userId, DEV_USER.id), eq(tasks.id, id)));

    return row;
  }

  describe("the header", () => {
    it("rejects a value that is not an ISO date and time", async () => {
      const response = await api
        .patch(`/tasks/${taskId}`)
        .set("X-Client-Time", "yesterday")
        .send({ title: "x" });

      expect(response.status).toBe(400);
      expect(response.body.error.details[0].path).toBe("headers.x-client-time");
    });

    it("rejects a date and time without a time zone", async () => {
      const response = await api
        .patch(`/tasks/${taskId}`)
        .set("X-Client-Time", "2026-11-05T10:00:00")
        .send({ title: "x" });

      expect(response.status).toBe(400);
    });

    it("treats a time in the future as now", async () => {
      await insertTask(taskId, minutesAgo(5));
      const future = new Date(Date.now() + 3600000);

      const response = await api
        .patch(`/tasks/${taskId}`)
        .set("X-Client-Time", at(future))
        .send({ title: "Changed" });

      expect(response.status).toBe(200);
      expect((await readTask(taskId)).updatedAt.getTime()).toBeLessThan(
        future.getTime() - 60000,
      );
    });

    it("keeps working without the header", async () => {
      await insertTask(taskId, minutesAgo(5));

      const response = await api
        .patch(`/tasks/${taskId}`)
        .send({ title: "Changed" });

      expect(response.status).toBe(200);
      expect(response.body.title).toBe("Changed");
    });
  });

  describe("tasks", () => {
    it("applies a change that is newer than the stored row and stores its time", async () => {
      await insertTask(taskId, minutesAgo(10));
      const clientTime = minutesAgo(5);

      const response = await api
        .patch(`/tasks/${taskId}`)
        .set("X-Client-Time", at(clientTime))
        .send({ title: "Changed" });

      expect(response.status).toBe(200);
      expect(response.body.title).toBe("Changed");
      expect((await readTask(taskId)).updatedAt).toEqual(clientTime);
    });

    it("skips a change that is older than the stored row and returns the current task", async () => {
      await insertTask(taskId, minutesAgo(5));

      const response = await api
        .patch(`/tasks/${taskId}`)
        .set("X-Client-Time", at(minutesAgo(10)))
        .send({ title: "Stale" });

      expect(response.status).toBe(200);
      expect(response.body.title).toBe("Original");
      expect((await readTask(taskId)).title).toBe("Original");
    });

    it("still answers 404 for a task that does not exist", async () => {
      const response = await api
        .patch(`/tasks/${missingId}`)
        .set("X-Client-Time", at(minutesAgo(1)))
        .send({ title: "x" });

      expect(response.status).toBe(404);
    });

    it("lets a later queued change pass after an earlier one from the same queue", async () => {
      const created = await api
        .post("/tasks")
        .set("X-Client-Time", at(minutesAgo(20)))
        .send({ id: taskId, title: "Queued", order: 1 });
      const changed = await api
        .patch(`/tasks/${taskId}`)
        .set("X-Client-Time", at(minutesAgo(10)))
        .send({ title: "Queued again" });

      expect(created.status).toBe(201);
      expect(changed.body.title).toBe("Queued again");
      expect((await readTask(taskId)).title).toBe("Queued again");
    });

    it("stores the client time on a created task", async () => {
      const clientTime = minutesAgo(30);

      await api
        .post("/tasks")
        .set("X-Client-Time", at(clientTime))
        .send({ id: taskId, title: "Queued", order: 1 });

      expect((await readTask(taskId)).updatedAt).toEqual(clientTime);
    });

    it("skips a delete that is older than the stored row", async () => {
      await insertTask(taskId, minutesAgo(5));

      const response = await api
        .delete(`/tasks/${taskId}`)
        .set("X-Client-Time", at(minutesAgo(10)));

      expect(response.status).toBe(204);
      expect((await readTask(taskId)).deletedAt).toBeNull();
    });

    it("applies a delete that is newer than the stored row", async () => {
      await insertTask(taskId, minutesAgo(10));
      const clientTime = minutesAgo(5);

      const response = await api
        .delete(`/tasks/${taskId}`)
        .set("X-Client-Time", at(clientTime));

      expect(response.status).toBe(204);
      expect((await readTask(taskId)).deletedAt).toEqual(clientTime);
    });

    it("still answers 404 when deleting a task that does not exist", async () => {
      const response = await api
        .delete(`/tasks/${missingId}`)
        .set("X-Client-Time", at(minutesAgo(1)));

      expect(response.status).toBe(404);
    });

    it("decides every operation of a bulk request on its own", async () => {
      await insertTask(taskId, minutesAgo(5));
      await insertTask(secondTaskId, minutesAgo(30), { position: 2 });

      const response = await api
        .post("/tasks/bulk")
        .set("X-Client-Time", at(minutesAgo(10)))
        .send({
          operations: [
            { type: "update", id: taskId, patch: { title: "Stale" } },
            { type: "update", id: secondTaskId, patch: { title: "Fresh" } },
          ],
        });

      expect(response.status).toBe(200);
      expect((await readTask(taskId)).title).toBe("Original");
      expect((await readTask(secondTaskId)).title).toBe("Fresh");
    });

    it("never moves the time of a row backwards when reordering", async () => {
      const reorderTime = minutesAgo(10);
      await insertTask(taskId, minutesAgo(5));
      await insertTask(secondTaskId, minutesAgo(30), { position: 2 });

      const response = await api
        .post("/tasks/reorder")
        .set("X-Client-Time", at(reorderTime))
        .send({ orderedIds: [secondTaskId, taskId] });

      expect(response.status).toBe(204);
      expect((await readTask(taskId)).position).toBe(1);
      expect((await readTask(secondTaskId)).position).toBe(0);
      expect(
        (await readTask(taskId)).updatedAt.getTime(),
      ).toBeGreaterThanOrEqual(minutesAgo(6).getTime());
      expect((await readTask(secondTaskId)).updatedAt).toEqual(reorderTime);
    });
  });

  describe("projects", () => {
    async function insertProject(updatedAt) {
      await testDatabase.db.insert(projects).values({
        userId: DEV_USER.id,
        id: projectId,
        name: "Original",
        updatedAt,
      });
    }

    async function readProject() {
      const [row] = await testDatabase.db
        .select()
        .from(projects)
        .where(eq(projects.id, projectId));

      return row;
    }

    it("skips a rename that is older than the stored row", async () => {
      await insertProject(minutesAgo(5));

      const response = await api
        .patch(`/projects/${projectId}`)
        .set("X-Client-Time", at(minutesAgo(10)))
        .send({ name: "Stale" });

      expect(response.status).toBe(200);
      expect(response.body.name).toBe("Original");
    });

    it("applies a rename that is newer than the stored row", async () => {
      await insertProject(minutesAgo(10));

      const response = await api
        .patch(`/projects/${projectId}`)
        .set("X-Client-Time", at(minutesAgo(5)))
        .send({ name: "Fresh" });

      expect(response.body.name).toBe("Fresh");
    });

    it("skips a delete that is older than the stored row and keeps the tasks linked", async () => {
      await insertProject(minutesAgo(5));
      await insertTask(taskId, minutesAgo(30), { projectId });

      const response = await api
        .delete(`/projects/${projectId}`)
        .set("X-Client-Time", at(minutesAgo(10)));

      expect(response.status).toBe(204);
      expect((await readProject()).deletedAt).toBeNull();
      expect((await readTask(taskId)).projectId).toBe(projectId);
    });

    it("unlinks the tasks on a newer delete without moving their time backwards", async () => {
      await insertProject(minutesAgo(30));
      await insertTask(taskId, minutesAgo(2), { projectId });

      await api
        .delete(`/projects/${projectId}`)
        .set("X-Client-Time", at(minutesAgo(10)));

      const task = await readTask(taskId);

      expect(task.projectId).toBeNull();
      expect(task.updatedAt.getTime()).toBeGreaterThanOrEqual(
        minutesAgo(3).getTime(),
      );
    });

    it("still answers 404 for a project that does not exist", async () => {
      const response = await api
        .delete(`/projects/${missingId}`)
        .set("X-Client-Time", at(minutesAgo(1)));

      expect(response.status).toBe(404);
    });
  });

  describe("routines", () => {
    async function insertRoutine(updatedAt) {
      await testDatabase.db.insert(routines).values({
        userId: DEV_USER.id,
        id: routineId,
        title: "Original",
        position: 0,
        updatedAt,
      });
    }

    async function readRoutine() {
      const [row] = await testDatabase.db
        .select()
        .from(routines)
        .where(eq(routines.id, routineId));

      return row;
    }

    it("skips a rename that is older than the stored row", async () => {
      await insertRoutine(minutesAgo(5));

      const response = await api
        .patch(`/routines/${routineId}`)
        .set("X-Client-Time", at(minutesAgo(10)))
        .send({ title: "Stale" });

      expect(response.status).toBe(200);
      expect(response.body.title).toBe("Original");
    });

    it("applies a rename that is newer than the stored row", async () => {
      await insertRoutine(minutesAgo(10));

      const response = await api
        .patch(`/routines/${routineId}`)
        .set("X-Client-Time", at(minutesAgo(5)))
        .send({ title: "Fresh" });

      expect(response.body.title).toBe("Fresh");
    });

    it("skips a delete that is older than the stored row", async () => {
      await insertRoutine(minutesAgo(5));

      const response = await api
        .delete(`/routines/${routineId}`)
        .set("X-Client-Time", at(minutesAgo(10)));

      expect(response.status).toBe(204);
      expect((await readRoutine()).deletedAt).toBeNull();
    });

    it("applies a delete that is newer than the stored row", async () => {
      await insertRoutine(minutesAgo(10));

      await api
        .delete(`/routines/${routineId}`)
        .set("X-Client-Time", at(minutesAgo(5)));

      expect((await readRoutine()).deletedAt).not.toBeNull();
    });

    describe("checks", () => {
      async function insertCheck(checked, updatedAt) {
        await insertRoutine(minutesAgo(60));
        await testDatabase.db.insert(routineChecks).values({
          userId: DEV_USER.id,
          routineId,
          date: "2026-11-05",
          checked,
          updatedAt,
        });
      }

      it("skips a check that is older than the stored one and returns the stored value", async () => {
        await insertCheck(true, minutesAgo(5));

        const response = await api
          .put(`/routines/${routineId}/checks/2026-11-05`)
          .set("X-Client-Time", at(minutesAgo(10)))
          .send({ checked: false });

        expect(response.status).toBe(200);
        expect(response.body.checked).toBe(true);
      });

      it("applies a check that is newer than the stored one", async () => {
        await insertCheck(true, minutesAgo(10));

        const response = await api
          .put(`/routines/${routineId}/checks/2026-11-05`)
          .set("X-Client-Time", at(minutesAgo(5)))
          .send({ checked: false });

        expect(response.body.checked).toBe(false);
      });

      it("stores a first check with the client time", async () => {
        await insertRoutine(minutesAgo(60));
        const clientTime = minutesAgo(5);

        await api
          .put(`/routines/${routineId}/checks/2026-11-05`)
          .set("X-Client-Time", at(clientTime))
          .send({ checked: true });

        const [row] = await testDatabase.db.select().from(routineChecks);

        expect(row.updatedAt).toEqual(clientTime);
      });
    });
  });

  describe("settings", () => {
    async function clearSettings() {
      await testDatabase.db
        .delete(userSettings)
        .where(eq(userSettings.userId, DEV_USER.id));
    }

    async function insertSettings(updatedAt) {
      await clearSettings();
      await testDatabase.db
        .insert(userSettings)
        .values({ userId: DEV_USER.id, theme: "blue", updatedAt });
    }

    it("skips a change that is older than the stored settings and returns them", async () => {
      await insertSettings(minutesAgo(5));

      const response = await api
        .patch("/me/settings")
        .set("X-Client-Time", at(minutesAgo(10)))
        .send({ theme: "red" });

      expect(response.status).toBe(200);
      expect(response.body.theme).toBe("blue");
    });

    it("applies a change that is newer than the stored settings", async () => {
      await insertSettings(minutesAgo(10));

      const response = await api
        .patch("/me/settings")
        .set("X-Client-Time", at(minutesAgo(5)))
        .send({ theme: "red" });

      expect(response.body.theme).toBe("red");
    });

    it("creates the settings row with the client time when it is missing", async () => {
      await clearSettings();
      const clientTime = minutesAgo(5);

      const response = await api
        .patch("/me/settings")
        .set("X-Client-Time", at(clientTime))
        .send({ theme: "red" });

      expect(response.body.theme).toBe("red");

      const [row] = await testDatabase.db.select().from(userSettings);

      expect(row.updatedAt).toEqual(clientTime);
    });
  });
});
