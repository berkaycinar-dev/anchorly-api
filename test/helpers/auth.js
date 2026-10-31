import request from "supertest";
import { DEV_USER } from "../../src/constants/devUser.js";
import { createSession } from "../../src/services/authService.js";

export const TEST_AUTH = Object.freeze({
  jwtSecret: "test-only-secret-that-is-long-enough-1234",
  accessTokenTtlSeconds: 900,
  refreshTokenTtlDays: 30,
});

export async function signedInAs(app, db, { userId = DEV_USER.id } = {}) {
  const { accessToken } = await createSession(db, {
    userId,
    deviceName: "Test runner",
    auth: TEST_AUTH,
  });

  return request.agent(app).set("Authorization", `Bearer ${accessToken}`);
}
