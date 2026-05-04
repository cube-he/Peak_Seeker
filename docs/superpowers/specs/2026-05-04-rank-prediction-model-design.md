# spec-0: 预估录取位次模型 — 设计

> 这是 P0 前端展示增强系列的 **spec-0**（前置数据基础），下游：
> - spec-1 视觉地基（logo + 基于本 spec 输出的冲稳保染色）
> - spec-2 图表组件（sparkline + 一分一段直方图）
> - spec-3 院校对比抽屉

**Date:** 2026-05-04
**Owner:** VolunteerHelper team
**Status:** Design (pending implementation)

---

## 1. 范围 & 目标

### 解决的问题

当前 `scores` 页和将要新增的染色逻辑直接用"用户位次 vs 院校历史最低录取位次"判断冲稳保。这是错位比较：

- 同一位次在不同年份代表不同的相对竞争位置（每年报名人数变化）
- 同一院校不同年份招生计划差异（增/减计划数）影响录取门槛
- 选科类别（物理/历史）报名比例变化影响该类别内部门槛

### 输出目标

为每个 `(universityId, groupCode, batch, recruitType, subjects)` 组合输出 **target year 的预估录取最低位次**，包含：

- 点估计 `point`
- 保守值 `conservative`（区间上限）
- 乐观值 `optimistic`（区间下限）
- 置信度标 `confidence`：`high | medium | low | insufficient`
- 计算依据年份 `basisYears` 和 target year

### 不做（YAGNI）

- 不做院校热度趋势权重、考研热度调整
- 不做基于子选科组合（物化生 vs 物化地）的细粒度调整 — 当前 `admission_records` 没存子选科
- 不做高斯过程 / 贝叶斯模型 — 等位次法吃下 80% 信号已够
- 不做染色阈值默认值 — 留给 spec-1 决定
- 不在 API 实时计算 — 11.8w 招生计划组合，必须离线 ETL 入表

---

## 2. 架构

```
┌──────────────────────────────────────────────────────────┐
│ Stage A: 数据采集（一次性 + 年度补数）                   │
│  scripts/fetch-province-stats/                            │
│   ├── 资料调研（WebFetch + WebSearch + PDF 引用）        │
│   ├── 人工核对 → docs/data-reports/                      │
│   └── seed-province-stats.ts → ProvinceYearStat 表       │
└────────────────┬─────────────────────────────────────────┘
                 ↓
┌──────────────────────────────────────────────────────────┐
│ Stage B: 离线预测 ETL                                     │
│  scripts/etl-predict-rank.ts                              │
│   ├── 输入：admission_records, enrollment_plans,          │
│   │        score_segments, ProvinceYearStat               │
│   ├── 计算：subjectWeight × planWeight × historicalRank  │
│   │        → equivRanks → weightedAvg → {point,           │
│   │           conservative, optimistic}                   │
│   └── 写入：RankPrediction 表                             │
└────────────────┬─────────────────────────────────────────┘
                 ↓
┌──────────────────────────────────────────────────────────┐
│ Stage C: 校准与监控                                       │
│  scripts/validate-rank-predictions.ts                     │
│   ├── holdout 校验（用 N-2/N-1 预测 N，比对实际录取）   │
│   ├── 分层 MAE/MAPE（按层次/选科/位次段）                │
│   └── 输出 docs/data-reports/                             │
│       2026-05-04-rank-prediction-validation.md            │
└────────────────┬─────────────────────────────────────────┘
                 ↓
┌──────────────────────────────────────────────────────────┐
│ Stage D: API 集成                                         │
│  apps/server/src/modules/admission/admission.service.ts   │
│   └── findAggregated() 注入 predictedMinRank 到响应       │
└──────────────────────────────────────────────────────────┘
```

**关键架构决策**

- **离线 ETL + 表存储**，不在 API 实时算
- **target year 切换由配置文件控制**：`config/rank-prediction.json`
  ```json
  {
    "targetYear": 2026,
    "switchTrigger": "manual",
    "lastSwitchedAt": "2026-05-04",
    "policyNote": "切换条件：上一年度填报+录取批次完整闭环后才推进 targetYear"
  }
  ```
- **重算触发**：admission_records / enrollment_plans / score_segments / ProvinceYearStat 任一更新时，手动或 CI 触发 `etl-predict-rank.ts`
- **不做实时切换**：避免填报期模型基准漂移影响用户决策稳定性

---

## 2.5 权威报名数据核实

### 三个口径

| 口径 | 含义 | 来源 |
|---|---|---|
| `registrants` | 高考报名人数 | 教育考试院年初通报 |
| `examineesActual` | 实际参考人数（去掉缺考、违规） | 教育考试院出分时通报 |
| `rankedCount` | 一分一段覆盖人数 | 现有 `score_segments` `cumulativeCount` 最大值 |

