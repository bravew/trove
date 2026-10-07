import { describe, expect, test } from "bun:test";
import { parseUnicodeReview } from "../scripts/lib/skill-import/unicode-review";

const SHA = "a".repeat(40);
const DIGEST = "b".repeat(64);

function review(overrides: Record<string, unknown> = {}, top: Record<string, unknown> = {}): string {
  return JSON.stringify({
    resolvedSha: SHA,
    exceptions: [{ file: "scripts/a.py", sha256: DIGEST, line: 3, codePoint: "U+200D", count: 1, ...overrides }],
    ...top,
  });
}

describe("parseUnicodeReview", () => {
  test("accepts a well-formed review", () => {
    expect(parseUnicodeReview(review()).exceptions).toEqual([
      { file: "scripts/a.py", sha256: DIGEST, line: 3, codePoint: "U+200D", count: 1 },
    ]);
  });

  test("rejects invalid JSON", () => {
    expect(() => parseUnicodeReview("{")).toThrow(/invalid JSON/);
  });

  test.each([
    ["a non-hex commit", {}, { resolvedSha: "main" }, /resolvedSha/],
    ["an unknown top-level key", {}, { extra: true }, /unknown key 'extra'/],
    ["any code point but U+200D", { codePoint: "U+200B" }, {}, /only U\+200D is eligible/],
    ["a short digest", { sha256: "abc" }, {}, /sha256/],
    ["a zero count", { count: 0 }, {}, /count/],
    ["a fractional line", { line: 1.5 }, {}, /line/],
    ["a traversal path", { file: "../x.py" }, {}, /file/],
    ["an absolute path", { file: "/etc/x" }, {}, /file/],
    ["an unknown exception key", { note: "ok" }, {}, /unknown key 'note'/],
  ])("rejects %s", (_label, entry, top, pattern) => {
    expect(() => parseUnicodeReview(review(entry, top))).toThrow(pattern);
  });

  test("rejects a duplicate file and line", () => {
    const entry = { file: "scripts/a.py", sha256: DIGEST, line: 3, codePoint: "U+200D", count: 1 };
    expect(() => parseUnicodeReview(JSON.stringify({ resolvedSha: SHA, exceptions: [entry, entry] }))).toThrow(/duplicates/);
  });
});
