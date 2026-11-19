import { describe, expect, it, vi } from "vitest";
import { createPwnedPasswordChecker } from "../src/lib/pwnedPasswords.js";

const PASSWORD = "password";
const PREFIX = "5BAA6";
const SUFFIX = "1E4C9B93F3F0682250B6CF8331B7EE68FD8";

function answer(body, status = 200) {
  return vi.fn(async () => new Response(body, { status }));
}

function createChecker(fetch, overrides = {}) {
  const logger = { error: vi.fn() };
  const isPasswordBreached = createPwnedPasswordChecker({
    fetch,
    logger,
    ...overrides,
  });

  return { isPasswordBreached, logger };
}

describe("pwned passwords checker", () => {
  it("sends only the first five characters of the SHA-1 hash", async () => {
    const fetch = answer("");
    const { isPasswordBreached } = createChecker(fetch);

    await isPasswordBreached(PASSWORD);

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe(`https://api.pwnedpasswords.com/range/${PREFIX}`);
    expect(url).not.toContain(SUFFIX);
    expect(options.headers["Add-Padding"]).toBe("true");
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it("finds a password that appears in a breach", async () => {
    const { isPasswordBreached } = createChecker(
      answer(`0018A45C4D1DEF81644B54AB7F969B88D65:1\r\n${SUFFIX}:10434004\r\n`),
    );

    expect(await isPasswordBreached(PASSWORD)).toBe(true);
  });

  it("finds a password seen in a single breach", async () => {
    const { isPasswordBreached } = createChecker(answer(`${SUFFIX}:1`));

    expect(await isPasswordBreached(PASSWORD)).toBe(true);
  });

  it("accepts a password that is not in the list", async () => {
    const { isPasswordBreached } = createChecker(
      answer("0018A45C4D1DEF81644B54AB7F969B88D65:1\r\n"),
    );

    expect(await isPasswordBreached(PASSWORD)).toBe(false);
  });

  it("ignores padding lines with a count of zero", async () => {
    const { isPasswordBreached } = createChecker(answer(`${SUFFIX}:0\r\n`));

    expect(await isPasswordBreached(PASSWORD)).toBe(false);
  });

  it("accepts the password and logs when the service fails", async () => {
    const fetch = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    const { isPasswordBreached, logger } = createChecker(fetch);

    expect(await isPasswordBreached(PASSWORD)).toBe(false);
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error.mock.calls[0][0].cause.message).toBe("fetch failed");
  });

  it("accepts the password and logs when the service answers with an error", async () => {
    const { isPasswordBreached, logger } = createChecker(
      answer(`${SUFFIX}:5`, 503),
    );

    expect(await isPasswordBreached(PASSWORD)).toBe(false);
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it("stops waiting after the timeout", async () => {
    const fetch = vi.fn(
      (url, { signal }) =>
        new Promise((resolve, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason));
        }),
    );
    const { isPasswordBreached, logger } = createChecker(fetch, {
      timeoutMs: 20,
    });

    expect(await isPasswordBreached(PASSWORD)).toBe(false);
    expect(logger.error).toHaveBeenCalledTimes(1);
  });
});
