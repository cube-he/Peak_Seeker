# Karpathy → Superpowers 集成实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 Karpathy 4 条规则按"高频常驻 / 按需触发"两层落地：Surgical Changes 进 `~/.claude/CLAUDE.md`，Simplicity First + Goal-Driven Execution 进新 skill `~/.claude/skills/coding-discipline/`。

**Architecture:** 不动 Superpowers 插件源（市场目录会被升级覆盖）；用户级配置层做增量。Karpathy Rule #1 不集成（与 brainstorming 重叠），Rule #3 走 CLAUDE.md，Rule #2/#4 走独立 skill。

**Tech Stack:** Markdown + YAML frontmatter（Claude Code skill 格式）

**参考 spec:** `docs/superpowers/specs/2026-04-26-karpathy-into-superpowers-design.md`

**前置说明：**
- `~/.claude/` 不是 git 仓库，所以 Task 1/2 完成后不需要 git commit
- 唯一需要 commit 到本仓库的是这份 plan 文件（Task 5）
- 全部任务在 win32 / bash shell 下执行

---

### Task 1: 创建 coding-discipline skill 文件

**Files:**
- Create: `C:/Users/Administrator/.claude/skills/coding-discipline/SKILL.md`

- [ ] **Step 1: 检查目录不存在（避免覆盖既有 skill）**

Run: `ls "C:/Users/Administrator/.claude/skills/coding-discipline/" 2>/dev/null || echo "not_exist"`
Expected: 输出 `not_exist`。如果目录已存在，停下来问用户。

- [ ] **Step 2: 创建 SKILL.md**

写入 `C:/Users/Administrator/.claude/skills/coding-discipline/SKILL.md`，完整内容如下：

````markdown
---
name: coding-discipline
description: Use when writing implementation code, before generating any function/class/module, or when receiving an imperative instruction without explicit success criteria. Enforces minimum-viable code and goal-driven verification loops. Complements TDD and brainstorming; does NOT replace them. Adapted from Andrej Karpathy's LLM coding observations.
---

# Coding Discipline

Two rules that apply at the moment of writing code. Both are easy to violate silently.

## 1. Simplicity First — minimum code, nothing speculative

Before writing any function, ask: **what is the smallest thing that makes the failing test pass / the user's request work?**

Forbid by default:
- Features beyond what was asked
- Abstractions for single-use code
- Configurability/flexibility not requested
- Error handling for impossible scenarios
- Premature helpers, base classes, factories

Self-check after writing: **"Would a senior engineer call this overcomplicated?"** If yes, delete and rewrite.

Three similar lines beat one premature abstraction.

## 2. Goal-Driven Execution — define success, loop until verified

Before starting a multi-step task, translate the imperative instruction into a verifiable goal:

| Imperative | Verifiable goal |
|---|---|
| "Add validation" | Tests for invalid input fail → make them pass |
| "Fix the bug" | Reproduction test fails → make it pass |
| "Refactor X" | Existing tests pass before AND after |
| "Make it work" | (refuse — ask for the success criterion) |

If the user gave you a weak criterion ("make it work", "improve it", "clean it up"), **stop and ask** what "done" looks like. Do not loop on a vague target — you will overshoot.

For multi-step work, write a brief verify-as-you-go plan:

```
1. <step> → verify: <command/check>
2. <step> → verify: <command/check>
```

## When this skill does NOT apply

- During `brainstorming` — that skill owns clarification
- During RED phase of TDD — the failing test IS the success criterion
- During `simplify` post-review — that's where existing code gets pruned
- Trivial one-line edits — use judgment

## Source

Adapted from <https://github.com/forrestchang/andrej-karpathy-skills> (rules #2 and #4). Rule #3 (Surgical Changes) is enforced via global `~/.claude/CLAUDE.md`. Rule #1 (Think Before Coding) is owned by the `brainstorming` skill.
````

- [ ] **Step 3: 验证文件存在且 frontmatter 合法**

Run:
```bash
head -5 "C:/Users/Administrator/.claude/skills/coding-discipline/SKILL.md"
```
Expected: 前 5 行包含 `---`、`name: coding-discipline`、`description:` 开头、`---` 闭合。

---

### Task 2: 在 `~/.claude/CLAUDE.md` 末尾追加「外科手术式改动」段

**Files:**
- Modify: `C:/Users/Administrator/.claude/CLAUDE.md`（在文件末尾追加）

- [ ] **Step 1: 读取当前 CLAUDE.md 末尾**

Run: `tail -20 "C:/Users/Administrator/.claude/CLAUDE.md"`
Expected: 看到现有「代码规范」段（包含 "commit message 用英文" 一行）。**确认不存在「外科手术式改动」字样**，否则停下来检查是否重复。

- [ ] **Step 2: 用 Edit 工具追加段落**

定位 anchor：`不要在代码里留 TODO 除非我明确要求`（这是「代码规范」段最后一行）。

old_string：
```
- 不要在代码里留 TODO 除非我明确要求
```

