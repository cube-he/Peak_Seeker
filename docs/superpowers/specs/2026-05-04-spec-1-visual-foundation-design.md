# spec-1: 视觉地基 — 院校 logo + 冲稳保染色 — 设计

> P0 前端展示增强系列 spec-1。依赖 spec-0（已部署）+ spec-0.5（已部署）的 `predictedMinRank` API 字段。
> 下游：spec-2（图表组件）、spec-3（对比抽屉）。

**Date:** 2026-05-04
**Owner:** VolunteerHelper team
**Status:** Design (pending implementation)

---

## 1. 目标

为列表卡片和详情 hero 加入：
1. 院校 logo（真实图片优先，缺失走柔色 hash fallback）
2. 基于 `predictedMinRank.point` 的冲稳保染色 + 距离信号
3. confidence 不确定性的视觉表达

让用户在扫读列表时即刻判断"这个院校对我而言是冲/稳/保/垫"，不需要心算位次差。

---

## 2. 范围（落地页面）

| 页面 | 路径 | 落点 | 数据源 |
|---|---|---|---|
| **scores 查询** | `apps/web/src/app/(main)/scores/page.tsx` | 表格每行染色 + 距离 + 徽章 | `aggregatedAdmission.predictedMinRank` |
| **专业详情"开设院校"tab** | `apps/web/src/app/(main)/majors/[id]/page.tsx` | 院校列表表格染色 + 徽章 | 同上（API 同样的聚合） |
| **院校详情 hero** | `apps/web/src/app/(main)/universities/[id]/page.tsx` | logo 80px + 染色横幅副标 | 该院校最佳预测（按用户选科匹配） |
| ~~**学生志愿单**~~ | ~~`apps/web/src/app/(student)/student/plans/[id]/page.tsx`~~ | **范围调整：移出 spec-1**。理由见下方说明。 | — |

**学生志愿单页面调整说明（spec 修订 2026-05-04）**：
该页面已有自有的 6 档梯度系统（`rush-high/rush-low/stable-high/stable-low/safe-high/safe-low`），由后端 `plan_items.gradient` 字段驱动；渲染走 `PlanItemCard` 而非通用表格；含 expand/collapse、批注、`admissionProbability`、确认方案等完整业务逻辑。spec-1 的 4 档实时染色与之逻辑不同源、不同粒度。直接替换会丢失现有业务能力且违反 surgical-changes 原则。本页面延后到独立 spec（plan-page-redesign）专门处理，spec-1 不动。

不在 spec-1 内：
- 趋势 sparkline（spec-2）
- 一分一段直方图（spec-2）
- 对比抽屉（spec-3）
- 院校列表页（universities 列表）— 粒度太粗（一所院校多专业组），染色易误导
- recommend 页 — 已有自有逻辑，不在本次统一范围

---

## 3. 染色规则

### 3.1 阈值（基于 spec-0.5 v2 sanity 报告 MAE 推导）

阈值 = 2 × 实测 MAE，让"稳"区间表示"在模型不确定性内"。

```typescript
// apps/web/src/utils/admission-thresholds.ts
export interface TierThresholds {
  /** 半宽：|diff| < stable → 稳 */
  stable: number;
  /** 半宽：stable ≤ |diff| < safe → 保（diff>0）或 冲（diff<0）*/
  safe: number;
  /** 半宽：|diff| ≥ elite → 垫 */
  elite: number;
}

export type Tier = '985' | '211' | '普通本科' | '专科';

export const TIER_THRESHOLDS: Record<Tier, TierThresholds> = {
  '985':     { stable: 1500,  safe: 5000,  elite: 15000 },
  '211':     { stable: 4000,  safe: 12000, elite: 30000 },
  '普通本科': { stable: 10000, safe: 30000, elite: 80000 },
  '专科':    { stable: 20000, safe: 60000, elite: 150000 },
};

/** 历史科 MAPE (14.74%) 是物理科 (6.36%) 的 2.3x；阈值放宽 1.5x 缓冲 */
export const HISTORY_SCIENCE_MULTIPLIER = 1.5;

/** 双口径相对比例阈值（与绝对阈值并行判定，取风险更高的档） */
export const RATIO_THRESHOLDS = {
  rushMax: -0.10,      // ratio < -10% → 冲
  stableMax: 0.15,     // ratio < +15% → 稳
  safeMax: 0.50,       // ratio < +50% → 保
  // 否则 → 垫
};
```

