import helmet from "helmet";

const DOCS_PATH = "/docs";

function createApiSecurityHeaders() {
  return helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    frameguard: { action: "deny" },
  });
}

function createDocsSecurityHeaders() {
  return helmet();
}

function isDocsPath(path) {
  return path === DOCS_PATH || path.startsWith(`${DOCS_PATH}/`);
}

export function createSecurityHeaders() {
  const apiHeaders = createApiSecurityHeaders();
  const docsHeaders = createDocsSecurityHeaders();

  return (request, response, next) => {
    const headers = isDocsPath(request.path) ? docsHeaders : apiHeaders;

    headers(request, response, next);
  };
}
