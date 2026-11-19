import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { rateLimits } from "../src/db/schema/index.js";
import { createPostgresRateLimitStore } from "../src/lib/rateLimitStore.js";
import { useTestDatabase } from "./helpers/database.js";

const WINDOW = 2 * 60 * 1000;

describe("postgres rate limit store", () => {
  const testDatabase = useTestDatabase({ seed: false });

  function createStore(prefix = "login", windowMs = WINDOW) {
    const store = createPostgresRateLimitStore({
      db: testDatabase.db,
      prefix,
    });

    store.init({ windowMs });
    return store;
  }

  async function expireAll() {
    await testDatabase.db
      .update(rateLimits)
      .set({ resetAt: sql`now() - interval '1 second'` });
  }

  it("counts hits for a key and ends the window after windowMs", async () => {
    const store = createStore();
    const before = Date.now();

    expect((await store.increment("1.2.3.4")).totalHits).toBe(1);
    const second = await store.increment("1.2.3.4");

    expect(second.totalHits).toBe(2);
    expect(second.resetTime).toBeInstanceOf(Date);
    expect(second.resetTime.getTime()).toBeGreaterThan(before + WINDOW - 5000);
    expect(second.resetTime.getTime()).toBeLessThan(Date.now() + WINDOW + 5000);
  });

  it("keeps the reset time of the running window", async () => {
    const store = createStore();
    const first = await store.increment("1.2.3.4");
    const second = await store.increment("1.2.3.4");

    expect(second.resetTime.getTime()).toBe(first.resetTime.getTime());
  });

  it("keeps keys and limiters apart", async () => {
    const login = createStore("login");
    const register = createStore("register");

    await login.increment("1.2.3.4");
    await login.increment("1.2.3.4");

    expect((await login.increment("5.6.7.8")).totalHits).toBe(1);
    expect((await register.increment("1.2.3.4")).totalHits).toBe(1);
  });

  it("starts a new window once the old one has ended", async () => {
    const store = createStore();

    await store.increment("1.2.3.4");
    await store.increment("1.2.3.4");
    await expireAll();

    expect((await store.increment("1.2.3.4")).totalHits).toBe(1);
  });

  it("reads the current count without changing it", async () => {
    const store = createStore();

    expect(await store.get("1.2.3.4")).toBeUndefined();
    await store.increment("1.2.3.4");

    expect((await store.get("1.2.3.4")).totalHits).toBe(1);
    expect((await store.get("1.2.3.4")).totalHits).toBe(1);

    await expireAll();
    expect(await store.get("1.2.3.4")).toBeUndefined();
  });

  it("takes back one hit but never goes below zero", async () => {
    const store = createStore();

    await store.increment("1.2.3.4");
    await store.increment("1.2.3.4");
    await store.decrement("1.2.3.4");
    expect((await store.get("1.2.3.4")).totalHits).toBe(1);

    await store.decrement("1.2.3.4");
    await store.decrement("1.2.3.4");
    expect((await store.get("1.2.3.4")).totalHits).toBe(0);
  });

  it("forgets a key on reset", async () => {
    const store = createStore();

    await store.increment("1.2.3.4");
    await store.resetKey("1.2.3.4");

    expect((await store.increment("1.2.3.4")).totalHits).toBe(1);
  });

  it("counts every hit when requests arrive at the same time", async () => {
    const store = createStore();
    const results = await Promise.all(
      Array.from({ length: 20 }, () => store.increment("1.2.3.4")),
    );

    expect(
      results.map((result) => result.totalHits).sort((a, b) => a - b),
    ).toEqual(Array.from({ length: 20 }, (_, index) => index + 1));
  });
});
