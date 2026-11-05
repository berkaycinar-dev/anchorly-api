import { createAccountRouter } from "./account.js";
import { createAuthRouter } from "./auth.js";
import { createImportRouter } from "./import.js";
import { createProjectsRouter } from "./projects.js";
import { createRoutinesRouter } from "./routines.js";
import { createSettingsRouter } from "./settings.js";
import { createTasksRouter } from "./tasks.js";

export const PUBLIC_ROUTERS = [["/auth", createAuthRouter]];

export const RESOURCE_ROUTERS = [
  ["/me/settings", createSettingsRouter],
  ["/import", createImportRouter],
  ["/projects", createProjectsRouter],
  ["/routines", createRoutinesRouter],
  ["/tasks", createTasksRouter],
  ["/me", createAccountRouter],
];
