import { eq } from "drizzle-orm";
import { users } from "../db/schema/index.js";
import { emailNotVerifiedError } from "../lib/httpError.js";

export function createRequireVerifiedEmail({ db }) {
  return async function requireVerifiedEmail(request, response, next) {
    const [user] = await db
      .select({ emailVerifiedAt: users.emailVerifiedAt })
      .from(users)
      .where(eq(users.id, request.user.id));

    if (!user?.emailVerifiedAt) {
      throw emailNotVerifiedError();
    }

    next();
  };
}
