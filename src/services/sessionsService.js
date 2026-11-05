import { and, desc, eq, gt, isNull, ne } from "drizzle-orm";
import { sessions } from "../db/schema/index.js";
import { notFoundError } from "../lib/httpError.js";

function activeSessionsOf(userId, now) {
  return and(
    eq(sessions.userId, userId),
    isNull(sessions.revokedAt),
    gt(sessions.expiresAt, now),
  );
}

export async function listActiveSessions(
  db,
  { userId, currentSessionId, now = new Date() },
) {
  const rows = await db
    .select()
    .from(sessions)
    .where(activeSessionsOf(userId, now))
    .orderBy(desc(sessions.lastUsedAt), desc(sessions.createdAt));

  return rows
    .map((row) => ({
      id: row.id,
      deviceName: row.deviceName,
      createdAt: row.createdAt,
      lastUsedAt: row.lastUsedAt,
      expiresAt: row.expiresAt,
      current: row.id === currentSessionId,
    }))
    .sort((first, second) => Number(second.current) - Number(first.current));
}

export async function revokeOwnSession(
  db,
  { userId, sessionId, now = new Date() },
) {
  const [revoked] = await db
    .update(sessions)
    .set({ revokedAt: now })
    .where(and(eq(sessions.id, sessionId), activeSessionsOf(userId, now)))
    .returning({ id: sessions.id });

  if (!revoked) {
    throw notFoundError("Session not found");
  }
}

export async function revokeOtherSessions(
  db,
  { userId, currentSessionId, now = new Date() },
) {
  await db
    .update(sessions)
    .set({ revokedAt: now })
    .where(
      and(activeSessionsOf(userId, now), ne(sessions.id, currentSessionId)),
    );
}