`registrants` > `examineesActual` > `rankedCount`（一分一段往往不含 0 分、违规、艺体特殊计分）。

模型 `subjectWeight` 计算**优先用 `registrants`，回退 `rankedCount`**（confidence 降级）。

### 数据点范围

四川省 2017-2025 共 9 年，至少 3 个口径（物理/历史/全部，含新旧高考过渡）。约 30 条记录，一次性采集。

### 资料来源（按可信度排序）

1. **四川省教育考试院** `https://www.sceea.cn/` — 每年 6 月底官方报考数据通报
2. **四川省教育厅** `http://edu.sc.gov.cn/` — 工作年报
3. **现有 PDF**：`data/05_招生考试报/`、`data/12_参考资料/` 内嵌历年统计
4. **教育媒体**（中国教育在线、新浪教育）— 二手验证

每个数据点至少 2 个来源交叉，差异 > 1% 标 notes 说明。

### 实施步骤

1. `scripts/fetch-province-stats/sources.md` — 我用 WebFetch + WebSearch 整理资料表
2. 人工核对后写入 `seed-province-stats.ts`
3. 写入 `ProvinceYearStat` 表
4. 输出 `docs/data-reports/2026-05-04-province-year-stats-source.md` 记录每条来源 URL、抓取时间、争议点

---

## 3. 核心算法

### 输入

```
预测目标: (universityId, groupCode, batch, recruitType, subjects, targetYear)
```

**预测粒度：专业组（group）级，不是专业（major）级**

录取规则上四川新高考是"院校专业组"投档，组内再分配专业。`groupMinRank`（组投档最低位次）是真正决定能否进档的硬阈值。`majorMinRank`（组内某专业最低位次）受组内调剂规则影响，波动更大。本模型预测**组级位次**，对应数据源的 `groupMinRank` 字段。

由此带来的前端 join 关系：API 响应中每条 `AggregatedAdmissionItem` 按 `(universityId, majorCode, groupCode, batch, recruitType)` 聚合（粒度到专业），多个同组不同专业的 item 共享同一个 `predictedMinRank`（多对一）。

### 步骤

```ts
function predictMinRank(uniId, groupCode, batch, recruitType, subjects, targetYear) {
  // 1. 取该组合最近 3 年录取记录（用 groupMinRank 作目标变量）
  //    同 (uniId, groupCode, batch, recruitType, subjects) 同年可能多条（组内不同专业），
  //    但 groupMinRank 同年应一致 — 取 distinct(year, groupMinRank) 即可
  const history = admissionRecords
    .filter(uniId, groupCode, batch, recruitType, subjects)
    .filter(r => r.groupMinRank != null)
    .groupBy(r => r.year)
    .map(group => ({ year: group.year, minRank: group[0].groupMinRank }))
    .sort(byYearDesc)
    .take(3)

  if (history.length < 2) {
    return { confidence: 'insufficient' }  // 上层不写入 RankPrediction 表
  }

  // 2. 当年总池子（优先 registrants，回退 rankedCount）
  const N_t = getProvinceTotal(province, subjects, targetYear)
  let N_t_confidence = 'high'
  if (!N_t) {
    // target year 数据未发布 → 用 target-1 年作 proxy
    const proxy = getProvinceTotal(province, subjects, targetYear - 1)
    if (!proxy) return { confidence: 'insufficient' }
    N_t = proxy
    N_t_confidence = 'medium'
  }

  // 3. 当年招生计划
  const P_t = enrollmentPlans
    .find(uniId, groupCode, batch, recruitType, subjects, year=targetYear)
    ?.groupPlanCount

  // 4. 等位次化每个历史年份
  const equivRanks = []
  for (const h of history) {
    const N_y = getProvinceTotal(province, h.subjects, h.year)
    const P_y = enrollmentPlans
      .find(uniId, groupCode, batch, recruitType, h.subjects, year=h.year)
      ?.groupPlanCount

    const subjWeight = (N_y && N_t) ? (N_t / N_y) : 1
    const planWeight = (P_y && P_t) ? (P_y / P_t) : 1
      // 计划增 → 录取门槛松 → 位次变大；用 P_y / P_t 让历史位次缩放到当年规模
    equivRanks.push(h.minRank * subjWeight * planWeight)
  }

  // 5. 加权点估计 + 区间
  const yearWeights = [0.5, 0.3, 0.2]  // 年份从近到远
  const totalWeight = equivRanks.length === 3 ? 1.0
                    : equivRanks.length === 2 ? 0.8
                    : 0.5
  const point = sum(equivRanks[i] * yearWeights[i]) / totalWeight

  // 6. 置信度
  const confidence =
    history.length === 3 && N_t_confidence === 'high' && P_t ? 'high'
    : history.length >= 2 && N_t_confidence === 'high' ? 'medium'
    : 'low'

  return {
    point: Math.round(point),
    conservative: Math.round(Math.max(...equivRanks)),
    optimistic: Math.round(Math.min(...equivRanks)),
    basisYears: history.map(h => h.year),
    confidence,
    targetYear,
  }
}
```

