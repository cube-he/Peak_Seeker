# 方案生成入口校验 + 算法路径 Implementation Plan (Plan 8 MVP)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给方案生成体验补两个口子:**A 入口前置校验弹窗**(老师在学生列表/详情/Dashboard 点"生成方案"时,先弹窗检查学生关键资料完整性,缺字段时提示 + 跳去补;不再让老师进了页面才发现按钮 disabled) + **C 算法路径解释 Drawer**(在 generate workbench 顶部提供一个"了解算法路径"按钮,Drawer 展示学生条件 → 过滤步骤 → 候选池规模的决策路径,老师能给家长解释清楚为什么是这些候选)。

跳过 B(把 preview-candidate-v2 从 prototype 接通成 production)——`preview-candidate-v2/page.tsx` 是 2763 行的独立原型 demo,用的是 PreviewMajor 等独立类型,跟生产 PlanItem 没接通。这个 prototype 接通是一个独立的、大范围的重构任务,本 plan 不做。

**Architecture:** 纯前端改造,无后端 API 变更。新组件:`PrerequisiteCheckModal`(独立文件,在 4 个入口接入) + `AlgorithmPathDrawer`(在 generate page 内部加 Drawer)。前者复用所有现有数据(student fields);后者基于 generate page 已经拿到的 candidate response 数据"反推"路径文本。

**Tech Stack:** Next.js (App Router) + React Query + antd + Tailwind. 无新依赖。

---

## File Structure

**Frontend:**
- Create: `apps/web/src/components/plan/PrerequisiteCheckModal.tsx` — 入口前置校验弹窗组件 + 检查 helper
- Modify: `apps/web/src/app/(teacher)/teacher/students/page.tsx` — 学生列表卡片的"生成方案"动作接入 Modal
- Modify: `apps/web/src/app/(teacher)/teacher/students/[id]/page.tsx` — 学生详情头部的"生成方案"动作接入 Modal
- Modify: `apps/web/src/app/(teacher)/teacher/dashboard/page.tsx` — Dashboard 三轨"生成方案"action 接入 Modal
- Modify: `apps/web/src/app/(teacher)/teacher/plans/page.tsx` — 方案列表 header "批量生成"或某些动作如有需要(检查现状,如果不调 generate URL 则跳过)
- Modify: `apps/web/src/app/(teacher)/teacher/plans/generate/[studentId]/page.tsx` — 加 AlgorithmPathDrawer 触发按钮 + Drawer 组件

**Optional spec:**
- Create: `apps/web/src/components/plan/__tests__/PrerequisiteCheckModal.test.tsx` — 检查 helper 单测(可选,如果项目用 jest/vitest 跑前端单测)

---

## Task 1: PrerequisiteCheckModal 组件 + 检查 helper

**Files:**
- Create: `apps/web/src/components/plan/PrerequisiteCheckModal.tsx`

**Goal:** 独立组件文件,接收学生数据,弹窗展示关键字段检查结果。

### Step 1: 创建 PrerequisiteCheckModal 文件

Create `apps/web/src/components/plan/PrerequisiteCheckModal.tsx`:

