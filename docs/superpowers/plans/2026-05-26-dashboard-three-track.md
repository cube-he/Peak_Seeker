# Dashboard 三轨重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把教培老师 dashboard 从「BI 看板范式」(漏斗/风险中心/指标卡)改造为「服务台范式」(等我动手 / 等学生家长 / 等主管 三轨待办流 + 服务进度全貌缩略卡)。3-30 个学生的教培场景下,漏斗和指标卡无意义,老师真正需要的是"现在 30 分钟该做什么"的明确动作清单。

**Architecture:** 纯前端改造,无后端 API 变更。数据来源仍然是现有的 `studentApi.getList()` 和 `planApi.getTeacherPlans()`。改 dashboard/page.tsx 内的:
- 重写 `computeRisks()` → 新函数 `categorizeStudents()`,返回 4 个数组(waitMe / waitStudent / waitSupervisor / sleeping)
- 删除 `FunnelSection`,`RiskSection`,`MetricsSection` 三个内联组件
- 新增 `ThreeTrackTodoSection`(三轨待办)和 `ServiceProgressSection`(学生服务进度缩略)
- 主组件 layout 重排:顶部 A 区(已是 Plan 1 改造后) + 三轨 + 缩略 + 移除原 B/C/D 区

**Tech Stack:** Next.js (App Router) + React Query + antd + Tailwind. 无新依赖。

---

## File Structure

**Single file refactor:**
- Modify: `apps/web/src/app/(teacher)/teacher/dashboard/page.tsx` (current 579 lines → expected ~600-650 lines after refactor)

**Optional unit test:**
- Create: `apps/web/src/app/(teacher)/teacher/dashboard/__tests__/categorizeStudents.test.ts` — 如果 `categorizeStudents` 的分类逻辑值得单测,且项目用 jest/vitest 跑前端单测的话

---

## Task 1: 重构数据分类函数 `categorizeStudents()`

**Files:**
- Modify: `apps/web/src/app/(teacher)/teacher/dashboard/page.tsx`

**Goal:** 把 `computeRisks()`(103-189 行附近) 替换为 `categorizeStudents()`,把学生 + pending plans 分类到 4 个 bucket。同时删除旧的 `RiskItem` 接口,引入新的 `TodoItem` 接口。

### Step 1: 加 TodoItem 接口

In `apps/web/src/app/(teacher)/teacher/dashboard/page.tsx`, find the existing `interface RiskItem { ... }` (around line 64-74). Replace it with:

```typescript
// 三轨待办流 + 沉默学生的统一项目结构
interface TodoItem {
  key: string;             // 唯一 key (e.g. 'pending-plan-42')
  studentId: number;
  name: string;
  initial: string;
  // 这一条出现在哪个轨上,决定颜色和分组
  track: 'wait-me' | 'wait-student-parent' | 'wait-supervisor' | 'sleeping';
  // 主标签,显示在卡片标题旁(如 "主管退回" / "等家长确认" / "无动作 5 天")
  label: string;
  // 副文,显示在主标签下(如 "v2 退回 3 天前" / "上次动作 6/10")
  detail: string;
  // 主操作按钮
  primaryAction: { label: string; href: string };
  // 排序优先级(数字越大越靠前)
  priority: number;
}
```

Keep the existing `interface PendingPlan` (around line 56-62) — it's still used.

### Step 2: 替换 computeRisks → categorizeStudents

Replace the entire `computeRisks()` function (around line 103-189) with `categorizeStudents()`:

