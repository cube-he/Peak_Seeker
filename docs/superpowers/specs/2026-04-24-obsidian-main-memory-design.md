---
title: Obsidian 长期主记忆方案（Cube Vault 增强）
date: 2026-04-24
status: approved
vault: E:\Soft\Cube
---

# Obsidian 长期主记忆方案（Cube Vault 增强）

## 目标

把 Obsidian Vault (`E:\Soft\Cube`) 打造成跨会话、跨项目的长期主记忆主库，承载：项目知识、服务器/基础设施、个人背景、所有资源、想法、跨项目复用知识。Claude 自主读写，定期清理。

## 1. 架构总览

### 1.1 分工边界（Memory vs Vault）

- **Claude Memory**（`.claude-proxy/.../memory/`）—— 偏好、红线规则、当前活跃任务/项目状态快照
- **Obsidian Vault**（`E:\Soft\Cube`）—— 长期知识、资源、想法、人物、服务器、个人背景
- **交界处理**：模糊归属（如"项目现状"）走"Memory 短快照 + Vault 长档案"双存，相互引用；两者由 `vault-promote` skill 保证一致

### 1.2 不扩展 PARA

保留标准 PARA + Daily + Templates 六层顶级目录。理由：PARA 已跑通，扩展会带来长期维护成本；"想法"走 Inbox → 流转到 Projects/Resources 是 PARA 原设计意图。

### 1.3 读写模式

- Claude 在判定"长期价值"时**自主写入**
- 每次写入后在回复中告知：写了什么、路径在哪
- 用户通过 `/vault-cleanup` 命令周期性审查（月度 + 即时）

### 1.4 敏感信息

- `20-Areas/Infrastructure/_private/` 子目录 + `.gitignore` 排除
- 凭据写占位符 `[PASSWORD_REF: <entry-name>]`
- 推荐（非强制）装 KeePassXC，占位符未来直接映射其条目，零迁移

## 2. 目录结构

```
E:\Soft\Cube\
├── 00-Inbox/                          未分类捕获入口
│
├── 10-Projects/
│   ├── _Index.md                      项目总览（Dataview 聚合）
│   ├── LocalOCR/
│   │   └── index.md                   项目首页
│   └── VolunteerHelper/               [新增]
│       ├── index.md
│       ├── brand/                     品牌决策（立方/智愿家）
│       ├── roles/                     角色体系（管理员/老师/学生）
│       ├── decisions/                 技术决策（CASL、User 拆分等）
│       └── domain/                    业务规则（征集异常、填报算法）
│
├── 20-Areas/
│   ├── Personal/                      [新增]
│   │   ├── profile.md                 角色/技能栈/当前方向/偏好
│   │   ├── company.md                 立方公司背景
│   │   └── learning-log.md            学习轨迹
│   ├── Infrastructure/                [新增]
│   │   ├── _Index.md                  服务器清单（Dataview）
│   │   ├── servers/                   一机一文件
│   │   ├── domains/                   域名
│   │   └── _private/                  [gitignore] 敏感细节
│   ├── AI-ML/
│   ├── Data-Processing/
│   └── Programming/                   Python/JS/DevOps
│
├── 30-Resources/
│   ├── knowledge/                     [新增] 跨项目知识
│   │   ├── data-contracts/            数据契约（LocalOCR → VolunteerHelper）
│   │   ├── architecture/              可复用架构模式
│   │   └── ai-engineering/            Claude Code / Prompt / Skill 经验
│   ├── Tools/                         工具速查
│   │   ├── claude-code/
│   │   ├── obsidian/
│   │   ├── git/
│   │   └── python/ nodejs/ ...        按需
│   ├── Code-Snippets/
│   └── Bookmarks/
│
├── 40-Archive/
├── 50-Daily/
└── Templates/
```

### 2.1 命名与 front-matter 规范

- **文件名**：英文 kebab-case（`prod-a.md`、`casl-rbac.md`）
- **front-matter 必填字段**：`tags`（≥1）、`updated`（YYYY-MM-DD）、`type`（project/area/resource/server/person/card/decision/tool/moc）
- **链接**：优先使用 `[[wiki 链接]]`
- **MOC**：每个主要目录一个 `_Index.md`（Dataview 查询自动聚合）

