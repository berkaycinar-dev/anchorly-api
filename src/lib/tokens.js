import { createHash, randomBytes } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";

export const ACCESS_TOKEN_ALGORITHM = "HS256";
export const ACCESS_TOKEN_ISSUER = "anchorly-api";
export const ACCESS_TOKEN_AUDIENCE = "anchorly";

const encoder = new TextEncoder();

function toKey(secret) {
  return encoder.encode(secret);
}

function toSeconds(date) {
  return Math.floor(date.getTime() / 1000);
}

export function createAccessToken(
  { userId, sessionId },
  { secret, ttlSeconds, now = new Date() },
) {
  const issuedAt = toSeconds(now);

  return new SignJWT({ sid: sessionId })
    .setProtectedHeader({ alg: ACCESS_TOKEN_ALGORITHM, typ: "JWT" })
    .setSubject(userId)
    .setIssuer(ACCESS_TOKEN_ISSUER)
    .setAudience(ACCESS_TOKEN_AUDIENCE)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + ttlSeconds)
    .sign(toKey(secret));
}

export async function verifyAccessToken(token, { secret, now = new Date() }) {
  try {
    const { payload } = await jwtVerify(token, toKey(secret), {
      algorithms: [ACCESS_TOKEN_ALGORITHM],
      issuer: ACCESS_TOKEN_ISSUER,
      audience: ACCESS_TOKEN_AUDIENCE,
      requiredClaims: ["sub", "sid", "exp"],
      currentDate: now,
    });

    if (typeof payload.sub !== "string" || typeof payload.sid !== "string") {
      return null;
    }

    return { userId: payload.sub, sessionId: payload.sid };
  } catch {
    return null;
  }
}

export function generateRefreshToken() {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}
