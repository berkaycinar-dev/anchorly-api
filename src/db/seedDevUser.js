import { DEV_USER } from "../constants/devUser.js";
import { userSettings, users } from "./schema/index.js";

export async function seedDevUser(db, { passwordHash = null } = {}) {
  await db.transaction(async (tx) => {
    const insertUser = tx.insert(users).values({ ...DEV_USER, passwordHash });

    await (passwordHash
      ? insertUser.onConflictDoUpdate({
          target: users.id,
          set: { passwordHash },
        })
      : insertUser.onConflictDoNothing());

    await tx
      .insert(userSettings)
      .values({ userId: DEV_USER.id })
      .onConflictDoNothing();
  });
}
