import { existsSync } from "node:fs";
import { z } from "zod";

const environmentSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
});

export function loadConfig(environment = process.env) {
  const result = environmentSchema.safeParse(environment);

  if (!result.success) {
    throw new Error(
      `Invalid environment variables:\n${z.prettifyError(result.error)}`,
    );
  }

  return {
    port: result.data.PORT,
    databaseUrl: result.data.DATABASE_URL,
  };
}

const authEnvironmentSchema = z.object({
  JWT_SECRET: z
    .string()
    .min(32, "JWT_SECRET must be at least 32 characters long")
    .refine((value) => !value.includes("change_me"), {
      message: "JWT_SECRET still contains the placeholder value",
    }),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce
    .number()
    .int()
    .min(60)
    .max(3600)
    .default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  AUTH_COOKIE_PATH: z
    .string()
    .regex(/^\/[A-Za-z0-9/_-]*$/, "AUTH_COOKIE_PATH must start with /")
    .default("/auth"),
  AUTH_COOKIE_SECURE: z.stringbool().default(true),
});

export function loadAuthConfig(environment = process.env) {
  const result = authEnvironmentSchema.safeParse(environment);

  if (!result.success) {
    throw new Error(
      `Invalid environment variables:\n${z.prettifyError(result.error)}`,
    );
  }

  return {
    jwtSecret: result.data.JWT_SECRET,
    accessTokenTtlSeconds: result.data.ACCESS_TOKEN_TTL_SECONDS,
    refreshTokenTtlDays: result.data.REFRESH_TOKEN_TTL_DAYS,
    cookiePath: result.data.AUTH_COOKIE_PATH,
    cookieSecure: result.data.AUTH_COOKIE_SECURE,
  };
}

const mailEnvironmentSchema = z
  .object({
    MAIL_PROVIDER: z.enum(["console", "resend"]).default("console"),
    MAIL_FROM: z.string().min(3).default("Anchorly <no-reply@anchorly.local>"),
    RESEND_API_KEY: z
      .string()
      .optional()
      .transform((value) => value?.trim() || undefined),
    APP_URL: z.url({ protocol: /^https?$/ }).default("http://localhost:5173"),
  })
  .refine(
    (environment) =>
      environment.MAIL_PROVIDER !== "resend" || environment.RESEND_API_KEY,
    {
      message: "RESEND_API_KEY is required when MAIL_PROVIDER is resend",
      path: ["RESEND_API_KEY"],
    },
  );

export function loadMailConfig(environment = process.env) {
  const result = mailEnvironmentSchema.safeParse(environment);

  if (!result.success) {
    throw new Error(
      `Invalid environment variables:\n${z.prettifyError(result.error)}`,
    );
  }

  return {
    provider: result.data.MAIL_PROVIDER,
    from: result.data.MAIL_FROM,
    resendApiKey: result.data.RESEND_API_KEY ?? null,
    appUrl: result.data.APP_URL.replace(/\/+$/, ""),
  };
}

export function loadEnvFile(path = ".env") {
  if (existsSync(path)) {
    process.loadEnvFile(path);
  }
}
