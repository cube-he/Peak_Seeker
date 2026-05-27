# Rename STUDENT_CONFIRMED → PARENT_CONFIRMED Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 教培场景里"学生家长共用一个账号",定稿前那一步"确认"是面对**家长**的(家长见面后线下确认 → 系统打勾)。当前枚举命名 `STUDENT_CONFIRMED`/action `STUDENT_CONFIRM` 让人困惑(谁确认?学生还是家长?)。重命名为 `PARENT_CONFIRMED` / `PARENT_CONFIRM`,语义明确。同时把 11 个文件里的字符串引用 + UI 文案("学生确认" → "家长确认")一并改完。

**Architecture:** Pure rename refactor. 状态机的 transition 拓扑、PlanStatus 9 个状态、字段数量,全部不变。只改:
- Prisma enum value 名字 + 数据库 migration(改 MySQL ENUM 列定义 + UPDATE 已有数据)
- PlanAction TypeScript union 中的字符串
- 11 个文件里 hardcoded `'STUDENT_CONFIRMED'` / `'STUDENT_CONFIRM'` 字符串
- 中文 UI 文案("学生确认" → "家长确认")
- VolunteerPlan 表上的 `studentConfirmedAt` / `studentChangeRequestedAt` / `studentChangeRequest` 字段 → 同步重命名为 `parentConfirmedAt` 等(它们在概念上跟 STUDENT_CONFIRMED 是一体的)

**Tech Stack:** Prisma + NestJS + Jest + Next.js. 无新依赖。

---

## File Structure

**Backend (NestJS + Prisma)**
- Modify: `apps/server/prisma/schema.prisma` — enum + VolunteerPlan 字段
- Create: `apps/server/prisma/migrations/<timestamp>_rename_student_confirmed_to_parent_confirmed/migration.sql` — 手写 enum 重命名 + UPDATE 已有数据 + 字段重命名
- Modify: `apps/server/src/modules/plan/plan-state-machine.service.ts` — PlanAction type + transition 字符串
- Modify: `apps/server/src/modules/plan/plan-state-machine.service.spec.ts` — 测试 case 名字
- Modify: `apps/server/src/modules/plan/plan.service.ts` — 任何引用 STUDENT_CONFIRMED 的地方
- Modify: `apps/server/src/modules/plan/plan.service.spec.ts` — 测试 mock 数据
- Modify: `apps/server/src/modules/student/student.service.ts` — 任何引用

**Frontend (Next.js)**
- Modify: `apps/web/src/components/plan/PlanStatusBadge.tsx` — status label
- Modify: `apps/web/src/app/(teacher)/teacher/plans/[id]/page.tsx` — UI 文案 + status 字符串
- Modify: `apps/web/src/app/(teacher)/teacher/students/page.tsx` — UI 文案
- Modify: `apps/web/src/app/(student)/student/plans/[id]/page.tsx` — UI 文案("学生确认" 实际由家长在家长账号上点)

---

## Task 1: Prisma Schema + Migration

**Files:**
- Modify: `apps/server/prisma/schema.prisma`
- Create: `apps/server/prisma/migrations/<timestamp>_rename_student_confirmed_to_parent_confirmed/migration.sql`

**Goal:** 改枚举 + 改 3 个相关字段 + 手写 migration,确保数据兼容(把现有 `STUDENT_CONFIRMED` 值改成 `PARENT_CONFIRMED`)。

### Step 1: 在 schema.prisma 重命名 enum value

Find the `PlanStatus` enum definition (around line 41-51). Currently:
```prisma
enum PlanStatus {
  DRAFT
  PENDING_REVIEW
  REVIEWING
  APPROVED
  STUDENT_CONFIRMED
  REJECTED
  FINALIZED
  PUBLISHED
  OUTDATED
}
```

Replace `STUDENT_CONFIRMED` with `PARENT_CONFIRMED`:
```prisma
enum PlanStatus {
  DRAFT
  PENDING_REVIEW
  REVIEWING
  APPROVED
  PARENT_CONFIRMED
  REJECTED
  FINALIZED
  PUBLISHED
  OUTDATED
}
```

### Step 2: 在 schema.prisma 重命名 VolunteerPlan 的相关字段

Locate the `VolunteerPlan` model (around line 871-873). Currently has:
```prisma
  studentConfirmedAt DateTime? @map("student_confirmed_at")
  studentChangeRequestedAt DateTime? @map("student_change_requested_at")
  studentChangeRequest String? @map("student_change_request") @db.Text
```

