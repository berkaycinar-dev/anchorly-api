import { eq } from "drizzle-orm";
import { userSettings } from "../db/schema/index.js";

function toSettings(row) {
  return {
    theme: row.theme,
    language: row.language,
    fontFamily: row.fontFamily,
    weekStartDay: row.weekStartDay,
  };
}

async function findSettingsRow(db, userId) {
  const [row] = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, userId));

  return row;
}

export async function getSettings(db, userId) {
  const existing = await findSettingsRow(db, userId);

  if (existing) {
    return toSettings(existing);
  }

  await db.insert(userSettings).values({ userId }).onConflictDoNothing();

  return toSettings(await findSettingsRow(db, userId));
}

export async function updateSettings(db, userId, patch) {
  const [row] = await db
    .insert(userSettings)
    .values({ userId, ...patch })
    .onConflictDoUpdate({
      target: userSettings.userId,
      set: patch,
    })
    .returning();

  return toSettings(row);
}
