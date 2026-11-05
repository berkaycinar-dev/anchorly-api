import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";

class SmokeTestError extends Error {
  constructor(step, message) {
    super(`${step}: ${message}`);
    this.name = "SmokeTestError";
  }
}

function createClient(baseUrl) {
  return async function call(method, path, { token, body } = {}) {
    const headers = { "X-Anchorly-Client": "mobile" };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    const response = await fetch(new URL(path, baseUrl), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();

    return { status: response.status, body: text ? JSON.parse(text) : null };
  };
}

export async function runSmokeTest(baseUrl, { log = console.log } = {}) {
  const call = createClient(baseUrl);
  const email = `smoke-${randomUUID()}@example.com`;
  const password = `smoke-${randomUUID()}`;
  let session = null;
  let deleted = false;

  async function step(name, run) {
    await run();
    await log(`ok  ${name}`);
  }

  function expectStatus(name, response, status) {
    if (response.status !== status) {
      throw new SmokeTestError(
        name,
        `expected ${status}, got ${response.status} ${JSON.stringify(response.body)}`,
      );
    }
  }

  function expectThat(name, condition, message) {
    if (!condition) {
      throw new SmokeTestError(name, message);
    }
  }

  try {
    await step("health", async () => {
      const response = await call("GET", "/health");

      expectStatus("health", response, 200);
      expectThat(
        "health",
        response.body.database === "ok",
        "database not reachable",
      );
    });

    await step("register", async () => {
      const response = await call("POST", "/auth/register", {
        body: { email, password, deviceName: "Smoke test" },
      });

      expectStatus("register", response, 201);
      expectThat(
        "register",
        Boolean(response.body.refreshToken),
        "no refresh token",
      );
      session = response.body;
    });

    await step("read the account", async () => {
      const response = await call("GET", "/me", { token: session.accessToken });

      expectStatus("read the account", response, 200);
      expectThat(
        "read the account",
        response.body.user.email === email,
        "wrong email",
      );
    });

    await step("save a project and a task", async () => {
      const projectId = randomUUID();
      const taskId = randomUUID();
      const token = session.accessToken;

      expectStatus(
        "create project",
        await call("POST", "/projects", {
          token,
          body: { id: projectId, name: "Smoke test" },
        }),
        201,
      );
      expectStatus(
        "create task",
        await call("POST", "/tasks", {
          token,
          body: { id: taskId, title: "Smoke test", order: 0, projectId },
        }),
        201,
      );

      const tasks = await call("GET", "/tasks", { token });

      expectStatus("list tasks", tasks, 200);
      expectThat(
        "list tasks",
        tasks.body.some((task) => task.id === taskId),
        "task missing",
      );
    });

    await step("refresh the session", async () => {
      const response = await call("POST", "/auth/refresh", {
        body: { refreshToken: session.refreshToken },
      });

      expectStatus("refresh the session", response, 200);
      expectThat(
        "refresh the session",
        response.body.refreshToken !== session.refreshToken,
        "refresh token was not rotated",
      );
      session = response.body;
    });

    await step("sign out other devices", async () => {
      const other = await call("POST", "/auth/login", {
        body: { email, password, deviceName: "Smoke test 2" },
      });

      expectStatus("sign in on a second device", other, 200);

      const before = await call("GET", "/me/sessions", {
        token: session.accessToken,
      });

      expectThat(
        "list sessions",
        before.body.length === 2,
        `expected 2 sessions, got ${before.body.length}`,
      );
      expectStatus(
        "sign out other devices",
        await call("DELETE", "/me/sessions", { token: session.accessToken }),
        204,
      );
      expectStatus(
        "second device is signed out",
        await call("GET", "/me", { token: other.body.accessToken }),
        401,
      );
    });

    await step("export needs a verified email", async () => {
      const response = await call("GET", "/me/export", {
        token: session.accessToken,
      });

      expectStatus("export needs a verified email", response, 403);
    });

    await step("sign out", async () => {
      expectStatus(
        "sign out",
        await call("POST", "/auth/logout", {
          token: session.accessToken,
          body: { refreshToken: session.refreshToken },
        }),
        204,
      );
      expectStatus(
        "old token is rejected",
        await call("GET", "/me", { token: session.accessToken }),
        401,
      );
    });

    await step("delete the account", async () => {
      const signIn = await call("POST", "/auth/login", {
        body: { email, password },
      });

      expectStatus("sign in again", signIn, 200);
      session = signIn.body;
      expectStatus(
        "delete the account",
        await call("DELETE", "/me", {
          token: session.accessToken,
          body: { password },
        }),
        204,
      );
      deleted = true;
      expectStatus(
        "deleted account cannot sign in",
        await call("POST", "/auth/login", { body: { email, password } }),
        401,
      );
    });
  } finally {
    if (session && !deleted) {
      const signIn = await call("POST", "/auth/login", {
        body: { email, password },
      }).catch(() => null);

      if (signIn?.status === 200) {
        await call("DELETE", "/me", {
          token: signIn.body.accessToken,
          body: { password },
        }).catch(() => null);
      }
    }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const baseUrl = process.argv[2] ?? "http://localhost:3000";

  try {
    await runSmokeTest(baseUrl);
    console.log(`Smoke test passed against ${baseUrl}`);
  } catch (error) {
    console.error(`Smoke test failed against ${baseUrl}`);
    console.error(
      error.cause
        ? `${error.message} (${error.cause.code ?? error.cause.message})`
        : error.message,
    );
    process.exitCode = 1;
  }
}
