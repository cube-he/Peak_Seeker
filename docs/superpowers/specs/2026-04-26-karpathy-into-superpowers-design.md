# 集成 Karpathy-skills 到 Superpowers 体系（设计文档）

- 日期：2026-04-26
- 状态：设计已确认，待落地
- 上游：<https://github.com/forrestchang/andrej-karpathy-skills>

## 背景

Superpowers 已覆盖大部分 Karpathy 4 条原则中的失败模式，但有两个真实盲区：

1. **改无关代码** — 仓库根 50+ 个 `_tmp_*` / `_verify_*.py` 临时文件，验证了"边干边乱改"的倾向，Superpowers 没有 skill 在写代码当下盯这条
2. **写代码当下的简单度自检 + 模糊指令的目标转译** — `simplify` 是事后 review，`TDD` 关注 RED-GREEN 节奏，没有 skill 在生成代码瞬间问"还能更简单吗 / 这个目标可验证吗"

直接装 Karpathy 插件会与 Superpowers 工作流冲突触发。结论：拆分集成。

## 目标

把 Karpathy 4 条规则中**对现有 Superpowers 有真增量**的部分，按"触发频率 / 触发时机"分两层落地：

- 高频常驻 → CLAUDE.md
- 按场景触发 → 独立 skill

## 不目标（Non-Goals）

- 不修改 Superpowers 插件源文件（marketplace 目录会被升级覆盖）
- 不 fork Superpowers
- 不复制 Karpathy Rule #1（Think Before Coding）— 与 `brainstorming` 完全重叠
- 不复制 Karpathy 安装脚本 / 插件 manifest

## Karpathy 4 规则 vs Superpowers 覆盖映射

| Karpathy | Superpowers 现有 | 增量价值 | 落地位置 |
|---|---|---|---|
| #1 Think Before Coding | `brainstorming` 已强制澄清 | 重复 | 不集成 |
| #2 Simplicity First | `simplify`（事后 review） | 写代码当下的自检无人承接 | skill |
| #3 Surgical Changes | 几乎无 | 真痛点，需常驻 | CLAUDE.md |
| #4 Goal-Driven Execution | `TDD` + `verification-before-completion` 部分 | "命令式 → 可验证目标"元规则未显式存在 | skill |

## 设计

### 改动 1：`~/.claude/CLAUDE.md` 追加「外科手术式改动」段

加在「代码规范」段末尾。中文，匹配现有风格。每对话常驻生效，约 +150 tokens / 对话。

```markdown
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

### 改动 2：新 skill `~/.claude/skills/coding-discipline/SKILL.md`

英文，匹配 Superpowers 其他 skill 的语言惯例（保证 `using-superpowers` 检索机制识别一致）。

**触发时机**（写在 description）：
- 写实现代码之前
- TDD 进入 GREEN 阶段写最小实现时
- 接到模糊命令式指令（"做 X" 而非 "达到 Y"）

**显式声明不触发的场景**：
- `brainstorming` 进行中
- TDD RED 阶段（失败测试本身就是成功标准）
- `simplify` post-review
- 一行小改

**完整内容**：见本文末尾附录 A。

### 不改动

- Superpowers 插件源（`.../marketplaces/superpowers-dev/skills/`）
- 本项目 `CLAUDE.md`（这是全局规则，进 `~/.claude/CLAUDE.md`）

## 验证标准

集成成功的判据：

1. `~/.claude/CLAUDE.md` 末尾包含「外科手术式改动」段（grep 验证）
2. `~/.claude/skills/coding-discipline/SKILL.md` 存在且 frontmatter 合法（YAML 解析验证）
3. 下一次新会话启动时，`using-superpowers` 的 skill 列表包含 `coding-discipline`
4. 一周后回看 git status：仓库根新增 `_tmp_*` / `_verify_*` 文件 < 5（基线对比）

## 风险与回滚

- **风险 1**：CLAUDE.md 变长拖慢每对话冷启动 — 实测增量 ~150 tokens，可忽略
- **风险 2**：`coding-discipline` 与 TDD 重叠触发 — 已在 SKILL.md 中显式声明 RED 阶段不触发
- **风险 3**：规则太严导致连小改都被打回 — Karpathy 原文已留口径"trivial tasks use judgment"，保留这一句

回滚：删两个文件 / 撤一段 CLAUDE.md 即可，无副作用。

## 实施顺序

1. 写 `~/.claude/skills/coding-discipline/SKILL.md`
2. 编辑 `~/.claude/CLAUDE.md` 追加段落
3. 新开一个会话验证 skill 被列出
4. 提交本设计文档到 git

---

## 附录 A：`coding-discipline/SKILL.md` 完整内容

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
