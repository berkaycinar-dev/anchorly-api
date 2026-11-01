import { Router } from "express";
import { clearRefreshCookie } from "../lib/refreshCookie.js";
import { createRequireVerifiedEmail } from "../middleware/requireVerifiedEmail.js";
import { validate } from "../middleware/validate.js";
import {
  changePasswordSchema,
  deleteAccountSchema,
  sessionIdParams,
  updateMeSchema,
} from "../schemas/account.js";
import {
  changePassword,
  deleteAccount,
  getMe,
  updateMe,
} from "../services/accountService.js";
import { exportFileName, exportUserData } from "../services/exportService.js";
import {
  listActiveSessions,
  revokeOtherSessions,
  revokeOwnSession,
} from "../services/sessionsService.js";

export function createAccountRouter({ db, auth, limiters }) {
  const router = Router();
  const requireVerifiedEmail = createRequireVerifiedEmail({ db });

  router.get("/", async (request, response) => {
    response.json({ user: await getMe(db, request.user.id) });
  });

  router.patch(
    "/",
    validate({ body: updateMeSchema }),
    async (request, response) => {
      const user = await updateMe(db, request.user.id, request.validated.body);

      response.json({ user });
    },
  );

  router.delete(
    "/",
    limiters.passwordCheck,
    validate({ body: deleteAccountSchema }),
    async (request, response) => {
      await deleteAccount(db, {
        userId: request.user.id,
        password: request.validated.body.password,
      });

      clearRefreshCookie(response, auth);
      response.status(204).end();
    },
  );

  router.post(
    "/password",
    limiters.passwordCheck,
    validate({ body: changePasswordSchema }),
    async (request, response) => {
      await changePassword(db, {
        userId: request.user.id,
        sessionId: request.user.sessionId,
        ...request.validated.body,
      });

      response.status(204).end();
    },
  );

  router.get("/sessions", async (request, response) => {
    response.json(
      await listActiveSessions(db, {
        userId: request.user.id,
        currentSessionId: request.user.sessionId,
      }),
    );
  });

  router.delete("/sessions", async (request, response) => {
    await revokeOtherSessions(db, {
      userId: request.user.id,
      currentSessionId: request.user.sessionId,
    });

    response.status(204).end();
  });

  router.delete(
    "/sessions/:id",
    validate({ params: sessionIdParams }),
    async (request, response) => {
      const { id } = request.validated.params;

      await revokeOwnSession(db, { userId: request.user.id, sessionId: id });

      if (id === request.user.sessionId) {
        clearRefreshCookie(response, auth);
      }

      response.status(204).end();
    },
  );

  router.get("/export", requireVerifiedEmail, async (request, response) => {
    const now = new Date();
    const data = await exportUserData(db, { userId: request.user.id, now });

    response
      .set({
        "Content-Disposition": `attachment; filename="${exportFileName(now)}"`,
        "Cache-Control": "no-store",
      })
      .json(data);
  });

  return router;
}
