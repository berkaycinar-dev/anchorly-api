import { eq } from "drizzle-orm";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { DEV_USER } from "../src/constants/devUser.js";
import { userSettings, users } from "../src/db/schema/index.js";
import { useTestDatabase } from "./helpers/database.js";

const defaultSettings = {
  theme: "gray",
  language: "tr",
  fontFamily: "Inter",
  weekStartDay: "monday",
};

const otherUser = {
  id: "22222222-2222-4222-8222-222222222222",
  email: "other@example.com",
};

describe("/me/settings", () => {
  const testDatabase = useTestDatabase();
  let app;

  beforeEach(() => {
    app = createApp({ database: testDatabase.database });
  });

  async function readStoredSettings(userId) {
    const [row] = await testDatabase.db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, userId));

    return row;
  }

  describe("GET", () => {
    it("returns the settings of the current user", async () => {
      const response = await request(app).get("/me/settings");

      expect(response.status).toBe(200);
      expect(response.body).toEqual(defaultSettings);
    });

    it("creates default settings when the user has none yet", async () => {
      await testDatabase.db
        .delete(userSettings)
        .where(eq(userSettings.userId, DEV_USER.id));

      const response = await request(app).get("/me/settings");

      expect(response.status).toBe(200);
      expect(response.body).toEqual(defaultSettings);
      expect(await readStoredSettings(DEV_USER.id)).toBeDefined();
    });
  });

  describe("PATCH", () => {
    it("changes only the settings that are sent", async () => {
      const response = await request(app)
        .patch("/me/settings")
        .send({ theme: "black" });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ ...defaultSettings, theme: "black" });
    });

    it("keeps the change for later requests", async () => {
      await request(app)
        .patch("/me/settings")
        .send({ language: "en", weekStartDay: "sunday" });

      const response = await request(app).get("/me/settings");

      expect(response.body).toEqual({
        ...defaultSettings,
        language: "en",
        weekStartDay: "sunday",
      });
    });

    it("refreshes the update time of the settings row", async () => {
      const before = await readStoredSettings(DEV_USER.id);

      await request(app).patch("/me/settings").send({ fontFamily: "Manrope" });

      const after = await readStoredSettings(DEV_USER.id);

      expect(after.updatedAt.getTime()).toBeGreaterThan(
        before.updatedAt.getTime(),
      );
    });

    it("creates the settings row when it is missing", async () => {
      await testDatabase.db
        .delete(userSettings)
        .where(eq(userSettings.userId, DEV_USER.id));

      const response = await request(app)
        .patch("/me/settings")
        .send({ theme: "green" });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ ...defaultSettings, theme: "green" });
    });

    it("rejects a value outside the allowed list and keeps the old one", async () => {
      const response = await request(app)
        .patch("/me/settings")
        .send({ theme: "orange" });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
      expect(response.body.error.details[0].path).toBe("body.theme");
      expect((await readStoredSettings(DEV_USER.id)).theme).toBe("gray");
    });

    it("rejects an unknown setting", async () => {
      const response = await request(app)
        .patch("/me/settings")
        .send({ theme: "black", fontSize: 18 });

      expect(response.status).toBe(400);
      expect(response.body.error.details[0].message).toContain("fontSize");
      expect((await readStoredSettings(DEV_USER.id)).theme).toBe("gray");
    });

    it("rejects an empty change", async () => {
      const response = await request(app).patch("/me/settings").send({});

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("does not touch the settings of another user", async () => {
      await testDatabase.db.insert(users).values(otherUser);
      await testDatabase.db
        .insert(userSettings)
        .values({ userId: otherUser.id, theme: "pink" });

      await request(app).patch("/me/settings").send({ theme: "black" });

      expect((await readStoredSettings(otherUser.id)).theme).toBe("pink");
    });
  });
});
