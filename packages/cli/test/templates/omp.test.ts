import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  getAllAgents,
  getExtensionTemplate,
} from "../../src/templates/omp/index.js";
import { collectOmpTemplates } from "../../src/configurators/omp.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const templateDir = path.resolve(__dirname, "../../src/templates/omp");

describe("omp templates", () => {
  it("provides the three Trellis sub-agent definitions", () => {
    const agents = getAllAgents();
    expect(agents.map((agent) => agent.name).sort()).toEqual([
      "trellis-check",
      "trellis-implement",
      "trellis-research",
    ]);
  });

  it("each agent has non-empty content and name", () => {
    for (const agent of getAllAgents()) {
      expect(agent.name.length).toBeGreaterThan(0);
      expect(agent.content.length).toBeGreaterThan(0);
    }
  });

  it("getExtensionTemplate returns a non-empty string", () => {
    const extension = getExtensionTemplate();
    expect(extension.length).toBeGreaterThan(0);
  });

  it("extension template contains key markers for OMP integration", () => {
    const extension = getExtensionTemplate();
    expect(extension).toContain("before_agent_start");
    expect(extension).toContain("input");
    expect(extension).toContain("session_start");
    expect(extension).toContain("ExtensionAPI");
  });

  it("extension template avoids known runtime and context-safety regressions", () => {
    const extension = getExtensionTemplate();

    expect(extension).not.toContain("pi.setLabel(");
    expect(extension).not.toContain("process.env.TRELLIS_CONTEXT_ID =");
    expect(extension).toContain('buildContextKey("omp", "session", sessionId)');
    expect(extension).toContain("realpathSync");
    expect(extension).toContain("resolveProjectFile(projectRoot, file, trustedRoots)");
    expect(extension).toContain("readFileSync(targetPath");
    expect(extension).toContain("if (!key) return null;");
    expect(extension).toContain("return key;");
    expect(extension).toContain(`if (existsSync(candidate)) {
         sessionFilePath = candidate;
      } else {
         return { status: "no_task", taskDir: null, taskTitle: null };
      }
   } else {`);
    expect(extension).toContain(
      "No identity: use single-session fallback only when there is exactly one session file.",
    );
    expect(extension).not.toContain("currentContextKey");
  });

  it("extension isInsideRoot matches CLI isUnderRoot (no path.relative jail)", () => {
    // Templates cannot import the CLI package, so the containment predicate is
    // duplicated. Lock the source form to the filesystem-safety contract:
    //   real === root || real.startsWith(root + path.sep)
    // path.relative-based jails diverge when root is "/" (they accept every
    // absolute path under the filesystem root).
    const extension = getExtensionTemplate();
    expect(extension).toContain(
      "candidate === root || candidate.startsWith(root + sep)",
    );
    expect(extension).not.toMatch(
      /function isInsideRoot[\s\S]*?\brelative\s*\(/,
    );
    expect(extension).not.toContain('!rel.startsWith("../")');

    const match = extension.match(
      /function isInsideRoot\(root: string, candidate: string\): boolean \{\s*return ([^;]+);/,
    );
    expect(match).not.toBeNull();
    const expr = match?.[1]?.trim();
    expect(expr).toBe("candidate === root || candidate.startsWith(root + sep)");
    if (!expr) {
      throw new Error("isInsideRoot expression not extracted from OMP template");
    }

    // Evaluate the extracted expression so this is not only a string contract.
    const isInsideRoot = new Function(
      "root",
      "candidate",
      "sep",
      `return (${expr});`,
    ) as (root: string, candidate: string, sep: string) => boolean;
    const check = (root: string, candidate: string) =>
      isInsideRoot(root, candidate, path.sep);

    // Mirror CLI isUnderRoot(real, root) argument order via (root, candidate).
    expect(check("/work/ws", "/work/ws")).toBe(true);
    expect(check("/work/ws", "/work/ws/file.md")).toBe(true);
    expect(check("/work/ws", "/work/ws-evil/file.md")).toBe(false);
    expect(check("/work/ws", "/work/other/file.md")).toBe(false);
    // Filesystem root: startsWith("/" + sep) === startsWith("//"), so only
    // the exact root path matches — never every absolute path.
    expect(check("/", "/")).toBe(true);
    expect(check("/", "/etc/passwd")).toBe(false);
    expect(check("/", "/work/ws/file.md")).toBe(false);
  });

  it("extension template contains session context injection markers", () => {
    const extension = getExtensionTemplate();
    // R1: Session start rich injection via get_context.py
    expect(extension).toContain("buildSessionContext");
    expect(extension).toContain("trellis-session-context");
    expect(extension).toContain("get_context.py");
    expect(extension).toContain("session-context");
  });

  it("extension template contains sub-agent precision injection markers", () => {
    const extension = getExtensionTemplate();
    // R2: Sub-agent detection via PI_BLOCKED_AGENT
    expect(extension).toContain("PI_BLOCKED_AGENT");
    expect(extension).toContain("detectAgentType");
    expect(extension).toContain("trellis-implement");
    expect(extension).toContain("trellis-check");
    expect(extension).toContain("trellis-research");
    // Agent-type-specific jsonl selection
    expect(extension).toContain("implement.jsonl");
    expect(extension).toContain("check.jsonl");
  });

  it("no settings.json or Python hooks exist in the template directory", () => {
    // OMP is extension-backed: native provider auto-discovers .omp/ subdirs,
    // so no settings.json is needed and no Python hooks should be present.
    expect(fs.existsSync(path.join(templateDir, "settings.json"))).toBe(false);
    expect(fs.existsSync(path.join(templateDir, "hooks"))).toBe(false);

    // Agents must not reference Python hook scripts
    for (const agent of getAllAgents()) {
      expect(agent.content).not.toContain("inject-subagent-context.py");
    }
  });
});

describe("omp command frontmatter", () => {
  it("collectOmpTemplates produces commands with YAML frontmatter", () => {
    const templates = collectOmpTemplates();
    const continueCmd = templates.get(".omp/commands/trellis-continue.md");
    const finishCmd = templates.get(".omp/commands/trellis-finish-work.md");

    expect(continueCmd).toBeDefined();
    expect(finishCmd).toBeDefined();

    // Both must start with YAML frontmatter
    expect(continueCmd).toMatch(/^---\ndescription: .+\n---\n\n/);
    expect(finishCmd).toMatch(
      /^---\ndescription: .+\nargument-hint: .+\n---\n\n/,
    );

    // Neither should retain the H1 heading from the source template
    expect(continueCmd).not.toMatch(/^---[\s\S]*?---\n\n# /);
    expect(finishCmd).not.toMatch(/^---[\s\S]*?---\n\n# /);
  });

  it("collectOmpTemplates does not emit a start command", () => {
    const templates = collectOmpTemplates();
    expect(templates.has(".omp/commands/trellis-start.md")).toBe(false);
  });
});
