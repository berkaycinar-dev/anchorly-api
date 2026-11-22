import { and, eq, isNull, ne } from "drizzle-orm";
import { CHANGE_EMAIL_TTL_HOURS } from "../constants/emailTokens.js";
import { TERMS_VERSION } from "../constants/legal.js";
import { DEFAULT_SETTINGS } from "../constants/settings.js";
import {
  emailTokens,
  sessions,
  userSettings,
  users,
} from "../db/schema/index.js";
import {
  emailTakenError,
  emailUnchangedError,
  invalidEmailTokenError,
  invalidCurrentPasswordError,
  notFoundError,
  passwordNotSetError,
} from "../lib/httpError.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { toPublicUser } from "./authService.js";
import { consumeEmailToken, issueEmailToken } from "./emailTokenService.js";

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

export async function acceptTerms(db, { userId, now = new Date() }) {
  const [updated] = await db
    .update(users)
    .set({ termsVersion: TERMS_VERSION, termsAcceptedAt: now })
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

async function findLanguage(db, userId) {
  const [row] = await db
    .select({ language: userSettings.language })
    .from(userSettings)
    .where(eq(userSettings.userId, userId));

  return row?.language ?? DEFAULT_SETTINGS.language;
}

async function isEmailTaken(db, email) {
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email));

  return Boolean(row);
}

export async function requestEmailChange(db, { userId, newEmail, password }) {
  const user = await findUser(db, userId);

  await confirmPassword(user, password);

  if (newEmail === user.email) {
    throw emailUnchangedError();
  }

  return db.transaction(async (tx) => {
    if (await isEmailTaken(tx, newEmail)) {
      throw emailTakenError();
    }

    const token = await issueEmailToken(tx, {
      userId,
      purpose: "change_email",
      email: newEmail,
      ttlHours: CHANGE_EMAIL_TTL_HOURS,
    });

    return { user, language: await findLanguage(tx, userId), token };
  });
}

export async function confirmEmailChange(db, { token, now = new Date() }) {
  return db.transaction(async (tx) => {
    const issued = await consumeEmailToken(tx, {
      token,
      purpose: "change_email",
      now,
    });

    if (!issued) {
      throw invalidEmailTokenError();
    }

    const [user] = await tx
      .select()
      .from(users)
      .where(eq(users.id, issued.userId));

    if (!user) {
      throw invalidEmailTokenError();
    }

    if (await isEmailTaken(tx, issued.email)) {
      throw emailTakenError();
    }

    const [updated] = await tx
      .update(users)
      .set({ email: issued.email, emailVerifiedAt: now })
      .where(eq(users.id, user.id))
      .returning();

    await tx
      .delete(emailTokens)
      .where(
        and(
          eq(emailTokens.userId, user.id),
          eq(emailTokens.purpose, "verify_email"),
          isNull(emailTokens.usedAt),
        ),
      );

    return {
      user: toPublicUser(updated),
      previousEmail: user.email,
      language: await findLanguage(tx, user.id),
    };
  });
}
