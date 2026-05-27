# Data Trust Patches Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修补两处让老师"对数据失去信任"的呈现问题——①Dashboard 顶部时间硬编码(连 `VOLUNTEER_DEADLINE_IS_LAST_YEAR = true` 这种"用的是去年数据"的 flag 都没在 UI 上显示出来);②方案详情志愿表的历史录取分只显示一档,老师不知道当前算法用的是"25 年专业级"还是"25 年组级"还是"24 年专业级"。

**Architecture:** 纯前端改造。后端 `GET /timeline?year=YYYY` 和 `timelineApi.getTimeline()` 早已存在,只是 dashboard 没用上。PlanItem 表早已存有 `score25Major / score25Group / score24Major` 三个字段,只是 `getHistoricalScore()` 函数把它们 collapse 成一个返回值。本 plan 把后端已有数据"接通"到前端 UI。

**Tech Stack:** Next.js (App Router) + React Query + antd + Tailwind. 无新依赖。

---

## File Structure

**Frontend only:**

- Modify: `apps/web/src/app/(teacher)/teacher/dashboard/page.tsx` — Dashboard 时间接 timeline
- Modify: `apps/web/src/app/(teacher)/teacher/plans/[id]/page.tsx` — 志愿表三档分显示 + `getHistoricalScore` 改造
- (可能) Create: `apps/web/src/app/(teacher)/teacher/plans/[id]/__tests__/getHistoricalScore.test.ts` — 如果 `getHistoricalScore` 改成结构化返回,加单测

**No backend changes.** Timeline API 和 PlanItem 数据均已就绪。

---

## Task 1: Dashboard 接 Timeline API + 删除 Hardcoded 日期

**Files:**
- Modify: `apps/web/src/app/(teacher)/teacher/dashboard/page.tsx`

**Goal:** 用 `timelineApi.getTimeline()` 替换 hardcoded `EXAM_DATE` 和 `VOLUNTEER_DEADLINE`,让 dashboard 显示真实的本年高考/志愿截止日期。删除 `VOLUNTEER_DEADLINE_IS_LAST_YEAR` 这种欺骗性的 flag。

### Step 1: 加 timelineApi 导入

In `apps/web/src/app/(teacher)/teacher/dashboard/page.tsx`, line 17-19 import 区附近,加入:

```typescript
import { timelineApi, type TimelineEvent } from '@/services/timeline-api';
```

### Step 2: 删除 hardcoded 常量

Locate lines 21-24:
```typescript
// 高考 / 志愿填报截止日。今年官方日期公布前先用去年时间，由 VOLUNTEER_DEADLINE_IS_LAST_YEAR 控制 UI 提示
const EXAM_DATE = '2026-06-07T09:00:00+08:00';
const VOLUNTEER_DEADLINE = '2026-06-30T18:00:00+08:00';
const VOLUNTEER_DEADLINE_IS_LAST_YEAR = true;
```

Replace with:
```typescript
// 兜底日期:仅在 timeline API 加载失败或事件缺失时使用。来源:四川省教育考试院 2026 年通知。
const FALLBACK_EXAM_DATE = '2026-06-07T09:00:00+08:00';
const FALLBACK_DEADLINE_REGULAR = '2026-07-01T17:00:00+08:00';
```

注意:
- `VOLUNTEER_DEADLINE` 的 fallback 改为 `2026-07-01T17:00:00+08:00`(本科批截止真实日期),不再是 6/30 18:00
- 删除 `VOLUNTEER_DEADLINE_IS_LAST_YEAR` —— 它当前是 `true` 但 UI 没有任何地方使用它做提示(这是欺骗性 flag)

### Step 3: 在组件内加 useQuery 拉 timeline

Locate the `export default function TeacherDashboardPage()` (or similar — search for `export default function` near line 200+). Inside it, near where other `useQuery` calls are made, insert:

```typescript
  // 拉取真实 timeline 数据:高考日期 / 志愿填报截止 / 各批次录取窗口
  // 失败时使用 FALLBACK_* 常量,但 UI 上不再标注"这是去年数据",因为现在数据是当年的官方值
  const { data: timelineData } = useQuery({
    queryKey: ['timeline', new Date().getFullYear()],
    queryFn: () => timelineApi.getTimeline(),
    staleTime: 1000 * 60 * 60, // timeline 数据一小时缓存够了
  });
  const timelineEvents: TimelineEvent[] = timelineData?.events ?? [];

  // 从 events 提取关键日期,缺失则用 fallback
  const examDate = useMemo(() => {
    const gaokao = timelineEvents.find((e) => e.key === 'gaokao');
    return new Date(gaokao?.startDate ?? FALLBACK_EXAM_DATE);
  }, [timelineEvents]);

  const deadlineDate = useMemo(() => {
    // 本科批截止是教培老师最关心的;提前批/专科批截止可在副位展示(Task 后续可扩展)
    const regular = timelineEvents.find((e) => e.key === 'volunteer_deadline_regular');
    return new Date(regular?.startDate ?? FALLBACK_DEADLINE_REGULAR);
  }, [timelineEvents]);
```

放置位置参考:在 `now` state 设置(useEffect setNow)之后,在 `useMemo` 数据派生之前。如果不确定,在第一个 `useQuery` 之后插入。

### Step 4: 替换 examDate / deadlineDate 的使用

Locate around lines 222-224 (current code uses local `examDate` / `deadlineDate` defined as `new Date(EXAM_DATE)` / `new Date(VOLUNTEER_DEADLINE)`):

```typescript
  const examDate = new Date(EXAM_DATE);
  const deadlineDate = new Date(VOLUNTEER_DEADLINE);
  const examDaysLeft = Math.max(0, daysUntil(examDate, now));
  const deadlineDaysLeft = Math.max(0, daysUntil(deadlineDate, now));
```

Since `examDate` and `deadlineDate` are now provided by the `useMemo`s from Step 3, the local `new Date(...)` lines must be DELETED (they would shadow the useMemo values, or cause "variable already declared" errors). Find these lines and remove them. The `useMemo` values from Step 3 take their place.

Verify after edit:
- `examDate` is the useMemo result (from Step 3), not a local `new Date(EXAM_DATE)`
- `deadlineDate` is the useMemo result (from Step 3), not a local `new Date(VOLUNTEER_DEADLINE)`
- `examDaysLeft` and `deadlineDaysLeft` still work (their `daysUntil(examDate, now)` calls use the useMemo values)

### Step 5: 删除 `VOLUNTEER_DEADLINE_IS_LAST_YEAR` 的剩余引用

Run:
```bash
grep -n "VOLUNTEER_DEADLINE_IS_LAST_YEAR\|EXAM_DATE\b\|VOLUNTEER_DEADLINE\b" "apps/web/src/app/(teacher)/teacher/dashboard/page.tsx"
```

Each occurrence should be:
- Either deleted (if it was a `const` declaration or import)
- Or replaced (if it was a usage of the old constant — should already be handled in Step 4)

After Step 5 there should be ZERO matches for `VOLUNTEER_DEADLINE_IS_LAST_YEAR`. The other two (`EXAM_DATE`, `VOLUNTEER_DEADLINE`) may still match if they appear in `FALLBACK_EXAM_DATE` etc. — that's expected and OK.

If `VOLUNTEER_DEADLINE_IS_LAST_YEAR` is used in any conditional (e.g., `if (VOLUNTEER_DEADLINE_IS_LAST_YEAR) { ... show warning ... }`), the entire branch should be removed because timeline data is now real-time. Read any such usage and decide:
- If it shows a "this is last year's data" warning → remove the warning entirely (we now show real data)
- If it's used for any other purpose → flag as DONE_WITH_CONCERNS and ask

### Step 6: TS compile check

Run:
```bash
cd apps/web && pnpm tsc --noEmit 2>&1 | grep "dashboard/page" | head -10
```

Expected: zero errors in this file.

### Step 7: Commit

```bash
git add apps/web/src/app/\(teacher\)/teacher/dashboard/page.tsx
git commit -m "feat(dashboard): pull exam/deadline dates from timeline API instead of hardcoded"
```

---

## Task 2: 改造 `getHistoricalScore` 返回结构化结果

**Files:**
- Modify: `apps/web/src/app/(teacher)/teacher/plans/[id]/page.tsx`

