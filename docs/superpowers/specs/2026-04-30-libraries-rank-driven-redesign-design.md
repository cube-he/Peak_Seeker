# 院校库 / 专业库重设计 —— 位次驱动的决策对照体系

**日期**：2026-04-30
**状态**：设计已确认，待写实施计划
**作者**：Claude (Opus 4) + 项目所有者

---

## 1. 背景

### 1.1 问题

当前院校库（`/universities`）和专业库（`/majors`）的列表页与详情页存在三类共性问题：

1. **服务定位错位**：当前页面以"百科展示"姿态服务用户；但 5 类用户场景（无目标考生 / 有目标考生 / 比较型 / 发现型 / 家长）无一是来"读资料"的，他们要的是回答"我能上吗 / 哪个值 / 学啥能干啥"的决策辅助。
2. **缺乏个人位次主线**：所有分数信息都是"客观陈列"，不与"我的位次"对照。考生看完列表还要心算"差多少"。
3. **数据浪费**：schema 里多年录取数据、满意度、就业、学科评估、广度信息已就位，前端只展示了一年最低分 + 寥寥几个标签。

### 1.2 目标

围绕一根主线 —— **学生位次** —— 改造列表与详情，让所有页面回答"以我的位次"为前提的决策问题。

成功标准：

- 输入位次 / 分数后，列表卡能立刻分出冲/稳/保
- 详情页招生计划能按"我的位次"高亮可达专业
- 所有"分数"展示从单年最低分升级为多年位次中位数 + 波动
- 跨年位次等位换算（24/23/22 年位次对应分数）让用户直接看到历年代入数据

---

## 2. 总体方案

### 2.1 阶段划分

| 阶段 | 内容 | 依赖 |
|---|---|---|
| §1 位次预估模块（基础设施） | ETL + 算法 + API + RankInput 组件 + 管理员阈值配置 | — |
| §2 列表页升级（B 阶段） | 院校库列表 + 专业库列表 | §1 |
| §3 详情页深化（C 阶段） | 院校详情 + 专业详情 | §1, §2 |

### 2.2 主要的"非目标" / YAGNI

明确不在本次范围内：

- 院校批量对比器（多校并排）—— 后续单立 spec
- 学校照片墙、视频介绍 —— 数据没有
- 专业 / 院校的 AI 智能解读 —— 后续 AI 模块
- 移动端深度优化 —— 仅做基本响应式
- 院校详情"我能进哪些专业"的复杂排序模型 —— 第一版仅按位次中位数 + 冲稳保分类

---

## 3. §1 位次预估模块

### 3.1 数据 ETL

**输入**：`data/03_专家版主表/output/一分一段表_四川_2022-2025.xlsx`（4315 行，已确认结构）

**字段映射**：

| xlsx 列 | ScoreSegment 字段 |
|---|---|
| 年份 | year |
| 科类 | examType |
| 最低分 | score |
| 同分人数 | count |
| 最低位次 | cumulativeCount |
| (省份固定) | province = "四川" |

**实施**：一次性脚本 `apps/server/scripts/etl-score-segments.ts`：

- 读取 xlsx → upsert 到 `score_segments` 表
- 唯一键 `(year, province, examType, score)` 已存在，幂等可重跑
- 部署期跑一次；2026 年 6 月底真表发布后再跑一次

**不做**：常驻管理面板上传 UI（一年用一次的工具不值得做）

### 3.2 算法服务

新建模块 `apps/server/src/modules/score-segment/`：

```
score-segment.module.ts
score-segment.service.ts    # 核心算法
score-segment.controller.ts # REST API
score-segment.service.spec.ts
```

**核心方法**：

```typescript
class ScoreSegmentService {
  /** 分数 → 位次 */
  scoreToRank(year, examType, score): { rank, percentile, totalCount }

  /** 位次 → 分数 */
  rankToScore(year, examType, rank): { score, percentile }

  /** 跨年等位换算（线性比例法） */
  equivalent(baseYear, examType, rank): {
    base: { year, examType, score, rank, percentile },
    equivalents: Array<{ year, examType, score, rank }>
  }

  /** 冲稳保判定 */
  classify(studentRank, universityRank, config?):
    'rush' | 'safe' | 'stable' | null
}
```