未来调阈值：直接编辑此文件 → commit → deploy。git 留版本历史。

### 3.2 分档函数

```typescript
// apps/web/src/utils/classify-rank.ts
export type RankTier = 'rush' | 'stable' | 'safe' | 'elite' | 'unknown';

export function classifyRank(
  userRank: number,
  predictedRank: number | null,
  universityTier: Tier,
  isHistorical: boolean,
): RankTier {
  if (predictedRank == null) return 'unknown';

  const diff = predictedRank - userRank;       // 正 = 我胜
  const ratio = diff / Math.max(1, userRank);

  // 绝对阈值（按层次）
  const t = TIER_THRESHOLDS[universityTier];
  const m = isHistorical ? HISTORY_SCIENCE_MULTIPLIER : 1;
  const absStable = t.stable * m;
  const absSafe = t.safe * m;
  const absElite = t.elite * m;

  let absTier: RankTier;
  if (diff < -absStable) absTier = 'rush';
  else if (diff < absStable) absTier = 'stable';
  else if (diff < absSafe) absTier = 'safe';
  else absTier = 'elite';

  // 相对阈值
  let ratioTier: RankTier;
  if (ratio < RATIO_THRESHOLDS.rushMax) ratioTier = 'rush';
  else if (ratio < RATIO_THRESHOLDS.stableMax) ratioTier = 'stable';
  else if (ratio < RATIO_THRESHOLDS.safeMax) ratioTier = 'safe';
  else ratioTier = 'elite';

  // 取风险更高的档（rush > stable > safe > elite）
  const RISK_ORDER: RankTier[] = ['rush', 'stable', 'safe', 'elite'];
  return RISK_ORDER[Math.min(RISK_ORDER.indexOf(absTier), RISK_ORDER.indexOf(ratioTier))];
}
```

### 3.3 院校 tier 派生

```typescript
/**
 * Derives the threshold tier for a (university, current row's batch) pair.
 *
 * Rationale: the batch matters because the same university can offer both 普通本科
 * and 高职(专科) recruitments. The tier is row-specific, not university-global.
 *
 * Decision order (first match wins):
 *   1. 985 → '985'
 *   2. 211 → '211'
 *   3. batch contains '专科' OR '高职' → '专科'
 *   4. else → '普通本科'
 */
function getTier(input: { is985: boolean; is211: boolean; batch: string }): Tier {
  if (input.is985) return '985';
  if (input.is211) return '211';
  if (input.batch.includes('专科') || input.batch.includes('高职')) return '专科';
  return '普通本科';
}
```

### 3.4 历史科判定

```typescript
function isHistorical(subjects: string): boolean {
  return subjects.includes('历史');
}
```

---

## 4. 视觉规范

### 4.1 列表卡片（D 方案：扁平单行）

```
┌─[竖条 3px 染色]─────────────────────────────────────────┐
│  [logo 40px] [校名] [tag] [专业·组]    [-3380] [冲]    │
└──────────────────────────────────────────────────────────┘
```

- 卡高约 64px，单行布局
- 左侧 3px 竖条：染色 (`#c53030 / #2c5282 / #276749 / #b8860b / #d1cfc5`)
- logo 40×40 圆角 8px
- 信息区单行：`uni-name | tag chips | meta（专业·选科·组code）`
- 右侧 stats: `差距数字`（红/绿/琥珀，serif 字体，tabular-nums）+ `档位徽章`（pill 形状）

