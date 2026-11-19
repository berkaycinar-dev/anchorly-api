import { passwordBreachedError } from "../lib/httpError.js";

export function createBreachedPasswordGuard(isPasswordBreached) {
  return function rejectBreachedPassword(field) {
    return async (request, response, next) => {
      if (await isPasswordBreached(request.validated.body[field])) {
        next(passwordBreachedError());
        return;
      }

      next();
    };
  };
}
