# Student Profile Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Flip 9 fields from teacher-only to student-writable + redesign student profile page from 3-stage click-through to 7-section flat layout with auto-save and teacher-edit provenance.

**Architecture:** Backend shrinks `TEACHER_ONLY_FIELDS` to just `provincialRank`, adds 6 provenance columns (3 groups × {updatedBy, updatedAt}), and updates `getMyProfile`/`updateMyProfile` to expose + accept the 9 fields. Frontend introduces an `AutoSaveField` wrapper with 1.5s debounced PATCH, a `SaveStatusBar` driven by a zustand store, a `ProvenanceBadge` for teacher edits, and 7 section components composed on the rewritten profile page.

**Tech Stack:** TypeScript, NestJS, Prisma + MariaDB, CASL, Jest, React + Next.js 15, antd, zustand, lodash debounce.

**Spec reference:** [`docs/superpowers/specs/2026-05-06-student-profile-redesign-design.md`](../specs/2026-05-06-student-profile-redesign-design.md)

---

## File Structure

| File | Responsibility | Status |
|---|---|---|
| `apps/server/prisma/schema.prisma` | Add 6 provenance columns to StudentProfile | Modify |
| `apps/server/prisma/migrations/<auto>/migration.sql` | DDL for the 6 new columns | Create |
| `apps/server/src/modules/student/field-policy.ts` | Shrink TEACHER_ONLY_FIELDS, add STUDENT_NEWLY_WRITABLE | Modify |
| `apps/server/src/modules/student/field-policy.spec.ts` | Update tests for new shape | Modify |
| `apps/server/src/modules/student/student.service.ts` | getMyProfile no longer filters 9 fields; updateMyProfile accepts them and writes provenance | Modify |
| `apps/server/src/modules/student/student.service.spec.ts` | Add tests for permission flip + provenance writes | Modify |
| `apps/server/src/modules/student/dto/update-student-profile.dto.ts` | Add 9 optional fields | Modify |
| `apps/web/src/components/student/stage-fields.ts` | Sync TEACHER_ONLY_FIELDS shrink | Modify |
| `apps/web/src/services/student-api.ts` | patchMyProfile accepts new fields | Modify (no-op if generic) |
| `apps/web/src/stores/student-save-state.ts` | Zustand store for save status | Create |
| `apps/web/src/components/student/SaveStatusBar.tsx` | Sticky top status indicator | Create |
| `apps/web/src/components/student/AutoSaveField.tsx` | Debounced field wrapper | Create |
| `apps/web/src/components/student/ProvenanceBadge.tsx` | "由老师修改 · N 天前" badge | Create |
| `apps/web/src/components/student/sections/BasicInfoSection.tsx` | Section 1: 基础信息 | Create |
| `apps/web/src/components/student/sections/ScoreSection.tsx` | Section 2: 分数与选科 (with read-only rank) | Create |
| `apps/web/src/components/student/sections/HukouSection.tsx` | Section 3: 户籍与考试地 (with ProvenanceBadge) | Create |
| `apps/web/src/components/student/sections/BonusPolicySection.tsx` | Section 4: 加分政策 (with ProvenanceBadge) | Create |
| `apps/web/src/components/student/sections/HealthSection.tsx` | Section 5: 健康条件 | Create |
| `apps/web/src/components/student/sections/PreferenceSection.tsx` | Section 6: 志愿偏好与排除 | Create |
| `apps/web/src/components/student/sections/PlanningSection.tsx` | Section 7: 升学规划与个性 | Create |
| `apps/web/src/app/(student)/student/profile/page.tsx` | Rewrite as 7-section composition | Modify (rewrite) |

Note: `stage/[stage]/page.tsx` retained unchanged as compatibility entry.

---

### Task 1: Prisma migration — 6 provenance columns

**Files:**
- Modify: `apps/server/prisma/schema.prisma`
- Create: `apps/server/prisma/migrations/<auto>/migration.sql`

- [ ] **Step 1: Add 6 provenance columns to StudentProfile model**

In `apps/server/prisma/schema.prisma`, find the `StudentProfile` model. Add these 6 fields anywhere within its field block (a natural spot is just before the relation block):

```prisma
  hukouUpdatedBy        String?   @map("hukou_updated_by") @db.VarChar(20)
  hukouUpdatedAt        DateTime? @map("hukou_updated_at")
  bonusUpdatedBy        String?   @map("bonus_updated_by") @db.VarChar(20)
  bonusUpdatedAt        DateTime? @map("bonus_updated_at")
  examLocationUpdatedBy String?   @map("exam_location_updated_by") @db.VarChar(20)
  examLocationUpdatedAt DateTime? @map("exam_location_updated_at")
```

- [ ] **Step 2: Generate the migration**

Note: local DB connection is broken on this dev box. Use `prisma migrate diff` to write the SQL manually:

```bash
cd apps/server && pnpm prisma migrate diff --from-schema-datamodel prisma/schema.prisma --to-schema-datasource prisma/schema.prisma --script 2>&1 | head -20
```

Then create the migration directory `prisma/migrations/20260506100000_add_student_profile_provenance/migration.sql` with this content:

```sql
-- AlterTable
ALTER TABLE `student_profiles`
  ADD COLUMN `hukou_updated_by` VARCHAR(20) NULL,
  ADD COLUMN `hukou_updated_at` DATETIME(3) NULL,
  ADD COLUMN `bonus_updated_by` VARCHAR(20) NULL,
  ADD COLUMN `bonus_updated_at` DATETIME(3) NULL,
  ADD COLUMN `exam_location_updated_by` VARCHAR(20) NULL,
  ADD COLUMN `exam_location_updated_at` DATETIME(3) NULL;
```

- [ ] **Step 3: Validate schema parses**

```bash
cd apps/server && pnpm prisma validate
```

Expected: `The schema at prisma/schema.prisma is valid.`

- [ ] **Step 4: Generate Prisma client**

```bash
cd apps/server && pnpm prisma generate
```

Expected: `Generated Prisma Client ...`

- [ ] **Step 5: Commit**

```bash
git add apps/server/prisma/schema.prisma apps/server/prisma/migrations/
git commit -m "feat(student): add 6 provenance columns for hukou/bonus/exam-location"
```

---

### Task 2: Backend field-policy — shrink TEACHER_ONLY + add STUDENT_NEWLY_WRITABLE

**Files:**
- Modify: `apps/server/src/modules/student/field-policy.ts`
- Modify: `apps/server/src/modules/student/field-policy.spec.ts`

- [ ] **Step 1: Update field-policy.ts**

Replace the existing `TEACHER_ONLY_FIELDS` block (lines 11-22) with:

```ts
/**
 * ① 老师独占字段：学生端不可见、不可写。
 *
 * 调整记录（2026-05-06 redesign）：
 * - 户籍/加分/考试地 9 个字段下放给学生（移到 STUDENT_NEWLY_WRITABLE）
 * - provincialRank 仍由 ScoreSegment.scoreToRank 自动计算，不属于人工录入
 */
export const TEACHER_ONLY_FIELDS = ['provincialRank'] as const;

/**
 * 2026-05-06 重新放权：学生可填，老师可改/审核。
 * 这些字段不再过滤；学生 PATCH 时后端写对应组的 *UpdatedBy/*UpdatedAt provenance。
 */
export const STUDENT_NEWLY_WRITABLE = [
  'bonusPolicyStatus',
  'bonusItems',
  'province',
  'city',
  'county',
  'isRural',
  'examLocationProvince',
  'examLocationCity',
  'examLocationCounty',
] as const;

/** 字段所属的 provenance 组（用于决定写哪一对 *UpdatedBy/At） */
export const FIELD_TO_PROVENANCE_GROUP = {
  bonusPolicyStatus: 'bonus',
  bonusItems: 'bonus',
  province: 'hukou',
  city: 'hukou',
  county: 'hukou',
  isRural: 'hukou',
  examLocationProvince: 'examLocation',
  examLocationCity: 'examLocation',
  examLocationCounty: 'examLocation',
} as const;

export type ProvenanceGroup = 'hukou' | 'bonus' | 'examLocation';
```