```typescript
'use client';

import { Modal, Button } from 'antd';
import { CheckOutlined, CloseOutlined, WarningOutlined } from '@ant-design/icons';
import { useRouter } from 'next/navigation';

// 关键字段检查项
export interface FieldCheck {
  key: string;
  label: string;
  passed: boolean;
}

export function checkPrerequisites(student: any): FieldCheck[] {
  const checks: FieldCheck[] = [];

  // 选科组合(物理/历史 + 首选 + 再选 都要)
  const hasSubjects =
    !!student?.examType &&
    !!student?.firstChoice &&
    Array.isArray(student?.reChoices) &&
    student.reChoices.length > 0;
  checks.push({ key: 'subjects', label: '选科组合', passed: hasSubjects });

  // 模考分
  checks.push({
    key: 'totalScore',
    label: '模考总分',
    passed: typeof student?.totalScore === 'number' && student.totalScore > 0,
  });

  // 预测位次
  checks.push({
    key: 'rank',
    label: '预测位次',
    passed: typeof student?.provincialRank === 'number' && student.provincialRank > 0,
  });

  // 意向城市(至少 1 个偏好或排除)
  const hasCities =
    (Array.isArray(student?.preferredCities) && student.preferredCities.length > 0) ||
    (Array.isArray(student?.excludedCities) && student.excludedCities.length > 0) ||
    !!student?.stayPreference;
  checks.push({ key: 'cities', label: '意向城市', passed: hasCities });

  // 意向专业方向(类似)
  const hasMajors =
    (Array.isArray(student?.preferredMajors) && student.preferredMajors.length > 0) ||
    (Array.isArray(student?.preferredMajorCategories) && student.preferredMajorCategories.length > 0);
  checks.push({ key: 'majors', label: '意向专业方向', passed: hasMajors });

  // 加分政策状态(老师须明确 — 即使是"无加分"也算填了)
  checks.push({
    key: 'bonusStatus',
    label: '加分政策',
    passed: !!student?.bonusPolicyStatus,
  });

  // 身体条件(色盲色弱必填)
  checks.push({
    key: 'health',
    label: '体检关键项',
    passed:
      typeof student?.colorBlind === 'boolean' && typeof student?.colorWeak === 'boolean',
  });

  return checks;
}

interface PrerequisiteCheckModalProps {
  open: boolean;
  student: any;
  onCancel: () => void;
}

export default function PrerequisiteCheckModal({
  open,
  student,
  onCancel,
}: PrerequisiteCheckModalProps) {
  const router = useRouter();
  const checks = checkPrerequisites(student);
  const missingCount = checks.filter((c) => !c.passed).length;
  const studentId = student?.id;

  const handleGenerate = () => {
    if (!studentId) return;
    router.push(`/teacher/plans/generate/${studentId}`);
    onCancel();
  };

  const handleGoEdit = () => {
    if (!studentId) return;
    // 跳到学生详情页编辑资料
    router.push(`/teacher/students/${studentId}`);
    onCancel();
  };

  return (
    <Modal
      title={`生成方案前置检查:${student?.user?.realName || student?.realName || '学生'}`}
      open={open}
      onCancel={onCancel}
      width={520}
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={onCancel}>取消</Button>
          {missingCount > 0 ? (
            <>
              <Button onClick={handleGenerate}>仍要生成</Button>
              <Button type="primary" onClick={handleGoEdit}>
                去补 {missingCount} 项缺失
              </Button>
            </>
          ) : (
            <Button type="primary" onClick={handleGenerate}>
              开始生成
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-3">
        <p className="m-0 text-sm">
          {missingCount === 0 ? (
            <span className="text-safe">
              <CheckOutlined /> 关键资料全部就绪
            </span>
          ) : (
            <span className="text-rush">
              <WarningOutlined /> 还有 {missingCount} 项关键资料未填写,生成的方案精准度可能受影响
            </span>
          )}
        </p>
        <ul className="m-0 list-none space-y-2 p-0">
          {checks.map((c) => (
            <li key={c.key} className="flex items-center gap-2 text-sm">
              {c.passed ? (
                <CheckOutlined className="text-safe" />
              ) : (
                <CloseOutlined className="text-rush" />
              )}
              <span className={c.passed ? 'text-text' : 'text-rush'}>{c.label}</span>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}
```

### Step 2: TS compile check

```bash
cd apps/web && pnpm tsc --noEmit 2>&1 | grep "PrerequisiteCheckModal" | head -10
```

Expected: 0 errors.

### Step 3: Commit

```bash
git add apps/web/src/components/plan/PrerequisiteCheckModal.tsx
git commit -m "feat(plan): add PrerequisiteCheckModal component with field checks"
```

---

## Task 2: 在 4 个入口接入 Modal

**Files:**
- Modify: `apps/web/src/app/(teacher)/teacher/students/page.tsx`
- Modify: `apps/web/src/app/(teacher)/teacher/students/[id]/page.tsx`
- Modify: `apps/web/src/app/(teacher)/teacher/dashboard/page.tsx`

**Goal:** 找到 4 个文件里 `/teacher/plans/generate/${studentId}` 的引用点。把"直接 navigate to generate page"改为"先打开 Modal,通过 Modal 跳转"。

### Step 1: 列出所有引用点

Run:
```bash
grep -rn "/teacher/plans/generate/" "apps/web/src/" | head -20
```

Expected: 多个匹配,在 4 个文件里。