## 3. 模板集

存放 `Templates/`，Templater 驱动。

### 3.1 新增模板（7 个）

| 模板 | 用途 |
|---|---|
| `project.md` | 项目首页（取代"项目笔记.md"） |
| `server.md` | 服务器条目（IP/SSH/凭据占位/注意事项） |
| `person.md` | 人物（客户/同事/联系人） |
| `decision.md` | 架构决策记录（ADR 轻量版） |
| `knowledge-card.md` | 原子知识卡（跨项目复用） |
| `tool.md` | 工具/命令速查条目 |
| `moc.md` | 主题地图（Dataview 查询模板） |

### 3.2 保留模板

`Daily.md`、`Bug 记录.md`、`快速笔记.md`。

### 3.3 弃用模板

`项目笔记.md` → 被 `project.md` 替代，阶段 P2 删除。

### 3.4 模板样例

**`server.md`**
```markdown
---
type: server
tags: [infrastructure/server]
updated: {{date:YYYY-MM-DD}}
env: <prod|staging|dev>
status: active
---

# <服务器名>

## 用途
## 接入
- IP:
- SSH: `ssh user@host`
- 密钥: `~/.ssh/id_xxx`
- 凭据: [PASSWORD_REF: <entry-name>]

## 运行服务
## 注意事项
## 相关
- 项目: [[]]
```

**`decision.md`**（ADR 轻量版）
```markdown
---
type: decision
tags: [decision, <project-name>]
updated: {{date:YYYY-MM-DD}}
status: <proposed|accepted|superseded>
---

# <决策标题>

## Context
## Decision
## Consequences
## Alternatives considered
```

**`knowledge-card.md`**
```markdown
---
type: card
tags: [<domain>]
updated: {{date:YYYY-MM-DD}}
---

# <知识点标题>

## 一句话
## 背景 / 机制
## 适用场景
## 反例 / 边界
## 相关
```

## 4. Claude 访问层：Skills

