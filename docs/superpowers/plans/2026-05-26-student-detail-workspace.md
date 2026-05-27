# 学生详情 SOP 工作台 Implementation Plan (Plan 6a)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把学生详情页从「7 个字段大表单」改造为「服务工作台」雏形:**顶部摘要条** + **左主右副两栏布局** + 主区上半 **SOP 服务时间轴** + 副区 **联系块(学生/家长两字段)** + **关键数据 9 字段三组分块**。Plan 6a 范围内不动 5 Tab、不做变更日志,7 个 Field Cards 保留在主区下半,留给后续 plan 改造。

**Architecture:** 纯前端改造,无后端 API/schema 改动。所有数据来自现有的 `studentApi.getById(id)` 返回值 + Plan API。新增 3 个内部组件:`StudentSummaryBar`, `SopTimeline`, `KeyDataPanel`。原有的 7 个 Field 组件(BasicFields/ExamFields 等) 不动,在新布局里作为主区下半部分继续显示。

**Tech Stack:** Next.js (App Router) + React Query + antd + Tailwind. 无新依赖。

---

## File Structure

**Single file refactor:**
- Modify: `apps/web/src/app/(teacher)/teacher/students/[id]/page.tsx` (current 636 lines → expected ~750-800 lines after refactor)

3 个新内部组件加在文件末尾(同文件,跟现有 BasicFields/ExamFields 等 sibling)。这避免在 6a 阶段就拆出独立组件文件;6b 阶段做 5 Tab 时再考虑拆分。

---

## Task 1: 顶部摘要条 + 两栏布局重组

**Files:**
- Modify: `apps/web/src/app/(teacher)/teacher/students/[id]/page.tsx`

**Goal:** 重构 `StudentDetailPage` 主组件的 layout。删除现有的"基本信息 Card + 进度条 + 保存按钮"分散排版,改为顶部摘要条 + 左主右副两栏 grid。7 个 Field Cards 集中放到左主栏下半部分。右副栏先空着(Task 2-3 会填充)。

### Step 1: 在 StudentDetailPage 中找到主 return JSX

Locate `function StudentDetailPage()` (around line 127). Read its return JSX to understand the current layout. The current structure roughly looks like:

```jsx
return (
  <div>
    <Card> {/* 顶部:返回按钮 + 学生名 */}
      ...
    </Card>
    <Card> {/* 进度条 + 保存按钮 */}
      <ProgressBar />
      <Button>保存</Button>
    </Card>
    <BasicFields />
    <HouseholdFields />
    <RegionCascaderField .../>
    <ExamFields .../>
    <BonusFields />
    <HealthFields />
    <PreferenceFields />
  </div>
);
```

(Actual structure may differ — READ first.)

### Step 2: 用 StudentSummaryBar 替换顶部 Card

Replace the existing top-of-page Card(s) (返回按钮 + 学生名 + 进度条 + 保存按钮 area) with a single summary bar. Insert at the top of the returned `<div>`:

```jsx
        <StudentSummaryBar
          student={student}
          plansSummary={plansSummary}
          onBack={() => router.back()}
          onSave={() => formInstance.submit()}
          saving={updateMutation.isPending}
        />
```

Where:
- `student` is the existing fetched student data
- `plansSummary` is a derived object `{ activePlanCount, latestPlanStatus, latestPlanVersionNo }` — compute from `student.volunteerPlans` if accessible, or just pass `null` for Plan 6a (the summary bar will gracefully show "—")
- `formInstance` is the existing Form instance (`useForm` result)
- `updateMutation` is the existing save mutation

Define the component at the file bottom (Step 4 of this task does this).

### Step 3: 加左主右副两栏 grid 包裹现有 7 个 Field Cards

Wrap the 7 existing `<BasicFields />` etc. in a grid:

