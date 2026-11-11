import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const ROOT = path.resolve(import.meta.dir, "..");
const MEDIA = path.join(ROOT, "skills/media");

/** Run a skill script with nothing importable from the working directory. */
const python = (script: string, args: string[], cwd = os.tmpdir()) => spawnSync(
  "python3", ["-I", script, ...args],
  { cwd, encoding: "utf8", env: { PATH: process.env.PATH ?? "" }, timeout: 30_000 },
);

const wav = (file: string, rate: number, seconds: number, pulses: number[]) => {
  const samples = Buffer.alloc(rate * seconds * 2);
  for (const at of pulses) samples.writeInt16LE(16_000, Math.round(at * rate) * 2);
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + samples.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(samples.length, 40);
  fs.writeFileSync(file, Buffer.concat([header, samples]));
};

describe("take cut", () => {
  test("a one-sample pulse keeps a span the encoder can cut", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "take-cut-"));
    const audio = path.join(directory, "pulse.wav");
    wav(audio, 16_000, 1, [0.5]);
    const takes = path.join(directory, "takes.json");
    fs.writeFileSync(takes, JSON.stringify({
      lines: [{ line: 1, window: { start: 0.4, end: 0.6 } }],
    }));
    const result = python(path.join(MEDIA, "trove-take-cut/scripts/cut_points.py"), [
      "--audio", audio, "--takes", takes,
    ]);
    expect(result.status, result.stderr).toBe(0);
    const [point] = JSON.parse(result.stdout);
    expect(point.end).toBeGreaterThan(point.start);
  });

  const cut = (windows: Array<[number, number]>, pulses: number[]) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "take-cut-"));
    const audio = path.join(directory, "takes.wav");
    wav(audio, 16_000, 4, pulses);
    const takes = path.join(directory, "takes.json");
    fs.writeFileSync(takes, JSON.stringify({
      lines: windows.map(([start, end], index) => ({ line: index + 1, window: { start, end } })),
    }));
    return python(path.join(MEDIA, "trove-take-cut/scripts/cut_points.py"), [
      "--audio", audio, "--takes", takes,
    ]);
  };

  test("a keeper recorded before the previous line's keeper is not an overlap", () => {
    // Line 1 was retaken at the end of the session, after line 2.
    const result = cut([[2.4, 2.6], [0.4, 0.6]], [0.5, 2.5]);
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout).map((p: { line: number }) => p.line)).toEqual([1, 2]);
  });

  test("two keepers covering the same words still fail", () => {
    const result = cut([[0.4, 0.6], [0.45, 0.7]], [0.5, 0.55]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("overlaps");
  });

  test("word times that run backwards fail the content check", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "verify-cut-"));
    const words = path.join(directory, "words.json");
    fs.writeFileSync(words, JSON.stringify({ words: [{ text: "Hello", start: 0, end: -1 }] }));
    const result = python(path.join(MEDIA, "trove-take-cut/scripts/verify_cut.py"), [
      "--words", words,
    ]);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("CONTENT: failed");
  });

  test("a zero-length word, which recognizers emit for a filler, is not a content failure", () => {
    // faster-whisper returned "uh," at 0.72 to 0.72 on a real cut.
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "verify-cut-"));
    const words = path.join(directory, "words.json");
    fs.writeFileSync(words, JSON.stringify({ words: [
      { text: "Hey,", start: 0, end: 0.26 },
      { text: "uh,", start: 0.72, end: 0.72 },
      { text: "hello", start: 0.96, end: 1.2 },
    ] }));
    const result = python(path.join(MEDIA, "trove-take-cut/scripts/verify_cut.py"), [
      "--words", words,
    ]);
    expect(result.stdout).toContain("CONTENT: clean");
    expect(result.status).toBe(0);
  });
});

