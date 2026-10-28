import { Router } from "express";
import { validate } from "../middleware/validate.js";
import {
  createProjectSchema,
  projectIdParams,
  updateProjectSchema,
} from "../schemas/projects.js";
import {
  createProject,
  deleteProject,
  listProjects,
  updateProject,
} from "../services/projectsService.js";

export function createProjectsRouter({ db }) {
  const router = Router();

  router.get("/", async (request, response) => {
    response.json(await listProjects(db, request.user.id));
  });

  router.post(
    "/",
    validate({ body: createProjectSchema }),
    async (request, response) => {
      const { project, created } = await createProject(
        db,
        request.user.id,
        request.validated.body,
      );

      response.status(created ? 201 : 200).json(project);
    },
  );

  router.patch(
    "/:id",
    validate({ params: projectIdParams, body: updateProjectSchema }),
    async (request, response) => {
      const project = await updateProject(
        db,
        request.user.id,
        request.validated.params.id,
        request.validated.body,
      );

      response.json(project);
    },
  );

  router.delete(
    "/:id",
    validate({ params: projectIdParams }),
    async (request, response) => {
      await deleteProject(db, request.user.id, request.validated.params.id);
      response.status(204).end();
    },
  );

  return router;
}