```jsx
        <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
          {/* 主区 */}
          <div className="space-y-4">
            {/* SOP 时间轴 — Task 2 会填这里 */}
            <div data-slot="sop-timeline-placeholder" />

            {/* 现有 7 个 Field Cards 保留在主区下半 */}
            <BasicFields />
            <HouseholdFields />
            <RegionCascaderField ... />
            <ExamFields ... />
            <BonusFields />
            <HealthFields />
            <PreferenceFields />
          </div>

          {/* 副区 */}
          <div className="space-y-4">
            {/* 联系块 + 关键数据 — Task 3 会填这里 */}
            <div data-slot="side-panel-placeholder" />
          </div>
        </div>
```

注意:
- `data-slot="..."` 占位 div 仅作可视调试用,Task 2/3 会替换掉它们
- 7 个 Field 组件的 props 不变;只是被包裹在新的 div 里
- Existing 保存按钮的位置需要做决定 — Step 4 的 SummaryBar 已经包含保存按钮,所以可以删除独立的"保存"按钮 Card

### Step 4: 加 StudentSummaryBar 组件定义

At the bottom of the file (after the existing 7 Field component definitions), insert:

```typescript
// ── 顶部摘要条:身份 + 关键摘要 + 操作 ──
function StudentSummaryBar({
  student,
  plansSummary,
  onBack,
  onSave,
  saving,
}: {
  student: any;  // 复用既有 student data 形态
  plansSummary: { activePlanCount: number; latestPlanStatus: string | null; latestPlanVersionNo: number | null } | null;
  onBack: () => void;
  onSave: () => void;
  saving: boolean;
}) {
  const name = student?.user?.realName || student?.realName || student?.username || '学生';
  const examType = student?.examType ? EXAM_TYPE_LABEL[student.examType] ?? student.examType : '--';
  const totalScore = student?.totalScore ?? null;
  const provincialRank = student?.provincialRank ?? null;
  // 服务天数:由 createdAt 算到今天
  const signedAt = student?.createdAt ? new Date(student.createdAt) : null;
  const daysServed = signedAt
    ? Math.floor((Date.now() - signedAt.getTime()) / 86_400_000)
    : null;

  return (
    <header className="rounded-2xl bg-surface px-6 py-4 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Button type="text" icon={<ArrowLeftOutlined />} onClick={onBack} aria-label="返回" />
            <h1 className="m-0 text-xl font-semibold text-text">{name}</h1>
            <span className="text-sm text-text-muted">· {examType}</span>
            {totalScore != null ? (
              <span className="text-sm text-text-muted">· 总分 {totalScore}</span>
            ) : null}
            {provincialRank != null ? (
              <span className="text-sm text-text-muted">· 位次 {provincialRank.toLocaleString('zh-CN')}</span>
            ) : null}
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-text-muted">
            {signedAt ? (
              <span>签约 {signedAt.toLocaleDateString('zh-CN')}</span>
            ) : null}
            {daysServed != null ? (
              <span>· 服务 {daysServed} 天</span>
            ) : null}
            {plansSummary?.latestPlanStatus ? (
              <span>· 当前方案 v{plansSummary.latestPlanVersionNo ?? '?'} · {plansSummary.latestPlanStatus}</span>
            ) : null}
          </p>
        </div>
        <div className="flex gap-2">
          <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={onSave}>
            保存
          </Button>
        </div>
      </div>
    </header>
  );
}

// 考试类型中文标签
const EXAM_TYPE_LABEL: Record<string, string> = {
  PHYSICS: '物理',
  HISTORY: '历史',
  COMPREHENSIVE_LIBERAL: '文科',
  COMPREHENSIVE_SCIENCE: '理科',
};
```

如果 `ArrowLeftOutlined` 和 `SaveOutlined` 没在 import,verify 一下并加。原文件应该已有这两个 import(line 7-13)。

### Step 5: 派生 plansSummary

In `StudentDetailPage` main body, before the return JSX, add:

