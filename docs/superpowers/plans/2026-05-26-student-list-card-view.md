# 学生列表卡片视图 Implementation Plan (Plan 6c)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 学生列表页 `/teacher/students` 默认是 antd Table 表格视图。教培场景 3-30 学生,表格信息密度高但读不出"这个人现在的故事"。本 plan 给学生列表加上**卡片视图**(默认),保留表格视图作为切换选项。同时,把现有的"数据维度筛选 chip"扩展为含「等我 / 等学生家长 / 等主管 / 已交付 / 沉默」的**任务维度 chip**(与 Dashboard 三轨对齐)。

**Architecture:** 纯前端改造,无后端 API 变更。新增视图切换 toggle、`StudentCard` 组件、单 student → todo-track 派生 helper(`getStudentTodoTrack`)。复用 Plan 6a 的 SOP 派生逻辑(7 节点 → 紧凑横向小节点条)。

**Tech Stack:** Next.js (App Router) + React Query + antd + Tailwind. 无新依赖。

---

## File Structure

**Single file refactor:**
- Modify: `apps/web/src/app/(teacher)/teacher/students/page.tsx` (current 548 lines → expected ~700-750 lines after refactor)

新组件 / helper 加在同文件末尾,跟其它 inner 组件并列。

---

## Task 1: 视图切换 toggle + 默认卡片视图

**Files:**
- Modify: `apps/web/src/app/(teacher)/teacher/students/page.tsx`

**Goal:** 在工具栏加一个「卡片 / 表格」切换 toggle,默认卡片。卡片视图先放空 placeholder,Task 2 填充。视图选择记忆在 localStorage(下次访问保持上次选择)。

### Step 1: 加 viewMode state

In `apps/web/src/app/(teacher)/teacher/students/page.tsx`, find `TeacherStudentsPageInner` function (around line 140). Near the existing useState declarations, add:

```typescript
  // 视图切换:卡片 / 表格。默认卡片,localStorage 记忆上次选择
  const [viewMode, setViewMode] = useState<'card' | 'table'>(() => {
    if (typeof window === 'undefined') return 'card';
    const saved = window.localStorage.getItem('teacher-students-view') as 'card' | 'table' | null;
    return saved ?? 'card';
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('teacher-students-view', viewMode);
    }
  }, [viewMode]);
```

### Step 2: 在工具栏加切换按钮

Find the toolbar area in the JSX (it has the search input + status filter dropdown + maybe export button). After or before those tools, add a Segmented or Radio.Group for view toggle:

```jsx
            <Segmented
              value={viewMode}
              onChange={(val) => setViewMode(val as 'card' | 'table')}
              options={[
                { label: '卡片', value: 'card' },
                { label: '表格', value: 'table' },
              ]}
            />
```

Make sure `Segmented` is imported from antd. If not, add it to the existing `from 'antd'` import.

### Step 3: 条件渲染主体

Find the main `<Table ... />` element. Wrap it in a conditional:

```jsx
        {viewMode === 'table' ? (
          <Table
            // ... existing Table props
          />
        ) : (
          <StudentCardGrid students={students} now={now} />
        )}
```

Where `now` is the existing `clock?.now ?? new Date()` available in the component.

For now, `StudentCardGrid` is the new component we'll define in Step 4 — it just shows a placeholder grid for Task 1. Task 2 fills it with real cards.

### Step 4: 加 StudentCardGrid placeholder 组件

At the end of the file, after existing inner helpers, insert:

```typescript
function StudentCardGrid({ students, now }: { students: Student[]; now: Date }) {
  if (students.length === 0) {
    return (
      <div className="rounded-2xl bg-surface py-20 text-center shadow-card">
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有学生符合筛选条件" />
      </div>
    );
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {students.map((s) => (
        <div
          key={s.id}
          className="rounded-lg border border-border-subtle bg-surface p-4 shadow-card"
        >
          <p className="m-0 font-medium">{getDisplayName(s)}</p>
          <p className="m-0 text-xs text-text-muted">
            完整度 {s.progress?.overallCompleteness ?? 0}% · 方案 {s.planCount ?? 0}
          </p>
          <p className="m-0 mt-1 text-xs text-text-muted">
            占位 — Task 2 会替换为完整 StudentCard 组件
          </p>
        </div>
      ))}
    </div>
  );
}
```