距离数字格式：
- `diff < 0`：`-3380`（红）
- `diff > 0` 且 < safe 阈值：`+800`（绿）
- `diff > 0` 且 ≥ safe 阈值：`+30000`（琥珀，归入"垫"暗示位次差距大）

徽章文案：`冲 / 稳 / 保 / 垫`（单字，对应 4 档 RankTier）

### 4.2 院校详情 hero（B 方案：横幅副标）

```
┌────────────────────────────────────────────────────────┐
│  [logo 80px]  四川大学  [985] [211] [双一流]            │
│              综合类·公办·教育部直属·全国排名 #11        │
│  ┌────────────────────────────────────────────────┐    │
│  │ [冲] 最低组 1620 名 — 你需要再涨 3380 名 [仅供参考] │    │
│  └────────────────────────────────────────────────┘    │
└────────────────────────────────────────────────────────┘
```

- logo 80×80
- 染色横幅紧贴标题下方，背景色取染色对应的浅色版（`#fef0ee` / `#ebf2f8` / `#e8f1ec` / `#f5edd6`）
- 横幅文案模板（自然语言）：
  - 冲: `[冲] 最低组 X 名 — 你需要再涨 (-diff) 名`
  - 稳: `[稳] 最低组 X 名 — 高出 (+diff) 名`
  - 保: `[保] 最低组 X 名 — 高出 (+diff) 名`
  - 垫: `[垫] 最低组 X 名 — 远高于你的位次`
  - 数据缺失: `[暂无预测] 当前数据不足以预估录取位次`
- 右侧"仅供参考"小字仅当 confidence='low' 时显示

详情页"该校最佳预测"选择规则：取该校 `普通类本科 / 普通类高职(专科)` recruitType + 与用户选科匹配的预测中 `point` 最低（最难录的组），代表院校的"最低门槛"。

### 4.3 logo fallback（Y 方案：柔色 hash 循环）

```typescript
// apps/web/src/components/university/UniversityLogo.tsx
const PASTEL_PALETTE: Array<{ bg: string; fg: string }> = [
  { bg: '#c5d9e8', fg: '#1e3a5f' }, // 蓝
  { bg: '#e8d4b8', fg: '#6b4520' }, // 琥珀
  { bg: '#d4c5e8', fg: '#4a2d70' }, // 紫
  { bg: '#cce0d4', fg: '#1e4a30' }, // 绿
];

function hashName(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return Math.abs(h) % PASTEL_PALETTE.length;
}

function firstChar(name: string): string {
  // "中国政法大学" → "政"; "四川大学" → "川"; 默认第一字
  const stripped = name.replace(/^(中国|中央|北京|上海)/, '');
  return stripped[0] ?? name[0] ?? '?';
}
```

加载策略：
- `<img src={logoUrl}>` 优先；onError → 切换到 fallback div
- 缺失 logoUrl 直接渲染 fallback
- fallback `<div>` 用 inline style 应用 PASTEL_PALETTE[hash] 颜色

---

## 5. confidence 与数据缺失

### 5.1 confidence='low' 的表达（P1-C 方案：页头 banner）

scores / majors / plans 三个列表页页头加一行 banner（仅当当前结果集中含 low confidence 项时显示）：

```tsx
<div className="bg-[#fef9e7] border-l-[3px] border-l-[#d4a843] px-4 py-2 rounded mb-4">
  <span className="text-xs text-[#6b4520]">
    ⚠ 当前预测基于 2024-2025 两年新高考数据，2026 招生计划尚未公布。结果仅供参考。
  </span>
</div>
```

院校详情 hero 右侧"仅供参考"小字。

未来 confidence 混合时（部分 high/medium 部分 low），改为按行标识——本 spec 不实现。

### 5.2 predictedMinRank=null（P2-A 方案：灰带）

