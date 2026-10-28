import { z } from "zod";

const projectName = z.string().trim().min(1).max(100);

export const projectIdParams = z.object({ id: z.uuid() });

export const createProjectSchema = z.strictObject({
  id: z.uuid(),
  name: projectName,
});

export const updateProjectSchema = z.strictObject({
  name: projectName,
});
