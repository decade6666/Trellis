<p align="center">
<picture>
<source srcset="assets/trellis.png" media="(prefers-color-scheme: dark)">
<source srcset="assets/trellis.png" media="(prefers-color-scheme: light)">
<img src="assets/trellis.png" alt="Trellis Logo" width="500" style="image-rendering: -webkit-optimize-contrast; image-rendering: crisp-edges;">
</picture>
</p>

<p align="center">
<strong>开箱即用的 AI 编码工程化框架</strong><br/>
<sub>AI 写代码很快，但它每次会话都从零开始理解项目，记不住你的规范，也记不住团队级别的需求。Trellis 会把规范、任务、记忆沉淀进仓库，让任意 Coding Agent 都按你的工程标准来实践。</sub>
</p>

<p align="center">
<strong>简体中文</strong> ·
<a href="./README_EN.md">English</a> ·
<a href="https://docs.trytrellis.app/zh">文档</a> ·
<a href="https://docs.trytrellis.app/zh/start/install-and-first-task">快速开始</a> ·
<a href="https://docs.trytrellis.app/zh/advanced/multi-platform">支持平台</a> ·
<a href="https://docs.trytrellis.app/zh/start/real-world-scenarios">使用场景</a>
</p>

<p align="center">
<a href="https://www.npmjs.com/package/@decade6666/trellis"><img src="https://img.shields.io/npm/v/@decade6666/trellis.svg?style=flat-square&color=2563eb" alt="npm version" /></a>
<a href="https://www.npmjs.com/package/@decade6666/trellis"><img src="https://img.shields.io/npm/dw/@decade6666/trellis?style=flat-square&color=cb3837&label=downloads" alt="npm downloads" /></a>
<a href="https://github.com/mindfold-ai/Trellis/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0-16a34a.svg?style=flat-square" alt="license" /></a>
<a href="https://github.com/mindfold-ai/Trellis/stargazers"><img src="https://img.shields.io/github/stars/mindfold-ai/Trellis?style=flat-square&color=eab308" alt="stars" /></a>
<a href="https://docs.trytrellis.app/zh"><img src="https://img.shields.io/badge/docs-trytrellis.app-0f766e?style=flat-square" alt="docs" /></a>
<a href="https://discord.com/invite/tWcCZ3aRHc"><img src="https://img.shields.io/badge/Discord-Join-5865F2?style=flat-square&logo=discord&logoColor=white" alt="Discord" /></a>
<a href="https://github.com/mindfold-ai/Trellis/issues"><img src="https://img.shields.io/github/issues/mindfold-ai/Trellis?style=flat-square&color=e67e22" alt="open issues" /></a>
<a href="https://github.com/mindfold-ai/Trellis/pulls"><img src="https://img.shields.io/github/issues-pr/mindfold-ai/Trellis?style=flat-square&color=9b59b6" alt="open PRs" /></a>
<a href="https://deepwiki.com/mindfold-ai/Trellis"><img src="https://img.shields.io/badge/Ask-DeepWiki-blue?style=flat-square" alt="Ask DeepWiki" /></a>
<a href="https://chatgpt.com/?q=Explain+the+project+mindfold-ai/Trellis+on+GitHub"><img src="https://img.shields.io/badge/Ask-ChatGPT-74aa9c?style=flat-square&logo=openai&logoColor=white" alt="Ask ChatGPT" /></a>
</p>

<p align="center">
<img src="assets/trellis-demo-zh.gif" alt="Trellis 工作流演示" width="100%">
</p>

## 为什么用 Trellis？

| 能力 | 带来的改变 |
| --- | --- |
| **自动注入规范** | 将规范沉淀到 `.trellis/spec/` 之后，Trellis 会在每次会话中按当前任务自动按需注入相关上下文，无需反复说明。 |
| **任务驱动工作流** | PRD、实现上下文、审查上下文与任务状态统一存放于 `.trellis/tasks/`，AI 开发过程保持结构化、可追溯。 |
| **项目记忆** | `.trellis/workspace/` 中的工作日志（journal）会保留上一次会话的脉络，因此每次新会话都能基于真实上下文开始。 |
| **团队共享标准** | Spec 随仓库一同版本化，个人总结出的规则与流程可以直接成为整个团队的基础设施。 |
| **多平台复用** | 同一套 Trellis 结构覆盖 17 个 AI coding 平台，无需为每个工具单独搭建工作流。 |
| **可选多模型协作** | 在 Trellis channel 上按需打开 Codex / 第二模型并行分析、实现与交叉审查，默认关闭、零行为变化。 |

## 前置要求

- **Node.js** >= 18
- **Python** >= 3.9

## 快速开始

```bash
# 1. 安装 Trellis
npm install -g @decade6666/trellis@latest

# 2. 在仓库中初始化
trellis init -u your-name

# 3. 或仅初始化你实际使用的平台
trellis init --cursor --opencode --codex -u your-name
```

