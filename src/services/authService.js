import { userSettings, users } from "../db/schema/index.js";
import { emailTakenError } from "../lib/httpError.js";
import { hashPassword } from "../lib/password.js";

export function toPublicUser(row) {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    emailVerifiedAt: row.emailVerifiedAt,
    createdAt: row.createdAt,
  };
}

export async function registerUser(db, { email, password, displayName }) {
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

    return toPublicUser(user);
  });
}
