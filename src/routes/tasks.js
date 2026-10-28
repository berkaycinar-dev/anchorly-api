import { Router } from "express";
import { validate } from "../middleware/validate.js";
import {
  createTaskSchema,
  taskIdParams,
  updateTaskSchema,
} from "../schemas/tasks.js";
import {
  createTask,
  deleteTask,
  listTasks,
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