视觉与 4 档统一结构：
- 左侧竖条变灰 (`#d1cfc5`)
- 右侧徽章变灰，文字"暂无预测"
- 距离数字位置空（不显示）

```tsx
<span className="bg-[#f0eee6] text-[#87867f] font-semibold px-2.5 py-1 rounded-full text-xs">
  暂无预测
</span>
```

---

## 6. 文件结构

| Action | Path | Responsibility |
|---|---|---|
| Create | `apps/web/src/utils/admission-thresholds.ts` | TIER_THRESHOLDS / RATIO_THRESHOLDS / HISTORY_SCIENCE_MULTIPLIER 常量 |
| Create | `apps/web/src/utils/classify-rank.ts` | classifyRank / getTier / isHistorical 纯函数 |
| Create | `apps/web/src/utils/classify-rank.spec.ts` | 单元测试 |
| Create | `apps/web/src/components/university/UniversityLogo.tsx` | 实图加载 + Y 方案 fallback |
| Create | `apps/web/src/components/admission/RankTierBadge.tsx` | 4 档徽章 + unknown 灰带 |
| Create | `apps/web/src/components/admission/RankDistance.tsx` | 距离数字（带颜色 + 正负号） |
| Create | `apps/web/src/components/admission/AdmissionRow.tsx` | D 方案单行卡组件，scores/majors/plans 复用 |
| Create | `apps/web/src/components/admission/LowConfidenceBanner.tsx` | P1-C 页头 banner |
| Create | `apps/web/src/components/admission/HeroBanner.tsx` | 院校详情页 hero 横幅副标 |
| Modify | `apps/web/src/app/(main)/scores/page.tsx` | 表格行替换为 AdmissionRow |
| Modify | `apps/web/src/app/(main)/scores/ExpandedAdmissionRow.tsx` | 展开行附加 confidence + basisYears 详情 |
| Modify | `apps/web/src/app/(main)/majors/[id]/page.tsx` | "开设院校" tab 表格替换 |
| Modify | `apps/web/src/app/(main)/universities/[id]/page.tsx` | hero 区添加 logo + HeroBanner |
| Modify | `apps/web/src/app/(student)/student/plans/[id]/page.tsx` | plan items 替换为 AdmissionRow |
| Modify | `apps/web/src/services/university.ts` | 详情接口若无 predictedMinRank 字段，新增聚合查询调用 |

---

## 7. 数据流

### 7.1 scores 页（已通）

```
useQuery(['admission-aggregated', query])
  → admissionService.getAggregated(query)
  → GET /admissions/aggregated → AggregatedAdmissionResponse
    每条 item.predictedMinRank: PredictedMinRank | null
    用 classifyRank(userRank, item.predictedMinRank?.point, getTier(...), isHistorical(...))
    渲染 AdmissionRow
```

### 7.2 majors 详情页 "开设院校" tab

当前接口 `majorService.getById(id)` 返回的 `enrollmentPlans`/`admissionRecords` 没有 predictedMinRank。两种实现：

- **方案 X**：后端 `MajorService.findOne` 增加 join `RankPrediction`（与 admission.service 用同样 join 模式）
- **方案 Y**：前端用 `admissionService.getAggregated({ majorId: m.id, pageSize: 100 })` 替代

推荐 **方案 X**，避免前端改用查询接口（majors 详情需要的不只是录取数据）。

### 7.3 plan 志愿单

学生 plan items 已有 universityId + groupCode + batch + recruitType + subjects。新增 API 调用：`POST /admissions/lookup-predictions`，body 是 keys 列表，返回每 key 对应 PredictedMinRank。

或更简：`student plans page` 用现成 `getAggregated` 多次调用（每个 item 一次），但效率差。

推荐新增 batch lookup endpoint。

### 7.4 院校详情 hero