```typescript
function categorizeStudents(
  students: StudentCard[],
  pendingPlans: PendingPlan[],
  now: Date,
): {
  waitMe: TodoItem[];
  waitStudentParent: TodoItem[];
  waitSupervisor: TodoItem[];
  sleeping: TodoItem[];
} {
  const waitMe: TodoItem[] = [];
  const waitStudentParent: TodoItem[] = [];
  const waitSupervisor: TodoItem[] = [];
  const sleeping: TodoItem[] = [];

  // ── 等主管:由 plan status PENDING_REVIEW 驱动 ──
  // (在教培场景里,提交主管审核的方案 = 等主管审核)
  pendingPlans.forEach((plan) => {
    const days = daysSince(plan.updatedAt, now);
    const name = plan.studentName || '学生';
    waitSupervisor.push({
      key: `pending-${plan.id}`,
      studentId: plan.studentId,
      name,
      initial: name.charAt(0),
      track: 'wait-supervisor',
      label: '等主管审核',
      detail: days === null ? `刚提交` : `提交 ${days} 天前`,
      primaryAction: { label: '查看方案', href: `/teacher/plans/${plan.id}` },
      priority: 1000 - (days ?? 0), // 越久越靠前(优先级更高)
    });
  });

  // ── 学生分类:基于 workflowStatus + 上次动作时间 ──
  students.forEach((student) => {
    const status = getWorkflowStatus(student);
    const name = student.realName || student.username || '学生';
    const initial = name.charAt(0);
    const studentId = student.id;
    const noActionDays = daysSince(student.updatedAt, now);
    const completeness = getCompleteness(student);

    // 已交付学生不进任何轨
    if (status === 'SUBMITTED') return;

    // 沉默 ≥7 天:进沉默轨(优先级独立)
    if (noActionDays !== null && noActionDays >= 7 && status !== 'FINALIZED') {
      sleeping.push({
        key: `sleeping-${studentId}`,
        studentId,
        name,
        initial,
        track: 'sleeping',
        label: `沉默 ${noActionDays} 天`,
        detail: `当前${STATUS_LABELS[status] ?? '未知'} · 完整度 ${completeness}%`,
        primaryAction: { label: '联系跟进', href: `/teacher/students/${studentId}` },
        priority: 800 + noActionDays,
      });
      return;
    }

    // 等我动手:COLLECTING + 完整度 < 60% (老师需要去采集)
    if (status === 'COLLECTING' && completeness < 60) {
      waitMe.push({
        key: `collect-${studentId}`,
        studentId,
        name,
        initial,
        track: 'wait-me',
        label: '待采集资料',
        detail: `完整度 ${completeness}% · 老师需补充`,
        primaryAction: { label: '继续采集', href: `/teacher/students/${studentId}` },
        priority: 500 + (60 - completeness),
      });
      return;
    }

    // 等我动手:GENERATING (老师该生成 / 修改方案了)
    if (status === 'GENERATING') {
      waitMe.push({
        key: `generate-${studentId}`,
        studentId,
        name,
        initial,
        track: 'wait-me',
        label: '待生成方案',
        detail: `资料已齐 ${completeness}% · 等老师出方案`,
        primaryAction: { label: '生成方案', href: `/teacher/plans/generate/${studentId}` },
        priority: 600,
      });
      return;
    }

    // 等学生家长:COLLECTING + 完整度 ≥ 60%(资料大部分齐了,等学生家长补充剩余)
    if (status === 'COLLECTING' && completeness >= 60) {
      waitStudentParent.push({
        key: `student-fill-${studentId}`,
        studentId,
        name,
        initial,
        track: 'wait-student-parent',
        label: '等家长补资料',
        detail: `已 ${completeness}% · 缺剩余字段`,
        primaryAction: { label: '查看 / 催办', href: `/teacher/students/${studentId}` },
        priority: 300 + completeness,
      });
      return;
    }

    // 等学生家长:FINALIZED(终稿,等家长确认 / 等填报)
    // (注:FINALIZED 在 SOP 里相当于"已定稿,待提交考试院";老师已经做完,等家长签字)
    if (status === 'FINALIZED') {
      waitStudentParent.push({
        key: `finalize-${studentId}`,
        studentId,
        name,
        initial,
        track: 'wait-student-parent',
        label: '终稿待签字',
        detail: `方案已定稿 · 等家长确认提交`,
        primaryAction: { label: '查看方案', href: `/teacher/students/${studentId}` },
        priority: 400,
      });
      return;
    }

    // REVIEWING 状态:方案在主管手上,前面 pendingPlans 已经覆盖,这里不重复加
  });

  // 各轨内部按 priority 倒序
  waitMe.sort((a, b) => b.priority - a.priority);
  waitStudentParent.sort((a, b) => b.priority - a.priority);
  waitSupervisor.sort((a, b) => b.priority - a.priority);
  sleeping.sort((a, b) => b.priority - a.priority);

  return { waitMe, waitStudentParent, waitSupervisor, sleeping };
}
```

