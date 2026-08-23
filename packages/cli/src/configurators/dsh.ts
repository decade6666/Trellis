/**
 * DeepSeek Harness (dsh) configurator.
 *
 * dsh is a class-2 pull-based skills host. Shared workflow/bundled skills land
 * in `.agents/skills/`; user-invocable entry skills and the operator guide
 * stay under `.dsh/`.
 */

import path from "node:path";
import { AI_TOOLS } from "../types/ai-tools.js";
import { getDshGuide } from "../templates/dsh/index.js";
import { writeFile } from "../utils/file-writer.js";
import {
  collectSkillTemplates,
  resolveAllAsSkills,
  resolveBundledSkills,
  resolveSkillsNeutral,
  writeSkills,
} from "./shared.js";

const DSH_COMMAND_SKILL_NAMES = new Set([
  "trellis-start",
  "trellis-continue",
  "trellis-finish-work",
]);

function resolveDshCommandSkills(): ReturnType<typeof resolveAllAsSkills> {
  const ctx = AI_TOOLS.dsh.templateContext;
  return resolveAllAsSkills(ctx).filter((skill) =>
    DSH_COMMAND_SKILL_NAMES.has(skill.name),
  );
}

export function collectDshTemplates(): Map<string, string> {
  const ctx = AI_TOOLS.dsh.templateContext;
  const files = new Map<string, string>();

  for (const [filePath, content] of collectSkillTemplates(
    ".agents/skills",
    resolveSkillsNeutral(ctx),
    resolveBundledSkills(ctx),
  )) {
    files.set(filePath, content);
  }

  for (const [filePath, content] of collectSkillTemplates(
    ".dsh/skills",
    resolveDshCommandSkills(),
  )) {
    files.set(filePath, content);
  }

  files.set(".dsh/DSH.md", getDshGuide());
  return files;
}

export async function configureDsh(cwd: string): Promise<void> {
  const ctx = AI_TOOLS.dsh.templateContext;
  await writeSkills(
    path.join(cwd, ".agents", "skills"),
    resolveSkillsNeutral(ctx),
    resolveBundledSkills(ctx),
  );
  await writeSkills(
    path.join(cwd, ".dsh", "skills"),
    resolveDshCommandSkills(),
  );
  await writeFile(path.join(cwd, ".dsh", "DSH.md"), getDshGuide());
}
