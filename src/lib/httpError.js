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

export function emailTakenError() {
  return new HttpError(
    409,
    "EMAIL_TAKEN",
    "An account with this email already exists",
  );
}

export function invalidCredentialsError() {
  return new HttpError(
    401,
    "INVALID_CREDENTIALS",
    "The email or password is incorrect",
  );
}

export function unauthorizedError() {
  const error = new HttpError(
    401,
    "UNAUTHORIZED",
    "A valid access token is required",
  );

  error.headers = { "WWW-Authenticate": 'Bearer realm="anchorly-api"' };
  return error;
}

export function invalidRefreshTokenError() {
  return new HttpError(
    401,
    "INVALID_REFRESH_TOKEN",
    "The refresh token is invalid, expired or revoked",
  );
}

export function invalidEmailTokenError() {
  return new HttpError(
    400,
    "INVALID_EMAIL_TOKEN",
    "The link is invalid, expired or already used",
  );
}

export function emailAlreadyVerifiedError() {
  return new HttpError(
    409,
    "EMAIL_ALREADY_VERIFIED",
    "This email address is already verified",
  );
}

export function emailNotVerifiedError() {
  return new HttpError(
    403,
    "EMAIL_NOT_VERIFIED",
    "Verify your email address to use this feature",
  );
}

export function emailNotSentError() {
  return new HttpError(
    503,
    "EMAIL_NOT_SENT",
    "The email could not be sent, please try again later",
  );
}

export function passwordNotSetError() {
  return new HttpError(
    400,
    "PASSWORD_NOT_SET",
    "This account has no password yet; use forgot password to set one",
  );
}

export function invalidCurrentPasswordError() {
  return new HttpError(
    400,
    "INVALID_CURRENT_PASSWORD",
    "The current password is incorrect",
  );
}

export function tooManyRequestsError() {
  return new HttpError(
    429,
    "TOO_MANY_REQUESTS",
    "Too many requests, try again later",
  );
}

export function validationError(details) {
  return new HttpError(
    400,
    "VALIDATION_ERROR",
    "The request contains invalid data",
    details,
  );
}
