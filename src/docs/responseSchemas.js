import { z } from "zod";
import {
  DASHBOARD_CARD_SIZES,
  FONT_FAMILIES,
  LANGUAGES,
  THEMES,
  WEEK_START_DAYS,
} from "../constants/settings.js";
import { REPEAT_RULES, TASK_CATEGORIES } from "../constants/tasks.js";

export const healthResponse = z.strictObject({
  status: z.enum(["ok", "error"]),
  database: z.enum(["ok", "unreachable"]),
});

export const pingResponse = z.strictObject({
  status: z.literal("ok"),
});

export const errorResponse = z.strictObject({
  error: z.strictObject({
    code: z.string(),
    message: z.string(),
    details: z
      .array(z.strictObject({ path: z.string(), message: z.string() }))
      .optional(),
  }),
});

export const settingsResponse = z.strictObject({
  theme: z.enum(THEMES),
  language: z.enum(LANGUAGES),
  fontFamily: z.enum(FONT_FAMILIES),
  weekStartDay: z.enum(WEEK_START_DAYS),
  timezone: z.string(),
  dashboardLayout: z.array(
    z.strictObject({
      id: z.string(),
      size: z.enum(DASHBOARD_CARD_SIZES),
    }),
  ),
});

export const projectResponse = z.strictObject({
  id: z.uuid(),
  name: z.string(),
});

export const routineResponse = z.strictObject({
  id: z.uuid(),
  title: z.string(),
});

export const routineCheckResponse = z.strictObject({
  routineId: z.uuid(),
  date: z.iso.date(),
  checked: z.boolean(),
});

export const taskResponse = z.strictObject({
  id: z.uuid(),
  title: z.string(),
  category: z.enum(TASK_CATEGORIES),
  date: z.union([z.iso.date(), z.literal("")]),
  completed: z.boolean(),
  completedAt: z.iso.date().nullable(),
  projectId: z.uuid().nullable(),
  description: z.string(),
  steps: z.array(
    z.strictObject({ id: z.uuid(), text: z.string(), done: z.boolean() }),
  ),
  order: z.number().int(),
  repeat: z.enum(REPEAT_RULES),
  repeatGroupId: z.uuid().nullable(),
  attachments: z
    .array(z.never())
    .max(0)
    .describe("Always empty until attachments get their own storage"),
});

export const bulkResultResponse = z.strictObject({
  results: z.array(
    z.discriminatedUnion("type", [
      z.strictObject({
        type: z.literal("create"),
        status: z.union([z.literal(200), z.literal(201)]),
        task: taskResponse,
      }),
      z.strictObject({
        type: z.literal("update"),
        status: z.literal(200),
        task: taskResponse,
      }),
      z.strictObject({
        type: z.literal("delete"),
        status: z.literal(204),
        id: z.uuid(),
      }),
    ]),
  ),
});

const importCountResponse = z.strictObject({
  imported: z.number().int().min(0),
  skipped: z.number().int().min(0),
});

export const importResultResponse = z.strictObject({
  projects: importCountResponse,
  routines: importCountResponse,
  routineChecks: importCountResponse,
  tasks: importCountResponse,
});

export const userResponse = z.strictObject({
  id: z.uuid(),
  email: z.email(),
  displayName: z.string().nullable(),
  emailVerifiedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});

export const userResultResponse = z.strictObject({
  user: userResponse,
});

export const sessionResponse = z.strictObject({
  id: z.uuid(),
  deviceName: z.string().nullable(),
  createdAt: z.iso.datetime(),
  lastUsedAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  current: z.boolean().describe("True for the session that sent the request"),
});

export const authSessionResponse = z.strictObject({
  user: userResponse,
  accessToken: z.string().describe("JWT for the Authorization header"),
  accessTokenExpiresIn: z
    .number()
    .int()
    .min(60)
    .max(3600)
    .describe("Seconds until the access token expires"),
  refreshToken: z
    .string()
    .optional()
    .describe(
      "Opaque token for getting a new access token. Only in the body for mobile clients (X-Anchorly-Client: mobile) and body-based refreshes; web clients get it as the HttpOnly anchorly_refresh cookie",
    ),
  refreshTokenExpiresAt: z.iso.datetime(),
});

export const exportResponse = z.strictObject({
  format: z.literal("anchorly-export"),
  version: z.literal(1),
  exportedAt: z.iso.datetime(),
  user: userResponse,
  settings: settingsResponse,
  projects: z.array(projectResponse),
  routines: z.array(routineResponse),
  routineChecks: z.array(routineCheckResponse),
  tasks: z.array(taskResponse),
});

export const RESPONSE_SCHEMAS = {
  Health: healthResponse,
  Ping: pingResponse,
  Error: errorResponse,
  Settings: settingsResponse,
  Project: projectResponse,
  Routine: routineResponse,
  RoutineCheck: routineCheckResponse,
  Task: taskResponse,
  BulkResult: bulkResultResponse,
  ImportResult: importResultResponse,
  User: userResponse,
  AuthSession: authSessionResponse,
  UserResult: userResultResponse,
  Session: sessionResponse,
  Export: exportResponse,
};
