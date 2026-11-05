import { z } from "zod";
import {
  DASHBOARD_CARD_ID_MAX_LENGTH,
  DASHBOARD_CARD_SIZES,
  DASHBOARD_LAYOUT_MAX_CARDS,
  FONT_FAMILIES,
  LANGUAGES,
  THEMES,
  TIMEZONE_MAX_LENGTH,
  WEEK_START_DAYS,
} from "../constants/settings.js";

const dashboardCardSchema = z.strictObject({
  id: z.string().min(1).max(DASHBOARD_CARD_ID_MAX_LENGTH),
  size: z.enum(DASHBOARD_CARD_SIZES),
});

const dashboardLayoutSchema = z
  .array(dashboardCardSchema)
  .max(DASHBOARD_LAYOUT_MAX_CARDS)
  .refine(
    (layout) => new Set(layout.map((card) => card.id)).size === layout.length,
    { message: "Dashboard cards must not repeat" },
  );

function isValidTimeZone(value) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

const timezoneSchema = z
  .string()
  .min(1)
  .max(TIMEZONE_MAX_LENGTH)
  .refine(isValidTimeZone, { message: "Unknown time zone" });

export const settingsPatchSchema = z
  .strictObject({
    theme: z.enum(THEMES).optional(),
    language: z.enum(LANGUAGES).optional(),
    fontFamily: z.enum(FONT_FAMILIES).optional(),
    weekStartDay: z.enum(WEEK_START_DAYS).optional(),
    timezone: timezoneSchema.optional(),
    dashboardLayout: dashboardLayoutSchema.optional(),
  })
  .refine((patch) => Object.keys(patch).length > 0, {
    message: "At least one setting must be provided",
  });