Update the `_STUDENT_EDITABLE_TUPLE` (lines 113-118) to include the new writable fields:

```ts
const _STUDENT_EDITABLE_TUPLE = [
  ...STAGE_1_REQUIRED,
  ...STAGE_2_FIELDS,
  ...STAGE_3_FIELDS,
  ...STUDENT_ONLY_FIELDS,
  ...STUDENT_NEWLY_WRITABLE,
] as const;
```

- [ ] **Step 2: Update field-policy.spec.ts**

Find the existing tests for `TEACHER_ONLY_FIELDS` size/content (search for `TEACHER_ONLY_FIELDS` in the file). Replace assertions:

- Old assertion: `expect(TEACHER_ONLY_FIELDS).toHaveLength(10)` → New: `expect(TEACHER_ONLY_FIELDS).toHaveLength(1)`
- Old assertion: `expect(TEACHER_ONLY_FIELDS).toContain('province')` → New: `expect(TEACHER_ONLY_FIELDS).not.toContain('province')`

Add NEW test cases:

```ts
describe('STUDENT_NEWLY_WRITABLE (2026-05-06 redesign)', () => {
  it('contains the 9 newly writable fields', () => {
    expect(STUDENT_NEWLY_WRITABLE).toEqual([
      'bonusPolicyStatus', 'bonusItems',
      'province', 'city', 'county', 'isRural',
      'examLocationProvince', 'examLocationCity', 'examLocationCounty',
    ]);
  });

  it('these fields are also in ALL_STUDENT_EDITABLE_FIELDS', () => {
    for (const f of STUDENT_NEWLY_WRITABLE) {
      expect(ALL_STUDENT_EDITABLE_FIELDS).toContain(f);
    }
  });
});

describe('FIELD_TO_PROVENANCE_GROUP', () => {
  it('maps every STUDENT_NEWLY_WRITABLE field to a group', () => {
    for (const f of STUDENT_NEWLY_WRITABLE) {
      expect(FIELD_TO_PROVENANCE_GROUP[f]).toMatch(/^(hukou|bonus|examLocation)$/);
    }
  });

  it('hukou group covers province/city/county/isRural', () => {
    expect(FIELD_TO_PROVENANCE_GROUP.province).toBe('hukou');
    expect(FIELD_TO_PROVENANCE_GROUP.city).toBe('hukou');
    expect(FIELD_TO_PROVENANCE_GROUP.county).toBe('hukou');
    expect(FIELD_TO_PROVENANCE_GROUP.isRural).toBe('hukou');
  });
});
```

Add the new imports at the top of the spec file:

```ts
import {
  TEACHER_ONLY_FIELDS,
  STUDENT_NEWLY_WRITABLE,
  FIELD_TO_PROVENANCE_GROUP,
  ALL_STUDENT_EDITABLE_FIELDS,
} from './field-policy';
```

- [ ] **Step 3: Run field-policy spec**

```bash
cd apps/server && pnpm jest src/modules/student/field-policy.spec.ts -v
```

Expected: All tests pass (existing updated assertions + new describe blocks).

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/modules/student/field-policy.ts apps/server/src/modules/student/field-policy.spec.ts
git commit -m "feat(student): shrink TEACHER_ONLY to provincialRank + add STUDENT_NEWLY_WRITABLE"
```

---

### Task 3: Backend service — getMyProfile + updateMyProfile updates

**Files:**
- Modify: `apps/server/src/modules/student/student.service.ts`
- Modify: `apps/server/src/modules/student/student.service.spec.ts`
- Modify: `apps/server/src/modules/student/dto/update-student-profile.dto.ts`

- [ ] **Step 1: Update DTO**

Open `apps/server/src/modules/student/dto/update-student-profile.dto.ts`. Find the existing field declarations. The 9 fields (`bonusPolicyStatus`, `bonusItems`, `province`, `city`, `county`, `isRural`, `examLocationProvince`, `examLocationCity`, `examLocationCounty`) may already exist in the DTO (used by teacher endpoint). If they DO exist, no changes needed; the same DTO will be used for `updateMyProfile` now. If they DON'T exist, add them as `@IsOptional()` fields matching the Prisma schema types (mostly `String?` or `Boolean?`).

Verify by reading the file (do not blindly add duplicates):

```bash
grep -nE "bonusPolicyStatus|examLocationProvince|isRural" apps/server/src/modules/student/dto/update-student-profile.dto.ts
```

If any field is missing, add it with this pattern:

```ts
  @IsOptional()
  @IsString()
  bonusPolicyStatus?: string;
```

- [ ] **Step 2: Add provenance write helper to student.service.ts**

Add this private method to `StudentService` class (place it near `updateMyProfile`):

```ts
  /**
   * Compute provenance updates to merge into a PATCH payload.
   * Maps incoming fields to {hukou,bonus,examLocation}UpdatedBy/At pairs.
   */
  private computeProvenanceUpdates(
    dto: Record<string, any>,
    actor: 'student' | 'teacher',
  ): Record<string, any> {
    const groups = new Set<string>();
    for (const key of Object.keys(dto)) {
      const group = (FIELD_TO_PROVENANCE_GROUP as Record<string, string>)[key];
      if (group) groups.add(group);
    }
    const now = new Date();
    const out: Record<string, any> = {};
    for (const g of groups) {
      out[`${g}UpdatedBy`] = actor;
      out[`${g}UpdatedAt`] = now;
    }
    return out;
  }
```

Add the import at top:

```ts
import { TEACHER_ONLY_FIELDS, FIELD_TO_PROVENANCE_GROUP } from './field-policy';
```

- [ ] **Step 3: Update getMyProfile to NOT filter the newly writable fields**

The existing filter (around lines 370-377) uses `TEACHER_ONLY_FIELDS` as the filter set. Since Task 2 shrinks that to just `provincialRank`, the filter automatically narrows. NO CODE CHANGE NEEDED here — but verify by re-reading the function and confirming the new behavior is correct.

Add the provenance fields to the returned object (they are already part of `profile` because Prisma returns them as part of `findUnique`).

- [ ] **Step 4: Update updateMyProfile to accept the 9 fields + write provenance**

Replace the existing `updateMyProfile` method (lines 385-400) with:

```ts
  /**
   * 学生本人更新自己的档案。
   * - 拒绝 ① TEACHER_ONLY_FIELDS（仅 provincialRank）
   * - 接受 STUDENT_NEWLY_WRITABLE 9 个字段，写入 hukou/bonus/examLocation provenance
   * - 委托 updateProfile 持久化（含乐观锁）
   */
  async updateMyProfile(userId: number, dto: UpdateStudentProfileDto) {
    for (const f of TEACHER_ONLY_FIELDS) {
      if ((dto as Record<string, any>)[f] !== undefined) {
        throw new ForbiddenException(`字段 ${f} 仅老师可修改`);
      }
    }

    const profile = await this.prisma.studentProfile.findUnique({
      where: { userId },
    });
    if (!profile) {
      throw new NotFoundException('学生档案不存在');
    }

    const provenance = this.computeProvenanceUpdates(dto as Record<string, any>, 'student');
    const merged = { ...dto, ...provenance } as UpdateStudentProfileDto;
    return this.updateProfile(profile.id, merged);
  }
