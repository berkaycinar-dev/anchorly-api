const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

export const RATE_LIMITS = Object.freeze({
  loginByIp: { windowMs: 15 * MINUTE, limit: 10 },
  loginByEmail: { windowMs: 15 * MINUTE, limit: 10 },
  register: { windowMs: HOUR, limit: 5 },
  refresh: { windowMs: 15 * MINUTE, limit: 60 },
  verifyEmail: { windowMs: 15 * MINUTE, limit: 10 },
  resendVerification: { windowMs: HOUR, limit: 5 },
  forgotPasswordByIp: { windowMs: HOUR, limit: 5 },
  forgotPasswordByEmail: { windowMs: HOUR, limit: 3 },
  resetPassword: { windowMs: 15 * MINUTE, limit: 10 },
  passwordCheck: { windowMs: 15 * MINUTE, limit: 10 },
});
