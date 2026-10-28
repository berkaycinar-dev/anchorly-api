import { and, eq } from "drizzle-orm";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { DEV_USER } from "../src/constants/devUser.js";
import { routineChecks, routines, users } from "../src/db/schema/index.js";
import { useTestDatabase } from "./helpers/database.js";

const waterId = "88444dfd-8be1-4578-956f-037a0b71e8b7";
const readId = "7ac7256e-fcd5-48f3-afe4-4d0e821f16be";
const exerciseId = "594903e0-17f9-4999-b28a-2812da40123f";
const missingId = "9d1c3b7e-0000-4000-8000-000000000000";
const otherUser = {
  id: "22222222-2222-4222-8222-222222222222",
  email: "other@example.com",
};

describe("/routines", () => {
  const testDatabase = useTestDatabase();
  let app;

  beforeEach(() => {
    app = createApp({ database: testDatabase.database });
  });

  function createRoutine(id, title) {
    return request(app).post("/routines").send({ id, title });
  }

  function setCheck(id, date, checked) {
    return request(app).put(`/routines/${id}/checks/${date}`).send({ checked });
  }

  async function addOtherUserRoutine(id, title) {
    await testDatabase.db.insert(users).values(otherUser);
    await testDatabase.db
      .insert(routines)
      .values({ userId: otherUser.id, id, title, position: 0 });
  }

  async function readRoutineRow(userId, id) {
    const [row] = await testDatabase.db
      .select()
      .from(routines)
      .where(and(eq(routines.userId, userId), eq(routines.id, id)));

    return row;
  }

  async function readCheckRow(routineId, date) {
    const [row] = await testDatabase.db
      .select()
      .from(routineChecks)
      .where(
        and(
          eq(routineChecks.routineId, routineId),
          eq(routineChecks.date, date),
        ),
      );

    return row;
  }

  describe("GET /", () => {
    it("returns an empty list when the user has no routines", async () => {
      const response = await request(app).get("/routines");

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });

    it("lists routines in the order they were added", async () => {
      await createRoutine(waterId, "water");
      await createRoutine(readId, "Read");
      await createRoutine(exerciseId, "Exercise");

      const response = await request(app).get("/routines");

      expect(response.body).toEqual([
        { id: waterId, title: "water" },
        { id: readId, title: "Read" },
        { id: exerciseId, title: "Exercise" },
      ]);
    });

    it("hides deleted routines and routines of other users", async () => {
      await addOtherUserRoutine(missingId, "Secret");
      await createRoutine(waterId, "water");
      await createRoutine(readId, "Read");
      await request(app).delete(`/routines/${readId}`);

      const response = await request(app).get("/routines");

      expect(response.body).toEqual([{ id: waterId, title: "water" }]);
    });
  });

  describe("POST /", () => {
    it("creates a routine at the end of the list", async () => {
      await createRoutine(waterId, "water");

      const response = await createRoutine(readId, "  Read  ");

      expect(response.status).toBe(201);
      expect(response.body).toEqual({ id: readId, title: "Read" });
      expect((await readRoutineRow(DEV_USER.id, readId)).position).toBe(1);
    });

    it("keeps adding after the last position when a routine was deleted", async () => {
      await createRoutine(waterId, "water");
      await createRoutine(readId, "Read");
      await request(app).delete(`/routines/${readId}`);

      await createRoutine(exerciseId, "Exercise");

      expect((await readRoutineRow(DEV_USER.id, exerciseId)).position).toBe(2);
    });

    it("answers a repeated identical request with the existing routine", async () => {
      await createRoutine(waterId, "water");

      const response = await createRoutine(waterId, "water");

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ id: waterId, title: "water" });
      expect(await testDatabase.db.select().from(routines)).toHaveLength(1);
    });

    it("rejects an existing or deleted id with conflicting data", async () => {
      await createRoutine(waterId, "water");
      await createRoutine(readId, "Read");
      await request(app).delete(`/routines/${readId}`);

      const differentTitle = await createRoutine(waterId, "Drink water");
      const deletedId = await createRoutine(readId, "Read");

      expect(differentTitle.status).toBe(409);
      expect(deletedId.status).toBe(409);
    });

    it("allows an id that another user already uses", async () => {
      await addOtherUserRoutine(waterId, "water");

      const response = await createRoutine(waterId, "water");

      expect(response.status).toBe(201);
    });

    it("rejects invalid routine data", async () => {
      const cases = [
        { title: "Read" },
        { id: "not-a-uuid", title: "Read" },
        { id: readId, title: "" },
        { id: readId, title: "x".repeat(101) },
        { id: readId, title: "Read", position: 3 },
      ];

      for (const body of cases) {
        const response = await request(app).post("/routines").send(body);

        expect(response.status).toBe(400);
      }

      expect(await testDatabase.db.select().from(routines)).toEqual([]);
    });
  });

  describe("PATCH /:id", () => {
    it("renames a routine", async () => {
      await createRoutine(waterId, "water");

      const response = await request(app)
        .patch(`/routines/${waterId}`)
        .send({ title: "Drink water" });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ id: waterId, title: "Drink water" });
    });

    it("answers 404 for a missing, deleted or foreign routine", async () => {
      await addOtherUserRoutine(exerciseId, "Secret");
      await createRoutine(readId, "Read");
      await request(app).delete(`/routines/${readId}`);

      for (const id of [missingId, readId, exerciseId]) {
        const response = await request(app)
          .patch(`/routines/${id}`)
          .send({ title: "Renamed" });

        expect(response.status).toBe(404);
      }

      expect((await readRoutineRow(otherUser.id, exerciseId)).title).toBe(
        "Secret",
      );
    });
  });

  describe("DELETE /:id", () => {
    it("hides the routine but keeps its row", async () => {
      await createRoutine(waterId, "water");

      const response = await request(app).delete(`/routines/${waterId}`);

      expect(response.status).toBe(204);
      expect(
        (await readRoutineRow(DEV_USER.id, waterId)).deletedAt,
      ).toBeInstanceOf(Date);
    });

    it("answers 404 for a missing, deleted or foreign routine", async () => {
      await addOtherUserRoutine(exerciseId, "Secret");
      await createRoutine(waterId, "water");
      await request(app).delete(`/routines/${waterId}`);

      for (const id of [missingId, waterId, exerciseId]) {
        const response = await request(app).delete(`/routines/${id}`);

        expect(response.status).toBe(404);
      }

      expect(
        (await readRoutineRow(otherUser.id, exerciseId)).deletedAt,
      ).toBeNull();
    });
  });

  describe("PUT /:id/checks/:date", () => {
    it("checks a routine for a day", async () => {
      await createRoutine(waterId, "water");

      const response = await setCheck(waterId, "2026-10-28", true);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        routineId: waterId,
        date: "2026-10-28",
        checked: true,
      });
    });

    it("keeps the row as unchecked when a check is removed", async () => {
      await createRoutine(waterId, "water");
      await setCheck(waterId, "2026-10-28", true);
      const before = await readCheckRow(waterId, "2026-10-28");

      const response = await setCheck(waterId, "2026-10-28", false);
      const after = await readCheckRow(waterId, "2026-10-28");

      expect(response.body.checked).toBe(false);
      expect(after.checked).toBe(false);
      expect(after.updatedAt.getTime()).toBeGreaterThan(
        before.updatedAt.getTime(),
      );
      expect(await testDatabase.db.select().from(routineChecks)).toHaveLength(
        1,
      );
    });

    it("answers 404 for a missing, deleted or foreign routine", async () => {
      await addOtherUserRoutine(exerciseId, "Secret");
      await createRoutine(readId, "Read");
      await request(app).delete(`/routines/${readId}`);

      for (const id of [missingId, readId, exerciseId]) {
        const response = await setCheck(id, "2026-10-28", true);

        expect(response.status).toBe(404);
      }

      expect(await testDatabase.db.select().from(routineChecks)).toEqual([]);
    });

    it("rejects an invalid date or value", async () => {
      await createRoutine(waterId, "water");

      const invalidRequests = [
        setCheck(waterId, "2026-02-30", true),
        setCheck(waterId, "2026-1-5", true),
        setCheck(waterId, "2026-10-28", "true"),
        request(app).put(`/routines/${waterId}/checks/2026-10-28`).send({}),
        request(app)
          .put(`/routines/${waterId}/checks/2026-10-28`)
          .send({ checked: true, note: "done" }),
      ];

      for (const pending of invalidRequests) {
        const response = await pending;

        expect(response.status).toBe(400);
      }

      expect(await testDatabase.db.select().from(routineChecks)).toEqual([]);
    });
  });

  describe("GET /checks", () => {
    it("lists the checks of the user's active routines by date", async () => {
      await addOtherUserRoutine(exerciseId, "Secret");
      await testDatabase.db.insert(routineChecks).values({
        userId: otherUser.id,
        routineId: exerciseId,
        date: "2026-10-27",
        checked: true,
      });
      await createRoutine(waterId, "water");
      await createRoutine(readId, "Read");
      await testDatabase.db.insert(routines).values({
        userId: DEV_USER.id,
        id: exerciseId,
        title: "Exercise",
        position: 2,
      });
      await setCheck(waterId, "2026-10-28", true);
      await setCheck(waterId, "2026-10-26", false);
      await setCheck(exerciseId, "2026-10-27", true);
      await setCheck(readId, "2026-10-27", true);
      await request(app).delete(`/routines/${readId}`);

      const response = await request(app).get("/routines/checks");

      expect(response.status).toBe(200);
      expect(response.body).toEqual([
        { routineId: waterId, date: "2026-10-26", checked: false },
        { routineId: exerciseId, date: "2026-10-27", checked: true },
        { routineId: waterId, date: "2026-10-28", checked: true },
      ]);
    });
  });
});
