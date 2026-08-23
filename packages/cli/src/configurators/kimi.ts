/**
 * Kimi Code configurator.
 *
 * Kimi is a class-2 pull-based platform. Shared workflow/bundled skills land
 * in `.agents/skills/`; Kimi entry skills and project agents stay under
 * `.kimi-code/`.
 */

import path from "node:path";
import { AI_TOOLS } from "../types/ai-tools.js";
import { getAllAgents } from "../templates/kimi/index.js";
import {
  applyPullBasedPreludeMarkdown,
  collectSkillTemplates,
  resolveAllAsSkills,
  resolveBundledSkills,
  resolveSkillsNeutral,
  writeAgents,
  writeSkills,
  type AgentContent,
} from "./shared.js";

const KIMI_COMMAND_SKILL_NAMES = new Set([
  "trellis-start",
  "trellis-continue",
  "trellis-finish-work",
]);

function resolveKimiCommandSkills(): ReturnType<typeof resolveAllAsSkills> {
  const ctx = AI_TOOLS.kimi.templateContext;
  return resolveAllAsSkills(ctx).filter((skill) =>
    KIMI_COMMAND_SKILL_NAMES.has(skill.name),
  );
}

function resolveKimiAgentSkills(): AgentContent[] {
  return applyPullBasedPreludeMarkdown(getAllAgents());
}

export function collectKimiTemplates(): Map<string, string> {
  const ctx = AI_TOOLS.kimi.templateContext;
  const files = new Map<string, string>();

  for (const [filePath, content] of collectSkillTemplates(
    ".agents/skills",
    resolveSkillsNeutral(ctx),
    resolveBundledSkills(ctx),
  )) {
    files.set(filePath, content);
  }

  const agentPrompts = resolveKimiAgentSkills();
  for (const [filePath, content] of collectSkillTemplates(".kimi-code/skills", [
    ...resolveKimiCommandSkills(),
    ...agentPrompts,
  ])) {
    files.set(filePath, content);
  }

  for (const agent of agentPrompts) {
    files.set(`.kimi-code/agents/${agent.name}.md`, agent.content);
  }

  return files;
}

export async function configureKimi(cwd: string): Promise<void> {
  const config = AI_TOOLS.kimi;
  const ctx = config.templateContext;
  const agentPrompts = resolveKimiAgentSkills();

  await writeSkills(
    path.join(cwd, ".agents", "skills"),
    resolveSkillsNeutral(ctx),
    resolveBundledSkills(ctx),
  );
  await writeSkills(path.join(cwd, config.configDir, "skills"), [
    ...resolveKimiCommandSkills(),
    ...agentPrompts,
  ]);
  await writeAgents(path.join(cwd, config.configDir, "agents"), agentPrompts);
}
