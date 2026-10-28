import { and, asc, eq, isNull } from "drizzle-orm";
import { projects, tasks } from "../db/schema/index.js";
import { conflictError, notFoundError } from "../lib/httpError.js";

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

export async function createProject(db, userId, { id, name }) {
  const [created] = await db
    .insert(projects)
    .values({ userId, id, name })
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

export async function updateProject(db, userId, id, { name }) {
  const [updated] = await db
    .update(projects)
    .set({ name })
    .where(activeProject(userId, id))
    .returning();

  if (!updated) {
    throw notFoundError("Project not found");
  }

  return toProject(updated);
}

export async function deleteProject(db, userId, id) {
  await db.transaction(async (tx) => {
    const [deleted] = await tx
      .update(projects)
      .set({ deletedAt: new Date() })
      .where(activeProject(userId, id))
      .returning();

    if (!deleted) {
      throw notFoundError("Project not found");
    }

    await tx
      .update(tasks)
      .set({ projectId: null })
      .where(and(eq(tasks.userId, userId), eq(tasks.projectId, id)));
  });
}
