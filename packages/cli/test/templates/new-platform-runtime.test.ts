import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const python = process.env.PYTHON_CMD || "python3";
const scriptsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../src/templates/trellis/scripts",
);

function runPython(source: string, env?: NodeJS.ProcessEnv): string {
  return execFileSync(python, ["-c", source], {
    encoding: "utf-8",
    env: { ...process.env, ...env },
  }).trim();
}

describe("new platform runtime identity and CLI adapters", () => {
  it("prioritizes DSH_SESSION_ID before inherited host identities", () => {
    const result = runPython(
      [
        "import sys",
        `sys.path.insert(0, ${JSON.stringify(scriptsDir)})`,
        "from common.active_task import resolve_context_key",
        "print(resolve_context_key(None))",
      ].join("\n"),
      { DSH_SESSION_ID: "dsh-own", CODEX_THREAD_ID: "outer-codex" },
    );

    expect(result).toBe("dsh_dsh-own");
  });

  it("resolves Snow's native session identity when Snow is explicit", () => {
    const result = runPython(
      [
        "import sys",
        `sys.path.insert(0, ${JSON.stringify(scriptsDir)})`,
        "from common.active_task import resolve_context_key",
        "print(resolve_context_key(None, platform='snow'))",
      ].join("\n"),
      { SNOW_SESSION_ID: "snow-own" },
    );

    expect(result).toBe("snow_snow-own");
  });

  it("treats Snow's configured agent root as a JSONL sub-agent platform", () => {
    const project = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-snow-runtime-"));
    try {
      fs.mkdirSync(path.join(project, ".snow", "skills"), { recursive: true });
      const result = runPython(
        [
          "import sys",
          `sys.path.insert(0, ${JSON.stringify(scriptsDir)})`,
          "from common.task_store import _has_subagent_platform",
          "from pathlib import Path",
          `print(_has_subagent_platform(Path(${JSON.stringify(project)})))`,
        ].join("\n"),
      );
      expect(result).toBe("True");
    } finally {
      fs.rmSync(project, { recursive: true, force: true });
    }
  });
  it("maps Kimi commands and detects a Kimi project", () => {
    const project = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-kimi-runtime-"));
    try {
      fs.mkdirSync(path.join(project, ".kimi-code"));
      const result = runPython(
        [
          "import json, sys",
          `sys.path.insert(0, ${JSON.stringify(scriptsDir)})`,
          "from common.cli_adapter import CLIAdapter, detect_platform",
          "from pathlib import Path",
          "adapter = CLIAdapter('kimi')",
          "print(json.dumps({",
          "  'config': adapter.config_dir_name,",
          "  'command': adapter.get_trellis_command_path('start'),",
          "  'run': adapter.build_run_command('coder', 'prompt'),",
          "  'resume': adapter.build_resume_command('session-1'),",
          `  'detected': detect_platform(Path(${JSON.stringify(project)})),`,
          "}))",
        ].join("\n"),
      );

      expect(JSON.parse(result)).toEqual({
        config: ".kimi-code",
        command: ".kimi-code/skills/trellis-start/SKILL.md",
        run: ["kimi", "-p", "prompt", "--yolo"],
        resume: ["kimi", "--session", "session-1"],
        detected: "kimi",
      });
    } finally {
      fs.rmSync(project, { recursive: true, force: true });
    }
  });
});
