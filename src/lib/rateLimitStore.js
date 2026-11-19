import { and, eq, gt, sql } from "drizzle-orm";
import { rateLimits } from "../db/schema/index.js";

export function createPostgresRateLimitStore({ db, prefix }) {
  let windowSeconds = 60;

  function fullKey(key) {
    return `${prefix}:${key}`;
  }

  function isActive(key) {
    return and(
      eq(rateLimits.key, fullKey(key)),
      gt(rateLimits.resetAt, sql`now()`),
    );
  }

  return {
    prefix,
    localKeys: false,

    init(options) {
      windowSeconds = options.windowMs / 1000;
    },

    async get(key) {
      const [row] = await db
        .select({ hits: rateLimits.hits, resetAt: rateLimits.resetAt })
        .from(rateLimits)
        .where(isActive(key));

      return row ? { totalHits: row.hits, resetTime: row.resetAt } : undefined;
    },

    async increment(key) {
      const expired = sql`${rateLimits.resetAt} <= now()`;
      const [row] = await db
        .insert(rateLimits)
        .values({
          key: fullKey(key),
          hits: 1,
          resetAt: sql`now() + make_interval(secs => ${windowSeconds}::double precision)`,
        })
        .onConflictDoUpdate({
          target: rateLimits.key,
          set: {
            hits: sql`case when ${expired} then 1 else ${rateLimits.hits} + 1 end`,
            resetAt: sql`case when ${expired} then excluded.reset_at else ${rateLimits.resetAt} end`,
          },
        })
        .returning({ hits: rateLimits.hits, resetAt: rateLimits.resetAt });

      return { totalHits: row.hits, resetTime: row.resetAt };
    },

    async decrement(key) {
      await db
        .update(rateLimits)
        .set({ hits: sql`greatest(${rateLimits.hits} - 1, 0)` })
        .where(isActive(key));
    },

    async resetKey(key) {
      await db.delete(rateLimits).where(eq(rateLimits.key, fullKey(key)));
    },
  };
}
