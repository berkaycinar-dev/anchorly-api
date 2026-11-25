import pino from "pino";

export const LOG_LEVELS = [
  "fatal",
  "error",
  "warn",
  "info",
  "debug",
  "trace",
  "silent",
];

export const REDACTED_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  'res.headers["set-cookie"]',
  "password",
  "currentPassword",
  "newPassword",
  "token",
  "accessToken",
  "refreshToken",
  "*.password",
  "*.currentPassword",
  "*.newPassword",
  "*.token",
  "*.accessToken",
  "*.refreshToken",
];

export function createLogger({ level = "info", destination } = {}) {
  return pino(
    {
      level,
      base: { service: "anchorly-api" },
      timestamp: pino.stdTimeFunctions.isoTime,
      redact: { paths: REDACTED_PATHS, censor: "[redacted]" },
    },
    destination,
  );
}
