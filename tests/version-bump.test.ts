import { expect, test } from "bun:test";
import { nextVersion } from "../scripts/bump-version";

const day = new Date(2026, 10, 11); // 2026-11-11, local time
const nextDay = new Date(2026, 10, 12);

test("the first release of a day is the plain calendar version", () => {
  expect(nextVersion("2026.11.10", day)).toBe("2026.11.11");
  expect(nextVersion("2026.11.11", day)).toBe("2026.11.11.1");
});

test("later same-day releases increment the trailing counter", () => {
  expect(nextVersion("2026.11.11.1", day)).toBe("2026.11.11.2");
  expect(nextVersion("2026.11.11.9", day)).toBe("2026.11.11.10");
});

test("a new day starts a fresh calendar version", () => {
  expect(nextVersion("2026.11.11.4", nextDay)).toBe("2026.11.12");
});

test("a malformed counter restarts at one instead of producing NaN", () => {
  expect(nextVersion("2026.11.11.x", day)).toBe("2026.11.11.1");
  expect(nextVersion("2026.11.11.0", day)).toBe("2026.11.11.1");
});

test("every same-day bump changes the version, which is what hosts compare", () => {
  let version = "2026.11.11";
  const seen = new Set([version]);
  for (let i = 0; i < 5; i++) {
    version = nextVersion(version, day);
    expect(seen.has(version)).toBe(false);
    seen.add(version);
  }
});
