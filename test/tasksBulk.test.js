import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { DEV_USER } from "../src/constants/devUser.js";
import { projects, tasks, users } from "../src/db/schema/index.js";
import { signedInAs, TEST_AUTH } from "./helpers/auth.js";
import { useTestDatabase } from "./helpers/database.js";

const ids = {
  first: "aaaaaaaa-0000-4000-8000-000000000001",
  second: "aaaaaaaa-0000-4000-8000-000000000002",
  third: "aaaaaaaa-0000-4000-8000-000000000003",
  fourth: "aaaaaaaa-0000-4000-8000-000000000004",
  fifth: "aaaaaaaa-0000-4000-8000-000000000005",
  missing: "aaaaaaaa-0000-4000-8000-0000000000ff",
};
const groupId = "c0ffee00-0000-4000-8000-000000000001";
const deletedProjectId = "f9eeef00-3cc4-4b6f-9f33-29dc56ba3508";
const otherUser = {
  id: "22222222-2222-4222-8222-222222222222",
  email: "other@example.com",
};

describe("task ordering and bulk operations", () => {
  const testDatabase = useTestDatabase();
  let app;
  let api;

  beforeEach(async () => {
    app = createApp({ database: testDatabase.database, auth: TEST_AUTH });
    api = await signedInAs(app, testDatabase.db);
  });

  function insertTasks(rows) {
    return testDatabase.db.insert(tasks).values(
      rows.map((row) => ({
        userId: DEV_USER.id,
        title: "Task",
        position: 0,
        ...row,
      })),
    );
  }

  async function readTasks() {
    const rows = await testDatabase.db
      .select()
      .from(tasks)
      .where(eq(tasks.userId, DEV_USER.id));

    return Object.fromEntries(rows.map((row) => [row.id, row]));
  }

  function bulk(operations) {
    return api.post("/tasks/bulk").send({ operations });
  }

  describe("POST /tasks/reorder", () => {
    beforeEach(async () => {
      await insertTasks([
        { id: ids.first, position: 1761500000001 },
        { id: ids.second, position: 1761500000002 },
        { id: ids.third, position: 1761500000003 },
        {
          id: ids.fourth,
          position: 99,
          completed: true,
          completedAt: "2026-10-28",
        },
      ]);
    });

    it("numbers the listed tasks in the given order", async () => {
      const response = await api
        .post("/tasks/reorder")
        .send({ orderedIds: [ids.third, ids.first, ids.second] });

      const rows = await readTasks();

      expect(response.status).toBe(204);
      expect(rows[ids.third].position).toBe(0);
      expect(rows[ids.first].position).toBe(1);
      expect(rows[ids.second].position).toBe(2);
      expect(rows[ids.fourth].position).toBe(99);
    });

    it("refreshes the update time of the reordered tasks", async () => {
      const before = await readTasks();

      await api
        .post("/tasks/reorder")
        .send({ orderedIds: [ids.second, ids.first] });

      const after = await readTasks();

      expect(after[ids.second].updatedAt.getTime()).toBeGreaterThan(
        before[ids.second].updatedAt.getTime(),
      );
      expect(after[ids.third].updatedAt).toEqual(before[ids.third].updatedAt);
    });

    it("changes nothing when one of the tasks is missing, deleted or foreign", async () => {
      await testDatabase.db.insert(users).values(otherUser);
      await testDatabase.db.insert(tasks).values({
        userId: otherUser.id,
        id: ids.fifth,
        title: "Secret",
        position: 0,
      });
      await testDatabase.db
        .update(tasks)
        .set({ deletedAt: new Date() })
        .where(eq(tasks.id, ids.second));

      for (const extraId of [ids.missing, ids.second, ids.fifth]) {
        const response = await api
          .post("/tasks/reorder")
          .send({ orderedIds: [ids.third, ids.first, extraId] });

        expect(response.status).toBe(404);
      }

      const rows = await readTasks();

      expect(rows[ids.first].position).toBe(1761500000001);
      expect(rows[ids.third].position).toBe(1761500000003);
    });

    it("rejects an empty, duplicated or malformed list", async () => {
      const cases = [
        { orderedIds: [] },
        { orderedIds: [ids.first, ids.first] },
        { orderedIds: ["not-a-uuid"] },
        {},
      ];

      for (const body of cases) {
        const response = await api.post("/tasks/reorder").send(body);

        expect(response.status).toBe(400);
      }
    });
  });

  describe("POST /tasks/bulk", () => {
    it("runs the frontend repeat change as one request", async () => {
      await insertTasks([
        {
          id: ids.first,
          date: "2026-10-28",
          repeat: "daily",
          repeatGroupId: groupId,
        },
        {
          id: ids.second,
          date: "2026-10-29",
          repeat: "daily",
          repeatGroupId: groupId,
        },
        {
          id: ids.third,
          date: "2026-10-30",
          repeat: "daily",
          repeatGroupId: groupId,
        },
      ]);

      const response = await bulk([
        { type: "delete", id: ids.second },
        { type: "delete", id: ids.third },
        { type: "update", id: ids.first, patch: { repeat: "weekly" } },
        {
          type: "create",
          task: {
            id: ids.fourth,
            title: "Task",
            date: "2026-11-04",
            order: 1,
            repeat: "weekly",
            repeatGroupId: groupId,
          },
        },
      ]);

      expect(response.status).toBe(200);
      expect(response.body.results.map((result) => result.status)).toEqual([
        204, 204, 200, 201,
      ]);
      expect(response.body.results[2].task.repeat).toBe("weekly");
      expect(response.body.results[3].task.id).toBe(ids.fourth);

      const listed = (await api.get("/tasks")).body;

      expect(listed.map((task) => [task.id, task.date, task.repeat])).toEqual([
        [ids.first, "2026-10-28", "weekly"],
        [ids.fourth, "2026-11-04", "weekly"],
      ]);
    });

    it("runs the operations in the order they are listed", async () => {
      const response = await bulk([
        { type: "create", task: { id: ids.first, title: "Draft", order: 0 } },
        { type: "update", id: ids.first, patch: { title: "Final" } },
        { type: "create", task: { id: ids.first, title: "Final", order: 0 } },
      ]);

      expect(response.status).toBe(200);
      expect(response.body.results.map((result) => result.status)).toEqual([
        201, 200, 200,
      ]);
      expect((await readTasks())[ids.first].title).toBe("Final");
    });

    it("undoes every operation when a later one is not found", async () => {
      await insertTasks([{ id: ids.first, title: "Keep me" }]);

      const response = await bulk([
        { type: "delete", id: ids.first },
        { type: "create", task: { id: ids.second, title: "New", order: 0 } },
        { type: "update", id: ids.missing, patch: { title: "Ghost" } },
      ]);

      const rows = await readTasks();

      expect(response.status).toBe(404);
      expect(response.body.error.message).toMatch(/^Operation 2 \(update\)/);
      expect(response.body.error.details[0].path).toBe("body.operations.2");
      expect(rows[ids.first].deletedAt).toBeNull();
      expect(rows[ids.second]).toBeUndefined();
    });

    it("undoes every operation when a later one breaks a rule", async () => {
      await testDatabase.db.insert(projects).values({
        userId: DEV_USER.id,
        id: deletedProjectId,
        name: "Old",
        deletedAt: new Date(),
      });

      const response = await bulk([
        { type: "create", task: { id: ids.first, title: "Fine", order: 0 } },
        {
          type: "create",
          task: {
            id: ids.second,
            title: "Broken",
            order: 1,
            projectId: deletedProjectId,
          },
        },
      ]);

      expect(response.status).toBe(400);
      expect(response.body.error.details[0].path).toBe(
        "body.operations.1.task.projectId",
      );
      expect(await readTasks()).toEqual({});
    });

    it("reports a conflict and undoes the batch", async () => {
      const response = await bulk([
        { type: "create", task: { id: ids.first, title: "One", order: 0 } },
        { type: "delete", id: ids.first },
        { type: "create", task: { id: ids.first, title: "One", order: 0 } },
      ]);

      expect(response.status).toBe(409);
      expect(response.body.error.message).toMatch(/^Operation 2 \(create\)/);
      expect(await readTasks()).toEqual({});
    });

    it("does not touch another user's tasks", async () => {
      await testDatabase.db.insert(users).values(otherUser);
      await testDatabase.db.insert(tasks).values({
        userId: otherUser.id,
        id: ids.first,
        title: "Secret",
        position: 0,
      });

      const response = await bulk([{ type: "delete", id: ids.first }]);

      const [row] = await testDatabase.db
        .select()
        .from(tasks)
        .where(and(eq(tasks.userId, otherUser.id), eq(tasks.id, ids.first)));

      expect(response.status).toBe(404);
      expect(row.deletedAt).toBeNull();
    });

    it("points to the invalid field inside an operation", async () => {
      const cases = [
        [
          [{ type: "create", task: { id: ids.first, order: 0 } }],
          "body.operations.0.task.title",
        ],
        [
          [{ type: "update", id: ids.first, patch: { titel: "Typo" } }],
          "body.operations.0.patch",
        ],
        [[{ type: "move", id: ids.first }], "body.operations.0.type"],
      ];

      for (const [operations, path] of cases) {
        const response = await bulk(operations);

        expect(response.status).toBe(400);
        expect(
          response.body.error.details.map((detail) => detail.path),
        ).toContain(path);
      }
    });

    it("rejects an empty or oversized batch", async () => {
      const tooMany = Array.from({ length: 501 }, () => ({
        type: "delete",
        id: ids.first,
      }));

      expect((await bulk([])).status).toBe(400);
      expect((await bulk(tooMany)).status).toBe(400);
    });
  });
});
