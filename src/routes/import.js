import express, { Router } from "express";
import { IMPORT_BODY_LIMIT } from "../constants/import.js";
import { validate } from "../middleware/validate.js";
import { importSchema } from "../schemas/import.js";
import { importData } from "../services/importService.js";

export function createImportRouter({ db }) {
  const router = Router();

  router.use(express.json({ limit: IMPORT_BODY_LIMIT }));

  router.post(
    "/",
    validate({ body: importSchema }),
    async (request, response) => {
      response.json(
        await importData(db, request.user.id, request.validated.body),
      );
    },
  );

  return router;
}
