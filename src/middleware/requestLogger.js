import { randomUUID } from "node:crypto";
import { pinoHttp } from "pino-http";

export const REQUEST_ID_HEADER = "X-Request-Id";
export const QUIET_PATHS = ["/ping", "/health"];

const VALID_REQUEST_ID = /^[A-Za-z0-9._-]{8,64}$/;

function pathOf(url = "") {
  return url.split("?")[0];
}

function chooseRequestId(request, response) {
  const incoming = request.headers["x-request-id"];
  const id =
    typeof incoming === "string" && VALID_REQUEST_ID.test(incoming)
      ? incoming
      : randomUUID();

  response.setHeader(REQUEST_ID_HEADER, id);
  return id;
}

function describe(request, response) {
  return `${request.method} ${pathOf(request.url)} ${response.statusCode}`;
}

function chooseLevel(request, response, error) {
  if (error || response.statusCode >= 500) {
    return "error";
  }

  if (response.statusCode >= 400) {
    return "warn";
  }

  return "info";
}

export function createRequestLogger({ logger }) {
  return pinoHttp({
    logger,
    genReqId: chooseRequestId,
    customLogLevel: chooseLevel,
    autoLogging: {
      ignore: (request) => QUIET_PATHS.includes(pathOf(request.url)),
    },
    serializers: {
      req: (request) => ({
        id: request.id,
        method: request.method,
        url: pathOf(request.url),
      }),
      res: (response) => ({ statusCode: response.statusCode }),
    },
    customSuccessMessage: describe,
    customErrorMessage: describe,
  });
}
