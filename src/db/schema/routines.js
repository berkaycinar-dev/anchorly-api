import {
  boolean,
  date,
  foreignKey,
  integer,
  pgTable,
  primaryKey,
  text,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, deletedAt, updatedAt } from "./helpers.js";
import { users } from "./users.js";

export const routines = pgTable(
  "routines",
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    id: uuid().notNull(),
    title: text().notNull(),
    position: integer().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.id] })],
);

export const routineChecks = pgTable(
  "routine_checks",
  {
    userId: uuid().notNull(),
    routineId: uuid().notNull(),
    date: date({ mode: "string" }).notNull(),
    checked: boolean().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.routineId, table.date] }),
    foreignKey({
      name: "routine_checks_routine_fk",
      columns: [table.userId, table.routineId],
      foreignColumns: [routines.userId, routines.id],
    }).onDelete("cascade"),
  ],
);
