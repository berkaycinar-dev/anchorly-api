import { z } from "zod";
import { IMPORT_LIMITS } from "../constants/import.js";
import { createProjectSchema } from "./projects.js";
import { createRoutineSchema } from "./routines.js";
import { createTaskSchema } from "./tasks.js";

const UNIQUE_IDS_MESSAGE = "Ids must be unique";

function hasUniqueIds(items) {
  return new Set(items.map((item) => item.id)).size === items.length;
}

function records(schema, limit) {
  return z
    .array(schema)
    .max(limit)
    .refine(hasUniqueIds, { message: UNIQUE_IDS_MESSAGE })
    .default([]);
}

const importedRoutineCheck = z.strictObject({
  routineId: z.uuid(),
  date: z.iso.date(),
  checked: z.boolean(),
});

export const importSchema = z.strictObject({
  projects: records(createProjectSchema, IMPORT_LIMITS.projects),
  routines: records(createRoutineSchema, IMPORT_LIMITS.routines),
  routineChecks: z
    .array(importedRoutineCheck)
    .max(IMPORT_LIMITS.routineChecks)
    .default([]),
  tasks: records(createTaskSchema, IMPORT_LIMITS.tasks),
});
