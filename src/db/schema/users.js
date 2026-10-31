import { sql } from "drizzle-orm";
import { check, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createdAt, deletedAt, updatedAt } from "./helpers.js";

export const users = pgTable(
  "users",
  {
    id: uuid().primaryKey().defaultRandom(),
    email: text().notNull().unique(),
    passwordHash: text(),
    emailVerifiedAt: timestamp({ withTimezone: true }),
    displayName: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (table) => [
    check(
      "users_email_lowercase_check",
      sql`${table.email} = lower(${table.email})`,
    ),
  ],
);