### 回退链

| 场景 | 处理 | confidence |
|---|---|---|
| target year 一分一段缺失 | 用 target-1 池子作 proxy | 降级 medium |
| target year 招生计划缺失 | planWeight = 1 | 降级 low |
| 历史 < 2 年 | 不输出 | insufficient |
| `subjects` = "综合改革" 等非物理/历史 | 暂不预测，log warning | insufficient |
| 强基/专项计划等小样本 recruitType（< 30 条/年） | 暂不预测 | insufficient |

**`insufficient` 不写入 RankPrediction 表**（保持表紧凑）。API join 找不到记录时返回 `predictedMinRank: null`，前端据此降级展示。

### subjects 字段命名一致性

数据源中 subjects/examType 的字符串值跨表可能不一致：

| 表 | 字段 | 已知取值 |
|---|---|---|
| `admission_records` | `subjects` | `"物理"` / `"历史"` |
| `enrollment_plans` | `subjects` | `"物理"` / `"历史"` |
| `score_segments` | `examType` | （需在实现时打印 distinct 值确认） |
| `ProvinceYearStat` | `examType` | 本 spec 规定 `"物理"` / `"历史"` / `"全部"` |

ETL 实现时**第一步 print distinct(score_segments.examType)**；若取值含"物理类"/"理科"等，在 `getProvinceTotal()` 内做归一化映射。归一化映射表写入 `scripts/etl-predict-rank/subject-normalize.ts` 供其他脚本复用。

---

## 4. 数据模型

### 新增 Prisma 模型

```prisma
model ProvinceYearStat {
  id                Int      @id @default(autoincrement())
  province          String
  year              Int
  examType          String   // "物理" | "历史" | "文科" | "理科" | "全部"

  registrants       Int?     // 官方报名人数
  examineesActual   Int?     // 实际参考
  rankedCount       Int?     // 一分一段覆盖（自推算 fallback）

  source            String   // URL 或描述
  fetchedDate       DateTime
  notes             String?

  @@unique([province, year, examType])
}

model RankPrediction {
  id                Int      @id @default(autoincrement())
  universityId      Int
  groupCode         String
  batch             String
  recruitType       String
  subjects          String   // "物理" | "历史"
  targetYear        Int

  pointRank         Int?
  conservativeRank  Int?
  optimisticRank    Int?
  basisYears        Json     // [2024, 2023, 2022]
  confidence        String   // "high" | "medium" | "low" | "insufficient"
  computedAt        DateTime @default(now())

  university        University @relation(fields: [universityId], references: [id])

  @@unique([universityId, groupCode, batch, recruitType, subjects, targetYear])
  @@index([targetYear, subjects])
  @@index([universityId])
}
```

---

## 5. 前端集成契约

`packages/shared/src/types/admission.ts` 增加：

```typescript
export interface PredictedMinRank {
  point: number;
  conservative: number;
  optimistic: number;
  basisYears: number[];
  confidence: 'high' | 'medium' | 'low' | 'insufficient';
  targetYear: number;
}

export interface AggregatedAdmissionItem {
  // ... 既有字段
  predictedMinRank: PredictedMinRank | null;  // null = insufficient 或未匹配
}
```

API 行为：`admission.service.findAggregated()` 在分页结果上 join `RankPrediction`（按 unique key），无匹配返回 null。

spec-1 染色逻辑使用 `point`，详情/展开行额外暴露 `[optimistic, conservative]` 区间和 `confidence` 标。

**Join 实现细节**：因 `RankPrediction` 主键不含 `majorCode`，而 `AggregatedAdmissionItem` 含 `majorCode`，是多对一 join：

```sql
SELECT a.*, p.*
FROM aggregated_view a
LEFT JOIN rank_prediction p
  ON p.universityId = a.universityId
  AND p.groupCode = a.groupCode
  AND p.batch = a.batch
  AND p.recruitType = a.recruitType
  AND p.subjects = a.subjects
  AND p.targetYear = (SELECT targetYear FROM config)
```

API 响应中同一专业组下多个专业项的 `predictedMinRank` 对象内容相同（按值复制即可，不必引用同一对象）。

---

## 6. 校准报告

`scripts/validate-rank-predictions.ts` 输出 `docs/data-reports/2026-05-04-rank-prediction-validation.md`：

### Holdout 设计

