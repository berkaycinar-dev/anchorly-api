import { sql } from "drizzle-orm";
import { timestamp } from "drizzle-orm/pg-core";

export function sqlList(values) {
  return sql.raw(values.map((value) => `'${value}'`).join(", "));
}

export const createdAt = () =>
  timestamp({ withTimezone: true }).notNull().defaultNow();

export const updatedAt = () =>
  timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

export const deletedAt = () => timestamp({ withTimezone: true });
