import { pgTable, text, uuid } from "drizzle-orm/pg-core";
import { createdAt, deletedAt, updatedAt } from "./helpers.js";

export const users = pgTable("users", {
  id: uuid().primaryKey().defaultRandom(),
  email: text().notNull().unique(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  deletedAt: deletedAt(),
});
