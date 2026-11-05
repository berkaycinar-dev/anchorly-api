import { and, eq, isNull, ne } from "drizzle-orm";
import { sessions, users } from "../db/schema/index.js";
import {
  invalidCurrentPasswordError,
  notFoundError,
  passwordNotSetError,
} from "../lib/httpError.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { toPublicUser } from "./authService.js";

async function findUser(db, userId) {
  const [user] = await db.select().from(users).where(eq(users.id, userId));

  if (!user) {
    throw notFoundError("User not found");
  }

  return user;
}

export async function getMe(db, userId) {
  return toPublicUser(await findUser(db, userId));
}

export async function updateMe(db, userId, { displayName }) {
  const [updated] = await db
    .update(users)
    .set({ displayName })
    .where(eq(users.id, userId))
    .returning();

  if (!updated) {
    throw notFoundError("User not found");
  }

  return toPublicUser(updated);
}

async function confirmPassword(user, password) {
  if (!user.passwordHash) {
    throw passwordNotSetError();
  }

  if (!(await verifyPassword(user.passwordHash, password))) {
    throw invalidCurrentPasswordError();
  }
}

export async function deleteAccount(db, { userId, password }) {
  const user = await findUser(db, userId);

  await confirmPassword(user, password);
  await db.delete(users).where(eq(users.id, userId));
}

export async function changePassword(
  db,
  { userId, sessionId, currentPassword, newPassword, now = new Date() },
) {
  const user = await findUser(db, userId);

  await confirmPassword(user, currentPassword);

  const passwordHash = await hashPassword(newPassword);

  await db.transaction(async (tx) => {
    await tx.update(users).set({ passwordHash }).where(eq(users.id, userId));

    await tx
      .update(sessions)
      .set({ revokedAt: now })
      .where(
        and(
          eq(sessions.userId, userId),
          ne(sessions.id, sessionId),
          isNull(sessions.revokedAt),
        ),
      );
  });
}