describe("b-roll catalog", () => {
  test("a select outside the catalog rules is refused and nothing is written", () => {
    const library = fs.mkdtempSync(path.join(os.tmpdir(), "catalog-"));
    const result = python(path.join(MEDIA, "trove-broll-ingest/scripts/catalog.py"), [
      "--library", library, "--file", "", "--source", "raw.mp4",
      "--start", "-1", "--end", "1", "--category", "", "--description", "",
      "--transfer", "rec709",
    ]);
    expect(result.status).not.toBe(0);
    expect(fs.existsSync(path.join(library, "catalog.json"))).toBe(false);
  });

  test("a non-finite span is refused", () => {
    const library = fs.mkdtempSync(path.join(os.tmpdir(), "catalog-"));
    const result = python(path.join(MEDIA, "trove-broll-ingest/scripts/catalog.py"), [
      "--library", library, "--file", "select.mp4", "--source", "raw.mp4",
      "--start", "nan", "--end", "1", "--category", "detail", "--description", "a held shot",
      "--transfer", "rec709",
    ]);
    expect(result.status).not.toBe(0);
    expect(fs.existsSync(path.join(library, "catalog.json"))).toBe(false);
  });

  test("the same select spelled with a ./ prefix is still a duplicate", () => {
    const library = fs.mkdtempSync(path.join(os.tmpdir(), "catalog-"));
    const add = (file: string) => python(path.join(MEDIA, "trove-broll-ingest/scripts/catalog.py"), [
      "--library", library, "--file", file, "--source", "raw.mp4",
      "--start", "0", "--end", "1", "--category", "detail", "--description", "a held shot",
      "--transfer", "rec709",
    ]);
    expect(add("selects/a.mp4").status).toBe(0);
    const again = add("./selects/../selects/a.mp4");
    expect(again.status).not.toBe(0);
    expect(again.stderr).toContain("already catalogued");
    const catalog = JSON.parse(fs.readFileSync(path.join(library, "catalog.json"), "utf8"));
    expect(catalog.selects).toHaveLength(1);
  });
});

describe("edit plan", () => {
  const lint = (plan: unknown, extra: string[] = []) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "plan-"));
    const file = path.join(directory, "plan.json");
    fs.writeFileSync(file, JSON.stringify(plan));
    return python(path.join(MEDIA, "trove-video-edit/scripts/lint_plan.py"), [
      file, "--duration", "10", "--assets", directory, ...extra,
    ]);
  };

  test("a caption with no text fails before it can render blank", () => {
    const result = lint({
      source: "talk.mp4", mode: "intro",
      beats: [{ kind: "caption", start: 1, end: 2, anchor: "the point", reason: "names the claim" }],
    });
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("needs text");
  });

  test("a negative start and a missing source each fail", () => {
    const result = lint({
      source: "", mode: "intro",
      beats: [{ kind: "caption", start: -1, end: 2, anchor: "the point", reason: "names the claim", text: "The point" }],
    });
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("before the source");
    expect(result.stdout).toContain("source");
  });

  test("a beat kind the renderer does not know fails", () => {
    const result = lint({
      source: "talk.mp4", mode: "intro",
      beats: [{ kind: "lower-third", start: 1, end: 2, anchor: "the point", reason: "names the claim", text: "The point" }],
    });
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("not a beat kind");
  });

  test("two beats that share a rendered frame fail", () => {
    // The plan schema has no fps; the frame rate belongs to the composition.
    const result = lint({
      source: "talk.mp4", mode: "intro",
      beats: [
        { kind: "caption", start: 0.02, end: 1.04, anchor: "first", reason: "opens the claim", text: "First" },
        { kind: "caption", start: 1.04, end: 2, anchor: "second", reason: "lands the claim", text: "Second" },
      ],
    }, ["--fps", "30"]);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("shares a frame");
  });

  test("a frame rate that is not positive is refused", () => {
    const result = lint({ source: "talk.mp4", mode: "intro", beats: [] }, ["--fps", "0"]);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("--fps must be a positive number");
  });
});
