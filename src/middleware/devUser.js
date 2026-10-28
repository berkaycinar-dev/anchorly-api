import { DEV_USER } from "../constants/devUser.js";

export function devUser(request, response, next) {
  request.user = { id: DEV_USER.id };
  next();
}
