import { HttpError, notFoundError } from "../lib/httpError.js";

export function notFoundHandler(request, response, next) {
  next(notFoundError(`Route ${request.method} ${request.path} not found`));
}

function toHttpError(error) {
  if (error instanceof HttpError) {
    return error;
  }

  if (error.type === "entity.parse.failed") {
    return new HttpError(
      400,
      "INVALID_JSON",
      "The request body is not valid JSON",
    );
  }

  if (error.type === "entity.too.large") {
    return new HttpError(
      413,
      "PAYLOAD_TOO_LARGE",
      "The request body is too large",
    );
  }

  return null;
}

export function createErrorHandler({ logger = console } = {}) {
  return (error, request, response, next) => {
    if (response.headersSent) {
      next(error);
      return;
    }

    const httpError = toHttpError(error);

    if (!httpError) {
      logger.error(error);
      response.status(500).json({
        error: { code: "INTERNAL_ERROR", message: "Something went wrong" },
      });
      return;
    }

    const body = { code: httpError.code, message: httpError.message };

    if (httpError.details) {
      body.details = httpError.details;
    }

    response.status(httpError.status).json({ error: body });
  };
}
