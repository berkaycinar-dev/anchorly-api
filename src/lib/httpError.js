export class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function notFoundError(message = "Resource not found") {
  return new HttpError(404, "NOT_FOUND", message);
}

export function conflictError(message) {
  return new HttpError(409, "CONFLICT", message);
}

export function validationError(details) {
  return new HttpError(
    400,
    "VALIDATION_ERROR",
    "The request contains invalid data",
    details,
  );
}