```

- [ ] **Step 5: Update teacher-side update path to write provenance**

Find the teacher's update method (likely `updateProfileByTeacher` or invoked via the `updateProfile` flow used by teacher endpoints). Search for the entry point:

```bash
grep -nE "updateProfile|teacherUpdate" apps/server/src/modules/student/student.service.ts | head
```

For the teacher entry point (whichever method the teacher controller calls), add the same provenance computation but with `actor: 'teacher'`:

```ts
const provenance = this.computeProvenanceUpdates(dto as Record<string, any>, 'teacher');
const merged = { ...dto, ...provenance } as UpdateStudentProfileDto;
return this.updateProfile(profile.id, merged);
```

If only one `updateProfile` method handles both flows, refactor it to take an `actor` parameter:

```ts
async updateProfile(profileId: number, dto: UpdateStudentProfileDto, actor: 'student' | 'teacher' = 'teacher') {
  // ...existing logic...
  const provenance = this.computeProvenanceUpdates(dto as Record<string, any>, actor);
  const data = { ...dto, ...provenance };
  // ...rest of the persist logic uses `data`...
}
```

Then `updateMyProfile` calls `this.updateProfile(profile.id, dto, 'student')`.

- [ ] **Step 6: Add tests in student.service.spec.ts**

Add this describe block:

```ts
describe('updateMyProfile (2026-05-06 redesign)', () => {
  it('accepts province/city/county and writes hukouUpdatedBy=student', async () => {
    const userId = 1;
    const profileId = 100;
    mockPrismaStudentProfileFindUnique.mockResolvedValue({ id: profileId, userId });
    const updateProfileSpy = jest.spyOn(service, 'updateProfile').mockResolvedValue({} as any);

    await service.updateMyProfile(userId, { province: '四川', city: '成都' } as any);

    expect(updateProfileSpy).toHaveBeenCalledWith(
      profileId,
      expect.objectContaining({
        province: '四川',
        city: '成都',
        hukouUpdatedBy: 'student',
        hukouUpdatedAt: expect.any(Date),
      }),
    );
  });

  it('accepts bonusPolicyStatus and writes bonusUpdatedBy=student', async () => {
    const userId = 1;
    const profileId = 100;
    mockPrismaStudentProfileFindUnique.mockResolvedValue({ id: profileId, userId });
    const updateProfileSpy = jest.spyOn(service, 'updateProfile').mockResolvedValue({} as any);

    await service.updateMyProfile(userId, { bonusPolicyStatus: '少数民族加分' } as any);

    expect(updateProfileSpy).toHaveBeenCalledWith(
      profileId,
      expect.objectContaining({
        bonusPolicyStatus: '少数民族加分',
        bonusUpdatedBy: 'student',
        bonusUpdatedAt: expect.any(Date),
      }),
    );
  });

  it('still rejects provincialRank from student PATCH', async () => {
    const userId = 1;
    mockPrismaStudentProfileFindUnique.mockResolvedValue({ id: 100, userId });

    await expect(
      service.updateMyProfile(userId, { provincialRank: 12345 } as any),
    ).rejects.toThrow('仅老师可修改');
  });

  it('does NOT write provenance when no STUDENT_NEWLY_WRITABLE field is in dto', async () => {
    const userId = 1;
    mockPrismaStudentProfileFindUnique.mockResolvedValue({ id: 100, userId });
    const updateProfileSpy = jest.spyOn(service, 'updateProfile').mockResolvedValue({} as any);

    await service.updateMyProfile(userId, { realName: 'X' } as any);

    const call = updateProfileSpy.mock.calls[0][1] as any;
    expect(call.hukouUpdatedBy).toBeUndefined();
    expect(call.bonusUpdatedBy).toBeUndefined();
    expect(call.examLocationUpdatedBy).toBeUndefined();
  });
});

describe('getMyProfile (2026-05-06 redesign)', () => {
  it('returns province/city/county/bonusPolicyStatus etc to student (no longer filtered)', async () => {
    const profile = {
      id: 100, userId: 1,
      province: '四川', city: '成都', county: '武侯',
      bonusPolicyStatus: '少数民族加分',
      hukouUpdatedBy: 'teacher', hukouUpdatedAt: new Date('2026-05-04'),
      provincialRank: 12345,
      user: { id: 1, username: 'x', realName: 'a', phone: '1', gender: 'M', ethnicity: '汉', createdAt: new Date() },
    };
    mockPrismaStudentProfileFindUnique.mockResolvedValue(profile as any);

    const result = await service.getMyProfile(1);

    expect(result.province).toBe('四川');
    expect(result.bonusPolicyStatus).toBe('少数民族加分');
    expect(result.hukouUpdatedBy).toBe('teacher');
    // provincialRank still filtered (TEACHER_ONLY now contains only this)
    expect(result.provincialRank).toBeUndefined();
  });
});
```

- [ ] **Step 7: Run service spec**

```bash
cd apps/server && pnpm jest src/modules/student/student.service.spec.ts -v
```

Expected: All tests pass.

- [ ] **Step 8: Run full server test suite to confirm no regressions**

```bash
cd apps/server && pnpm test
```

Expected: All pass.

- [ ] **Step 9: Commit**

```bash
git add apps/server/src/modules/student/
git commit -m "feat(student): student PATCH accepts hukou/bonus/exam-location with provenance"
```

---

### Task 4: Frontend stage-fields sync

**Files:**
- Modify: `apps/web/src/components/student/stage-fields.ts`

- [ ] **Step 1: Shrink TEACHER_ONLY_FIELDS in frontend**

In `apps/web/src/components/student/stage-fields.ts`, replace lines 73-84 with:

```ts
/**
 * 镜像后端 TEACHER_ONLY_FIELDS。2026-05-06 redesign 后只剩 provincialRank。
 * 户籍/加分/考试地 9 个字段已下放给学生（见后端 STUDENT_NEWLY_WRITABLE）。
 */
export const TEACHER_ONLY_FIELDS = ['provincialRank'] as const;
```

- [ ] **Step 2: Type-check**

```bash
cd apps/web && pnpm tsc --noEmit
```

Expected: 0 errors. (If any consumer of the old TEACHER_ONLY_FIELDS expects all 10 fields, the compiler will flag it — fix at the consumer.)

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/student/stage-fields.ts
git commit -m "feat(web): sync TEACHER_ONLY_FIELDS shrink (frontend)"
```

---

### Task 5: Frontend save state store + SaveStatusBar (RED + GREEN)

**Files:**
- Create: `apps/web/src/stores/student-save-state.ts`
- Create: `apps/web/src/components/student/SaveStatusBar.tsx`
- Create: `apps/web/src/components/student/__tests__/SaveStatusBar.test.tsx`

- [ ] **Step 1: Create the zustand store**

Create `apps/web/src/stores/student-save-state.ts`:

