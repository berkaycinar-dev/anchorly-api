import SwaggerParser from "@apidevtools/swagger-parser";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { buildOpenApiDocument } from "../src/docs/openapi.js";
import {
  authSessionResponse,
  bulkResultResponse,
  errorResponse,
  healthResponse,
  projectResponse,
  routineCheckResponse,
  routineResponse,
  settingsResponse,
  taskResponse,
} from "../src/docs/responseSchemas.js";
import { PUBLIC_ROUTERS, RESOURCE_ROUTERS } from "../src/routes/index.js";
import { signedInAs, TEST_AUTH } from "./helpers/auth.js";
import { useTestDatabase } from "./helpers/database.js";

const HTTP_METHODS = ["get", "post", "put", "patch", "delete"];

function listImplementedOperations() {
  const operations = ["GET /health"];

  for (const [mountPath, createRouter] of [
    ...PUBLIC_ROUTERS,
    ...RESOURCE_ROUTERS,
  ]) {
    const router = createRouter({ db: null });

    for (const layer of router.stack.filter((item) => item.route)) {
      const routePath = layer.route.path === "/" ? "" : layer.route.path;
      const openApiPath = `${mountPath}${routePath}`.replace(/:(\w+)/g, "{$1}");

      for (const method of Object.keys(layer.route.methods)) {
        operations.push(`${method.toUpperCase()} ${openApiPath}`);
      }
    }
  }

  return operations.sort();
}

function listDocumentedOperations(document) {
  return Object.entries(document.paths)
    .flatMap(([path, item]) =>
      HTTP_METHODS.filter((method) => item[method]).map(
        (method) => `${method.toUpperCase()} ${path}`,
      ),
    )
    .sort();
}

describe("OpenAPI document", () => {
  it("is a valid OpenAPI 3 document", async () => {
    await expect(
      SwaggerParser.validate(structuredClone(buildOpenApiDocument())),
    ).resolves.toBeDefined();
  });

  it("documents every route the API has, and nothing more", () => {
    expect(listDocumentedOperations(buildOpenApiDocument())).toEqual(
      listImplementedOperations(),
    );
  });

  it("asks for a bearer token everywhere except health and auth", () => {
    const document = buildOpenApiDocument();

    expect(document.components.securitySchemes.bearerAuth).toEqual({
      type: "http",
      scheme: "bearer",
      bearerFormat: "JWT",
    });

    for (const [path, item] of Object.entries(document.paths)) {
      const isPublic = path === "/health" || path.startsWith("/auth/");

      for (const method of HTTP_METHODS.filter((name) => item[name])) {
        const operation = item[method];
        const label = `${method.toUpperCase()} ${path}`;

        expect(Boolean(operation.security), label).toBe(!isPublic);
        expect(Boolean(operation.responses[401]), label).toBe(
          !isPublic || path === "/auth/login",
        );
      }
    }
  });

  it("takes request bodies from the validation schemas", () => {
    const document = buildOpenApiDocument();
    const taskBody =
      document.paths["/tasks"].post.requestBody.content["application/json"]
        .schema;

    expect(taskBody.required).toEqual(["id", "title", "order"]);
    expect(taskBody.properties.title.maxLength).toBe(500);
    expect(taskBody.additionalProperties).toBe(false);
  });

  it("is served as JSON and as an interactive page", async () => {
    const app = createApp({
      database: { ping: () => Promise.resolve() },
      auth: TEST_AUTH,
    });

    const json = await request(app).get("/openapi.json");
    const page = await request(app).get("/docs/");

    expect(json.status).toBe(200);
    expect(json.body.info.title).toBe("Anchorly API");
    expect(page.status).toBe(200);
    expect(page.headers["content-type"]).toMatch(/text\/html/);
    expect(page.text).toContain("swagger-ui");
  });
});

describe("documented response shapes", () => {
  const testDatabase = useTestDatabase();
  let app;

  const projectId = "678e4529-fa35-432c-8baa-6a1298ba43f1";
  const routineId = "88444dfd-8be1-4578-956f-037a0b71e8b7";
  const taskId = "4cbd7450-6231-43eb-96a2-3be6d2b1d532";

  let api;

  beforeEach(async () => {
    app = createApp({ database: testDatabase.database, auth: TEST_AUTH });
    api = await signedInAs(app, testDatabase.db);
  });

  it("match what the API really sends", async () => {
    const health = await request(app).get("/health");
    const settings = await api.get("/me/settings");
    const project = await api
      .post("/projects")
      .send({ id: projectId, name: "Portfolio" });
    const routine = await api
      .post("/routines")
      .send({ id: routineId, title: "Read" });
    const check = await api
      .put(`/routines/${routineId}/checks/2026-10-28`)
      .send({ checked: true });
    const checks = await api.get("/routines/checks");
    const task = await api.post("/tasks").send({
      id: taskId,
      title: "Write report",
      order: 0,
      projectId,
      steps: [
        {
          id: "a3f1c2d4-0000-4000-8000-000000000001",
          text: "Draft",
          done: false,
        },
      ],
    });
    const bulk = await api.post("/tasks/bulk").send({
      operations: [
        { type: "update", id: taskId, patch: { title: "Final report" } },
        { type: "delete", id: taskId },
      ],
    });
    const registration = await request(app)
      .post("/auth/register")
      .send({ email: "shape@example.com", password: "long enough" });
    const emailTaken = await request(app)
      .post("/auth/register")
      .send({ email: "shape@example.com", password: "long enough" });
    const login = await request(app)
      .post("/auth/login")
      .send({ email: "shape@example.com", password: "long enough" });
    const wrongPassword = await request(app)
      .post("/auth/login")
      .send({ email: "shape@example.com", password: "wrong password" });
    const notFound = await api.delete(`/tasks/${taskId}`);
    const invalid = await api.post("/projects").send({ name: "" });
    const unauthorized = await request(app).get("/tasks");

    expect(() => healthResponse.parse(health.body)).not.toThrow();
    expect(() => settingsResponse.parse(settings.body)).not.toThrow();
    expect(() => projectResponse.parse(project.body)).not.toThrow();
    expect(() => routineResponse.parse(routine.body)).not.toThrow();
    expect(() => routineCheckResponse.parse(check.body)).not.toThrow();
    expect(() => routineCheckResponse.array().parse(checks.body)).not.toThrow();
    expect(() => taskResponse.parse(task.body)).not.toThrow();
    expect(() => bulkResultResponse.parse(bulk.body)).not.toThrow();
    expect(() => authSessionResponse.parse(registration.body)).not.toThrow();
    expect(() => errorResponse.parse(emailTaken.body)).not.toThrow();
    expect(() => authSessionResponse.parse(login.body)).not.toThrow();
    expect(() => errorResponse.parse(wrongPassword.body)).not.toThrow();
    expect(() => errorResponse.parse(notFound.body)).not.toThrow();
    expect(() => errorResponse.parse(invalid.body)).not.toThrow();
    expect(invalid.body.error.details.length).toBeGreaterThan(0);
    expect(unauthorized.status).toBe(401);
    expect(() => errorResponse.parse(unauthorized.body)).not.toThrow();
  });
});
