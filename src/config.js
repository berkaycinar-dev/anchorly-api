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

export function loadEnvFile(path = ".env") {
  if (existsSync(path)) {
    process.loadEnvFile(path);
  }
}
