import { z } from "zod";
import {
  loginSchema,
  refreshSchema,
  registerSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from "../schemas/auth.js";
import {
  createProjectSchema,
  updateProjectSchema,
} from "../schemas/projects.js";
import {
  createRoutineSchema,
  setRoutineCheckSchema,
  updateRoutineSchema,
} from "../schemas/routines.js";
import {
  changePasswordSchema,
  deleteAccountSchema,
  updateMeSchema,
} from "../schemas/account.js";
import { importSchema } from "../schemas/import.js";
import { settingsPatchSchema } from "../schemas/settings.js";
import {
  bulkTasksSchema,
  createTaskSchema,
  reorderTasksSchema,
  updateTaskSchema,
} from "../schemas/tasks.js";
import { RESPONSE_SCHEMAS } from "./responseSchemas.js";

function toOpenApiSchema(schema, io) {
  return z.toJSONSchema(schema, { io, target: "openapi-3.0" });
}

function body(schema) {
  return {
    required: true,
    content: {
      "application/json": { schema: toOpenApiSchema(schema, "input") },
    },
  };
}

function ref(name) {
  return { $ref: `#/components/schemas/${name}` };
}

function json(description, schema) {
  return { description, content: { "application/json": { schema } } };
}

const noContent = { description: "Done, no content" };
const errors = {
  400: json("The request contains invalid data", ref("Error")),
  404: json("Not found for the current user", ref("Error")),
  409: json("Conflicts with an existing record", ref("Error")),
};

function pathParameter(name, format) {
  return {
    name,
    in: "path",
    required: true,
    schema: { type: "string", format },
  };
}

const idParameter = pathParameter("id", "uuid");

const mobileClientHeader = {
  name: "X-Anchorly-Client",
  in: "header",
  required: false,
  description:
    "Send `mobile` to receive the refresh token in the body instead of the HttpOnly cookie",
  schema: { type: "string", enum: ["mobile"] },
};

const refreshCookieParameter = {
  name: "anchorly_refresh",
  in: "cookie",
  required: false,
  description:
    "Web clients: the refresh token set by register, login or refresh",
  schema: { type: "string" },
};

const setRefreshCookieHeader = {
  "Set-Cookie": {
    description:
      "Web clients only: anchorly_refresh=<token>; HttpOnly; Secure; SameSite=Strict",
    schema: { type: "string" },
  },
};

function withSetCookie(response) {
  return { ...response, headers: setRefreshCookieHeader };
}
const dateParameter = pathParameter("date", "date");

function operation(tag, summary, details) {
  return { tags: [tag], summary, ...details };
}

const HTTP_METHODS = ["get", "post", "put", "patch", "delete"];

export const RATE_LIMITED_OPERATIONS = [
  "POST /auth/register",
  "POST /auth/login",
  "POST /auth/refresh",
  "POST /auth/verify-email",
  "POST /auth/resend-verification",
  "POST /auth/forgot-password",
  "POST /auth/reset-password",
  "POST /me/password",
  "DELETE /me",
];

const tooManyRequests = {
  description:
    "Too many attempts (TOO_MANY_REQUESTS). Retry-After says how many seconds to wait",
  headers: {
    "Retry-After": { schema: { type: "integer" } },
    RateLimit: { schema: { type: "string" } },
    "RateLimit-Policy": { schema: { type: "string" } },
  },
  content: { "application/json": { schema: ref("Error") } },
};

function addRateLimitResponses(paths) {
  const result = structuredClone(paths);

  for (const operationName of RATE_LIMITED_OPERATIONS) {
    const [method, path] = operationName.split(" ");

    result[path][method.toLowerCase()].responses[429] = tooManyRequests;
  }

  return result;
}
const PUBLIC_PATH_PATTERN = /^\/(health|auth\/)/;

function requireBearerToken(paths) {
  return Object.fromEntries(
    Object.entries(paths).map(([path, item]) => {
      if (PUBLIC_PATH_PATTERN.test(path)) {
        return [path, item];
      }

      const protectedItem = { ...item };

      for (const method of HTTP_METHODS.filter((name) => item[name])) {
        protectedItem[method] = {
          ...item[method],
          security: [{ bearerAuth: [] }],
          responses: {
            ...item[method].responses,
            401: json(
              "The access token is missing, invalid, expired or revoked (UNAUTHORIZED)",
              ref("Error"),
            ),
          },
        };
      }

      return [path, protectedItem];
    }),
  );
}

export function buildOpenApiDocument() {
  return {
    openapi: "3.0.3",
    info: {
      title: "Anchorly API",
      version: "0.1.0",
      description:
        "Tasks, routines, projects and settings for Anchorly. Create an account or sign in under /auth, then send the access token as `Authorization: Bearer <token>` to every other endpoint except /health.",
    },
    tags: [
      { name: "Health" },
      { name: "Auth" },
      { name: "Account" },
      { name: "Settings" },
      { name: "Projects" },
      { name: "Routines" },
      { name: "Tasks" },
      { name: "Import" },
    ],
    paths: addRateLimitResponses(
      requireBearerToken({
        "/health": {
          get: operation("Health", "Check the API and the database", {
            responses: {
              200: json("Everything is reachable", ref("Health")),
              503: json("The database is unreachable", ref("Health")),
            },
          }),
        },
        "/auth/register": {
          post: operation("Auth", "Create an account and sign in", {
            parameters: [mobileClientHeader],
            requestBody: body(registerSchema),
            responses: {
              201: withSetCookie(
                json("Account created and signed in", ref("AuthSession")),
              ),
              400: errors[400],
              409: json(
                "An account with this email already exists (EMAIL_TAKEN)",
                ref("Error"),
              ),
            },
          }),
        },
        "/auth/login": {
          post: operation("Auth", "Sign in with email and password", {
            parameters: [mobileClientHeader],
            requestBody: body(loginSchema),
            responses: {
              200: withSetCookie(json("Signed in", ref("AuthSession"))),
              400: errors[400],
              401: json(
                "The email or password is incorrect (INVALID_CREDENTIALS)",
                ref("Error"),
              ),
            },
          }),
        },
        "/auth/refresh": {
          post: operation(
            "Auth",
            "Exchange a refresh token for a new pair of tokens",
            {
              parameters: [refreshCookieParameter],
              requestBody: body(refreshSchema),
              responses: {
                200: withSetCookie(
                  json(
                    "New tokens, delivered the same way the refresh token came in; the sent token stops working",
                    ref("AuthSession"),
                  ),
                ),
                400: errors[400],
                401: json(
                  "The refresh token is invalid, expired or revoked (INVALID_REFRESH_TOKEN)",
                  ref("Error"),
                ),
              },
            },
          ),
        },
        "/auth/verify-email": {
          post: operation(
            "Auth",
            "Verify the email address with the token from the email link",
            {
              requestBody: body(verifyEmailSchema),
              responses: {
                200: json("The email address is verified", ref("UserResult")),
                400: json(
                  "The link is invalid, expired or already used (INVALID_EMAIL_TOKEN), or the body is invalid",
                  ref("Error"),
                ),
              },
            },
          ),
        },
        "/auth/resend-verification": {
          post: operation("Auth", "Send a new verification email", {
            security: [{ bearerAuth: [] }],
            responses: {
              204: noContent,
              401: json(
                "The access token is missing, invalid, expired or revoked (UNAUTHORIZED)",
                ref("Error"),
              ),
              409: json(
                "The email address is already verified (EMAIL_ALREADY_VERIFIED)",
                ref("Error"),
              ),
              503: json(
                "The email could not be sent (EMAIL_NOT_SENT)",
                ref("Error"),
              ),
            },
          }),
        },
        "/auth/forgot-password": {
          post: operation("Auth", "Send a password reset link", {
            description:
              "Always answers 202, whether or not an account uses this email, so the answer reveals nothing about registered addresses.",
            requestBody: body(forgotPasswordSchema),
            responses: {
              202: {
                description:
                  "If an account uses this email, a link is on its way",
              },
              400: errors[400],
            },
          }),
        },
        "/auth/reset-password": {
          post: operation(
            "Auth",
            "Choose a new password with the token from the email link",
            {
              description:
                "Signs the user out on every device and marks the email address as verified.",
              requestBody: body(resetPasswordSchema),
              responses: {
                204: noContent,
                400: json(
                  "The link is invalid, expired or already used (INVALID_EMAIL_TOKEN), or the body is invalid",
                  ref("Error"),
                ),
              },
            },
          ),
        },
        "/auth/logout": {
          post: operation("Auth", "Sign out of the current session", {
            security: [{ bearerAuth: [] }],
            responses: {
              204: noContent,
              401: json(
                "The access token is missing, invalid, expired or revoked (UNAUTHORIZED)",
                ref("Error"),
              ),
            },
          }),
        },
        "/me": {
          get: operation("Account", "Read the signed-in user", {
            responses: { 200: json("The current user", ref("UserResult")) },
          }),
          patch: operation("Account", "Change the display name", {
            requestBody: body(updateMeSchema),
            responses: {
              200: json("The user after the change", ref("UserResult")),
              400: errors[400],
            },
          }),
          delete: operation("Account", "Delete the account and all its data", {
            description:
              "Needs the password. Deletes the user with every task, routine, project, setting, session and email link at once; this cannot be undone.",
            requestBody: body(deleteAccountSchema),
            responses: {
              204: noContent,
              400: json(
                "The password is incorrect (INVALID_CURRENT_PASSWORD), the account has no password yet (PASSWORD_NOT_SET), or the body is invalid",
                ref("Error"),
              ),
            },
          }),
        },
        "/me/password": {
          post: operation("Account", "Change the password", {
            description:
              "Needs the current password. Signs the user out on every other device; this session stays signed in.",
            requestBody: body(changePasswordSchema),
            responses: {
              204: noContent,
              400: json(
                "The current password is incorrect (INVALID_CURRENT_PASSWORD), the account has no password yet (PASSWORD_NOT_SET), or the body is invalid",
                ref("Error"),
              ),
            },
          }),
        },
        "/me/sessions": {
          get: operation("Account", "List the active sessions", {
            description:
              "Only sessions that are neither signed out nor expired. The session that sent the request comes first and has current: true.",
            responses: {
              200: json("Active sessions", {
                type: "array",
                items: ref("Session"),
              }),
            },
          }),
          delete: operation("Account", "Sign out every other device", {
            responses: { 204: noContent },
          }),
        },
        "/me/sessions/{id}": {
          parameters: [idParameter],
          delete: operation("Account", "Sign out one session", {
            description:
              "Signing out the current session works like logout and clears the refresh cookie.",
            responses: {
              204: noContent,
              400: errors[400],
              404: json(
                "No active session with this id for the current user",
                ref("Error"),
              ),
            },
          }),
        },
        "/me/export": {
          get: operation("Account", "Download all of the user's data as JSON", {
            description:
              "Needs a verified email address. Sent as a file download (Content-Disposition: attachment). Never contains password or token hashes.",
            responses: {
              200: json("The export file", ref("Export")),
              403: json(
                "The email address is not verified yet (EMAIL_NOT_VERIFIED)",
                ref("Error"),
              ),
            },
          }),
        },
        "/me/settings": {
          get: operation("Settings", "Read the current user's settings", {
            responses: { 200: json("Settings", ref("Settings")) },
          }),
          patch: operation("Settings", "Change some settings", {
            requestBody: body(settingsPatchSchema),
            responses: {
              200: json("Settings after the change", ref("Settings")),
              400: errors[400],
            },
          }),
        },
        "/projects": {
          get: operation("Projects", "List projects in creation order", {
            responses: {
              200: json("Projects", { type: "array", items: ref("Project") }),
            },
          }),
          post: operation("Projects", "Create a project with a client id", {
            requestBody: body(createProjectSchema),
            responses: {
              200: json("The same project already existed", ref("Project")),
              201: json("Created", ref("Project")),
              400: errors[400],
              409: errors[409],
            },
          }),
        },
        "/projects/{id}": {
          parameters: [idParameter],
          patch: operation("Projects", "Rename a project", {
            requestBody: body(updateProjectSchema),
            responses: {
              200: json("Renamed", ref("Project")),
              400: errors[400],
              404: errors[404],
            },
          }),
          delete: operation(
            "Projects",
            "Delete a project and detach its tasks",
            {
              responses: { 204: noContent, 404: errors[404] },
            },
          ),
        },
        "/routines": {
          get: operation("Routines", "List routines in display order", {
            responses: {
              200: json("Routines", { type: "array", items: ref("Routine") }),
            },
          }),
          post: operation("Routines", "Add a routine at the end of the list", {
            requestBody: body(createRoutineSchema),
            responses: {
              200: json("The same routine already existed", ref("Routine")),
              201: json("Created", ref("Routine")),
              400: errors[400],
              409: errors[409],
            },
          }),
        },
        "/routines/checks": {
          get: operation("Routines", "List the checks of active routines", {
            responses: {
              200: json("Checks ordered by date", {
                type: "array",
                items: ref("RoutineCheck"),
              }),
            },
          }),
        },
        "/routines/{id}": {
          parameters: [idParameter],
          patch: operation("Routines", "Rename a routine", {
            requestBody: body(updateRoutineSchema),
            responses: {
              200: json("Renamed", ref("Routine")),
              400: errors[400],
              404: errors[404],
            },
          }),
          delete: operation("Routines", "Delete a routine", {
            responses: { 204: noContent, 404: errors[404] },
          }),
        },
        "/routines/{id}/checks/{date}": {
          parameters: [idParameter, dateParameter],
          put: operation("Routines", "Check or uncheck a routine for a day", {
            requestBody: body(setRoutineCheckSchema),
            responses: {
              200: json("The stored check", ref("RoutineCheck")),
              400: errors[400],
              404: errors[404],
            },
          }),
        },
        "/tasks": {
          get: operation("Tasks", "List tasks in creation order", {
            responses: {
              200: json("Tasks", { type: "array", items: ref("Task") }),
            },
          }),
          post: operation("Tasks", "Create a task with a client id", {
            requestBody: body(createTaskSchema),
            responses: {
              200: json("The same task already existed", ref("Task")),
              201: json("Created", ref("Task")),
              400: errors[400],
              409: errors[409],
            },
          }),
        },
        "/tasks/reorder": {
          post: operation("Tasks", "Set the order of the listed tasks", {
            requestBody: body(reorderTasksSchema),
            responses: { 204: noContent, 400: errors[400], 404: errors[404] },
          }),
        },
        "/tasks/bulk": {
          post: operation(
            "Tasks",
            "Run create, update and delete operations in one transaction",
            {
              requestBody: body(bulkTasksSchema),
              responses: {
                200: json("One result per operation", ref("BulkResult")),
                400: errors[400],
                404: errors[404],
                409: errors[409],
              },
            },
          ),
        },
        "/import": {
          post: operation(
            "Import",
            "Add projects, routines, routine checks and tasks from a device in one transaction. Records that already exist (or were deleted) keep the server version and are counted as skipped. The body may be up to 8 MB",
            {
              requestBody: body(importSchema),
              responses: {
                200: json(
                  "How many records were added or skipped",
                  ref("ImportResult"),
                ),
                400: errors[400],
              },
            },
          ),
        },
        "/tasks/{id}": {
          parameters: [idParameter],
          patch: operation("Tasks", "Change some fields of a task", {
            requestBody: body(updateTaskSchema),
            responses: {
              200: json("The task after the change", ref("Task")),
              400: errors[400],
              404: errors[404],
            },
          }),
          delete: operation("Tasks", "Delete a task", {
            responses: { 204: noContent, 404: errors[404] },
          }),
        },
      }),
    ),
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      },
      schemas: Object.fromEntries(
        Object.entries(RESPONSE_SCHEMAS).map(([name, schema]) => [
          name,
          toOpenApiSchema(schema, "output"),
        ]),
      ),
    },
  };
}
