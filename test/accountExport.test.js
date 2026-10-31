import { eq } from "drizzle-orm";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEV_USER } from "../src/constants/devUser.js";
import { users } from "../src/db/schema/index.js";
import { createTestApp } from "./helpers/app.js";
import { signedInAs } from "./helpers/auth.js";
import { useTestDatabase } from "./helpers/database.js";

const projectId = "1b7e0f3c-2d4a-4e5b-8c6d-7f8091a2b3c4";
const routineId = "2c8f1a4d-3e5b-4f6c-9d7e-8091a2b3c4d5";
const taskId = "3d9a2b5e-4f6c-4a7d-8e8f-91a2b3c4d5e6";
const deletedTaskId = "4e0b3c6f-5a7d-4b8e-9f90-a2b3c4d5e6f7";

describe("GET /me/export", () => {
  const testDatabase = useTestDatabase();
  let app;
  let api;

  beforeEach(async () => {
    app = createTestApp({ database: testDatabase.database });
    api = await signedInAs(app, testDatabase.db);
  });

  async function verifyEmail() {
    await testDatabase.db
      .update(users)
      .set({ emailVerifiedAt: new Date(), passwordHash: "secret-hash-value" })
      .where(eq(users.id, DEV_USER.id));
  }

  async function seedData() {
    await api.patch("/me").send({ displayName: "Dev" });
    await api.patch("/me/settings").send({ theme: "black" });
    await api.post("/projects").send({ id: projectId, name: "Home" });
    await api.post("/routines").send({ id: routineId, title: "Stretch" });
    await api
      .put(`/routines/${routineId}/checks/2026-10-30`)
      .send({ checked: true });
    await api
      .post("/tasks")
      .send({ id: taskId, title: "Buy milk", order: 0, projectId });
    await api
      .post("/tasks")
      .send({ id: deletedTaskId, title: "Gone", order: 1 });
    await api.delete(`/tasks/${deletedTaskId}`);
  }

  it("refuses a user whose email is not verified", async () => {
    const response = await api.get("/me/export");

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("EMAIL_NOT_VERIFIED");
    expect(response.headers["content-disposition"]).toBeUndefined();
  });

  it("needs a signed-in user", async () => {
    const response = await request(app).get("/me/export");

    expect(response.status).toBe(401);
  });

  it("sends the data as a dated JSON file download", async () => {
    vi.useFakeTimers({
      now: new Date("2026-03-05T23:30:00Z"),
      toFake: ["Date"],
    });
    await verifyEmail();

    try {
      const signedIn = await signedInAs(app, testDatabase.db);
      const response = await signedIn.get("/me/export");

      expect(response.status).toBe(200);
      expect(response.headers["content-type"]).toMatch(/^application\/json/);
      expect(response.headers["content-disposition"]).toBe(
        'attachment; filename="anchorly-export-2026-03-05.json"',
      );
      expect(response.headers["cache-control"]).toBe("no-store");
      expect(response.body).toMatchObject({
        format: "anchorly-export",
        version: 1,
        exportedAt: "2026-03-05T23:30:00.000Z",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("contains exactly what the API returns for each part", async () => {
    await verifyEmail();
    await seedData();

    const [exported, me, settings, projectList, routineList, checks, taskList] =
      await Promise.all(
        [
          "/me/export",
          "/me",
          "/me/settings",
          "/projects",
          "/routines",
          "/routines/checks",
          "/tasks",
        ].map((path) => api.get(path)),
      );

    expect(Object.keys(exported.body)).toEqual([
      "format",
      "version",
      "exportedAt",
      "user",
      "settings",
      "projects",
      "routines",
      "routineChecks",
      "tasks",
    ]);
    expect(exported.body.user).toEqual(me.body.user);
    expect(exported.body.settings).toEqual(settings.body);
    expect(exported.body.projects).toEqual(projectList.body);
    expect(exported.body.routines).toEqual(routineList.body);
    expect(exported.body.routineChecks).toEqual(checks.body);
    expect(exported.body.tasks).toEqual(taskList.body);
    expect(exported.body.user.displayName).toBe("Dev");
    expect(exported.body.settings.theme).toBe("black");
    expect(exported.body.projects).toHaveLength(1);
    expect(exported.body.routineChecks).toHaveLength(1);
    expect(exported.body.tasks.map((task) => task.id)).toEqual([taskId]);
  });

  it("never contains password or token hashes", async () => {
    await verifyEmail();
    await seedData();

    const response = await api.get("/me/export");

    expect(response.text).not.toContain("secret-hash-value");
    expect(response.text).not.toMatch(/hash/i);
  });
});
