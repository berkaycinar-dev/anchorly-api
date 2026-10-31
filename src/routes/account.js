import { Router } from "express";
import { validate } from "../middleware/validate.js";
import { changePasswordSchema, updateMeSchema } from "../schemas/account.js";
import { changePassword, getMe, updateMe } from "../services/accountService.js";

export function createAccountRouter({ db }) {
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
