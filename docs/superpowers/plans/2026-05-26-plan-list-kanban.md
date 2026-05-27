# 方案管理看板视图 Implementation Plan (Plan 7)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 方案管理列表 `/teacher/plans` 当前是 antd Table(默认)+ 简单 Card 视图切换。教培场景下,5 个状态计数卡(全部/待审/已通过/已定稿/已退回)是**计数视图**——老师看完还要再点筛选才能动手。本 plan 把 Card 模式升级为按「等谁动作」分列的 **Kanban 看板视图**(4 列:等老师/等学生家长/等主管/终稿已提交),并设为默认。Table 模式保留为切换选项。

**Architecture:** 纯前端改造,无后端 API 变更。复用 Plan 6c 的 "track" 概念,定义 `getPlanTrack(plan)` 函数把 plan status 映射到 4 个 column。Card 模式被 kanban 替代。表格模式保留。

**Tech Stack:** Next.js (App Router) + React Query + antd + Tailwind. 无新依赖。

---

## File Structure

**Single file refactor:**
- Modify: `apps/web/src/app/(teacher)/teacher/plans/page.tsx` (current 358 lines → expected ~520-580 lines after refactor)

新组件 / helper 加在同文件,跟现有 inner functions 并列。

---

## Task 1: getPlanTrack helper + Kanban toggle + localStorage 记忆

**Files:**
- Modify: `apps/web/src/app/(teacher)/teacher/plans/page.tsx`

**Goal:** 把 viewMode 选项从 `'table' | 'card'` 改为 `'table' | 'kanban'`,默认 `'kanban'`,加 localStorage 记忆。添加 `getPlanTrack` 函数把 plan status 映射到 4 个 track。

### Step 1: 加 PlanTrack 类型 + getPlanTrack helper + 标签 maps

In `apps/web/src/app/(teacher)/teacher/plans/page.tsx`, after the existing `Plan` interface and `getBatchLabel` / `formatDate` utility functions (around lines 49-58), insert:

```typescript
// 方案当前所属的"任务轨"——与 Dashboard 三轨对齐
type PlanTrack =
  | 'wait-teacher'      // 等老师动手(DRAFT, REJECTED, APPROVED 等待家长确认前)
  | 'wait-parent'        // 等学生家长(APPROVED 老师已定稿等家长确认,PARENT_CONFIRMED 等签字)
  | 'wait-supervisor'   // 等主管审核(PENDING_REVIEW, REVIEWING)
  | 'delivered';         // 终稿/已提交(FINALIZED, PUBLISHED, OUTDATED)

function getPlanTrack(plan: Plan): PlanTrack {
  const status = plan.status;
  if (status === 'PENDING_REVIEW' || status === 'REVIEWING') return 'wait-supervisor';
  if (status === 'APPROVED' || status === 'PARENT_CONFIRMED') return 'wait-parent';
  if (status === 'FINALIZED' || status === 'PUBLISHED' || status === 'OUTDATED') return 'delivered';
  // DRAFT, REJECTED, 其它 — 等老师动手
  return 'wait-teacher';
}

const TRACK_META: Record<
  PlanTrack,
  { label: string; emoji: string; toneClass: string; emptyText: string }
> = {
  'wait-teacher': {
    label: '等老师动手',
    emoji: '🔴',
    toneClass: 'text-rush',
    emptyText: '老师侧无待办',
  },
  'wait-parent': {
    label: '等学生家长',
    emoji: '📤',
    toneClass: 'text-primary',
    emptyText: '家长侧无待办',
  },
  'wait-supervisor': {
    label: '等主管审核',
    emoji: '⏳',
    toneClass: 'text-accent',
    emptyText: '主管侧无待审',
  },
  'delivered': {
    label: '终稿/已提交',
    emoji: '✓',
    toneClass: 'text-safe',
    emptyText: '尚无已交付方案',
  },
};
```

