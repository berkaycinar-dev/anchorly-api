import { createHash } from "node:crypto";

const RANGE_URL = "https://api.pwnedpasswords.com/range/";
const TIMEOUT_MS = 3000;

function hashPassword(password) {
  return createHash("sha1")
    .update(password, "utf8")
    .digest("hex")
    .toUpperCase();
}

function containsSuffix(body, suffix) {
  return body.split("\n").some((line) => {
    const [candidate, count] = line.split(":");

    return candidate === suffix && Number(count) > 0;
  });
}

export function createPwnedPasswordChecker({
  fetch = globalThis.fetch,
  logger = console,
  timeoutMs = TIMEOUT_MS,
} = {}) {
  return async function isPasswordBreached(password) {
    const hash = hashPassword(password);
    const prefix = hash.slice(0, 5);
    const suffix = hash.slice(5);

    try {
      const response = await fetch(`${RANGE_URL}${prefix}`, {
        headers: { "Add-Padding": "true", "User-Agent": "anchorly-api" },
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!response.ok) {
        throw new Error(`Pwned Passwords answered with ${response.status}`);
      }

      return containsSuffix(await response.text(), suffix);
    } catch (error) {
      logger.error(
        new Error("Skipped the breached password check", { cause: error }),
      );
      return false;
    }
  };
}