### Step 3: 更新主组件的调用

Find around line 278 in the main component:

```typescript
  const risks = useMemo(
    () => computeRisks(students, pendingPlans, now, deadlineDate),
    [students, pendingPlans, now, deadlineDate],
  );
```

Replace with:

```typescript
  const categorized = useMemo(
    () => categorizeStudents(students, pendingPlans, now),
    [students, pendingPlans, now],
  );
```

注意:新函数不需要 `deadlineDate` 参数(三轨分类跟截止日期无关,沉默是按"上次动作天数"判定的)。如果有其它地方用 `risks` 变量,你需要在 Tasks 2-3 改造时一并改。

### Step 4: 删除旧的 RiskItem 相关引用准备

`risks.length`,`risks.slice(0, 6)`,`RiskItem` 等任何 reference 后续 Tasks 2-4 会清理或替换。Task 1 不动这些(否则会有大量 TS error)。

Task 1 只完成"加新函数、新接口,把 useMemo 切换"。**TS 编译此时可能有错误**(因为下游组件 RiskSection 期待 RiskItem[],但我们已经不传 risks 了 — 主组件里 RiskSection 仍然 reference `risks` 变量)。这些错误在 Task 3 解决。

为了确保 Task 1 自身能编译通过(不阻塞 commit),保留一个临时变量:

在 categorized 之后,加一行:
```typescript
  const risks: TodoItem[] = [
    ...categorized.waitMe,
    ...categorized.waitStudentParent,
    ...categorized.waitSupervisor,
    ...categorized.sleeping,
  ];
```

这样旧的 `RiskSection risks={risks}` 调用仍然能传一个数组,但里面项的字段是 TodoItem 不是 RiskItem。这会导致 RiskSection 内部 TS error,因为它访问 `.severity`,`.tag`,`.reason` 等 RiskItem 字段。

**所以 Task 1 实际上无法独立通过 TS 编译。** 我们接受这个,Task 1 commit 会让 TS 报错,Task 3 会把 RiskSection 整个删掉。

实际操作:Task 1 跑 `pnpm tsc --noEmit` 时 grep "dashboard/page" 应该会显示 RiskSection 相关错误。在 commit message 里注明这是中间态。

### Step 5: TS compile check (允许 dashboard 错误,仅检查其它文件未被破坏)

```bash
cd apps/web && pnpm tsc --noEmit 2>&1 | grep "dashboard/page" | head -20
```

Expected: 出现 `RiskItem` / `risks` 相关的 type errors — 这是预期的中间态。

```bash
cd apps/web && pnpm tsc --noEmit 2>&1 | grep -v "dashboard/page" | grep "error TS" | head -10
```

Expected: 0 个新错误。pre-existing errors 是允许的。

### Step 6: Commit

```bash
git add apps/web/src/app/\(teacher\)/teacher/dashboard/page.tsx
git commit -m "refactor(dashboard): introduce categorizeStudents() for three-track classification (intermediate state, TS errors expected until Task 3)"
```

---

## Task 2: 新组件 `ThreeTrackTodoSection`

**Files:**
- Modify: `apps/web/src/app/(teacher)/teacher/dashboard/page.tsx`

**Goal:** 加入新的 UI section,展示三个待办轨道(等我 / 等学生家长 / 等主管)+ 独立的沉默轨。

### Step 1: 加 ThreeTrackTodoSection 组件

In `apps/web/src/app/(teacher)/teacher/dashboard/page.tsx`, after the existing `MetricsSection` definition (the last component, around line 544-579), add a new component:

```typescript
// ── 三轨待办流 + 沉默学生 ──
function ThreeTrackTodoSection({
  waitMe,
  waitStudentParent,
  waitSupervisor,
  sleeping,
}: {
  waitMe: TodoItem[];
  waitStudentParent: TodoItem[];
  waitSupervisor: TodoItem[];
  sleeping: TodoItem[];
}) {
  return (
    <section className="rounded-2xl bg-surface shadow-card">
      <div className="border-b border-border-subtle px-6 py-4">
        <h2 className="text-lg font-semibold text-text">今天该做什么</h2>
      </div>
      <div className="grid gap-4 px-6 py-5 lg:grid-cols-3">
        <TodoTrack
          title="🔴 等我动手"
          items={waitMe}
          emptyText="所有学生待办都不在你这里 ✓"
          accentClass="text-rush"
        />
        <TodoTrack
          title="📤 等学生家长"
          items={waitStudentParent}
          emptyText="学生家长侧无待办"
          accentClass="text-primary"
        />
        <TodoTrack
          title="⏳ 等主管审核"
          items={waitSupervisor}
          emptyText="无方案在主管手上"
          accentClass="text-accent"
        />
      </div>
      {sleeping.length > 0 ? (
        <div className="border-t border-border-subtle bg-bg/40 px-6 py-4">
          <h3 className="mb-2 text-sm font-semibold text-rush">
            ⚠️ 沉默学生 ({sleeping.length})
          </h3>
          <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
            {sleeping.map((item) => (
              <TodoCard key={item.key} item={item} dim />
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

// 三轨各自的列
function TodoTrack({
  title,
  items,
  emptyText,
  accentClass,
}: {
  title: string;
  items: TodoItem[];
  emptyText: string;
  accentClass: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className={`text-sm font-semibold ${accentClass}`}>
        {title} ({items.length})
      </h3>
      {items.length === 0 ? (
        <p className="text-xs text-text-muted">{emptyText}</p>
      ) : (
        items.slice(0, 6).map((item) => <TodoCard key={item.key} item={item} />)
      )}
      {items.length > 6 ? (
        <p className="text-xs text-text-muted">
          还有 {items.length - 6} 项 · 滚动列表见学生页
        </p>
      ) : null}
    </div>
  );
}

// 单条待办卡
function TodoCard({ item, dim }: { item: TodoItem; dim?: boolean }) {
  return (
    <Link
      href={item.primaryAction.href}
      className={`group flex items-center gap-3 rounded-lg border border-border-subtle bg-bg/40 px-3 py-2 no-underline transition hover:border-primary hover:bg-surface ${
        dim ? 'opacity-70' : ''
      }`}
    >
      <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent to-accent-light text-xs font-semibold text-white">
        {item.initial}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-1">
          <span className="truncate text-sm font-medium text-text">{item.name}</span>
          <span className="text-[10px] text-text-muted">{item.label}</span>
        </div>
        <span className="block truncate text-[11px] text-text-muted">{item.detail}</span>
      </div>
      <Button size="small" type="text" className="flex-shrink-0">
        {item.primaryAction.label}
      </Button>
    </Link>
  );
}
```

### Step 2: TS compile check

```bash
cd apps/web && pnpm tsc --noEmit 2>&1 | grep "dashboard/page" | head -10
```

Expected: 仍然有 RiskSection 相关错误(Task 1 留下的),但 ThreeTrackTodoSection 本身 0 错误。

如果出现 ThreeTrackTodoSection 内部 TS error,排查是否 TodoItem 类型用得不对、或 antd 组件 import 缺失。

### Step 3: Commit

```bash
git add apps/web/src/app/\(teacher\)/teacher/dashboard/page.tsx
git commit -m "feat(dashboard): add ThreeTrackTodoSection component"
```

---

## Task 3: 替换主组件 layout + 删除旧 Section 组件

**Files:**
- Modify: `apps/web/src/app/(teacher)/teacher/dashboard/page.tsx`

**Goal:** 把主组件的 layout 从「funnel + risk + metrics」改为「ThreeTrackTodoSection + (可选 ServiceProgressSection 缩略)」。删除 `FunnelSection`,`RiskSection`,`MetricsSection`,以及它们关联的 `bottleneck`,`statusCounts`,`avgScore`,`avgCompleteness` 等只为旧组件服务的派生变量。

### Step 1: 找到主组件 return JSX 块

In `apps/web/src/app/(teacher)/teacher/dashboard/page.tsx`, locate the main component return (around line 289-410). It currently looks like:

```jsx
return (
  <div className="space-y-5">
    {/* A 区:顶部 */}
    <header>...</header>
    
    {isLoading ? <Spin /> : (
      <>
        {/* B 区:漏斗 */}
        <FunnelSection counts={...} ... />
        
        <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
          {/* C 区:风险中心 */}
          <RiskSection risks={risks} />
          {/* D 区:指标卡 */}
          <MetricsSection ... />
        </div>
      </>
    )}
  </div>
);
```