```typescript
  const plansSummary = useMemo(() => {
    const plans = student?.volunteerPlans;
    if (!Array.isArray(plans) || plans.length === 0) {
      return null;
    }
    // 最新版本(versionNo 最大)
    const latest = plans.reduce((acc, p) => (!acc || p.versionNo > acc.versionNo ? p : acc), null);
    return {
      activePlanCount: plans.length,
      latestPlanStatus: latest?.status ?? null,
      latestPlanVersionNo: latest?.versionNo ?? null,
    };
  }, [student?.volunteerPlans]);
```

如果 student API 实际不返回 `volunteerPlans`,把 plansSummary 设为 `null` 即可(SummaryBar 会优雅降级)。

### Step 6: TS compile check

```bash
cd apps/web && pnpm tsc --noEmit 2>&1 | grep "students/\[id\]/page" | head -20
```

Expected: zero errors in this file.

### Step 7: Commit

```bash
git add apps/web/src/app/\(teacher\)/teacher/students/\[id\]/page.tsx
git commit -m "feat(student-detail): add summary bar + two-column layout"
```

---

## Task 2: SOP 服务时间轴组件

**Files:**
- Modify: `apps/web/src/app/(teacher)/teacher/students/[id]/page.tsx`

**Goal:** 加 `SopTimeline` 组件,基于 student 数据 + plans 数据派生 SOP 各节点状态,垂直时间线呈现。

### Step 1: 派生 SOP 节点状态的逻辑

In `apps/web/src/app/(teacher)/teacher/students/[id]/page.tsx`, near the top of the file (after the existing utility functions like `formatRank`, before `StudentDetailPage` component), add:

```typescript
// ── SOP 服务节点 ──
type SopNodeStatus = 'done' | 'active' | 'pending' | 'skipped';

interface SopNode {
  key: string;
  label: string;
  status: SopNodeStatus;
  // 关联事件时间(完成时间或最近活动)
  timestamp?: Date | null;
  // 简短说明(如 "v2 修改中")
  detail?: string;
}

function deriveSopNodes(student: any): SopNode[] {
  const intakeStatus = student?.intakeStatus;
  const plans: any[] = student?.volunteerPlans ?? [];
  const latestPlan = plans.reduce((acc: any, p: any) =>
    (!acc || (p.versionNo ?? 0) > (acc.versionNo ?? 0) ? p : acc), null);
  const planStatus = latestPlan?.status;
  const planVersionNo = latestPlan?.versionNo;

  const signedAt = student?.createdAt ? new Date(student.createdAt) : null;
  const intakeSubmittedAt = student?.intakeSubmittedAt ? new Date(student.intakeSubmittedAt) : null;
  const planCreatedAt = latestPlan?.createdAt ? new Date(latestPlan.createdAt) : null;
  const planFinalizedAt = latestPlan?.finalizedAt ? new Date(latestPlan.finalizedAt) : null;

  // 节点 1:签约 — 有 createdAt 就 done
  const sign: SopNode = signedAt
    ? { key: 'sign', label: '签约', status: 'done', timestamp: signedAt }
    : { key: 'sign', label: '签约', status: 'pending' };

  // 节点 2:资料采集 — intakeStatus VERIFIED = done; SUBMITTED = active; 其它 pending
  let intake: SopNode;
  if (intakeStatus === 'VERIFIED') {
    intake = { key: 'intake', label: '资料采集', status: 'done', timestamp: intakeSubmittedAt };
  } else if (intakeStatus === 'SUBMITTED' || intakeStatus === 'NEEDS_CHANGES') {
    intake = { key: 'intake', label: '资料采集', status: 'active', timestamp: intakeSubmittedAt, detail: intakeStatus === 'NEEDS_CHANGES' ? '需修改' : '待审' };
  } else {
    intake = { key: 'intake', label: '资料采集', status: 'pending' };
  }

  // 节点 3:方案制作中 — 有 DRAFT plan = active; 已进入 PENDING_REVIEW 及以后 = done
  let drafting: SopNode;
  if (!latestPlan) {
    drafting = { key: 'drafting', label: '方案制作', status: 'pending' };
  } else if (planStatus === 'DRAFT') {
    drafting = { key: 'drafting', label: '方案制作', status: 'active', timestamp: planCreatedAt, detail: `v${planVersionNo} 草稿` };
  } else {
    drafting = { key: 'drafting', label: '方案制作', status: 'done', timestamp: planCreatedAt, detail: `v${planVersionNo}` };
  }

  // 节点 4:主管审核 — PENDING_REVIEW/REVIEWING = active; APPROVED 及以后 = done
  let supReview: SopNode;
  if (!latestPlan || planStatus === 'DRAFT') {
    supReview = { key: 'supervisor-review', label: '主管审核', status: 'pending' };
  } else if (planStatus === 'PENDING_REVIEW' || planStatus === 'REVIEWING') {
    supReview = { key: 'supervisor-review', label: '主管审核', status: 'active', detail: planStatus === 'REVIEWING' ? '审核中' : '待审核' };
  } else if (planStatus === 'REJECTED') {
    supReview = { key: 'supervisor-review', label: '主管审核', status: 'active', detail: '已退回 待修改' };
  } else {
    supReview = { key: 'supervisor-review', label: '主管审核', status: 'done' };
  }

  // 节点 5:家长确认 — APPROVED = active; PARENT_CONFIRMED 及以后 = done
  let parentConfirm: SopNode;
  if (!latestPlan || ['DRAFT', 'PENDING_REVIEW', 'REVIEWING', 'REJECTED'].includes(planStatus)) {
    parentConfirm = { key: 'parent-confirm', label: '家长确认', status: 'pending' };
  } else if (planStatus === 'APPROVED') {
    parentConfirm = { key: 'parent-confirm', label: '家长确认', status: 'active', detail: '等家长确认' };
  } else {
    parentConfirm = { key: 'parent-confirm', label: '家长确认', status: 'done' };
  }

  // 节点 6:终稿 — FINALIZED 及以后 = done; PARENT_CONFIRMED = active
  let finalize: SopNode;
  if (!latestPlan || ['DRAFT', 'PENDING_REVIEW', 'REVIEWING', 'REJECTED', 'APPROVED'].includes(planStatus)) {
    finalize = { key: 'finalize', label: '终稿', status: 'pending' };
  } else if (planStatus === 'PARENT_CONFIRMED') {
    finalize = { key: 'finalize', label: '终稿', status: 'active', detail: '待定稿' };
  } else if (planStatus === 'FINALIZED' || planStatus === 'PUBLISHED') {
    finalize = { key: 'finalize', label: '终稿', status: 'done', timestamp: planFinalizedAt };
  } else {
    finalize = { key: 'finalize', label: '终稿', status: 'pending' };
  }

  // 节点 7:已提交 — PUBLISHED = done
  let submit: SopNode;
  if (planStatus === 'PUBLISHED') {
    submit = { key: 'submit', label: '已提交', status: 'done' };
  } else if (planStatus === 'FINALIZED') {
    submit = { key: 'submit', label: '已提交', status: 'active', detail: '待提交考试院' };
  } else {
    submit = { key: 'submit', label: '已提交', status: 'pending' };
  }

  return [sign, intake, drafting, supReview, parentConfirm, finalize, submit];
}
```

注释:
- 7 节点(不是 9 节点),因为「家长见面」和「修改稿」是反复型事件,没有简单的数据派生。等 Plan 9(沟通预约)和 Plan 6d(变更日志)之后再扩展为完整 9 节点。
- 节点 4(主管审核) 把 REJECTED 也归入"active 待修改",避免老师以为流程卡死

### Step 2: 加 SopTimeline 组件

After `deriveSopNodes` function, add the UI component:

