import { describe, expect, it } from "vitest";
import { readCookie } from "../src/lib/cookies.js";

describe("readCookie", () => {
  it("finds a cookie among others", () => {
    expect(
      readCookie(
        "theme=dark; anchorly_refresh=abc_DEF-123; lang=tr",
        "anchorly_refresh",
      ),
    ).toBe("abc_DEF-123");
  });

  it("does not match a cookie whose name only ends the same way", () => {
    expect(
      readCookie("old_anchorly_refresh=nope", "anchorly_refresh"),
    ).toBeNull();
  });

  it("decodes percent-encoded values", () => {
    expect(readCookie("name=a%20b", "name")).toBe("a b");
  });

  it("returns null for a missing, empty or malformed cookie", () => {
    expect(readCookie(undefined, "name")).toBeNull();
    expect(readCookie("", "name")).toBeNull();
    expect(readCookie("other=1", "name")).toBeNull();
    expect(readCookie("name=", "name")).toBeNull();
    expect(readCookie("name=%E0%A4%A", "name")).toBeNull();
    expect(readCookie("garbage", "name")).toBeNull();
  });
});