### Step 2: 替换 B/C/D 区为新结构

Replace the `<FunnelSection ... />` block and the `<div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]"> ... </div>` block with:

```jsx
        <ThreeTrackTodoSection
          waitMe={categorized.waitMe}
          waitStudentParent={categorized.waitStudentParent}
          waitSupervisor={categorized.waitSupervisor}
          sleeping={categorized.sleeping}
        />
```

That's it for the new layout. Don't add anything else — keep dashboard simple.

### Step 3: 删除不再需要的派生变量

After replacing the JSX, find and DELETE these computations in the main component body (they were only feeding the deleted sections):

- `statusCounts` useMemo (around line 227-241) — only used by FunnelSection
- `totalStudents`, `finalizedCount`, `completionRatio` (around line 243-245) — only used by FunnelSection/MetricsSection
- `avgScore` useMemo (around line 247-250) — only used by MetricsSection
- `avgCompleteness` useMemo (search for it) — only used by MetricsSection
- `bottleneck` useMemo (search for it, around line 275-282) — only used by FunnelSection
- `deadlineRiskCount` (search for it) — only used in header / FunnelSection
- The temporary `risks` array workaround from Task 1 — no longer needed since we now use `categorized` directly

**BUT KEEP** these (still used elsewhere):
- `students`, `pendingPlans` — used by `categorizeStudents`
- `examDate`, `deadlineDate`, `examDaysLeft`, `deadlineDaysLeft` — used in header A 区
- `now`, `clock`, `updatedAt`, `refreshKey` — used by clock state machinery

When in doubt: read the variable's usage. If after this Task it's only used in deleted JSX, delete it. If it's still used in remaining JSX (header A 区), keep it.

### Step 4: 删除头部里的 `deadlineRiskCount` 显示

The header A 区 (around line 336-343) has:

```jsx
{deadlineRiskCount > 0 ? (
  <Link href="/teacher/students?workflowStatus=COLLECTING" ...>
    <WarningOutlined /> {deadlineRiskCount} 人定稿临期
  </Link>
) : null}
```

Delete this. The new three-track section handles all "what to act on" — we don't need a separate red-banner warning in the header. If `deadlineRiskCount` was the only thing keeping `risks` array around, that's why we can fully delete the array now.

### Step 5: 删除 statsuCounts 用到的 `处理 {pendingPlans.length} 份待审` button text 的依赖

The header has a button:

```jsx
<Button type="primary" icon={<CheckCircleOutlined />} className="border-0">
  处理 {pendingPlans.length} 份待审
</Button>
```

Keep this — `pendingPlans` is still available (we still fetch it).

### Step 6: 删除三个旧的 Section 组件定义

After the main component, delete:
- `function FunnelSection({ counts, totalStudents, completionRatio, bottleneck }: ...) { ... }` (lines 411-481 area)
- `function RiskSection({ risks }: { risks: RiskItem[] }) { ... }` (lines 483-542 area)
- `function MetricsSection({ ... }: ...) { ... }` (lines 544-579 area)

Also delete the now-unused `interface RiskItem` from earlier in the file (Task 1 said keep TodoItem and remove RiskItem; do it here if not done).

### Step 7: TS compile check

```bash
cd apps/web && pnpm tsc --noEmit 2>&1 | grep "dashboard/page" | head -10
```

Expected: 0 errors in this file. All RiskItem / risks / FunnelSection / RiskSection / MetricsSection references gone.

If errors remain, they're probably about:
- A leftover `risks` variable reference somewhere
- An unused import (`CheckCircleOutlined`, `WarningOutlined`, `FileTextOutlined` — keep those that are still used in header A 区)

### Step 8: Commit

```bash
git add apps/web/src/app/\(teacher\)/teacher/dashboard/page.tsx
git commit -m "feat(dashboard): replace funnel/risk/metrics with three-track todo view"
```

---

## Task 4: 自我审查 + 收尾

**No file changes — verification only.**

### Step 1: 前端类型检查

