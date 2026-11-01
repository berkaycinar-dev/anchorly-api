import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestApp } from "./helpers/app.js";
import { useTestDatabase } from "./helpers/database.js";

const twoPerMinute = { windowMs: 60 * 1000, limit: 2 };

describe("trust proxy", () => {
  const testDatabase = useTestDatabase();

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function appWith(trustProxy) {
    return createTestApp({
      database: testDatabase.database,
      rateLimits: { loginByIp: twoPerMinute },
      trustProxy,
    });
  }

  function loginFrom(app, forwardedFor) {
    return request(app)
      .post("/auth/login")
      .set("X-Forwarded-For", forwardedFor)
      .send({ email: "nobody@example.com", password: "wrong password" });
  }

  async function statusesFrom(app, addresses) {
    const result = [];

    for (const address of addresses) {
      result.push((await loginFrom(app, address)).status);
    }

    return result;
  }

  it("ignores X-Forwarded-For by default and warns about it", async () => {
    const warning = vi.spyOn(console, "error").mockImplementation(() => {});
    const app = createTestApp({
      database: testDatabase.database,
      rateLimits: { loginByIp: twoPerMinute },
    });

    const results = await statusesFrom(app, [
      "203.0.113.1",
      "203.0.113.2",
      "203.0.113.3",
    ]);

    expect(app.get("trust proxy fn")("127.0.0.1", 0)).toBe(false);
    expect(results).toEqual([401, 401, 429]);
    expect(warning).toHaveBeenCalledWith(
      expect.objectContaining({ code: "ERR_ERL_UNEXPECTED_X_FORWARDED_FOR" }),
    );
  });

  it("counts each client separately behind one trusted proxy", async () => {
    const app = appWith(1);

    const results = await statusesFrom(app, [
      "203.0.113.1",
      "203.0.113.1",
      "203.0.113.2",
      "203.0.113.1",
    ]);

    expect(results).toEqual([401, 401, 401, 429]);
  });

  it("cannot be fooled by addresses the client adds in front", async () => {
    const app = appWith(1);

    const results = await statusesFrom(app, [
      "198.51.100.1, 203.0.113.1",
      "198.51.100.2, 203.0.113.1",
      "198.51.100.3, 203.0.113.1",
    ]);

    expect(results).toEqual([401, 401, 429]);
  });
});
