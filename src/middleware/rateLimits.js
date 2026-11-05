import { rateLimit } from "express-rate-limit";
import { tooManyRequestsError } from "../lib/httpError.js";

function byUser(request) {
  return request.user.id;
}

function byValidatedEmail(request) {
  return request.validated.body.email;
}

function rejectWithError(request, response, next) {
  next(tooManyRequestsError());
}

function markEmailLimitReached(request, response, next) {
  request.emailLimitReached = true;
  next();
}

const LIMITER_OPTIONS = {
  loginByIp: {},
  loginByEmail: { keyGenerator: byValidatedEmail },
  register: {},
  refresh: {},
  verifyEmail: {},
  resendVerification: { keyGenerator: byUser },
  forgotPasswordByIp: {},
  forgotPasswordByEmail: {
    keyGenerator: byValidatedEmail,
    handler: markEmailLimitReached,
    standardHeaders: false,
  },
  resetPassword: {},
  passwordCheck: { keyGenerator: byUser, skipSuccessfulRequests: true },
};

function passThrough() {
  const middleware = (request, response, next) => next();

  middleware.resetKey = () => {};
  return middleware;
}

export function createRateLimiters(rules = {}) {
  return Object.fromEntries(
    Object.entries(LIMITER_OPTIONS).map(([name, options]) => {
      const rule = rules[name];

      if (!rule) {
        return [name, passThrough()];
      }

      return [
        name,
        rateLimit({
          windowMs: rule.windowMs,
          limit: rule.limit,
          identifier: name,
          standardHeaders: "draft-8",
          legacyHeaders: false,
          handler: rejectWithError,
          ...options,
        }),
      ];
    }),
  );
}
