import { DEV_USER } from "../constants/devUser.js";
import { userSettings, users } from "./schema/index.js";

export async function seedDevUser(db) {
  await db.transaction(async (tx) => {
    await tx.insert(users).values(DEV_USER).onConflictDoNothing();
    await tx
      .insert(userSettings)
      .values({ userId: DEV_USER.id })
      .onConflictDoNothing();
  });
}
