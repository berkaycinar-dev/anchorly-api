import { Router } from "express";
import { validate } from "../middleware/validate.js";
import { settingsPatchSchema } from "../schemas/settings.js";
import { getSettings, updateSettings } from "../services/settingsService.js";

export function createSettingsRouter({ db }) {
  const router = Router();

  router.get("/", async (request, response) => {
    response.json(await getSettings(db, request.user.id));
  });

  router.patch(
    "/",
    validate({ body: settingsPatchSchema }),
    async (request, response) => {
      const settings = await updateSettings(
        db,
        request.user.id,
        request.validated.body,
      );

      response.json(settings);
    },
  );

  return router;
}
