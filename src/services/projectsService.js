import { and, asc, eq, isNull } from "drizzle-orm";
import { projects, tasks } from "../db/schema/index.js";
import { conflictError, notFoundError } from "../lib/httpError.js";
import {
  deletionTime,
  latestUpdate,
  notNewerThan,
  stamp,
} from "./lastWriteWins.js";

function toProject(row) {
  return { id: row.id, name: row.name };
}

function activeProject(userId, id) {
  return and(
    eq(projects.userId, userId),
    eq(projects.id, id),
    isNull(projects.deletedAt),
  );
}

export async function listProjects(db, userId) {
  const rows = await db
    .select()
    .from(projects)
    .where(and(eq(projects.userId, userId), isNull(projects.deletedAt)))
    .orderBy(asc(projects.createdAt), asc(projects.id));

  return rows.map(toProject);
}

export async function createProject(
  db,
  userId,
  { id, name },
  clientTime = null,
) {
  const [created] = await db
    .insert(projects)
    .values({ userId, id, name, ...stamp(clientTime) })
    .onConflictDoNothing()
    .returning();

  if (created) {
    return { project: toProject(created), created: true };
  }

  const [existing] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.userId, userId), eq(projects.id, id)));

  if (existing && !existing.deletedAt && existing.name === name) {
    return { project: toProject(existing), created: false };
  }

  throw conflictError(`A project with id ${id} already exists`);
}

export async function updateProject(
  db,
  userId,
  id,
  { name },
  clientTime = null,
) {
  const [updated] = await db
    .update(projects)
    .set({ name, ...stamp(clientTime) })
    .where(and(activeProject(userId, id), notNewerThan(projects, clientTime)))
    .returning();

  if (updated) {
    return toProject(updated);
  }

  const [current] = await db
    .select()
    .from(projects)
    .where(activeProject(userId, id));

  if (!current) {
    throw notFoundError("Project not found");
  }

  return toProject(current);
}

export async function deleteProject(db, userId, id, clientTime = null) {
  await db.transaction(async (tx) => {
    const [deleted] = await tx
      .update(projects)
      .set({ deletedAt: deletionTime(clientTime), ...stamp(clientTime) })
      .where(and(activeProject(userId, id), notNewerThan(projects, clientTime)))
      .returning();

    if (!deleted) {
      const [current] = await tx
        .select({ id: projects.id })
        .from(projects)
        .where(activeProject(userId, id));

      if (!current) {
        throw notFoundError("Project not found");
      }

      return;
    }

    await tx
      .update(tasks)
      .set({ projectId: null, ...latestUpdate(tasks, clientTime) })
      .where(and(eq(tasks.userId, userId), eq(tasks.projectId, id)));
  });
}
