/**
 * Regression tests for the active-task pointer containment fix
 * (port of upstream #536 / commit 7677aa22).
 *
 * `task.py start .trellis/tasks/../../../elsewhere` used to succeed: it
 * rewrote the external directory's task.json to in_progress, stored the ref
 * verbatim in `.trellis/.runtime/sessions/`, and every later turn fed that
 * directory's prd.md into the model. resolve_task_dir /
 * paths.resolve_task_ref / active_task.resolve_task_ref must now return None
 * for anything resolving outside the repo root (including symlinked task
 * directories pointing outside), and `start` must refuse with "Task not
 * found" without writing any session pointer.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TEMPLATE_SCRIPTS = path.resolve(
  __dirname,
  "../../src/templates/trellis/scripts",
);

function hasPython(): boolean {
  try {
    execFileSync("python3", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function runPy(repo: string, args: string[]): { status: number; stdout: string; stderr: string } {
  const r = spawnSync("python3", [path.join(repo, ".trellis", "scripts", "task.py"), ...args], {
    cwd: repo,
    encoding: "utf-8",
    env: { ...process.env, TRELLIS_CONTEXT_ID: "containment-test-session" },
  });
  return {
    status: r.status ?? -1,
    stdout: r.stdout ?? "",
    stderr: r.stderr ?? "",
  };
}

function setupRepo(tmp: string): string {
  fs.mkdirSync(tmp, { recursive: true });
  const scriptsDest = path.join(tmp, ".trellis", "scripts");
  fs.mkdirSync(scriptsDest, { recursive: true });
  fs.cpSync(TEMPLATE_SCRIPTS, scriptsDest, { recursive: true });

  // A legitimate in-repo task.
  const dir = path.join(tmp, ".trellis", "tasks", "08-21-real-task");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "prd.md"), "# real\n");
  fs.writeFileSync(
    path.join(dir, "task.json"),
    JSON.stringify({ id: "real", title: "real", status: "planning" }),
  );
  return tmp;
}

function makeOutsideVictim(tmp: string): string {
  const victim = path.join(os.tmpdir(), `trellis-containment-victim-${path.basename(tmp)}`);
  fs.mkdirSync(victim, { recursive: true });
  fs.writeFileSync(
    path.join(victim, "task.json"),
    JSON.stringify({ id: "victim", title: "victim", status: "planning" }),
  );
  fs.writeFileSync(path.join(victim, "prd.md"), "# victim prd — must not be activated\n");
  return victim;
}

function sessionsDir(repo: string): string {
  return path.join(repo, ".trellis", ".runtime", "sessions");
}

describe("active-task pointer containment (#536)", () => {
  let repo = "";
  let victim = "";

  beforeEach(() => {
    if (!hasPython()) return;
    repo = setupRepo(fs.mkdtempSync(path.join(os.tmpdir(), "trellis-containment-")));
    victim = makeOutsideVictim(repo);
  });

  afterEach(() => {
    if (!hasPython()) return;
    fs.rmSync(repo, { recursive: true, force: true });
    fs.rmSync(victim, { recursive: true, force: true });
  });

  it("refuses to start a task via .. traversal outside the repo", () => {
    if (!hasPython()) return;
    const escapeRef = `.trellis/tasks/${path.relative(path.join(repo, ".trellis", "tasks"), victim)}`;
    // Build a ref that lexicalizes inside but resolves outside:
    // .trellis/tasks/<something>/../../../../<victim>
    const deepEscape = `.trellis/tasks/08-21-real-task/../../../${path.basename(victim)}`;

    for (const ref of [escapeRef.replace(/\\/g, "/") + "/../.." + `/../../${path.basename(victim)}`, deepEscape]) {
      const r = runPy(repo, ["start", ref]);
      expect(r.status).toBe(1);
      expect(r.stdout).toContain("Task not found");
      // The victim's status must be untouched.
      const data = JSON.parse(fs.readFileSync(path.join(victim, "task.json"), "utf-8"));
      expect(data.status).toBe("planning");
      // No session pointer may have been written.
      if (fs.existsSync(sessionsDir(repo))) {
        const pointers: string[] = [];
        for (const f of fs.readdirSync(sessionsDir(repo))) {
          pointers.push(fs.readFileSync(path.join(sessionsDir(repo), f), "utf-8"));
        }
        for (const p of pointers) {
          expect(p).not.toContain(path.basename(victim));
        }
      }
    }
  });

  it("refuses an absolute path outside the repo", () => {
    if (!hasPython()) return;
    const r = runPy(repo, ["start", victim]);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain("Task not found");
    const data = JSON.parse(fs.readFileSync(path.join(victim, "task.json"), "utf-8"));
    expect(data.status).toBe("planning");
  });

  it("refuses a symlinked task directory pointing outside the repo", () => {
    if (!hasPython()) return;
    const linkDir = path.join(repo, ".trellis", "tasks", "08-21-link-task");
    fs.symlinkSync(victim, linkDir, "dir");

    const r = runPy(repo, ["start", ".trellis/tasks/08-21-link-task"]);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain("Task not found");
    const data = JSON.parse(fs.readFileSync(path.join(victim, "task.json"), "utf-8"));
    expect(data.status).toBe("planning");
  });

  it("still starts a legitimate in-repo task and stores a clean relative ref", () => {
    if (!hasPython()) return;
    const r = runPy(repo, ["start", ".trellis/tasks/08-21-real-task"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("Current task set to");

    const data = JSON.parse(fs.readFileSync(path.join(repo, ".trellis", "tasks", "08-21-real-task", "task.json"), "utf-8"));
    expect(data.status).toBe("in_progress");

    if (fs.existsSync(sessionsDir(repo))) {
      for (const f of fs.readdirSync(sessionsDir(repo))) {
        const content = fs.readFileSync(path.join(sessionsDir(repo), f), "utf-8");
        expect(content).toContain(".trellis/tasks/08-21-real-task");
        expect(content).not.toContain("..");
      }
    }
  });

  it("set-branch refuses a ref that escapes the repo", () => {
    if (!hasPython()) return;
    const escape = path.join(repo, ".trellis", "tasks", "..", "..", "..", path.basename(os.tmpdir()), path.basename(victim));
    const r = runPy(repo, ["set-branch", escape, "some-branch"]);
    expect(r.status).toBe(1);
    expect(r.stdout + r.stderr).toContain("Task not found");
    // External victim untouched.
    const data = JSON.parse(fs.readFileSync(path.join(victim, "task.json"), "utf-8"));
    expect(data.branch).toBeUndefined();
  });
});
