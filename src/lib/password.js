import { Algorithm, hash, verify } from "@node-rs/argon2";

export const PASSWORD_HASH_OPTIONS = Object.freeze({
  algorithm: Algorithm.Argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
});

let dummyHashPromise;

function getDummyHash() {
  dummyHashPromise ??= hash("anchorly-dummy-password", PASSWORD_HASH_OPTIONS);
  return dummyHashPromise;
}

export function hashPassword(password) {
  return hash(password, PASSWORD_HASH_OPTIONS);
}

export async function verifyPassword(passwordHash, password) {
  if (!passwordHash) {
    await verify(await getDummyHash(), password).catch(() => false);
    return false;
  }

  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}