查看 [快速开始](https://docs.trytrellis.app/zh/start/install-and-first-task) 与 [支持平台](https://docs.trytrellis.app/zh/advanced/multi-platform) 指南以了解详细配置步骤。


## 安装本 Fork（`@decade6666/trellis`）

本仓库发布到 npm 的包名是 **`@decade6666/trellis`**（CLI）与 **`@decade6666/trellis-core`**（SDK），**不是**官方的 `@mindfoldhq/trellis`。

```bash
# 全局安装
npm install -g @decade6666/trellis@latest

# 或 npx 临时运行
npx @decade6666/trellis@latest init -u your-name

# 在业务项目中初始化
cd /path/to/your-app
trellis init -u your-name
```

升级：

```bash
npm install -g @decade6666/trellis@latest
# 已有项目再刷新模板
trellis update
```

源码：https://github.com/decade6666/Trellis


## 如何使用

使用流程非常简单：

1. **用自然语言描述你的需求。**
2. **与 AI 一起头脑风暴**，一次只回答一个问题，直到 PRD 足够清晰，然后开始实现。
3. **交由 AI 自主推进** —— AI 会调用 `trellis-implement` 编写代码，并自动依据 Spec、lint、type-check 与测试进行校验。
4. **当工作完成或会话上下文接近上限时，输入 `/trellis:finish-work`**。Trellis 会归档任务并更新工作日志。

## 工作原理

Trellis 内部运行一个 4 阶段循环，skill 与子代理均由系统自动调用：

1. **Plan（规划）** —— `trellis-brainstorm` 逐题梳理需求并写入 `prd.md`；涉及资料调研的部分派发给 `trellis-research` 子代理处理。阶段产出为一组精选的 Spec 与研究文件，由 `implement.jsonl` / `check.jsonl` 编排。
2. **Implement（实现）** —— `trellis-implement` 子代理依据 PRD 编写代码，所需上下文已按 `implement.jsonl` 自动注入，不会执行 git commit。
3. **Verify（验证）** —— `trellis-check` 子代理基于 diff 对照 Spec 逐项核查，并运行 lint、type-check 与测试，在能力范围内自动修复。
4. **Finish（收尾）** —— 执行最终检查后，`trellis-update-spec` 将本轮新增的认知沉淀回 `.trellis/spec/`，为下一次会话积累上下文。

## 可选：多模型协作（默认关闭）

在保留 Trellis 主干流程的前提下，可在 `.trellis/config.yaml` 打开 `collab` 开关，按场景插入多模型协作：

| 开关 | 作用 |
| --- | --- |
| `collab.enabled` | 总开关；关闭时完全等同原生 Trellis |
| `dual_model_analysis` | Plan：复杂任务经确认后，Codex + 第二模型并行分析（Pattern G） |
| `codex_led_implement` | Implement：实现工作优先派给 Codex channel worker |
| `cross_review` | Verify：关键改动可走 Claude + Codex + 第二模型三路审查（Pattern H） |
| `codex_led_spec_update` | Finish：仅 spec 更新可派 Codex；**git commit 始终主会话** |

```yaml
# .trellis/config.yaml（示例；默认全部注释 / 关闭）
collab:
  enabled: true
  dual_model_analysis: true
  codex_led_implement: true
  cross_review: true
  codex_led_spec_update: true
  second_model:
    provider: antigravity
    driver: cliproxy   # v1 可用驱动；需本机 CLIProxy 可达
```

配方见 `trellis-channel` skill 的 **Pattern G / Pattern H**。第二模型 v1 走 channel `antigravity` provider（cliproxy）；未配置时 fail-fast，不会半挂死。

## 资源

| 需求 | 链接 |
| --- | --- |
| 在仓库中安装 Trellis | [快速开始](https://docs.trytrellis.app/zh/start/install-and-first-task) |
| 了解各平台之间的差异 | [支持平台](https://docs.trytrellis.app/zh/advanced/multi-platform) |
| 查看实际使用场景 | [真实场景](https://docs.trytrellis.app/zh/start/real-world-scenarios) |
| 从 Spec 模板起步 | [Spec 模板](https://docs.trytrellis.app/zh/templates/specs-index) |
| 跟进版本更新 | [更新日志](https://docs.trytrellis.app/zh/changelog) |

## 常见问题

<details>
<summary><strong>Trellis 与 <code>CLAUDE.md</code>、<code>AGENTS.md</code>、<code>.cursorrules</code> 有何区别？</strong></summary>

这些文件本身是有用的入口，但容易在长期使用中变得冗长臃肿。Trellis 在此之上补充了：作用域明确的 Spec、按任务划分的 PRD、工作流关卡、工作区记忆，以及按平台自动生成的适配文件。

</details>

<details>
<summary><strong>Trellis 是否仅支持 Claude Code？</strong></summary>

并非如此。Trellis 是项目层基础设施，可在多种 coding agent 与 IDE 中使用。

</details>

<details>
<summary><strong>Trellis 适合个人开发者还是团队？</strong></summary>

两者皆可。个人开发者主要受益于记忆机制与可复用的工作流；团队使用收益更大——标准统一、任务边界清晰、上下文可审查，且具备跨平台可移植性。

</details>

<details>
<summary><strong>是否需要手动编写每一个 Spec 文件？</strong></summary>

并不需要。多数团队的做法是先由 AI 基于现有代码生成初稿，再人工收紧关键规则。Trellis 的效果取决于是否将高价值规则显式化并纳入版本管理。

</details>

<details>
<summary><strong>团队协作时是否会频繁产生冲突？</strong></summary>

不会。个人工作区的 journal 按开发者独立维护，共享的 Spec 与任务则进入仓库，可以像其他项目产物一样进行评审与改进。

</details>

<details>
<summary><strong>多模型协作会不会改变默认行为？</strong></summary>

不会。`collab.enabled` 默认关闭；未开启时 Plan / Implement / Verify / Finish 与原生 Trellis 完全一致。只有显式打开开关，才会走 channel 多模型扇出。

</details>
