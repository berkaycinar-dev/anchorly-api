import { getMe } from "./accountService.js";
import { listProjects } from "./projectsService.js";
import { listRoutineChecks, listRoutines } from "./routinesService.js";
import { getSettings } from "./settingsService.js";
import { listTasks } from "./tasksService.js";

export const EXPORT_FORMAT = "anchorly-export";
export const EXPORT_VERSION = 1;

export async function exportUserData(db, { userId, now = new Date() }) {
  return db.transaction(
    async (tx) => ({
      format: EXPORT_FORMAT,
      version: EXPORT_VERSION,
      exportedAt: now.toISOString(),
      user: await getMe(tx, userId),
      settings: await getSettings(tx, userId),
      projects: await listProjects(tx, userId),
      routines: await listRoutines(tx, userId),
      routineChecks: await listRoutineChecks(tx, userId),
      tasks: await listTasks(tx, userId),
    }),
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}

export function exportFileName(now = new Date()) {
  return `anchorly-export-${now.toISOString().slice(0, 10)}.json`;
}