注意:`Empty`, `getDisplayName`, `Student` 都已存在于文件中,直接复用。`now` 参数现在没用,但保留接口,Task 2 会用它算"沉默时间"。

### Step 5: TS compile check

```bash
cd apps/web && pnpm tsc --noEmit 2>&1 | grep "students/page" | head -10
```

Expected: 0 errors specifically in this file.

### Step 6: Commit

```bash
git add apps/web/src/app/\(teacher\)/teacher/students/page.tsx
git commit -m "feat(student-list): add card/table view toggle with localStorage memory"
```

---

## Task 2: 真实的 StudentCard 设计

**Files:**
- Modify: `apps/web/src/app/(teacher)/teacher/students/page.tsx`

**Goal:** 替换 Task 1 的 placeholder 卡片,做真正的 StudentCard 组件:身份 + SOP 节点小条 + 当前状态 + 上次动作时间 + 数据指标 + 主操作按钮 + 沉默告警。

### Step 1: 加 getStudentTodoTrack helper

Near the top of the file (after existing utility functions like `formatRelativeTime`), insert:

```typescript
// 学生当前所属的"任务轨"——与 Dashboard 三轨对齐
type StudentTodoTrack =
  | 'wait-me'
  | 'wait-student-parent'
  | 'wait-supervisor'
  | 'sleeping'
  | 'delivered'
  | 'idle';

function getStudentTodoTrack(student: Student, now: Date): StudentTodoTrack {
  const status = getWorkflowStatus(student);
  const noActionDays = daysSince(student.updatedAt, now);
  const completeness = student.progress?.overallCompleteness ?? 0;

  if (status === 'SUBMITTED') return 'delivered';
  if (noActionDays !== null && noActionDays >= 7 && status !== 'FINALIZED') return 'sleeping';

  // PENDING_REVIEW / REVIEWING 状态走主管轨(注:student.latestPlanStatus 决定的更精确,fallback 用 workflowStatus)
  if (
    student.latestPlanStatus === 'PENDING_REVIEW' ||
    student.latestPlanStatus === 'REVIEWING'
  ) {
    return 'wait-supervisor';
  }

  if (status === 'COLLECTING' && completeness < 60) return 'wait-me';
  if (status === 'GENERATING') return 'wait-me';
  if (status === 'COLLECTING' && completeness >= 60) return 'wait-student-parent';
  if (status === 'FINALIZED') return 'wait-student-parent';

  return 'idle';
}

const TRACK_LABEL: Record<StudentTodoTrack, string> = {
  'wait-me': '等我动手',
  'wait-student-parent': '等学生家长',
  'wait-supervisor': '等主管审核',
  'sleeping': '沉默',
  'delivered': '已交付',
  'idle': '进行中',
};

const TRACK_TONE: Record<StudentTodoTrack, string> = {
  'wait-me': 'bg-rush text-white',
  'wait-student-parent': 'bg-primary text-white',
  'wait-supervisor': 'bg-accent text-white',
  'sleeping': 'bg-rush text-white',
  'delivered': 'bg-safe text-white',
  'idle': 'bg-text-muted text-white',
};
```

### Step 2: 加紧凑的 SOP mini-bar 组件

After the helpers, add a compact horizontal SOP bar:

```typescript
// 紧凑版 SOP 节点条:7 个圆点 + 标签缩略
function SopMiniBar({ student }: { student: Student }) {
  // 7 个节点状态简化:基于 workflowStatus + latestPlanStatus 推导
  const stages: { key: string; done: boolean; active: boolean }[] = [
    { key: '签', done: !!student.createdAt, active: false },
    { key: '采', done: getWorkflowStatus(student) !== 'COLLECTING', active: getWorkflowStatus(student) === 'COLLECTING' },
    { key: '案', done: ['REVIEWING', 'FINALIZED', 'SUBMITTED'].includes(getWorkflowStatus(student)), active: getWorkflowStatus(student) === 'GENERATING' },
    { key: '审', done: ['FINALIZED', 'SUBMITTED'].includes(getWorkflowStatus(student)), active: getWorkflowStatus(student) === 'REVIEWING' },
    { key: '稿', done: getWorkflowStatus(student) === 'SUBMITTED', active: getWorkflowStatus(student) === 'FINALIZED' },
    { key: '交', done: getWorkflowStatus(student) === 'SUBMITTED', active: false },
  ];

  return (
    <div className="flex items-center gap-1">
      {stages.map((s, i) => (
        <span key={s.key} className="flex items-center gap-1">
          <span
            aria-label={s.key}
            className={`inline-block h-2 w-2 rounded-full ${
              s.done
                ? 'bg-safe'
                : s.active
                  ? 'bg-accent'
                  : 'border border-text-muted bg-surface'
            }`}
          />
          {i < stages.length - 1 ? (
            <span aria-hidden className="h-px w-2 bg-border-subtle" />
          ) : null}
        </span>
      ))}
    </div>
  );
}
```

