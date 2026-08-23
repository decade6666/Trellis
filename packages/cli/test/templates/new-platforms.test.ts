import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  configurePlatform,
  collectPlatformTemplates,
  PLATFORM_IDS,
} from "../../src/configurators/index.js";
import { collectDshTemplates } from "../../src/configurators/dsh.js";
import { collectKimiTemplates } from "../../src/configurators/kimi.js";
import { collectPiTemplates } from "../../src/configurators/pi.js";
import { setWriteMode } from "../../src/utils/file-writer.js";

const platforms = ["kimi", "snow", "dsh"] as const;

describe("Kimi, Snow, and dsh platform integration", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-new-platform-"));
    setWriteMode("force");
  });

  afterEach(() => {
    setWriteMode("ask");
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("registers all three platforms and resolves their init flags", () => {
    for (const platform of platforms) {
      expect(PLATFORM_IDS).toContain(platform);
      expect(collectPlatformTemplates(platform)).toBeInstanceOf(Map);
    }
  });

  it("configures Kimi shared skills, private skills, and project agents", async () => {
    await configurePlatform("kimi", tmpDir);

    expect(
      fs.existsSync(path.join(tmpDir, ".agents", "skills", "trellis-check", "SKILL.md")),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(tmpDir, ".kimi-code", "skills", "trellis-start", "SKILL.md")),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(tmpDir, ".kimi-code", "agents", "trellis-implement.md")),
    ).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, ".kimi-code", "hooks"))).toBe(false);

    const kimi = collectKimiTemplates();
    const pi = collectPiTemplates();
    expect(kimi.get(".agents/skills/trellis-meta/SKILL.md")).toBe(
      pi.get(".agents/skills/trellis-meta/SKILL.md"),
    );
  });

  it("configures Snow as a hook-backed class-1 platform", async () => {
    await configurePlatform("snow", tmpDir);

    expect(
      fs.existsSync(path.join(tmpDir, ".snow", "skills", "trellis-check", "SKILL.md")),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(tmpDir, ".snow", "skills", "trellis-start", "SKILL.md")),
    ).toBe(false);
    expect(
      fs.existsSync(path.join(tmpDir, ".snow", "commands", "trellis-continue.json")),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(tmpDir, ".snow", "commands", "trellis-start.json")),
    ).toBe(false);
    expect(
      fs.existsSync(path.join(tmpDir, ".snow", "hooks", "onSessionStart.json")),
    ).toBe(true);
    expect(
      fs.readFileSync(
        path.join(tmpDir, ".snow", "hooks", "onSessionStart.json"),
        "utf-8",
      ),
    ).toContain("python3 -X utf8");
    expect(
      fs.existsSync(path.join(tmpDir, ".snow", "agents", "trellis-implement.md")),
    ).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, ".snow", "SNOW.md"))).toBe(true);

    const templates = collectPlatformTemplates("snow");
    expect(templates?.has(".snow/hooks/write-trellis-context.py")).toBe(true);
    expect(templates?.has(".snow/commands/trellis-start.json")).toBe(false);
  });

  it("configures dsh private entry skills and shared skills", async () => {
    await configurePlatform("dsh", tmpDir);

    expect(
      fs.existsSync(path.join(tmpDir, ".dsh", "skills", "trellis-start", "SKILL.md")),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(tmpDir, ".agents", "skills", "trellis-before-dev", "SKILL.md")),
    ).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, ".dsh", "DSH.md"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, ".dsh", "hooks"))).toBe(false);

    const dsh = collectDshTemplates();
    expect(dsh.get(".dsh/skills/trellis-start/SKILL.md")).toContain(
      "--platform dsh",
    );
    expect(dsh.has(".agents/skills/trellis-start/SKILL.md")).toBe(false);
  });
});
