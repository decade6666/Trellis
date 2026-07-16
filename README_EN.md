<p align="center">
<picture>
<source srcset="assets/trellis.png" media="(prefers-color-scheme: dark)">
<source srcset="assets/trellis.png" media="(prefers-color-scheme: light)">
<img src="assets/trellis.png" alt="Trellis Logo" width="500" style="image-rendering: -webkit-optimize-contrast; image-rendering: crisp-edges;">
</picture>
</p>

<p align="center">
<strong>An out-of-the-box engineering framework for AI coding.</strong><br/>
<sub>AI writes code fast, but every session it starts from scratch — no memory of your project, your conventions, or your team's requirements. Trellis persists specs, tasks, and memory into your repo, so any coding agent works to your engineering standards.</sub>
</p>

<p align="center">
<sub>This repo is a fork of <a href="https://github.com/mindfold-ai/Trellis">mindfold-ai/Trellis</a> (<code>@decade666/trellis</code>), with optional multi-model collab and related changes.</sub>
</p>

<p align="center">
<a href="./README.md">简体中文</a> ·
<strong>English</strong> ·
<a href="https://docs.trytrellis.app/">Docs (upstream)</a> ·
<a href="https://github.com/decade6666/Trellis">Source</a>
</p>

<p align="center">
<a href="https://www.npmjs.com/package/@decade666/trellis"><img src="https://img.shields.io/npm/v/@decade666/trellis.svg?style=flat-square&color=2563eb" alt="npm version" /></a>
<a href="https://www.npmjs.com/package/@decade666/trellis"><img src="https://img.shields.io/npm/dw/@decade666/trellis?style=flat-square&color=cb3837&label=downloads" alt="npm downloads" /></a>
<a href="https://github.com/decade6666/Trellis/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0-16a34a.svg?style=flat-square" alt="license" /></a>
<a href="https://github.com/decade6666/Trellis/stargazers"><img src="https://img.shields.io/github/stars/decade6666/Trellis?style=flat-square&color=eab308" alt="stars" /></a>
<a href="https://github.com/decade6666/Trellis/issues"><img src="https://img.shields.io/github/issues/decade6666/Trellis?style=flat-square&color=e67e22" alt="open issues" /></a>
<a href="https://docs.trytrellis.app/"><img src="https://img.shields.io/badge/docs-trytrellis.app-0f766e?style=flat-square" alt="docs" /></a>
</p>

<p align="center">
<img src="assets/trellis-demo.gif" alt="Trellis workflow demo" width="100%">
</p>

## Why Trellis?

| Capability | What it changes |
| --- | --- |
| **Auto-injected specs** | Write conventions once in `.trellis/spec/`, then let Trellis inject the relevant context into each session instead of repeating yourself. |
| **Task-centered workflow** | Keep PRDs, implementation context, review context, and task status in `.trellis/tasks/` so AI work stays structured. |
| **Project memory** | Journals in `.trellis/workspace/` preserve what happened last time, so each new session starts with real context. |
| **Team-shared standards** | Specs live in the repo, so one person's hard-won workflow or rule can benefit the whole team. |
| **Multi-platform setup** | Bring the same Trellis structure to 17 AI coding platforms instead of rebuilding your workflow per tool. |
| **Optional multi-model collab** | Opt-in Codex / second-model parallel analysis, implement, and cross-review on Trellis channel. Off by default — zero behavior change. |

## Prerequisites:

- **Node.js** >= 18
- **Python** >= 3.9

## Install & Quick Start

> **Package names (scheme D)**  
> - CLI: `@decade666/trellis`  
> - SDK: `@decade666/trellis-core`  
> - **Not** upstream `@mindfoldhq/trellis`. `npx @mindfoldhq/trellis` installs the official package and **does not** include this fork’s collab changes.

### Install from npm (recommended)

```bash
# Global install
npm install -g @decade666/trellis@latest

# Or run once without a global install
npx @decade666/trellis@latest init -u your-name

# Initialize in an app repo
cd /path/to/your-app
trellis init -u your-name

# Or only the platforms you use
trellis init --cursor --opencode --codex -u your-name
```

Upgrade:

```bash
npm install -g @decade666/trellis@latest
trellis update   # refresh templates in existing projects
```

### Install from source (dev / before publish)

```bash
git clone https://github.com/decade6666/Trellis.git
cd Trellis
pnpm install
pnpm build
npm link -C packages/cli   # links global `trellis` / `tl`

cd /path/to/your-app
trellis init -u your-name
```

