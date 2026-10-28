import { z } from "zod";
import {
  FONT_FAMILIES,
  LANGUAGES,
  THEMES,
  WEEK_START_DAYS,
} from "../constants/settings.js";

export const settingsPatchSchema = z
  .strictObject({
    theme: z.enum(THEMES).optional(),
    language: z.enum(LANGUAGES).optional(),
    fontFamily: z.enum(FONT_FAMILIES).optional(),
    weekStartDay: z.enum(WEEK_START_DAYS).optional(),
  })
  .refine((patch) => Object.keys(patch).length > 0, {
    message: "At least one setting must be provided",
  });
