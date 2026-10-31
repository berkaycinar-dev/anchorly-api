import { Router } from "express";
import { describeUserAgent } from "../lib/userAgent.js";
import { validate } from "../middleware/validate.js";
import { loginSchema, refreshSchema, registerSchema } from "../schemas/auth.js";
import {
  loginUser,
  refreshSession,
  registerUser,
  revokeSession,
} from "../services/authService.js";

function withDeviceName(request) {
  const body = request.validated.body;

  return {
    ...body,
    deviceName: body.deviceName ?? describeUserAgent(request.get("user-agent")),
  };
}

export function createAuthRouter({ db, auth, requireAuth }) {
  const router = Router();

  router.post(
    "/register",
    validate({ body: registerSchema }),
    async (request, response) => {
      const result = await registerUser(db, withDeviceName(request), { auth });

      response.status(201).json(result);
    },
  );

  router.post(
    "/login",
    validate({ body: loginSchema }),
    async (request, response) => {
      const result = await loginUser(db, withDeviceName(request), { auth });

      response.json(result);
    },
  );

  router.post(
    "/refresh",
    validate({ body: refreshSchema }),
    async (request, response) => {
      const result = await refreshSession(db, {
        refreshToken: request.validated.body.refreshToken,
        auth,
      });

      response.json(result);
    },
  );

  router.post("/logout", requireAuth, async (request, response) => {
    await revokeSession(db, {
      userId: request.user.id,
      sessionId: request.user.sessionId,
    });

    response.status(204).end();
  });

  return router;
}