`universityService.getById(id)` 在响应里附加 `bestPrediction: PredictedMinRank | null`，后端按"普通类本科 + 用户当前选科"找最低 point 的预测。或前端用 `getAggregated({ universityId: id, pageSize: 50 })` 拿到候选后挑最低。

推荐后端附加，简化前端逻辑。

---

## 8. 用户位次来源

`useUserStore` 有 `examInfo: { score, rank, province, subjects }`。染色用 `examInfo.rank`。

如果 rank 为空：所有染色降级为 `unknown`（灰带），不展示距离数字，不显示 banner。

---

## 9. 后端补充工作

| Endpoint | 职责 | 状态 |
|---|---|---|
| `GET /admissions/aggregated` | 已含 `predictedMinRank` | ✅ |
| `GET /majors/:id` | 增加 `enrollmentPlans[].predictedMinRank` 字段 | 🆕 |
| `GET /universities/:id` | 增加 `bestPrediction: PredictedMinRank \| null` | 🆕 |
| `POST /admissions/lookup-predictions` | 批量按自然键查 prediction | 🆕 |

3 个新 backend 修改放在 spec-1 实施 plan 内（同分支同 PR）。

---

## 10. 测试

### 10.1 单元

- `classifyRank` 各档边界（含 historical multiplier、双口径取 risker、null prediction → unknown）
- `getTier` 各院校属性组合（985+211 → 985；只 211 → 211；都不是 + 专科 batch → 专科；其他 → 普通本科）
- `isHistorical` 各 subjects 取值

### 10.2 视觉

Storybook 不在范围内。改用 Playwright e2e：
- scores 页打开后渲染 AdmissionRow 含徽章
- 详情页 hero 横幅展示
- predictedMinRank=null 时显示灰带

可选，时间紧可以推后。

---

## 11. 风险

| # | 风险 | 缓解 |
|---|---|---|
| R1 | 后端 3 处 API 修改超出范围，spec-1 启动延期 | 把 backend changes 切成"必须做"（aggregated 已 done）vs"nice-to-have"（majors / universities 详情）；plan 优先做 scores 页效果 |
| R2 | 阈值定得不合适，用户反馈不准 | 阈值在常量文件，调整 5 分钟。MAE-derived 数字本身可信 |
| R3 | logoUrl 实图加载慢拖累首屏 | `<img loading="lazy">` + fallback 容器 always rendered（onerror 切换） |
| R4 | 首字提取 "中国/中央/北京/上海" 之外的前缀也容易撞色 | 第一版接受撞色（YAGNI），未来按校徽色或 enrollCode 派生更好的 hash 输入 |
| R5 | 用户 rank 缺失时全站灰带可能让产品看起来失效 | 列表页 banner 引导填位次，CTA 跳到 RankInput |

---

## 12. 实施顺序

```
Phase 1: 共享组件 + 后端补充
  T1.1 admission-thresholds.ts + classify-rank.ts + tests
  T1.2 UniversityLogo.tsx (Y方案 fallback)
  T1.3 RankTierBadge.tsx + RankDistance.tsx
  T1.4 AdmissionRow.tsx
  T1.5 LowConfidenceBanner.tsx + HeroBanner.tsx
  T1.6 后端 majors/[id] + universities/[id] 接口扩展
  T1.7 (可选) batch lookup endpoint for plan items

Phase 2: 落地各页面
  T2.1 scores page → AdmissionRow
  T2.2 universities detail hero
  T2.3 majors detail "开设院校"
  T2.4 student plans page

Phase 3: 收尾
  T3.1 user rank 缺失时的 CTA 引导
  T3.2 e2e smoke test (可选)
  T3.3 部署 + UAT
```

---

## 13. 与下游的接口锁定

- spec-2 sparkline 会复用 `RankDistance` 的颜色规则（涨跌箭头染色）
- spec-3 对比抽屉会复用 `RankTierBadge` 视觉
- spec-1 的染色阈值常量在 admission-thresholds.ts，后续 spec 直接 import
