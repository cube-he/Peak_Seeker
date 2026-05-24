# 院校详情页 · "招录详情" 专业组视图 — 设计文档

**日期**：2026-05-24
**作者**：Claude + 用户协同 brainstorming
**状态**：Draft → 待用户 review

---

## 1. 背景

院校详情页 (`apps/web/src/app/(main)/universities/[id]/page.tsx`) 目前提供 3 个 Tab：基本信息 / 招生计划 / 历年录取。后两个都是"专业 × 年份"的 pivot 表，用户进来无法直接看到"这所学校的专业组怎么招、组里有什么专业、组的最低调档线是多少"这种填报核心信息。

用户提出的 4 个核心诉求：
1. 院校基础信息（已有 ✓）
2. 院校最低调档线
3. 院校在川招生的"专业组" + 每组最低调档线 + 组内专业及调档线
4. 院校内专业排名

---

## 2. 范围（第一批）

本 spec 仅覆盖第一批改动：

- 用新 Tab `招录详情` **替换**现有的 `招生计划` 和 `历年录取` 两个 Tab
- 新 Tab 顶部展示**院校最低调档线总览**（解决需求 2）
- 主体是**专业组卡片组**：每组一张卡，展开后看组内专业（解决需求 3）
- 专业行带 **graceful 排名/学科评估 chip**，有数据显示、无数据自动隐藏（部分解决需求 4）

**不在本批范围**：
- `Major.majorRanking` 数据补齐（38% 填充率属可用但稀疏）
- 软科专业排名权威化（当前只有字符串字段）
- 院校间专业排名对比、专业推荐
- 收藏 / 加入方案的交互

---

## 3. 关键数据事实（已采样验证）

通过 SSH 远程连库（132.232.245.53）查询全库 / 10498 院校样本：

| 字段 | 全库填充率 | 10498 填充 | 用途 |
|---|---|---|---|
| `enrollment_plans.major_ranking` | 37.8% (44854/118715) | 0/8 | 专业排名名次（字符串数字 "1"/"65"） |
| `enrollment_plans.discipline_eval` | 17.7% | 0 | 学科评估，"软科：A+，校友会：A+" 文本 |
| `enrollment_plans.is_national_feature` | 5.0% | 0 | 国家特色专业 boolean |
| `majors.major_soft_rating` | 21.1% (421/1997) | 0/2 | 软科 A+/A/B+ |
| `universities.min_score_physics/history` 等 | — | — | 院校级最低分/位次冗余存储 |

**结论**：985/211 院校大概率有 chip 数据，10498 这种小院校自然降级（chip 全隐藏）。

**Batch 字段的实际分布**（四川考生数据）：
- 没有"本科二批" — 早已合并
- 主流是 `本科一批 B段`（普通本科批），`本科一批 A段` 是少数特殊类型
- 其他批次：本科提前批 A/B、高职(专科)批、本科一批(高校专项/地方专项/民族班)

---

## 4. 设计决策

### 4.1 总体 Tab 结构

```
[概览]  [招录详情 ★ NEW]  [强基计划（条件）]
```

- 旧的 "招生计划" / "历年录取" Tab **整体删除**
- 旧的 `PlanPivotTable` / `AdmissionPivotTable` 组件保留代码不删除（防止他处引用），但从详情页移除挂载
- 顶部 sticky nav 同步更新为 `概览 / 招录详情`

### 4.2 "招录详情" Tab 内部结构

从上到下三段：

```
┌─────────────────────────────────────────────┐
│ 院校最低调档线总览（约 200px 高）            │
│   科类切换：物理类 / 历史类                  │
│   批次切换：本科批 / 提前批 / 高职专科       │
│   主体：2024 大数字 + 历年 3 卡 + 差额说明   │
│   配色：跟下面卡片一致的冲红/稳蓝/保绿色带   │
├─────────────────────────────────────────────┤
│ 专业组卡片组（按 年 × 科类 × 批次 自然分组）│
│   每张卡：左色带 + 右上 chip + 卡内 3 年    │
│   折叠态：组头 + 3 年小卡 + 差额说明         │
│   展开态：+ 组内专业行（带 ranking chip）    │
├─────────────────────────────────────────────┤
│ （可选）空状态 / "暂无数据" 提示             │
└─────────────────────────────────────────────┘
```

### 4.3 院校最低调档线总览（需求 2）

