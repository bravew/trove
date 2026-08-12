export const DESCRIPTION_CHAR_LIMIT = 1024;
export const CLAUDE_DESCRIPTION_AND_WHEN_TO_USE_CHAR_LIMIT = 1536;
export const BODY_LINE_LIMIT = 500;
export const BODY_TOKEN_LIMIT = 5000;

export type SkillBudgetFinding = {
  severity: "error";
  message: string;
};

export type SkillBudgetInput = {
  description: string;
  whenToUse?: string;
  body: string;
};

export type SkillBudgetMeasurement = {
  descriptionChars: number;
  descriptionAndWhenToUseChars: number;
  bodyLines: number;
  bodyTokens: number;
};

export function flattenSkillText(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

export function estimateSkillTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function measureSkillBudget(input: SkillBudgetInput): SkillBudgetMeasurement {
  const description = flattenSkillText(input.description);
  const whenToUse = flattenSkillText(input.whenToUse ?? "");
  const combined = [description, whenToUse].filter(Boolean).join(" ");

  return {
    descriptionChars: description.length,
    descriptionAndWhenToUseChars: combined.length,
    bodyLines: input.body.split("\n").length,
    bodyTokens: estimateSkillTokens(input.body),
  };
}

export function validateSkillBudget(input: SkillBudgetInput): SkillBudgetFinding[] {
  const measurement = measureSkillBudget(input);
  const findings: SkillBudgetFinding[] = [];

  if (measurement.descriptionChars > DESCRIPTION_CHAR_LIMIT) {
    findings.push({
      severity: "error",
      message: `description is ${measurement.descriptionChars} chars (limit: ${DESCRIPTION_CHAR_LIMIT})`,
    });
  }

  if (
    measurement.descriptionAndWhenToUseChars >
    CLAUDE_DESCRIPTION_AND_WHEN_TO_USE_CHAR_LIMIT
  ) {
    findings.push({
      severity: "error",
      message:
        `description + when_to_use is ${measurement.descriptionAndWhenToUseChars} chars ` +
        `(limit: ${CLAUDE_DESCRIPTION_AND_WHEN_TO_USE_CHAR_LIMIT})`,
    });
  }

  if (measurement.bodyLines > BODY_LINE_LIMIT) {
    findings.push({
      severity: "error",
      message: `body is ${measurement.bodyLines} lines (limit: ${BODY_LINE_LIMIT})`,
    });
  }

  if (measurement.bodyTokens > BODY_TOKEN_LIMIT) {
    findings.push({
      severity: "error",
      message: `body is ~${measurement.bodyTokens} tokens (limit: ~${BODY_TOKEN_LIMIT})`,
    });
  }

  return findings;
}