new_string：
```
- 不要在代码里留 TODO 除非我明确要求

## 外科手术式改动（Surgical Changes）

仅修改任务直接需要的代码：

- 不顺手"改善"无关代码、注释、格式、导入顺序
- 不重构没坏的东西，即使你觉得写法不好
- 跟现有风格走，哪怕不是你偏好的写法
- 只清理"你这次改动产生的"孤儿（unused imports/vars）；既存的死代码只提一句、不动手
- 临时调试文件（`_tmp_*`、`_verify_*`、`tmp_*.txt` 等）不留在仓库根；用完删，或放 `.gitignore` 覆盖的目录
- 自检：每一行 diff 必须能直接追溯到本次任务

发现需要改但超出当前任务的代码，**说出来、不动手**。
```

- [ ] **Step 3: 验证追加成功**

Run:
```bash
grep -c "外科手术式改动" "C:/Users/Administrator/.claude/CLAUDE.md"
```
Expected: 输出 `1`（不是 0，也不是 ≥2）。

---

### Task 3: 端到端验证（新会话识别 skill）

- [ ] **Step 1: 列出 ~/.claude/skills 子目录确认 coding-discipline 在列**

Run: `ls "C:/Users/Administrator/.claude/skills/" | grep coding-discipline`
Expected: 输出 `coding-discipline`

- [ ] **Step 2: 提示用户启动新会话验证**

向用户报告：
> 文件已就位。请你在 VolunteerHelper 目录下开**一个新的 Claude Code 会话**，看 SessionStart 列出来的 skill 清单是否包含 `coding-discipline`。如果不在，回来反馈，我排查 skill 发现机制。

不要在当前会话尝试触发 — 当前会话的 skill 注册表已固定。

---

### Task 4: 更新 MEMORY.md 索引

**Files:**
- Modify: `<旧 Claude memory 路径已移除>/MEMORY.md`
- Create: 同目录下新文件 `reference_coding_discipline.md`

- [ ] **Step 1: 创建 memory 文件**

写入 `reference_coding_discipline.md`：

```markdown
---
name: coding-discipline skill 集成
description: Karpathy Rule #2/#4 落在 ~/.claude/skills/coding-discipline；Rule #3 落在 ~/.claude/CLAUDE.md
type: reference
---

把 Karpathy LLM coding 规则集成进 Superpowers 体系，分两层：

- **常驻层**：`~/.claude/CLAUDE.md` 末尾「外科手术式改动」段（Karpathy Rule #3 Surgical Changes）— 每对话生效
- **触发层**：`~/.claude/skills/coding-discipline/SKILL.md`（Karpathy Rule #2 Simplicity First + #4 Goal-Driven Execution）— 写代码当下触发

Rule #1（Think Before Coding）未集成，与 `brainstorming` skill 重叠。

设计文档：`docs/superpowers/specs/2026-04-26-karpathy-into-superpowers-design.md`（commit `c621f19`）
上游：<https://github.com/forrestchang/andrej-karpathy-skills>
```

- [ ] **Step 2: 在 MEMORY.md 末尾加索引行**

Edit 工具，old_string：
```
- [Claude Code 环境清单](reference_claude_code_inventory.md) — 指针 → Vault `30-Resources/Tools/claude-code/`（MCP/插件/Skill 全清单）
```

new_string：
```
- [Claude Code 环境清单](reference_claude_code_inventory.md) — 指针 → Vault `30-Resources/Tools/claude-code/`（MCP/插件/Skill 全清单）
- [coding-discipline skill](reference_coding_discipline.md) — Karpathy Rule #2/#4 落 skill；#3 落 CLAUDE.md；#1 已被 brainstorming 覆盖
```

- [ ] **Step 3: 验证**

Run:
```bash
grep -c "coding-discipline" "<旧 Claude memory 路径已移除>/MEMORY.md"
```
Expected: 输出 `1`

---

### Task 5: Commit plan 文档到本仓库

- [ ] **Step 1: 仅 stage 本 plan 文件（仓库 dirty 状态多，避免误提交）**

Run:
```bash
git add docs/superpowers/plans/2026-04-26-karpathy-into-superpowers.md
git status --short docs/superpowers/plans/2026-04-26-karpathy-into-superpowers.md
```
Expected: 显示 `A  docs/superpowers/plans/2026-04-26-karpathy-into-superpowers.md`

- [ ] **Step 2: 提交**

Run:
```bash
git commit -m "docs: add plan for integrating Karpathy guidelines into Superpowers"
```
Expected: 提交成功，HEAD 前进一格。

---

## 自检结果

**Spec coverage（对照 spec 的「实施顺序」）：**
- ① 写 SKILL.md → Task 1 ✓
- ② 编辑 CLAUDE.md → Task 2 ✓
- ③ 新会话验证 → Task 3 ✓
- ④ 提交设计文档 → 已在 brainstorming 阶段完成（commit `c621f19`）

**Spec 「验证标准」对照：**
- 标准 1（CLAUDE.md grep）→ Task 2 Step 3 ✓
- 标准 2（SKILL.md frontmatter）→ Task 1 Step 3 ✓
- 标准 3（新会话识别）→ Task 3 ✓
- 标准 4（一周后 _tmp_* 数量）→ 运维基线检查，不在本计划内

**Placeholder 扫描：** 无 TBD / TODO / "implement later"。所有文件内容直给。

**类型一致性：** skill 名 `coding-discipline` 在 Task 1/3/4 中完全一致。
