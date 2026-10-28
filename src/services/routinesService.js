import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { routineChecks, routines } from "../db/schema/index.js";
import { conflictError, notFoundError } from "../lib/httpError.js";

function toRoutine(row) {
  return { id: row.id, title: row.title };
}

function toRoutineCheck(row) {
  return { routineId: row.routineId, date: row.date, checked: row.checked };
}

function activeRoutine(userId, id) {
  return and(
    eq(routines.userId, userId),
    eq(routines.id, id),
    isNull(routines.deletedAt),
  );
}

export async function listRoutines(db, userId) {
  const rows = await db
    .select()
    .from(routines)
    .where(and(eq(routines.userId, userId), isNull(routines.deletedAt)))
    .orderBy(asc(routines.position), asc(routines.id));

  return rows.map(toRoutine);
}

export async function listRoutineChecks(db, userId) {
  const rows = await db
    .select({
      routineId: routineChecks.routineId,
      date: routineChecks.date,
      checked: routineChecks.checked,
    })
    .from(routineChecks)
    .innerJoin(
      routines,
      and(
        eq(routines.userId, routineChecks.userId),
        eq(routines.id, routineChecks.routineId),
      ),
    )
    .where(and(eq(routineChecks.userId, userId), isNull(routines.deletedAt)))
    .orderBy(asc(routineChecks.date), asc(routineChecks.routineId));

  return rows.map(toRoutineCheck);
}

export async function createRoutine(db, userId, { id, title }) {
  const nextPosition = sql`(
    select coalesce(max(${routines.position}), -1) + 1
    from ${routines}
    where ${routines.userId} = ${userId}
  )`;

  const [created] = await db
    .insert(routines)
    .values({ userId, id, title, position: nextPosition })
    .onConflictDoNothing()
    .returning();

  if (created) {
    return { routine: toRoutine(created), created: true };
  }

  const [existing] = await db
    .select()
    .from(routines)
    .where(and(eq(routines.userId, userId), eq(routines.id, id)));

  if (existing && !existing.deletedAt && existing.title === title) {
    return { routine: toRoutine(existing), created: false };
  }

  throw conflictError(`A routine with id ${id} already exists`);
}

export async function updateRoutine(db, userId, id, { title }) {
  const [updated] = await db
    .update(routines)
    .set({ title })
    .where(activeRoutine(userId, id))
    .returning();

  if (!updated) {
    throw notFoundError("Routine not found");
  }

  return toRoutine(updated);
}

export async function deleteRoutine(db, userId, id) {
  const [deleted] = await db
    .update(routines)
    .set({ deletedAt: new Date() })
    .where(activeRoutine(userId, id))
    .returning();

  if (!deleted) {
    throw notFoundError("Routine not found");
  }
}

export async function setRoutineCheck(db, userId, routineId, date, checked) {
  const [routine] = await db
    .select({ id: routines.id })
    .from(routines)
    .where(activeRoutine(userId, routineId));

  if (!routine) {
    throw notFoundError("Routine not found");
  }

  const [row] = await db
    .insert(routineChecks)
    .values({ userId, routineId, date, checked })
    .onConflictDoUpdate({
      target: [
        routineChecks.userId,
        routineChecks.routineId,
        routineChecks.date,
      ],
      set: { checked },
    })
    .returning();

  return toRoutineCheck(row);
}
