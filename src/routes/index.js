import { createAuthRouter } from "./auth.js";
import { createProjectsRouter } from "./projects.js";
import { createRoutinesRouter } from "./routines.js";
import { createSettingsRouter } from "./settings.js";
import { createTasksRouter } from "./tasks.js";

export const PUBLIC_ROUTERS = [["/auth", createAuthRouter]];

export const RESOURCE_ROUTERS = [
  ["/me/settings", createSettingsRouter],
  ["/projects", createProjectsRouter],
  ["/routines", createRoutinesRouter],
  ["/tasks", createTasksRouter],
];