Upstream usage guides still apply: [Quick Start](https://docs.trytrellis.app/start/install-and-first-task) · [Supported Platforms](https://docs.trytrellis.app/advanced/multi-platform)

## How to Use

The workflow is simple:

1. **Describe what you want** in natural language.
2. **Brainstorm** with the AI one question at a time until the PRD is clear, then implementation begins.
3. **Let it run** — the AI calls Trellis Implement and auto-checks the result against specs, lint, type-check, and tests.
4. **Type `/trellis:finish-work`** when the work is done or the session context fills up. Trellis archives the task and updates journals.

## How It Works

Trellis runs a 4-phase loop with auto-invoked skills and sub-agents:

1. **Plan** — `trellis-brainstorm` walks through requirements one question at a time and writes `prd.md`. Research-heavy items go to a `trellis-research` sub-agent. The result is curated specs + research files referenced from `implement.jsonl` / `check.jsonl`.
2. **Implement** — a `trellis-implement` sub-agent writes code from the PRD with the curated context auto-injected, no git commit.
3. **Verify** — a `trellis-check` sub-agent reviews the diff against specs and runs lint, type-check, and tests, self-fixing where it can.
4. **Finish** — a final check runs, then `trellis-update-spec` promotes new learnings back into `.trellis/spec/` so the next session starts smarter.

## Optional: Multi-model collaboration (default OFF)

Without leaving the Trellis workflow, you can enable `collab` in `.trellis/config.yaml` to insert multi-model collaboration where it helps:

| Flag | Effect |
| --- | --- |
| `collab.enabled` | Master switch; when false, behavior matches stock Trellis |
| `dual_model_analysis` | Plan: after user confirmation on complex tasks, Codex + second model analyze in parallel (Pattern G) |
| `codex_led_implement` | Implement: prefer a Codex channel worker for implementation |
| `cross_review` | Verify: critical diffs can use Claude + Codex + second model three-way review (Pattern H) |
| `codex_led_spec_update` | Finish: only spec updates may go to Codex; **git commit stays on the main session** |

```yaml
# .trellis/config.yaml (example; commented / off by default)
collab:
  enabled: true
  dual_model_analysis: true
  codex_led_implement: true
  cross_review: true
  codex_led_spec_update: true
  second_model:
    provider: antigravity
    # Default: Trellis-bundled codeagent-wrapper --backend agy
    # On PATH after `npm install -g @decade666/trellis`; also still at package
    # bin/codeagent-wrapper.mjs next to the trellis binary.
    driver: codeagent-wrapper
    # wrapper_path: /abs/path/to/codeagent-wrapper.mjs
    # wrapper_backend: agy
    # Alt: CLIProxy OpenAI-compatible HTTP (no agy CLI)
    # driver: cliproxy
    # cliproxy_base_url: "http://127.0.0.1:8317"
    # cliproxy_model: gemini-3.5-flash-low
```

Second-model prerequisites:

```bash
# driver=codeagent-wrapper (default): codeagent-wrapper on PATH after global install + agy on PATH
# Optional: export TRELLIS_CODEAGENT_WRAPPER=/abs/path/codeagent-wrapper.mjs

# driver=cliproxy: CLIProxyAPI + env key (do not commit secrets)
export CLIPROXY_API_KEY="<value from CLIProxyAPI config api-keys>"
```

Recipes live in the `trellis-channel` skill as **Pattern G / Pattern H**. The channel `antigravity` provider fails fast when the wrapper/agy or cliproxy setup is missing.

## Resources

| Need                            | Link                                                                           |
| ------------------------------- | ------------------------------------------------------------------------------ |
| Install Trellis in a repo       | [Quick Start](https://docs.trytrellis.app/start/install-and-first-task)        |
| Understand platform differences | [Supported Platforms](https://docs.trytrellis.app/advanced/multi-platform)     |
| See the workflow in practice    | [Real-World Scenarios](https://docs.trytrellis.app/start/real-world-scenarios) |
| Start from spec templates       | [Spec Templates](https://docs.trytrellis.app/templates/specs-index)            |
| Track releases                  | [Changelog](https://docs.trytrellis.app/changelog)                             |

## FAQ

<details>
<summary><strong>How is Trellis different from <code>CLAUDE.md</code>, <code>AGENTS.md</code>, or <code>.cursorrules</code>?</strong></summary>

Those files are useful entry points, but they tend to become monolithic. Trellis adds scoped specs, task PRDs, workflow gates, workspace memory, and platform-aware generated files around them.

</details>

<details>
<summary><strong>Is Trellis only for Claude Code?</strong></summary>

No. Trellis is a project layer that works across multiple coding agents and IDEs.

</details>

<details>
<summary><strong>Is Trellis for solo developers or teams?</strong></summary>

Both. Solo developers use it for memory and repeatable workflow. Teams get the larger benefit: shared standards, task boundaries, reviewable context, and platform portability.

</details>

<details>
<summary><strong>Do I have to write every spec file manually?</strong></summary>

No. Many teams start by letting AI draft specs from existing code and then tighten the important parts by hand. Trellis works best when you keep the high-signal rules explicit and versioned.

</details>

<details>
<summary><strong>Can teams use this without constant conflicts?</strong></summary>

Yes. Personal workspace journals stay separate per developer, while shared specs and tasks stay in the repo where they can be reviewed and improved like any other project artifact.

</details>

<details>
<summary><strong>Does multi-model collab change default behavior?</strong></summary>

No. `collab.enabled` is off by default. Plan / Implement / Verify / Finish match stock Trellis until you opt in.

</details>

<details>
<summary><strong>How is this different from official <code>@mindfoldhq/trellis</code>?</strong></summary>

| | Official | This fork |
|--|----------|-----------|
| npm package | `@mindfoldhq/trellis` | **`@decade666/trellis`** |
| source | [mindfold-ai/Trellis](https://github.com/mindfold-ai/Trellis) | [decade6666/Trellis](https://github.com/decade6666/Trellis) |
| multi-model collab | no (unless upstream merges) | yes (off by default; see above) |

Install **`@decade666/trellis`** when you need this fork’s features — not the official package name.

</details>

## Community & Resources

- [Upstream docs](https://docs.trytrellis.app/)
- [This fork on GitHub](https://github.com/decade6666/Trellis)
- [Issues](https://github.com/decade6666/Trellis/issues)

<p align="center">
<a href="https://github.com/decade6666/Trellis">decade6666/Trellis</a> ·
fork of <a href="https://github.com/mindfold-ai/Trellis">mindfold-ai/Trellis</a> ·
<a href="https://github.com/decade6666/Trellis/blob/main/LICENSE">AGPL-3.0</a>
</p>
