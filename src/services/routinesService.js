import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { routineChecks, routines } from "../db/schema/index.js";
import { conflictError, notFoundError } from "../lib/httpError.js";
import { deletionTime, notNewerThan, stamp } from "./lastWriteWins.js";

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

export async function createRoutine(
  db,
  userId,
  { id, title },
  clientTime = null,
) {
  const nextPosition = sql`(
    select coalesce(max(${routines.position}), -1) + 1
    from ${routines}
    where ${routines.userId} = ${userId}
  )`;

  const [created] = await db
    .insert(routines)
    .values({
      userId,
      id,
      title,
      position: nextPosition,
      ...stamp(clientTime),
    })
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

export async function updateRoutine(
  db,
  userId,
  id,
  { title },
  clientTime = null,
) {
  const [updated] = await db
    .update(routines)
    .set({ title, ...stamp(clientTime) })
    .where(and(activeRoutine(userId, id), notNewerThan(routines, clientTime)))
    .returning();

  if (updated) {
    return toRoutine(updated);
  }

  const [current] = await db
    .select()
    .from(routines)
    .where(activeRoutine(userId, id));

  if (!current) {
    throw notFoundError("Routine not found");
  }

  return toRoutine(current);
}

export async function deleteRoutine(db, userId, id, clientTime = null) {
  const [deleted] = await db
    .update(routines)
    .set({ deletedAt: deletionTime(clientTime), ...stamp(clientTime) })
    .where(and(activeRoutine(userId, id), notNewerThan(routines, clientTime)))
    .returning();

  if (deleted) {
    return;
  }

  const [current] = await db
    .select({ id: routines.id })
    .from(routines)
    .where(activeRoutine(userId, id));

  if (!current) {
    throw notFoundError("Routine not found");
  }
}

export async function setRoutineCheck(
  db,
  userId,
  routineId,
  date,
  checked,
  clientTime = null,
) {
  const [routine] = await db
    .select({ id: routines.id })
    .from(routines)
    .where(activeRoutine(userId, routineId));

  if (!routine) {
    throw notFoundError("Routine not found");
  }

  const [row] = await db
    .insert(routineChecks)
    .values({ userId, routineId, date, checked, ...stamp(clientTime) })
    .onConflictDoUpdate({
      target: [
        routineChecks.userId,
        routineChecks.routineId,
        routineChecks.date,
      ],
      set: { checked, ...stamp(clientTime) },
      setWhere: notNewerThan(routineChecks, clientTime),
    })
    .returning();

  if (row) {
    return toRoutineCheck(row);
  }

  const [current] = await db
    .select()
    .from(routineChecks)
    .where(
      and(
        eq(routineChecks.userId, userId),
        eq(routineChecks.routineId, routineId),
        eq(routineChecks.date, date),
      ),
    );

  return toRoutineCheck(current);
}