```bash
cd apps/web && pnpm tsc --noEmit 2>&1 | grep "dashboard/page" | head -10
```

Expected: 0 errors.

### Step 2: 完整文件审查

Read the dashboard page top-to-bottom. Confirm:

- A 区 (header) 保留:标题 + 倒计时 + 搜索 + 4 个快捷按钮(其中"处理 X 份待审"还在)
- 三轨 section (新增): 等我 / 等学生家长 / 等主管
- 沉默学生 section (在三轨下方, 仅当有沉默学生时显示)
- 没有 funnel / 风险中心 / 指标卡的任何残留
- 没有 RiskItem 类型 / computeRisks 函数 / bottleneck 计算的残留

### Step 3: 残留 grep

```bash
grep -n "FunnelSection\|RiskSection\|MetricsSection\|computeRisks\|RiskItem\|bottleneck\|deadlineRiskCount\|statusCounts\|avgScore\|avgCompleteness\|completionRatio" "apps/web/src/app/(teacher)/teacher/dashboard/page.tsx"
```

Expected: 0 matches.

### Step 4: Commit 历史

```bash
git log --oneline e4f100f..HEAD
```

Expected (3 commits):
1. `refactor(dashboard): introduce categorizeStudents() for three-track classification ...`
2. `feat(dashboard): add ThreeTrackTodoSection component`
3. `feat(dashboard): replace funnel/risk/metrics with three-track todo view`

### Step 5: 行数对照

```bash
wc -l "apps/web/src/app/(teacher)/teacher/dashboard/page.tsx"
```

Expected: ~400-450 行(从原 579 行减少约 130-180 行,删除了 ~180 行 Funnel/Risk/Metrics 组件 + 一些派生变量,加了 ~80 行 ThreeTrackTodoSection)。

### Step 6: 总结

报告:

**Status:** READY_TO_MERGE | NEEDS_FIXES

If READY_TO_MERGE, brief paragraph summarizing the new dashboard structure and known limitations (e.g., "ServiceProgressSection 留到未来 plan,这次不做缩略卡;每轨当前显示前 6 项,溢出靠学生页深入查看")。

---

## Self-Review Checklist

After all tasks complete, verify:

1. **Spec coverage**
   - ✅ 三轨待办流(等我 / 等学生家长 / 等主管)实装(Task 2)
   - ✅ 沉默学生独立轨(Task 1 分类 + Task 2 UI)
   - ✅ 旧 BI 范式三块组件移除(Task 3)
   - ✅ 数据来源不变(仍然 studentApi + planApi),无新 API
   - ⚠️ ServiceProgressSection(缩略卡)未做 — 留给未来 plan,或集成到学生列表页

2. **Placeholder scan**
   - ✅ 每个 step 有具体代码 / 命令
   - ✅ TS 中间态可控(Task 1 commit 会有 TS error,Task 3 解决)

3. **Type consistency**
   - `TodoItem` 接口由 Task 1 定义,Tasks 2-3 使用 — 一致
   - `categorizeStudents` 返回类型 `{ waitMe, waitStudentParent, waitSupervisor, sleeping }`,Task 2 / Task 3 都按此结构消费 — 一致

---

## Notes & Known Limits

- **未做的 ServiceProgressSection**:brainstorming 设计里有「服务进度全貌缩略卡」(每个学生一行,显示 SOP 节点条 + 上次动作 + 主操作),这次没做。可以留给单独的 plan 或者集成到 `/teacher/students` 卡片视图(Plan 6 学生工作台改造)。
- **每轨上限 6 项**:超过 6 项的部分提示"还有 X 项",老师需要到学生页深入。3-30 人场景下基本不会超 6 项。
- **三轨判定规则**目前基于 workflowStatus 派生,精度足够 MVP。未来如果加更精细的判定(比如"待审核 7 天 = 升级到等主管轨"),可以扩展 categorizeStudents。
- **沉默 ≥7 天**作为阈值是个 heuristic,可以做成配置项,但目前 hardcode 在函数里。
- **风险**:删除三个老 section 是 destructive 操作,如果某个老师习惯了看漏斗,会困惑。但教培 3-30 人 funnel 无意义,这个 trade-off 在 brainstorming 阶段已确认。
