import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { EMAIL_TOKEN_PURPOSES } from "../../constants/emailTokens.js";
import { createdAt, sqlList } from "./helpers.js";
import { users } from "./users.js";

export const emailTokens = pgTable(
  "email_tokens",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    purpose: text().notNull(),
    tokenHash: text().notNull(),
    email: text().notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    usedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    unique("email_tokens_token_hash_unique").on(table.tokenHash),
    index("email_tokens_user_purpose_idx").on(table.userId, table.purpose),
    check(
      "email_tokens_purpose_check",
      sql`${table.purpose} in (${sqlList(EMAIL_TOKEN_PURPOSES)})`,
    ),
  ],
);