**数据源**：`AdmissionRecord.university_min_rank/university_min_score` 按 `(year, subjects, batch)` 维度聚合。`universities.min_score_physics/history` 等冗余字段作为 fallback（service 已存但未透传）。

**批次归类规则**（前端 startsWith）：
- `本科一批*` → "本科批"
- `本科提前批*` → "提前批"
- `高职*` → "高职专科"

聚合方式：每个类别下，取所有匹配 batch 中 `university_min_rank` 最小的（即最难考的最低分），作为总览值。

**默认值**：
- 科类：`examInfo.subjects?.[0]` 推断（含"物"→ 物理类，含"史"→ 历史类），否则物理类
- 批次：本科批

**关键 UX 规则**：总览栏的科类 / 批次切换器**同时也是下面专业组卡片组的过滤器** — 切换后只显示该科类 + 该批次类别下的专业组卡片。这保证总览数字和卡片列表始终在同一维度上。底部一行小字 "查看其他科类/批次的专业组 →" 可点开展开折叠的其他批次（次级折叠态，避免卡片列表无限长）。

**用户位次叠加（冲稳保）**：
- 用户 `examInfo.rank` 跟院校最低位次比较
- 复用 `apps/web/src/utils/classify-rank.ts` 里的 `classifyRank` / `getTier` 函数
- 显示色带 + 右上 chip + 一行差额文案
- 用户未填位次时：色带降级为灰色 + chip 隐藏 + 文案改为 "输入位次以查看冲稳保"

### 4.4 专业组卡片（需求 3 主体）

**数据源**：`AdmissionRecord` 表（已含 `group_code/group_name/group_min_score/group_min_rank`），按 `(year, subjects, batch, group_code)` group_by。

**默认展开顺序**：
1. 年份降序（最新优先）
2. 当前选中科类 + 批次的优先（直接折叠/隐藏其他科类批次的卡片到底部小标签 "查看其他科类/批次 →"）
3. 同组的多年数据合并到一张卡（取最新年作为卡头，3 年并排显示）

**卡片折叠态**：
```
┌──┬─────────────────────────────────────────┐
│色│ 📦 9999 · 工科试验班      [冲 chip] [▾]│
│带│ 物理类 · 本科一批 B段 · 物+化 · 招 45人 │
│  │ ┌────┬────┬────┐                       │
│  │ │2024│2023│2022│                       │
│  │ │612 │608 │605 │                       │
│  │ │#4521#4890#5200                       │
│  │ └────┴────┴────┘                       │
│  │ 2024 组最低 #4521 · 你 #6800 · 差 2279 │
└──┴─────────────────────────────────────────┘
```

**卡片展开态**：折叠态下方再显示**组内专业列表**（见 4.5）

**冲稳保规则**：用 `group_min_rank` 而非院校最低，对每张卡独立判断

### 4.5 组内专业行（需求 3 子层 + 需求 4 graceful）

**数据源**：`AdmissionRecord` 同条记录已包含 `major_min_score/major_min_rank` 和 `major_name/major_code`。`enrollment_plans` 表提供 `major_ranking/discipline_eval/is_national_feature` 三个 chip 字段。

**展示**：每个专业一行
```
[专业名]  [软科 #12 chip]  [A+ chip]  [国家特色 chip]
代码 080901 · 计划 10 人 · 4 年 · 学费 6800/年
              2024 615/#4380  2023 611/#4720  2022 608/#5100
```

**Chip 兼容规则**（关键）：
- `major_ranking` 非空 → 显示 `软科 #{ranking}` chip（黄底）
- `discipline_eval` 非空 → 显示提取的等级 chip（蓝底，从字符串中正则提取 "A+/A/B+/B/C+/C" 等首个等级）
- `is_national_feature = true` → 显示 "国家特色" chip（红底）
- 所有 chip 都没有 → 不渲染 chip 行（无占位、无"暂无数据"）

**Chip 取数年份**：一个专业可能在 2022/2023/2024 都有 `enrollment_plans` 记录，chip 字段可能跨年不同。规则是**取该 major 在该院校 enrollment_plans 中最新年份的记录**作为 chip 来源（chip 表达"该专业当前水平"，不跟随用户查看的录取年份）。若最新年份记录的 chip 也为空，回退查前一年；都空则不显示。

