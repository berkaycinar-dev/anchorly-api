import pg from "pg";
import { loadConfig, loadEnvFile } from "../src/config.js";

loadEnvFile(process.argv[2] ?? ".env");

const targetUrl = new URL(loadConfig().databaseUrl);
const databaseName = decodeURIComponent(targetUrl.pathname.slice(1));

if (!/^[a-z0-9_]+$/.test(databaseName)) {
  throw new Error(
    `Refusing to create "${databaseName}": use lowercase letters, digits and underscores`,
  );
}

const maintenanceUrl = new URL(targetUrl);
maintenanceUrl.pathname = "/postgres";

const client = new pg.Client({ connectionString: maintenanceUrl.toString() });
await client.connect();

try {
  const existing = await client.query(
    "select 1 from pg_database where datname = $1",
    [databaseName],
  );

  if (existing.rowCount > 0) {
    console.log(`Database ${databaseName} already exists`);
  } else {
    await client.query(
      `create database "${databaseName}" template template0 encoding 'UTF8' locale_provider builtin builtin_locale 'C.UTF-8'`,
    );
    console.log(`Database ${databaseName} created`);
  }
} finally {
  await client.end();
}