```typescript
function SopTimeline({ nodes }: { nodes: SopNode[] }) {
  return (
    <Card title="服务进度" size="small">
      <ol className="m-0 list-none space-y-3 p-0">
        {nodes.map((node, i) => {
          const isLast = i === nodes.length - 1;
          return (
            <li key={node.key} className="relative pl-6">
              {/* 节点圆点 */}
              <span
                aria-hidden
                className={`absolute left-0 top-1 inline-flex h-4 w-4 items-center justify-center rounded-full ${
                  node.status === 'done'
                    ? 'bg-safe text-white'
                    : node.status === 'active'
                      ? 'bg-accent text-white'
                      : node.status === 'skipped'
                        ? 'bg-text-muted text-white'
                        : 'border-2 border-text-muted bg-surface'
                }`}
              >
                {node.status === 'done' ? '✓' : node.status === 'active' ? '●' : ''}
              </span>
              {/* 节点之间的连接线 */}
              {!isLast ? (
                <span
                  aria-hidden
                  className="absolute left-[7px] top-5 h-full w-0.5 bg-border-subtle"
                />
              ) : null}
              {/* 节点文字 */}
              <div>
                <p className={`m-0 text-sm ${node.status === 'active' ? 'font-medium text-text' : 'text-text'}`}>
                  {node.label}
                  {node.detail ? (
                    <span className="ml-2 text-xs text-text-muted">{node.detail}</span>
                  ) : null}
                </p>
                {node.timestamp ? (
                  <p className="m-0 text-xs text-text-muted">
                    {node.timestamp.toLocaleDateString('zh-CN')}
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
```

### Step 3: 在主组件中插入 SopTimeline

In `StudentDetailPage`'s return JSX, find the placeholder `<div data-slot="sop-timeline-placeholder" />` (added in Task 1) and replace it with:

```jsx
            <SopTimeline nodes={sopNodes} />
```

And in the component body (before return), add:

```typescript
  const sopNodes = useMemo(() => deriveSopNodes(student), [student]);
```

### Step 4: TS compile check

```bash
cd apps/web && pnpm tsc --noEmit 2>&1 | grep "students/\[id\]/page" | head -10
```

Expected: zero errors.

### Step 5: Commit

```bash
git add apps/web/src/app/\(teacher\)/teacher/students/\[id\]/page.tsx
git commit -m "feat(student-detail): add SOP timeline derived from workflow + plan status"
```

---

## Task 3: 副区组件 — 联系块 + 关键数据

**Files:**
- Modify: `apps/web/src/app/(teacher)/teacher/students/[id]/page.tsx`

**Goal:** 加 `ContactPanel`(联系,学生/家长两字段) 和 `KeyDataPanel`(关键数据,9 字段三组),填入副区。

### Step 1: 加 ContactPanel 组件

After SopTimeline component, add:

```typescript
function ContactPanel({ student }: { student: any }) {
  const studentPhone = student?.user?.phone ?? null;
  const parentPhone = student?.parentPhone ?? null;

  const callPhone = (phone: string) => {
    window.location.href = `tel:${phone}`;
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      message.success(`${label}已复制`);
    } catch {
      message.error('复制失败');
    }
  };

  return (
    <Card title="联系方式" size="small">
      <div className="space-y-3">
        <div>
          <p className="m-0 text-xs font-medium text-text-muted">学生</p>
          {studentPhone ? (
            <div className="mt-1 flex items-center justify-between gap-2">
              <span className="font-mono text-sm">{studentPhone}</span>
              <div className="flex gap-1">
                <Button size="small" onClick={() => callPhone(studentPhone)}>拨号</Button>
                <Button size="small" onClick={() => copyToClipboard(studentPhone, '学生电话')}>复制</Button>
              </div>
            </div>
          ) : (
            <p className="m-0 text-sm text-text-muted">--</p>
          )}
        </div>
        <div>
          <p className="m-0 text-xs font-medium text-text-muted">家长</p>
          {parentPhone ? (
            <div className="mt-1 flex items-center justify-between gap-2">
              <span className="font-mono text-sm">{parentPhone}</span>
              <div className="flex gap-1">
                <Button size="small" onClick={() => callPhone(parentPhone)}>拨号</Button>
                <Button size="small" onClick={() => copyToClipboard(parentPhone, '家长电话')}>复制</Button>
              </div>
            </div>
          ) : (
            <p className="m-0 text-sm text-text-muted">--</p>
          )}
        </div>
      </div>
    </Card>
  );
}
```