**Goal:** 把 `getHistoricalScore(item) -> number | null` 改成 `getHistoricalScore(item) -> { score: number; source: string } | null`,让 UI 能告诉老师"这分是哪个维度的"。

### Step 1: 改造函数实现

Locate line 90-93 in `apps/web/src/app/(teacher)/teacher/plans/[id]/page.tsx`:

```typescript
// 历史最低分：优先 25 年专业级，依次回退专业组、旧 lastYearMinScore
function getHistoricalScore(item: any): number | null {
  return item?.score25Major ?? item?.score25Group ?? item?.lastYearMinScore ?? null;
}
```

Replace with:

```typescript
// 历史录取分来源枚举(供 UI 标注当前算法在用哪档)
export type HistoricalScoreSource = 'major25' | 'group25' | 'major24' | 'legacy';

export interface HistoricalScoreResult {
  score: number;
  source: HistoricalScoreSource;
}

// 历史最低分:返回 { score, source } 让 UI 能告诉老师当前是哪个维度的数据
// 优先级:25 年专业级 > 25 年专业组级 > 24 年专业级 > 旧字段
function getHistoricalScore(item: any): HistoricalScoreResult | null {
  if (item?.score25Major != null) return { score: item.score25Major, source: 'major25' };
  if (item?.score25Group != null) return { score: item.score25Group, source: 'group25' };
  if (item?.score24Major != null) return { score: item.score24Major, source: 'major24' };
  if (item?.lastYearMinScore != null) return { score: item.lastYearMinScore, source: 'legacy' };
  return null;
}
```

注意:`score24Major` 之前不在函数里,加入它是因为 PlanItem 表确实有这个字段,且 brainstorming 阶段确认要显示三档。

### Step 2: 处理所有 5 个调用点

`getHistoricalScore` 在文件里被调用 5 次(line 356, 512, 530, 533, 539)。每处都从 `number | null` 变成 `{ score, source } | null`,需要把使用 `hist - studentScore` 这种数值运算的地方改成 `hist.score - studentScore`。

Run to locate all callsites:
```bash
grep -n "getHistoricalScore" "apps/web/src/app/(teacher)/teacher/plans/[id]/page.tsx"
```

For each callsite, edit:

**Callsite 1 (around line 356):** in `summary` useMemo, `margins.map(...)`:
```typescript
// BEFORE:
.map((it) => {
  const hist = getHistoricalScore(it);
  return studentScore != null && hist != null ? studentScore - hist : null;
})

// AFTER:
.map((it) => {
  const hist = getHistoricalScore(it);
  return studentScore != null && hist != null ? studentScore - hist.score : null;
})
```

**Callsite 2 (around line 512):** in column render — likely something like:
```typescript
// BEFORE:
const score = getHistoricalScore(item);
return score != null ? <span>{score}</span> : <span>--</span>;

// AFTER:
const hist = getHistoricalScore(item);
return hist != null ? <span>{hist.score}</span> : <span>--</span>;
```

Task 3 will redo this UI properly. For now, just make it COMPILE — change `score` to `hist.score`.

**Callsites 3 & 4 (around line 530, 533):** in sorter, computing `sa` and `sb`:
```typescript
// BEFORE:
const sa = summary.studentScore != null && getHistoricalScore(a) != null
  ? summary.studentScore - (getHistoricalScore(a) as number)
  : null;

// AFTER:
const histA = getHistoricalScore(a);
const sa = summary.studentScore != null && histA != null
  ? summary.studentScore - histA.score
  : null;
```

(Same pattern for sb. Avoid calling `getHistoricalScore(a)` twice — pull into local.)

**Callsite 5 (around line 539):** similar render, change `score` → `hist.score`.

### Step 3: TS compile check

Run:
```bash
cd apps/web && pnpm tsc --noEmit 2>&1 | grep "plans/\[id\]/page" | head -10
```

Expected: zero errors. If errors remain, they probably point to a callsite you missed — fix them.

### Step 4: Commit

```bash
git add apps/web/src/app/\(teacher\)/teacher/plans/\[id\]/page.tsx
git commit -m "refactor(plan-detail): return source-tagged historical score"
```

---

## Task 3: 志愿表历史分列显示三档 + 标注当前算法用的是哪档

