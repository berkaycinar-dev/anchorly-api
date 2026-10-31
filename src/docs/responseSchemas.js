import { z } from "zod";
import {
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

export const userResponse = z.strictObject({
  id: z.uuid(),
  email: z.email(),
  displayName: z.string().nullable(),
  emailVerifiedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});

export const registerResponse = z.strictObject({
  user: userResponse,
});

export const RESPONSE_SCHEMAS = {
  Health: healthResponse,
  Error: errorResponse,
  Settings: settingsResponse,
  Project: projectResponse,
  Routine: routineResponse,
  RoutineCheck: routineCheckResponse,
  Task: taskResponse,
  BulkResult: bulkResultResponse,
  User: userResponse,
  RegisterResult: registerResponse,
};