### 4.6 用户位次叠加（需求 1 之外的新能力）

复用现有 `classify-rank.ts`：
- `classifyRank(userRank, targetRank, tier, isHistorical)` → `'rush' | 'stable' | 'safe' | 'elite' | 'unknown'`
- 院校层（总览）和专业组层（卡片）独立计算，互不影响
- 色带映射沿用 `BG_COLOR_BY_TIER` 的样式但加深为完整左 4px 色带

---

## 5. 数据层 / Service 改动

### 5.1 `UniversityService.findById` 改动

需要透传以下字段到详情页（当前已 fetch 但未透传）：

```typescript
// apps/server/src/university/university.service.ts
return {
  ...existing,
  minScorePhysics: u.min_score_physics,
  minRankPhysics:  u.min_rank_physics,
  minScoreHistory: u.min_score_history,
  minRankHistory:  u.min_rank_history,
};
```

### 5.2 `UniversityService.findAdmissions` 改动

返回字段加入 `enrollment_plans` 关联的三个 chip 字段（current 仅有 admission_records）。改造方式：

**方案 A（推荐）**：在 service 里 batch fetch `enrollment_plans`，按 `(major_id, year)` left join 进 admission_records 的返回结构，作为 `extras: { majorRanking, disciplineEval, isNationalFeature }`

**方案 B**：admission 和 enrollment_plans 分别独立 fetch，前端按 `(major_id, year)` 合并

A 减少前端复杂度；B 减少后端 join 复杂度。**采纳 A**，因为前端已经要按 `(year, subjects, batch, group_code)` group_by 一次，再多一次 join 会很乱。

### 5.3 New endpoint：**不新增**

所有数据可以从现有 `getById` + `getAdmissions` 拿到。`getMajors`（招生计划）暂时可以继续保留 / 也不再使用。

---

## 6. 文件结构 / 组件分解

```
apps/web/src/
├── app/(main)/universities/[id]/
│   └── page.tsx                        [改] 删旧 Tab、挂新组件
├── components/university/
│   ├── admission-detail/               [新]
│   │   ├── AdmissionDetailTab.tsx      入口，组合下面 4 个
│   │   ├── UniversityRankBanner.tsx    总览栏（4.3）
│   │   ├── BatchSubjectSwitcher.tsx    科类 + 批次切换器
│   │   ├── GroupCard.tsx               专业组卡片（折叠/展开）
│   │   └── MajorRow.tsx                组内专业行 + chip
│   ├── PlanPivotTable.tsx              [保留] 不再挂载，代码不删
│   └── AdmissionPivotTable.tsx         [保留] 同上
├── utils/
│   ├── classify-rank.ts                [既有] 复用
│   ├── batch-categorize.ts             [新] startsWith 归类规则
│   └── group-admissions.ts             [新] 按 group_code 聚合
└── services/university.ts              [改] type 加新字段
```

**组件依赖图**：

```
UniversityDetailPage
  └── AdmissionDetailTab
       ├── UniversityRankBanner  (subjects/batch state)
       │     └── BatchSubjectSwitcher
       └── GroupCard[]
             └── MajorRow[]
```

每个组件单一职责：
- `UniversityRankBanner`：纯展示，props in
- `BatchSubjectSwitcher`：受控按钮组，emit 选择
- `GroupCard`：一个专业组的完整呈现（折叠展开内部 state）
- `MajorRow`：一个专业行 + 排名 chip 渲染

---

## 7. 边界 / Fallback

| 场景 | 处理 |
|---|---|
| 用户未填位次（`examInfo.rank` 为空） | 色带降级灰、chip 隐藏；总览底部一行提示 "输入位次以查看冲稳保" 链接到 `/profile` |
| 院校无 admissionRecords（数据空） | "招录详情" Tab 显示 "暂无招生数据" + 简短说明；不渲染总览和卡片 |
| 某年/科类无数据 | 切换器对应按钮禁用（不可点） |
| 专业组有 `group_code` 但 `group_name` 为空 | 卡头只显示 `group_code` |
| 组内只有一个专业 | 仍然渲染为专业组卡，展开后只一行（不退化为"无组"形态） |
| chip 三个字段都没有 | 整行 chip 不渲染（无占位） |

---

## 8. 测试策略

