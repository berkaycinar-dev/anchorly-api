import { z } from "zod";

const routineTitle = z.string().trim().min(1).max(100);

export const routineIdParams = z.object({ id: z.uuid() });

export const routineCheckParams = z.object({
  id: z.uuid(),
  date: z.iso.date(),
});

export const createRoutineSchema = z.strictObject({
  id: z.uuid(),
  title: routineTitle,
});

export const updateRoutineSchema = z.strictObject({
  title: routineTitle,
});

export const setRoutineCheckSchema = z.strictObject({
  checked: z.boolean(),
});
