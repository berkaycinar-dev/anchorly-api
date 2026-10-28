import { sql } from "drizzle-orm";
import { check, pgTable, text, uuid } from "drizzle-orm/pg-core";
import {
  DEFAULT_SETTINGS,
  FONT_FAMILIES,
  LANGUAGES,
  THEMES,
  WEEK_START_DAYS,
} from "../../constants/settings.js";
import { createdAt, sqlList, updatedAt } from "./helpers.js";
import { users } from "./users.js";

export const userSettings = pgTable(
  "user_settings",
  {
    userId: uuid()
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    theme: text().notNull().default(DEFAULT_SETTINGS.theme),
    language: text().notNull().default(DEFAULT_SETTINGS.language),
    fontFamily: text().notNull().default(DEFAULT_SETTINGS.fontFamily),
    weekStartDay: text().notNull().default(DEFAULT_SETTINGS.weekStartDay),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    check(
      "user_settings_theme_check",
      sql`${table.theme} in (${sqlList(THEMES)})`,
    ),
    check(
      "user_settings_language_check",
      sql`${table.language} in (${sqlList(LANGUAGES)})`,
    ),
    check(
      "user_settings_font_family_check",
      sql`${table.fontFamily} in (${sqlList(FONT_FAMILIES)})`,
    ),
    check(
      "user_settings_week_start_day_check",
      sql`${table.weekStartDay} in (${sqlList(WEEK_START_DAYS)})`,
    ),
  ],
);
