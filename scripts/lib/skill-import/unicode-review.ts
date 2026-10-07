/**
 * Reviewed Unicode exceptions for the import scanner.
 *
 * The default scanner hard-rejects every invisible character. A pinned,
 * human-reviewed exception may convert exactly one kind — the zero-width
 * joiner U+200D — into an explicit flag, and only when the exception is bound
 * to the resolved commit SHA, the full blob digest, the exact line, and the
 * exact count. Everything else stays a hard reject.
 */

export const REVIEWABLE_CODE_POINT = "U+200D";

export interface UnicodeException {
  file: string;
  sha256: string;
  line: number;
  codePoint: "U+200D";
  count: number;
}

export interface ReviewedUnicode {
  resolvedSha: string;
  exceptions: readonly UnicodeException[];
}

const SHA_RE = /^[0-9a-f]{40}$/;
const SHA256_RE = /^[0-9a-f]{64}$/;

const TOP_KEYS = ["resolvedSha", "exceptions"] as const;
const EXCEPTION_KEYS = ["file", "sha256", "line", "codePoint", "count"] as const;

function objectAt(value: unknown, where: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${where} must be a JSON object`);
  }
  return value as Record<string, unknown>;
}

function stringAt(value: unknown, where: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${where} must be a non-empty string`);
  return value;
}

function positiveInt(value: unknown, where: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${where} must be a positive integer`);
  }
  return value;
}

function repositoryPath(value: string, where: string): string {
  if (value.includes("\\") || value.includes("\0")) throw new Error(`${where} must use POSIX separators`);
  if (value.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value)) throw new Error(`${where} must be repository-relative`);
  const segments = value.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    throw new Error(`${where} must not contain empty, '.' or '..' segments`);
  }
  return value;
}

/** Strict boundary validation of a parsed `--unicode-review` value. Throws on any shape violation. */
export function validateReviewedUnicode(value: unknown): ReviewedUnicode {
  const record = objectAt(value, "unicode review");
  for (const key of Object.keys(record)) {
    if (!(TOP_KEYS as readonly string[]).includes(key)) throw new Error(`unicode review: unknown key '${key}'`);
  }
  for (const key of TOP_KEYS) {
    if (!(key in record)) throw new Error(`unicode review: missing key '${key}'`);
  }

  const resolvedSha = stringAt(record.resolvedSha, "unicode review.resolvedSha");
  if (!SHA_RE.test(resolvedSha)) throw new Error("unicode review.resolvedSha must be 40 lowercase hex characters");
  if (!Array.isArray(record.exceptions)) throw new Error("unicode review.exceptions must be a JSON array");

  const seen = new Set<string>();
  const exceptions = record.exceptions.map((entry, index): UnicodeException => {
    const where = `unicode review.exceptions[${index}]`;
    const item = objectAt(entry, where);
    for (const key of Object.keys(item)) {
      if (!(EXCEPTION_KEYS as readonly string[]).includes(key)) throw new Error(`${where}: unknown key '${key}'`);
    }
    for (const key of EXCEPTION_KEYS) {
      if (!(key in item)) throw new Error(`${where}: missing key '${key}'`);
    }

    const file = repositoryPath(stringAt(item.file, `${where}.file`), `${where}.file`);
    const sha256 = stringAt(item.sha256, `${where}.sha256`);
    if (!SHA256_RE.test(sha256)) throw new Error(`${where}.sha256 must be 64 lowercase hex characters`);
    const line = positiveInt(item.line, `${where}.line`);
    if (item.codePoint !== REVIEWABLE_CODE_POINT) {
      throw new Error(`${where}.codePoint must be '${REVIEWABLE_CODE_POINT}' (only ${REVIEWABLE_CODE_POINT} is eligible for review)`);
    }
    const count = positiveInt(item.count, `${where}.count`);

    const key = `${file}\0${line}`;
    if (seen.has(key)) throw new Error(`${where} duplicates an earlier exception for ${file}:${line}`);
    seen.add(key);

    return { file, sha256, line, codePoint: "U+200D", count };
  });

  return { resolvedSha, exceptions };
}

/** Parses and validates the text of a `--unicode-review` JSON document. */
export function parseUnicodeReview(text: string): ReviewedUnicode {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  return validateReviewedUnicode(parsed);
}
