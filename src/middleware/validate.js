import { validationError } from "../lib/httpError.js";

const REQUEST_PARTS = ["params", "query", "body"];

export function validate(schemas) {
  return (request, response, next) => {
    const validated = {};
    const details = [];

    for (const part of REQUEST_PARTS) {
      const schema = schemas[part];

      if (!schema) {
        continue;
      }

      const result = schema.safeParse(request[part] ?? {});

      if (result.success) {
        validated[part] = result.data;
        continue;
      }

      for (const issue of result.error.issues) {
        details.push({
          path: [part, ...issue.path].join("."),
          message: issue.message,
        });
      }
    }

    if (details.length > 0) {
      next(validationError(details));
      return;
    }

    request.validated = validated;
    next();
  };
}