注意:`message` 已从 antd import,verify in line 5 of the existing imports.

### Step 2: 加 KeyDataPanel 组件

After ContactPanel, add:

```typescript
function KeyDataPanel({ student }: { student: any }) {
  // 第一组:分数·位次
  const examType = student?.examType ? EXAM_TYPE_LABEL[student.examType] ?? student.examType : '--';
  const firstChoice = student?.firstChoice ?? '--';
  const reChoices = Array.isArray(student?.reChoices) ? student.reChoices.join('/') : '--';
  const subjectStr = student?.examType ? `${examType}·${firstChoice}·${reChoices}` : '--';
  const totalScore = student?.totalScore ?? null;
  const provincialRank = student?.provincialRank ?? null;

  // 第二组:资格条件
  const bonusList = Array.isArray(student?.bonusItems) ? student.bonusItems : [];
  const bonusValue = bonusList.reduce((sum: number, b: any) => sum + (b?.value ?? 0), 0);
  const bonusLabel = bonusList.length === 0 ? '无' : `+${bonusValue} (${bonusList.length} 项)`;
  const ethnicity = student?.user?.ethnicity ?? '--';
  const sourceLoc = [student?.province, student?.city, student?.county].filter(Boolean).join('·') || '--';

  // 第三组:意向
  const prefCities = Array.isArray(student?.preferredCities) ? student.preferredCities : [];
  const prefMajors = Array.isArray(student?.preferredMajors) ? student.preferredMajors : [];
  const prefCitiesStr = prefCities.length === 0 ? '未填' : prefCities.slice(0, 3).join('/') + (prefCities.length > 3 ? '...' : '');
  const prefMajorsStr = prefMajors.length === 0 ? '未填' : prefMajors.slice(0, 3).join('/') + (prefMajors.length > 3 ? '...' : '');

  return (
    <Card title="关键数据" size="small">
      <div className="space-y-4 text-sm">
        <div>
          <p className="m-0 mb-1 text-xs font-medium text-text-muted">分数·位次</p>
          <p className="m-0 leading-relaxed">
            <span>选科 {subjectStr}</span><br />
            <span>最近模考 {totalScore ?? '--'}</span><br />
            <span>预测位次 {provincialRank != null ? provincialRank.toLocaleString('zh-CN') : '--'}</span>
          </p>
        </div>
        <div className="border-t border-border-subtle pt-3">
          <p className="m-0 mb-1 text-xs font-medium text-text-muted">资格条件</p>
          <p className="m-0 leading-relaxed">
            <span>加分 {bonusLabel}</span><br />
            <span>民族 {ethnicity}</span><br />
            <span>生源地 {sourceLoc}</span>
          </p>
        </div>
        <div className="border-t border-border-subtle pt-3">
          <p className="m-0 mb-1 text-xs font-medium text-text-muted">意向</p>
          <p className="m-0 leading-relaxed">
            <span>意向城市 {prefCitiesStr}</span><br />
            <span>目标专业 {prefMajorsStr}</span>
          </p>
        </div>
      </div>
    </Card>
  );
}
```

### Step 3: 在主组件中插入 ContactPanel 和 KeyDataPanel

In `StudentDetailPage`'s return JSX, find the placeholder `<div data-slot="side-panel-placeholder" />` and replace with:

```jsx
            <ContactPanel student={student} />
            <KeyDataPanel student={student} />
```

### Step 4: TS compile check

```bash
cd apps/web && pnpm tsc --noEmit 2>&1 | grep "students/\[id\]/page" | head -10
```

Expected: zero errors.

### Step 5: Commit

```bash
git add apps/web/src/app/\(teacher\)/teacher/students/\[id\]/page.tsx
git commit -m "feat(student-detail): add contact panel + key data panel in side column"
```

---

