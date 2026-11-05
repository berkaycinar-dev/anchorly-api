import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import {
  createAccessToken,
  generateRefreshToken,
  hashToken,
  verifyAccessToken,
} from "../src/lib/tokens.js";

const secret = "test-secret-that-is-long-enough-123456";
const otherSecret = "another-secret-that-is-long-enough-987";
const subject = {
  userId: "11111111-1111-4111-8111-111111111111",
  sessionId: "22222222-2222-4222-8222-222222222222",
};
const issuedAt = new Date("2026-10-31T12:00:00Z");

function decodePart(token, index) {
  return JSON.parse(
    Buffer.from(token.split(".")[index], "base64url").toString("utf8"),
  );
}

function secondsAfter(date, seconds) {
  return new Date(date.getTime() + seconds * 1000);
}

describe("access tokens", () => {
  it("signs a token with the user, session, issuer, audience and expiry", async () => {
    const token = await createAccessToken(subject, {
      secret,
      ttlSeconds: 900,
      now: issuedAt,
    });

    expect(decodePart(token, 0)).toEqual({ alg: "HS256", typ: "JWT" });
    expect(decodePart(token, 1)).toEqual({
      sub: subject.userId,
      sid: subject.sessionId,
      iss: "anchorly-api",
      aud: "anchorly",
      iat: 1793448000,
      exp: 1793448900,
    });
  });

  it("returns the user and session for a valid token", async () => {
    const token = await createAccessToken(subject, {
      secret,
      ttlSeconds: 900,
      now: issuedAt,
    });

    await expect(
      verifyAccessToken(token, { secret, now: secondsAfter(issuedAt, 899) }),
    ).resolves.toEqual(subject);
  });

  it("rejects a token after it has expired", async () => {
    const token = await createAccessToken(subject, {
      secret,
      ttlSeconds: 900,
      now: issuedAt,
    });

    await expect(
      verifyAccessToken(token, { secret, now: secondsAfter(issuedAt, 900) }),
    ).resolves.toBeNull();
  });

  it("rejects a token signed with another secret", async () => {
    const token = await createAccessToken(subject, {
      secret: otherSecret,
      ttlSeconds: 900,
      now: issuedAt,
    });

    await expect(
      verifyAccessToken(token, { secret, now: issuedAt }),
    ).resolves.toBeNull();
  });

  it("rejects a token whose payload was changed", async () => {
    const token = await createAccessToken(subject, {
      secret,
      ttlSeconds: 900,
      now: issuedAt,
    });
    const [header, , signature] = token.split(".");
    const forgedPayload = Buffer.from(
      JSON.stringify({
        ...decodePart(token, 1),
        sub: "99999999-9999-4999-8999-999999999999",
      }),
    ).toString("base64url");

    await expect(
      verifyAccessToken(`${header}.${forgedPayload}.${signature}`, {
        secret,
        now: issuedAt,
      }),
    ).resolves.toBeNull();
  });

  it("rejects an unsigned token that uses the none algorithm", async () => {
    const header = Buffer.from(
      JSON.stringify({ alg: "none", typ: "JWT" }),
    ).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({
        sub: subject.userId,
        sid: subject.sessionId,
        iss: "anchorly-api",
        aud: "anchorly",
        exp: 1793448900,
      }),
    ).toString("base64url");

    await expect(
      verifyAccessToken(`${header}.${payload}.`, { secret, now: issuedAt }),
    ).resolves.toBeNull();
  });

  it("rejects a token signed with another hmac algorithm", async () => {
    const token = await new SignJWT({ sid: subject.sessionId })
      .setProtectedHeader({ alg: "HS512" })
      .setSubject(subject.userId)
      .setIssuer("anchorly-api")
      .setAudience("anchorly")
      .setIssuedAt(1793448000)
      .setExpirationTime(1793448900)
      .sign(new TextEncoder().encode(secret));

    await expect(
      verifyAccessToken(token, { secret, now: issuedAt }),
    ).resolves.toBeNull();
  });

  it("rejects a token with the wrong issuer or audience", async () => {
    const key = new TextEncoder().encode(secret);
    const sign = (issuer, audience) =>
      new SignJWT({ sid: subject.sessionId })
        .setProtectedHeader({ alg: "HS256" })
        .setSubject(subject.userId)
        .setIssuer(issuer)
        .setAudience(audience)
        .setIssuedAt(1793448000)
        .setExpirationTime(1793448900)
        .sign(key);

    await expect(
      verifyAccessToken(await sign("someone-else", "anchorly"), {
        secret,
        now: issuedAt,
      }),
    ).resolves.toBeNull();
    await expect(
      verifyAccessToken(await sign("anchorly-api", "another-app"), {
        secret,
        now: issuedAt,
      }),
    ).resolves.toBeNull();
  });

  it("rejects a token without a session id", async () => {
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(subject.userId)
      .setIssuer("anchorly-api")
      .setAudience("anchorly")
      .setIssuedAt(1793448000)
      .setExpirationTime(1793448900)
      .sign(new TextEncoder().encode(secret));

    await expect(
      verifyAccessToken(token, { secret, now: issuedAt }),
    ).resolves.toBeNull();
  });

  it("rejects text that is not a token", async () => {
    await expect(
      verifyAccessToken("not.a.token", { secret, now: issuedAt }),
    ).resolves.toBeNull();
    await expect(
      verifyAccessToken("", { secret, now: issuedAt }),
    ).resolves.toBeNull();
  });
});

describe("refresh tokens", () => {
  it("generates a 256-bit url-safe random token", () => {
    const token = generateRefreshToken();

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(token, "base64url")).toHaveLength(32);
  });

  it("generates a different token every time", () => {
    const tokens = new Set(
      Array.from({ length: 100 }, () => generateRefreshToken()),
    );

    expect(tokens.size).toBe(100);
  });

  it("hashes a token to a stable sha-256 hex string", () => {
    expect(hashToken("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(hashToken("abc")).toBe(hashToken("abc"));
    expect(hashToken("abd")).not.toBe(hashToken("abc"));
  });
});