**Files:**
- Modify: `apps/web/src/app/(teacher)/teacher/plans/[id]/page.tsx`

**Goal:** 在志愿表的"历史录取分"列展示三档(25年专业级 / 25年组级 / 24年专业级),并用视觉提示告诉老师当前算法用的是哪档。Hover 看完整来源说明。

### Step 1: 加 source 标签的展示工具

In `apps/web/src/app/(teacher)/teacher/plans/[id]/page.tsx`, near the top (after `HistoricalScoreResult` type definition from Task 2), add:

```typescript
const SOURCE_LABEL: Record<HistoricalScoreSource, string> = {
  major25: '25 年专业级',
  group25: '25 年组级',
  major24: '24 年专业级',
  legacy: '旧字段(兼容)',
};

const SOURCE_TONE: Record<HistoricalScoreSource, string> = {
  major25: 'text-primary',       // 最优先,蓝色
  group25: 'text-text-secondary', // 较粗,灰色
  major24: 'text-success',        // 较旧但精确,绿色
  legacy: 'text-text-muted',      // 兜底,弱化
};
```

注意:具体 Tailwind class 可能因项目 theme 不同需调整。读 dashboard/page.tsx 或其他 antd-tailwind 混用页面看现有 color token 命名,选最接近的。

### Step 2: 找到志愿表"历史录取分"列的 column 定义

Find the columns definition in `apps/web/src/app/(teacher)/teacher/plans/[id]/page.tsx`. Look for the column with title containing "历史" or "录取" or similar. It will be in the Table columns array.

Run:
```bash
grep -n "历史\|录取分\|score25\|title:.*分" "apps/web/src/app/(teacher)/teacher/plans/[id]/page.tsx"
```

The render function for this column is what we'll modify.

### Step 3: 改造 render — 三档显示 + 高亮当前来源

Replace the existing single-value render of historical score with:

```typescript
{
  title: '历史录取分',
  key: 'historical',
  width: 160,
  render: (_: unknown, item: any) => {
    const active = getHistoricalScore(item);  // 当前算法用的那一档
    if (active == null) return <span className="text-text-muted">--</span>;

    // 收集所有可用档位用于 hover/tooltip
    const all: { source: HistoricalScoreSource; score: number }[] = [];
    if (item.score25Major != null) all.push({ source: 'major25', score: item.score25Major });
    if (item.score25Group != null) all.push({ source: 'group25', score: item.score25Group });
    if (item.score24Major != null) all.push({ source: 'major24', score: item.score24Major });
    if (all.length === 0 && item.lastYearMinScore != null) {
      all.push({ source: 'legacy', score: item.lastYearMinScore });
    }

    return (
      <Tooltip
        title={
          <div className="space-y-1 text-xs">
            <div className="font-medium">历史录取分(各维度)</div>
            {all.map((d) => (
              <div key={d.source} className={d.source === active.source ? 'font-medium' : 'opacity-70'}>
                {SOURCE_LABEL[d.source]}: {d.score}
                {d.source === active.source ? ' ← 当前算法' : ''}
              </div>
            ))}
            <div className="border-t border-text-muted/30 pt-1 text-text-muted">
              数据来源:四川省教育考试院历年录取数据
            </div>
          </div>
        }
      >
        <div className="flex flex-col leading-tight">
          <span className={`text-sm font-medium ${SOURCE_TONE[active.source]}`}>
            {active.score}
          </span>
          <span className="text-[10px] text-text-muted">{SOURCE_LABEL[active.source]}</span>
        </div>
      </Tooltip>
    );
  },
},
```

注意:
- `Tooltip` 来自 antd,可能已经在文件顶部 import。如果没有,加 `Tooltip` 到 antd import
- `Tooltip` 包裹的内容只显示**主要档位**(active 那个的数值+小字 source),hover 才展开所有维度
- 不会让单元格变高变胖 — 仍然紧凑

### Step 4: 验证 Tooltip 已被 import

Run:
```bash
grep -n "import.*Tooltip\|from 'antd'" "apps/web/src/app/(teacher)/teacher/plans/[id]/page.tsx" | head -5
```

If `Tooltip` is not in the antd import, add it. Find the existing `import { ... } from 'antd'` and append `Tooltip`.

### Step 5: TS compile check

