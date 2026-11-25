import { and, eq, isNull } from "drizzle-orm";
import { HOUR_IN_MS } from "../constants/time.js";
import { emailTokens } from "../db/schema/index.js";
import { generateRefreshToken, hashToken } from "../lib/tokens.js";

export async function issueEmailToken(
  db,
  { userId, purpose, email, ttlHours, now = new Date() },
) {
  await db
    .delete(emailTokens)
    .where(
      and(
        eq(emailTokens.userId, userId),
        eq(emailTokens.purpose, purpose),
        isNull(emailTokens.usedAt),
      ),
    );

  const token = generateRefreshToken();

  await db.insert(emailTokens).values({
    userId,
    purpose,
    tokenHash: hashToken(token),
    email,
    createdAt: now,
    expiresAt: new Date(now.getTime() + ttlHours * HOUR_IN_MS),
  });

  return token;
}

export async function consumeEmailToken(
  db,
  { token, purpose, now = new Date() },
) {
  const [row] = await db
    .select()
    .from(emailTokens)
    .where(
      and(
        eq(emailTokens.tokenHash, hashToken(token)),
        eq(emailTokens.purpose, purpose),
      ),
    )
    .for("update");

  if (!row || row.usedAt || row.expiresAt <= now) {
    return null;
  }

  await db
    .update(emailTokens)
    .set({ usedAt: now })
    .where(eq(emailTokens.id, row.id));

  return row;
}