```ts
import { create } from 'zustand';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

interface StudentSaveStore {
  state: SaveState;
  errorMessage?: string;
  setSaving: () => void;
  setSaved: () => void;
  setError: (message: string) => void;
  reset: () => void;
}

export const useStudentSaveStore = create<StudentSaveStore>((set) => ({
  state: 'idle',
  setSaving: () => set({ state: 'saving', errorMessage: undefined }),
  setSaved: () => set({ state: 'saved' }),
  setError: (errorMessage) => set({ state: 'error', errorMessage }),
  reset: () => set({ state: 'idle', errorMessage: undefined }),
}));
```

- [ ] **Step 2: Create the RED test**

Create `apps/web/src/components/student/__tests__/SaveStatusBar.test.tsx`:

```tsx
import { render, screen, act } from '@testing-library/react';
import SaveStatusBar from '../SaveStatusBar';
import { useStudentSaveStore } from '@/stores/student-save-state';

describe('SaveStatusBar', () => {
  beforeEach(() => {
    act(() => useStudentSaveStore.getState().reset());
  });

  it('renders nothing when state is idle', () => {
    const { container } = render(<SaveStatusBar />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows "保存中…" when state is saving', () => {
    act(() => useStudentSaveStore.getState().setSaving());
    render(<SaveStatusBar />);
    expect(screen.getByText('保存中…')).toBeInTheDocument();
  });

  it('shows "已保存" when state is saved', () => {
    act(() => useStudentSaveStore.getState().setSaved());
    render(<SaveStatusBar />);
    expect(screen.getByText(/已保存/)).toBeInTheDocument();
  });

  it('shows error message when state is error', () => {
    act(() => useStudentSaveStore.getState().setError('网络错误'));
    render(<SaveStatusBar />);
    expect(screen.getByText(/网络错误/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd apps/web && pnpm jest SaveStatusBar -v
```

