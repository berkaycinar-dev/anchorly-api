import { describe, expect, it } from "vitest";
import { loadAuthConfig, loadConfig } from "../src/config.js";

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

describe("loadAuthConfig", () => {
  const jwtSecret = "a-random-secret-that-is-long-enough-42";

  it("returns the secret and the default token lifetimes", () => {
    expect(loadAuthConfig({ JWT_SECRET: jwtSecret })).toEqual({
      jwtSecret,
      accessTokenTtlSeconds: 900,
      refreshTokenTtlDays: 30,
    });
  });

  it("converts the token lifetimes from text to numbers", () => {
    const config = loadAuthConfig({
      JWT_SECRET: jwtSecret,
      ACCESS_TOKEN_TTL_SECONDS: "300",
      REFRESH_TOKEN_TTL_DAYS: "7",
    });

    expect(config.accessTokenTtlSeconds).toBe(300);
    expect(config.refreshTokenTtlDays).toBe(7);
  });

  it("rejects a missing or short secret", () => {
    expect(() => loadAuthConfig({})).toThrow(/JWT_SECRET/);
    expect(() => loadAuthConfig({ JWT_SECRET: "x".repeat(31) })).toThrow(
      /at least 32 characters/,
    );
  });

  it("rejects the placeholder secret from the example file", () => {
    expect(() =>
      loadAuthConfig({
        JWT_SECRET: "change_me_to_a_random_string_of_at_least_32_characters",
      }),
    ).toThrow(/placeholder/);
  });

  it("rejects token lifetimes outside the allowed range", () => {
    expect(() =>
      loadAuthConfig({ JWT_SECRET: jwtSecret, ACCESS_TOKEN_TTL_SECONDS: "30" }),
    ).toThrow(/ACCESS_TOKEN_TTL_SECONDS/);
    expect(() =>
      loadAuthConfig({ JWT_SECRET: jwtSecret, REFRESH_TOKEN_TTL_DAYS: "365" }),
    ).toThrow(/REFRESH_TOKEN_TTL_DAYS/);
  });

  it("does not require the auth settings for loading the database config", () => {
    expect(() => loadConfig(validEnvironment)).not.toThrow();
  });
});