- **测试集**：所有 2024 年实际录取记录
- **训练集**：用 2022/2023 数据 + 2024 当年招生计划 + 2024 当年报名人数 → 预测 2024
- **比较**：predicted_rank vs actual_minRank

### 报告内容

| 段 | 指标 |
|---|---|
| 整体 | MAE, MAPE, RMSE, n_samples |
| 按层次 | 985 / 211 / 双一流 / 普通本科 / 专科 分组 MAE |
| 按选科 | 物理 / 历史 分组 MAE |
| 按位次段 | 0-1w / 1w-5w / 5w-10w / 10w+ 分组 MAE |
| 按 confidence | high/medium/low 分组 MAE，验证置信度标是否真的反映准度 |
| Top 误差案例 | 误差 > 5000 名的 top 20，附院校/专业组/可能原因（计划骤减、新增专业） |

### 验收阈值（建议）

- 整体 MAE < 3000 名（百分位 50-90 段）
- high confidence 子集 MAE < 1500 名
- 否则模型不接入前端染色，先迭代

---

## 7. 测试策略

### 单元测试

`apps/server/src/scripts/etl-predict-rank/__tests__/`：

- `subjectWeight.test.ts` — 各种 N_t/N_y 组合（含 null）
- `planWeight.test.ts` — 各种 P_t/P_y 组合（含 null、0）
- `equivRank.test.ts` — 历史位次 × 权重的乘法准确性
- `weightedAvg.test.ts` — 各历史年数下加权和归一化
- `confidence.test.ts` — 各回退场景的 confidence 输出
- `predictMinRank.test.ts` — 端到端纯函数（手工 fixture 输入 → 期望输出）

### 集成测试

`scripts/etl-predict-rank.ts` 跑 mini fixture（3 院校 × 3 年），断言 `RankPrediction` 表入库正确。

### 校准测试（即第 6 节）

CI 上每次数据更新后跑一次。校准报告若退化超阈值，PR 阻塞。

---

## 8. 风险

| # | 风险 | 缓解 |
|---|---|---|
| R1 | **2025 年是新高考首届**，部分院校 2024→2025 因批次结构调整位次跳变 | 该 (uniId, groupCode) 在 2024-2025 间 batch 变更时，confidence 强制降级 `low`；前端可选择不染色 |
| R2 | **强基/专项计划数据少**（单 recruitType 单年仅几十条） | 跳过预测，confidence=insufficient |
| R3 | **target year 数据缺失时降级**导致 confidence 大量为 medium | UI 是否区分展示由 spec-1 决策；ETL 只标 confidence，不隐藏 |
| R4 | **报名人数数据采集失败**或多源冲突 | 必须人工核对至少 2 个来源；冲突写 notes，模型仍可用 rankedCount 跑 |
| R5 | **模型对小院校/冷门专业误差大** | 校准报告分位次段 MAE，前端低位次段染色阈值更宽松（spec-1 决策） |
| R6 | **目标年招生计划在填报开始前已发布但有调整** | RankPrediction 包含 computedAt；变更触发重算 |

---

## 9. 实施阶段（写 plan 时拆解）

```
Phase 1: 数据基础（前置）
  T1.1 资料检索 → fetch-province-stats/sources.md
  T1.2 ProvinceYearStat 表 + Prisma migration
  T1.3 seed-province-stats.ts
  T1.4 docs/data-reports/2026-05-04-province-year-stats-source.md

Phase 2: 模型实现
  T2.1 RankPrediction 表 + Prisma migration
  T2.2 etl-predict-rank.ts (含纯函数 + 主流程)
  T2.3 单元测试套件
  T2.4 集成测试

Phase 3: 校准
  T3.1 validate-rank-predictions.ts
  T3.2 docs/data-reports/2026-05-04-rank-prediction-validation.md
  T3.3 验收阈值确认（达标才进 Phase 4）

Phase 4: API 集成
  T4.1 packages/shared 类型扩展
  T4.2 admission.service.findAggregated() join RankPrediction
  T4.3 端到端测试（API 响应包含 predictedMinRank）

Phase 5: 配置与运维
  T5.1 config/rank-prediction.json
  T5.2 README/runbook：何时切换 targetYear、如何重跑 ETL
```

---

## 10. 与 spec-1 的接口锁定

spec-1（视觉地基）依赖本 spec 的产出：

- API 响应字段 `predictedMinRank: PredictedMinRank | null` — **本 spec Phase 4 完成时锁定**
- 染色规则中的"院校录取位次"统一改为 `predictedMinRank.point`
- 详情页/展开行需展示区间 `[optimistic, conservative]` 与 `confidence`

spec-1 在本 spec **Phase 4 完成前可并行设计但不能合并**（无真实字段无法集成测试）。
