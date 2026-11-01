import { sql } from "drizzle-orm";
import { DEV_USER } from "../constants/devUser.js";
import { userSettings, users } from "./schema/index.js";

export async function seedDevUser(
  db,
  { passwordHash = null, emailVerifiedAt = null } = {},
) {
  await db.transaction(async (tx) => {
    const insertUser = tx
      .insert(users)
      .values({ ...DEV_USER, passwordHash, emailVerifiedAt });

    await (passwordHash
      ? insertUser.onConflictDoUpdate({
          target: users.id,
          set: {
            passwordHash,
            emailVerifiedAt: sql`coalesce(${users.emailVerifiedAt}, excluded.email_verified_at)`,
          },
        })
      : insertUser.onConflictDoNothing());

    await tx
      .insert(userSettings)
      .values({ userId: DEV_USER.id })
      .onConflictDoNothing();
  });
}
