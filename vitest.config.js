import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { defineConfig } from "vitest/config";

function readEnvFile(path) {
  return existsSync(path) ? parseEnv(readFileSync(path, "utf8")) : {};
}

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.js"],
    env: readEnvFile(".env.test"),
    globalSetup: "./test/globalSetup.js",
    fileParallelism: false,
  },
});
