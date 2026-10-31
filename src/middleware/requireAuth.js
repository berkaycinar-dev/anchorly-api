import { and, eq, gt, isNull } from "drizzle-orm";
import { sessions } from "../db/schema/index.js";
import { unauthorizedError } from "../lib/httpError.js";
import { verifyAccessToken } from "../lib/tokens.js";

const BEARER_PATTERN = /^Bearer ([A-Za-z0-9._~+/-]+=*)$/i;

function readBearerToken(request) {
  const match = BEARER_PATTERN.exec(request.get("authorization") ?? "");

  return match?.[1] ?? null;
}

export function createRequireAuth({ db, auth }) {
  return async function requireAuth(request, response, next) {
    const token = readBearerToken(request);

    if (!token) {
      throw unauthorizedError();
    }

    const claims = await verifyAccessToken(token, { secret: auth.jwtSecret });

    if (!claims) {
      throw unauthorizedError();
    }

    const [session] = await db
      .select({ id: sessions.id })
      .from(sessions)
      .where(
        and(
          eq(sessions.id, claims.sessionId),
          eq(sessions.userId, claims.userId),
          isNull(sessions.revokedAt),
          gt(sessions.expiresAt, new Date()),
        ),
      );

    if (!session) {
      throw unauthorizedError();
    }

    request.user = { id: claims.userId, sessionId: claims.sessionId };
    next();
  };
}
