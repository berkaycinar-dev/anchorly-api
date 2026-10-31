import { and, eq, isNull } from "drizzle-orm";
import { sessions, userSettings, users } from "../db/schema/index.js";
import { emailTakenError, invalidCredentialsError } from "../lib/httpError.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import {
  createAccessToken,
  generateRefreshToken,
  hashToken,
} from "../lib/tokens.js";

const DAY_IN_MS = 24 * 60 * 60 * 1000;

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
  const refreshTokenExpiresAt = new Date(
    now.getTime() + auth.refreshTokenTtlDays * DAY_IN_MS,
  );

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

  const accessToken = await createAccessToken(
    { userId, sessionId: session.id },
    { secret: auth.jwtSecret, ttlSeconds: auth.accessTokenTtlSeconds, now },
  );

  return {
    accessToken,
    accessTokenExpiresIn: auth.accessTokenTtlSeconds,
    refreshToken,
    refreshTokenExpiresAt,
  };
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
