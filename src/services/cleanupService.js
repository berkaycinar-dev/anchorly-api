import { and, isNotNull, lt, notExists, or, sql } from "drizzle-orm";
import {
  CLOSED_SESSION_RETENTION_DAYS,
  DELETED_ROW_RETENTION_DAYS,
} from "../constants/cleanup.js";
import {
  emailTokens,
  projects,
  rateLimits,
  routines,
  sessions,
  tasks,
} from "../db/schema/index.js";

const DAY_IN_MS = 24 * 60 * 60 * 1000;

function daysBefore(now, days) {
  return new Date(now.getTime() - days * DAY_IN_MS);
}

async function countDeleted(query) {
  return (await query.returning({ one: sql`1` })).length;
}

export async function runCleanup(db, { now = new Date() } = {}) {
  const deletedBefore = daysBefore(now, DELETED_ROW_RETENTION_DAYS);
  const closedBefore = daysBefore(now, CLOSED_SESSION_RETENTION_DAYS);

  return db.transaction(async (tx) => {
    const removedTasks = await countDeleted(
      tx.delete(tasks).where(lt(tasks.deletedAt, deletedBefore)),
    );

    const removedProjects = await countDeleted(
      tx.delete(projects).where(
        and(
          lt(projects.deletedAt, deletedBefore),
          notExists(
            tx
              .select({ one: sql`1` })
              .from(tasks)
              .where(
                sql`${tasks.userId} = ${projects.userId} and ${tasks.projectId} = ${projects.id}`,
              ),
          ),
        ),
      ),
    );

    const removedRoutines = await countDeleted(
      tx.delete(routines).where(lt(routines.deletedAt, deletedBefore)),
    );

    const removedSessions = await countDeleted(
      tx
        .delete(sessions)
        .where(
          or(
            lt(sessions.expiresAt, now),
            and(
              isNotNull(sessions.revokedAt),
              lt(sessions.revokedAt, closedBefore),
            ),
          ),
        ),
    );

    const removedEmailTokens = await countDeleted(
      tx.delete(emailTokens).where(lt(emailTokens.expiresAt, now)),
    );

    const removedRateLimits = await countDeleted(
      tx.delete(rateLimits).where(lt(rateLimits.resetAt, now)),
    );

    return {
      tasks: removedTasks,
      projects: removedProjects,
      routines: removedRoutines,
      sessions: removedSessions,
      emailTokens: removedEmailTokens,
      rateLimits: removedRateLimits,
    };
  });
}