Replace with:
```prisma
  parentConfirmedAt DateTime? @map("parent_confirmed_at")
  parentChangeRequestedAt DateTime? @map("parent_change_requested_at")
  parentChangeRequest String? @map("parent_change_request") @db.Text
```

Note: We're renaming BOTH the Prisma field name (`studentConfirmedAt` → `parentConfirmedAt`) AND the underlying DB column name (`student_confirmed_at` → `parent_confirmed_at`) for consistency. The migration in Step 3 handles the DB rename.

### Step 3: 手写 migration

Use `prisma migrate diff` to generate the baseline SQL, then hand-tune it for the enum (Prisma's auto migration for enum renames can be lossy).

First create the migration folder:
```bash
cd apps/server && mkdir -p prisma/migrations/$(date +%Y%m%d%H%M%S)_rename_student_confirmed_to_parent_confirmed
```

Actually, use a deterministic timestamp matching the Plan 2 pattern (e.g., `20260526020000`):

```bash
mkdir -p apps/server/prisma/migrations/20260526020000_rename_student_confirmed_to_parent_confirmed
```

Create the file `apps/server/prisma/migrations/20260526020000_rename_student_confirmed_to_parent_confirmed/migration.sql` with:

```sql
-- Step 1: 给 status 列加上新的 enum value (保留旧 value 以便迁移期间数据可读写)
ALTER TABLE `volunteer_plans`
  MODIFY COLUMN `status` ENUM(
    'DRAFT',
    'PENDING_REVIEW',
    'REVIEWING',
    'APPROVED',
    'STUDENT_CONFIRMED',
    'PARENT_CONFIRMED',
    'REJECTED',
    'FINALIZED',
    'PUBLISHED',
    'OUTDATED'
  ) NOT NULL DEFAULT 'DRAFT';

-- Step 2: 迁移已有数据
UPDATE `volunteer_plans` SET `status` = 'PARENT_CONFIRMED' WHERE `status` = 'STUDENT_CONFIRMED';

-- Step 3: 删除旧 enum value
ALTER TABLE `volunteer_plans`
  MODIFY COLUMN `status` ENUM(
    'DRAFT',
    'PENDING_REVIEW',
    'REVIEWING',
    'APPROVED',
    'PARENT_CONFIRMED',
    'REJECTED',
    'FINALIZED',
    'PUBLISHED',
    'OUTDATED'
  ) NOT NULL DEFAULT 'DRAFT';

-- Step 4: 重命名 3 个字段(数据自动跟随)
ALTER TABLE `volunteer_plans`
  CHANGE COLUMN `student_confirmed_at` `parent_confirmed_at` DATETIME(3) NULL;

ALTER TABLE `volunteer_plans`
  CHANGE COLUMN `student_change_requested_at` `parent_change_requested_at` DATETIME(3) NULL;

ALTER TABLE `volunteer_plans`
  CHANGE COLUMN `student_change_request` `parent_change_request` TEXT NULL;
```

### Step 4: 应用 migration

由于 shadow DB 在本仓库有问题(见 Plan 2 Task 1 的经验),使用相同的 escape hatch:

```bash
cd apps/server && pnpm prisma db execute --file ./prisma/migrations/20260526020000_rename_student_confirmed_to_parent_confirmed/migration.sql
```

如果本地 DB 连不上,跳过此步,只把 SQL 文件 commit。部署时 `prisma migrate deploy` 会处理。

然后标记为已应用(如果本地 DB 可用):
```bash
cd apps/server && pnpm prisma migrate resolve --applied 20260526020000_rename_student_confirmed_to_parent_confirmed
```

### Step 5: 重新生成 Prisma client

```bash
cd apps/server && pnpm prisma generate
```

Expected: regenerates types so `PlanStatus.PARENT_CONFIRMED` and `volunteer_plan.parentConfirmedAt` are now available.

### Step 6: Commit

```bash
git add apps/server/prisma/schema.prisma apps/server/prisma/migrations/20260526020000_rename_student_confirmed_to_parent_confirmed/
git commit -m "feat(schema): rename STUDENT_CONFIRMED to PARENT_CONFIRMED in PlanStatus enum"
```

---

## Task 2: 后端代码替换

**Files:**
- Modify: `apps/server/src/modules/plan/plan-state-machine.service.ts`
- Modify: `apps/server/src/modules/plan/plan-state-machine.service.spec.ts`
- Modify: `apps/server/src/modules/plan/plan.service.ts`
- Modify: `apps/server/src/modules/plan/plan.service.spec.ts`
- Modify: `apps/server/src/modules/student/student.service.ts`

**Goal:** 把后端代码里的 `'STUDENT_CONFIRMED'` 字符串、`'STUDENT_CONFIRM'` action、以及 `studentConfirmedAt` 等字段引用全部改成 `PARENT_*` 形式。

### Step 1: 更新 PlanAction type

Edit `apps/server/src/modules/plan/plan-state-machine.service.ts`. The current type:
```typescript
export type PlanAction =
  | 'SUBMIT_REVIEW' | 'START_REVIEW' | 'APPROVE' | 'REJECT'
  | 'REQUEST_CHANGE' | 'COMMENT' | 'STUDENT_CONFIRM'
  | 'STUDENT_REQUEST_CHANGE' | 'FINALIZE';
```

Replace with:
```typescript
export type PlanAction =
  | 'SUBMIT_REVIEW' | 'START_REVIEW' | 'APPROVE' | 'REJECT'
  | 'REQUEST_CHANGE' | 'COMMENT' | 'PARENT_CONFIRM'
  | 'PARENT_REQUEST_CHANGE' | 'FINALIZE';
```

### Step 2: 更新 state-machine 内部的 transition 逻辑

Same file, around lines 30-36:
```typescript
    if (from === 'APPROVED') {
      if (action === 'STUDENT_CONFIRM') return 'STUDENT_CONFIRMED' as PlanStatus;
      if (action === 'STUDENT_REQUEST_CHANGE') return 'DRAFT';
    }
    if (from === ('STUDENT_CONFIRMED' as PlanStatus) && action === 'FINALIZE') {
      return 'FINALIZED';
    }
```

Replace with:
```typescript
    if (from === 'APPROVED') {
      if (action === 'PARENT_CONFIRM') return 'PARENT_CONFIRMED';
      if (action === 'PARENT_REQUEST_CHANGE') return 'DRAFT';
    }
    if (from === 'PARENT_CONFIRMED' && action === 'FINALIZE') {
      return 'FINALIZED';
    }
```

Note: removed the `as PlanStatus` cast because after Prisma regen, `PARENT_CONFIRMED` is a proper enum member.

### Step 3: 更新 `canDeriveVersion` 引用

Same file, around line 41:
```typescript
  canDeriveVersion(from: PlanStatus): boolean {
    return from === 'APPROVED' || from === ('STUDENT_CONFIRMED' as PlanStatus) || from === 'REJECTED' || from === 'FINALIZED';
  }
```

Replace with:
```typescript
  canDeriveVersion(from: PlanStatus): boolean {
    return from === 'APPROVED' || from === 'PARENT_CONFIRMED' || from === 'REJECTED' || from === 'FINALIZED';
  }
```

### Step 4: 全局替换 state-machine.spec.ts

In `apps/server/src/modules/plan/plan-state-machine.service.spec.ts`, find all `STUDENT_CONFIRM` and `STUDENT_CONFIRMED` and replace:

Run:
```bash
grep -n "STUDENT_CONFIRM" apps/server/src/modules/plan/plan-state-machine.service.spec.ts
```

For each match, replace:
- `'STUDENT_CONFIRM'` → `'PARENT_CONFIRM'`
- `'STUDENT_CONFIRMED'` → `'PARENT_CONFIRMED'`
- `'STUDENT_REQUEST_CHANGE'` → `'PARENT_REQUEST_CHANGE'`

If test descriptions reference "学生" (e.g., `it('STUDENT_CONFIRM moves to ...')`), also update them to "家长".

### Step 5: 替换 plan.service.ts

```bash
grep -n "STUDENT_CONFIRM\|studentConfirmedAt\|studentChangeRequestedAt\|studentChangeRequest" apps/server/src/modules/plan/plan.service.ts
```

For each match, replace:
- `'STUDENT_CONFIRMED'` → `'PARENT_CONFIRMED'`
- `'STUDENT_CONFIRM'` → `'PARENT_CONFIRM'`
- `'STUDENT_REQUEST_CHANGE'` → `'PARENT_REQUEST_CHANGE'`
- `studentConfirmedAt` → `parentConfirmedAt`
- `studentChangeRequestedAt` → `parentChangeRequestedAt`
- `studentChangeRequest` → `parentChangeRequest`

### Step 6: 替换 plan.service.spec.ts

Same approach as Step 5, on `apps/server/src/modules/plan/plan.service.spec.ts`. Also any test description with "学生" → "家长".

### Step 7: 替换 student.service.ts

```bash
grep -n "STUDENT_CONFIRM\|studentConfirmedAt\|studentChangeRequestedAt\|studentChangeRequest" apps/server/src/modules/student/student.service.ts
```

For each match, apply the same replacements.

注意:该文件名带 "student" 但**不要重命名文件**——它是学生档案 service,跟方案确认没关系。只改里面对 plan 状态/字段的引用。

### Step 8: 跑后端测试

```bash
cd apps/server && pnpm jest plan
```

Expected: all plan-related tests pass. If any failure references "STUDENT" that wasn't caught, fix it.

### Step 9: Commit

```bash
git add apps/server/src/modules/plan/plan-state-machine.service.ts \
        apps/server/src/modules/plan/plan-state-machine.service.spec.ts \
        apps/server/src/modules/plan/plan.service.ts \
        apps/server/src/modules/plan/plan.service.spec.ts \
        apps/server/src/modules/student/student.service.ts
git commit -m "refactor(plan): rename STUDENT_CONFIRM action/field references to PARENT_*"
```

---

## Task 3: 前端代码替换

**Files:**
- Modify: `apps/web/src/components/plan/PlanStatusBadge.tsx`
- Modify: `apps/web/src/app/(teacher)/teacher/plans/[id]/page.tsx`
- Modify: `apps/web/src/app/(teacher)/teacher/students/page.tsx`
- Modify: `apps/web/src/app/(student)/student/plans/[id]/page.tsx`

**Goal:** 前端代码里 `'STUDENT_CONFIRMED'` 字符串改为 `'PARENT_CONFIRMED'`,中文 UI 文案 "学生确认" → "家长确认","学生退回" → "家长退回"。

### Step 1: 列出所有前端引用

Run:
```bash
grep -rn "STUDENT_CONFIRM\|studentConfirmedAt\|studentChangeRequestedAt\|studentChangeRequest\|学生确认\|学生退回\|学生待确认\|学生未确认" apps/web/src/ | head -50
```

This gives the full list. Expect ~10-20 matches across 4 files.

### Step 2: PlanStatusBadge.tsx

Read `apps/web/src/components/plan/PlanStatusBadge.tsx` end-to-end. There's likely a status-to-label / status-to-color map. For each entry keyed on `STUDENT_CONFIRMED`:
- Rename the key to `PARENT_CONFIRMED`
- Update the Chinese label: `'学生确认'` → `'家长确认'` (or whatever existing label is, replace 学生→家长 part)

### Step 3: teacher/plans/[id]/page.tsx

Apply the same pattern:
- `'STUDENT_CONFIRMED'` (string literal) → `'PARENT_CONFIRMED'`
- `studentConfirmedAt` field → `parentConfirmedAt`
- UI text `'学生确认'` → `'家长确认'`, `'学生退回'` → `'家长退回'`, etc.

Any inline conditional like `plan.status === 'STUDENT_CONFIRMED'` becomes `plan.status === 'PARENT_CONFIRMED'`.

### Step 4: teacher/students/page.tsx

Same pattern. Likely uses status label in a column render.

### Step 5: student/plans/[id]/page.tsx

Same pattern. This is the student/parent-facing page. The button label "我确认这个方案" might say "学生确认" — change to "家长确认".

注意:这是**学生家长共用账号**的页面,UI 上调用方应该是"家长"(因为决策权在家长)。原"学生确认"是错误措辞。

### Step 6: 跑前端类型检查

```bash
cd apps/web && pnpm tsc --noEmit 2>&1 | grep -E "PlanStatusBadge|plans/\[id\]/page|students/page" | head -20
```

Expected: zero errors in these 4 files. If errors remain, they likely point to a missed reference.

### Step 7: Final grep — 确认零残留

```bash
grep -rn "STUDENT_CONFIRM" apps/web/src/ apps/server/src/ 2>/dev/null | grep -v node_modules | grep -v "STUDENT_CONFIRM_PLACEHOLDER_THAT_DOES_NOT_EXIST"
```

Expected: zero matches.

Also:
```bash
grep -rn "studentConfirmedAt\|studentChangeRequestedAt\|studentChangeRequest" apps/web/src/ apps/server/src/ 2>/dev/null | grep -v node_modules
```

Expected: zero matches.

### Step 8: Commit

```bash
git add apps/web/src/components/plan/PlanStatusBadge.tsx \
        apps/web/src/app/\(teacher\)/teacher/plans/\[id\]/page.tsx \
        apps/web/src/app/\(teacher\)/teacher/students/page.tsx \
        apps/web/src/app/\(student\)/student/plans/\[id\]/page.tsx
git commit -m "refactor(plan): update frontend STUDENT_CONFIRM references and UI to PARENT_*"
```

---

## Task 4: 自我审查 + 收尾

**No file changes — verification only.**

### Step 1: 全量后端测试

```bash
cd apps/server && pnpm test 2>&1 | tail -30
```

Expected: same baseline as before this plan (Plan 2 + Plan 1 已通过的 plan-related tests 都还过)。pre-existing failures in unrelated modules (student / progress / etc.) acceptable.

### Step 2: 全量前端类型检查

```bash
cd apps/web && pnpm tsc --noEmit 2>&1 | grep -E "STUDENT_CONFIRM|studentConfirmed" | head -10
```

Expected: zero — no leftover references in any frontend file.

### Step 3: Migration 文件检查

```bash
ls -la apps/server/prisma/migrations/ | grep -i "student\|parent"
```

Expected: 看到新建的 `20260526020000_rename_student_confirmed_to_parent_confirmed` 目录;其它历史 migration 保留(不要删除任何旧 migration)。

### Step 4: Commit 历史

```bash
git log --oneline 2a101fd..HEAD
```

Expected (3 commits):
1. `feat(schema): rename STUDENT_CONFIRMED to PARENT_CONFIRMED in PlanStatus enum`
2. `refactor(plan): rename STUDENT_CONFIRM action/field references to PARENT_*`
3. `refactor(plan): update frontend STUDENT_CONFIRM references and UI to PARENT_*`

### Step 5: 最终 grep 兜底

```bash
grep -rn "STUDENT_CONFIRM\|studentConfirmedAt\|studentChangeRequestedAt\|studentChangeRequest\|学生确认\|学生退回\|学生未确认\|学生待确认" apps/ 2>/dev/null | grep -v node_modules | grep -v "migrations/2026"
```

Expected: zero matches.

注意:`migrations/2026` 目录可能含旧 migration 文件,这些**不能动**——它们记录了历史 schema。新 migration(20260526020000)是 OK 的,它包含旧 enum 值是预期的(因为它 ALTER 时要列出所有 enum 值)。

### Step 6: 总结

报告:

**Status:** READY_TO_MERGE | NEEDS_FIXES

If NEEDS_FIXES, list issues with severity + file:line.

If READY_TO_MERGE, brief paragraph confirming: 
- Schema renamed ✓
- Migration applies cleanly ✓
- Backend tests pass ✓
- Frontend tsc clean ✓
- Zero leftover string references ✓

---

## Self-Review Checklist

After all tasks complete, verify:

1. **Spec coverage**
   - ✅ Enum value renamed (Task 1)
   - ✅ 3 字段重命名(`student_confirmed_at` 等 → `parent_*`)(Task 1)
   - ✅ State machine action 重命名(Task 2)
   - ✅ 所有后端代码引用更新(Task 2)
   - ✅ 所有前端代码 + UI 文案更新(Task 3)
   - ✅ 数据迁移 SQL 保证旧 `STUDENT_CONFIRMED` 数据无丢失(Task 1 Step 3)

2. **Placeholder scan**
   - ✅ 每个 step 有具体 SQL/代码/grep 命令
   - ✅ Migration SQL 是完整的 4 步 ALTER

3. **Type consistency**
   - `PlanAction` union 4 个改字:`PARENT_CONFIRM` / `PARENT_REQUEST_CHANGE`(action) + `PARENT_CONFIRMED`(status name);全文件一致
   - 字段 `parentConfirmedAt` / `parentChangeRequestedAt` / `parentChangeRequest`:schema + service + frontend 三处一致

---

## Notes & Known Limits

- **Migration 可逆性**:如果出问题需要回滚,反向 migration 是把 SQL 改一下(PARENT → STUDENT)。已发布上线后回滚意味着部分用户已经看到"家长确认"按钮,回滚成"学生确认"会困惑——所以一旦上线就别回滚,有问题直接 forward fix。
- **未来 migration 命名**:新 migration 不要再用 `student_*` 前缀(避免再次混淆);用 `parent_*`。
- **学生端 page** 修改原因:学生家长共用账号,确认按钮是给"持有学生账号的家长"用的——所以叫"家长确认"语义准确。这不是技术债,这是从教培用户视角看清现实。
- **`student.service.ts` 文件名保留**:它是学生档案 service(StudentProfile model),跟方案确认逻辑无关——所以文件名不动,只改里面对 plan 状态字符串的引用。