**Unit (Vitest / Jest)**：
- `batch-categorize.ts` — 各种 batch 字符串归类正确（含特殊类型、提前批、空字符串）
- `group-admissions.ts` — 同 group_code 跨年合并、空数组、缺字段
- `classify-rank.ts` 调用形态 — 已有覆盖，确保新调用方式不破坏

**Component (React Testing Library)**：
- `MajorRow` 在 chip 字段三种组合下渲染正确（全有 / 全无 / 部分）
- `GroupCard` 折叠 / 展开切换 + 多年并排显示
- `UniversityRankBanner` 切换科类 / 批次后数据更新

**E2E (Playwright)**：
- 暂不强制，留待 Phase 2

**人工验证**：
- 985 院校（如 id=10001 北大 / 10003 清华）— chip 应该大量出现
- 10498（数据贫乏）— 应该自然降级，无破损
- 历史类考生切换 — 物理类按钮变非选中

---

## 9. 风险

| 风险 | 缓解 |
|---|---|
| `enrollment_plans` 跨 join 性能 | service 层用 batch select + Map，避免 N+1 |
| `discipline_eval` 文本格式不稳定（"软科：A+，校友会：A+" / "软科：A" / 仅"A+"） | 解析时用正则容错；解析失败就用原文本 chip |
| 历年专业组 `group_code` 可能变动（同 code 跨年不一定同组） | 按 `(year, group_code)` 严格分组；不跨年合并 group 内专业 |
| `university_min_rank` 在某些 admission_records 中为空（来自 memory） | fallback 到 `min(group_min_rank)`，再 fallback 到 `min(major_min_rank)` |
| 用户填的是分数而非位次 | 既有 `examInfo.rank` 假设为位次，本 spec 不处理分数→位次转换 |

---

## 10. Phase 2 候选

记录但不做：

1. **专业排名权威化** — 当前 `major_ranking` 是字符串数字、来源未注明（软科？校友会？），需要数据补齐策略
2. **跨院校专业对比** — "把这个组的'计算机科学'对比清华/复旦"
3. **MajorRow 行内"收藏"按钮** — 用户在专业行级别标记关注
4. **历年趋势 sparkline** — 卡片头部加 mini chart 显示 5+ 年趋势
5. **专业组的"组合"推荐** — 自动推荐"冲 1 个 + 稳 2 个 + 保 1 个"组合
6. **移动端响应式精调** — 当前设计偏 desktop，移动端排版需要专门 Pass

---

## 11. 验收标准

- 进入 `/universities/{id}`，看到 3 个 Tab：概览 / 招录详情 / [强基]（不见招生计划/历年录取）
- 招录详情 Tab 顶部：物理类/历史类、本科批/提前批/高职专科 切换都可点，切换后大数字/历年趋势卡正确更新
- 总览栏左色带 + 右上 chip 跟用户位次正确联动（冲红/稳蓝/保绿）
- 专业组卡片按年降序排列，单卡多年横排
- 展开任一卡，看到组内专业行，至少 985 院校的部分专业行能看到 chip
- 用户清空 examInfo.rank 后页面不报错，色带统一灰色 + 提示填位次
- 10498 院校能正常进入页面，不报错（虽然 chip 全空）

---

## 12. 未决问题

- **批次合并的 A/B 段处理**：当前规则是 `本科一批 A段`+`B段` 都归"本科批"，取最低。但 A段是少数特殊类型，最低分可能偏低（拉低总览的"看起来难度"）。是否要只取 B段？→ 留实现时观察数据决定，**默认按合并策略**。

- **`majorRanking` 排名来源** — 显示成 "软科 #12" 是基于 schema 注释推测，可能其实是别的来源（如校友会）。**实施时如果跟数据团队确认后发现来源不同，把 chip 文本改成更通用的 "排名 #N"**。

---

## 13. 实施顺序

按 plan 拆分时建议：

1. 数据层（先有数据 → 才有 UI）：service 透传新字段
2. utils（纯函数 → 先 TDD）：batch-categorize + group-admissions
3. 子组件（叶子优先）：MajorRow → GroupCard → BatchSubjectSwitcher → UniversityRankBanner
4. 组合（容器）：AdmissionDetailTab
5. 挂载到 page.tsx，删除旧 Tab 入口
6. 验证：本地启 dev server，跑几个院校（985/211/10498）目测；写 unit + component 测试

详细计划在 brainstorming 完成后由 `writing-plans` skill 生成。
