import { Router } from "express";
import { validate } from "../middleware/validate.js";
import {
  bulkTasksSchema,
  createTaskSchema,
  reorderTasksSchema,
  taskIdParams,
  updateTaskSchema,
} from "../schemas/tasks.js";
import {
  bulkTasks,
  createTask,
  deleteTask,
  listTasks,
  reorderTasks,
  updateTask,
} from "../services/tasksService.js";

export function createTasksRouter({ db }) {
  const router = Router();

  router.get("/", async (request, response) => {
    response.json(await listTasks(db, request.user.id));
  });

  router.post(
    "/",
    validate({ body: createTaskSchema }),
    async (request, response) => {
      const { task, created } = await createTask(
        db,
        request.user.id,
        request.validated.body,
      );

      response.status(created ? 201 : 200).json(task);
    },
  );

  router.post(
    "/reorder",
    validate({ body: reorderTasksSchema }),
    async (request, response) => {
      await reorderTasks(
        db,
        request.user.id,
        request.validated.body.orderedIds,
      );
      response.status(204).end();
    },
  );

  router.post(
    "/bulk",
    validate({ body: bulkTasksSchema }),
    async (request, response) => {
      const results = await bulkTasks(
        db,
        request.user.id,
        request.validated.body.operations,
      );

      response.json({ results });
    },
  );

  router.patch(
    "/:id",
    validate({ params: taskIdParams, body: updateTaskSchema }),
    async (request, response) => {
      const task = await updateTask(
        db,
        request.user.id,
        request.validated.params.id,
        request.validated.body,
      );

      response.json(task);
    },
  );

  router.delete(
    "/:id",
    validate({ params: taskIdParams }),
    async (request, response) => {
      await deleteTask(db, request.user.id, request.validated.params.id);
      response.status(204).end();
    },
  );

  return router;
}