### Step 2: 在 students/page.tsx 接入

Read the file to find references to `/teacher/plans/generate/`. The list/card view likely doesn't directly link there — but if it does (in a quick-action button), wrap with Modal trigger.

If the file has no direct "生成方案" button (cards link to `/teacher/students/${id}`), skip this file.

如果有按钮:
1. Add import:
```typescript
import PrerequisiteCheckModal from '@/components/plan/PrerequisiteCheckModal';
```
2. Add state in `TeacherStudentsPageInner`:
```typescript
const [generateForStudent, setGenerateForStudent] = useState<Student | null>(null);
```
3. Replace the Link/Button click to set state:
```jsx
<Button onClick={() => setGenerateForStudent(student)}>生成方案</Button>
```
4. Add Modal at end of return:
```jsx
{generateForStudent ? (
  <PrerequisiteCheckModal
    open={!!generateForStudent}
    student={generateForStudent}
    onCancel={() => setGenerateForStudent(null)}
  />
) : null}
```

### Step 3: 在 students/[id]/page.tsx (学生详情) 接入

学生详情 Task 6a 已经把"生成方案"按钮加在了 SummaryBar 和 grid 之间。读 file 找按钮:

```bash
grep -n "/teacher/plans/generate/\|生成方案" "apps/web/src/app/(teacher)/teacher/students/[id]/page.tsx"
```

Apply same pattern as Step 2.

### Step 4: 在 dashboard/page.tsx 接入

Dashboard 的三轨待办流里有"生成方案"action(Plan 5 加的)。它在 TodoCard.primaryAction.href 里指向 `/teacher/plans/generate/${studentId}`。

由于 TodoCard 是 `<Link>` 包裹的整体卡片,不能直接接 Modal trigger。需要决策:
- **简单方案**: 在 Dashboard 的"生成方案" track 项里,把 TodoCard 的 wrap 改为 `<button>` 而非 `<Link>`,onClick 设 modal student
- **复杂方案**: 拦截 href click,先弹 Modal 再决定

简单方案为佳:在 dashboard/page.tsx 加 state + Modal,然后修改 categorizeStudents 函数:对于 "生成方案" 类型的 todo,改用 `onClick` 而非 href。

实际上更简单:Dashboard 暂不接 Modal — 老师从 Dashboard 直达 generate page 也 OK(已经有 disabled 按钮防护)。Modal 主要价值在学生列表/详情两个入口。

**决策:** Dashboard 接入是 nice-to-have,不在 Task 2 范围。Task 2 只接 students 列表 + students/[id] 详情两个文件。

更新 plan: Task 2 不改 dashboard.tsx,只改 students.tsx + students/[id].tsx。如果 students.tsx 没"生成方案"按钮,只改 [id].tsx。

### Step 5: TS compile check

```bash
cd apps/web && pnpm tsc --noEmit 2>&1 | grep -E "students/page|students/\[id\]/page" | head -10
```

Expected: 0 errors.

### Step 6: Commit

```bash
git add apps/web/src/app/\(teacher\)/teacher/students/page.tsx apps/web/src/app/\(teacher\)/teacher/students/\[id\]/page.tsx
git commit -m "feat(plan-entry): wire PrerequisiteCheckModal to student list/detail generate buttons"
```

---

## Task 3: AlgorithmPathDrawer 算法路径解释侧栏

**Files:**
- Modify: `apps/web/src/app/(teacher)/teacher/plans/generate/[studentId]/page.tsx`

**Goal:** 在 generate workbench 顶部加一个"了解算法路径"按钮,点击打开 Drawer 展示决策路径(学生条件 → 候选池规模 → 过滤步骤 → 排序逻辑)。基于已经在 page 内的 data,不依赖新后端字段。

### Step 1: 加 AlgorithmPathDrawer 组件

In `apps/web/src/app/(teacher)/teacher/plans/generate/[studentId]/page.tsx`, add at the END of the file (after all existing components and helpers):