**算法核心（线性比例等位法）**：

```
给定: 基准年 Y, 科类 K, 位次 R

Step 1: 计算分位 p = R / N_Y    (N = 该年该科类总人数)

Step 2: 对每个目标年 y ∈ {2022..2025} \ {Y}:
  examType_y = mapExamType(K, y)   // 物理↔理科, 历史↔文科
  R_y = round(p × N_y)
  score_y = 在 y 表查 cumulativeCount ≥ R_y 的最高分
```

**科类映射规则**：

| 当前年科类 | 历史年（≤2024） |
|---|---|
| 物理 | 理科 |
| 历史 | 文科 |
| 理科 | 理科 |
| 文科 | 文科 |

**边界处理**：

- 输入分数 > 当年最高分：返回 rank=1（顶端）
- 输入分数 < 当年最低分：返回 rank=N（尾段）
- 2026 当年表未发布：用 2025 作"代理基准"，前端文案标注"基于 2025 数据估算"

### 3.3 阈值配置（管理员可调）

利用已有 `AlgorithmConfig` 表，新增配置项：

```json
{
  "key": "rush_safe_stable_thresholds",
  "value": {
    "rush":   { "min": 0.85, "max": 0.95 },
    "safe":   { "min": 0.95, "max": 1.05 },
    "stable": { "min": 1.05, "max": 1.20 }
  }
}
```

**阈值含义**：`ratio = 院校历史最低位次 / 学生位次`

- `0.85 ≤ ratio < 0.95` → 冲（橙）
- `0.95 ≤ ratio ≤ 1.05` → 稳（绿）
- `1.05 < ratio ≤ 1.20` → 保（蓝）
- 其他 → 不显示徽标

**管理员入口**：

- 路由：`/admin/algorithm-config`（如不存在则新建管理后台壳）
- UI：4 个数字输入框（rush.min, rush.max, safe.max, stable.max；safe.min = rush.max；stable.min = safe.max；做隐式约束保证不重不漏）+ 实时预览（拖动时显示 ratio 区间分布柱状图）
- RBAC：走现有 CASL 体系，仅 admin role 可访问

**前端读取**：`GET /api/v1/algorithm-config/rush-safe-stable-thresholds` → 1 小时缓存 → 应用到所有冲稳保徽标渲染。

### 3.4 前端 `<RankInput />` 组件

**路径**：`apps/web/src/components/score/RankInput.tsx`

**输入态**：

- 分数输入框（0-750，整数）
- 科类 Tab：物理 / 历史 / 理科 / 文科（默认物理；老师可切换）

**提交后展开态**：

```
┌──────────────────────────────────────────────┐
│ 你的位次 ≈ 28,500                             │
│ = 全省前 10.0%                                │
├──────────────────────────────────────────────┤
│ 历年等效分数：                                  │
│   2025 物理 580   2024 理科 575               │
│   2023 理科 578   2022 理科 583               │
└──────────────────────────────────────────────┘
```

**状态管理**：

- Zustand store `useStudentRank`，全站单例
- 持久化到 `localStorage` (key: `vh:student-rank`)
- 已登录用户：与 `StudentProfile.rank` 双向同步（登录时优先 profile，未登录用 localStorage）

**挂载位置**：

- `/`（首页 Hero 右侧 TimelinePanel 上方）
- `/universities`（左侧筛选区上方，sticky）
- `/majors`（左侧门类导航上方，sticky）
- `/universities/[id]`（Hero 右侧 KPI 区）
- `/majors/[id]`（Hero 右侧 KPI 区）

### 3.5 接口

