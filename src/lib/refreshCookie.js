import { readCookie } from "./cookies.js";

export const REFRESH_COOKIE_NAME = "anchorly_refresh";
export const MOBILE_CLIENT_HEADER = "x-anchorly-client";

function cookieOptions(auth) {
  return {
    httpOnly: true,
    secure: auth.cookieSecure,
    sameSite: "strict",
    path: auth.cookiePath,
  };
}

export function isMobileClient(request) {
  return request.get(MOBILE_CLIENT_HEADER)?.trim().toLowerCase() === "mobile";
}

export function readRefreshCookie(request) {
  return readCookie(request.get("cookie"), REFRESH_COOKIE_NAME);
}

export function setRefreshCookie(response, auth, { refreshToken, expiresAt }) {
  response.cookie(REFRESH_COOKIE_NAME, refreshToken, {
    ...cookieOptions(auth),
    maxAge: Math.max(0, expiresAt.getTime() - Date.now()),
  });
}

export function clearRefreshCookie(response, auth) {
  response.clearCookie(REFRESH_COOKIE_NAME, cookieOptions(auth));
}