注:这是 6 圆点的简化版(比 Plan 6a 的 7 节点版少了"家长确认"——因为 workflowStatus 不直接区分这一步)。完整 7 节点版在详情页用,列表卡用 6 节点紧凑版即可。

### Step 3: 替换 StudentCardGrid 的占位 div 为真实卡片

Replace the entire `StudentCardGrid` component definition (added in Task 1):

```typescript
function StudentCardGrid({ students, now }: { students: Student[]; now: Date }) {
  if (students.length === 0) {
    return (
      <div className="rounded-2xl bg-surface py-20 text-center shadow-card">
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有学生符合筛选条件" />
      </div>
    );
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {students.map((s) => (
        <StudentCard key={s.id} student={s} now={now} />
      ))}
    </div>
  );
}

function StudentCard({ student, now }: { student: Student; now: Date }) {
  const track = getStudentTodoTrack(student, now);
  const name = getDisplayName(student);
  const completeness = student.progress?.overallCompleteness ?? 0;
  const lastUpdated = student.updatedAt ? new Date(student.updatedAt) : null;
  const lastActionStr = lastUpdated ? formatRelativeTime(lastUpdated, now) : '--';
  const totalScore = student.totalScore ?? null;
  const provincialRank = student.provincialRank ?? null;
  const planCount = student.planCount ?? 0;
  const latestPlanLabel = student.latestPlanStatus
    ? `v${student.latestPlanVersionNo ?? '?'} ${PLAN_STATUS_LABEL[student.latestPlanStatus] ?? student.latestPlanStatus}`
    : '无方案';

  // 沉默学生整卡降饱和
  const dimClass = track === 'sleeping' || track === 'delivered' ? 'opacity-70' : '';

  return (
    <Link
      href={`/teacher/students/${student.id}`}
      className={`block rounded-lg border border-border-subtle bg-surface p-4 no-underline shadow-card transition hover:border-primary hover:shadow-md ${dimClass}`}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="m-0 truncate font-medium text-text">{name}</p>
          <p className="m-0 text-xs text-text-muted">
            {totalScore != null ? `${totalScore} 分` : '--'} ·{' '}
            位次 {provincialRank != null ? provincialRank.toLocaleString('zh-CN') : '--'}
          </p>
        </div>
        <span
          className={`flex-shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${TRACK_TONE[track]}`}
        >
          {TRACK_LABEL[track]}
        </span>
      </div>

      <div className="mb-2">
        <SopMiniBar student={student} />
      </div>

      <div className="space-y-0.5 text-xs text-text-muted">
        <p className="m-0">资料 {completeness}% · 方案 {planCount} 份 · 最新 {latestPlanLabel}</p>
        <p className="m-0">上次动作 {lastActionStr}</p>
      </div>
    </Link>
  );
}
```

注意:
- `Link` 已在 import (line 4)
- `PLAN_STATUS_LABEL` 已在文件 (line 26-36 region)
- `getDisplayName`, `getWorkflowStatus`, `daysSince`, `formatRelativeTime` 都已在文件

### Step 4: TS compile check

```bash
cd apps/web && pnpm tsc --noEmit 2>&1 | grep "students/page" | head -10
```

Expected: 0 errors.

### Step 5: Commit

```bash
git add apps/web/src/app/\(teacher\)/teacher/students/page.tsx
git commit -m "feat(student-list): implement StudentCard with SOP mini-bar and track badge"
```

---

## Task 3: 任务维度 chip 行

**Files:**
- Modify: `apps/web/src/app/(teacher)/teacher/students/page.tsx`

**Goal:** 在现有"数据维度 chip"(全部/重点关注/未生成/审核中/高分) 之上加一行**任务维度 chip**:全部 / 等我 / 等学生家长 / 等主管 / 沉默 / 已交付。点击切换过滤。

