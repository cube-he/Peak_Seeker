# Obsidian 长期主记忆方案 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `E:\Soft\Cube` Obsidian Vault 改造成跨会话、跨项目的长期主记忆主库，Claude 自主读写、定期清理。

**Architecture:** 保留 PARA 结构；新增 Personal/Infrastructure/knowledge 三类子目录；7 个新 Templater 模板；6 个 Claude skill 驱动读写；迁移 7 条 Memory 长期项到 Vault 并改指针。

**Tech Stack:** Obsidian + Templater + Dataview + Obsidian Git + Periodic Notes；Claude Code skills（`.claude/skills/`）；Windows 文件系统（bash 用 `/` 或 Windows 原生 `\` 均可，本计划统一 forward-slash）。

**Design spec:** `docs/superpowers/specs/2026-04-24-obsidian-main-memory-design.md`

---

## File Structure

### Vault 目录 `E:/Soft/Cube/`

**新建**
- `.gitignore`
- `10-Projects/VolunteerHelper/{index.md, brand/, roles/, decisions/, domain/}`
- `20-Areas/Personal/{profile.md, company.md}`
- `20-Areas/Infrastructure/{_Index.md, servers/, domains/, _private/}`
- `30-Resources/knowledge/{data-contracts/, architecture/, ai-engineering/}`
- `Templates/{project,server,person,decision,knowledge-card,tool,moc}.md`
- `.claude/skills/{vault-write,vault-find,vault-cleanup,vault-promote,vault-moc,vault-new-server}/SKILL.md`

**修改**
- `10-Projects/_Index.md`（加 VolunteerHelper）
- `10-Projects/LocalOCR/index.md`（从空 → 带骨架）

**删除**
- `欢迎.md`、`创建链接.md`、`LocalOCR.md`（根目录）、`About Me.md`（迁入 Personal 后）
- `Templates/项目笔记.md`（被 project.md 替代）

### Memory 目录 `C:/Users/Administrator/.claude-proxy/cli/.claude/projects/C--Users-Administrator-Documents-VolunteerHelper/memory/`

**修改（改指针）：** `user_company_brand.md`、`project_brand_decision.md`、`project_user_roles.md`、`project_teacher_workflow.md`、`project_student_scope.md`、`project_rbac_design.md`、`project_recruitment_plan_rules.md`

---

## Phase 1：基础设施

### Task 1: 安装 Obsidian 插件（手动）

**Files:** 无（手动操作 Obsidian）

- [ ] **Step 1: 在 Obsidian 的 Settings → Community plugins 中安装并启用**
  - `Obsidian Git`（作者 Vinzent03）
  - `Periodic Notes`（作者 liamcain）

- [ ] **Step 2: 验证插件已启用**

  Run:
  ```bash
  cat "E:/Soft/Cube/.obsidian/community-plugins.json"
  ```
  Expected: 输出中包含 `obsidian-git` 和 `periodic-notes`

- [ ] **Step 3: 暂不提交（Vault 尚未初始化 git）**

### Task 2: Vault 初始化 git + .gitignore

**Files:**
- Create: `E:/Soft/Cube/.gitignore`

- [ ] **Step 1: 初始化 git**

  Run:
  ```bash
  cd "E:/Soft/Cube" && git init -b main
  ```
  Expected: `Initialized empty Git repository in E:/Soft/Cube/.git/`

- [ ] **Step 2: 写 `.gitignore`**

  ```gitignore
  # Obsidian runtime
  .obsidian/workspace*
  .obsidian/cache/
  .obsidian/appearance.json.bak

  # Claudian sessions
  .claudian/sessions/

  # Sensitive
  20-Areas/Infrastructure/_private/

  # Obsidian trash
  .trash/

  # OS
  .DS_Store
  Thumbs.db
  ```

- [ ] **Step 3: 首次提交**

  Run:
  ```bash
  cd "E:/Soft/Cube" && git add -A && git commit -m "chore: initialize Vault as git repository"
  ```
  Expected: 成功提交，文件数符合预期（.obsidian 配置 + 现有 PARA 骨架 + 现有模板）

- [ ] **Step 4: 验证 .gitignore 生效**

  Run:
  ```bash
  cd "E:/Soft/Cube" && git status --ignored | head -20
  ```
  Expected: `.obsidian/workspace*`、`.claudian/sessions/` 出现在 Ignored 列表

### Task 3: 清理根目录空壳文件

**Files:**
- Delete: `E:/Soft/Cube/欢迎.md`、`创建链接.md`、`LocalOCR.md`

- [ ] **Step 1: 验证三个文件确实是空或默认示例**

  Run:
  ```bash
  wc -c "E:/Soft/Cube/欢迎.md" "E:/Soft/Cube/创建链接.md" "E:/Soft/Cube/LocalOCR.md"
  ```
  Expected: 均为 0 或极小（`欢迎.md` 221 字节为默认示例，另两个 0 字节）

- [ ] **Step 2: 删除三个文件**

  Run:
  ```bash
  cd "E:/Soft/Cube" && rm "欢迎.md" "创建链接.md" "LocalOCR.md"
  ```

- [ ] **Step 3: 验证并提交**

  Run:
  ```bash
  cd "E:/Soft/Cube" && ls | grep -E "(欢迎|创建链接|LocalOCR\.md$)"
  ```
  Expected: 空输出

  Run:
  ```bash
  cd "E:/Soft/Cube" && git add -A && git commit -m "chore: remove Obsidian default placeholder files"
  ```

---

## Phase 2：结构与模板

### Task 4: 创建新目录结构

**Files:**
- Create: 所有新目录（通过 `mkdir -p` + `.gitkeep`）

- [ ] **Step 1: 创建项目子目录**

  Run:
  ```bash
  cd "E:/Soft/Cube" && \
    mkdir -p "10-Projects/VolunteerHelper/brand" \
             "10-Projects/VolunteerHelper/roles" \
             "10-Projects/VolunteerHelper/decisions" \
             "10-Projects/VolunteerHelper/domain"
  ```

- [ ] **Step 2: 创建 Areas 子目录**

  Run:
  ```bash
  cd "E:/Soft/Cube" && \
    mkdir -p "20-Areas/Personal" \
             "20-Areas/Infrastructure/servers" \
             "20-Areas/Infrastructure/domains" \
             "20-Areas/Infrastructure/_private"
  ```

- [ ] **Step 3: 创建 Resources 子目录**

  Run:
  ```bash
  cd "E:/Soft/Cube" && \
    mkdir -p "30-Resources/knowledge/data-contracts" \
             "30-Resources/knowledge/architecture" \
             "30-Resources/knowledge/ai-engineering" \
             "30-Resources/Tools/claude-code" \
             "30-Resources/Tools/obsidian" \
             "30-Resources/Tools/git"
  ```

- [ ] **Step 4: 添加 `.gitkeep` 到所有空目录（保证 git 跟踪）**

  Run:
  ```bash
  cd "E:/Soft/Cube" && \
    find "10-Projects/VolunteerHelper" \
         "20-Areas/Personal" \
         "20-Areas/Infrastructure" \
         "30-Resources/knowledge" \
         "30-Resources/Tools" \
         -type d -empty -exec touch {}/.gitkeep \;
  ```

- [ ] **Step 5: 提交**

  Run:
  ```bash
  cd "E:/Soft/Cube" && git add -A && git commit -m "feat: scaffold Vault directory structure for long-term memory"
  ```

### Task 5: 写 project.md 模板

**Files:**
- Create: `E:/Soft/Cube/Templates/project.md`

- [ ] **Step 1: 写模板内容**

  ```markdown
  ---
  type: project
  tags: [project]
  updated: <% tp.date.now("YYYY-MM-DD") %>
  status: active
  started: <% tp.date.now("YYYY-MM-DD") %>
  target:
  ---

  # <% tp.file.title %>

  ## 一句话说明


  ## 目标
  - [ ]

  ## 现状（摘要，详情在 Memory）


  ## 关键决策
  ```dataview
  LIST FROM "10-Projects/<% tp.file.title %>/decisions"
  ```

  ## 角色 / 用户
  ```dataview
  LIST FROM "10-Projects/<% tp.file.title %>/roles"
  ```

  ## 品牌 / 命名
  ```dataview
  LIST FROM "10-Projects/<% tp.file.title %>/brand"
  ```

  ## 领域规则
  ```dataview
  LIST FROM "10-Projects/<% tp.file.title %>/domain"
  ```

  ## 相关资源
  - [[]]
  ```

- [ ] **Step 2: 验证**

  Run: `cat "E:/Soft/Cube/Templates/project.md" | head -5`
  Expected: front-matter 开头为 `---` + `type: project`

### Task 6: 写 server.md 模板

**Files:**
- Create: `E:/Soft/Cube/Templates/server.md`

- [ ] **Step 1: 写模板内容**

  ```markdown
  ---
  type: server
  tags: [infrastructure/server]
  updated: <% tp.date.now("YYYY-MM-DD") %>
  env: prod
  status: active
  ---

  # <% tp.file.title %>

  ## 用途


  ## 接入
  - IP:
  - SSH: `ssh user@<host>`
  - 密钥: `~/.ssh/id_xxx`
  - 凭据: [PASSWORD_REF: ]

  ## 运行服务


  ## 注意事项


  ## 相关
  - 项目: [[]]
  - 架构:
  ```

- [ ] **Step 2: 验证 front-matter 字段齐全**

  Run: `grep -E "^(type|tags|env|status):" "E:/Soft/Cube/Templates/server.md" | wc -l`
  Expected: `4`

### Task 7: 写 person.md 模板

**Files:**
- Create: `E:/Soft/Cube/Templates/person.md`

- [ ] **Step 1: 写模板内容**

  ```markdown
  ---
  type: person
  tags: [person]
  updated: <% tp.date.now("YYYY-MM-DD") %>
  role:
  org:
  ---

  # <% tp.file.title %>

  ## 角色 / 组织


  ## 联系方式
  - Email:
  - 电话:
  - IM:

  ## 背景 / 上下文


  ## 互动历史


  ## 相关
  - 项目: [[]]
  ```

### Task 8: 写 decision.md 模板（ADR 轻量版）

**Files:**
- Create: `E:/Soft/Cube/Templates/decision.md`

- [ ] **Step 1: 写模板内容**

  ```markdown
  ---
  type: decision
  tags: [decision]
  updated: <% tp.date.now("YYYY-MM-DD") %>
  status: accepted
  project:
  ---

  # <% tp.file.title %>

  ## Context
  <为什么要做这个决策？约束、压力、背景？>

  ## Decision
  <决定是什么？用一段话说清。>

  ## Consequences
  <正面影响、负面代价、后续需要注意的。>

  ## Alternatives considered
  <备选方案，以及为什么没选。>

  ## 相关
  - 项目: [[]]
  ```

### Task 9: 写 knowledge-card.md 模板（原子卡）

**Files:**
- Create: `E:/Soft/Cube/Templates/knowledge-card.md`

- [ ] **Step 1: 写模板内容**

  ```markdown
  ---
  type: card
  tags: []
  updated: <% tp.date.now("YYYY-MM-DD") %>
  ---

  # <% tp.file.title %>

  ## 一句话
  <核心结论，一句话。>

  ## 背景 / 机制
  <为什么是这样？底层原因。>

  ## 适用场景
  -
  -

  ## 反例 / 边界
  <什么时候不适用？>

  ## 相关
  - [[]]
  ```

### Task 10: 写 tool.md 模板

**Files:**
- Create: `E:/Soft/Cube/Templates/tool.md`

- [ ] **Step 1: 写模板内容**

  ```markdown
  ---
  type: tool
  tags: [tool]
  updated: <% tp.date.now("YYYY-MM-DD") %>
  category:
  ---

  # <% tp.file.title %>

  ## 用途
  <一句话说明这个工具解决什么。>

  ## 安装 / 获取
  ```bash
  # install command
  ```

  ## 常用命令
  | 命令 | 说明 |
  |---|---|
  |  |  |

  ## 配置要点


  ## 陷阱 / 坑


  ## 相关
  - 官方文档:
  - [[]]
  ```

### Task 11: 写 moc.md 模板

**Files:**
- Create: `E:/Soft/Cube/Templates/moc.md`

- [ ] **Step 1: 写模板内容**

  ```markdown
  ---
  type: moc
  tags: [moc]
  updated: <% tp.date.now("YYYY-MM-DD") %>
  ---

  # <% tp.file.title %>

  ## 概览
  <这张地图覆盖什么主题？>

  ## 内容清单
  ```dataview
  TABLE type, updated
  FROM "<path-to-folder>"
  WHERE type != "moc"
  SORT updated DESC
  ```

  ## 子主题
  - [[]]

  ## 相关地图
  - [[]]
  ```

### Task 12: 弃用旧模板并提交 Phase 2

**Files:**
- Delete: `E:/Soft/Cube/Templates/项目笔记.md`

- [ ] **Step 1: 确认旧模板存在并查看内容（确认可删）**

  Run: `ls "E:/Soft/Cube/Templates/" && cat "E:/Soft/Cube/Templates/项目笔记.md" 2>/dev/null | head -20`
  Expected: 看到"项目笔记.md"存在

- [ ] **Step 2: 删除**

  Run: `rm "E:/Soft/Cube/Templates/项目笔记.md"`

- [ ] **Step 3: 提交**

  Run:
  ```bash
  cd "E:/Soft/Cube" && git add -A && git commit -m "feat: add 7 new Templater templates (project/server/person/decision/knowledge-card/tool/moc); deprecate 项目笔记"
  ```

---

## Phase 3：Claude Skills

每个 skill 位于 `E:/Soft/Cube/.claude/skills/<skill-name>/SKILL.md`。需要先建 skills 目录。

### Task 13: 写 vault-write skill

**Files:**
- Create: `E:/Soft/Cube/.claude/skills/vault-write/SKILL.md`

- [ ] **Step 1: 创建目录并写 SKILL.md**

  Run: `mkdir -p "E:/Soft/Cube/.claude/skills/vault-write"`

  内容：
  ```markdown
  ---
  name: vault-write
  description: Use when identifying long-term-value content that should persist across sessions (project decisions, domain knowledge, server details, personal background, cross-project patterns). Routes content to the correct PARA location with proper front-matter and updates related MOC. Do NOT use for ephemeral session state, current tasks, or user preferences — those belong in Claude Memory.
  ---

  # vault-write

  ## 何时触发

  在对话中识别到满足以下**任一**条件的内容，自主写入 Vault：

  - 项目品牌 / 角色定义 / 关键技术决策（影响跨会话的固定事实）
  - 跨项目可复用的经验 / 模式 / 踩坑记录（预期 ≥2 个场景会用到）
  - 服务器 / 域名 / 账号（任何基础设施细节）
  - 个人背景的长期变化（角色、技能栈、关注方向）
  - 想法 / 灵感 / 半成品（尚不确定归属时先捕获）

  **不要写 Vault**：会话当前状态、工作偏好、红线规则 —— 这些属于 Claude Memory。

  ## 落位规则

  | 内容类型 | 落位路径 | 模板 |
  |---|---|---|
  | 项目品牌 | `10-Projects/<project>/brand/<slug>.md` | project/decision |
  | 项目角色定义 | `10-Projects/<project>/roles/<slug>.md` | - |
  | 项目技术决策 | `10-Projects/<project>/decisions/<slug>.md` | decision |
  | 项目业务规则 | `10-Projects/<project>/domain/<slug>.md` | knowledge-card |
  | 跨项目知识 | `30-Resources/knowledge/<topic>/<slug>.md` | knowledge-card |
  | 工具命令速查 | `30-Resources/Tools/<tool-name>/<slug>.md` | tool |
  | 服务器 | `20-Areas/Infrastructure/servers/<hostname>.md` | server |
  | 域名 | `20-Areas/Infrastructure/domains/<domain>.md` | - |
  | 人物 | `20-Areas/Personal/people/<name>.md` | person |
  | 个人背景更新 | `20-Areas/Personal/profile.md`（追加更新） | - |
  | 想法 / 不确定归属 | `00-Inbox/YYYY-MM-DD-<slug>.md` | 快速笔记 |

  ## 执行步骤

  1. **判定类型**：按上表识别内容所属类型
  2. **生成 front-matter**（必填 `type`、`tags`、`updated`；可选 `status`、`project`、`env`）
  3. **文件名**：英文 kebab-case；Inbox 前缀日期 `YYYY-MM-DD-`
  4. **用 Edit/Write 工具写入** Vault 对应路径（如果文件已存在，先 Read 再 Edit 追加）
  5. **更新相关 MOC**：如果目录有 `_Index.md` 且是 Dataview 查询则无需手动改；若是手动列表则追加
  6. **回复用户**：明确说"已写入 `<完整路径>`，内容要点：..."

  ## 敏感信息

  - 凭据 / 密码 / 密钥 **绝不**写明文。用占位符 `[PASSWORD_REF: <entry-name>]`
  - 涉及敏感接入细节（内网 IP / 特殊端口 / 非公开架构）写到 `20-Areas/Infrastructure/_private/` 子目录（该目录 .gitignore 排除）

  ## 边界

  - 一次对话同一类型多条内容：合并写入单个文件（按子标题分），不要建很多碎文件
  - 不确定归属优先走 `00-Inbox/`，日后 `vault-cleanup` 会提示流转
  ```

- [ ] **Step 2: 验证 front-matter**

  Run: `head -5 "E:/Soft/Cube/.claude/skills/vault-write/SKILL.md"`
  Expected: 前 4 行是 `---`、`name: vault-write`、`description: ...`、`---`

### Task 14: 写 vault-find skill

**Files:**
- Create: `E:/Soft/Cube/.claude/skills/vault-find/SKILL.md`

- [ ] **Step 1: 创建目录并写 SKILL.md**

  Run: `mkdir -p "E:/Soft/Cube/.claude/skills/vault-find"`

  内容：
  ```markdown
  ---
  name: vault-find
  description: Use when needing to check if knowledge already exists in the Vault — before writing new content, when the user asks "did I note this before", or when Claude needs background for a decision. Combines Glob, Grep, and Dataview-style front-matter queries to return ranked matches.
  ---

  # vault-find

  ## 何时触发

  - 用户问："我之前记过 X 吗"、"找一下我关于 Y 的笔记"
  - Claude 准备 `vault-write` 前，先查是否已有相关文件（避免重复/覆盖）
  - 需要项目背景 / 历史决策时

  ## 执行步骤

  1. **识别查询意图**：主题关键词 + 可选 type 过滤
  2. **三路并行搜索**：
     - `Glob` 文件名匹配：`E:/Soft/Cube/**/*<keyword>*.md`
     - `Grep` 内容搜索：`rg -l "<keyword>" "E:/Soft/Cube/" --type md`
     - front-matter 过滤：用 Grep 搜 `type: <T>` + tag
  3. **合并去重 + 评分**（文件名命中权重高于正文命中）
  4. **返回 top-5 结果**：每条含路径、type、updated、一句话摘要（Read 首 10 行提取）
  5. **如果无匹配**：明确告诉用户"Vault 中未找到相关笔记"

  ## 输出格式

  ```
  找到 N 条相关笔记：

  1. [项目品牌] `10-Projects/VolunteerHelper/brand/smart-wish-home.md` (updated 2026-04-17)
     智愿家品牌决策，Claude 温暖路线。
  2. ...
  ```

  ## 边界

  - 不走 AI embedding 语义搜索（当前方案：关键词 + front-matter 即可）
  - 如果结果 > 20 条，先汇报总数并让用户细化关键词
  ```

### Task 15: 写 vault-cleanup skill

**Files:**
- Create: `E:/Soft/Cube/.claude/skills/vault-cleanup/SKILL.md`

- [ ] **Step 1: 创建目录并写 SKILL.md**

  Run: `mkdir -p "E:/Soft/Cube/.claude/skills/vault-cleanup"`

  内容：
  ```markdown
  ---
  name: vault-cleanup
  description: Use when user explicitly requests /vault-cleanup, OR on the first conversation of each calendar month. Scans Vault for stale notes, orphans, missing front-matter fields, and Inbox stragglers. Outputs a review list for user confirmation — does NOT delete/move autonomously.
  ---

  # vault-cleanup

  ## 何时触发

  - 用户显式：`/vault-cleanup` 或"清理 Vault"
  - 自动：每月首次对话启动时主动提示"要不要跑一次 Vault 清理？"

  ## 扫描规则

  | 规则 | 判定 | 建议动作 |
  |---|---|---|
  | 过时 | `updated` 字段日期 > 180 天前 **且** 无反向链接 | 归档 `40-Archive/` |
  | 孤岛 | 无反链 + 无前链 + 文件名非 `_Index` + 非 Inbox | 建链接 OR 归档 |
  | 字段缺失 | 无 `type` OR 无 `tags` OR 无 `updated` | 提示补齐 |
  | Inbox 滞留 | `00-Inbox/` 下文件 > 14 天未流转 | 分类到 PARA OR 归档 |
  | 空文件 | 大小 = 0 字节 | 删除 |

  ## 执行步骤

  1. **扫描**：遍历 `E:/Soft/Cube/` 所有 `.md` 文件（排除 `.obsidian/`、`.claude/`、`.git/`、`Templates/`）
  2. **采集元数据**：从 front-matter 提取 `updated`、`type`、`tags`；用 Grep 数反链 `[[<filename>]]`
  3. **按规则分类**：生成四类问题列表
  4. **输出报告**（markdown 表格），**不做任何修改**
  5. **等待用户确认**：用户逐条或批量同意后才执行移动 / 删除 / 编辑

  ## 输出格式示例

  ```
  ## Vault Cleanup Report (2026-04-24)

  ### 过时（建议归档）
  | 路径 | updated | 反链数 |
  |---|---|---|
  | `30-Resources/Tools/git/old-flow.md` | 2025-09-01 | 0 |

  ### 孤岛
  ...

  ### 字段缺失
  ...

  ### Inbox 滞留
  ...

  请确认：全部处理 / 选择处理 / 忽略
  ```

  ## 边界

  - **永不自主删除**：所有变更必须用户明确回应后才执行
  - 批量处理时每条列出明确的移动目标路径
  ```

### Task 16: 写 vault-promote skill

**Files:**
- Create: `E:/Soft/Cube/.claude/skills/vault-promote/SKILL.md`

- [ ] **Step 1: 创建目录并写 SKILL.md**

  Run: `mkdir -p "E:/Soft/Cube/.claude/skills/vault-promote"`

  内容：
  ```markdown
  ---
  name: vault-promote
  description: Use when a Claude Memory entry has stabilized into long-term knowledge and should migrate to the Obsidian Vault. Moves content to the appropriate PARA location, writes a pointer back in Memory. Keeps feedback/preference-type Memory entries in place.
  ---

  # vault-promote

  ## 何时触发

  - 用户说："把这条 Memory 迁到 Vault" / "这个存到 Obsidian"
  - Claude 回顾 Memory 时发现某条 `project` / `user` / `reference` 类型已足够稳定（2+ 会话引用）且值得 Vault 长期承载

  ## 可迁移的 Memory 类型

  | Memory type | 是否迁 | 迁到哪 |
  |---|---|---|
  | `feedback` | **否** | 留 Memory（偏好/红线） |
  | `project`（状态快照类） | 否 | 留 Memory（易变） |
  | `project`（决策/规则/角色类） | **是** | `10-Projects/<p>/{brand,roles,decisions,domain}/` |
  | `user`（长期背景） | 是 | `20-Areas/Personal/profile.md` 或 `company.md` |
  | `reference`（外部系统指针） | 看情况 | 若 Vault 已有对应 Tools/知识页，迁；否则留 |

  ## 执行步骤

  1. **识别 Memory 源文件**：`C:/Users/Administrator/.claude-proxy/cli/.claude/projects/C--Users-Administrator-Documents-VolunteerHelper/memory/<name>.md`
  2. **确定 Vault 目标路径**：按 `vault-write` 的落位规则
  3. **Write Vault 目标文件**：按对应模板的 front-matter 结构，把 Memory 正文内容迁入（可适当扩展细节）
  4. **更新原 Memory 文件**为指针：
     ```markdown
     ---
     name: <原 name>（指针）
     description: 详情迁到 Vault
     type: reference
     ---

     一句话摘要。详情见 `E:/Soft/Cube/<path-to-vault-file>`
     ```
  5. **更新 MEMORY.md 索引**：如果该条目的描述过长，压缩为指针形式（"详情见 Vault"）
  6. **回复用户**：汇报"已迁 `<memory-name>` → `<vault-path>`，Memory 保留为指针"

  ## 边界

  - 一次只迁一条，避免 Memory 和 Vault 同时变更混淆
  - 迁移前用 `vault-find` 确认 Vault 没有重复条目
  ```

### Task 17: 写 vault-moc skill

**Files:**
- Create: `E:/Soft/Cube/.claude/skills/vault-moc/SKILL.md`

- [ ] **Step 1: 创建目录并写 SKILL.md**

  Run: `mkdir -p "E:/Soft/Cube/.claude/skills/vault-moc"`

  内容：
  ```markdown
  ---
  name: vault-moc
  description: Use when creating a new topic Map-of-Content (_Index.md) for a directory or tag cluster. Generates a Dataview query that auto-aggregates matching notes, so the MOC stays up-to-date without manual maintenance.
  ---

  # vault-moc

  ## 何时触发

  - 某个目录 / 主题积累了 5+ 笔记但尚无索引
  - 用户要求"给 X 建一个主题地图"
  - `vault-write` 创建了新一级分类目录

  ## 执行步骤

  1. **识别主题范围**：
     - 目录型（最常见）：`FROM "<folder>"`
     - 标签型：`FROM #<tag>`
     - 混合：`FROM "<folder>" AND #<tag>`
  2. **选择查询形态**：
     - 简单列表：`LIST`
     - 带元数据：`TABLE type, updated, tags`
  3. **用 `Templates/moc.md` 模板**创建 `<folder>/_Index.md`
  4. **填充 Dataview 查询块**，指向正确路径
  5. **添加手动维护的"子主题"链接**（Dataview 查询不到的交叉引用）

  ## 示例输出

  文件 `10-Projects/VolunteerHelper/_Index.md`：

  ```markdown
  ---
  type: moc
  tags: [moc, volunteer-helper]
  updated: 2026-04-24
  ---

  # VolunteerHelper 主题地图

  ## 概览
  志愿填报辅助系统项目主入口。

  ## 内容清单
  ```dataview
  TABLE type, updated
  FROM "10-Projects/VolunteerHelper"
  WHERE type != "moc" AND file.name != "index"
  SORT type ASC, updated DESC
  ```

  ## 子主题
  - [[VolunteerHelper/index]]（项目首页）
  - 品牌：见 `brand/`
  - 角色：见 `roles/`
  - 决策：见 `decisions/`
  - 领域：见 `domain/`
  ```

  ## 边界

  - `_Index.md` 文件名固定，便于识别；同目录下 `index.md`（无下划线）是项目首页，区别开
  - Dataview 查询中 `FROM` 路径要精确到目标目录，否则会跨层级混入
  ```

### Task 18: 写 vault-new-server skill

**Files:**
- Create: `E:/Soft/Cube/.claude/skills/vault-new-server/SKILL.md`

- [ ] **Step 1: 创建目录并写 SKILL.md**

  Run: `mkdir -p "E:/Soft/Cube/.claude/skills/vault-new-server"`

  内容：
  ```markdown
  ---
  name: vault-new-server
  description: Use when recording a new server or infrastructure host. Guided flow asking for purpose/IP/SSH/credentials pattern, then writes to 20-Areas/Infrastructure/servers/<hostname>.md using the server template. Credentials use [PASSWORD_REF:] placeholder — never plaintext.
  ---

  # vault-new-server

  ## 何时触发

  - 用户提到新服务器：上线 / 接入 / 迁移 / 变更
  - 用户说："记一下这台服务器" / "/vault-new-server"

  ## 引导问题（按顺序问，用户可一次性全给）

  1. hostname / 别名 （→ 文件名）
  2. 用途（一句话）
  3. 环境（prod / staging / dev / local）
  4. IP / 域名
  5. SSH 登录（用户名、密钥路径）
  6. 运行服务列表
  7. 特别注意事项
  8. 所属项目 / 关联服务（可选）

  ## 执行步骤

  1. 用 `Templates/server.md` 为基础生成新文件
  2. 填充 front-matter：`env`、`status: active`、`updated: today`
  3. 填充正文各字段
  4. 凭据栏统一写 `[PASSWORD_REF: <hostname>-<role>]`（如 `prod-a-root`），**绝不写明文**
  5. 如果涉及内部 IP / 特殊端口 / 非公开架构 → 改落位 `20-Areas/Infrastructure/_private/<hostname>.md`（.gitignore 排除）
  6. 更新 `20-Areas/Infrastructure/_Index.md` 中的 Dataview 查询（通常无需手动改，Dataview 自动聚合）
  7. 回复："已写入 `<完整路径>`，凭据占位符 `[PASSWORD_REF: <entry>]` 待接入密码管理器后替换"

  ## 边界

  - 涉及密码 / 密钥 / token 一律占位符
  - 如果用户不小心在对话里贴了真实密码，**提醒**但仍只写占位符；让用户手动存入密码管理器
  ```

### Task 19: 提交 Phase 3

- [ ] **Step 1: 验证 6 个 skill 全部就位**

  Run:
  ```bash
  ls "E:/Soft/Cube/.claude/skills/" | sort
  ```
  Expected: 6 行 `vault-cleanup`、`vault-find`、`vault-moc`、`vault-new-server`、`vault-promote`、`vault-write`

- [ ] **Step 2: 提交**

  Run:
  ```bash
  cd "E:/Soft/Cube" && git add -A && git commit -m "feat: add 6 Claude skills for Vault read/write/cleanup/promote/moc/new-server"
  ```

---

## Phase 4：存量迁移

**前置：** Phase 2/3 已完成（目录和模板已就位）。

### Task 20: 建项目首页与 Infrastructure 索引

**Files:**
- Create: `E:/Soft/Cube/10-Projects/VolunteerHelper/index.md`
- Modify: `E:/Soft/Cube/10-Projects/LocalOCR/index.md`（从空/不存在 → 骨架）
- Modify: `E:/Soft/Cube/10-Projects/_Index.md`（加 VolunteerHelper）
- Create: `E:/Soft/Cube/20-Areas/Infrastructure/_Index.md`

- [ ] **Step 1: 写 VolunteerHelper 项目首页**

  路径 `E:/Soft/Cube/10-Projects/VolunteerHelper/index.md`：
  ```markdown
  ---
  type: project
  tags: [project, volunteer-helper]
  updated: 2026-04-24
  status: active
  started: 2026-02-01
  target: 2026-06-01
  ---

  # VolunteerHelper（智愿家）

  ## 一句话说明
  四川高考志愿填报辅助系统，C 端学生自助 + B 端老师/管理员工具，目标 2026 年 6 月高考季上线。

  ## 目标
  - [ ] 复刻 v4.4 推荐算法
  - [ ] 方案 CRUD + 交叉审核
  - [ ] 三类角色权限体系（管理员 / 老师 / 学生）
  - [ ] AI 辅助分析（优先级最低）

  ## 现状
  当前状态快照维护在 Claude Memory（`project_status_overview.md`）；长期稳定的事实见下方链接。

  ## 关键决策
  ```dataview
  TABLE status, updated
  FROM "10-Projects/VolunteerHelper/decisions"
  SORT updated DESC
  ```

  ## 角色
  ```dataview
  LIST updated
  FROM "10-Projects/VolunteerHelper/roles"
  ```

  ## 品牌
  ```dataview
  LIST updated
  FROM "10-Projects/VolunteerHelper/brand"
  ```

  ## 领域规则
  ```dataview
  LIST updated
  FROM "10-Projects/VolunteerHelper/domain"
  ```

  ## 相关
  - 代码仓库: `C:/Users/Administrator/Documents/VolunteerHelper`
  - 数据上游: [[LocalOCR/index]]
  ```

- [ ] **Step 2: 写 LocalOCR 项目首页**

  路径 `E:/Soft/Cube/10-Projects/LocalOCR/index.md`：
  ```markdown
  ---
  type: project
  tags: [project, local-ocr]
  updated: 2026-04-24
  status: active
  ---

  # LocalOCR

  ## 一句话说明
  本地 OCR 数据提取与解析系统，为 VolunteerHelper 提供数据上游。

  ## 目标
  - [ ]

  ## 关系
  - 下游: [[VolunteerHelper/index]]
  ```

- [ ] **Step 3: 更新 `10-Projects/_Index.md`**

  覆盖为：
  ```markdown
  ---
  type: moc
  tags: [index, moc]
  updated: 2026-04-24
  ---

  # 项目总览

  ```dataview
  TABLE status, started, target
  FROM "10-Projects"
  WHERE type = "project"
  SORT status ASC, updated DESC
  ```

  ## 手动索引
  - [[VolunteerHelper/index]] — 志愿填报系统（active, → 2026-06）
  - [[LocalOCR/index]] — OCR 数据上游（active）
  ```

- [ ] **Step 4: 写 Infrastructure `_Index.md`**

  路径 `E:/Soft/Cube/20-Areas/Infrastructure/_Index.md`：
  ```markdown
  ---
  type: moc
  tags: [moc, infrastructure]
  updated: 2026-04-24
  ---

  # 基础设施

  ## 服务器
  ```dataview
  TABLE env, status, updated
  FROM "20-Areas/Infrastructure/servers"
  WHERE type = "server"
  SORT env ASC, updated DESC
  ```

  ## 域名
  ```dataview
  LIST updated
  FROM "20-Areas/Infrastructure/domains"
  ```

  ## 敏感详情
  见 `_private/`（本地，.gitignore 排除）
  ```

- [ ] **Step 5: 提交**

  Run:
  ```bash
  cd "E:/Soft/Cube" && git add -A && git commit -m "feat: scaffold project index pages and infrastructure MOC"
  ```

### Task 21: 迁移"立方公司品牌"→ Personal/company.md

**Files:**
- Create: `E:/Soft/Cube/20-Areas/Personal/company.md`
- Modify: `C:/Users/Administrator/.claude-proxy/cli/.claude/projects/C--Users-Administrator-Documents-VolunteerHelper/memory/user_company_brand.md`

- [ ] **Step 1: 读 Memory 源内容**

  Run: `cat "C:/Users/Administrator/.claude-proxy/cli/.claude/projects/C--Users-Administrator-Documents-VolunteerHelper/memory/user_company_brand.md"`

- [ ] **Step 2: 写 `20-Areas/Personal/company.md`**

  ```markdown
  ---
  type: area
  tags: [personal, company, brand]
  updated: 2026-04-24
  ---

  # 立方公司

  ## 品牌规则
  公司名"立方"，所有产品以此为前缀/后缀命名。

  ## 产品线
  - 智愿家（VolunteerHelper）—— 志愿填报

  ## 来源
  从 Claude Memory `user_company_brand.md` 迁入 2026-04-24
  ```

- [ ] **Step 3: 改 Memory 为指针**

  覆盖 `user_company_brand.md` 为：
  ```markdown
  ---
  name: 立方公司品牌（指针）
  description: 公司品牌详情见 Vault
  type: reference
  ---

  公司名"立方"，产品以此为前缀/后缀。详情：`E:/Soft/Cube/20-Areas/Personal/company.md`
  ```

### Task 22: 迁移"产品品牌决策（智愿家）"→ VolunteerHelper/brand/smart-wish-home.md

**Files:**
- Create: `E:/Soft/Cube/10-Projects/VolunteerHelper/brand/smart-wish-home.md`
- Modify: `C:/Users/Administrator/.claude-proxy/cli/.claude/projects/C--Users-Administrator-Documents-VolunteerHelper/memory/project_brand_decision.md`

- [ ] **Step 1: 读 Memory 源**

  Run: `cat "C:/Users/Administrator/.claude-proxy/cli/.claude/projects/C--Users-Administrator-Documents-VolunteerHelper/memory/project_brand_decision.md"`

- [ ] **Step 2: 写 Vault 文件**

  ```markdown
  ---
  type: decision
  tags: [decision, volunteer-helper, brand]
  updated: 2026-04-24
  status: accepted
  project: VolunteerHelper
  ---

  # 产品品牌：智愿家

  ## Context
  产品需要一个能体现"智识 + 愿景 + 家庭陪伴"的品牌名。前期候选"巅峰智选"过于功利。

  ## Decision
  定名**智愿家**，Claude 路线走"温暖智识"风格（而非冰冷技术或功利炒作）。

  ## Consequences
  - 所有 UI 文案、产品物料围绕"温暖智识"基调
  - 与立方公司品牌叠加："立方智愿家"作为完整表达

  ## Alternatives considered
  - 巅峰智选（已淘汰，功利感太强）

  ## 来源
  从 Claude Memory `project_brand_decision.md` 迁入 2026-04-24
  ```

- [ ] **Step 3: 改 Memory 为指针**

  覆盖：
  ```markdown
  ---
  name: 产品品牌决策（指针）
  description: 智愿家品牌决策详情见 Vault
  type: reference
  ---

  产品名"智愿家"，Claude 温暖智识路线。详情：`E:/Soft/Cube/10-Projects/VolunteerHelper/brand/smart-wish-home.md`
  ```

### Task 23: 迁移"用户角色体系"→ VolunteerHelper/roles/overview.md

**Files:**
- Create: `E:/Soft/Cube/10-Projects/VolunteerHelper/roles/overview.md`
- Modify: Memory `project_user_roles.md`

- [ ] **Step 1: 读源**

  Run: `cat "C:/Users/Administrator/.claude-proxy/cli/.claude/projects/C--Users-Administrator-Documents-VolunteerHelper/memory/project_user_roles.md"`

- [ ] **Step 2: 写 Vault 文件**

  ```markdown
  ---
  type: area
  tags: [volunteer-helper, roles, overview]
  updated: 2026-04-24
  project: VolunteerHelper
  ---

  # 用户角色体系

  ## 三类角色

  1. **管理员** —— 超级角色 + 可配置权限覆盖，可以直接创建老师/学生
  2. **老师** —— 核心工作流用户，见 [[teacher]]
  3. **学生** —— C 端轻量自助 + 查看老师方案，见 [[student]]

  ## 设计原则
  C 端（学生）+ 专家工具（老师/管理员）双端兼顾。

  ## 来源
  从 Claude Memory `project_user_roles.md` 迁入 2026-04-24
  ```

- [ ] **Step 3: 改 Memory 为指针**

  ```markdown
  ---
  name: 用户角色体系（指针）
  description: 三类角色详情见 Vault
  type: reference
  ---

  三类角色：管理员、老师、学生。详情：`E:/Soft/Cube/10-Projects/VolunteerHelper/roles/overview.md`
  ```

### Task 24: 迁移"老师工作流需求"→ roles/teacher.md

**Files:**
- Create: `E:/Soft/Cube/10-Projects/VolunteerHelper/roles/teacher.md`
- Modify: Memory `project_teacher_workflow.md`

- [ ] **Step 1: 读源**

  Run: `cat "C:/Users/Administrator/.claude-proxy/cli/.claude/projects/C--Users-Administrator-Documents-VolunteerHelper/memory/project_teacher_workflow.md"`

- [ ] **Step 2: 写 Vault 文件**

  ```markdown
  ---
  type: area
  tags: [volunteer-helper, roles, teacher]
  updated: 2026-04-24
  project: VolunteerHelper
  ---

  # 老师工作流

  ## 核心能力
  完整复刻 v4.4 推荐算法 + 方案 CRUD + 交叉审核。

  ## 主要动作
  - 学生信息管理（直接创建学生账号）
  - 运行推荐算法生成方案
  - 方案版本管理（创建、编辑、对比、审核）
  - 交叉审核（同事互审）
  - 最终确定后推送给学生

  ## 与管理员的区别
  - 管理员可配置权限覆盖
  - 管理员可看全体老师的方案
  - 老师仅管理自己的学生

  ## 来源
  从 Claude Memory `project_teacher_workflow.md` 迁入 2026-04-24
  ```

- [ ] **Step 3: 改 Memory 为指针**

  ```markdown
  ---
  name: 老师工作流需求（指针）
  description: 老师能力与工作流详情见 Vault
  type: reference
  ---

  完整复刻 v4.4 算法 + 方案 CRUD + 交叉审核。详情：`E:/Soft/Cube/10-Projects/VolunteerHelper/roles/teacher.md`
  ```

### Task 25: 迁移"学生端功能边界"→ roles/student.md

**Files:**
- Create: `E:/Soft/Cube/10-Projects/VolunteerHelper/roles/student.md`
- Modify: Memory `project_student_scope.md`

- [ ] **Step 1: 读源**

  Run: `cat "C:/Users/Administrator/.claude-proxy/cli/.claude/projects/C--Users-Administrator-Documents-VolunteerHelper/memory/project_student_scope.md"`

- [ ] **Step 2: 写 Vault 文件**

  ```markdown
  ---
  type: area
  tags: [volunteer-helper, roles, student]
  updated: 2026-04-24
  project: VolunteerHelper
  ---

  # 学生端功能边界

  ## 开放能力
  - 轻量自助：基础信息填报、看推荐方案
  - 查看老师定制的方案
  - 简单交互（点赞、备注）

  ## 暂不开放
  完整算法（位次推导、黑名单、参数调优等专家能力）仅老师可用。

  ## 后续规划
  AI 辅助采集（让学生通过对话渐进式完善信息），优先级最低。

  ## 来源
  从 Claude Memory `project_student_scope.md` 迁入 2026-04-24
  ```

- [ ] **Step 3: 改 Memory 为指针**

  ```markdown
  ---
  name: 学生端功能边界（指针）
  description: 学生端能力详情见 Vault
  type: reference
  ---

  轻量自助 + 查看老师方案，不开放完整算法。详情：`E:/Soft/Cube/10-Projects/VolunteerHelper/roles/student.md`
  ```

### Task 26: 迁移"权限体系设计（CASL）"→ decisions/casl-rbac.md

**Files:**
- Create: `E:/Soft/Cube/10-Projects/VolunteerHelper/decisions/casl-rbac.md`
- Modify: Memory `project_rbac_design.md`

- [ ] **Step 1: 读源**

  Run: `cat "C:/Users/Administrator/.claude-proxy/cli/.claude/projects/C--Users-Administrator-Documents-VolunteerHelper/memory/project_rbac_design.md"`

- [ ] **Step 2: 写 Vault 文件（用 decision 模板结构）**

  ```markdown
  ---
  type: decision
  tags: [decision, volunteer-helper, rbac, security]
  updated: 2026-04-24
  status: accepted
  project: VolunteerHelper
  ---

  # 权限体系：CASL + 超级角色 + 配置覆盖

  ## Context
  三类角色（管理员/老师/学生）+ 老师能直接创建学生 + 管理员可配置权限覆盖 → 简单 RBAC 不够灵活，需要细粒度权限 + 动态策略能力。

  ## Decision
  采用 **CASL**（@casl/ability）作为权限引擎：
  - 管理员为超级角色，默认允许所有
  - 可配置权限覆盖（针对特定老师/场景开/关能力）
  - 老师可直接创建学生（权限向下传递）

  ## Consequences
  - 前后端权限一致（CASL 同构）
  - 新增能力只改 ability 定义，不改业务代码
  - 配置面需要 UI 支持（管理员后台）
  - 学习曲线：CASL 语法、condition 写法

  ## Alternatives considered
  - 传统 RBAC：不够灵活
  - 手写中间件：维护成本高

  ## 来源
  从 Claude Memory `project_rbac_design.md` 迁入 2026-04-24
  ```

- [ ] **Step 3: 改 Memory 为指针**

  ```markdown
  ---
  name: 权限体系设计（指针）
  description: CASL 权限体系详情见 Vault
  type: reference
  ---

  CASL + 超级角色 + 配置覆盖 + 老师直接创建学生。详情：`E:/Soft/Cube/10-Projects/VolunteerHelper/decisions/casl-rbac.md`
  ```

### Task 27: 迁移"征集异常业务规则"→ domain/recruitment-rules.md

**Files:**
- Create: `E:/Soft/Cube/10-Projects/VolunteerHelper/domain/recruitment-rules.md`
- Modify: Memory `project_recruitment_plan_rules.md`

- [ ] **Step 1: 读源**

  Run: `cat "C:/Users/Administrator/.claude-proxy/cli/.claude/projects/C--Users-Administrator-Documents-VolunteerHelper/memory/project_recruitment_plan_rules.md"`

- [ ] **Step 2: 写 Vault 文件**

  ```markdown
  ---
  type: card
  tags: [volunteer-helper, domain, recruitment, business-rule]
  updated: 2026-04-24
  project: VolunteerHelper
  ---

  # 征集志愿业务规则

  ## 一句话
  征集志愿的"计划数递增/超计划录取/轮次断档"都是合法业务现象，**不作为数据质量门禁**，只降级为 INFO 级告警。

  ## 背景 / 机制
  征集志愿是正常招生之外的补录阶段，本质上是动态调整：
  - 计划数递增：学校临时增加招生
  - 超计划录取：有合格学生超过初始计划
  - 轮次断档：某年某批次无征集不代表数据错

  数据 pipeline 里容易把这些当异常报出来。

  ## 适用场景
  - 数据质量门禁配置：把以上三条规则标记为 INFO 而非 ERROR
  - 数据整合模块的 schema 校验

  ## 反例 / 边界
  真正的数据错误（字段缺失、类型不符）仍要 ERROR。

  ## 来源
  从 Claude Memory `project_recruitment_plan_rules.md` 迁入 2026-04-24
  ```

- [ ] **Step 3: 改 Memory 为指针**

  ```markdown
  ---
  name: 征集异常业务规则（指针）
  description: 征集志愿业务规则详情见 Vault
  type: reference
  ---

  计划递增/超计划/轮次断档都合法，降级 INFO 不作门禁。详情：`E:/Soft/Cube/10-Projects/VolunteerHelper/domain/recruitment-rules.md`
  ```

### Task 28: 迁移 About Me.md → Personal/profile.md

**Files:**
- Create: `E:/Soft/Cube/20-Areas/Personal/profile.md`
- Delete: `E:/Soft/Cube/About Me.md`

- [ ] **Step 1: 读原文件（确认当前内容）**

  Run: `cat "E:/Soft/Cube/About Me.md"`
  Expected: 空模板（只有 front-matter 和四个空标题）

- [ ] **Step 2: 写 `20-Areas/Personal/profile.md`（扩展版，等待用户后续填充）**

  ```markdown
  ---
  type: area
  tags: [personal, me, profile]
  updated: 2026-04-24
  ---

  # 个人档案

  ## 角色
  <软件工程师 / 创业者 / 数据科学家 / ...（待填）>

  ## 技能栈
  - 后端:
  - 前端:
  - 数据:
  - AI:
  - DevOps:

  ## 当前关注方向
  - VolunteerHelper 项目（志愿填报系统）
  - LocalOCR（数据上游）
  - Obsidian + Claude 长期记忆体系

  ## 工作偏好
  （摘要，详细偏好见 Claude Memory feedback 类）
  - 中文回复，技术术语保留英文
  - 说重点，不打补丁追根因
  - 只做最终验收，中间技术决策由 Claude 自主

  ## 公司
  见 [[company]]

  ## 学习轨迹
  见 [[learning-log]]（可选）
  ```

- [ ] **Step 3: 删除 `About Me.md`**

  Run: `rm "E:/Soft/Cube/About Me.md"`

- [ ] **Step 4: 提交迁移**

  Run:
  ```bash
  cd "E:/Soft/Cube" && git add -A && git commit -m "feat: migrate 7 long-term Memory entries to Vault; rewrite About Me as Personal/profile"
  ```

### Task 29: 更新 MEMORY.md 索引

**Files:**
- Modify: `C:/Users/Administrator/.claude-proxy/cli/.claude/projects/C--Users-Administrator-Documents-VolunteerHelper/memory/MEMORY.md`

- [ ] **Step 1: 读当前 MEMORY.md**

  Run: `cat "C:/Users/Administrator/.claude-proxy/cli/.claude/projects/C--Users-Administrator-Documents-VolunteerHelper/memory/MEMORY.md"`

- [ ] **Step 2: 把 7 条已迁移条目的 hook 改为"指针，详见 Vault"**

  具体要改的 7 行（描述文本更新为更短的指针说明）：
  - `[立方公司品牌](user_company_brand.md) — 指针 → Vault Personal/company.md`
  - `[产品品牌决策](project_brand_decision.md) — 指针 → Vault 10-Projects/VolunteerHelper/brand/smart-wish-home.md`
  - `[用户角色体系](project_user_roles.md) — 指针 → Vault roles/overview.md`
  - `[老师工作流需求](project_teacher_workflow.md) — 指针 → Vault roles/teacher.md`
  - `[学生端功能边界](project_student_scope.md) — 指针 → Vault roles/student.md`
  - `[权限体系设计](project_rbac_design.md) — 指针 → Vault decisions/casl-rbac.md`
  - `[征集异常业务规则](project_recruitment_plan_rules.md) — 指针 → Vault domain/recruitment-rules.md`

  用 Edit 工具逐行替换原 hook。

- [ ] **Step 3: 在 MEMORY.md 顶部加一行指引**

  在第一个 `- [` 之前插入：
  ```markdown
  > **Vault 联动**：长期知识已迁到 Obsidian Vault `E:/Soft/Cube/`。下面标注"指针"的条目只存路径；新知识写入走 `vault-write` skill。

  ```

- [ ] **Step 4: 验证 MEMORY.md 行数未超 200**

  Run: `wc -l "C:/Users/Administrator/.claude-proxy/cli/.claude/projects/C--Users-Administrator-Documents-VolunteerHelper/memory/MEMORY.md"`
  Expected: < 200 行

### Task 30: 最终验收 + Phase 4 提交

- [ ] **Step 1: 跑 `vault-find` 验证能找到迁移的 7 条**

  交互测试：在 Claude Code 新会话里问"Vault 里有关于智愿家的记录吗"
  Expected: 返回 `10-Projects/VolunteerHelper/brand/smart-wish-home.md`

- [ ] **Step 2: 检查 Memory 指针全部生效**

  Run:
  ```bash
  grep -l "指针" "C:/Users/Administrator/.claude-proxy/cli/.claude/projects/C--Users-Administrator-Documents-VolunteerHelper/memory/"*.md
  ```
  Expected: 列出 7 个迁移过的 `.md` 文件

- [ ] **Step 3: 提交最终状态**

  Run:
  ```bash
  cd "E:/Soft/Cube" && git status
  ```
  Expected: working tree clean（前面阶段已全部提交）

  如果有残留：
  ```bash
  cd "E:/Soft/Cube" && git add -A && git commit -m "chore: finalize Vault migration phase 4"
  ```

- [ ] **Step 4: 推送远程（可选，用户决定是否建私有 GitHub 仓库）**

  如果用户已创建私有仓库：
  ```bash
  cd "E:/Soft/Cube" && git remote add origin <repo-url> && git push -u origin main
  ```

---

## Self-Review Notes

1. **Spec 覆盖检查**：设计 spec §1-§7 全覆盖（分工 §1 / 结构 §2 / 模板 §3 / skills §4 / 迁移 §5 / 同步 §6 / 阶段 §7）。
2. **Placeholder 扫描**：无 TBD/TODO；`profile.md` 的角色/技能栈字段留空是设计意图（等用户填），已在模板里标注"待填"。
3. **类型一致性**：`type` 字段值全计划统一：`project` / `area` / `card` / `decision` / `server` / `person` / `tool` / `moc` / `reference`（Memory 指针）。
