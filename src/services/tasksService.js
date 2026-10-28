import { isDeepStrictEqual } from "node:util";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { projects, tasks } from "../db/schema/index.js";
import {
  conflictError,
  HttpError,
  notFoundError,
  validationError,
} from "../lib/httpError.js";
import { toTask, toTaskColumns } from "../mappers/tasks.js";
import { COMPLETED_AT_MESSAGE } from "../schemas/tasks.js";

function activeTask(userId, id) {
  return and(
    eq(tasks.userId, userId),
    eq(tasks.id, id),
    isNull(tasks.deletedAt),
  );
}

async function assertProjectIsUsable(db, userId, projectId) {
  if (!projectId) {
    return;
  }

  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(
      and(
        eq(projects.userId, userId),
        eq(projects.id, projectId),
        isNull(projects.deletedAt),
      ),
    );

  if (!project) {
    throw validationError([
      { path: "body.projectId", message: "Project not found" },
    ]);
  }
}

function hasSameValues(row, columns) {
  return Object.entries(columns).every(([column, value]) =>
    isDeepStrictEqual(row[column], value),
  );
}

export async function listTasks(db, userId) {
  const rows = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.userId, userId), isNull(tasks.deletedAt)))
    .orderBy(asc(tasks.createdAt), asc(tasks.id));

  return rows.map(toTask);
}

export async function createTask(db, userId, input) {
  const columns = toTaskColumns(input);

  await assertProjectIsUsable(db, userId, columns.projectId);

  const [created] = await db
    .insert(tasks)
    .values({ userId, id: input.id, ...columns })
    .onConflictDoNothing()
    .returning();

  if (created) {
    return { task: toTask(created), created: true };
  }

  const [existing] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.userId, userId), eq(tasks.id, input.id)));

  if (existing && !existing.deletedAt && hasSameValues(existing, columns)) {
    return { task: toTask(existing), created: false };
  }

  throw conflictError(`A task with id ${input.id} already exists`);
}

export async function updateTask(db, userId, id, input) {
  if (input.id !== undefined && input.id !== id) {
    throw validationError([
      { path: "body.id", message: "The task id cannot be changed" },
    ]);
  }

  const [existing] = await db
    .select()
    .from(tasks)
    .where(activeTask(userId, id));

  if (!existing) {
    throw notFoundError("Task not found");
  }

  const columns = toTaskColumns(input);
  const completed = columns.completed ?? existing.completed;
  const completedAt =
    columns.completedAt === undefined
      ? existing.completedAt
      : columns.completedAt;

  if (!completed && completedAt !== null) {
    throw validationError([
      { path: "body.completedAt", message: COMPLETED_AT_MESSAGE },
    ]);
  }

  if (columns.projectId !== undefined) {
    await assertProjectIsUsable(db, userId, columns.projectId);
  }

  if (Object.keys(columns).length === 0) {
    return toTask(existing);
  }

  const [updated] = await db
    .update(tasks)
    .set(columns)
    .where(activeTask(userId, id))
    .returning();

  if (!updated) {
    throw notFoundError("Task not found");
  }

  return toTask(updated);
}

export async function deleteTask(db, userId, id) {
  const [deleted] = await db
    .update(tasks)
    .set({ deletedAt: new Date() })
    .where(activeTask(userId, id))
    .returning();

  if (!deleted) {
    throw notFoundError("Task not found");
  }
}

export async function reorderTasks(db, userId, orderedIds) {
  const idArray = sql`array[${sql.join(
    orderedIds.map((id) => sql`${id}`),
    sql`, `,
  )}]::uuid[]`;

  await db.transaction(async (tx) => {
    const result = await tx.execute(sql`
      update ${tasks}
      set position = ordered.position - 1, updated_at = now()
      from unnest(${idArray}) with ordinality as ordered(id, position)
      where ${tasks.userId} = ${userId}
        and ${tasks.id} = ordered.id
        and ${tasks.deletedAt} is null
    `);

    if (result.rowCount !== orderedIds.length) {
      throw notFoundError("One or more tasks were not found");
    }
  });
}

const OPERATION_BODY_PATH = { create: "task", update: "patch" };

function toOperationError(error, index, type) {
  if (!(error instanceof HttpError)) {
    return error;
  }

  const prefix = `body.operations.${index}`;
  const details = error.details?.map((detail) => ({
    ...detail,
    path: detail.path.replace(
      /^body/,
      `${prefix}.${OPERATION_BODY_PATH[type]}`,
    ),
  })) ?? [{ path: prefix, message: error.message }];

  return new HttpError(
    error.status,
    error.code,
    `Operation ${index} (${type}) failed: ${error.message}`,
    details,
  );
}

async function runOperation(tx, userId, operation) {
  if (operation.type === "create") {
    const { task, created } = await createTask(tx, userId, operation.task);

    return { type: "create", status: created ? 201 : 200, task };
  }

  if (operation.type === "update") {
    const task = await updateTask(tx, userId, operation.id, operation.patch);

    return { type: "update", status: 200, task };
  }

  await deleteTask(tx, userId, operation.id);

  return { type: "delete", status: 204, id: operation.id };
}

export function bulkTasks(db, userId, operations) {
  return db.transaction(async (tx) => {
    const results = [];

    for (const [index, operation] of operations.entries()) {
      try {
        results.push(await runOperation(tx, userId, operation));
      } catch (error) {
        throw toOperationError(error, index, operation.type);
      }
    }

    return results;
  });
}