### Step 1: 加 trackFilter state

In `TeacherStudentsPageInner`, after the existing `noPlanOnly` / `highScoreOnly` states, add:

```typescript
  const [trackFilter, setTrackFilter] = useState<StudentTodoTrack | 'all'>('all');
```

(`StudentTodoTrack` is from Task 2.)

### Step 2: 在 students useMemo 中加 trackFilter

Find the existing `students = useMemo(() => { ... }, [...])` computation. Add `trackFilter` handling. Currently the deps are `[allStudents, statusFilter, progressFilter, noPlanOnly, highScoreOnly]` — add `trackFilter, now` (now comes from `clock?.now ?? null`).

Add this as the first filter in the chain (so subsequent data-dim filters apply on top):

```typescript
    if (trackFilter !== 'all' && now) {
      list = list.filter((s) => getStudentTodoTrack(s, now) === trackFilter);
    }
```

Update the deps array to include `trackFilter` and `now`.

(`now` is `clock?.now`. If `clock` is null on first render, the trackFilter just doesn't apply yet — acceptable.)

### Step 3: 加 trackCounts useMemo

After the existing `counts` useMemo, add:

```typescript
  const trackCounts = useMemo(() => {
    if (!now) {
      return { 'wait-me': 0, 'wait-student-parent': 0, 'wait-supervisor': 0, sleeping: 0, delivered: 0, idle: 0 };
    }
    const c: Record<StudentTodoTrack, number> = {
      'wait-me': 0,
      'wait-student-parent': 0,
      'wait-supervisor': 0,
      'sleeping': 0,
      'delivered': 0,
      'idle': 0,
    };
    allStudents.forEach((s) => {
      const t = getStudentTodoTrack(s, now);
      c[t] += 1;
    });
    return c;
  }, [allStudents, now]);
```

### Step 4: 在工具栏上方加任务维度 chip 行

Find the existing chip row in the JSX (it has things like "全部 / 重点关注 / 未生成方案 / 审核中 / 高分"). ABOVE that chip row, add a new task-dimension chip row:

```jsx
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-text-muted">按任务:</span>
          <TaskChip
            label="全部"
            count={allStudents.length}
            active={trackFilter === 'all'}
            onClick={() => setTrackFilter('all')}
          />
          <TaskChip
            label="🔴 等我"
            count={trackCounts['wait-me']}
            active={trackFilter === 'wait-me'}
            onClick={() => setTrackFilter('wait-me')}
          />
          <TaskChip
            label="📤 等学生家长"
            count={trackCounts['wait-student-parent']}
            active={trackFilter === 'wait-student-parent'}
            onClick={() => setTrackFilter('wait-student-parent')}
          />
          <TaskChip
            label="⏳ 等主管"
            count={trackCounts['wait-supervisor']}
            active={trackFilter === 'wait-supervisor'}
            onClick={() => setTrackFilter('wait-supervisor')}
          />
          <TaskChip
            label="⚠️ 沉默"
            count={trackCounts['sleeping']}
            active={trackFilter === 'sleeping'}
            onClick={() => setTrackFilter('sleeping')}
          />
          <TaskChip
            label="✓ 已交付"
            count={trackCounts['delivered']}
            active={trackFilter === 'delivered'}
            onClick={() => setTrackFilter('delivered')}
          />
        </div>
```

### Step 5: 加 TaskChip 组件

At the end of the file (after StudentCard), add:

```typescript
function TaskChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs transition ${
        active
          ? 'border-primary bg-primary text-white'
          : 'border-border-subtle bg-surface text-text hover:border-primary'
      }`}
    >
      {label} <span className="ml-1 opacity-80">{count}</span>
    </button>
  );
}
```

### Step 6: `clearAllFilters` 函数也清空 trackFilter

Find `function clearAllFilters()` (around line 221-226). Add:

```typescript
    setTrackFilter('all');