### Step 2: 改 viewMode 类型 + 默认值 + localStorage 记忆

Find around line 78:
```typescript
const [viewMode, setViewMode] = useState<'table' | 'card'>('table');
```

Replace with:

```typescript
  const [viewMode, setViewMode] = useState<'table' | 'kanban'>(() => {
    if (typeof window === 'undefined') return 'kanban';
    const saved = window.localStorage.getItem('teacher-plans-view') as
      | 'table'
      | 'kanban'
      | null;
    return saved ?? 'kanban';
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('teacher-plans-view', viewMode);
    }
  }, [viewMode]);
```

注意:`useEffect` 已经 imported via 'react' line 3.

### Step 3: 更新 Segmented options

Find around line 266-273 the existing Segmented:

```jsx
            <Segmented
              options={[
                { value: 'table', icon: <UnorderedListOutlined /> },
                { value: 'card', icon: <AppstoreOutlined /> },
              ]}
              value={viewMode}
              onChange={(value) => setViewMode(value as 'table' | 'card')}
            />
```

Replace with:

```jsx
            <Segmented
              options={[
                { label: '看板', value: 'kanban', icon: <AppstoreOutlined /> },
                { label: '表格', value: 'table', icon: <UnorderedListOutlined /> },
              ]}
              value={viewMode}
              onChange={(value) => setViewMode(value as 'table' | 'kanban')}
            />
```

Notes:
- Reordered so "看板" appears first (matches default).
- Added text labels next to icons for clarity.

### Step 4: 改条件渲染分支名

Find around line 282-291 the conditional render:

```jsx
      ) : viewMode === 'table' ? (
        <Table ... />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {/* 旧 card grid */}
        </div>
      )}
```

For Task 1, keep the existing card branch as-is (just renamed by viewMode comparison). Change condition to `viewMode === 'kanban'`:

```jsx
      ) : viewMode === 'table' ? (
        <Table ... />
      ) : (
        // Kanban view — Task 2 will replace this with KanbanBoard
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {/* 暂时保留旧 card grid,Task 2 会替换 */}
          ... (现有 card grid JSX 不动)
        </div>
      )}
```

### Step 5: TS compile check

```bash
cd apps/web && pnpm tsc --noEmit 2>&1 | grep "plans/page" | head -10
```

Expected: 0 errors. If there's a warning about `getPlanTrack` being unused, that's OK — Task 2 will use it.

### Step 6: Commit

```bash
git add apps/web/src/app/\(teacher\)/teacher/plans/page.tsx
git commit -m "feat(plan-list): add getPlanTrack helper + change view default to kanban with localStorage"
```

---

## Task 2: KanbanBoard 组件 + 4 列布局 + 增强 PlanCard

**Files:**
- Modify: `apps/web/src/app/(teacher)/teacher/plans/page.tsx`

**Goal:** 用 `KanbanBoard` 替换 Task 1 留下的"旧 card grid"分支。Board 按 4 个 track 分列,每列内的方案显示为增强的 `PlanCard`。

### Step 1: 加 KanbanBoard 组件

At the end of `TeacherPlansPageInner` function (or right after the function, at module level), add:

```typescript
function KanbanBoard({
  plans,
  onDelete,
  deletePendingId,
}: {
  plans: Plan[];
  onDelete: (plan: Plan) => void;
  deletePendingId: number | undefined;
}) {
  // 按 4 个 track 分组
  const grouped: Record<PlanTrack, Plan[]> = {
    'wait-teacher': [],
    'wait-parent': [],
    'wait-supervisor': [],
    'delivered': [],
  };
  plans.forEach((p) => {
    grouped[getPlanTrack(p)].push(p);
  });

  // 每列内部按 updatedAt 倒序
  (Object.keys(grouped) as PlanTrack[]).forEach((track) => {
    grouped[track].sort((a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
  });

  const tracks: PlanTrack[] = ['wait-teacher', 'wait-parent', 'wait-supervisor', 'delivered'];

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {tracks.map((track) => {
        const meta = TRACK_META[track];
        const items = grouped[track];
        return (
          <div key={track} className="rounded-2xl bg-surface p-3 shadow-card">
            <div className="mb-3 flex items-baseline justify-between">
              <h3 className={`m-0 text-sm font-semibold ${meta.toneClass}`}>
                {meta.emoji} {meta.label}
              </h3>
              <span className="text-xs text-text-muted">{items.length}</span>
            </div>
            <div className="space-y-2">
              {items.length === 0 ? (
                <p className="m-0 px-2 py-4 text-xs text-text-muted">{meta.emptyText}</p>
              ) : (
                items.map((plan) => (
                  <PlanCard
                    key={plan.id}
                    plan={plan}
                    onDelete={onDelete}
                    deletePending={deletePendingId === plan.id}
                  />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

### Step 2: 加 PlanCard 组件

After KanbanBoard, add:

```typescript
function PlanCard({
  plan,
  onDelete,
  deletePending,
}: {
  plan: Plan;
  onDelete: (plan: Plan) => void;
  deletePending: boolean;
}) {
  return (
    <div className="rounded-lg border border-border-subtle bg-bg/30 p-3 transition hover:border-primary hover:bg-surface">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <Link
          href={`/teacher/plans/${plan.id}`}
          className="truncate text-sm font-medium text-text no-underline hover:text-primary"
        >
          {plan.studentName}
        </Link>
        <span className="flex-shrink-0 text-[10px] text-text-muted">v{plan.version}</span>
      </div>
      <div className="mb-2 flex items-center justify-between">
        <PlanStatusBadge status={plan.status} />
        <span className="text-[10px] text-text-muted">{getBatchLabel(plan.batch)}</span>
      </div>
      <div className="flex items-center justify-between text-[11px] text-text-muted">
        <span>志愿 {plan.itemCount} 条</span>
        <span>{formatDate(plan.updatedAt)}</span>
      </div>
      {plan.status === 'DRAFT' ? (
        <div className="mt-2 flex justify-end">
          <Button
            danger
            type="text"
            size="small"
            icon={<DeleteOutlined />}
            loading={deletePending}
            onClick={() => onDelete(plan)}
          >
            删除草稿
          </Button>
        </div>
      ) : null}
    </div>
  );
}
```

### Step 3: 替换 kanban 分支的 JSX

Find the `kanban` branch of the conditional render (added in Task 1). Replace the old card grid with:

```jsx
      ) : (
        <KanbanBoard
          plans={plans}
          onDelete={confirmDeletePlan}
          deletePendingId={
            deleteMutation.isPending ? (deleteMutation.variables as number | undefined) : undefined
          }
        />
      )}
```

(`confirmDeletePlan` already exists in `TeacherPlansPageInner`.)

### Step 4: TS compile check

```bash
cd apps/web && pnpm tsc --noEmit 2>&1 | grep "plans/page" | head -10
```

Expected: 0 errors.

### Step 5: Commit

```bash
git add apps/web/src/app/\(teacher\)/teacher/plans/page.tsx
git commit -m "feat(plan-list): add KanbanBoard with 4-track grouping"
```

---

## Task 3: 替换计数卡为 track 摘要(可选简化) + 自我审查

**Files:**
- Modify: `apps/web/src/app/(teacher)/teacher/plans/page.tsx`

**Goal:** 当前页面顶部有 5 个状态计数卡(全部/待审/已通过/已定稿/已退回)。看板已经在 column header 展示每个 track 的 count,这 5 个计数卡显得冗余。本 task 把它们简化为 4 个 track-aligned 计数卡(与看板对齐),保持视觉一致。

### Step 1: 改 counts 计算逻辑

Find around line 96-105 the existing counts useMemo. Replace its body:

```typescript
  const trackCounts = useMemo(() => {
    const c: Record<PlanTrack, number> = {
      'wait-teacher': 0,
      'wait-parent': 0,
      'wait-supervisor': 0,
      'delivered': 0,
    };
    plans.forEach((p) => {
      c[getPlanTrack(p)] += 1;
    });
    return c;
  }, [plans]);
