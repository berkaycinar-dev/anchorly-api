import { Router } from "express";
import { validate } from "../middleware/validate.js";
import {
  createRoutineSchema,
  routineCheckParams,
  routineIdParams,
  setRoutineCheckSchema,
  updateRoutineSchema,
} from "../schemas/routines.js";
import {
  createRoutine,
  deleteRoutine,
  listRoutineChecks,
  listRoutines,
  setRoutineCheck,
  updateRoutine,
} from "../services/routinesService.js";

export function createRoutinesRouter({ db }) {
  const router = Router();

  router.get("/", async (request, response) => {
    response.json(await listRoutines(db, request.user.id));
  });

  router.get("/checks", async (request, response) => {
    response.json(await listRoutineChecks(db, request.user.id));
  });

  router.post(
    "/",
    validate({ body: createRoutineSchema }),
    async (request, response) => {
      const { routine, created } = await createRoutine(
        db,
        request.user.id,
        request.validated.body,
      );

      response.status(created ? 201 : 200).json(routine);
    },
  );

  router.patch(
    "/:id",
    validate({ params: routineIdParams, body: updateRoutineSchema }),
    async (request, response) => {
      const routine = await updateRoutine(
        db,
        request.user.id,
        request.validated.params.id,
        request.validated.body,
      );

      response.json(routine);
    },
  );

  router.delete(
    "/:id",
    validate({ params: routineIdParams }),
    async (request, response) => {
      await deleteRoutine(db, request.user.id, request.validated.params.id);
      response.status(204).end();
    },
  );

  router.put(
    "/:id/checks/:date",
    validate({ params: routineCheckParams, body: setRoutineCheckSchema }),
    async (request, response) => {
      const { id, date } = request.validated.params;
      const check = await setRoutineCheck(
        db,
        request.user.id,
        id,
        date,
        request.validated.body.checked,
      );

      response.json(check);
    },
  );

  return router;
}