```
POST /api/v1/score-segment/lookup
  body: { year, examType, score? | rank? }
  resp: { rank, score, percentile, totalCount }

POST /api/v1/score-segment/equivalent
  body: { baseYear, examType, rank }
  resp: { base, equivalents: [...] }

GET /api/v1/algorithm-config/rush-safe-stable-thresholds
  resp: { rush:{min,max}, safe:{min,max}, stable:{min,max} }

PUT /api/v1/algorithm-config/rush-safe-stable-thresholds
  body: 同 GET 响应结构
  权限: admin
```

---

## 4. §2 列表页升级（B 阶段）

### 4.1 院校库列表 `/universities`

**布局变化**：在左侧筛选区顶部加 `<RankInput/>`（sticky），其余结构不变。

**筛选项新增**：

- 🆕 **科类**：物理 / 历史 / 理科 / 文科（与 RankInput 联动，默认跟随）
- 🆕 **批次**：本科提前批 / 本科批 A 段 / 本科批 B 段 / 专科提前批 / 专科批
- 🆕 **城市多选**：选省份后展开 chip 多选

**卡片重做**：

```
┌───────────────────────────────────────────────────────┐
│ 985 211 双一流              [收藏❤]                    │ ← 一级标签实色
│ 西南交通大学                 🟢 稳                      │ ← 冲稳保徽标
│ 综合 · 公办 · 四川 · 成都                                 │ ← 二级灰chip
│ #土木交通  #国家重点  (+3)                               │ ← 三级截断
│ ──────────────────────────────                        │
│ 4年位次中位:  28,500 ± 3,200    全国排名: 32           │
│ 4年最低分中位: 580 ± 12         招生计划: 1,247人      │
└───────────────────────────────────────────────────────┘
```

**关键改动**：

- 🆕 **冲稳保徽标**：右上角；未输入位次时不显示
- 🔄 **位次中位 + 波动**：从 `AdmissionRecord.universityMinRank` 取 4 年中位数 + IQR/2，替换原"最新一年最低分/位次"
- 🔄 **标签视觉层级**：985/211/双一流 实色徽章；类型用灰 chip；其他 tags 截断到 3
- 🔄 **收藏按钮实装**：写入 `Favorite` 表（schema 已有）；未登录引导登录

**接口扩展**：

```
GET /api/v1/universities?
  examType=物理&batch=本科批A段&cities[]=成都&cities[]=北京&studentRank=28500&...

每条记录新增字段:
  stats: { rankMedian, rankIQR, scoreMedian, scoreIQR, totalPlanCount }
  classification: 'rush' | 'safe' | 'stable' | null
```

后端 `enrichWithStats()` 在 service 层用单次 groupBy 解决 N+1。

### 4.2 专业库列表 `/majors`

**布局变化**：

- 顶部 sticky 带 `<RankInput/>`
- 左侧门类导航支持二级展开（基于 `Major.discipline` 聚合）

**卡片重做**：

```
┌────────────────────────────────────────────────────────┐
│ 软件工程  080902  本科   ⚪ 选科：物理+不限             │
│ 工学 · 计算机类                                          │
│ 培养面向软件设计开发与项目管理的工程技术人才             │ ← shortDescription
│ ──────────────────────────────                         │
│ 全国 327 校开设 · 年招 47,200 人                         │ ← 广度信息
│ 就业率 95% (有数据时显示)                                │
└────────────────────────────────────────────────────────┘
```

**关键改动**：

- 🆕 **选科限制**：`representativeSubjects` 字段 = 该专业全国 EnrollmentPlan 中最常见的 subjects 值（service 层聚合，不改 schema）
- 🆕 **一句话描述**：前端截 `description` 字段前 60 字 + `...`；无 description 则隐藏
- 🆕 **广度信息**：`universityCount`（开设院校数）+ `totalPlanCount`（总年招）
- ✂️ **就业率/薪资降级**：仅在有数据时显示；不再占主舞台

**接口扩展**：

```
GET /api/v1/majors?
  category=工学&discipline=计算机类&level=本科&studentRank=28500&...

每条记录新增字段:
  representativeSubjects: string,  // "物理+不限" 等
  shortDescription: string,        // 截取后的描述
  universityCount: number,
  totalPlanCount: number,
  classification: 'rush' | 'safe' | 'stable' | null  // 仅当传 studentRank

GET /api/v1/majors/disciplines?category=工学
  resp: [{ discipline: "计算机类", count: 8 }, ...]
```