## Task 4: 自我审查 + 收尾

**No file changes — verification only.**

### Step 1: 前端类型检查

```bash
cd apps/web && pnpm tsc --noEmit 2>&1 | grep "students/\[id\]/page" | head -10
```

Expected: 0 errors.

### Step 2: 占位 div 残留检查

```bash
grep -n 'data-slot=' "apps/web/src/app/(teacher)/teacher/students/[id]/page.tsx"
```

Expected: 0 matches. Task 2/3 应该把所有占位 div 替换成实际组件了。

### Step 3: 文件结构检查

Read `apps/web/src/app/(teacher)/teacher/students/[id]/page.tsx` top-to-bottom.

Confirm structure:
- L1-100: imports + interface + utility functions (formatRank, RankCheckExtra, etc.)
- `deriveSopNodes` 函数(Task 2 加入)
- `EXAM_TYPE_LABEL` 常量(Task 1 加入)
- `StudentDetailPage` 主组件 — return JSX 用新的两栏 layout
- 7 个 Field 组件(BasicFields, HouseholdFields, RegionCascaderField, ExamFields, BonusFields, HealthFields, PreferenceFields) — 保留
- 末尾:`StudentSummaryBar`, `SopTimeline`, `ContactPanel`, `KeyDataPanel` — 4 个新组件

### Step 4: 行数对照

```bash
wc -l "apps/web/src/app/(teacher)/teacher/students/[id]/page.tsx"
```

Expected: ~750-830 行(增加 ~150 行,因为加了 4 个新组件 + 派生逻辑)。

### Step 5: Commit 历史

```bash
git log --oneline bfa5a7f..HEAD
```

Expected (3 commits):
1. `feat(student-detail): add summary bar + two-column layout`
2. `feat(student-detail): add SOP timeline derived from workflow + plan status`
3. `feat(student-detail): add contact panel + key data panel in side column`

### Step 6: 总结

报告:

**Status:** READY_TO_MERGE | NEEDS_FIXES

If READY_TO_MERGE, brief paragraph summarizing the new student detail layout + known limitations(沒做 5 Tab、沒做變更日誌、沒做家長見面節點)。

---

## Self-Review Checklist

After all tasks complete, verify:

1. **Spec coverage**
   - ✅ 顶部摘要条(Task 1)
   - ✅ 左主右副两栏布局(Task 1)
   - ✅ SOP 时间轴(Task 2)
   - ✅ 联系块分两字段(Task 3)
   - ✅ 关键数据 9 字段三组(Task 3)
   - ⚠️ 5 Tab 留给 Plan 6b
   - ⚠️ 变更日志 留给 Plan 6d
   - ⚠️ 家长见面/反复修改节点 留给 Plan 9/Plan 6d

2. **Placeholder scan**
   - ✅ 每个 step 有具体代码 / 命令

3. **Type consistency**
   - `SopNode` 接口由 Task 2 定义,Task 2 内部使用 — 一致
   - `student: any` 参数在新组件里统一,匹配现有 API 返回结构

---

## Notes & Known Limits

- **7 节点 SOP**(签约/采集/方案制作/主管审核/家长确认/终稿/已提交)而非完整 9 节点。家长见面 + 反复修改是反复型事件,需要 Plan 9 沟通预约 + Plan 6d 变更日志才能完整支撑。
- **`student.volunteerPlans` 假设可用**:如果 student API 不返回 plans, plansSummary 和 sopNodes 都会优雅降级显示"--" / "pending"。
- **保存按钮位置**:从 Card 移动到 SummaryBar。如果发现保存按钮提交逻辑跟原有 Form 不兼容(比如缺少 valid 校验),回到 Task 1 检查 `formInstance.submit()` 调用。
- **副区在小屏(< lg)下堆叠到主区下方**(grid-cols-1)。3-30 学生场景下老师基本用大屏,可接受。
- **暂时不动 7 Field Cards**:它们保留原样在主区下半显示。Plan 6b 会把它们包进 Tab。
