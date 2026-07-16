import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

// The bundled wrapper is plain ESM shipped in `bin/`; import its pure helpers.
import {
  buildBackendCommand,
  parseArgs,
} from "../../bin/codeagent-wrapper.mjs";

const BIN_ENV_KEYS = [
  "TRELLIS_AGY_BIN",
  "AGY_BIN",
  "TRELLIS_CODEX_BIN",
  "TRELLIS_CLAUDE_BIN",
  "TRELLIS_GROK_BIN",
  "TRELLIS_KIMI_BIN",
];

describe("codeagent-wrapper parseArgs", () => {
  it("defaults to agy backend, process cwd, no model", () => {
    const opts = parseArgs([]);
    expect(opts.backend).toBe("agy");
    expect(opts.stdinPrompt).toBe(false);
    expect(opts.model).toBe("");
  });

  it("parses backend, model, stdin flag and trailing cwd", () => {
    const opts = parseArgs([
      "--progress",
      "--lite",
      "--backend",
      "codex",
      "--model",
      "gpt-5.4",
      "-",
      "/work/dir",
    ]);
    expect(opts.backend).toBe("codex");
    expect(opts.model).toBe("gpt-5.4");
    expect(opts.stdinPrompt).toBe(true);
    expect(opts.cwd).toBe("/work/dir");
  });
});

describe("codeagent-wrapper buildBackendCommand", () => {
  const original: Record<string, string | undefined> = {};
  beforeAll(() => {
    // Isolate from ambient bin overrides so defaults are asserted deterministically.
    for (const key of BIN_ENV_KEYS) {
      original[key] = process.env[key];
      Reflect.deleteProperty(process.env, key);
    }
  });
  afterEach(() => {
    // Reset per-test overrides back to the cleared baseline.
    for (const key of BIN_ENV_KEYS) Reflect.deleteProperty(process.env, key);
  });
  afterAll(() => {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) Reflect.deleteProperty(process.env, key);
      else process.env[key] = value;
    }
  });

  const base = { cwd: "/repo", prompt: "hello" };

  it("returns null for an unknown backend", () => {
    expect(buildBackendCommand("bogus", base)).toBeNull();
  });

  it("builds agy with prompt as the last arg (passthrough)", () => {
    const cmd = buildBackendCommand("agy", base);
    expect(cmd).not.toBeNull();
    expect(cmd?.bin).toBe("agy");
    expect(cmd?.args).toEqual(["--add-dir", "/repo", "-p", "hello"]);
    expect(cmd?.args.at(-1)).toBe("hello");
    expect(cmd?.outputMode).toBe("passthrough");
    expect(cmd?.spawnCwd).toBeUndefined();
  });

  it("builds codex with -C, -o tmpFile and file output mode", () => {
    const cmd = buildBackendCommand("codex", { ...base, tmpFile: "/tmp/x.txt" });
    expect(cmd?.bin).toBe("codex");
    expect(cmd?.args[0]).toBe("exec");
    expect(cmd?.args).toContain("--skip-git-repo-check");
    expect(cmd?.args).toContain("--dangerously-bypass-approvals-and-sandbox");
    expect(cmd?.args).toEqual(
      expect.arrayContaining(["-C", "/repo", "-o", "/tmp/x.txt"]),
    );
    expect(cmd?.args.at(-1)).toBe("hello");
    expect(cmd?.outputMode).toBe("file");
    expect(cmd?.outFile).toBe("/tmp/x.txt");
  });

  it("builds claude headless print", () => {
    const cmd = buildBackendCommand("claude", base);
    expect(cmd?.bin).toBe("claude");
    expect(cmd?.args).toEqual(["-p", "hello", "--add-dir", "/repo"]);
    expect(cmd?.outputMode).toBe("passthrough");
  });

  it("builds grok headless with --cwd", () => {
    const cmd = buildBackendCommand("grok", base);
    expect(cmd?.bin).toBe("grok");
    expect(cmd?.args).toEqual([
      "--no-auto-update",
      "-p",
      "hello",
      "--cwd",
      "/repo",
    ]);
  });

  it("builds kimi and sets spawnCwd (kimi has no --cwd flag)", () => {
    const cmd = buildBackendCommand("kimi", base);
    expect(cmd?.bin).toBe("kimi");
    expect(cmd?.args).toEqual(["-p", "hello", "--add-dir", "/repo"]);
    expect(cmd?.spawnCwd).toBe("/repo");
  });

  it("threads the model flag per backend", () => {
    const withModel = { ...base, model: "m1" };
    expect(buildBackendCommand("agy", withModel)?.args).toEqual(
      expect.arrayContaining(["--model", "m1"]),
    );
    expect(buildBackendCommand("codex", { ...withModel, tmpFile: "/t" })?.args).toEqual(
      expect.arrayContaining(["-m", "m1"]),
    );
    expect(buildBackendCommand("claude", withModel)?.args).toEqual(
      expect.arrayContaining(["--model", "m1"]),
    );
    expect(buildBackendCommand("grok", withModel)?.args).toEqual(
      expect.arrayContaining(["-m", "m1"]),
    );
    expect(buildBackendCommand("kimi", withModel)?.args).toEqual(
      expect.arrayContaining(["-m", "m1"]),
    );
  });

  it("honors per-backend binary env overrides", () => {
    process.env.TRELLIS_CODEX_BIN = "/opt/codex";
    process.env.TRELLIS_KIMI_BIN = "/opt/kimi";
    process.env.TRELLIS_AGY_BIN = "/opt/agy";
    expect(buildBackendCommand("codex", { ...base, tmpFile: "/t" })?.bin).toBe(
      "/opt/codex",
    );
    expect(buildBackendCommand("kimi", base)?.bin).toBe("/opt/kimi");
    expect(buildBackendCommand("agy", base)?.bin).toBe("/opt/agy");
  });
});
