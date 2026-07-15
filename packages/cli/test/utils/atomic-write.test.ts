import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { writeFileAtomic } from "../../src/utils/atomic-write.js";

describe("writeFileAtomic", () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-atomic-"));
  });
  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("writes new content", () => {
    const f = path.join(dir, "a.json");
    writeFileAtomic(f, '{"x":1}');
    expect(fs.readFileSync(f, "utf-8")).toBe('{"x":1}');
  });

  it("overwrites and leaves no temp file behind", () => {
    const f = path.join(dir, "a.json");
    writeFileAtomic(f, "old");
    writeFileAtomic(f, "new");
    expect(fs.readFileSync(f, "utf-8")).toBe("new");
    expect(fs.readdirSync(dir)).toEqual(["a.json"]);
  });

  it("preserves the original file when the write fails", () => {
    const f = path.join(dir, "keep.json");
    writeFileAtomic(f, "original");

    // chmod-based unwritable dirs are unreliable under root (e.g. Docker as
    // root ignores directory write bits). Simulate rename failure instead.
    const renameSpy = vi.spyOn(fs, "renameSync").mockImplementation(() => {
      throw new Error("EACCES: simulated rename failure");
    });
    try {
      expect(() => writeFileAtomic(f, "second")).toThrow(/EACCES|simulated rename/);
      expect(fs.readFileSync(f, "utf-8")).toBe("original");
      // temp file cleaned up on best-effort path
      expect(fs.readdirSync(dir)).toEqual(["keep.json"]);
    } finally {
      renameSpy.mockRestore();
    }
  });
});
