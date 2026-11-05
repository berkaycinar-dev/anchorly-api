import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  CHECK_INSERT_BATCH_SIZE,
  TASK_INSERT_BATCH_SIZE,
} from "../constants/import.js";
import {
  projects,
  routineChecks,
  routines,
  tasks,
} from "../db/schema/index.js";
import { toTaskColumns } from "../mappers/tasks.js";

function toBatches(items, size) {
  const batches = [];

  for (let start = 0; start < items.length; start += size) {
    batches.push(items.slice(start, start + size));
  }

  return batches;
}

async function insertInBatches(items, size, insertBatch) {
  let inserted = 0;

  for (const batch of toBatches(items, size)) {
    inserted += (await insertBatch(batch)).length;
  }

  return inserted;
}

function summarize(total, imported) {
  return { imported, skipped: total - imported };
}

async function findActiveIds(tx, table, userId, ids) {
  if (ids.length === 0) {
    return new Set();
  }

  const rows = await tx
    .select({ id: table.id })
    .from(table)
    .where(
      and(
        eq(table.userId, userId),
        inArray(table.id, ids),
        isNull(table.deletedAt),
      ),
    );

  return new Set(rows.map((row) => row.id));
}

async function importProjects(tx, userId, items, startedAt) {
  const rows = items.map(({ id, name }, index) => ({
    userId,
    id,
    name,
    createdAt: new Date(startedAt + index),
  }));

  return insertInBatches(rows, TASK_INSERT_BATCH_SIZE, (batch) =>
    tx
      .insert(projects)
      .values(batch)
      .onConflictDoNothing()
      .returning({ id: projects.id }),
  );
}

async function importRoutines(tx, userId, items) {
  const [{ nextPosition }] = await tx
    .select({
      nextPosition: sql`coalesce(max(${routines.position}), -1) + 1`.mapWith(
        Number,
      ),
    })
    .from(routines)
    .where(eq(routines.userId, userId));
  const rows = items.map(({ id, title }, index) => ({
    userId,
    id,
    title,
    position: nextPosition + index,
  }));

  return insertInBatches(rows, TASK_INSERT_BATCH_SIZE, (batch) =>
    tx
      .insert(routines)
      .values(batch)
      .onConflictDoNothing()
      .returning({ id: routines.id }),
  );
}

async function importRoutineChecks(tx, userId, items) {
  const routineIds = [...new Set(items.map((check) => check.routineId))];
  const usableRoutineIds = await findActiveIds(
    tx,
    routines,
    userId,
    routineIds,
  );
  const rows = items
    .filter((check) => usableRoutineIds.has(check.routineId))
    .map(({ routineId, date, checked }) => ({
      userId,
      routineId,
      date,
      checked,
    }));

  return insertInBatches(rows, CHECK_INSERT_BATCH_SIZE, (batch) =>
    tx
      .insert(routineChecks)
      .values(batch)
      .onConflictDoNothing()
      .returning({ routineId: routineChecks.routineId }),
  );
}

async function importTasks(tx, userId, items, startedAt) {
  const projectIds = [
    ...new Set(items.map((task) => task.projectId).filter(Boolean)),
  ];
  const usableProjectIds = await findActiveIds(
    tx,
    projects,
    userId,
    projectIds,
  );
  const rows = items.map((task, index) => ({
    userId,
    id: task.id,
    ...toTaskColumns(task),
    projectId: usableProjectIds.has(task.projectId) ? task.projectId : null,
    createdAt: new Date(startedAt + index),
  }));

  return insertInBatches(rows, TASK_INSERT_BATCH_SIZE, (batch) =>
    tx
      .insert(tasks)
      .values(batch)
      .onConflictDoNothing()
      .returning({ id: tasks.id }),
  );
}

export function importData(db, userId, data) {
  return db.transaction(async (tx) => {
    const startedAt = Date.now();
    const importedProjects = await importProjects(
      tx,
      userId,
      data.projects,
      startedAt,
    );
    const importedRoutines = await importRoutines(tx, userId, data.routines);
    const importedChecks = await importRoutineChecks(
      tx,
      userId,
      data.routineChecks,
    );
    const importedTasks = await importTasks(tx, userId, data.tasks, startedAt);

    return {
      projects: summarize(data.projects.length, importedProjects),
      routines: summarize(data.routines.length, importedRoutines),
      routineChecks: summarize(data.routineChecks.length, importedChecks),
      tasks: summarize(data.tasks.length, importedTasks),
    };
  });
}
