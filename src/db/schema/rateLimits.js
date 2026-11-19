import { index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const rateLimits = pgTable(
  "rate_limits",
  {
    key: text().primaryKey(),
    hits: integer().notNull(),
    resetAt: timestamp({ withTimezone: true }).notNull(),
  },
  (table) => [index("rate_limits_reset_at_idx").on(table.resetAt)],
);
