import { Router } from "express";
import { HttpError, invalidRefreshTokenError } from "../lib/httpError.js";
import {
  clearRefreshCookie,
  isMobileClient,
  readRefreshCookie,
  setRefreshCookie,
} from "../lib/refreshCookie.js";
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

function sendSession(response, auth, result, { useCookie, status = 200 }) {
  if (!useCookie) {
    response.status(status).json(result);
    return;
  }

  const { refreshToken, ...body } = result;

  setRefreshCookie(response, auth, {
    refreshToken,
    expiresAt: result.refreshTokenExpiresAt,
  });
  response.status(status).json(body);
}

export function createAuthRouter({ db, auth, requireAuth }) {
  const router = Router();

  router.post(
    "/register",
    validate({ body: registerSchema }),
    async (request, response) => {
      const result = await registerUser(db, withDeviceName(request), { auth });

      sendSession(response, auth, result, {
        useCookie: !isMobileClient(request),
        status: 201,
      });
    },
  );

  router.post(
    "/login",
    validate({ body: loginSchema }),
    async (request, response) => {
      const result = await loginUser(db, withDeviceName(request), { auth });

      sendSession(response, auth, result, {
        useCookie: !isMobileClient(request),
      });
    },
  );

  router.post(
    "/refresh",
    validate({ body: refreshSchema }),
    async (request, response) => {
      const bodyToken = request.validated.body.refreshToken;
      const useCookie = !bodyToken;
      const refreshToken = bodyToken ?? readRefreshCookie(request);

      try {
        if (!refreshToken) {
          throw invalidRefreshTokenError();
        }

        const result = await refreshSession(db, { refreshToken, auth });

        sendSession(response, auth, result, { useCookie });
      } catch (error) {
        if (useCookie && error instanceof HttpError && error.status === 401) {
          clearRefreshCookie(response, auth);
        }

        throw error;
      }
    },
  );

  router.post("/logout", requireAuth, async (request, response) => {
    await revokeSession(db, {
      userId: request.user.id,
      sessionId: request.user.sessionId,
    });

    clearRefreshCookie(response, auth);
    response.status(204).end();
  });

  return router;
}
