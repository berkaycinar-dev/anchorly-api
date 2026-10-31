import { Router } from "express";
import {
  emailNotSentError,
  HttpError,
  invalidRefreshTokenError,
} from "../lib/httpError.js";
import {
  clearRefreshCookie,
  isMobileClient,
  readRefreshCookie,
  setRefreshCookie,
} from "../lib/refreshCookie.js";
import { describeUserAgent } from "../lib/userAgent.js";
import { validate } from "../middleware/validate.js";
import {
  forgotPasswordSchema,
  loginSchema,
  refreshSchema,
  registerSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from "../schemas/auth.js";
import {
  loginUser,
  preparePasswordReset,
  prepareVerificationResend,
  refreshSession,
  registerUser,
  resetPassword,
  revokeSession,
  verifyEmail,
} from "../services/authService.js";
import {
  sendPasswordResetEmail,
  sendVerificationEmail,
} from "../services/accountMail.js";

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

export function createAuthRouter({
  db,
  auth,
  requireAuth,
  mailer,
  appUrl,
  logger = console,
  runInBackground,
}) {
  const router = Router();

  router.post(
    "/register",
    validate({ body: registerSchema }),
    async (request, response) => {
      const { result, verification } = await registerUser(
        db,
        withDeviceName(request),
        { auth },
      );

      try {
        await sendVerificationEmail({
          mailer,
          appUrl,
          user: result.user,
          language: verification.language,
          token: verification.token,
        });
      } catch (error) {
        logger.error(error);
      }

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

  router.post(
    "/verify-email",
    validate({ body: verifyEmailSchema }),
    async (request, response) => {
      const user = await verifyEmail(db, {
        token: request.validated.body.token,
      });

      response.json({ user });
    },
  );

  router.post(
    "/resend-verification",
    requireAuth,
    async (request, response) => {
      const { user, language, token } = await prepareVerificationResend(db, {
        userId: request.user.id,
      });

      try {
        await sendVerificationEmail({ mailer, appUrl, user, language, token });
      } catch (error) {
        logger.error(error);
        throw emailNotSentError();
      }

      response.status(204).end();
    },
  );

  router.post(
    "/forgot-password",
    validate({ body: forgotPasswordSchema }),
    async (request, response) => {
      const { email } = request.validated.body;

      response.status(202).end();

      runInBackground(async () => {
        const reset = await preparePasswordReset(db, { email });

        if (reset) {
          await sendPasswordResetEmail({ mailer, appUrl, ...reset });
        }
      });
    },
  );

  router.post(
    "/reset-password",
    validate({ body: resetPasswordSchema }),
    async (request, response) => {
      await resetPassword(db, request.validated.body);

      clearRefreshCookie(response, auth);
      response.status(204).end();
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
