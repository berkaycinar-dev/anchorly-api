import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../src/lib/password.js";

describe("password hashing", () => {
  it("creates an argon2id hash with the recommended cost settings", async () => {
    const passwordHash = await hashPassword("correct horse battery");

    expect(passwordHash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(passwordHash).not.toContain("correct horse battery");
  });

  it("creates a different hash for the same password each time", async () => {
    const first = await hashPassword("correct horse battery");
    const second = await hashPassword("correct horse battery");

    expect(first).not.toBe(second);
  });

  it("accepts the correct password", async () => {
    const passwordHash = await hashPassword("correct horse battery");

    await expect(
      verifyPassword(passwordHash, "correct horse battery"),
    ).resolves.toBe(true);
  });

  it("rejects a wrong password, including one that differs only in case", async () => {
    const passwordHash = await hashPassword("correct horse battery");

    await expect(verifyPassword(passwordHash, "wrong password")).resolves.toBe(
      false,
    );
    await expect(
      verifyPassword(passwordHash, "Correct horse battery"),
    ).resolves.toBe(false);
  });

  it("keeps spaces and non-ascii characters as part of the password", async () => {
    const passwordHash = await hashPassword(" Şifre ğüı 123 ");

    await expect(verifyPassword(passwordHash, " Şifre ğüı 123 ")).resolves.toBe(
      true,
    );
    await expect(verifyPassword(passwordHash, "Şifre ğüı 123")).resolves.toBe(
      false,
    );
  });

  it("returns false when the user has no password hash", async () => {
    await expect(verifyPassword(null, "anything at all")).resolves.toBe(false);
  });

  it("returns false instead of throwing for a malformed hash", async () => {
    await expect(verifyPassword("not-a-hash", "anything at all")).resolves.toBe(
      false,
    );
  });
});
