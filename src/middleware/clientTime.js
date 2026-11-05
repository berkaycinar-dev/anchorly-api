import { CLIENT_TIME_HEADER } from "../constants/clientTime.js";
import { validationError } from "../lib/httpError.js";

const ISO_DATE_TIME =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/;

export function readClientTime({ now = () => new Date() } = {}) {
  return (request, response, next) => {
    const header = request.get(CLIENT_TIME_HEADER);

    if (header === undefined) {
      request.clientTime = null;
      next();
      return;
    }

    const parsed = ISO_DATE_TIME.test(header) ? new Date(header) : null;

    if (!parsed || Number.isNaN(parsed.getTime())) {
      next(
        validationError([
          {
            path: "headers.x-client-time",
            message: "Must be an ISO 8601 date and time with a time zone",
          },
        ]),
      );
      return;
    }

    const current = now();

    request.clientTime = parsed > current ? current : parsed;
    next();
  };
}