**数据治理**：

- discipline 字段先扫一遍质量：`SELECT discipline, COUNT(*) FROM majors GROUP BY discipline`
- 如果空值率 > 30% 或值不规范，单写一个 ETL 脚本基于专业代码前缀 + name 关键词清洗
- 如果质量可接受（< 30% 缺失），仅在 service 层做 nullable 处理

---

## 5. §3 详情页深化（C 阶段）

### 5.1 院校详情 `/universities/[id]`

**Hero 增强**：

- 🆕 logo（取 `logoUrl`，无则隐藏）
- 🆕 一句话定位（取 `tags[0]` 或 `notes` 首句，无则隐藏）
- 🔼 **KPI 卡上移**：将 Tab1 底部的 `RankingCard / SatisfactionCard / EmploymentCard` 拆解为 4 个紧凑 KPI 块塞进 Hero
- 🆕 Hero 右侧挂 `<RankInput/>` —— 输入后立刻显示等效分数

**Tab 重组**：`基本信息 | 招生计划 | 录取趋势 | 强基计划`

**Tab1 基本信息**（精简）：

- 移除已上移的 KPI 卡
- 保留 `Descriptions` 表格 + 招生章程

**Tab2 招生计划**（核心改造）：

- 🆕 **顶部 filter bar**：年份 / 批次 / 科类 / 专业组 / 搜索专业
- 🆕 **新增"最低位次"列**：4 年中位
- 🆕 **冲稳保徽标列**：基于 EnrollmentPlan.major 在该校的多年录取位次中位 + 学生位次
- 🔄 默认排序：冲稳保 + 位次（让"稳"的浮在最前）

**Tab3 录取趋势**（替换原"历年录取"表格）：

- ECharts 折线图
- 横轴：2022-2025
- 纵轴：最低位次（位次跨年可比，不用分数）
- 数据：`AdmissionRecord.universityMinRank` 按年聚合 median
- 🆕 **学生位次水平参考线**（虚线）：一眼看出哪些年学生在线上/线下
- 🆕 **专业切换 dropdown**：默认显示院校整体；可切换到具体专业看趋势
- ✂️ 删掉原表格视图

**Tab4 强基计划**：保留现有逻辑，仅在 `qiangjiAdmissions.length > 0` 时显示

### 5.2 专业详情 `/majors/[id]`

**Hero 增强**：

- 🆕 Hero 右侧挂 `<RankInput/>`
- 🆕 在 Descriptions 下加广度信息行：`全国 327 校开设 · 年招 47,200 人`

**Tab 重组**：`院校录取 | 录取趋势 | 就业与发展 | 相似专业`

**Tab1 院校录取**（合并原"开设院校" + "历年录取"）：

```
Filter:  [年份 ▾] [批次 ▾] [科类 ▾] [省份 ▾] [搜索院校]
表格列:  院校 | 计划数 | 最低位次 | 学费 | 评估 | 冲稳保徽标
```

- 🔄 合并两 Tab：用户看的是 (专业 × 院校) 一个对的"分+计划+评估"全在一行
- 🆕 加冲稳保徽标 + 学生位次过滤
- ✂️ 暂不做 micro-trend 箭头列（第二期）
- 默认按"冲稳保 + 位次"排序

**Tab2 录取趋势（专业整体）**：

- ECharts 折线图
- 横轴：2022-2025
- 纵轴：该专业全国录取最低位次的中位数
- 数据：`AdmissionRecord WHERE majorId = ?` 按年聚合 median
- 🆕 学生位次水平参考线
- 🆕 解读文案："位次走势 ↗ 偏冷，竞争压力下降" 之类（基于斜率自动生成）

**Tab3 就业与发展**：保留现有 `CareerTab`（careerDirections / postgraduateDirections / coreCourses），不动。

**Tab4 相似专业**（MVP）：