```

Keep the old `counts` as well **if** any other JSX refers to `counts.all / counts.pending / etc.` Specifically check the header text "X 份方案 · Y 份待审核 · Z 份已定稿" (around line 215-217) — it references `counts.all`, `counts.pending`, `counts.finalized`. Decision:

- Easiest: keep BOTH `counts` and `trackCounts`. Header still uses `counts.all / counts.pending / counts.finalized`. The summary card row uses `trackCounts`.
- Alternative: update header to use `trackCounts` (`trackCounts.wait-supervisor` 对应"待审", but语义略偏差).

**Recommended:** Keep both. `counts` is for status-level numbers in header, `trackCounts` is for track-level summary cards.

Add `trackCounts` next to existing `counts`, don't delete `counts`.

### Step 2: 替换 5 个状态计数卡为 4 个 track 摘要卡

Find around line 224-237 the existing grid of 5 cards:

```jsx
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-5">
        {[
          ['全部', counts.all, 'border-l-primary'],
          ['待审核', counts.pending, 'border-l-rush'],
          ...
        ].map(...)}
      </div>
```

Replace with:

```jsx
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {(['wait-teacher', 'wait-parent', 'wait-supervisor', 'delivered'] as PlanTrack[]).map(
          (track) => {
            const meta = TRACK_META[track];
            return (
              <div
                key={track}
                className="rounded-2xl border-l-[3px] border-l-primary bg-surface px-4 py-3 shadow-card"
              >
                <p className="text-[11px] font-medium uppercase tracking-[1.4px] text-text-muted">
                  {meta.emoji} {meta.label}
                </p>
                <p className="mt-1 font-serif text-2xl font-semibold text-text">
                  {trackCounts[track]}
                </p>
              </div>
            );
          },
        )}
      </div>