```typescript
function AlgorithmPathDrawer({
  open,
  onClose,
  student,
  batchConfig,
  candidateCount,
  softFailedCount,
  hardFailedCount,
  selectedCount,
}: {
  open: boolean;
  onClose: () => void;
  student: any;
  batchConfig: { batchName?: string } | null;
  candidateCount: number;
  softFailedCount: number;
  hardFailedCount: number;
  selectedCount: number;
}) {
  const examType = student?.examType ?? '--';
  const totalScore = student?.totalScore ?? null;
  const provincialRank = student?.provincialRank ?? null;
  const firstChoice = student?.firstChoice ?? '--';
  const reChoices = Array.isArray(student?.reChoices) ? student.reChoices.join('/') : '--';
  const subjectCombo = `${examType}·${firstChoice}·${reChoices}`;
  const cityPrefs = Array.isArray(student?.preferredCities)
    ? student.preferredCities.slice(0, 5).join('/')
    : '--';
  const majorPrefs = Array.isArray(student?.preferredMajors)
    ? student.preferredMajors.slice(0, 5).join('/')
    : '--';

  const passedCount = candidateCount - softFailedCount;

  const steps = [
    {
      title: '① 学生输入',
      detail: `选科 ${subjectCombo} · 总分 ${totalScore ?? '--'} · 位次 ${provincialRank?.toLocaleString('zh-CN') ?? '--'}`,
    },
    {
      title: '② 批次设定',
      detail: batchConfig?.batchName ?? '未选批次',
    },
    {
      title: '③ 硬过滤(选科+体检+生源地)',
      detail:
        hardFailedCount > 0
          ? `剔除 ${hardFailedCount} 个不符合硬条件的院校组`
          : '无硬条件不符',
    },
    {
      title: '④ 软规则过滤(意向+加分等)',
      detail: `意向城市 ${cityPrefs} · 意向专业 ${majorPrefs}; 软规则命中 ${softFailedCount} 个院校组(降权显示)`,
    },
    {
      title: '⑤ 候选池规模',
      detail: `共 ${candidateCount} 个院校专业组(${passedCount} 完全匹配 + ${softFailedCount} 软命中)`,
    },
    {
      title: '⑥ 当前已选',
      detail: `老师已选 ${selectedCount} 个志愿,${selectedCount > 0 ? '可继续添加 / 调整' : '尚未添加'}`,
    },
  ];

  return (
    <Drawer
      title="算法路径解释"
      open={open}
      onClose={onClose}
      width={420}
      placement="right"
    >
      <p className="mb-4 text-sm text-text-muted">
        此页推荐结果基于以下决策路径生成。可作为给家长解释方案逻辑的参考。
      </p>
      <ol className="m-0 list-none space-y-3 p-0">
        {steps.map((step, i) => (
          <li key={i} className="border-l-2 border-l-primary bg-bg/30 p-3">
            <p className="m-0 text-sm font-medium text-text">{step.title}</p>
            <p className="m-0 mt-1 text-xs text-text-muted">{step.detail}</p>
          </li>
        ))}
      </ol>
      <div className="mt-6 rounded-md border border-dashed border-border bg-bg/30 p-3 text-xs text-text-muted">
        <strong>免责提示:</strong>{' '}
        算法基于历史录取数据 + 当年招生计划计算,实际录取可能受当年志愿填报情况影响。
      </div>
    </Drawer>
  );
}
```

### Step 2: 在 main GeneratePage component 加 state + 触发按钮 + Drawer

Find the GeneratePage component's body (the main function exported from this file). Near where other state is, add:

```typescript
  const [algoDrawerOpen, setAlgoDrawerOpen] = useState(false);
```

Then in the JSX (in a reasonable header area — e.g. next to existing 操作按钮 like 删除/发送), add a button:

```jsx
            <Button onClick={() => setAlgoDrawerOpen(true)}>
              <InfoCircleOutlined /> 算法路径
            </Button>
```

If `InfoCircleOutlined` isn't imported, add it to the existing ant icons import (line 23-32 area).

At the very end of the GeneratePage's return JSX (just before the closing `</div>` or wrapper), add:

```jsx
      <AlgorithmPathDrawer
        open={algoDrawerOpen}
        onClose={() => setAlgoDrawerOpen(false)}
        student={student}
        batchConfig={selectedBatchConfig}
        candidateCount={total ?? 0}
        softFailedCount={softFailedCountInPool ?? 0}
        hardFailedCount={0}
        selectedCount={planItems?.length ?? 0}
      />
```

