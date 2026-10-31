import { Router } from "express";
import { validate } from "../middleware/validate.js";
import { registerSchema } from "../schemas/auth.js";
import { registerUser } from "../services/authService.js";

export function createAuthRouter({ db }) {
  const router = Router();

  router.post(
    "/register",
    validate({ body: registerSchema }),
    async (request, response) => {
      const user = await registerUser(db, request.validated.body);

      response.status(201).json({ user });
    },
  );

  return router;
}
