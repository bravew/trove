import { expect, test } from "bun:test";
import {
  BODY_LINE_LIMIT,
  BODY_TOKEN_LIMIT,
  CLAUDE_DESCRIPTION_AND_WHEN_TO_USE_CHAR_LIMIT,
  DESCRIPTION_CHAR_LIMIT,
  estimateSkillTokens,
  flattenSkillText,
  measureSkillBudget,
  validateSkillBudget,
} from "../scripts/lib/skill-budget";

test("skill budget: flattens multiline frontmatter text", () => {
  expect(flattenSkillText("one\n  two\tthree")).toBe("one two three");
  expect(flattenSkillText(undefined)).toBe("");
});

test("skill budget: measures body lines and approximate tokens", () => {
  const body = "abcd\n".repeat(10);
  const measurement = measureSkillBudget({
    description: "short",
    body,
  });

  expect(measurement.bodyLines).toBe(11);
  expect(measurement.bodyTokens).toBe(estimateSkillTokens(body));
});

test("skill budget: accepts content at the documented limits", () => {
  const findings = validateSkillBudget({
    description: "d".repeat(DESCRIPTION_CHAR_LIMIT),
    whenToUse: "",
    body: "a".repeat(BODY_TOKEN_LIMIT * 4),
  });

  expect(findings).toEqual([]);
});

test("skill budget: rejects descriptions and bodies over the limits", () => {
  const findings = validateSkillBudget({
    description: "d".repeat(DESCRIPTION_CHAR_LIMIT + 1),
    whenToUse: "w".repeat(CLAUDE_DESCRIPTION_AND_WHEN_TO_USE_CHAR_LIMIT),
    body: `${"line\n".repeat(BODY_LINE_LIMIT)}${"a".repeat(BODY_TOKEN_LIMIT * 4 + 1)}`,
  });

  expect(findings.map((finding) => finding.message)).toEqual([
    `description is ${DESCRIPTION_CHAR_LIMIT + 1} chars (limit: ${DESCRIPTION_CHAR_LIMIT})`,
    `description + when_to_use is ${DESCRIPTION_CHAR_LIMIT + 2 + CLAUDE_DESCRIPTION_AND_WHEN_TO_USE_CHAR_LIMIT} chars (limit: ${CLAUDE_DESCRIPTION_AND_WHEN_TO_USE_CHAR_LIMIT})`,
    `body is ${BODY_LINE_LIMIT + 1} lines (limit: ${BODY_LINE_LIMIT})`,
    `body is ~${BODY_TOKEN_LIMIT + Math.ceil((BODY_LINE_LIMIT * 5 + 1) / 4)} tokens (limit: ~${BODY_TOKEN_LIMIT})`,
  ]);
});
