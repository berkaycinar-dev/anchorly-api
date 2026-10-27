import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

const validEnvironment = {
  DATABASE_URL: "postgres://anchorly:secret@localhost:5432/anchorly_dev",
};

describe("loadConfig", () => {
  it("returns the database url and the default port", () => {
    expect(loadConfig(validEnvironment)).toEqual({
      port: 3000,
      databaseUrl: validEnvironment.DATABASE_URL,
    });
  });

  it("converts the port from text to a number", () => {
    const config = loadConfig({ ...validEnvironment, PORT: "4000" });

    expect(config.port).toBe(4000);
  });

  it("accepts the postgresql protocol", () => {
    const databaseUrl = "postgresql://anchorly@localhost/anchorly_dev";

    expect(loadConfig({ DATABASE_URL: databaseUrl }).databaseUrl).toBe(
      databaseUrl,
    );
  });

  it("rejects a missing database url", () => {
    expect(() => loadConfig({})).toThrow(/DATABASE_URL/);
  });

  it("rejects a database url for another database system", () => {
    expect(() =>
      loadConfig({ DATABASE_URL: "mysql://root@localhost:3306/anchorly" }),
    ).toThrow(/DATABASE_URL/);
  });

  it("rejects a port that is not a valid number", () => {
    expect(() => loadConfig({ ...validEnvironment, PORT: "abc" })).toThrow(
      /PORT/,
    );
    expect(() => loadConfig({ ...validEnvironment, PORT: "70000" })).toThrow(
      /PORT/,
    );
  });
});