```

注:统一用 `border-l-primary`(蓝色)边线,不再每个状态一个不同颜色——颜色靠 emoji 表达即可,卡片本身保持视觉一致。如果想保留区分色,可以从 `TRACK_META` 加 `borderClass` 字段,但 Plan 7 范围内简化为单色。

### Step 3: TS compile check

```bash
cd apps/web && pnpm tsc --noEmit 2>&1 | grep "plans/page" | head -10
```

Expected: 0 errors.

### Step 4: 自我审查 + 测试性 verify

读完整 page.tsx 顶部 to 底部,确认:
- viewMode 默认 kanban
- localStorage 记忆 viewMode
- 4 个 track 摘要卡顶部
- Kanban 视图 4 列展示
- Table 视图 fallback 工作
- PlanCard 显示 学生名/v 版本/状态 badge/批次/志愿数/更新时间/删除按钮(仅 DRAFT)

### Step 5: 残留 grep

```bash
grep -n "counts.approved\|counts.rejected\|'card'" "apps/web/src/app/(teacher)/teacher/plans/page.tsx"
```

Expected: 
- `counts.approved` / `counts.rejected` 可能仍出现(被 keep 的 counts 引用),但只要 JSX 里没用到就 OK
- `'card'` 不应再有(viewMode 现在只接受 `'kanban' | 'table'`)

If `'card'` still appears: it's stale. Remove or update to `'kanban'`.

### Step 6: 行数对照

```bash
wc -l "apps/web/src/app/(teacher)/teacher/plans/page.tsx"
```

Expected: ~520-580 lines.

### Step 7: Commit

```bash
git add apps/web/src/app/\(teacher\)/teacher/plans/page.tsx
git commit -m "feat(plan-list): replace status counts with track-aligned summary cards"
```

---

## Task 4: 自我审查 + 收尾

**No file changes — verification only.**

### Step 1: 全前端 TS 检查

```bash
cd apps/web && pnpm tsc --noEmit 2>&1 | grep "plans/page" | head -10
```

Expected: 0 errors.

### Step 2: 新组件 / helper 存在性

```bash
grep -n "function KanbanBoard\|function PlanCard\|function getPlanTrack\|PlanTrack\|TRACK_META\|trackCounts" "apps/web/src/app/(teacher)/teacher/plans/page.tsx"
```

Expected: 至少 6 个 matches.

### Step 3: 视图切换 + 看板列完整性

Read JSX. Confirm:
- `<Segmented value={viewMode} options={[{value:'kanban'...},{value:'table'...}]} />` 存在
- `{viewMode === 'table' ? <Table ... /> : <KanbanBoard ... />}` 条件渲染
- 顶部 4 个 track 摘要卡(grid-cols-4)
- 没有 `'card'` 字符串 leftover(被 'kanban' 替代)

### Step 4: 行数对照

```bash
wc -l "apps/web/src/app/(teacher)/teacher/plans/page.tsx"
```

Expected: 520-580 行.

### Step 5: Commit 历史

```bash
git log --oneline ecc5600..HEAD
```

Expected (3 commits):
1. `feat(plan-list): add getPlanTrack helper + change view default to kanban with localStorage`
2. `feat(plan-list): add KanbanBoard with 4-track grouping`
3. `feat(plan-list): replace status counts with track-aligned summary cards`

### Step 6: 总结

报告:
- **Status:** READY_TO_MERGE | NEEDS_FIXES

If READY_TO_MERGE: 概括看板视图 4 列、track 摘要卡、与 Dashboard 三轨/学生列表 6 chip 的对齐,以及已知 limitations(风险数显示 placeholder,等 Plan 4)。

---

## Self-Review Checklist

After all tasks complete, verify:

1. **Spec coverage**
   - ✅ Kanban 4 列布局(Task 2)
   - ✅ getPlanTrack 把 plan status 映射到 track(Task 1)
   - ✅ 默认视图改为 Kanban + localStorage 记忆(Task 1)
   - ✅ 表格视图保留(Task 1 retained Table branch)
   - ✅ track-aligned 摘要卡(Task 3)

2. **Placeholder scan**
   - ✅ 每个 step 有具体代码 / 命令

3. **Type consistency**
   - `PlanTrack` union 4 个值,TRACK_META / grouped / tracks 数组都按此顺序使用 — 一致

---

## Notes & Known Limits

- **getPlanTrack 与 getStudentTodoTrack 的关系**:两者都用"track"概念但来源不同。`getStudentTodoTrack(student, now)` 在 students/page.tsx 看的是 student.workflowStatus + completeness + plan status。`getPlanTrack(plan)` 在 plans/page.tsx 看的是单一 plan.status。两者覆盖不同 entity,不需要合并。
- **风险数显示**:Plan 7 暂时不在 PlanCard 上显示风险数(Plan 4 风险评估实装后再加)。当前显示志愿数即可。
- **同学生不同版本各占一卡**:已经天然实现——后端 `getTeacherPlans` 返回 Plan 对象列表,每个 plan 有自己的 versionNo,所以同学生不同版本会分别显示为不同卡。
- **`counts` 状态对象保留**:header 文案 "X 份方案 · Y 份待审 · Z 份已定稿" 仍用 counts。如果 future 想统一,可以在后续 plan 改造。
- **状态 PARENT_CONFIRMED 在 wait-parent**:虽然名字是"家长已确认",但定稿之前的最后一步仍归"等家长(完成签字/相关操作) → 进入终稿"。决策:暂归 wait-parent。如果觉得别扭,改为 'wait-teacher' 也合理(等老师按"定稿"按钮)。
