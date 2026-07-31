---
name: improve-ut
description: "依据项目单元测试规范补强测试覆盖：分析变更文件、判定测试层级、按既有模式新增或更新测试并运行验证。用于实现功能后、修完缺陷后或发现测试缺口时。"
---

# 改进单元测试 (UT)

Use this skill to improve test coverage after code changes.

## Usage

```text
$improve-ut
```

## Source of Truth

Discover and read unit-test specs dynamically:

```bash
# Discover available packages and their spec layers
python3 ./.trellis/scripts/get_context.py --mode packages
```

Look for packages with `unit-test` spec layer in the output. For each discovered `unit-test/` directory, read all relevant spec files inside it (for example `index.md`, `conventions.md`, `integration-patterns.md`, `mock-strategies.md`).

> If this skill conflicts with the unit-test specs, the specs win.

---

## Execution Flow

1. Inspect changed files:
   - `git diff --name-only`
2. Decide test scope using unit-test specs:
   - unit vs integration vs regression
   - mock vs real filesystem flow
3. Add/update tests using existing project test patterns
4. Run validation:

```bash
pnpm lint
pnpm typecheck
pnpm test
```

5. Summarize decisions, updates, and remaining test gaps.

---

## Output Format

```markdown
## UT Coverage Plan
- Changed areas: ...
- Test scope (unit/integration/regression): ...

## Test Updates
- Added: ...
- Updated: ...

## Validation
- pnpm lint: pass/fail
- pnpm typecheck: pass/fail
- pnpm test: pass/fail

## Gaps / Follow-ups
- <none or explicit rationale>
```
