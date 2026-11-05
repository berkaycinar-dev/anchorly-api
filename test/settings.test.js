import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { DEV_USER } from "../src/constants/devUser.js";
import { userSettings, users } from "../src/db/schema/index.js";
import { signedInAs } from "./helpers/auth.js";
import { createTestApp } from "./helpers/app.js";
import { useTestDatabase } from "./helpers/database.js";

const defaultSettings = {
  theme: "gray",
  language: "tr",
  fontFamily: "Inter",
  weekStartDay: "monday",
  timezone: "UTC",
  dashboardLayout: [
    { id: "todayRing", size: "small" },
    { id: "weeklyRoutine", size: "small" },
    { id: "upcoming", size: "wide" },
  ],
};

const otherUser = {
  id: "22222222-2222-4222-8222-222222222222",
  email: "other@example.com",
};

describe("/me/settings", () => {
  const testDatabase = useTestDatabase();
  let app;
  let api;

  beforeEach(async () => {
    app = createTestApp({ database: testDatabase.database });
    api = await signedInAs(app, testDatabase.db);
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
      const response = await api.get("/me/settings");

      expect(response.status).toBe(200);
      expect(response.body).toEqual(defaultSettings);
    });

    it("creates default settings when the user has none yet", async () => {
      await testDatabase.db
        .delete(userSettings)
        .where(eq(userSettings.userId, DEV_USER.id));

      const response = await api.get("/me/settings");

      expect(response.status).toBe(200);
      expect(response.body).toEqual(defaultSettings);
      expect(await readStoredSettings(DEV_USER.id)).toBeDefined();
    });
  });

  describe("PATCH", () => {
    it("changes only the settings that are sent", async () => {
      const response = await api.patch("/me/settings").send({ theme: "black" });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ ...defaultSettings, theme: "black" });
    });

    it("keeps the change for later requests", async () => {
      await api
        .patch("/me/settings")
        .send({ language: "en", weekStartDay: "sunday" });

      const response = await api.get("/me/settings");

      expect(response.body).toEqual({
        ...defaultSettings,
        language: "en",
        weekStartDay: "sunday",
      });
    });

    it("refreshes the update time of the settings row", async () => {
      const before = await readStoredSettings(DEV_USER.id);

      await api.patch("/me/settings").send({ fontFamily: "Manrope" });

      const after = await readStoredSettings(DEV_USER.id);

      expect(after.updatedAt.getTime()).toBeGreaterThan(
        before.updatedAt.getTime(),
      );
    });

    it("creates the settings row when it is missing", async () => {
      await testDatabase.db
        .delete(userSettings)
        .where(eq(userSettings.userId, DEV_USER.id));

      const response = await api.patch("/me/settings").send({ theme: "green" });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ ...defaultSettings, theme: "green" });
    });

    it("rejects a value outside the allowed list and keeps the old one", async () => {
      const response = await api
        .patch("/me/settings")
        .send({ theme: "orange" });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
      expect(response.body.error.details[0].path).toBe("body.theme");
      expect((await readStoredSettings(DEV_USER.id)).theme).toBe("gray");
    });

    it("rejects an unknown setting", async () => {
      const response = await api
        .patch("/me/settings")
        .send({ theme: "black", fontSize: 18 });

      expect(response.status).toBe(400);
      expect(response.body.error.details[0].message).toContain("fontSize");
      expect((await readStoredSettings(DEV_USER.id)).theme).toBe("gray");
    });

    it("rejects an empty change", async () => {
      const response = await api.patch("/me/settings").send({});

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("stores a valid IANA time zone", async () => {
      const response = await api
        .patch("/me/settings")
        .send({ timezone: "Europe/Istanbul" });

      expect(response.status).toBe(200);
      expect(response.body.timezone).toBe("Europe/Istanbul");
      expect((await readStoredSettings(DEV_USER.id)).timezone).toBe(
        "Europe/Istanbul",
      );
    });

    it("rejects an unknown time zone", async () => {
      const response = await api
        .patch("/me/settings")
        .send({ timezone: "Mars/Olympus" });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
      expect((await readStoredSettings(DEV_USER.id)).timezone).toBe("UTC");
    });

    it("rejects an empty or oversized time zone", async () => {
      const empty = await api.patch("/me/settings").send({ timezone: "" });
      const long = await api
        .patch("/me/settings")
        .send({ timezone: "A".repeat(65) });

      expect(empty.status).toBe(400);
      expect(long.status).toBe(400);
    });

    it("replaces the whole dashboard layout and keeps its order", async () => {
      const dashboardLayout = [
        { id: "streaks", size: "wide" },
        { id: "todayRing", size: "small" },
      ];

      const response = await api
        .patch("/me/settings")
        .send({ dashboardLayout });

      expect(response.status).toBe(200);
      expect(response.body.dashboardLayout).toEqual(dashboardLayout);

      const stored = await api.get("/me/settings");

      expect(stored.body.dashboardLayout).toEqual(dashboardLayout);
    });

    it("accepts an empty dashboard layout", async () => {
      const response = await api
        .patch("/me/settings")
        .send({ dashboardLayout: [] });

      expect(response.status).toBe(200);
      expect(response.body.dashboardLayout).toEqual([]);
    });

    it("rejects a dashboard card with a size outside the allowed list", async () => {
      const response = await api
        .patch("/me/settings")
        .send({ dashboardLayout: [{ id: "streaks", size: "huge" }] });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
      expect((await readStoredSettings(DEV_USER.id)).dashboardLayout).toEqual(
        defaultSettings.dashboardLayout,
      );
    });

    it("rejects the same dashboard card twice", async () => {
      const response = await api.patch("/me/settings").send({
        dashboardLayout: [
          { id: "streaks", size: "small" },
          { id: "streaks", size: "wide" },
        ],
      });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("rejects a dashboard layout with too many cards", async () => {
      const dashboardLayout = Array.from({ length: 21 }, (_, index) => ({
        id: `card${index}`,
        size: "small",
      }));

      const response = await api
        .patch("/me/settings")
        .send({ dashboardLayout });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("rejects a dashboard layout that is not a list", async () => {
      const response = await api
        .patch("/me/settings")
        .send({ dashboardLayout: { id: "streaks", size: "small" } });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("does not touch the settings of another user", async () => {
      await testDatabase.db.insert(users).values(otherUser);
      await testDatabase.db
        .insert(userSettings)
        .values({ userId: otherUser.id, theme: "pink" });

      await api.patch("/me/settings").send({ theme: "black" });

      expect((await readStoredSettings(otherUser.id)).theme).toBe("pink");
    });
  });
});
