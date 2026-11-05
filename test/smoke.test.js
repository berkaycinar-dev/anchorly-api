import { afterEach, describe, expect, it } from "vitest";
import { runSmokeTest } from "../scripts/smoke.js";
import { RATE_LIMITS } from "../src/constants/rateLimits.js";
import { createTestApp } from "./helpers/app.js";
import { useTestDatabase } from "./helpers/database.js";

describe("smoke test script", () => {
  const testDatabase = useTestDatabase();
  let server;

  afterEach(async () => {
    await new Promise((resolve) => server?.close(resolve) ?? resolve());
    server = undefined;
  });

  async function startServer(options = {}) {
    const app = createTestApp({ database: testDatabase.database, ...options });

    server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));

    return `http://127.0.0.1:${server.address().port}`;
  }

  async function countUsers() {
    const result = await testDatabase.db.execute(
      "select count(*)::int as count from users",
    );

    return result.rows[0].count;
  }

  it("passes against a working API with the real rate limits and leaves no account behind", async () => {
    const baseUrl = await startServer({ rateLimits: RATE_LIMITS });
    const lines = [];
    const usersBefore = await countUsers();

    await runSmokeTest(baseUrl, { log: (line) => lines.push(line) });

    expect(lines).toEqual([
      "ok  health",
      "ok  register",
      "ok  read the account",
      "ok  save a project and a task",
      "ok  refresh the session",
      "ok  sign out other devices",
      "ok  export needs a verified email",
      "ok  sign out",
      "ok  delete the account",
    ]);
    expect(await countUsers()).toBe(usersBefore);
  });

  it("names the failing step and still deletes its account", async () => {
    const baseUrl = await startServer();
    const usersBefore = await countUsers();

    const failure = runSmokeTest(baseUrl, {
      log: async (line) => {
        if (line === "ok  sign out other devices") {
          await new Promise((resolve) => setTimeout(resolve, 200));
          await testDatabase.db.execute(
            "update users set email_verified_at = now() where email like 'smoke-%'",
          );
        }
      },
    });

    await expect(failure).rejects.toThrow(
      /^export needs a verified email: expected 403, got 200/,
    );
    expect(await countUsers()).toBe(usersBefore);
  });
});
