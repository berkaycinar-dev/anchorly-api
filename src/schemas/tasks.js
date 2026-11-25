import { z } from "zod";
import {
  BOARD_STATUSES,
  DEFAULT_TASK_CATEGORY,
  DUE_TIME_PATTERN,
  REPEAT_RULES,
  TASK_CATEGORIES,
} from "../constants/tasks.js";

export const COMPLETED_AT_MESSAGE =
  "An unfinished task cannot have a completion date";

const taskStep = z.strictObject({
  id: z.uuid(),
  text: z.string().min(1).max(500),
  done: z.boolean(),
});

const taskFields = {
  title: z.string().trim().min(1).max(500),
  category: z.enum(TASK_CATEGORIES),
  date: z.union([z.iso.date(), z.literal("")]),
  completed: z.boolean(),
  completedAt: z.iso.date().nullable(),
  projectId: z.uuid().nullable(),
  description: z.string().max(10000),
  steps: z.array(taskStep).max(100),
  order: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  repeat: z.enum(REPEAT_RULES),
  repeatGroupId: z.uuid().nullable(),
  boardStatus: z.enum(BOARD_STATUSES).nullable(),
  important: z.boolean(),
  dueTime: z.union([z.string().regex(DUE_TIME_PATTERN), z.literal("")]),
};

const ignoredFields = {
  attachments: z
    .array(z.unknown())
    .optional()
    .describe("Accepted for compatibility and ignored"),
};

export const taskIdParams = z.object({ id: z.uuid() });

export const createTaskSchema = z
  .strictObject({
    id: z.uuid(),
    title: taskFields.title,
    order: taskFields.order,
    category: taskFields.category.default(DEFAULT_TASK_CATEGORY),
    date: taskFields.date.default(""),
    completed: taskFields.completed.default(false),
    completedAt: taskFields.completedAt.default(null),
    projectId: taskFields.projectId.default(null),
    description: taskFields.description.default(""),
    steps: taskFields.steps.default([]),
    repeat: taskFields.repeat.default("none"),
    repeatGroupId: taskFields.repeatGroupId.default(null),
    boardStatus: taskFields.boardStatus.default(null),
    important: taskFields.important.default(false),
    dueTime: taskFields.dueTime.default(""),
    ...ignoredFields,
  })
  .refine((task) => task.completed || task.completedAt === null, {
    message: COMPLETED_AT_MESSAGE,
    path: ["completedAt"],
  });

export const updateTaskSchema = z.strictObject({
  id: z.uuid().optional(),
  ...Object.fromEntries(
    Object.entries(taskFields).map(([name, schema]) => [
      name,
      schema.optional(),
    ]),
  ),
  ...ignoredFields,
});

export const reorderTasksSchema = z.strictObject({
  orderedIds: z
    .array(z.uuid())
    .min(1)
    .max(5000)
    .refine((ids) => new Set(ids).size === ids.length, {
      message: "Task ids must be unique",
    }),
});

export const bulkTasksSchema = z.strictObject({
  operations: z
    .array(
      z.discriminatedUnion("type", [
        z.strictObject({ type: z.literal("create"), task: createTaskSchema }),
        z.strictObject({
          type: z.literal("update"),
          id: z.uuid(),
          patch: updateTaskSchema,
        }),
        z.strictObject({ type: z.literal("delete"), id: z.uuid() }),
      ]),
    )
    .min(1)
    .max(500),
});
