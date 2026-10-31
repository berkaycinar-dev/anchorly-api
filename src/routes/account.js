import { Router } from "express";
import { clearRefreshCookie } from "../lib/refreshCookie.js";
import { validate } from "../middleware/validate.js";
import {
  changePasswordSchema,
  deleteAccountSchema,
  updateMeSchema,
} from "../schemas/account.js";
import {
  changePassword,
  deleteAccount,
  getMe,
  updateMe,
} from "../services/accountService.js";

export function createAccountRouter({ db, auth }) {
  const router = Router();

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

  return router;
}
