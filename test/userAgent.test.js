import { describe, expect, it } from "vitest";
import { describeUserAgent } from "../src/lib/userAgent.js";

const EXAMPLES = [
  [
    "Chrome on Windows",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    "Chrome · Windows",
  ],
  [
    "Edge on Windows",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.2849.56",
    "Edge · Windows",
  ],
  [
    "Opera on Windows",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 OPR/115.0.0.0",
    "Opera · Windows",
  ],
  [
    "Firefox on Windows",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0",
    "Firefox · Windows",
  ],
  [
    "Safari on macOS",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
    "Safari · macOS",
  ],
  [
    "Chrome on macOS",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    "Chrome · macOS",
  ],
  [
    "Safari on iPhone",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
    "Safari · iOS",
  ],
  [
    "Chrome on iPhone",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1",
    "Chrome · iOS",
  ],
  [
    "Firefox on iPad",
    "Mozilla/5.0 (iPad; CPU OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/132.0 Mobile/15E148 Safari/605.1.15",
    "Firefox · iOS",
  ],
  [
    "Chrome on Android",
    "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.6723.102 Mobile Safari/537.36",
    "Chrome · Android",
  ],
  [
    "Samsung Internet on Android",
    "Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36",
    "Samsung Internet · Android",
  ],
  [
    "Firefox on Linux",
    "Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0",
    "Firefox · Linux",
  ],
  [
    "Chrome on ChromeOS",
    "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    "Chrome · ChromeOS",
  ],
];

describe("describeUserAgent", () => {
  it.each(EXAMPLES)("names %s", (_name, userAgent, expected) => {
    expect(describeUserAgent(userAgent)).toBe(expected);
  });

  it("returns null for tools and unknown clients", () => {
    expect(describeUserAgent("curl/8.4.0")).toBeNull();
    expect(describeUserAgent("PostmanRuntime/7.42.0")).toBeNull();
    expect(describeUserAgent("node")).toBeNull();
  });

  it("returns null when the header is missing or empty", () => {
    expect(describeUserAgent(undefined)).toBeNull();
    expect(describeUserAgent("")).toBeNull();
  });
});