```

to its body.

### Step 7: TS compile check

```bash
cd apps/web && pnpm tsc --noEmit 2>&1 | grep "students/page" | head -10
```

Expected: 0 errors.

### Step 8: Commit

```bash
git add apps/web/src/app/\(teacher\)/teacher/students/page.tsx
git commit -m "feat(student-list): add task-dimension chip filter (align with Dashboard tracks)"
```

---

## Task 4: 自我审查 + 收尾

**No file changes — verification only.**

### Step 1: 前端类型检查

```bash
cd apps/web && pnpm tsc --noEmit 2>&1 | grep "students/page" | head -10
```

Expected: 0 errors.

### Step 2: 新组件 / helper 存在性检查

```bash
grep -n "function StudentCard\|function StudentCardGrid\|function SopMiniBar\|function TaskChip\|function getStudentTodoTrack\|StudentTodoTrack" "apps/web/src/app/(teacher)/teacher/students/page.tsx"
```

Expected: 至少 6 个 matches(每个 component 一个 declaration + StudentTodoTrack 类型至少 1 个引用)。

### Step 3: 视图切换功能完整性

Read the JSX in `TeacherStudentsPageInner`. Confirm:
- `<Segmented value={viewMode} ... />` 存在
- `{viewMode === 'table' ? <Table ... /> : <StudentCardGrid ... />}` 条件渲染存在
- `<TaskChip ... />` x 6 在任务维度 chip 行
- 原数据维度 chip 行也保留(全部/重点关注/未生成/审核中/高分)

### Step 4: 行数对照

```bash
wc -l "apps/web/src/app/(teacher)/teacher/students/page.tsx"
```

Expected: ~700-750 行(从 548 行增加约 150-200 行)。

### Step 5: Commit 历史

```bash
git log --oneline ec03658..HEAD
```

Expected (3 commits):
1. `feat(student-list): add card/table view toggle with localStorage memory`
2. `feat(student-list): implement StudentCard with SOP mini-bar and track badge`
3. `feat(student-list): add task-dimension chip filter (align with Dashboard tracks)`

### Step 6: 总结

报告:

**Status:** READY_TO_MERGE | NEEDS_FIXES

If READY_TO_MERGE, brief paragraph summarizing:
- 视图切换(卡片默认/表格切换)
- StudentCard 信息密度
- SOP mini-bar 6 节点设计
- 任务维度 chip 行(对齐 Dashboard 三轨)
- 已知 limitations

## Report Format

- **Status:** READY_TO_MERGE | NEEDS_FIXES
- TSC errors in file (should be 0)
- New components/helpers found (list)
- View toggle works (verified by reading JSX)
- Filter chips present (count)
- Final line count
- Commit history match (yes/no)
- Final assessment paragraph

---

## Self-Review Checklist

After all tasks complete, verify:

1. **Spec coverage**
   - ✅ 视图切换 toggle(Task 1)
   - ✅ 默认卡片视图(Task 1)
   - ✅ StudentCard 含 SOP mini-bar + 状态 badge + 主操作链接(Task 2)
   - ✅ 任务维度 chip 行(Task 3)
   - ✅ 沉默学生告警(降饱和 + sleeping badge)
   - ✅ 视图选择 localStorage 记忆

2. **Placeholder scan**
   - ✅ 每个 step 有具体代码 / 命令

3. **Type consistency**
   - `StudentTodoTrack` union 6 个 value('wait-me' | 'wait-student-parent' | 'wait-supervisor' | 'sleeping' | 'delivered' | 'idle')
   - 6 个 chip + 1 个 'all' = 7 个状态(getStudentTodoTrack 返回 6 个,'all' 是 filter-level 概念)

---

## Notes & Known Limits

- **SOP mini-bar 是 6 节点紧凑版**(签/采/案/审/稿/交),不是 Plan 6a 详情页的 7 节点版。列表卡空间有限,跳过"家长确认"中间节点(主管审 → 终稿之间)。
- **任务维度 chip 和数据维度 chip 并存**:老师可以"先按任务筛 + 再按数据维度细化"组合。
- **`getStudentTodoTrack` 跟 Dashboard 的 `categorizeStudents` 是平行实现**:这次没把它们合并到一个 utility file(避免引入 cross-page 依赖)。若以后改 track 判定规则,需要在两处同步。如果以后觉得维护负担大,可以抽到 `apps/web/src/utils/student-track.ts`。
- **`trackFilter='all'` 默认值**:首次打开页面显示全部学生,跟旧版行为一致。
- **`SubmittedSubmittedSubmitted` 等已交付学生展示在卡片视图**:降饱和(opacity-70),不抢视觉。如果数据多了想完全隐藏,加 toggle "显示已交付"。但 3-30 人场景下保留即可。
