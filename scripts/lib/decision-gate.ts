/**
 * Decision-gate lint.
 *
 * Standard format (see docs/skill-authoring.md):
 *
 *   ## Decision Gate: <topic>
 *
 *   Context: <one line>
 *   Question: <one line>
 *   Options:
 *   - A. <option>
 *   - B. <option>
 *   Default: <choice>, because <reason>
 *
 * Pure function so it's directly unit-testable; `validate.ts` wraps it
 * with its own logging conventions.
 */

export type GateSeverity = "error" | "warning";

export interface GateFinding {
  severity: GateSeverity;
  topic: string;
  message: string;
}

export function lintDecisionGates(body: string): GateFinding[] {
  const findings: GateFinding[] = [];
  const headingPattern = /^## Decision Gate:\s*(.+)$/gm;
  const matches = [...body.matchAll(headingPattern)];

  for (const match of matches) {
    const headingIdx = match.index ?? 0;
    const start = headingIdx + match[0].length;
    // Block ends at the next ## heading, or end of body.
    const nextHeading = body.slice(start).search(/^## /m);
    const end = nextHeading === -1 ? body.length : start + nextHeading;
    const block = body.slice(start, end);
    const topic = match[1].trim();

    if (!/^Context:\s*\S+/m.test(block)) {
      findings.push({ severity: "warning", topic, message: "missing 'Context:' line" });
    }
    if (!/^Question:\s*\S+/m.test(block)) {
      findings.push({ severity: "warning", topic, message: "missing 'Question:' line" });
    }

    const optionsHeader = /^Options:\s*$/m.test(block);
    const letteredOptions = (block.match(/^\s*-\s*[A-Z]\.\s+\S+/gm) ?? []).length;
    if (!optionsHeader || letteredOptions < 2) {
      findings.push({
        severity: "error",
        topic,
        message: "missing 'Options:' header with at least two lettered choices ('- A.', '- B.')",
      });
    }
    if (!/^Default:\s*\S+/m.test(block)) {
      findings.push({
        severity: "warning",
        topic,
        message: "missing 'Default:' line — picking a default helps the user when they don't have a preference",
      });
    }
  }

  return findings;
}