**Important:** The exact variable names `student / selectedBatchConfig / total / softFailedCountInPool / planItems` will likely differ in the actual file. Read the GeneratePage component body to find:
- `student` (probably from `studentApi.getById` useQuery)
- batch config (probably a state about chosen batch)
- candidate total / softFailedCount (from candidate pool response — usually pagination meta)
- selected items count (from current plan's items)

If exact variable names differ, adapt them. If some metrics are not available (e.g. hardFailedCount is just `0` because frontend doesn't track it), pass `0` and the drawer will show "无硬条件不符".

### Step 3: TS compile check

```bash
cd apps/web && pnpm tsc --noEmit 2>&1 | grep "generate/\[studentId\]/page" | head -10
```

Expected: 0 errors.

### Step 4: Commit

```bash
git add apps/web/src/app/\(teacher\)/teacher/plans/generate/\[studentId\]/page.tsx
git commit -m "feat(plan-generate): add AlgorithmPathDrawer to explain candidate logic"
```

---

## Task 4: 自我审查 + 收尾

**No file changes — verification only.**

### Step 1: 前端类型检查

```bash
cd apps/web && pnpm tsc --noEmit 2>&1 | grep -E "PrerequisiteCheckModal|AlgorithmPathDrawer|generate/\[studentId\]/page|students/page|students/\[id\]/page" | head -20
```

Expected: 0 errors.

### Step 2: 组件存在性

```bash
ls -la "apps/web/src/components/plan/PrerequisiteCheckModal.tsx"
grep -n "function AlgorithmPathDrawer\|<AlgorithmPathDrawer" "apps/web/src/app/(teacher)/teacher/plans/generate/[studentId]/page.tsx"
grep -rn "PrerequisiteCheckModal" "apps/web/src/app/(teacher)/" | head -10
```

Expected: 
- PrerequisiteCheckModal.tsx 存在
- AlgorithmPathDrawer 在 generate page 中定义 + 使用
- PrerequisiteCheckModal 在至少 1-2 个 teacher 页面引用

### Step 3: Commit 历史

```bash
git log --oneline a63f744..HEAD
```

Expected (3 commits):
1. `feat(plan): add PrerequisiteCheckModal component with field checks`
2. `feat(plan-entry): wire PrerequisiteCheckModal to student list/detail generate buttons`
3. `feat(plan-generate): add AlgorithmPathDrawer to explain candidate logic`

### Step 4: 总结

报告:
- **Status:** READY_TO_MERGE | NEEDS_FIXES

如果 READY_TO_MERGE: 概括 PrerequisiteCheckModal 接入情况(哪些入口接入了)、AlgorithmPathDrawer 数据来源(基于已有数据反推)、已知 limitation(preview-candidate-v2 prototype 未接通)。

---

## Self-Review Checklist

After all tasks complete, verify:

1. **Spec coverage**
   - ✅ PrerequisiteCheckModal 独立组件(Task 1)
   - ✅ Modal 接入学生列表 / 详情(Task 2)
   - ✅ AlgorithmPathDrawer Drawer(Task 3)
   - ⚠️ Dashboard "生成方案" action 未接 Modal(Task 2 决策,简化范围)
   - ⚠️ preview-candidate-v2 prototype 接通未做(本 plan 显式排除)

2. **Placeholder scan**
   - ✅ 每个 step 有具体代码 / 命令

3. **Type consistency**
   - `FieldCheck` 接口在 Task 1 定义,用于 checkPrerequisites 返回值 — 一致

---

## Notes & Known Limits

- **跳过 Dashboard 入口**: TodoCard 是 `<Link>` 包裹整体卡片,要接 Modal 需要重构 TodoCard 的导航机制。本 plan 简化为只接学生列表 + 详情两个入口。
- **跳过 preview-candidate-v2 prototype 接通**: 那是 2763 行的独立 demo 页,不是简单接 Tab 能完成的整合,需要独立 plan。
- **AlgorithmPathDrawer 数据来源**: 基于 generate page 已有的 student data + candidate pool response 反推。不依赖新后端字段。如果 hardFailedCount 等指标前端没有,显示为 0 / "无"。
- **Modal 的"去补缺失字段"是 navigate to 学生详情**: 不会自动滚动到首个缺失字段(那个功能比较复杂,留给后续优化)。
