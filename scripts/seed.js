import { DEV_USER, DEV_USER_PASSWORD } from "../src/constants/devUser.js";
import { loadConfig, loadEnvFile } from "../src/config.js";
import { createDatabase } from "../src/db/client.js";
import { seedDevUser } from "../src/db/seedDevUser.js";
import { hashPassword } from "../src/lib/password.js";

loadEnvFile();

if (process.env.NODE_ENV === "production") {
  throw new Error("Refusing to seed the development user in production");
}

const database = createDatabase(loadConfig().databaseUrl);

try {
  await seedDevUser(database.db, {
    passwordHash: await hashPassword(DEV_USER_PASSWORD),
  });
  console.log(
    `Development user ready: ${DEV_USER.email} / ${DEV_USER_PASSWORD}`,
  );
} finally {
  await database.close();
}