位置：`E:\Soft\Cube\.claude\skills\`，每个 skill 一个 SKILL.md 声明触发条件和操作步骤。

### 4.1 Skill 清单（6 个）

| Skill | 触发 | 行为 |
|---|---|---|
| `vault-write` | Claude 判定长期价值内容 | 按类型自动落位，生成 front-matter，更新相关 MOC，回复告知路径 |
| `vault-find` | 用户问"之前记过 X 吗" 或 Claude 需要查背景 | Glob + Grep + Dataview 语义搜索，返回 top-N |
| `vault-cleanup` | 用户 `/vault-cleanup` 或每月首次对话 | 扫描过时/孤岛/字段缺失/Inbox 滞留，输出清单，用户确认后批处理 |
| `vault-promote` | 从 Memory 晋升长期知识到 Vault | 按 §1.1 分工判断转移；Memory 改指针 |
| `vault-moc` | 建主题地图 | 从 tag/路径生成 Dataview 查询输出到 `_Index.md` |
| `vault-new-server` | 记录新服务器 | 引导问用途/IP/SSH，落位 `20-Areas/Infrastructure/servers/` |

### 4.2 `vault-write` 判定规则

| 内容 | 落位 | 写入标准 |
|---|---|---|
| 项目品牌/角色/决策 | `10-Projects/<p>/*` | 影响跨会话的固定事实 |
| 跨项目可复用经验 | `30-Resources/knowledge/` 或 `Tools/` | 预期 ≥2 个场景会用 |
| 服务器/域名/账号 | `20-Areas/Infrastructure/` | 任何基础设施细节 |
| 个人背景变化 | `20-Areas/Personal/profile.md` | 角色/技能/方向长期变化 |
| 想法/灵感/半成品 | `00-Inbox/YYYY-MM-DD-<slug>.md` | 归属不确定时先捕获 |
| 会话当前状态 | 不写 Vault（留 Memory） | 易变、会话后过时 |
| 偏好/红线 | 不写 Vault（留 Memory） | feedback 类 |

### 4.3 `vault-cleanup` 规则

- 过时：`updated` 超 180 天 + 无反链 → 建议归档 `40-Archive/`
- 孤岛：无反链 + 无前链 + 非 `_Index` → 建议建链或归档
- 字段缺失：无 `type`/`tags` → 提示补齐
- Inbox 滞留：超 14 天 → 提示流转
- 所有删除/移动先列清单，用户确认后执行（不自主删除）

## 5. 存量迁移（选择性，C 方案）

### 5.1 迁移 7 条 Memory 条目

| Memory 原条目 | 迁到 Vault 位置 | Memory 替换为 |
|---|---|---|
| 立方公司品牌 | `20-Areas/Personal/company.md` | 指针 |
| 产品品牌决策（智愿家） | `10-Projects/VolunteerHelper/brand/smart-wish-home.md` | 指针 |
| 用户角色体系 | `10-Projects/VolunteerHelper/roles/overview.md` | 指针 |
| 老师工作流需求 | `10-Projects/VolunteerHelper/roles/teacher.md` | 指针 |
| 学生端功能边界 | `10-Projects/VolunteerHelper/roles/student.md` | 指针 |
| 权限体系设计（CASL） | `10-Projects/VolunteerHelper/decisions/casl-rbac.md`（用 `decision.md`） | 指针 |
| 征集异常业务规则 | `10-Projects/VolunteerHelper/domain/recruitment-rules.md` | 指针 |

### 5.2 保留在 Memory

- 所有 feedback 类（用户偏好、红线规则、API 排查经验）
- 项目状态快照（项目现状、时间线）
- 其余长期项：保留，由 `vault-promote` 在用到时逐条迁移

### 5.3 Memory 指针格式

```markdown
---
name: 产品品牌决策（指针）
description: 品牌详情见 Vault
type: reference
---

产品名"智愿家"，详情见：`E:\Soft\Cube\10-Projects\VolunteerHelper\brand\smart-wish-home.md`
```

## 6. 同步、备份、杂项

### 6.1 同步策略

采用 **git + 私有远程**：
- Vault 根 `git init`
- `.gitignore`：`.obsidian/workspace*`、`.obsidian/cache/`、`_private/`、`.claudian/sessions/`、`.trash/`
- 推到 GitHub/Gitee 私有仓库
- Obsidian Git 插件：每小时自动 commit + push

### 6.2 插件补装

- **Obsidian Git**（同步） — 新增
- **Periodic Notes**（周/月笔记） — 新增
- Dataview、Templater、Calendar、Tag Wrangler、Claudian — 已有

### 6.3 根目录遗留清理

| 文件 | 处理 |
|---|---|
| `欢迎.md` | 删除 |
| `创建链接.md` | 删除 |
| `About Me.md` | 迁入 `20-Areas/Personal/profile.md` 后删除 |
| `LocalOCR.md`（空） | 删除；内容重建于 `10-Projects/LocalOCR/index.md` |

## 7. 落地阶段（预览，任务级拆解归 writing-plans）

| Phase | 内容 | 交付物 |
|---|---|---|
| **P1 基础设施** | git 初始化 + `.gitignore` + 清理根目录遗留 + 装 Obsidian Git/Periodic Notes | Vault 可提交、可回溯 |
| **P2 结构与模板** | 建新目录 + 写 7 个新模板 + 弃用"项目笔记.md" | Claude 可按模板落位 |
| **P3 Claude 接入** | 写 6 个 skill 到 `.claude/skills/` | Claude 可自主读写 Vault |
| **P4 存量迁移** | 迁 7 条 Memory 条目 + 建项目首页 + Personal/profile + `_Index.md` | Vault 有初始内容，Memory 改指针 |

依赖：P1 → P2 → P3 → P4（线性）。

## 8. 非目标

- 不做数字花园/Publish 发布
- 不做 AI 全自动分类摘要（Claude 按规则写即可）
- 不引入新方法论（Zettelkasten/LYT/ACE），PARA 保持
- 不做 Memory 全量迁移（C 方案：选择性）
- 不做 Obsidian 加密插件（破坏 Claude 读权）
