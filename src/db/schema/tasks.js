import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  uuid,
} from "drizzle-orm/pg-core";
import {
  DEFAULT_TASK_CATEGORY,
  REPEAT_RULES,
  TASK_CATEGORIES,
} from "../../constants/tasks.js";
import { createdAt, deletedAt, sqlList, updatedAt } from "./helpers.js";
import { projects } from "./projects.js";
import { users } from "./users.js";

export const tasks = pgTable(
  "tasks",
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    id: uuid().notNull(),
    projectId: uuid(),
    title: text().notNull(),
    category: text().notNull().default(DEFAULT_TASK_CATEGORY),
    date: date({ mode: "string" }),
    completed: boolean().notNull().default(false),
    completedAt: date({ mode: "string" }),
    description: text().notNull().default(""),
    steps: jsonb().notNull().default([]),
    position: bigint({ mode: "number" }).notNull(),
    repeat: text().notNull().default("none"),
    repeatGroupId: uuid(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.id] }),
    foreignKey({
      name: "tasks_project_fk",
      columns: [table.userId, table.projectId],
      foreignColumns: [projects.userId, projects.id],
    }),
    index("tasks_user_repeat_group_idx").on(table.userId, table.repeatGroupId),
    check(
      "tasks_category_check",
      sql`${table.category} in (${sqlList(TASK_CATEGORIES)})`,
    ),
    check(
      "tasks_repeat_check",
      sql`${table.repeat} in (${sqlList(REPEAT_RULES)})`,
    ),
    check(
      "tasks_steps_array_check",
      sql`jsonb_typeof(${table.steps}) = 'array'`,
    ),
  ],
);
