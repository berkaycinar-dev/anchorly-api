import { expect } from "vitest";

export async function expectDatabaseError(promise, code) {
  const error = await promise.then(
    () => null,
    (caught) => caught,
  );

  expect(error, `expected database error ${code}`).not.toBeNull();
  expect(error.cause?.code ?? error.code).toBe(code);
}
