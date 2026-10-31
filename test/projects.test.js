import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { DEV_USER } from "../src/constants/devUser.js";
import { projects, tasks, users } from "../src/db/schema/index.js";
import { deleteProject } from "../src/services/projectsService.js";
import { signedInAs, TEST_AUTH } from "./helpers/auth.js";
import { useTestDatabase } from "./helpers/database.js";

const portfolioId = "678e4529-fa35-432c-8baa-6a1298ba43f1";
const todoAppId = "f9eeef00-3cc4-4b6f-9f33-29dc56ba3508";
const missingId = "9d1c3b7e-0000-4000-8000-000000000000";
const otherUser = {
  id: "22222222-2222-4222-8222-222222222222",
  email: "other@example.com",
};

function failOnTaskUpdate(target) {
  return new Proxy(target, {
    get(object, property) {
      if (property === "update") {
        return (table) => {
          if (table === tasks) {
            throw new Error("task update failed");
          }

          return object.update(table);
        };
      }

      if (property === "transaction") {
        return (callback) =>
          object.transaction((tx) => callback(failOnTaskUpdate(tx)));
      }

      const value = Reflect.get(object, property, object);

      return typeof value === "function" ? value.bind(object) : value;
    },
  });
}

describe("/projects", () => {
  const testDatabase = useTestDatabase();
  let app;
  let api;

  beforeEach(async () => {
    app = createApp({ database: testDatabase.database, auth: TEST_AUTH });
    api = await signedInAs(app, testDatabase.db);
  });

  function insertProject(values) {
    return testDatabase.db
      .insert(projects)
      .values({ userId: DEV_USER.id, ...values });
  }

  function insertTask(values) {
    return testDatabase.db.insert(tasks).values({
      userId: DEV_USER.id,
      title: "Task",
      position: 0,
      ...values,
    });
  }

  async function readProjectRow(userId, id) {
    const [row] = await testDatabase.db
      .select()
      .from(projects)
      .where(and(eq(projects.userId, userId), eq(projects.id, id)));

    return row;
  }

  async function readTaskProjectId(userId, id) {
    const [row] = await testDatabase.db
      .select()
      .from(tasks)
      .where(and(eq(tasks.userId, userId), eq(tasks.id, id)));

    return row.projectId;
  }

  async function addOtherUser() {
    await testDatabase.db.insert(users).values(otherUser);
  }

  describe("GET", () => {
    it("returns an empty list when the user has no projects", async () => {
      const response = await api.get("/projects");

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });

    it("lists the projects in the order they were created", async () => {
      await api.post("/projects").send({ id: todoAppId, name: "ToDoApp" });
      await api.post("/projects").send({ id: portfolioId, name: "Portfolio" });

      const response = await api.get("/projects");

      expect(response.body).toEqual([
        { id: todoAppId, name: "ToDoApp" },
        { id: portfolioId, name: "Portfolio" },
      ]);
    });

    it("hides deleted projects and projects of other users", async () => {
      await addOtherUser();
      await insertProject({ id: portfolioId, name: "Portfolio" });
      await insertProject({
        id: todoAppId,
        name: "Old",
        deletedAt: new Date(),
      });
      await testDatabase.db
        .insert(projects)
        .values({ userId: otherUser.id, id: missingId, name: "Secret" });

      const response = await api.get("/projects");

      expect(response.body).toEqual([{ id: portfolioId, name: "Portfolio" }]);
    });
  });

  describe("POST", () => {
    it("creates a project with the id sent by the client", async () => {
      const response = await api
        .post("/projects")
        .send({ id: portfolioId, name: "  Portfolio  " });

      expect(response.status).toBe(201);
      expect(response.body).toEqual({ id: portfolioId, name: "Portfolio" });
      expect((await readProjectRow(DEV_USER.id, portfolioId)).name).toBe(
        "Portfolio",
      );
    });

    it("answers a repeated identical request with the existing project", async () => {
      const body = { id: portfolioId, name: "Portfolio" };

      await api.post("/projects").send(body);
      const response = await api.post("/projects").send(body);

      expect(response.status).toBe(200);
      expect(response.body).toEqual(body);
      expect(await testDatabase.db.select().from(projects)).toHaveLength(1);
    });

    it("rejects an existing id with a different name", async () => {
      await api.post("/projects").send({ id: portfolioId, name: "Portfolio" });

      const response = await api
        .post("/projects")
        .send({ id: portfolioId, name: "Another" });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("CONFLICT");
      expect((await readProjectRow(DEV_USER.id, portfolioId)).name).toBe(
        "Portfolio",
      );
    });

    it("rejects the id of a deleted project", async () => {
      await insertProject({
        id: portfolioId,
        name: "Portfolio",
        deletedAt: new Date(),
      });

      const response = await api
        .post("/projects")
        .send({ id: portfolioId, name: "Portfolio" });

      expect(response.status).toBe(409);
    });

    it("allows an id that another user already uses", async () => {
      await addOtherUser();
      await testDatabase.db
        .insert(projects)
        .values({ userId: otherUser.id, id: portfolioId, name: "Portfolio" });

      const response = await api
        .post("/projects")
        .send({ id: portfolioId, name: "Portfolio" });

      expect(response.status).toBe(201);
    });

    it("rejects invalid project data", async () => {
      const cases = [
        { name: "Portfolio" },
        { id: "not-a-uuid", name: "Portfolio" },
        { id: portfolioId, name: "   " },
        { id: portfolioId, name: "x".repeat(101) },
        { id: portfolioId, name: "Portfolio", color: "blue" },
      ];

      for (const body of cases) {
        const response = await api.post("/projects").send(body);

        expect(response.status).toBe(400);
      }

      expect(await testDatabase.db.select().from(projects)).toEqual([]);
    });
  });

  describe("PATCH /:id", () => {
    it("renames a project", async () => {
      await insertProject({ id: portfolioId, name: "Portfolio" });

      const response = await api
        .patch(`/projects/${portfolioId}`)
        .send({ name: "Portfolio 2026" });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        id: portfolioId,
        name: "Portfolio 2026",
      });
    });

    it("answers 404 for a missing, deleted or foreign project", async () => {
      await addOtherUser();
      await insertProject({
        id: todoAppId,
        name: "Old",
        deletedAt: new Date(),
      });
      await testDatabase.db
        .insert(projects)
        .values({ userId: otherUser.id, id: portfolioId, name: "Secret" });

      for (const id of [missingId, todoAppId, portfolioId]) {
        const response = await api
          .patch(`/projects/${id}`)
          .send({ name: "Renamed" });

        expect(response.status).toBe(404);
        expect(response.body.error.code).toBe("NOT_FOUND");
      }

      expect((await readProjectRow(otherUser.id, portfolioId)).name).toBe(
        "Secret",
      );
    });

    it("rejects an invalid id or name", async () => {
      await insertProject({ id: portfolioId, name: "Portfolio" });

      const badId = await api
        .patch("/projects/not-a-uuid")
        .send({ name: "Renamed" });
      const badName = await api
        .patch(`/projects/${portfolioId}`)
        .send({ name: "" });

      expect(badId.status).toBe(400);
      expect(badName.status).toBe(400);
    });
  });

  describe("DELETE /:id", () => {
    it("hides the project but keeps its row", async () => {
      await insertProject({ id: portfolioId, name: "Portfolio" });

      const response = await api.delete(`/projects/${portfolioId}`);

      expect(response.status).toBe(204);
      expect((await api.get("/projects")).body).toEqual([]);
      expect(
        (await readProjectRow(DEV_USER.id, portfolioId)).deletedAt,
      ).toBeInstanceOf(Date);
    });

    it("detaches only the user's own tasks from the deleted project", async () => {
      await addOtherUser();
      await insertProject({ id: portfolioId, name: "Portfolio" });
      await insertProject({ id: todoAppId, name: "ToDoApp" });
      await testDatabase.db
        .insert(projects)
        .values({ userId: otherUser.id, id: portfolioId, name: "Portfolio" });

      const inProject = "aaaaaaaa-0000-4000-8000-000000000001";
      const inOtherProject = "aaaaaaaa-0000-4000-8000-000000000002";
      await insertTask({ id: inProject, projectId: portfolioId });
      await insertTask({ id: inOtherProject, projectId: todoAppId });
      await testDatabase.db.insert(tasks).values({
        userId: otherUser.id,
        id: inProject,
        projectId: portfolioId,
        title: "Foreign task",
        position: 0,
      });

      await api.delete(`/projects/${portfolioId}`);

      expect(await readTaskProjectId(DEV_USER.id, inProject)).toBeNull();
      expect(await readTaskProjectId(DEV_USER.id, inOtherProject)).toBe(
        todoAppId,
      );
      expect(await readTaskProjectId(otherUser.id, inProject)).toBe(
        portfolioId,
      );
    });

    it("answers 404 for a missing, already deleted or foreign project", async () => {
      await addOtherUser();
      await insertProject({ id: portfolioId, name: "Portfolio" });
      await testDatabase.db
        .insert(projects)
        .values({ userId: otherUser.id, id: todoAppId, name: "Secret" });

      await api.delete(`/projects/${portfolioId}`);

      for (const id of [missingId, portfolioId, todoAppId]) {
        const response = await api.delete(`/projects/${id}`);

        expect(response.status).toBe(404);
      }

      expect(
        (await readProjectRow(otherUser.id, todoAppId)).deletedAt,
      ).toBeNull();
    });

    it("keeps the project when detaching its tasks fails", async () => {
      await insertProject({ id: portfolioId, name: "Portfolio" });

      await expect(
        deleteProject(
          failOnTaskUpdate(testDatabase.db),
          DEV_USER.id,
          portfolioId,
        ),
      ).rejects.toThrow("task update failed");

      expect(
        (await readProjectRow(DEV_USER.id, portfolioId)).deletedAt,
      ).toBeNull();
    });
  });
});