- 仅基于 `discipline` 字段同类的其他专业
- 卡片式列表，3-5 个
- 跨 discipline 关联（如 "软件工程 ↔ 网络工程"）延后

---

## 6. 数据治理与 ETL 计划

| 任务 | 触发时机 | 负责模块 |
|---|---|---|
| 一分一段表 ETL | 部署期一次 + 2026/6 真表后一次 | `etl-score-segments.ts` |
| `Major.discipline` 质量扫描 | 实施 §2 前 | 临时脚本 |
| `Major.representativeSubjects` 聚合 | 列表查询时实时计算 | service 层 |
| 院校多年位次中位数预聚合 | 列表查询时实时计算（如有性能问题再做物化表） | service 层 |

---

## 7. 接口扩展清单（汇总）

```
# 位次模块
POST  /api/v1/score-segment/lookup
POST  /api/v1/score-segment/equivalent
GET   /api/v1/algorithm-config/rush-safe-stable-thresholds
PUT   /api/v1/algorithm-config/rush-safe-stable-thresholds  (admin)

# 院校
GET   /api/v1/universities             ← 扩展 query + 返回 stats/classification
GET   /api/v1/universities/:id         ← 返回结构基本不变；前端重排展示
GET   /api/v1/universities/:id/plans   ← 新增：带 filter 的招生计划查询
GET   /api/v1/universities/:id/trend   ← 新增：录取趋势数据（按专业可选）

# 专业
GET   /api/v1/majors                   ← 扩展 query + 返回新字段
GET   /api/v1/majors/:id               ← 返回结构调整：合并 enrollmentPlans + admissionRecords
GET   /api/v1/majors/:id/trend         ← 新增：专业整体录取趋势
GET   /api/v1/majors/:id/similar       ← 新增：相似专业列表
GET   /api/v1/majors/disciplines       ← 新增：二级专业类聚合
```

---

## 8. 推迟项（明确不做）

- 院校批量对比器（多校并排）
- 跨 discipline 的相似专业关联
- micro-trend 箭头列（每行 sparkline）
- 院校照片墙
- 移动端深度优化
- 专业的 AI 智能解读
- 常驻一分一段表上传 UI
- 院校详情"我位次能进哪些专业"的复杂排序模型（仅做基本冲稳保分类）

---

## 9. 风险与注意事项

1. **2026 一分一段表数据延迟**：6 月底才发布，期间用 2025 代理；前端必须有"基于 2025 数据估算"的提示文案
2. **冲稳保推荐误导**：算法是历史位次的简单比较，不能预测未来。前端需有 disclaimer："仅基于历史数据估算，实际录取以当年情况为准"
3. **跨年科类映射的边界**：物理↔理科虽是业内通行做法，但极端样本（理转物理后录取波动大的院校）会有偏差。MVP 不处理，文档说明
4. **discipline 字段质量**：未实测；扫描后若需大规模清洗，会让 §2 工期延长。建议先做扫描。
5. **N+1 查询性能**：列表查询每条都要算 stats，4000+ 院校时可能慢。service 层用 `groupBy` 单次解决
6. **localStorage 跨账号污染**：用户在公共电脑上登录后又退出登录，下一个人能看到上一个人的位次。登出时主动清空 `vh:student-rank`

---

## 10. 实施分期（供 writing-plans 使用）

建议分为 3 个 PR：

1. **PR-1: 位次预估模块（§1）** —— 独立可验收
   - ETL + algorithm + API + RankInput 组件 + 管理员配置 UI
   - 完成后所有页面都能挂 RankInput，但还没用它做任何决策辅助
2. **PR-2: 列表页升级（§2）** —— 依赖 PR-1
   - 院校库列表 + 专业库列表
3. **PR-3: 详情页深化（§3）** —— 依赖 PR-1, 可与 PR-2 并行
   - 院校详情 + 专业详情

每个 PR 含对应的单元测试（service 层算法测试、新增 API E2E 测试）；前端组件测试覆盖 RankInput 的关键交互。
