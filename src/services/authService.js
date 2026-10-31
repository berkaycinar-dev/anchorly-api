import { and, eq, isNull, or } from "drizzle-orm";
import { sessions, userSettings, users } from "../db/schema/index.js";
import {
  emailTakenError,
  invalidCredentialsError,
  invalidRefreshTokenError,
} from "../lib/httpError.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import {
  createAccessToken,
  generateRefreshToken,
  hashToken,
} from "../lib/tokens.js";

const DAY_IN_MS = 24 * 60 * 60 * 1000;

export const REFRESH_REUSE_GRACE_MS = 30 * 1000;

function refreshExpiry(now, auth) {
  return new Date(now.getTime() + auth.refreshTokenTtlDays * DAY_IN_MS);
}

async function issueTokens({
  userId,
  sessionId,
  refreshToken,
  refreshTokenExpiresAt,
  auth,
  now,
}) {
  const accessToken = await createAccessToken(
    { userId, sessionId },
    { secret: auth.jwtSecret, ttlSeconds: auth.accessTokenTtlSeconds, now },
  );

  return {
    accessToken,
    accessTokenExpiresIn: auth.accessTokenTtlSeconds,
    refreshToken,
    refreshTokenExpiresAt,
  };
}

export function toPublicUser(row) {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    emailVerifiedAt: row.emailVerifiedAt,
    createdAt: row.createdAt,
  };
}

export async function createSession(
  db,
  { userId, deviceName, auth, now = new Date() },
) {
  const refreshToken = generateRefreshToken();
  const refreshTokenExpiresAt = refreshExpiry(now, auth);

  const [session] = await db
    .insert(sessions)
    .values({
      userId,
      tokenHash: hashToken(refreshToken),
      deviceName: deviceName ?? null,
      createdAt: now,
      lastUsedAt: now,
      expiresAt: refreshTokenExpiresAt,
    })
    .returning({ id: sessions.id });

  return issueTokens({
    userId,
    sessionId: session.id,
    refreshToken,
    refreshTokenExpiresAt,
    auth,
    now,
  });
}

export async function registerUser(
  db,
  { email, password, displayName, deviceName },
  { auth },
) {
  const passwordHash = await hashPassword(password);

  return db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({ email, passwordHash, displayName: displayName ?? null })
      .onConflictDoNothing({ target: users.email })
      .returning();

    if (!user) {
      throw emailTakenError();
    }

    await tx.insert(userSettings).values({ userId: user.id });

    const tokens = await createSession(tx, {
      userId: user.id,
      deviceName,
      auth,
    });

    return { user: toPublicUser(user), ...tokens };
  });
}

export async function loginUser(db, { email, password, deviceName }, { auth }) {
  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.email, email), isNull(users.deletedAt)));

  const passwordMatches = await verifyPassword(
    user?.passwordHash ?? null,
    password,
  );

  if (!user || !passwordMatches) {
    throw invalidCredentialsError();
  }

  const tokens = await createSession(db, {
    userId: user.id,
    deviceName,
    auth,
  });

  return { user: toPublicUser(user), ...tokens };
}

function decideRefresh(session, tokenHash, now) {
  if (!session || session.revokedAt || session.expiresAt <= now) {
    return "reject";
  }

  if (session.tokenHash === tokenHash) {
    return "rotate";
  }

  const sinceRotation = now.getTime() - (session.rotatedAt?.getTime() ?? 0);

  return sinceRotation <= REFRESH_REUSE_GRACE_MS ? "retry" : "reuse";
}

export async function refreshSession(
  db,
  { refreshToken, auth, now = new Date() },
) {
  const tokenHash = hashToken(refreshToken);

  const outcome = await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ session: sessions, user: users })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(
        or(
          eq(sessions.tokenHash, tokenHash),
          eq(sessions.previousTokenHash, tokenHash),
        ),
      )
      .for("update", { of: sessions });

    const decision = decideRefresh(row?.session, tokenHash, now);

    if (decision === "reject") {
      return { decision };
    }

    if (decision === "reuse") {
      await tx
        .update(sessions)
        .set({ revokedAt: now })
        .where(eq(sessions.id, row.session.id));

      return { decision };
    }

    const nextRefreshToken = generateRefreshToken();
    const refreshTokenExpiresAt = refreshExpiry(now, auth);

    await tx
      .update(sessions)
      .set({
        tokenHash: hashToken(nextRefreshToken),
        previousTokenHash: tokenHash,
        rotatedAt: decision === "rotate" ? now : row.session.rotatedAt,
        lastUsedAt: now,
        expiresAt: refreshTokenExpiresAt,
      })
      .where(eq(sessions.id, row.session.id));

    const tokens = await issueTokens({
      userId: row.user.id,
      sessionId: row.session.id,
      refreshToken: nextRefreshToken,
      refreshTokenExpiresAt,
      auth,
      now,
    });

    return { decision, result: { user: toPublicUser(row.user), ...tokens } };
  });

  if (!outcome.result) {
    throw invalidRefreshTokenError();
  }

  return outcome.result;
}

export async function revokeSession(
  db,
  { userId, sessionId, now = new Date() },
) {
  await db
    .update(sessions)
    .set({ revokedAt: now })
    .where(
      and(
        eq(sessions.id, sessionId),
        eq(sessions.userId, userId),
        isNull(sessions.revokedAt),
      ),
    );
}