Expected: 4 FAILs (component doesn't exist yet).

- [ ] **Step 4: Create the SaveStatusBar component**

Create `apps/web/src/components/student/SaveStatusBar.tsx`:

```tsx
'use client';

import { useStudentSaveStore } from '@/stores/student-save-state';
import { CheckCircleFilled, LoadingOutlined, CloseCircleFilled } from '@ant-design/icons';

export default function SaveStatusBar() {
  const { state, errorMessage } = useStudentSaveStore();

  if (state === 'idle') return null;

  return (
    <div className="sticky top-0 z-30 flex items-center gap-2 bg-white/90 px-3 py-1 text-xs backdrop-blur">
      {state === 'saving' && (
        <>
          <LoadingOutlined />
          <span>保存中…</span>
        </>
      )}
      {state === 'saved' && (
        <>
          <CheckCircleFilled className="text-green-500" />
          <span>已保存</span>
        </>
      )}
      {state === 'error' && (
        <>
          <CloseCircleFilled className="text-red-500" />
          <span>{errorMessage ?? '保存失败'}</span>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Run test to verify GREEN**

```bash
cd apps/web && pnpm jest SaveStatusBar -v
```

Expected: 4 PASSes.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/stores/student-save-state.ts apps/web/src/components/student/SaveStatusBar.tsx apps/web/src/components/student/__tests__/SaveStatusBar.test.tsx
git commit -m "feat(web): add SaveStatusBar + zustand save-state store"
```

---

### Task 6: Frontend AutoSaveField (RED + GREEN)

**Files:**
- Create: `apps/web/src/components/student/AutoSaveField.tsx`
- Create: `apps/web/src/components/student/__tests__/AutoSaveField.test.tsx`

- [ ] **Step 1: Create the RED test**

Create `apps/web/src/components/student/__tests__/AutoSaveField.test.tsx`:

```tsx
import { render, screen, fireEvent, act } from '@testing-library/react';
import AutoSaveField from '../AutoSaveField';
import { studentApi } from '@/services/student-api';
import { useStudentSaveStore } from '@/stores/student-save-state';

jest.mock('@/services/student-api');
const mockedPatch = studentApi.patchMyProfile as jest.Mock;

describe('AutoSaveField', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockedPatch.mockReset();
    act(() => useStudentSaveStore.getState().reset());
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('triggers PATCH 1500ms after the last change', async () => {
    mockedPatch.mockResolvedValue({ data: {} });
    render(<AutoSaveField fieldKey="province" defaultValue="" />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: '四川' } });
    expect(mockedPatch).not.toHaveBeenCalled();

    await act(async () => { jest.advanceTimersByTime(1499); });
    expect(mockedPatch).not.toHaveBeenCalled();

    await act(async () => { jest.advanceTimersByTime(1); });
    expect(mockedPatch).toHaveBeenCalledWith({ province: '四川' });
  });

  it('debounces multiple rapid changes into one PATCH', async () => {
    mockedPatch.mockResolvedValue({ data: {} });
    render(<AutoSaveField fieldKey="province" defaultValue="" />);

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '四' } });
    await act(async () => { jest.advanceTimersByTime(500); });
    fireEvent.change(input, { target: { value: '四川' } });
    await act(async () => { jest.advanceTimersByTime(500); });
    fireEvent.change(input, { target: { value: '四川省' } });
    await act(async () => { jest.advanceTimersByTime(1500); });

    expect(mockedPatch).toHaveBeenCalledTimes(1);
    expect(mockedPatch).toHaveBeenCalledWith({ province: '四川省' });
  });

  it('sets save state to saving then saved on success', async () => {
    mockedPatch.mockResolvedValue({ data: {} });
    render(<AutoSaveField fieldKey="province" defaultValue="" />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: '四川' } });
    await act(async () => { jest.advanceTimersByTime(1500); });

    // Wait microtasks
    await act(async () => { await Promise.resolve(); });
    expect(useStudentSaveStore.getState().state).toBe('saved');
  });

  it('sets save state to error on PATCH failure', async () => {
    mockedPatch.mockRejectedValue(new Error('网络错误'));
    render(<AutoSaveField fieldKey="province" defaultValue="" />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: '四川' } });
    await act(async () => { jest.advanceTimersByTime(1500); });
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });

    expect(useStudentSaveStore.getState().state).toBe('error');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/web && pnpm jest AutoSaveField -v
```

Expected: 4 FAILs (component doesn't exist).

- [ ] **Step 3: Create AutoSaveField component**

Create `apps/web/src/components/student/AutoSaveField.tsx`:

```tsx
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Input } from 'antd';
import debounce from 'lodash/debounce';
import { studentApi } from '@/services/student-api';
import { useStudentSaveStore } from '@/stores/student-save-state';

interface Props {
  fieldKey: string;
  defaultValue?: string;
  placeholder?: string;
}

const DEBOUNCE_MS = 1500;

export default function AutoSaveField({ fieldKey, defaultValue = '', placeholder }: Props) {
  const [value, setValue] = useState(defaultValue);
  const setSaving = useStudentSaveStore((s) => s.setSaving);
  const setSaved = useStudentSaveStore((s) => s.setSaved);
  const setError = useStudentSaveStore((s) => s.setError);

  // debounced sender — created once
  const debouncedRef = useRef<ReturnType<typeof debounce> | null>(null);

  const send = useCallback(
    async (val: string) => {
      setSaving();
      try {
        await studentApi.patchMyProfile({ [fieldKey]: val });
        setSaved();
      } catch (e) {
        setError((e as Error).message ?? '保存失败');
      }
    },
    [fieldKey, setSaving, setSaved, setError],
  );

  const debouncedSend = useMemo(() => debounce((val: string) => { void send(val); }, DEBOUNCE_MS), [send]);

  useEffect(() => () => { debouncedSend.cancel(); }, [debouncedSend]);

  return (
    <Input
      value={value}
      placeholder={placeholder}
      onChange={(e) => {
        const v = e.target.value;
        setValue(v);
        debouncedSend(v);
      }}
    />
  );
}
```

- [ ] **Step 4: Run tests to verify GREEN**

```bash
cd apps/web && pnpm jest AutoSaveField -v
```

Expected: 4 PASSes.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/student/AutoSaveField.tsx apps/web/src/components/student/__tests__/AutoSaveField.test.tsx
git commit -m "feat(web): AutoSaveField with 1.5s debounce and save state hooks"
```

---

### Task 7: Frontend ProvenanceBadge (RED + GREEN)

**Files:**
- Create: `apps/web/src/components/student/ProvenanceBadge.tsx`
- Create: `apps/web/src/components/student/__tests__/ProvenanceBadge.test.tsx`

- [ ] **Step 1: Create the RED test**

Create `apps/web/src/components/student/__tests__/ProvenanceBadge.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import ProvenanceBadge from '../ProvenanceBadge';

describe('ProvenanceBadge', () => {
  it('renders nothing when updatedBy is null', () => {
    const { container } = render(<ProvenanceBadge updatedBy={null} updatedAt={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when updatedBy is "student"', () => {
    const { container } = render(
      <ProvenanceBadge updatedBy="student" updatedAt={new Date('2026-05-04')} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders "由老师修改" when updatedBy is "teacher"', () => {
    const recent = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    render(<ProvenanceBadge updatedBy="teacher" updatedAt={recent} />);
    expect(screen.getByText(/由老师修改/)).toBeInTheDocument();
    expect(screen.getByText(/3.*天前/)).toBeInTheDocument();
  });

  it('shows "今天" when updatedAt is within last 24h', () => {
    const recent = new Date(Date.now() - 60 * 60 * 1000);  // 1 hour ago
    render(<ProvenanceBadge updatedBy="teacher" updatedAt={recent} />);
    expect(screen.getByText(/今天/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/web && pnpm jest ProvenanceBadge -v
```

Expected: 4 FAILs.

- [ ] **Step 3: Create ProvenanceBadge component**

Create `apps/web/src/components/student/ProvenanceBadge.tsx`:

```tsx
'use client';

interface Props {
  updatedBy: string | null | undefined;
  updatedAt: Date | string | null | undefined;
}

function formatRelative(date: Date): string {
  const now = Date.now();
  const diffMs = now - date.getTime();
  const days = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  if (days < 1) return '今天';
  if (days < 30) return `${days} 天前`;
  if (days < 365) return `${Math.floor(days / 30)} 个月前`;
  return `${Math.floor(days / 365)} 年前`;
}

export default function ProvenanceBadge({ updatedBy, updatedAt }: Props) {
  if (updatedBy !== 'teacher' || !updatedAt) return null;
  const date = updatedAt instanceof Date ? updatedAt : new Date(updatedAt);
  return (
    <span className="ml-2 text-xs text-text-faint">
      由老师修改 · {formatRelative(date)}
    </span>
  );
}
```

- [ ] **Step 4: Run tests to verify GREEN**

```bash
cd apps/web && pnpm jest ProvenanceBadge -v
```

Expected: 4 PASSes.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/student/ProvenanceBadge.tsx apps/web/src/components/student/__tests__/ProvenanceBadge.test.tsx
git commit -m "feat(web): ProvenanceBadge for teacher-edited fields"
```

---

### Task 8: Section components (basic + score)

**Files:**
- Create: `apps/web/src/components/student/sections/BasicInfoSection.tsx`
- Create: `apps/web/src/components/student/sections/ScoreSection.tsx`

- [ ] **Step 1: Create BasicInfoSection**

Create `apps/web/src/components/student/sections/BasicInfoSection.tsx`:

```tsx
'use client';

import { Card, Form } from 'antd';
import AutoSaveField from '../AutoSaveField';

interface Props {
  profile: Record<string, any>;
}

export default function BasicInfoSection({ profile }: Props) {
  return (
    <Card title="1. 基础信息" size="small">
      <Form layout="vertical" size="small">
        <Form.Item label="姓名">
          <AutoSaveField fieldKey="realName" defaultValue={profile.realName ?? ''} />
        </Form.Item>
        <Form.Item label="手机">
          <AutoSaveField fieldKey="phone" defaultValue={profile.phone ?? ''} />
        </Form.Item>
        <Form.Item label="性别">
          <AutoSaveField fieldKey="gender" defaultValue={profile.gender ?? ''} placeholder="男/女" />
        </Form.Item>
        <Form.Item label="科类">
          <AutoSaveField fieldKey="examType" defaultValue={profile.examType ?? ''} placeholder="物理类/历史类" />
        </Form.Item>
        <Form.Item label="家长手机">
          <AutoSaveField fieldKey="parentPhone" defaultValue={profile.parentPhone ?? ''} />
        </Form.Item>
        <Form.Item label="本表填写人">
          <AutoSaveField fieldKey="formFiller" defaultValue={profile.formFiller ?? ''} placeholder="本人/家长/老师" />
        </Form.Item>
        <Form.Item label="民族">
          <AutoSaveField fieldKey="ethnicity" defaultValue={profile.ethnicity ?? ''} />
        </Form.Item>
        <Form.Item label="政治面貌">
          <AutoSaveField fieldKey="politicalStatus" defaultValue={profile.politicalStatus ?? ''} />
        </Form.Item>
      </Form>
    </Card>
  );
}
```

- [ ] **Step 2: Create ScoreSection**

Create `apps/web/src/components/student/sections/ScoreSection.tsx`:

```tsx
'use client';

import { Card, Form, Tag } from 'antd';
import AutoSaveField from '../AutoSaveField';

interface Props {
  profile: Record<string, any>;
}

export default function ScoreSection({ profile }: Props) {
  return (
    <Card title="2. 分数与选科" size="small">
      <Form layout="vertical" size="small">
        <Form.Item label="首选科目">
          <AutoSaveField fieldKey="firstChoice" defaultValue={profile.firstChoice ?? ''} placeholder="物理 / 历史" />
        </Form.Item>
        <Form.Item label="再选科目（2 科）">
          <AutoSaveField fieldKey="reChoices" defaultValue={(profile.reChoices ?? []).join(',')} placeholder="如：化学,生物" />
        </Form.Item>
        <Form.Item label="总分">
          <AutoSaveField fieldKey="totalScore" defaultValue={String(profile.totalScore ?? '')} />
        </Form.Item>
        <Form.Item label="语文">
          <AutoSaveField fieldKey="scoreChinese" defaultValue={String(profile.scoreChinese ?? '')} />
        </Form.Item>
        <Form.Item label="数学">
          <AutoSaveField fieldKey="scoreMath" defaultValue={String(profile.scoreMath ?? '')} />
        </Form.Item>
        <Form.Item label="英语">
          <AutoSaveField fieldKey="scoreEnglish" defaultValue={String(profile.scoreEnglish ?? '')} />
        </Form.Item>
        <Form.Item label="首选分">
          <AutoSaveField fieldKey="scoreFirstChoice" defaultValue={String(profile.scoreFirstChoice ?? '')} />
        </Form.Item>
        <Form.Item label="再选 1">
          <AutoSaveField fieldKey="scoreSub1" defaultValue={String(profile.scoreSub1 ?? '')} />
        </Form.Item>
        <Form.Item label="再选 2">
          <AutoSaveField fieldKey="scoreSub2" defaultValue={String(profile.scoreSub2 ?? '')} />
        </Form.Item>
        <Form.Item label="全省位次">
          {profile.provincialRank ? (
            <Tag color="blue">{profile.provincialRank}</Tag>
          ) : (
            <span className="text-text-faint text-xs">填完总分+科类后自动计算</span>
          )}
        </Form.Item>
      </Form>
    </Card>
  );
}
```

- [ ] **Step 3: Type-check**

```bash
cd apps/web && pnpm tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/student/sections/BasicInfoSection.tsx apps/web/src/components/student/sections/ScoreSection.tsx
git commit -m "feat(web): BasicInfoSection + ScoreSection components"
```

---

### Task 9: Section components (newly-writable: hukou + bonus)

**Files:**
- Create: `apps/web/src/components/student/sections/HukouSection.tsx`
- Create: `apps/web/src/components/student/sections/BonusPolicySection.tsx`

- [ ] **Step 1: Create HukouSection**

Create `apps/web/src/components/student/sections/HukouSection.tsx`:

```tsx
'use client';

import { Card, Form } from 'antd';
import AutoSaveField from '../AutoSaveField';
import ProvenanceBadge from '../ProvenanceBadge';

interface Props {
  profile: Record<string, any>;
}

export default function HukouSection({ profile }: Props) {
  return (
    <Card
      title={
        <span>
          3. 户籍与考试地
          <ProvenanceBadge updatedBy={profile.hukouUpdatedBy} updatedAt={profile.hukouUpdatedAt} />
        </span>
      }
      size="small"
    >
      <Form layout="vertical" size="small">
        <Form.Item label="户籍省">
          <AutoSaveField fieldKey="province" defaultValue={profile.province ?? ''} />
        </Form.Item>
        <Form.Item label="户籍市">
          <AutoSaveField fieldKey="city" defaultValue={profile.city ?? ''} />
        </Form.Item>
        <Form.Item label="户籍县（区）">
          <AutoSaveField fieldKey="county" defaultValue={profile.county ?? ''} />
        </Form.Item>
        <Form.Item label="是否农村户籍">
          <AutoSaveField fieldKey="isRural" defaultValue={profile.isRural === true ? 'true' : profile.isRural === false ? 'false' : ''} placeholder="true / false" />
        </Form.Item>
        <Form.Item label="高考报名省">
          <AutoSaveField fieldKey="examLocationProvince" defaultValue={profile.examLocationProvince ?? ''} />
        </Form.Item>
        <Form.Item label="高考报名市">
          <AutoSaveField fieldKey="examLocationCity" defaultValue={profile.examLocationCity ?? ''} />
        </Form.Item>
        <Form.Item label="高考报名县（区）">
          <AutoSaveField fieldKey="examLocationCounty" defaultValue={profile.examLocationCounty ?? ''} />
        </Form.Item>
      </Form>
    </Card>
  );
}
```

- [ ] **Step 2: Create BonusPolicySection**

Create `apps/web/src/components/student/sections/BonusPolicySection.tsx`:

```tsx
'use client';

import { Card, Form } from 'antd';
import AutoSaveField from '../AutoSaveField';
import ProvenanceBadge from '../ProvenanceBadge';

interface Props {
  profile: Record<string, any>;
}

export default function BonusPolicySection({ profile }: Props) {
  return (
    <Card
      title={
        <span>
          4. 加分政策
          <ProvenanceBadge updatedBy={profile.bonusUpdatedBy} updatedAt={profile.bonusUpdatedAt} />
        </span>
      }
      size="small"
    >
      <Form layout="vertical" size="small">
        <Form.Item label="加分政策" help="如：少数民族加分 / 烈士子女 / 退伍军人 / 无">
          <AutoSaveField fieldKey="bonusPolicyStatus" defaultValue={profile.bonusPolicyStatus ?? ''} />
        </Form.Item>
        <Form.Item label="具体加分项目">
          <AutoSaveField fieldKey="bonusItems" defaultValue={profile.bonusItems ?? ''} placeholder="如：5 分加分 / 10 分加分 等具体细则" />
        </Form.Item>
      </Form>
    </Card>
  );
}
```

- [ ] **Step 3: Type-check**

```bash
cd apps/web && pnpm tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/student/sections/HukouSection.tsx apps/web/src/components/student/sections/BonusPolicySection.tsx
git commit -m "feat(web): HukouSection + BonusPolicySection with ProvenanceBadge"
```

---

### Task 10: Section components (health + preference + planning)

**Files:**
- Create: `apps/web/src/components/student/sections/HealthSection.tsx`
- Create: `apps/web/src/components/student/sections/PreferenceSection.tsx`
- Create: `apps/web/src/components/student/sections/PlanningSection.tsx`

- [ ] **Step 1: Create HealthSection**

Create `apps/web/src/components/student/sections/HealthSection.tsx`:

```tsx
'use client';

import { Card, Form } from 'antd';
import AutoSaveField from '../AutoSaveField';

interface Props {
  profile: Record<string, any>;
}

export default function HealthSection({ profile }: Props) {
  return (
    <Card title="5. 健康条件" size="small">
      <Form layout="vertical" size="small">
        <Form.Item label="身高 (cm)">
          <AutoSaveField fieldKey="height" defaultValue={String(profile.height ?? '')} />
        </Form.Item>
        <Form.Item label="体重 (kg)">
          <AutoSaveField fieldKey="weight" defaultValue={String(profile.weight ?? '')} />
        </Form.Item>
        <Form.Item label="左眼裸视">
          <AutoSaveField fieldKey="visionLeft" defaultValue={String(profile.visionLeft ?? '')} />
        </Form.Item>
        <Form.Item label="右眼裸视">
          <AutoSaveField fieldKey="visionRight" defaultValue={String(profile.visionRight ?? '')} />
        </Form.Item>
        <Form.Item label="左眼矫正后">
          <AutoSaveField fieldKey="visionLeftCorrected" defaultValue={String(profile.visionLeftCorrected ?? '')} />
        </Form.Item>
        <Form.Item label="右眼矫正后">
          <AutoSaveField fieldKey="visionRightCorrected" defaultValue={String(profile.visionRightCorrected ?? '')} />
        </Form.Item>
        <Form.Item label="色盲">
          <AutoSaveField fieldKey="colorBlind" defaultValue={profile.colorBlind === true ? 'true' : profile.colorBlind === false ? 'false' : ''} placeholder="true / false" />
        </Form.Item>
        <Form.Item label="色弱">
          <AutoSaveField fieldKey="colorWeak" defaultValue={profile.colorWeak === true ? 'true' : profile.colorWeak === false ? 'false' : ''} placeholder="true / false" />
        </Form.Item>
        <Form.Item label="身体限制">
          <AutoSaveField fieldKey="physicalLimits" defaultValue={profile.physicalLimits ?? ''} />
        </Form.Item>
        <Form.Item label="病史">
          <AutoSaveField fieldKey="medicalHistory" defaultValue={profile.medicalHistory ?? ''} />
        </Form.Item>
      </Form>
    </Card>
  );
}
```

- [ ] **Step 2: Create PreferenceSection**

Create `apps/web/src/components/student/sections/PreferenceSection.tsx`:

```tsx
'use client';

import { Card, Form } from 'antd';
import AutoSaveField from '../AutoSaveField';

interface Props {
  profile: Record<string, any>;
}

const arrToStr = (a: any) => Array.isArray(a) ? a.join(',') : String(a ?? '');

export default function PreferenceSection({ profile }: Props) {
  return (
    <Card title="6. 志愿偏好与排除" size="small">
      <Form layout="vertical" size="small">
        <Form.Item label="意向省份（多选，逗号分隔）">
          <AutoSaveField fieldKey="preferredProvinces" defaultValue={arrToStr(profile.preferredProvinces)} />
        </Form.Item>
        <Form.Item label="意向城市">
          <AutoSaveField fieldKey="preferredCities" defaultValue={arrToStr(profile.preferredCities)} />
        </Form.Item>
        <Form.Item label="意向专业">
          <AutoSaveField fieldKey="preferredMajors" defaultValue={arrToStr(profile.preferredMajors)} />
        </Form.Item>
        <Form.Item label="意向院校">
          <AutoSaveField fieldKey="preferredUniversities" defaultValue={arrToStr(profile.preferredUniversities)} />
        </Form.Item>
        <Form.Item label="意向专业类别">
          <AutoSaveField fieldKey="preferredMajorCategories" defaultValue={arrToStr(profile.preferredMajorCategories)} />
        </Form.Item>
        <Form.Item label="意向批次">
          <AutoSaveField fieldKey="preferredBatches" defaultValue={arrToStr(profile.preferredBatches)} />
        </Form.Item>
        <Form.Item label="优先模式" help="city / university / major">
          <AutoSaveField fieldKey="priorityMode" defaultValue={profile.priorityMode ?? ''} />
        </Form.Item>
        <Form.Item label="意向标签">
          <AutoSaveField fieldKey="preferredTags" defaultValue={arrToStr(profile.preferredTags)} />
        </Form.Item>
        <Form.Item label="排除省份">
          <AutoSaveField fieldKey="excludedProvinces" defaultValue={arrToStr(profile.excludedProvinces)} />
        </Form.Item>
        <Form.Item label="排除城市">
          <AutoSaveField fieldKey="excludedCities" defaultValue={arrToStr(profile.excludedCities)} />
        </Form.Item>
        <Form.Item label="排除院校">
          <AutoSaveField fieldKey="excludedUniversities" defaultValue={arrToStr(profile.excludedUniversities)} />
        </Form.Item>
        <Form.Item label="排除专业">
          <AutoSaveField fieldKey="excludedMajors" defaultValue={arrToStr(profile.excludedMajors)} />
        </Form.Item>
      </Form>
    </Card>
  );
}
```

- [ ] **Step 3: Create PlanningSection**

Create `apps/web/src/components/student/sections/PlanningSection.tsx`:

```tsx
'use client';

import { Card, Form } from 'antd';
import AutoSaveField from '../AutoSaveField';

interface Props {
  profile: Record<string, any>;
}

export default function PlanningSection({ profile }: Props) {
  return (
    <Card title="7. 升学规划与个性" size="small">
      <Form layout="vertical" size="small">
        <Form.Item label="升学规划">
          <AutoSaveField fieldKey="careerPlan" defaultValue={profile.careerPlan ?? ''} />
        </Form.Item>
        <Form.Item label="职业方向">
          <AutoSaveField fieldKey="careerDirection" defaultValue={profile.careerDirection ?? ''} />
        </Form.Item>
        <Form.Item label="军校意愿" help="true/false">
          <AutoSaveField fieldKey="militaryInterest" defaultValue={profile.militaryInterest === true ? 'true' : profile.militaryInterest === false ? 'false' : ''} />
        </Form.Item>
        <Form.Item label="师范意愿" help="true/false">
          <AutoSaveField fieldKey="teacherInterest" defaultValue={profile.teacherInterest === true ? 'true' : profile.teacherInterest === false ? 'false' : ''} />
        </Form.Item>
        <Form.Item label="兴趣爱好">
          <AutoSaveField fieldKey="interests" defaultValue={profile.interests ?? ''} />
        </Form.Item>
        <Form.Item label="性格类型">
          <AutoSaveField fieldKey="personalityType" defaultValue={profile.personalityType ?? ''} />
        </Form.Item>
        <Form.Item label="自我描述">
          <AutoSaveField fieldKey="selfDescription" defaultValue={profile.selfDescription ?? ''} />
        </Form.Item>
        <Form.Item label="是否接受偏远地区">
          <AutoSaveField fieldKey="remoteAreaAcceptance" defaultValue={profile.remoteAreaAcceptance === true ? 'true' : profile.remoteAreaAcceptance === false ? 'false' : ''} />
        </Form.Item>
        <Form.Item label="是否接受冷门专业">
          <AutoSaveField fieldKey="coldMajorAcceptance" defaultValue={profile.coldMajorAcceptance === true ? 'true' : profile.coldMajorAcceptance === false ? 'false' : ''} />
        </Form.Item>
        <Form.Item label="留省/出省偏好">
          <AutoSaveField fieldKey="stayPreference" defaultValue={profile.stayPreference ?? ''} placeholder="stay/leave/no_pref" />
        </Form.Item>
        <Form.Item label="学费预算 (元/年)">
          <AutoSaveField fieldKey="tuitionBudget" defaultValue={String(profile.tuitionBudget ?? '')} />
        </Form.Item>
        <Form.Item label="是否接受中外合办">
          <AutoSaveField fieldKey="acceptSinoForeign" defaultValue={profile.acceptSinoForeign === true ? 'true' : profile.acceptSinoForeign === false ? 'false' : ''} />
        </Form.Item>
        <Form.Item label="是否接受民办">
          <AutoSaveField fieldKey="acceptPrivate" defaultValue={profile.acceptPrivate === true ? 'true' : profile.acceptPrivate === false ? 'false' : ''} />
        </Form.Item>
        <Form.Item label="是否接受合作办学">
          <AutoSaveField fieldKey="acceptCooperation" defaultValue={profile.acceptCooperation === true ? 'true' : profile.acceptCooperation === false ? 'false' : ''} />
        </Form.Item>
        <Form.Item label="其他要求">
          <AutoSaveField fieldKey="otherRequirements" defaultValue={profile.otherRequirements ?? ''} />
        </Form.Item>
      </Form>
    </Card>
  );
}
```

- [ ] **Step 4: Type-check**

```bash
cd apps/web && pnpm tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/student/sections/
git commit -m "feat(web): HealthSection + PreferenceSection + PlanningSection"
```

---

### Task 11: Rewrite profile/page.tsx with 7-section composition

**Files:**
- Modify: `apps/web/src/app/(student)/student/profile/page.tsx`

- [ ] **Step 1: Replace the page implementation**

Replace the entire content of `apps/web/src/app/(student)/student/profile/page.tsx` with:

```tsx
'use client';

import { Spin, Alert, Card, Button } from 'antd';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { studentApi } from '@/services/student-api';
import ProgressBar from '@/components/student/ProgressBar';
import SaveStatusBar from '@/components/student/SaveStatusBar';
import BasicInfoSection from '@/components/student/sections/BasicInfoSection';
import ScoreSection from '@/components/student/sections/ScoreSection';
import HukouSection from '@/components/student/sections/HukouSection';
import BonusPolicySection from '@/components/student/sections/BonusPolicySection';
import HealthSection from '@/components/student/sections/HealthSection';
import PreferenceSection from '@/components/student/sections/PreferenceSection';
import PlanningSection from '@/components/student/sections/PlanningSection';

/**
 * 学生档案首页（2026-05-06 redesign）。
 * 7 个版块平铺；自动保存；老师修改在版块标题旁显示 provenance 小标。
 * 旧的 stage/[stage]/page.tsx 表单页保留作兼容入口（学生从老链接进入仍能工作）。
 */
export default function StudentProfilePage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['student-my-profile'],
    queryFn: () => studentApi.getMyProfile(),
  });

  if (isLoading) {
    return <div className="flex justify-center py-20"><Spin size="large" /></div>;
  }

  if (error || !data) {
    return <Alert type="error" message="加载档案失败，请刷新重试" />;
  }

  const profile: Record<string, any> = (data as any).data ?? data;
  const progress = profile.progress;

  if (!progress) {
    return <Alert type="error" message="档案进度信息缺失，请联系老师" />;
  }

  return (
    <div className="space-y-4 pb-20">
      <h1 className="font-serif text-xl font-semibold text-text">我的档案</h1>

      <SaveStatusBar />

      {/* 进度条 */}
      <Card size="small">
        <div className="space-y-3">
          <ProgressBar
            label="自填进度"
            percent={progress.studentSelfCompleteness}
            hint="完善信息有助于老师为你生成更精准的方案"
          />
          <ProgressBar
            label="档案总进度（含老师录入）"
            percent={progress.overallCompleteness}
          />
          {!progress.isRecommendable &&
            progress.missingFieldsForRecommend?.length > 0 && (
              <p className="text-xs text-text-faint">
                当前未达到「可推荐」阈值，缺少：
                <span className="ml-1 text-text-secondary">
                  {progress.missingFieldsForRecommend.slice(0, 5).join('、')}
                  {progress.missingFieldsForRecommend.length > 5 ? ' 等' : ''}
                </span>
              </p>
            )}
        </div>
      </Card>

      {/* 7 个版块 */}
      <BasicInfoSection profile={profile} />
      <ScoreSection profile={profile} />
      <HukouSection profile={profile} />
      <BonusPolicySection profile={profile} />
      <HealthSection profile={profile} />
      <PreferenceSection profile={profile} />
      <PlanningSection profile={profile} />

      {/* 推荐入口 */}
      <Link href="/student/recommend">
        <Button type="primary" size="large" block>
          查看老师为我生成的方案
        </Button>
      </Link>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
cd apps/web && pnpm tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Build the web app to confirm Next.js compiles**

```bash
cd apps/web && pnpm build 2>&1 | tail -10
```

Expected: build succeeds without errors. Warnings about unused imports OK.

- [ ] **Step 4: Run all web tests**

```bash
cd apps/web && pnpm test
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/(student)/student/profile/page.tsx
git commit -m "feat(web): rewrite student profile page as 7-section flat layout"
```

---

### Task 12: Deploy to production

**Files:** none (use existing `deploy_auto.py`)

- [ ] **Step 1: Push branch (if working in worktree, merge to master first)**

If working in master directly: `git push origin master`. If in worktree, merge with `git merge --ff-only <branch>` from main worktree, then push.

- [ ] **Step 2: Run full deploy**

```bash
cd C:/Users/Administrator/Documents/VolunteerHelper && python deploy_auto.py 2>&1 | tail -30
```

Expected: build → scp → prisma migrate deploy → pm2 restart all succeed.

- [ ] **Step 3: Verify migration applied on prod**

```bash
ssh -i cube.pem -o StrictHostKeyChecking=no ubuntu@132.232.245.53 "cd /home/ubuntu/apps/volunteer-helper/apps/server && set -a && source .env && set +a && node -e \"
const {PrismaClient}=require('@prisma/client');
const {PrismaMariaDb}=require('@prisma/adapter-mariadb');
const p=new PrismaClient({adapter:new PrismaMariaDb(process.env.DATABASE_URL)});
p.studentProfile.findFirst({select:{id:true,hukouUpdatedBy:true,bonusUpdatedBy:true,examLocationUpdatedBy:true}}).then(r=>{console.log(JSON.stringify(r));return p.\$disconnect();});
\""
```

Expected: prints a row (or null) with the new column names — confirms migration ran.

- [ ] **Step 4: Verify PM2 healthy**

```bash
ssh -i cube.pem -o StrictHostKeyChecking=no ubuntu@132.232.245.53 "pm2 list 2>&1 | grep -E 'vh-|Name'; curl -sS --max-time 5 -o /dev/null -w 'server :3003 status=%{http_code}\n' http://127.0.0.1:3003/api/v1/timeline; curl -sS --max-time 5 -o /dev/null -w 'web :3004 status=%{http_code}\n' http://127.0.0.1:3004/"
```

Expected: 3 services online, both endpoints return 200.

- [ ] **Step 5: Manual smoke test**

Open https://132.232.245.53:3004/student/profile in a browser (logged in as a student account). Verify:
1. 7 sections render (no JS errors in console)
2. Editing the 户籍省 field triggers SaveStatusBar showing "保存中…" then "已保存"
3. Refresh the page; the new value persists
4. Switch to a teacher account, modify the same student's 户籍 → log back in as student → ProvenanceBadge shows "由老师修改 · 今天"

If any step fails, capture the error and report.

- [ ] **Step 6: Mark spec implemented + final commit**

In `docs/superpowers/specs/2026-05-06-student-profile-redesign-design.md` line 4, change:
```markdown
**状态**：approved, pending implementation
```
to:
```markdown
**状态**：implemented 2026-05-06
```

```bash
git add docs/superpowers/specs/2026-05-06-student-profile-redesign-design.md
git commit -m "docs(student): mark profile redesign spec as implemented"
git push origin master
```

---

## Self-review notes

**Spec coverage:**
- Spec §1 (7 sections) → Tasks 8-10 (sections) + Task 11 (composition)
- Spec §2 (backend permission) → Tasks 2-3 (field-policy + service)
- Spec §3 (provenance columns) → Task 1 (migration)
- Spec §4 (frontend layout) → Task 11
- Spec §5 (涉及文件) → covered across all tasks
- Spec §6 (测试) → embedded in Tasks 2/3/5/6/7
- Spec successcriterion "刷新后值持久化" → Task 12 Step 5
- Spec successcriterion "provenance 小标显示" → Task 12 Step 5

**Placeholder scan:**
- "Add appropriate ..." - none
- "Similar to Task N" - none, all code blocks are complete
- "implement later" - none

**Type consistency:**
- `STUDENT_NEWLY_WRITABLE` - declared in Task 2, consumed in Task 3 service code via `FIELD_TO_PROVENANCE_GROUP`
- `useStudentSaveStore` shape (`setSaving/setSaved/setError`) - defined in Task 5, used in Task 6 AutoSaveField
- `ProvenanceBadge` props `(updatedBy, updatedAt)` - matches the columns added in Task 1 (`hukouUpdatedBy/At`, `bonusUpdatedBy/At`, `examLocationUpdatedBy/At`)
- `studentApi.patchMyProfile` - existing, accepts arbitrary partial profile; no new method needed
- Section component `Props { profile: Record<string, any> }` - consistent across all 7 sections; profile passed from page

**Known small risks:**
- Field types: many fields are `boolean | number | array` but `AutoSaveField` is currently text-only. The plan uses string serialization for these (e.g., `'true'/'false'`, comma-joined arrays). If UX requires type-aware widgets later, that's a follow-up. For MVP, text input + backend coercion is acceptable.
- ARIA / form semantics: not explicitly tested. Follow-up if a11y becomes priority.
- Optimistic concurrency on PATCH: existing `updateProfile` already handles via lockversion; carries through. No new logic needed.
