import {
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt } from "./helpers.js";
import { users } from "./users.js";

export const sessions = pgTable(
  "sessions",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text().notNull(),
    previousTokenHash: text(),
    rotatedAt: timestamp({ withTimezone: true }),
    deviceName: text(),
    createdAt: createdAt(),
    lastUsedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    revokedAt: timestamp({ withTimezone: true }),
  },
  (table) => [
    unique("sessions_token_hash_unique").on(table.tokenHash),
    unique("sessions_previous_token_hash_unique").on(table.previousTokenHash),
    index("sessions_user_id_idx").on(table.userId),
  ],
);
