import { pgTable, primaryKey, text, uuid } from "drizzle-orm/pg-core";
import { createdAt, deletedAt, updatedAt } from "./helpers.js";
import { users } from "./users.js";

export const projects = pgTable(
  "projects",
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    id: uuid().notNull(),
    name: text().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.id] })],
);
