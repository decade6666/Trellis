/**
 * Snow CLI configurator.
 *
 * Snow is a class-1 hook-backed platform. Session/user/sub-agent hooks inject
 * context, so `trellis-start` is intentionally omitted from its skills and
 * prompt commands.
 */

import path from "node:path";
import { AI_TOOLS } from "../types/ai-tools.js";
import { ensureDir, writeFile } from "../utils/file-writer.js";
import {
  getAllAgents,
  getAllHooks,
  getSnowGuide,
} from "../templates/snow/index.js";
import {
  collectSkillTemplates,
  resolveAllAsSkills,
  resolveBundledSkills,
  resolveCommands,
  replacePythonCommandLiterals,
  writeAgents,
  writeSkills,
} from "./shared.js";

function buildSnowCommandJson(name: string, content: string): string {
  const description =
    name === "continue"
      ? "Resume the current Trellis task at the right workflow phase."
      : name === "finish-work"
        ? "Wrap up the current Trellis session: archive tasks and record journal."
        : `Trellis: ${name}`;

  return (
    JSON.stringify(
      {
        type: "prompt",
        description,
        command: content,
        location: "project",
      },
      null,
      2,
    ) + "\n"
  );
}

function collectSnowStaticFiles(): Map<string, string> {
  const files = new Map<string, string>();
  for (const hook of getAllHooks()) {
    files.set(`.snow/hooks/${hook.targetPath}`, hook.content);
  }
  files.set(".snow/SNOW.md", getSnowGuide());
  return files;
}

export function collectSnowTemplates(): Map<string, string> {
  const config = AI_TOOLS.snow;
  const ctx = config.templateContext;
  const files = new Map<string, string>();

  for (const [filePath, content] of collectSkillTemplates(
    ".snow/skills",
    resolveAllAsSkills(ctx),
    resolveBundledSkills(ctx),
  )) {
    files.set(filePath, content);
  }

  for (const cmd of resolveCommands(ctx)) {
    files.set(
      `.snow/commands/trellis-${cmd.name}.json`,
      buildSnowCommandJson(cmd.name, replacePythonCommandLiterals(cmd.content)),
    );
  }

  for (const agent of getAllAgents()) {
    files.set(`.snow/agents/${agent.name}.md`, agent.content);
  }

  for (const [filePath, content] of collectSnowStaticFiles()) {
    files.set(filePath, content);
  }

  return files;
}

export async function configureSnow(cwd: string): Promise<void> {
  const config = AI_TOOLS.snow;
  const ctx = config.templateContext;

  await writeSkills(
    path.join(cwd, ".snow", "skills"),
    resolveAllAsSkills(ctx),
    resolveBundledSkills(ctx),
  );

  const commandsDir = path.join(cwd, ".snow", "commands");
  ensureDir(commandsDir);
  for (const cmd of resolveCommands(ctx)) {
    await writeFile(
      path.join(commandsDir, `trellis-${cmd.name}.json`),
      buildSnowCommandJson(cmd.name, replacePythonCommandLiterals(cmd.content)),
    );
  }

  await writeAgents(path.join(cwd, ".snow", "agents"), getAllAgents());

  const hooksDir = path.join(cwd, ".snow", "hooks");
  ensureDir(hooksDir);
  for (const hook of getAllHooks()) {
    await writeFile(
      path.join(hooksDir, hook.targetPath),
      replacePythonCommandLiterals(hook.content),
    );
  }

  await writeFile(path.join(cwd, ".snow", "SNOW.md"), getSnowGuide());
}