Run:
```bash
cd apps/web && pnpm tsc --noEmit 2>&1 | grep "plans/\[id\]/page" | head -10
```

Expected: zero errors.

### Step 6: Commit

```bash
git add apps/web/src/app/\(teacher\)/teacher/plans/\[id\]/page.tsx
git commit -m "feat(plan-detail): show historical score tiers with source attribution"
```

---

## Task 4: 自我审查 + 收尾验证

**No file changes — verification only.**

### Step 1: 跑全量前端类型检查

Run:
```bash
cd apps/web && pnpm tsc --noEmit 2>&1 | grep -E "dashboard/page|plans/\[id\]/page" | head -20
```

Expected: zero errors specifically pointing at the two plan-touched files. Pre-existing errors elsewhere in the codebase are tolerated.

### Step 2: 检查所有相关常量已被清理

Run:
```bash
grep -rn "VOLUNTEER_DEADLINE_IS_LAST_YEAR" "apps/web/src/" || echo "OK: no residual references"
```

Expected: `OK: no residual references` (or 0 matches).

### Step 3: 检查 commit 历史

Run:
```bash
git log --oneline 0fe987e..HEAD
```

Expected output (3 commits, in order):
1. `feat(dashboard): pull exam/deadline dates from timeline API instead of hardcoded`
2. `refactor(plan-detail): return source-tagged historical score`
3. `feat(plan-detail): show historical score tiers with source attribution`

### Step 4: 手动 E2E sanity check (if dev env available)

如果有 dev env:
```bash
cd apps/server && pnpm dev   # Terminal 1
cd apps/web && pnpm dev      # Terminal 2
```

打开 http://localhost:3000/teacher/dashboard:
- 确认顶部倒计时显示真实日期(从 timeline API 而非 hardcoded)
- F12 Network 看到对 `/timeline` 的 GET 请求,返回 events 列表
- 不再有"使用去年数据"的提示

打开任一已生成方案的详情页 http://localhost:3000/teacher/plans/<id>:
- 志愿表的"历史录取分"列显示主要数值+小字标注(如 `605` + 小字 `25 年专业级`)
- Hover 单元格弹出 tooltip,显示所有可用档位+哪个是"当前算法"
- 不同 source 的数值有不同颜色(蓝/灰/绿/弱)

如无 dev env,跳过此步,依赖 tsc 检查。

### Step 5: 总结

报告:
- **Status:** READY_TO_MERGE | NEEDS_FIXES
- TSC errors in plan-touched files
- All hardcoded VOLUNTEER_DEADLINE_IS_LAST_YEAR cleaned
- 3 commits present in correct order
- (If E2E ran) UI behaviors verified

---

## Self-Review Checklist

After all tasks complete, verify:

1. **Spec coverage**
   - ✅ Dashboard 时间来自 timeline API(Task 1)
   - ✅ Hardcoded `VOLUNTEER_DEADLINE_IS_LAST_YEAR` 移除(Task 1 Step 5)
   - ✅ 历史分来源标注(Task 2 改造数据形态 + Task 3 UI 呈现)
   - ✅ 三档同时可见(主要数值+小字 + Tooltip 完整)

2. **Placeholder scan**
   - ✅ 每个 step 都有具体代码/命令
   - ✅ TSC 检查作为每个 Task 的 quality gate

3. **Type consistency**
   - `HistoricalScoreResult { score, source }` 由 Task 2 定义,Task 3 使用 — 一致
   - `HistoricalScoreSource` 4 个枚举值('major25' | 'group25' | 'major24' | 'legacy') 在 SOURCE_LABEL / SOURCE_TONE / getHistoricalScore 三处都用 — 一致

---

## Notes & Known Limits

- **不动后端**:timeline API 和 PlanItem 数据都现成,不新增字段或端点
- **fallback 仅在 API 失败时用**:正常情况下显示的是真实数据,fallback 不会触发
- **`score24Major` 加入主优先级链**:之前函数 fallback 链不包含 24 年数据,Task 2 加上 — 这是合理扩展,因为表里本来就有这字段,数据可信
- **风险:**Tooltip 在移动端可能不友好(hover 不存在),目前 antd Tooltip 默认在触屏端点击触发,可接受
