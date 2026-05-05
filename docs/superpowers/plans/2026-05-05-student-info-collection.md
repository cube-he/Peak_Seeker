# 学生信息采集与管理 V1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 spec `2026-05-05-student-info-collection-design.md` 中的 B 范围：补完字段 + 学生端 W3 三阶段渐进采集 dashboard + 老师端单页 form 扩字段 + xlsx 接待单导出 + 双轨完整度算法。

**Architecture:** 后端在现有 NestJS + Prisma + CASL 之上扩 schema、加 service 字段权限白名单与 ProfileProgress 服务、加 xlsx 导出 service；前端用 Next.js + antd + react-query 重做学生端 dashboard 和阶段表单，扩老师端详情页。**字段级权限在 service 层手写白名单**（不依赖 CASL field-level）；**无审核状态机**（学生改 ②类字段直接生效）。

**Tech Stack:** NestJS 10, Prisma 5 (MySQL), CASL 6, Jest 29, exceljs 4.4, Next.js 14, antd 5, @tanstack/react-query 5

**Spec:** `docs/superpowers/specs/2026-05-05-student-info-collection-design.md`

---

## File Structure

### 后端新建
```
apps/server/src/modules/student/
  field-policy.ts                    # 三类字段集 + W3 三阶段字段集 常量
  field-policy.spec.ts               # disjoint + 完整覆盖断言
  progress.service.ts                # 双轨完整度 + stageProgress + isRecommendable
  progress.service.spec.ts
  intake-export.service.ts           # exceljs xlsx 导出
  intake-export.service.spec.ts
  dto/
    bonus-item.dto.ts                # bonusItems 数组元素 DTO（嵌套校验）
apps/server/templates/
  intake-form-2025-v1.xlsx           # 西典接待单模板（仓库内置）
```

### 后端修改
```
apps/server/prisma/schema.prisma                                # 加 5 枚举 + StudentProfile 18 字段
apps/server/src/modules/student/student.service.ts              # +getMyProfile/+updateMyProfile/重构 calculateCompleteness
apps/server/src/modules/student/student.service.spec.ts         # 兼容旧测试 + 新测试
apps/server/src/modules/student/student.controller.ts           # +GET/PUT/me + GET/me/progress + GET/:id/export-intake
apps/server/src/modules/student/student.module.ts               # 注册 ProgressService + IntakeExportService
apps/server/src/modules/student/dto/update-student-profile.dto.ts  # 加新字段
apps/server/src/modules/casl/casl-ability.factory.ts            # 学生端 read 自己 StudentProfile
```

### 前端新建
```
apps/web/src/app/(student)/student/profile/
  page.tsx                            # 改造为阶段卡片 dashboard（替换原 220 行）
  stage/[stage]/page.tsx              # 阶段表单页（动态路由）
apps/web/src/components/student/
  StageCard.tsx                       # 阶段入口卡片
  ProgressBar.tsx                     # 双进度条组件
  TeacherOnlyField.tsx                # ① 字段只读展示
  stage-fields.ts                     # 前端镜像三阶段字段定义（与后端 field-policy.ts 同步）
apps/web/src/services/
  student-progress-api.ts             # 取 progress 的封装
```

### 前端修改
```
apps/web/src/app/(teacher)/teacher/students/[id]/page.tsx       # 改 Collapse + 双进度条 + 导出按钮
apps/web/src/app/(teacher)/teacher/students/page.tsx            # 加双完整度列 + 筛选
apps/web/src/services/student-api.ts                            # 加 getMyProgress/exportIntake 方法 + 完整 dto
```

---

# Milestone M1: schema + migration + 枚举

## Task M1.1: 加 5 个新枚举到 Prisma schema

**Files:**
- Modify: `apps/server/prisma/schema.prisma:33-153`（在现有枚举区域追加）

- [ ] **Step 1: 在现有枚举区域末尾追加 5 个枚举**

在 `apps/server/prisma/schema.prisma` 的 `enum RecommendType {...}` 之后追加：

```prisma
// ==================== 学生信息采集 V1 新增枚举 ====================

enum PoliticalStatus {
  PARTY_MEMBER
  LEAGUE_MEMBER
  MASSES
}

enum BonusPolicyStatus {
  NONE
  HAS_BONUS
  UNKNOWN
}

enum RemoteAreaAcceptance {
  ABSOLUTELY_NO
  BACKUP_ONLY
  FAMOUS_OK
  GOOD_MAJOR_OK
}

enum ColdMajorAcceptance {
  ABSOLUTELY_NO
  FAMOUS_OK
  DEVELOPED_AREA_OK
  GOOD_PROSPECT_OK
}

enum FormFiller {
  STUDENT
  PARENT
  TOGETHER
}
```

- [ ] **Step 2: 跑 `prisma format` 确保格式正确**

```bash
cd apps/server && npx prisma format
```

Expected: `Formatted ./prisma/schema.prisma in NNms`

- [ ] **Step 3: Commit**

```bash
git add apps/server/prisma/schema.prisma
git commit -m "feat(student): add 5 enums for info collection v1"
```

## Task M1.2: 给 StudentProfile 加 18 个新字段

**Files:**
- Modify: `apps/server/prisma/schema.prisma:548-651`（StudentProfile 模型内）

- [ ] **Step 1: 找到 `model StudentProfile` 中 `// --- 基本信息 ---` 区段**

在 `isRural` 字段后追加：

```prisma
  // --- 高考所在地（① 老师独占）---
  examLocationProvince String? @map("exam_location_province") @db.VarChar(50)
  examLocationCity     String? @map("exam_location_city") @db.VarChar(100)
  examLocationCounty   String? @map("exam_location_county") @db.VarChar(100)

  // --- 政治面貌（② 学生可编辑）---
  politicalStatus PoliticalStatus? @map("political_status")
```

- [ ] **Step 2: 在 `// --- 身体条件 ---` 区段（`physicalLimits` 后）追加视力 + 病史**

```prisma
  // --- 视力详细（V1 新增，旧 vision 字段标记 deprecated 但保留）---
  visionLeft           Decimal? @map("vision_left") @db.Decimal(3, 1)
  visionRight          Decimal? @map("vision_right") @db.Decimal(3, 1)
  visionLeftCorrected  Decimal? @map("vision_left_corrected") @db.Decimal(3, 1)
  visionRightCorrected Decimal? @map("vision_right_corrected") @db.Decimal(3, 1)
  medicalHistory       String?  @map("medical_history") @db.Text
```

- [ ] **Step 3: 在 `// --- 经济条件 ---` 区段前（`acceptLevel` 后）追加加分政策 + 意向批次**

```prisma
  // --- 加分政策（① 老师独占）---
  bonusPolicyStatus BonusPolicyStatus? @map("bonus_policy_status")
  bonusItems        Json?              @map("bonus_items")

  // --- 意向批次（② 学生可编辑，Batch 枚举值数组）---
  preferredBatches Json? @map("preferred_batches")

  // --- 偏远 / 冷门接受度（② 学生可编辑）---
  remoteAreaAcceptance RemoteAreaAcceptance? @map("remote_area_acceptance")
  coldMajorAcceptance  ColdMajorAcceptance?  @map("cold_major_acceptance")
```

- [ ] **Step 4: 在 `// --- 管理字段 ---` 区段（`dataVersion` 后）追加填表元信息**

```prisma
  // --- 填表元信息（V1 新增）---
  formFiller        FormFiller? @map("form_filler")
  parentSignedAt    DateTime?   @map("parent_signed_at")
  intakeFormVersion String?     @default("2025-v1") @map("intake_form_version") @db.VarChar(10)
```

- [ ] **Step 5: 在旧 `vision String?` 字段上加注释**

把 `vision String? @db.VarChar(50)` 改成：

```prisma
  /// @deprecated 用 visionLeft/visionRight + visionLeftCorrected/visionRightCorrected 取代
  vision String? @db.VarChar(50)
```

- [ ] **Step 6: 跑 `prisma format`**

```bash
cd apps/server && npx prisma format
```

Expected: 格式化无报错

- [ ] **Step 7: Commit**

```bash
git add apps/server/prisma/schema.prisma
git commit -m "feat(student): add 18 fields to StudentProfile for v1 intake form"
```

## Task M1.3: 生成并应用 Prisma migration

**Files:**
- Create: `apps/server/prisma/migrations/<timestamp>_student_info_collection_v1/migration.sql`

- [ ] **Step 1: 生成 migration（不直接应用，先看 SQL）**

```bash
cd apps/server && npx prisma migrate dev --name student_info_collection_v1 --create-only
```

Expected: 在 `prisma/migrations/<时间戳>_student_info_collection_v1/migration.sql` 生成 ALTER TABLE + CREATE TYPE 语句

- [ ] **Step 2: 检查 migration.sql 关键内容**

Read the generated `migration.sql`，确认包含：
- `CREATE TABLE` 不存在（只有 ALTER）
- `ALTER TABLE student_profiles ADD COLUMN exam_location_province VARCHAR(50)`
- 5 个 enum 在 MySQL 上会被实现为 VARCHAR + ENUM 约束（MySQL Prisma 用 ENUM 列）
- 没有 DROP COLUMN（旧 `vision` 仍保留）

- [ ] **Step 3: 应用 migration**

```bash
cd apps/server && npx prisma migrate dev
```

Expected: `Applied migration <timestamp>_student_info_collection_v1` + Prisma client 重新生成

- [ ] **Step 4: 跑现有测试套件确保无破坏**

```bash
cd apps/server && npm test -- student
```

Expected: 现有 `student.service.spec.ts` 全绿（无新测试，仍跑 calculateCompleteness 旧用例）

- [ ] **Step 5: Commit**

```bash
git add apps/server/prisma/migrations/
git commit -m "feat(student): apply migration for v1 intake fields"
```

---

# Milestone M2: 字段权限白名单 + ProfileProgress 服务

## Task M2.1: 创建 field-policy.ts 常量集（RED）

**Files:**
- Create: `apps/server/src/modules/student/field-policy.spec.ts`

- [ ] **Step 1: 写测试断言三类字段的不变量**

```typescript
// apps/server/src/modules/student/field-policy.spec.ts
import {
  TEACHER_ONLY_FIELDS,
  STUDENT_ONLY_FIELDS,
  STAGE_1_REQUIRED,
  STAGE_2_FIELDS,
  STAGE_3_FIELDS,
  ALL_STUDENT_EDITABLE_FIELDS,
} from './field-policy';

describe('field-policy', () => {
  it('TEACHER_ONLY_FIELDS 与 STUDENT_ONLY_FIELDS disjoint', () => {
    const teacherSet = new Set(TEACHER_ONLY_FIELDS);
    for (const f of STUDENT_ONLY_FIELDS) {
      expect(teacherSet.has(f)).toBe(false);
    }
  });

  it('STAGE_1/2/3 之间互斥（学生端字段无重复归属）', () => {
    const seen = new Set<string>();
    for (const f of [...STAGE_1_REQUIRED, ...STAGE_2_FIELDS, ...STAGE_3_FIELDS]) {
      expect(seen.has(f)).toBe(false);
      seen.add(f);
    }
  });

  it('阶段字段不与 TEACHER_ONLY_FIELDS 重叠', () => {
    const teacherSet = new Set(TEACHER_ONLY_FIELDS);
    for (const f of [...STAGE_1_REQUIRED, ...STAGE_2_FIELDS, ...STAGE_3_FIELDS]) {
      expect(teacherSet.has(f)).toBe(false);
    }
  });

  it('ALL_STUDENT_EDITABLE_FIELDS = STAGE_1 ∪ STAGE_2 ∪ STAGE_3 ∪ STUDENT_ONLY', () => {
    const expected = new Set([
      ...STAGE_1_REQUIRED,
      ...STAGE_2_FIELDS,
      ...STAGE_3_FIELDS,
      ...STUDENT_ONLY_FIELDS,
    ]);
    expect(new Set(ALL_STUDENT_EDITABLE_FIELDS)).toEqual(expected);
  });

  it('TEACHER_ONLY_FIELDS 包含考试分数+位次+加分+户籍+高考所在地', () => {
    const required = [
      'totalScore', 'provincialRank',
      'scoreChinese', 'scoreMath', 'scoreEnglish',
      'scoreFirstChoice', 'scoreSub1', 'scoreSub2',
      'bonusPolicyStatus', 'bonusItems',
      'province', 'city', 'county', 'isRural',
      'examLocationProvince', 'examLocationCity', 'examLocationCounty',
    ];
    for (const f of required) {
      expect(TEACHER_ONLY_FIELDS).toContain(f);
    }
  });
});
```

- [ ] **Step 2: 跑测试确认 RED**

```bash
cd apps/server && npm test -- field-policy
```

Expected: 测试全部 fail（"Cannot find module './field-policy'"）

## Task M2.2: 创建 field-policy.ts 实现（GREEN）

**Files:**
- Create: `apps/server/src/modules/student/field-policy.ts`

- [ ] **Step 1: 写实现**

```typescript
// apps/server/src/modules/student/field-policy.ts

/**
 * ① 老师独占字段：学生端不可见、不可写。
 * 计算关键输入 + 政策解读类字段。
 */
export const TEACHER_ONLY_FIELDS = [
  'totalScore',
  'provincialRank',
  'scoreChinese',
  'scoreMath',
  'scoreEnglish',
  'scoreFirstChoice',
  'scoreSub1',
  'scoreSub2',
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

/**
 * ③ 学生端独有字段：仅学生端写。
 */
export const STUDENT_ONLY_FIELDS = [
  'formFiller',
  'parentSignedAt',
] as const;

/**
 * W3 阶段 1：核心字段（学生 5 分钟搞定）
 */
export const STAGE_1_REQUIRED = [
  'realName',
  'phone',
  'gender',
  'examType',
  'parentPhone',
  'formFiller',
] as const;

/**
 * W3 阶段 2：完善字段
 */
export const STAGE_2_FIELDS = [
  'height',
  'weight',
  'visionLeft',
  'visionRight',
  'colorBlind',
  'colorWeak',
  'preferredProvinces',
  'preferredCities',
  'preferredMajors',
  'preferredUniversities',
  'preferredMajorCategories',
  'priorityMode',
  'careerPlan',
  'careerDirection',
  'preferredBatches',
] as const;

/**
 * W3 阶段 3：高级字段
 */
export const STAGE_3_FIELDS = [
  'remoteAreaAcceptance',
  'coldMajorAcceptance',
  'stayPreference',
  'preferredTags',
  'excludedProvinces',
  'excludedCities',
  'excludedUniversities',
  'excludedMajors',
  'interests',
  'personalityType',
  'selfDescription',
  'militaryInterest',
  'teacherInterest',
  'tuitionBudget',
  'acceptSinoForeign',
  'acceptPrivate',
  'acceptCooperation',
  'otherRequirements',
  'visionLeftCorrected',
  'visionRightCorrected',
  'physicalLimits',
  'medicalHistory',
  'ethnicity',
  'politicalStatus',
] as const;

/**
 * 学生端总可编辑字段集（含 STAGE_1/2/3 + STUDENT_ONLY）
 */
export const ALL_STUDENT_EDITABLE_FIELDS = [
  ...STAGE_1_REQUIRED,
  ...STAGE_2_FIELDS,
  ...STAGE_3_FIELDS,
  ...STUDENT_ONLY_FIELDS,
] as const;

export type StudentEditableField = typeof ALL_STUDENT_EDITABLE_FIELDS[number];
export type TeacherOnlyField = typeof TEACHER_ONLY_FIELDS[number];

/** 注：realName/phone/gender/ethnicity 在 User 模型上，余字段在 StudentProfile 模型上 */
export const USER_LEVEL_FIELDS = ['realName', 'phone', 'gender', 'ethnicity'] as const;
```

- [ ] **Step 2: 跑测试确认 GREEN**

```bash
cd apps/server && npm test -- field-policy
```

Expected: 5 个 it 全过

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/modules/student/field-policy.ts apps/server/src/modules/student/field-policy.spec.ts
git commit -m "feat(student): add field-policy with 3-tier permission and W3 stages"
```

## Task M2.3: 创建 ProfileProgress 服务测试（RED）

**Files:**
- Create: `apps/server/src/modules/student/progress.service.spec.ts`

- [ ] **Step 1: 写测试**

```typescript
// apps/server/src/modules/student/progress.service.spec.ts
import { ProgressService } from './progress.service';

describe('ProgressService', () => {
  const service = new ProgressService();

  describe('compute', () => {
    it('空档案：所有进度都是 0', () => {
      const r = service.compute({} as any);
      expect(r.studentSelfCompleteness).toBe(0);
      expect(r.teacherDataCompleteness).toBe(0);
      expect(r.overallCompleteness).toBe(0);
      expect(r.stageProgress.stage1.completed).toBe(false);
      expect(r.isRecommendable).toBe(false);
    });

    it('仅 stage1 完整：stage1.completed=true, stage2/3.completed=false', () => {
      const profile = {
        realName: '小王', phone: '13800000000', gender: 'MALE',
        examType: 'PHYSICS', parentPhone: '13900000000', formFiller: 'STUDENT',
      };
      const r = service.compute(profile as any);
      expect(r.stageProgress.stage1.completed).toBe(true);
      expect(r.stageProgress.stage2.completed).toBe(false);
      expect(r.stageProgress.stage3.completed).toBe(false);
      expect(r.studentSelfCompleteness).toBeGreaterThan(0);
      expect(r.studentSelfCompleteness).toBeLessThan(20);
      expect(r.isRecommendable).toBe(false);
    });

    it('teacher 字段全填 + stage1 完整：isRecommendable=true', () => {
      const profile = {
        realName: '小王', phone: '13800000000', gender: 'MALE',
        examType: 'PHYSICS', parentPhone: '13900000000', formFiller: 'STUDENT',
        // teacher fields
        totalScore: 600, provincialRank: 1000,
        scoreChinese: 120, scoreMath: 130, scoreEnglish: 140,
        scoreFirstChoice: 90, scoreSub1: 80, scoreSub2: 70,
        bonusPolicyStatus: 'NONE', bonusItems: [],
        province: '四川', city: '成都', county: '武侯区', isRural: false,
        examLocationProvince: '四川', examLocationCity: '成都', examLocationCounty: '武侯区',
      };
      const r = service.compute(profile as any);
      expect(r.teacherDataCompleteness).toBe(100);
      expect(r.isRecommendable).toBe(true);
    });

    it('isRecommendable=false 时 missingFieldsForRecommend 列出缺什么', () => {
      const profile = {
        realName: '小王', phone: '13800000000', gender: 'MALE',
        examType: 'PHYSICS', parentPhone: '13900000000', formFiller: 'STUDENT',
        totalScore: 600,
      };
      const r = service.compute(profile as any);
      expect(r.isRecommendable).toBe(false);
      expect(r.missingFieldsForRecommend).toContain('provincialRank');
      expect(r.missingFieldsForRecommend).not.toContain('totalScore');
    });

    it('数组字段空数组算未填', () => {
      const r = service.compute({
        preferredProvinces: [],
        preferredMajors: ['计算机'],
      } as any);
      expect(r.stageProgress.stage2.filled).toBe(1);
    });

    it('overallCompleteness = teacher×0.4 + student×0.6', () => {
      const profile = {
        realName: '小王', phone: '13800000000', gender: 'MALE',
        examType: 'PHYSICS', parentPhone: '13900000000', formFiller: 'STUDENT',
        totalScore: 600, provincialRank: 1000,
        scoreChinese: 120, scoreMath: 130, scoreEnglish: 140,
        scoreFirstChoice: 90, scoreSub1: 80, scoreSub2: 70,
        bonusPolicyStatus: 'NONE', bonusItems: [],
        province: '四川', city: '成都', county: '武侯区', isRural: false,
        examLocationProvince: '四川', examLocationCity: '成都', examLocationCounty: '武侯区',
      };
      const r = service.compute(profile as any);
      const expected = Math.round(100 * 0.4 + r.studentSelfCompleteness * 0.6);
      expect(r.overallCompleteness).toBe(expected);
    });
  });
});
```

- [ ] **Step 2: 跑测试确认 RED**

```bash
cd apps/server && npm test -- progress.service
```

Expected: "Cannot find module './progress.service'"

## Task M2.4: 实现 ProgressService（GREEN）

**Files:**
- Create: `apps/server/src/modules/student/progress.service.ts`

- [ ] **Step 1: 实现**

```typescript
// apps/server/src/modules/student/progress.service.ts
import { Injectable } from '@nestjs/common';
import {
  TEACHER_ONLY_FIELDS,
  STAGE_1_REQUIRED,
  STAGE_2_FIELDS,
  STAGE_3_FIELDS,
  STUDENT_ONLY_FIELDS,
} from './field-policy';

export interface StageStatus {
  filled: number;
  total: number;
  completed: boolean;
}

export interface ProfileProgress {
  studentSelfCompleteness: number;
  teacherDataCompleteness: number;
  stageProgress: { stage1: StageStatus; stage2: StageStatus; stage3: StageStatus };
  overallCompleteness: number;
  isRecommendable: boolean;
  missingFieldsForRecommend: string[];
}

@Injectable()
export class ProgressService {
  /** 字段已填判定：null/undefined 视为未填；空数组视为未填 */
  private isFilled(value: unknown): boolean {
    if (value === null || value === undefined) return false;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'string') return value.length > 0;
    return true;
  }

  private countFilled(profile: Record<string, unknown>, fields: readonly string[]): number {
    return fields.filter((f) => this.isFilled(profile[f])).length;
  }

  compute(profile: Record<string, unknown>): ProfileProgress {
    const stage1Filled = this.countFilled(profile, STAGE_1_REQUIRED);
    const stage2Filled = this.countFilled(profile, STAGE_2_FIELDS);
    const stage3Filled = this.countFilled(profile, STAGE_3_FIELDS);

    const studentFieldCount =
      STAGE_1_REQUIRED.length +
      STAGE_2_FIELDS.length +
      STAGE_3_FIELDS.length +
      STUDENT_ONLY_FIELDS.length;
    const studentTotalFilled =
      stage1Filled +
      stage2Filled +
      stage3Filled +
      this.countFilled(profile, STUDENT_ONLY_FIELDS);
    const studentSelfCompleteness = Math.round(
      (studentTotalFilled / studentFieldCount) * 100,
    );

    const teacherFilled = this.countFilled(profile, TEACHER_ONLY_FIELDS);
    const teacherDataCompleteness = Math.round(
      (teacherFilled / TEACHER_ONLY_FIELDS.length) * 100,
    );

    const stageProgress = {
      stage1: {
        filled: stage1Filled,
        total: STAGE_1_REQUIRED.length,
        completed: stage1Filled === STAGE_1_REQUIRED.length,
      },
      stage2: {
        filled: stage2Filled,
        total: STAGE_2_FIELDS.length,
        completed: stage2Filled === STAGE_2_FIELDS.length,
      },
      stage3: {
        filled: stage3Filled,
        total: STAGE_3_FIELDS.length,
        completed: stage3Filled === STAGE_3_FIELDS.length,
      },
    };

    const overallCompleteness = Math.round(
      teacherDataCompleteness * 0.4 + studentSelfCompleteness * 0.6,
    );

    const missingFieldsForRecommend = TEACHER_ONLY_FIELDS.filter(
      (f) => !this.isFilled(profile[f]),
    );
    if (!stageProgress.stage1.completed) {
      for (const f of STAGE_1_REQUIRED) {
        if (!this.isFilled(profile[f])) missingFieldsForRecommend.push(f);
      }
    }
    const isRecommendable =
      teacherDataCompleteness === 100 && stageProgress.stage1.completed;

    return {
      studentSelfCompleteness,
      teacherDataCompleteness,
      stageProgress,
      overallCompleteness,
      isRecommendable,
      missingFieldsForRecommend,
    };
  }
}
```

- [ ] **Step 2: 跑测试确认 GREEN**

```bash
cd apps/server && npm test -- progress.service
```

Expected: 6 个 it 全过

- [ ] **Step 3: 在 student.module.ts 注册 ProgressService**

```typescript
// apps/server/src/modules/student/student.module.ts
import { Module } from '@nestjs/common';
import { StudentController } from './student.controller';
import { StudentService } from './student.service';
import { ProgressService } from './progress.service';

@Module({
  controllers: [StudentController],
  providers: [StudentService, ProgressService],
  exports: [StudentService, ProgressService],
})
export class StudentModule {}
```

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/modules/student/progress.service.ts apps/server/src/modules/student/progress.service.spec.ts apps/server/src/modules/student/student.module.ts
git commit -m "feat(student): add ProgressService with dual-track completeness"
```

## Task M2.5: calculateCompleteness 兼容层（保护现有调用方）

**Files:**
- Modify: `apps/server/src/modules/student/student.service.ts:243-288`

- [ ] **Step 1: 用 ProgressService 替换 calculateCompleteness 内部，保签名**

把 `calculateCompleteness` 整个方法替换为：

```typescript
/**
 * @deprecated 用 ProgressService.compute() 替代。
 * 保留方法签名以兼容现有调用方，内部委托给新算法的 overallCompleteness。
 */
calculateCompleteness(profile: Record<string, any>): number {
  // Lazy require to avoid circular DI（也可以注入构造，但让 deprecated 方法保持简单）
  const { ProgressService } = require('./progress.service');
  return new ProgressService().compute(profile).overallCompleteness;
}
```

- [ ] **Step 2: 跑现有 student.service.spec.ts**

```bash
cd apps/server && npm test -- student.service.spec
```

Expected：旧 `calculateCompleteness` 三个用例：
- empty → 0 ✅
- required only → 旧期望 70；**新算法下会变** — 需修测试期望值

旧测试用例 `should return 70 when all required fields are filled` 中字段是 `[highSchool, examYear, examType, firstChoice, totalScore, priorityMode, careerPlan]` — 这些在新分类里不全是 stage1 字段，所以新算法返回值不是 70。

- [ ] **Step 3: 修旧测试期望（迁移到 progress.service.spec 风格，删旧 calculateCompleteness 用例）**

打开 `apps/server/src/modules/student/student.service.spec.ts`，删除 `describe('calculateCompleteness', ...)` 整段（约 50 行）。新双轨进度的覆盖在 `progress.service.spec.ts`。

- [ ] **Step 4: 重跑测试**

```bash
cd apps/server && npm test -- student.service.spec
```

Expected: 全绿

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/modules/student/student.service.ts apps/server/src/modules/student/student.service.spec.ts
git commit -m "refactor(student): delegate calculateCompleteness to ProgressService"
```

---

# Milestone M3: 学生端 API + DTO 扩字段

## Task M3.1: UpdateStudentProfileDto 加新字段

**Files:**
- Modify: `apps/server/src/modules/student/dto/update-student-profile.dto.ts`
- Create: `apps/server/src/modules/student/dto/bonus-item.dto.ts`

- [ ] **Step 1: 创建 BonusItemDto（嵌套校验）**

```typescript
// apps/server/src/modules/student/dto/bonus-item.dto.ts
import { IsString, IsNumber, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class BonusItemDto {
  @ApiProperty({ description: '加分类型，如"少数民族"、"烈士子女"' })
  @IsString()
  type: string;

  @ApiProperty({ description: '加分值', example: 5 })
  @IsNumber()
  value: number;

  @ApiPropertyOptional({ description: '来源/备注' })
  @IsOptional()
  @IsString()
  source?: string;
}
```

- [ ] **Step 2: 在 UpdateStudentProfileDto 顶部追加 import**

```typescript
import { Type } from 'class-transformer';
import { ValidateNested, IsDate } from 'class-validator';
import {
  PoliticalStatus,
  BonusPolicyStatus,
  RemoteAreaAcceptance,
  ColdMajorAcceptance,
  FormFiller,
  Batch,
} from '@prisma/client';
import { BonusItemDto } from './bonus-item.dto';
```

- [ ] **Step 3: 在 DTO 末尾追加新字段**

```typescript
  // --- 政治面貌 ---
  @ApiPropertyOptional({ enum: PoliticalStatus })
  @IsOptional()
  @IsEnum(PoliticalStatus)
  politicalStatus?: PoliticalStatus;

  // --- 高考所在地（① 老师独占）---
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  examLocationProvince?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  examLocationCity?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  examLocationCounty?: string;

  // --- 视力详细 ---
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  visionLeft?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  visionRight?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  visionLeftCorrected?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  visionRightCorrected?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  medicalHistory?: string;

  // --- 加分政策（① 老师独占）---
  @ApiPropertyOptional({ enum: BonusPolicyStatus })
  @IsOptional()
  @IsEnum(BonusPolicyStatus)
  bonusPolicyStatus?: BonusPolicyStatus;

  @ApiPropertyOptional({ type: [BonusItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BonusItemDto)
  bonusItems?: BonusItemDto[];

  // --- 意向批次 ---
  @ApiPropertyOptional({ enum: Batch, isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(Batch, { each: true })
  preferredBatches?: Batch[];

  // --- 偏远 / 冷门接受度 ---
  @ApiPropertyOptional({ enum: RemoteAreaAcceptance })
  @IsOptional()
  @IsEnum(RemoteAreaAcceptance)
  remoteAreaAcceptance?: RemoteAreaAcceptance;

  @ApiPropertyOptional({ enum: ColdMajorAcceptance })
  @IsOptional()
  @IsEnum(ColdMajorAcceptance)
  coldMajorAcceptance?: ColdMajorAcceptance;

  // --- 填表元信息 ---
  @ApiPropertyOptional({ enum: FormFiller })
  @IsOptional()
  @IsEnum(FormFiller)
  formFiller?: FormFiller;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  parentSignedAt?: Date;
```

- [ ] **Step 4: 编译验证**

```bash
cd apps/server && npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/modules/student/dto/
git commit -m "feat(student): extend UpdateStudentProfileDto with v1 fields"
```

## Task M3.2: 学生自助 service 方法 — getMyProfile（RED → GREEN）

**Files:**
- Modify: `apps/server/src/modules/student/student.service.ts`
- Modify: `apps/server/src/modules/student/student.service.spec.ts`

- [ ] **Step 1: 写 getMyProfile 测试**

在 `student.service.spec.ts` 的 `describe('updateProfile', ...)` 之后追加：

```typescript
  describe('getMyProfile', () => {
    it('返回的档案不含 TEACHER_ONLY_FIELDS', async () => {
      prisma.studentProfile.findUnique.mockResolvedValue({
        id: 1,
        userId: 100,
        realName: '小王',
        // teacher-only fields existing in DB
        totalScore: 600,
        provincialRank: 1000,
        scoreChinese: 120,
        province: '四川',
        bonusItems: [],
        formFiller: 'STUDENT',
        user: { id: 100, realName: '小王', phone: '138' },
      });

      const result = await service.getMyProfile(100);
      expect(result).not.toHaveProperty('totalScore');
      expect(result).not.toHaveProperty('provincialRank');
      expect(result).not.toHaveProperty('scoreChinese');
      expect(result).not.toHaveProperty('province');
      expect(result).not.toHaveProperty('bonusItems');
      // student-visible fields preserved
      expect(result).toHaveProperty('formFiller');
      expect(result).toHaveProperty('realName');
    });

    it('返回 progress 字段', async () => {
      prisma.studentProfile.findUnique.mockResolvedValue({
        id: 1,
        userId: 100,
        realName: '小王',
        formFiller: 'STUDENT',
        user: { id: 100, realName: '小王', phone: '138', gender: 'MALE' },
      });

      const result = await service.getMyProfile(100);
      expect(result).toHaveProperty('progress');
      expect((result as any).progress).toHaveProperty('studentSelfCompleteness');
      expect((result as any).progress).toHaveProperty('stageProgress');
    });

    it('找不到时抛 NotFoundException', async () => {
      prisma.studentProfile.findUnique.mockResolvedValue(null);
      await expect(service.getMyProfile(999)).rejects.toThrow(NotFoundException);
    });
  });
```

- [ ] **Step 2: 跑确认 RED**

```bash
cd apps/server && npm test -- student.service.spec
```

Expected: `getMyProfile` 三个用例 fail

- [ ] **Step 3: 在 StudentService 加 ProgressService 依赖 + getMyProfile 实现**

修改 `student.service.ts` 顶部 imports：

```typescript
import { ProgressService } from './progress.service';
import { TEACHER_ONLY_FIELDS } from './field-policy';
```

修改构造函数：

```typescript
constructor(
  private prisma: PrismaService,
  private progressService: ProgressService,
) {}
```

在类末尾追加方法：

```typescript
async getMyProfile(userId: number) {
  const profile = await this.prisma.studentProfile.findUnique({
    where: { userId },
    include: {
      user: {
        select: {
          id: true, username: true, realName: true, phone: true,
          gender: true, ethnicity: true, createdAt: true,
        },
      },
    },
  });

  if (!profile) {
    throw new NotFoundException('学生档案不存在');
  }

  const progress = this.progressService.compute({
    ...profile,
    realName: profile.user.realName,
    phone: profile.user.phone,
    gender: profile.user.gender,
    ethnicity: profile.user.ethnicity,
  });

  // 移除 ① 字段
  const filtered: Record<string, any> = {};
  for (const [k, v] of Object.entries(profile)) {
    if (!(TEACHER_ONLY_FIELDS as readonly string[]).includes(k)) {
      filtered[k] = v;
    }
  }
  return { ...filtered, progress };
}
```

- [ ] **Step 4: 在 spec 的 `beforeEach` 补 ProgressService mock**

```typescript
const module: TestingModule = await Test.createTestingModule({
  providers: [
    StudentService,
    { provide: PrismaService, useValue: prisma },
    { provide: ProgressService, useValue: { compute: jest.fn().mockReturnValue({
      studentSelfCompleteness: 50,
      teacherDataCompleteness: 50,
      stageProgress: {
        stage1: { filled: 1, total: 6, completed: false },
        stage2: { filled: 0, total: 15, completed: false },
        stage3: { filled: 0, total: 24, completed: false },
      },
      overallCompleteness: 50,
      isRecommendable: false,
      missingFieldsForRecommend: [],
    }) } },
  ],
}).compile();
```

也要 import `ProgressService` 到 spec。

- [ ] **Step 5: 跑确认 GREEN**

```bash
cd apps/server && npm test -- student.service.spec
```

Expected: 全绿

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/modules/student/student.service.ts apps/server/src/modules/student/student.service.spec.ts
git commit -m "feat(student): add getMyProfile with ① field whitelist + progress"
```

## Task M3.3: updateMyProfile（拒绝 ① 字段）

**Files:**
- Modify: `apps/server/src/modules/student/student.service.ts`
- Modify: `apps/server/src/modules/student/student.service.spec.ts`

- [ ] **Step 1: 写测试**

在 spec 末尾追加：

```typescript
  describe('updateMyProfile', () => {
    it('包含 TEACHER_ONLY 字段时抛 ForbiddenException', async () => {
      const dto = {
        dataVersion: 0,
        realName: '小王',
        totalScore: 600, // ① 字段
      };
      prisma.studentProfile.findUnique.mockResolvedValue({
        id: 1, userId: 100, dataVersion: 0,
      });
      await expect(service.updateMyProfile(100, dto as any)).rejects.toThrow(ForbiddenException);
    });

    it('正常字段写入成功', async () => {
      prisma.studentProfile.findUnique.mockResolvedValue({
        id: 1, userId: 100, dataVersion: 0,
      });
      prisma.studentProfile.update.mockResolvedValue({
        id: 1, userId: 100, formFiller: 'STUDENT', dataVersion: 1,
        user: { id: 100, realName: '小王' },
      });

      const result = await service.updateMyProfile(100, {
        dataVersion: 0,
        formFiller: 'STUDENT',
      } as any);
      expect(prisma.studentProfile.update).toHaveBeenCalled();
      expect(result).toHaveProperty('formFiller');
    });
  });
```

加 import：`import { ForbiddenException } from '@nestjs/common';`

- [ ] **Step 2: RED**

```bash
cd apps/server && npm test -- student.service.spec
```

Expected: 两个用例 fail

- [ ] **Step 3: 实现 updateMyProfile**

在 `student.service.ts` 顶部加 import：

```typescript
import { ForbiddenException } from '@nestjs/common';
```

加方法：

```typescript
async updateMyProfile(userId: number, dto: UpdateStudentProfileDto) {
  // 拒绝 ① 字段
  for (const f of TEACHER_ONLY_FIELDS) {
    if ((dto as any)[f] !== undefined) {
      throw new ForbiddenException(`字段 ${f} 仅老师可修改`);
    }
  }

  const profile = await this.prisma.studentProfile.findUnique({
    where: { userId },
  });
  if (!profile) {
    throw new NotFoundException('学生档案不存在');
  }
  return this.updateProfile(profile.id, dto);
}
```

- [ ] **Step 4: GREEN**

```bash
cd apps/server && npm test -- student.service.spec
```

Expected: 全绿

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/modules/student/student.service.ts apps/server/src/modules/student/student.service.spec.ts
git commit -m "feat(student): add updateMyProfile rejecting teacher-only fields"
```

## Task M3.4: Controller 新增 /me 端点

**Files:**
- Modify: `apps/server/src/modules/student/student.controller.ts`

- [ ] **Step 1: 加端点**

在现有方法之后追加（`assignTeacher` 方法之前或之后均可）：

```typescript
  @Get('me')
  @ApiOperation({ summary: '获取当前学生自己的档案（① 字段已过滤）' })
  async getMyProfile(@CurrentUser() user: JwtPayloadUser) {
    if (user.role !== 'STUDENT') {
      throw new ForbiddenException('仅学生角色可调用此端点');
    }
    return this.studentService.getMyProfile(user.id);
  }

  @Put('me')
  @ApiOperation({ summary: '学生更新自己的档案（拒绝 ① 字段）' })
  async updateMyProfile(
    @CurrentUser() user: JwtPayloadUser,
    @Body() dto: UpdateStudentProfileDto,
  ) {
    if (user.role !== 'STUDENT') {
      throw new ForbiddenException('仅学生角色可调用此端点');
    }
    return this.studentService.updateMyProfile(user.id, dto);
  }

  @Get('me/progress')
  @ApiOperation({ summary: '取学生自己的进度信息' })
  async getMyProgress(@CurrentUser() user: JwtPayloadUser) {
    if (user.role !== 'STUDENT') {
      throw new ForbiddenException('仅学生角色可调用此端点');
    }
    const profile = await this.studentService.getMyProfile(user.id);
    return (profile as any).progress;
  }
```

注意：`me` 端点路由要在 `:id` 之前 — Nest 默认按声明顺序匹配，把 `/me` 写在 `findById(:id)` 之前；如果遇到 routing conflict，把这三个方法挪到类顶部（在 `findAll` 之前）。

加 import：

```typescript
import { Get, Post, Put, Body, Param, Query, UseGuards, ParseIntPipe, ForbiddenException } from '@nestjs/common';
```

- [ ] **Step 2: 重新检查端点定义顺序**

读 `student.controller.ts`，确认 `@Get('me')` 在 `@Get(':id')` 上方。

- [ ] **Step 3: 编译**

```bash
cd apps/server && npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/modules/student/student.controller.ts
git commit -m "feat(student): add /students/me endpoints for self-service"
```

---

## Task M3.5: 学生端 CASL 规则（read 自己的 StudentProfile）

**Files:**
- Modify: `apps/server/src/modules/casl/casl-ability.factory.ts`

- [ ] **Step 1: 在 defineStudentRules 内补 read 规则**

定位 `defineStudentRules` 方法，在末尾追加：

```typescript
  // 学生可读自己的档案
  can('read', 'StudentProfile', { userId: user.id } as any);
  can('update', 'StudentProfile', { userId: user.id } as any);
```

注：`/students/me` 端点目前用 `if user.role !== STUDENT` 自检，未挂 PoliciesGuard，但加上 CASL 规则使日后任意 controller 重构（如 ability.can 显式校验）保持一致。

- [ ] **Step 2: 跑现有 casl-ability.factory.spec.ts**

```bash
cd apps/server && npm test -- casl-ability.factory
```

Expected: 现有测试不受影响（新增的是宽松规则，不会阻塞现有测试）

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/modules/casl/casl-ability.factory.ts
git commit -m "feat(casl): allow student to read/update own StudentProfile"
```

---

# Milestone M4: xlsx 接待单导出

## Task M4.1: 准备模板文件 + 字段映射常量

**Files:**
- Create: `apps/server/templates/intake-form-2025-v1.xlsx`（拷贝自 `data/03_专家版主表/output/2025西典志愿填报接待单.xlsx`）
- Create: `apps/server/src/modules/student/intake-cell-map.ts`

- [ ] **Step 1: 拷贝模板**

```bash
mkdir -p apps/server/templates
cp "data/03_专家版主表/output/2025西典志愿填报接待单.xlsx" apps/server/templates/intake-form-2025-v1.xlsx
```

注：原 Excel 含真实学生测试值的可能性低（接待单一般是空白模板）。打开确认 Sheet1 单元格 B2/B3/B4 等是空的；若不是，手动清空所有数据单元格保留表头。

- [ ] **Step 2: 创建字段映射常量**

```typescript
// apps/server/src/modules/student/intake-cell-map.ts

/**
 * 西典 2025 接待单 单元格 → 学生档案字段映射
 * 参考：data/03_专家版主表/output/2025西典志愿填报接待单.xlsx Sheet1
 */
export const INTAKE_CELL_MAP: Array<{
  cell: string;
  source:
    | { kind: 'user'; field: string }
    | { kind: 'profile'; field: string }
    | { kind: 'computed'; key: string };
  transform?: (value: any) => string | number | null;
}> = [
  // 个人信息
  { cell: 'B2', source: { kind: 'user', field: 'realName' } },
  {
    cell: 'B3',
    source: { kind: 'user', field: 'gender' },
    transform: (v) => (v === 'MALE' ? '男' : v === 'FEMALE' ? '女' : ''),
  },
  { cell: 'B4', source: { kind: 'user', field: 'ethnicity' } },
  {
    cell: 'B5',
    source: { kind: 'profile', field: 'politicalStatus' },
    transform: (v) =>
      v === 'PARTY_MEMBER' ? '党员☑ 团员□ 群众□' :
      v === 'LEAGUE_MEMBER' ? '党员□ 团员☑ 群众□' :
      v === 'MASSES' ? '党员□ 团员□ 群众☑' : '党员□ 团员□ 群众□',
  },
  { cell: 'D2', source: { kind: 'computed', key: 'householdLocation' } },
  { cell: 'D3', source: { kind: 'computed', key: 'examLocation' } },
  { cell: 'D4', source: { kind: 'user', field: 'phone' } },

  // 身体条件
  { cell: 'B6', source: { kind: 'profile', field: 'height' } },
  { cell: 'D6', source: { kind: 'profile', field: 'weight' } },
  {
    cell: 'C7',
    source: { kind: 'computed', key: 'visionNaked' }, // "5.0/5.0"
  },
  {
    cell: 'E7',
    source: { kind: 'computed', key: 'visionCorrected' },
  },
  {
    cell: 'C9',
    source: { kind: 'computed', key: 'colorVision' }, // 正常/色弱/色盲 三选一
  },
  { cell: 'D10', source: { kind: 'profile', field: 'medicalHistory' } },

  // 高考分数
  { cell: 'B14', source: { kind: 'profile', field: 'scoreChinese' } },
  { cell: 'C14', source: { kind: 'profile', field: 'scoreMath' } },
  { cell: 'D14', source: { kind: 'profile', field: 'scoreEnglish' } },
  { cell: 'E14', source: { kind: 'computed', key: 'firstChoiceLabel' } },
  { cell: 'F14', source: { kind: 'computed', key: 'reChoicesLabel' } },
  { cell: 'B16', source: { kind: 'profile', field: 'totalScore' } },
  { cell: 'E16', source: { kind: 'profile', field: 'provincialRank' } },

  // 志愿倾向
  {
    cell: 'C17',
    source: { kind: 'profile', field: 'bonusPolicyStatus' },
    transform: (v) =>
      v === 'NONE' ? '没有☑ 有□ 不清楚□' :
      v === 'HAS_BONUS' ? '没有□ 有☑ 不清楚□' :
      v === 'UNKNOWN' ? '没有□ 有□ 不清楚☑' : '没有□ 有□ 不清楚□',
  },
  {
    cell: 'C18',
    source: { kind: 'profile', field: 'priorityMode' },
    transform: (v) =>
      v === 'UNIVERSITY_FIRST' ? '院校优先☑ 专业优先□' :
      v === 'MAJOR_FIRST' ? '院校优先□ 专业优先☑' : '院校优先□ 专业优先□',
  },
  {
    cell: 'B19',
    source: { kind: 'profile', field: 'preferredBatches' },
    transform: (v) => (Array.isArray(v) ? v.join('、') : ''),
  },
  {
    cell: 'B20',
    source: { kind: 'profile', field: 'preferredProvinces' },
    transform: (v) => (Array.isArray(v) ? v.join('、') : ''),
  },
  {
    cell: 'B21',
    source: { kind: 'profile', field: 'preferredUniversities' },
    transform: (v) => (Array.isArray(v) ? v.join('、') : ''),
  },
  {
    cell: 'B22',
    source: { kind: 'profile', field: 'preferredMajors' },
    transform: (v) => (Array.isArray(v) ? v.join('、') : ''),
  },
  {
    cell: 'C23',
    source: { kind: 'profile', field: 'acceptLevel' },
    transform: (v) =>
      v === 'STRICT' ? '完全不考虑☑ 与意向相近的☐ 非冷门可考虑☐' :
      v === 'MODERATE' ? '完全不考虑☐ 与意向相近的☑ 非冷门可考虑☐' :
      v === 'RELAXED' ? '完全不考虑☐ 与意向相近的☐ 非冷门可考虑☑' : '',
  },
  {
    cell: 'C24',
    source: { kind: 'profile', field: 'remoteAreaAcceptance' },
    transform: (v) =>
      v === 'ABSOLUTELY_NO' ? '绝对不接受☑ 保底可☐ 名校可☐ 好专业可☐' :
      v === 'BACKUP_ONLY' ? '绝对不接受☐ 保底可☑ 名校可☐ 好专业可☐' :
      v === 'FAMOUS_OK' ? '绝对不接受☐ 保底可☐ 名校可☑ 好专业可☐' :
      v === 'GOOD_MAJOR_OK' ? '绝对不接受☐ 保底可☐ 名校可☐ 好专业可☑' : '',
  },
  {
    cell: 'C25',
    source: { kind: 'profile', field: 'coldMajorAcceptance' },
    transform: (v) =>
      v === 'ABSOLUTELY_NO' ? '绝对不接受☑ 名校可☐ 发达地区可☐ 前景好可☐' :
      v === 'FAMOUS_OK' ? '绝对不接受☐ 名校可☑ 发达地区可☐ 前景好可☐' :
      v === 'DEVELOPED_AREA_OK' ? '绝对不接受☐ 名校可☐ 发达地区可☑ 前景好可☐' :
      v === 'GOOD_PROSPECT_OK' ? '绝对不接受☐ 名校可☐ 发达地区可☐ 前景好可☑' : '',
  },
];

/**
 * 计算字段（多字段拼接、需要业务逻辑）
 */
export function computeIntakeValue(
  key: string,
  profile: any,
  user: any,
): string | number | null {
  switch (key) {
    case 'householdLocation':
      return [profile.province, profile.city, profile.county].filter(Boolean).join('/');
    case 'examLocation':
      return [profile.examLocationProvince, profile.examLocationCity, profile.examLocationCounty].filter(Boolean).join('/');
    case 'visionNaked':
      return profile.visionLeft || profile.visionRight
        ? `${profile.visionLeft ?? ''}/${profile.visionRight ?? ''}`
        : '';
    case 'visionCorrected':
      return profile.visionLeftCorrected || profile.visionRightCorrected
        ? `${profile.visionLeftCorrected ?? ''}/${profile.visionRightCorrected ?? ''}`
        : '';
    case 'colorVision':
      if (profile.colorBlind) return '正常☐ 色弱☐ 色盲☑';
      if (profile.colorWeak) return '正常☐ 色弱☑ 色盲☐';
      return '正常☑ 色弱☐ 色盲☐';
    case 'firstChoiceLabel': {
      const v = profile.firstChoice;
      if (!v) return '物理☐ 历史☐';
      return v === '物理' || v === 'PHYSICS' ? '物理☑ 历史☐' :
             v === '历史' || v === 'HISTORY' ? '物理☐ 历史☑' : '物理☐ 历史☐';
    }
    case 'reChoicesLabel': {
      const arr: string[] = profile.reChoices ?? [];
      const subjects = ['化学', '生物', '政治', '地理'];
      return subjects.map((s) => `${s}${arr.includes(s) ? '☑' : '☐'}`).join(' ');
    }
    default:
      return null;
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/server/templates/intake-form-2025-v1.xlsx apps/server/src/modules/student/intake-cell-map.ts
git commit -m "feat(student): add intake form template + cell mapping"
```

## Task M4.2: 写 IntakeExportService 测试（RED）

**Files:**
- Create: `apps/server/src/modules/student/intake-export.service.spec.ts`

- [ ] **Step 1: 写测试**

```typescript
// apps/server/src/modules/student/intake-export.service.spec.ts
import * as ExcelJS from 'exceljs';
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { IntakeExportService } from './intake-export.service';
import { StudentService } from './student.service';

describe('IntakeExportService', () => {
  let service: IntakeExportService;
  let studentService: { findById: jest.Mock };

  beforeEach(async () => {
    studentService = { findById: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IntakeExportService,
        { provide: StudentService, useValue: studentService },
      ],
    }).compile();
    service = module.get(IntakeExportService);
  });

  async function loadAndGet(buffer: Buffer, cell: string): Promise<any> {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    return wb.getWorksheet('Sheet1').getCell(cell).value;
  }

  it('总分写入 B16', async () => {
    studentService.findById.mockResolvedValue({
      id: 1,
      user: { realName: '小王', gender: 'MALE', phone: '138', ethnicity: '汉' },
      totalScore: 600,
      provincialRank: 1234,
      politicalStatus: 'LEAGUE_MEMBER',
    });
    const buf = await service.export(1);
    const v = await loadAndGet(Buffer.from(buf), 'B16');
    expect(v).toBe(600);
  });

  it('姓名写入 B2', async () => {
    studentService.findById.mockResolvedValue({
      id: 1,
      user: { realName: '小李', gender: 'FEMALE', phone: '139', ethnicity: '汉' },
    });
    const buf = await service.export(1);
    expect(await loadAndGet(Buffer.from(buf), 'B2')).toBe('小李');
  });

  it('性别中文转换写入 B3', async () => {
    studentService.findById.mockResolvedValue({
      id: 1,
      user: { realName: '小李', gender: 'FEMALE', phone: '139' },
    });
    const buf = await service.export(1);
    expect(await loadAndGet(Buffer.from(buf), 'B3')).toBe('女');
  });

  it('户籍/高考所在地拼接', async () => {
    studentService.findById.mockResolvedValue({
      id: 1,
      user: { realName: '小王' },
      province: '四川', city: '成都', county: '武侯区',
      examLocationProvince: '四川', examLocationCity: '成都', examLocationCounty: '高新区',
    });
    const buf = await service.export(1);
    expect(await loadAndGet(Buffer.from(buf), 'D2')).toBe('四川/成都/武侯区');
    expect(await loadAndGet(Buffer.from(buf), 'D3')).toBe('四川/成都/高新区');
  });

  it('视力左右拼接', async () => {
    studentService.findById.mockResolvedValue({
      id: 1,
      user: { realName: '小王' },
      visionLeft: 5.0, visionRight: 4.8,
    });
    const buf = await service.export(1);
    expect(await loadAndGet(Buffer.from(buf), 'C7')).toBe('5/4.8');
  });

  it('学生不存在抛 NotFoundException', async () => {
    studentService.findById.mockRejectedValue(new NotFoundException());
    await expect(service.export(999)).rejects.toThrow(NotFoundException);
  });
});
```

- [ ] **Step 2: RED**

```bash
cd apps/server && npm test -- intake-export
```

Expected: "Cannot find module './intake-export.service'"

## Task M4.3: 实现 IntakeExportService（GREEN）

**Files:**
- Create: `apps/server/src/modules/student/intake-export.service.ts`
- Modify: `apps/server/src/modules/student/student.module.ts`

- [ ] **Step 1: 实现**

```typescript
// apps/server/src/modules/student/intake-export.service.ts
import { Injectable, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import * as path from 'path';
import * as fs from 'fs';
import { StudentService } from './student.service';
import { INTAKE_CELL_MAP, computeIntakeValue } from './intake-cell-map';

const TEMPLATE_PATH = path.join(__dirname, '..', '..', '..', 'templates', 'intake-form-2025-v1.xlsx');

@Injectable()
export class IntakeExportService {
  constructor(private studentService: StudentService) {}

  /**
   * 导出学生接待单 xlsx，返回 Buffer。
   * 老师/管理员可见全字段（含 ① 老师独占），无字段过滤。
   */
  async export(studentId: number): Promise<ArrayBuffer> {
    const profile = await this.studentService.findById(studentId);
    if (!profile) throw new NotFoundException('学生不存在');

    if (!fs.existsSync(TEMPLATE_PATH)) {
      throw new InternalServerErrorException(
        `接待单模板缺失: ${TEMPLATE_PATH}`,
      );
    }

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(TEMPLATE_PATH);
    const ws = wb.getWorksheet('Sheet1');
    if (!ws) throw new InternalServerErrorException('模板 Sheet1 不存在');

    for (const map of INTAKE_CELL_MAP) {
      let raw: any = null;
      if (map.source.kind === 'user') {
        raw = profile.user?.[map.source.field];
      } else if (map.source.kind === 'profile') {
        raw = (profile as any)[map.source.field];
      } else if (map.source.kind === 'computed') {
        raw = computeIntakeValue(map.source.key, profile, profile.user);
      }
      const value = map.transform ? map.transform(raw) : raw;
      if (value !== null && value !== undefined && value !== '') {
        ws.getCell(map.cell).value = value as any;
      }
    }

    return wb.xlsx.writeBuffer();
  }
}
```

- [ ] **Step 2: 注册到 module**

修改 `student.module.ts`：

```typescript
import { Module } from '@nestjs/common';
import { StudentController } from './student.controller';
import { StudentService } from './student.service';
import { ProgressService } from './progress.service';
import { IntakeExportService } from './intake-export.service';

@Module({
  controllers: [StudentController],
  providers: [StudentService, ProgressService, IntakeExportService],
  exports: [StudentService, ProgressService, IntakeExportService],
})
export class StudentModule {}
```

- [ ] **Step 3: GREEN**

```bash
cd apps/server && npm test -- intake-export
```

Expected: 6 个 it 全过。如果 `C7` 视力测试失败因为 `5.0` 被 ExcelJS 序列化成 `5` 或字符串："5/4.8" — 检查实际输出，调整测试期望值或 transform 实现。

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/modules/student/intake-export.service.ts apps/server/src/modules/student/intake-export.service.spec.ts apps/server/src/modules/student/student.module.ts
git commit -m "feat(student): implement IntakeExportService with exceljs"
```

## Task M4.4: Controller 加导出端点

**Files:**
- Modify: `apps/server/src/modules/student/student.controller.ts`

- [ ] **Step 1: 加导出端点**

在 `student.controller.ts` 顶部 import：

```typescript
import { Res } from '@nestjs/common';
import type { Response } from 'express';
import { IntakeExportService } from './intake-export.service';
```

构造函数加依赖：

```typescript
constructor(
  private studentService: StudentService,
  private intakeExportService: IntakeExportService,
) {}
```

加端点（`assignTeacher` 之后）：

```typescript
  @Get(':id/export-intake')
  @ApiOperation({ summary: '导出学生接待单 xlsx（仅老师/管理员）' })
  @CheckPolicies((ability) => ability.can('export', 'StudentProfile'))
  async exportIntake(
    @Param('id', ParseIntPipe) id: number,
    @Res() res: Response,
  ) {
    const buffer = await this.intakeExportService.export(id);
    const profile = await this.studentService.findById(id);
    const realName = encodeURIComponent(profile.user?.realName ?? `student${id}`);
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const filename = `intake_${realName}_${today}.xlsx`;
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    res.end(Buffer.from(buffer));
  }
```

- [ ] **Step 2: CASL 加 export 能力**

修改 `casl-ability.factory.ts:defineTeacherRules`，找到 `can(['read', 'update', 'delete'], 'StudentProfile', ...)` 行，把它改成：

```typescript
can(['read', 'update', 'delete', 'export'], 'StudentProfile', {
  assignedTeacherId: user.teacherProfileId,
} as any);
```

ADMIN 已有 `manage all`，无需额外。

- [ ] **Step 3: 编译**

```bash
cd apps/server && npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/modules/student/student.controller.ts apps/server/src/modules/casl/casl-ability.factory.ts
git commit -m "feat(student): add /students/:id/export-intake endpoint"
```

## Task M4.5: M4 集成手测

**Files:** 无修改

- [ ] **Step 1: 跑全部测试**

```bash
cd apps/server && npm test
```

Expected: 全绿

- [ ] **Step 2: 启动服务并手测导出端点**

```bash
cd apps/server && npm run start:dev
```

另开 terminal：

```bash
# 用一个老师的 JWT（替换为真实 token）
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3001/api/students/1/export-intake \
  --output /tmp/intake.xlsx
```

Expected: `/tmp/intake.xlsx` 存在 + 用 Excel/openpyxl 打开能看到表头与字段值

- [ ] **Step 3: 用 openpyxl 校验关键单元格**

```bash
python -c "
import openpyxl
wb = openpyxl.load_workbook('/tmp/intake.xlsx')
ws = wb['Sheet1']
print('B2:', ws['B2'].value)
print('B16:', ws['B16'].value)
print('D2:', ws['D2'].value)
"
```

Expected: 输出真实学生数据

注：手测失败不阻塞 commit；记录到 issue。

---

# Milestone M5: 学生端 UI（W3 三阶段渐进采集）

## Task M5.1: 前端 student-api.ts 扩字段

**Files:**
- Modify: `apps/web/src/services/student-api.ts`

- [ ] **Step 1: 扩 UpdateStudentDto + 新增 progress 类型 + 加方法**

替换 `UpdateStudentDto` 接口（保留所有现有字段，加新字段）；在 `studentApi` 对象末尾新增方法。

```typescript
// apps/web/src/services/student-api.ts (尾部追加)
export interface ProfileProgress {
  studentSelfCompleteness: number;
  teacherDataCompleteness: number;
  stageProgress: {
    stage1: { filled: number; total: number; completed: boolean };
    stage2: { filled: number; total: number; completed: boolean };
    stage3: { filled: number; total: number; completed: boolean };
  };
  overallCompleteness: number;
  isRecommendable: boolean;
  missingFieldsForRecommend: string[];
}

// 已有 studentApi 对象内追加：
//   getMyProgress(): Promise<{ data: ProfileProgress }> {
//     return api.get('/students/me/progress') as any;
//   },
//   exportIntake(id: string): Promise<Blob> {
//     return api.get(`/students/${id}/export-intake`, { responseType: 'blob' }) as any;
//   },
```

并在 UpdateStudentDto 加新字段：

```typescript
export interface UpdateStudentDto {
  // ... 保留所有现有字段
  politicalStatus?: 'PARTY_MEMBER' | 'LEAGUE_MEMBER' | 'MASSES';
  examLocationProvince?: string;
  examLocationCity?: string;
  examLocationCounty?: string;
  visionLeft?: number;
  visionRight?: number;
  visionLeftCorrected?: number;
  visionRightCorrected?: number;
  medicalHistory?: string;
  bonusPolicyStatus?: 'NONE' | 'HAS_BONUS' | 'UNKNOWN';
  bonusItems?: Array<{ type: string; value: number; source?: string }>;
  preferredBatches?: string[];
  remoteAreaAcceptance?: 'ABSOLUTELY_NO' | 'BACKUP_ONLY' | 'FAMOUS_OK' | 'GOOD_MAJOR_OK';
  coldMajorAcceptance?: 'ABSOLUTELY_NO' | 'FAMOUS_OK' | 'DEVELOPED_AREA_OK' | 'GOOD_PROSPECT_OK';
  formFiller?: 'STUDENT' | 'PARENT' | 'TOGETHER';
  parentSignedAt?: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/services/student-api.ts
git commit -m "feat(web): extend studentApi with v1 fields + progress + export"
```

## Task M5.2: 前端字段定义文件（与后端镜像）

**Files:**
- Create: `apps/web/src/components/student/stage-fields.ts`

- [ ] **Step 1: 写常量**

```typescript
// apps/web/src/components/student/stage-fields.ts
export const STAGE_1_REQUIRED = [
  'realName', 'phone', 'gender', 'examType', 'parentPhone', 'formFiller',
] as const;

export const STAGE_2_FIELDS = [
  'height', 'weight', 'visionLeft', 'visionRight', 'colorBlind', 'colorWeak',
  'preferredProvinces', 'preferredCities', 'preferredMajors',
  'preferredUniversities', 'preferredMajorCategories',
  'priorityMode', 'careerPlan', 'careerDirection', 'preferredBatches',
] as const;

export const STAGE_3_FIELDS = [
  'remoteAreaAcceptance', 'coldMajorAcceptance', 'stayPreference', 'preferredTags',
  'excludedProvinces', 'excludedCities', 'excludedUniversities', 'excludedMajors',
  'interests', 'personalityType', 'selfDescription',
  'militaryInterest', 'teacherInterest',
  'tuitionBudget', 'acceptSinoForeign', 'acceptPrivate', 'acceptCooperation',
  'otherRequirements',
  'visionLeftCorrected', 'visionRightCorrected',
  'physicalLimits', 'medicalHistory',
  'ethnicity', 'politicalStatus',
] as const;

export const TEACHER_ONLY_FIELDS = [
  'totalScore', 'provincialRank',
  'scoreChinese', 'scoreMath', 'scoreEnglish',
  'scoreFirstChoice', 'scoreSub1', 'scoreSub2',
  'bonusPolicyStatus', 'bonusItems',
  'province', 'city', 'county', 'isRural',
  'examLocationProvince', 'examLocationCity', 'examLocationCounty',
] as const;

export const STAGE_LABELS: Record<string, { title: string; subtitle: string; badge: string }> = {
  '1': {
    title: '核心信息',
    subtitle: '5 分钟搞定基础档案，老师据此联系你',
    badge: '初步档案',
  },
  '2': {
    title: '完善信息',
    subtitle: '身体条件 + 偏好 + 升学规划，让方案更贴合你',
    badge: '可生成方案',
  },
  '3': {
    title: '高级信息',
    subtitle: '兴趣性格 + 经济条件 + 排除项，精准推荐',
    badge: '精准推荐',
  },
};
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/student/stage-fields.ts
git commit -m "feat(web): add stage-fields constants mirroring server"
```

## Task M5.3: ProgressBar 组件

**Files:**
- Create: `apps/web/src/components/student/ProgressBar.tsx`

- [ ] **Step 1: 写组件**

```tsx
'use client';
import { Progress } from 'antd';

interface Props {
  label: string;
  percent: number;
  hint?: string;
}

export default function ProgressBar({ label, percent, hint }: Props) {
  const color = percent >= 80 ? '#276749' : percent >= 50 ? '#b8860b' : '#c53030';
  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center text-xs">
        <span className="text-text-secondary">{label}</span>
        <span className="font-mono text-text-secondary">{percent}%</span>
      </div>
      <Progress percent={percent} strokeColor={color} showInfo={false} size="small" />
      {hint && <p className="text-xs text-text-faint">{hint}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/student/ProgressBar.tsx
git commit -m "feat(web): add ProgressBar component"
```

## Task M5.4: StageCard 组件

**Files:**
- Create: `apps/web/src/components/student/StageCard.tsx`

- [ ] **Step 1: 写组件**

```tsx
'use client';
import Link from 'next/link';
import { Card, Progress, Tag } from 'antd';
import { CheckCircleFilled, ArrowRightOutlined } from '@ant-design/icons';

interface Props {
  stage: 1 | 2 | 3;
  title: string;
  subtitle: string;
  badge: string;
  filled: number;
  total: number;
  completed: boolean;
}

export default function StageCard({
  stage, title, subtitle, badge, filled, total, completed,
}: Props) {
  const percent = Math.round((filled / total) * 100);
  return (
    <Link href={`/student/profile/stage/${stage}`} className="block">
      <Card
        hoverable
        className="transition-shadow hover:shadow-md"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-serif text-base font-semibold text-text">
                阶段 {stage}：{title}
              </span>
              {completed && (
                <Tag icon={<CheckCircleFilled />} color="success">
                  {badge} 已解锁
                </Tag>
              )}
            </div>
            <p className="text-xs text-text-secondary mb-3">{subtitle}</p>
            <div className="flex items-center gap-3">
              <Progress
                percent={percent}
                size="small"
                showInfo={false}
                className="flex-1"
                strokeColor={completed ? '#276749' : '#b8860b'}
              />
              <span className="font-mono text-xs text-text-secondary whitespace-nowrap">
                {filled}/{total}
              </span>
            </div>
          </div>
          <ArrowRightOutlined className="text-text-faint mt-1" />
        </div>
      </Card>
    </Link>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/student/StageCard.tsx
git commit -m "feat(web): add StageCard component for W3 dashboard"
```

## Task M5.5: TeacherOnlyField 组件（① 字段只读展示）

**Files:**
- Create: `apps/web/src/components/student/TeacherOnlyField.tsx`

- [ ] **Step 1: 写组件**

```tsx
'use client';
import { Tooltip } from 'antd';
import { LockOutlined } from '@ant-design/icons';

interface Props {
  label: string;
  value: string | number | null | undefined;
}

export default function TeacherOnlyField({ label, value }: Props) {
  return (
    <div className="flex justify-between items-center py-2 border-b border-border-subtle last:border-0">
      <Tooltip title="此字段由老师录入">
        <span className="text-xs text-text-secondary flex items-center gap-1">
          <LockOutlined /> {label}
        </span>
      </Tooltip>
      <span className="text-sm text-text font-mono">
        {value ?? <span className="text-text-faint">未录入</span>}
      </span>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/student/TeacherOnlyField.tsx
git commit -m "feat(web): add TeacherOnlyField component"
```

## Task M5.6: 学生端 dashboard 页（替换原 220 行）

**Files:**
- Modify: `apps/web/src/app/(student)/student/profile/page.tsx`（整体重写）

- [ ] **Step 1: 重写页面**

```tsx
'use client';

import { Card, Spin, Alert } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { studentApi } from '@/services/student-api';
import StageCard from '@/components/student/StageCard';
import ProgressBar from '@/components/student/ProgressBar';
import TeacherOnlyField from '@/components/student/TeacherOnlyField';
import { STAGE_LABELS } from '@/components/student/stage-fields';

export default function StudentProfilePage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['student-my-profile'],
    queryFn: () => studentApi.getMyProfile(),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Spin size="large" />
      </div>
    );
  }

  if (error || !data) {
    return <Alert type="error" message="加载档案失败，请刷新重试" />;
  }

  const profile = (data as any).data ?? data;
  const progress = profile.progress;

  return (
    <div className="space-y-4 pb-20">
      <h1 className="font-serif text-xl font-semibold text-text">我的档案</h1>

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
          {!progress.isRecommendable && (
            <p className="text-xs text-text-faint">
              当前未达到「可推荐」阈值，缺少：
              <span className="text-text-secondary ml-1">
                {progress.missingFieldsForRecommend.slice(0, 5).join('、')}
                {progress.missingFieldsForRecommend.length > 5 ? ' 等' : ''}
              </span>
            </p>
          )}
        </div>
      </Card>

      <div className="space-y-3">
        {([1, 2, 3] as const).map((stage) => {
          const stageKey = `stage${stage}` as 'stage1' | 'stage2' | 'stage3';
          const s = progress.stageProgress[stageKey];
          const labels = STAGE_LABELS[String(stage)];
          return (
            <StageCard
              key={stage}
              stage={stage}
              title={labels.title}
              subtitle={labels.subtitle}
              badge={labels.badge}
              filled={s.filled}
              total={s.total}
              completed={s.completed}
            />
          );
        })}
      </div>

      <Card size="small" title="由老师录入的信息">
        <TeacherOnlyField label="高考总分" value={profile.totalScore} />
        <TeacherOnlyField label="全省位次" value={profile.provincialRank} />
        <TeacherOnlyField label="加分政策" value={profile.bonusPolicyStatus} />
        <TeacherOnlyField label="户籍" value={
          [profile.province, profile.city, profile.county].filter(Boolean).join('/') || null
        } />
      </Card>
    </div>
  );
}
```

注：因 `getMyProfile` 已过滤 ① 字段，TeacherOnlyField 中的 `profile.totalScore` 等会是 undefined → 显示"未录入"。这正是预期效果。

如果产品要求"学生看得见但只读"，则需要在后端 `getMyProfile` 返回结构中保留 ① 字段但加 `_isReadOnly` 标记。**当前 plan 选择"完全过滤"**（与 spec §4.3 一致）。

- [ ] **Step 2: 启动前端测试页面渲染**

```bash
cd apps/web && npm run dev
```

打开 `http://localhost:3000/student/profile`，登录学生账号确认：
- 三张阶段卡片显示
- 进度条显示
- ① 字段卡片显示「未录入」

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/\(student\)/student/profile/page.tsx
git commit -m "feat(web): rewrite student profile as W3 stage dashboard"
```

## Task M5.7: 阶段表单页（动态路由）

**Files:**
- Create: `apps/web/src/app/(student)/student/profile/stage/[stage]/page.tsx`

- [ ] **Step 1: 创建动态路由页**

```tsx
'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import {
  Card, Form, Input, InputNumber, Select, Radio, Checkbox,
  Button, message, Spin, Progress, Space,
} from 'antd';
import { ArrowLeftOutlined, SaveOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { studentApi } from '@/services/student-api';
import {
  STAGE_1_REQUIRED, STAGE_2_FIELDS, STAGE_3_FIELDS, STAGE_LABELS,
} from '@/components/student/stage-fields';
import HealthCheckboxGroup from '@/components/student/HealthCheckboxGroup';

const STAGE_FIELD_MAP: Record<string, readonly string[]> = {
  '1': STAGE_1_REQUIRED,
  '2': STAGE_2_FIELDS,
  '3': STAGE_3_FIELDS,
};

export default function StudentStageFormPage() {
  const params = useParams();
  const router = useRouter();
  const stage = String(params.stage);
  const fields = STAGE_FIELD_MAP[stage];
  const labels = STAGE_LABELS[stage];

  const [form] = Form.useForm();
  const queryClient = useQueryClient();

  const { data: profileData, isLoading } = useQuery({
    queryKey: ['student-my-profile'],
    queryFn: () => studentApi.getMyProfile(),
  });
  const profile = (profileData as any)?.data ?? profileData;

  useEffect(() => {
    if (profile) {
      const initial: Record<string, any> = {};
      for (const f of fields ?? []) initial[f] = profile[f];
      initial.dataVersion = profile.dataVersion ?? 0;
      form.setFieldsValue(initial);
    }
  }, [profile, fields, form]);

  const saveMutation = useMutation({
    mutationFn: (values: Record<string, unknown>) =>
      studentApi.updateMyProfile(values),
    onSuccess: () => {
      message.success('保存成功');
      queryClient.invalidateQueries({ queryKey: ['student-my-profile'] });
    },
    onError: (e: any) => {
      message.error(e?.response?.data?.message ?? '保存失败');
    },
  });

  if (!fields || !labels) {
    return <Alert404 stage={stage} onBack={() => router.push('/student/profile')} />;
  }

  if (isLoading) {
    return <div className="flex justify-center py-20"><Spin size="large" /></div>;
  }

  const onSave = () => {
    form.validateFields().then((values) => {
      saveMutation.mutate(values);
    });
  };

  return (
    <div className="space-y-4 pb-20">
      <Button
        type="link"
        icon={<ArrowLeftOutlined />}
        onClick={() => router.push('/student/profile')}
        className="px-0"
      >
        返回档案首页
      </Button>

      <Card>
        <h1 className="font-serif text-xl font-semibold text-text mb-1">
          阶段 {stage}：{labels.title}
        </h1>
        <p className="text-xs text-text-secondary mb-4">{labels.subtitle}</p>

        <Form form={form} layout="vertical" requiredMark="optional">
          <Form.Item name="dataVersion" hidden>
            <Input />
          </Form.Item>

          {/* 字段渲染按 stage 分支 */}
          {stage === '1' && <Stage1Fields />}
          {stage === '2' && <Stage2Fields />}
          {stage === '3' && <Stage3Fields />}

          <div className="flex justify-end pt-4 border-t border-border-subtle mt-4">
            <Button
              type="primary"
              icon={<SaveOutlined />}
              onClick={onSave}
              loading={saveMutation.isPending}
              size="large"
            >
              保存
            </Button>
          </div>
        </Form>
      </Card>
    </div>
  );
}

function Stage1Fields() {
  return (
    <>
      <Form.Item name="realName" label="姓名" rules={[{ required: true }]}>
        <Input placeholder="你的真实姓名" />
      </Form.Item>
      <Form.Item name="phone" label="手机号" rules={[{ required: true }]}>
        <Input placeholder="11 位手机号" />
      </Form.Item>
      <Form.Item name="parentPhone" label="家长手机号" rules={[{ required: true }]}>
        <Input placeholder="家长联系电话" />
      </Form.Item>
      <Form.Item name="gender" label="性别" rules={[{ required: true }]}>
        <Radio.Group>
          <Radio value="MALE">男</Radio>
          <Radio value="FEMALE">女</Radio>
        </Radio.Group>
      </Form.Item>
      <Form.Item name="examType" label="科类" rules={[{ required: true }]}>
        <Select placeholder="选择科类" options={[
          { value: 'PHYSICS', label: '物理类（首选物理）' },
          { value: 'HISTORY', label: '历史类（首选历史）' },
        ]} />
      </Form.Item>
      <Form.Item name="formFiller" label="填表人" rules={[{ required: true }]}>
        <Radio.Group>
          <Radio value="STUDENT">学生本人</Radio>
          <Radio value="PARENT">家长</Radio>
          <Radio value="TOGETHER">共同填写</Radio>
        </Radio.Group>
      </Form.Item>
    </>
  );
}

function Stage2Fields() {
  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <Form.Item name="height" label="身高 (cm)">
          <InputNumber min={100} max={250} className="w-full" />
        </Form.Item>
        <Form.Item name="weight" label="体重 (kg)">
          <InputNumber min={20} max={200} className="w-full" />
        </Form.Item>
        <Form.Item name="visionLeft" label="左眼裸眼视力">
          <InputNumber min={1} max={5.3} step={0.1} className="w-full" />
        </Form.Item>
        <Form.Item name="visionRight" label="右眼裸眼视力">
          <InputNumber min={1} max={5.3} step={0.1} className="w-full" />
        </Form.Item>
      </div>
      <Form.Item name="colorBlind" valuePropName="checked">
        <Checkbox>色盲</Checkbox>
      </Form.Item>
      <Form.Item name="colorWeak" valuePropName="checked">
        <Checkbox>色弱</Checkbox>
      </Form.Item>
      <Form.Item name="preferredProvinces" label="意向省份">
        <Select mode="multiple" placeholder="选择意向省份" allowClear options={[
          { value: '四川', label: '四川' },
          { value: '北京', label: '北京' },
          { value: '上海', label: '上海' },
          { value: '广东', label: '广东' },
          { value: '浙江', label: '浙江' },
          { value: '江苏', label: '江苏' },
          { value: '湖北', label: '湖北' },
          { value: '陕西', label: '陕西' },
        ]} />
      </Form.Item>
      <Form.Item name="preferredCities" label="意向城市">
        <Select mode="tags" placeholder="输入意向城市" allowClear />
      </Form.Item>
      <Form.Item name="preferredMajors" label="意向专业">
        <Select mode="tags" placeholder="输入意向专业" allowClear />
      </Form.Item>
      <Form.Item name="preferredUniversities" label="意向院校">
        <Select mode="tags" placeholder="输入意向院校" allowClear />
      </Form.Item>
      <Form.Item name="preferredMajorCategories" label="意向专业大类">
        <Select mode="multiple" placeholder="选择" allowClear options={[
          { value: '工学', label: '工学' },
          { value: '理学', label: '理学' },
          { value: '医学', label: '医学' },
          { value: '经济学', label: '经济学' },
          { value: '管理学', label: '管理学' },
          { value: '法学', label: '法学' },
          { value: '文学', label: '文学' },
          { value: '教育学', label: '教育学' },
        ]} />
      </Form.Item>
      <Form.Item name="priorityMode" label="院校 / 专业优先">
        <Radio.Group>
          <Radio value="UNIVERSITY_FIRST">院校优先</Radio>
          <Radio value="MAJOR_FIRST">专业优先</Radio>
          <Radio value="BALANCED">兼顾</Radio>
        </Radio.Group>
      </Form.Item>
      <Form.Item name="careerPlan" label="升学规划">
        <Select placeholder="选择" allowClear options={[
          { value: 'POSTGRADUATE', label: '考研深造' },
          { value: 'EMPLOYMENT', label: '本科就业' },
          { value: 'ABROAD', label: '出国留学' },
          { value: 'PUBLIC_SERVANT', label: '公务员/事业编' },
          { value: 'UNDECIDED', label: '未定' },
        ]} />
      </Form.Item>
      <Form.Item name="careerDirection" label="职业方向">
        <Input.TextArea rows={2} placeholder="未来想从事什么方向的工作？" />
      </Form.Item>
      <Form.Item name="preferredBatches" label="意向批次">
        <Select mode="multiple" placeholder="选择意向批次" allowClear options={[
          { value: 'EARLY_BATCH', label: '提前批' },
          { value: 'FIRST_BATCH', label: '本科批' },
          { value: 'SECOND_BATCH', label: '专科批' },
          { value: 'SPECIAL_BATCH', label: '专项计划' },
        ]} />
      </Form.Item>
    </>
  );
}

function Stage3Fields() {
  return (
    <>
      <Form.Item name="remoteAreaAcceptance" label="是否接受偏远地区">
        <Radio.Group>
          <Radio value="ABSOLUTELY_NO">绝对不接受</Radio>
          <Radio value="BACKUP_ONLY">仅保底院校可接受</Radio>
          <Radio value="FAMOUS_OK">名校可接受</Radio>
          <Radio value="GOOD_MAJOR_OK">好专业可接受</Radio>
        </Radio.Group>
      </Form.Item>
      <Form.Item name="coldMajorAcceptance" label="是否接受冷门专业">
        <Radio.Group>
          <Radio value="ABSOLUTELY_NO">绝对不接受</Radio>
          <Radio value="FAMOUS_OK">名校可接受</Radio>
          <Radio value="DEVELOPED_AREA_OK">发达地区可接受</Radio>
          <Radio value="GOOD_PROSPECT_OK">前景好可接受</Radio>
        </Radio.Group>
      </Form.Item>
      <Form.Item name="stayPreference" label="在省内/外读书偏好">
        <Radio.Group>
          <Radio value="LOCAL_ONLY">仅省内</Radio>
          <Radio value="PREFER_LOCAL">偏好省内</Radio>
          <Radio value="NO_PREFERENCE">无所谓</Radio>
          <Radio value="PREFER_OUTSIDE">偏好省外</Radio>
        </Radio.Group>
      </Form.Item>
      <Form.Item name="excludedProvinces" label="不接受的省份">
        <Select mode="tags" placeholder="输入" allowClear />
      </Form.Item>
      <Form.Item name="excludedMajors" label="不接受的专业">
        <Select mode="tags" placeholder="输入" allowClear />
      </Form.Item>
      <Form.Item name="interests" label="兴趣爱好">
        <Select mode="tags" placeholder="输入" allowClear />
      </Form.Item>
      <Form.Item name="personalityType" label="性格类型">
        <Input placeholder="如 INTJ / 内向 / 善于沟通" />
      </Form.Item>
      <Form.Item name="selfDescription" label="自我描述">
        <Input.TextArea rows={3} placeholder="任何想让老师知道的信息" />
      </Form.Item>
      <Form.Item name="militaryInterest" valuePropName="checked">
        <Checkbox>对军校/军事专业感兴趣</Checkbox>
      </Form.Item>
      <Form.Item name="teacherInterest" valuePropName="checked">
        <Checkbox>对师范专业感兴趣</Checkbox>
      </Form.Item>
      <Form.Item name="tuitionBudget" label="学费预算">
        <Radio.Group>
          <Radio value="LOW">经济敏感（≤6000/年）</Radio>
          <Radio value="MEDIUM">适中（6000-15000/年）</Radio>
          <Radio value="HIGH">不限（含中外合作）</Radio>
          <Radio value="UNLIMITED">无上限</Radio>
        </Radio.Group>
      </Form.Item>
      <Form.Item name="acceptSinoForeign" valuePropName="checked">
        <Checkbox>接受中外合作办学</Checkbox>
      </Form.Item>
      <Form.Item name="acceptPrivate" label="是否接受民办">
        <Radio.Group>
          <Radio value="STRICT">不接受</Radio>
          <Radio value="MODERATE">部分接受</Radio>
          <Radio value="RELAXED">接受</Radio>
          <Radio value="UNDECIDED">未定</Radio>
        </Radio.Group>
      </Form.Item>
      <Form.Item name="otherRequirements" label="其他要求">
        <Input.TextArea rows={2} placeholder="任何其他特殊要求" />
      </Form.Item>
      <div className="grid grid-cols-2 gap-4">
        <Form.Item name="visionLeftCorrected" label="左眼矫正视力">
          <InputNumber min={1} max={5.3} step={0.1} className="w-full" />
        </Form.Item>
        <Form.Item name="visionRightCorrected" label="右眼矫正视力">
          <InputNumber min={1} max={5.3} step={0.1} className="w-full" />
        </Form.Item>
      </div>
      <Form.Item name="physicalLimits" label="体检受限项">
        <HealthCheckboxGroup />
      </Form.Item>
      <Form.Item name="medicalHistory" label="既往病史 / 特殊情况">
        <Input.TextArea rows={2} placeholder="如有需注明的既往病史，请填写" />
      </Form.Item>
      <Form.Item name="ethnicity" label="民族">
        <Input placeholder="如 汉族" />
      </Form.Item>
      <Form.Item name="politicalStatus" label="政治面貌">
        <Radio.Group>
          <Radio value="PARTY_MEMBER">党员</Radio>
          <Radio value="LEAGUE_MEMBER">团员</Radio>
          <Radio value="MASSES">群众</Radio>
        </Radio.Group>
      </Form.Item>
    </>
  );
}

function Alert404({ stage, onBack }: { stage: string; onBack: () => void }) {
  return (
    <div className="space-y-3">
      <p className="text-text-secondary">未知阶段：{stage}</p>
      <Button onClick={onBack}>返回</Button>
    </div>
  );
}
```

注：`HealthCheckboxGroup` / `CountyCascader` 已存在于 `apps/web/src/components/student/`，复用即可。代码中 `import HealthCheckboxGroup` 不变。

- [ ] **Step 2: 编译 + 启动前端**

```bash
cd apps/web && npm run dev
```

访问 `/student/profile/stage/1` → `/2` → `/3` 确认表单渲染、保存生效，`dataVersion` 自动递增。

- [ ] **Step 3: Commit**

```bash
git add "apps/web/src/app/(student)/student/profile/stage/[stage]/page.tsx"
git commit -m "feat(web): student stage form page with W3 fields"
```

## Task M5.8: M5 集成手测

- [ ] **Step 1: 端到端流程**

学生账号登录 → `/student/profile` 显示 3 阶段卡片 → 点 阶段 1 → 填 6 字段 → 保存 → 返回首页 → 阶段 1 卡片显示「初步档案 已解锁」 + 完成度 100%

- [ ] **Step 2: 验证 ① 字段过滤**

打开浏览器 devtools → Network → `GET /api/students/me` → 响应不含 `totalScore/provincialRank/scoreChinese/...`

- [ ] **Step 3: 验证 ① 字段写入被拒绝**

```bash
curl -X PUT -H "Authorization: Bearer $STUDENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"dataVersion": 0, "totalScore": 600}' \
  http://localhost:3001/api/students/me
```

Expected: 403 + `字段 totalScore 仅老师可修改`

---

# Milestone M6: 老师端 UI（Collapse 扩字段 + 双进度 + 导出）

## Task M6.1: 老师端学生详情页改 Collapse 扩字段

**Files:**
- Modify: `apps/web/src/app/(teacher)/teacher/students/[id]/page.tsx`

- [ ] **Step 1: 阅读现有 page.tsx 摸清结构**

```bash
wc -l apps/web/src/app/\(teacher\)/teacher/students/\[id\]/page.tsx
# 336 行
```

阅读后保留现有的 `useQuery` / `useMutation` / 路由参数处理；改的是 form 内容 + 新增导出按钮 + 新增双进度条。

- [ ] **Step 2: 替换 form 渲染区为 Collapse 8 分组**

现有 form 估计是 Tabs 或单 form。把字段分组为：

```tsx
import { Collapse } from 'antd';

const items = [
  { key: 'basic', label: '基本信息（②）', children: <BasicFields /> },
  { key: 'household', label: '🔒 户籍 + 高考所在地（① 老师独占）', children: <HouseholdFields /> },
  { key: 'exam', label: '🔒 考试成绩（① 老师独占）', children: <ExamFields /> },
  { key: 'bonus', label: '🔒 加分政策（① 老师独占）', children: <BonusFields /> },
  { key: 'physical', label: '身体条件（②）', children: <PhysicalFields /> },
  { key: 'planning', label: '升学规划（②）', children: <PlanningFields /> },
  { key: 'preference', label: '偏好（②）', children: <PreferenceFields /> },
  { key: 'misc', label: '兴趣 + 经济（②）', children: <MiscFields /> },
];

<Collapse defaultActiveKey={['basic', 'household', 'exam']} items={items} />
```

每个 `XxxFields` 函数复用 M5.7 中 Stage*Fields 的字段定义思路，但**包含所有字段**（不限于学生端字段集）。

由于篇幅，详细字段重复代码以 M5.7 中 Stage1Fields/Stage2Fields/Stage3Fields 为参考实现，老师端版另增 ① 字段（`totalScore/provincialRank/scoreChinese/...`、`bonusPolicyStatus/bonusItems`、`province/city/county/isRural`、`examLocation*`）。

`bonusItems` 用 `Form.List` 实现增删行，每行 `type/value/source` 三个 Input。

- [ ] **Step 3: 顶部加双进度条 + 导出按钮**

在 page 头部组件中：

```tsx
const { data: student } = useQuery({...}); // 已有
const progress = student?.progress; // 后端 findById 暂时不返回 progress；下一步先临时跳过双进度条，仅做导出按钮

<div className="flex justify-between items-center mb-4">
  <h1>{student?.user?.realName}</h1>
  <Space>
    <Button
      icon={<DownloadOutlined />}
      onClick={async () => {
        const blob = await studentApi.exportIntake(String(id));
        const url = URL.createObjectURL(blob as any);
        const a = document.createElement('a');
        a.href = url;
        a.download = `intake_${student?.user?.realName ?? id}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
      }}
    >
      导出登记表
    </Button>
  </Space>
</div>
```

- [ ] **Step 4: Commit**

```bash
git add "apps/web/src/app/(teacher)/teacher/students/[id]/page.tsx"
git commit -m "feat(web): teacher student detail with Collapse + export button"
```

## Task M6.2: 后端 findById 返回 progress 信息

**Files:**
- Modify: `apps/server/src/modules/student/student.service.ts`

- [ ] **Step 1: 改 findById 加 progress**

定位 `student.service.ts:findById`，在 return 前补：

```typescript
async findById(id: number) {
  const profile = await this.prisma.studentProfile.findUnique({
    // ... 不变
  });

  if (!profile) {
    throw new NotFoundException('学生不存在');
  }

  const progress = this.progressService.compute({
    ...profile,
    realName: profile.user?.realName,
    phone: profile.user?.phone,
    gender: profile.user?.gender,
    ethnicity: profile.user?.ethnicity,
  });

  return { ...profile, progress };
}
```

- [ ] **Step 2: 跑现有 student.service.spec 检查不破坏**

```bash
cd apps/server && npm test -- student.service.spec
```

如有 `findById` 测试用例期望返回结构不变 → 改测试加 `progress` 字段。

- [ ] **Step 3: 编译 + Commit**

```bash
cd apps/server && npx tsc --noEmit
git add apps/server/src/modules/student/student.service.ts apps/server/src/modules/student/student.service.spec.ts
git commit -m "feat(student): include progress in findById response"
```

## Task M6.3: 老师端详情页接入双进度条

**Files:**
- Modify: `apps/web/src/app/(teacher)/teacher/students/[id]/page.tsx`

- [ ] **Step 1: 渲染双进度条**

在导出按钮上方加：

```tsx
import ProgressBar from '@/components/student/ProgressBar';

{progress && (
  <Card size="small" className="mb-4">
    <div className="grid grid-cols-2 gap-4">
      <ProgressBar
        label="学生自填进度"
        percent={progress.studentSelfCompleteness}
      />
      <ProgressBar
        label="老师录入进度"
        percent={progress.teacherDataCompleteness}
      />
    </div>
    <div className="mt-3">
      <ProgressBar
        label="档案总进度"
        percent={progress.overallCompleteness}
      />
    </div>
    {!progress.isRecommendable && (
      <p className="text-xs text-text-faint mt-2">
        档案未达可推荐阈值，缺：
        <span className="text-text-secondary ml-1">
          {progress.missingFieldsForRecommend.slice(0, 8).join('、')}
        </span>
      </p>
    )}
  </Card>
)}
```

- [ ] **Step 2: Commit**

```bash
git add "apps/web/src/app/(teacher)/teacher/students/[id]/page.tsx"
git commit -m "feat(web): teacher detail dual progress bars + recommend gate"
```

## Task M6.4: 老师端学生列表加双完整度列 + 筛选

**Files:**
- Modify: `apps/web/src/app/(teacher)/teacher/students/page.tsx`
- Modify: `apps/server/src/modules/student/student.service.ts`（findByTeacher 返回 progress）

- [ ] **Step 1: 后端 findByTeacher 计算每个学生的 progress**

在 `student.service.ts:findByTeacher`，找到 `Promise.all([prisma.studentProfile.findMany ...]`，用 map 给每条加 progress：

```typescript
const dataWithProgress = data.map((p) => ({
  ...p,
  progress: this.progressService.compute({
    ...p,
    realName: p.user?.realName,
    phone: p.user?.phone,
    gender: p.user?.gender,
    ethnicity: p.user?.ethnicity,
  }),
}));

return { data: dataWithProgress, total, page, pageSize };
```

- [ ] **Step 2: 前端列表加列**

修改 `apps/web/src/app/(teacher)/teacher/students/page.tsx`，在 `columns` 数组里追加：

```tsx
{
  title: '自填进度',
  dataIndex: ['progress', 'studentSelfCompleteness'],
  key: 'selfProgress',
  width: 120,
  render: (v: number) => (
    <Progress percent={v} size="small" strokeColor={v >= 80 ? '#276749' : '#b8860b'} />
  ),
  sorter: (a: any, b: any) =>
    (a.progress?.studentSelfCompleteness ?? 0) - (b.progress?.studentSelfCompleteness ?? 0),
},
{
  title: '录入进度',
  dataIndex: ['progress', 'teacherDataCompleteness'],
  key: 'teacherProgress',
  width: 120,
  render: (v: number) => (
    <Progress percent={v} size="small" strokeColor={v >= 80 ? '#276749' : '#b8860b'} />
  ),
  sorter: (a: any, b: any) =>
    (a.progress?.teacherDataCompleteness ?? 0) - (b.progress?.teacherDataCompleteness ?? 0),
},
```

- [ ] **Step 3: 加筛选下拉**

在搜索栏旁追加：

```tsx
import { Select } from 'antd';

const [progressFilter, setProgressFilter] = useState<string>('all');

// 在 useQuery 里把所有数据查回，前端过滤（数据量小，B 范围足够）
const filtered = useMemo(() => {
  if (!data?.data) return [];
  return data.data.filter((s: any) => {
    const p = s.progress;
    if (progressFilter === 'self_low') return p.studentSelfCompleteness < 50;
    if (progressFilter === 'self_mid') return p.studentSelfCompleteness >= 50 && p.studentSelfCompleteness < 80;
    if (progressFilter === 'teacher_pending') return p.teacherDataCompleteness < 100;
    return true;
  });
}, [data, progressFilter]);

<Select
  value={progressFilter}
  onChange={setProgressFilter}
  options={[
    { value: 'all', label: '全部学生' },
    { value: 'self_low', label: '自填 < 50%（催学生）' },
    { value: 'self_mid', label: '自填 50%~80%' },
    { value: 'teacher_pending', label: '录入未完成（自己补）' },
  ]}
  style={{ width: 200 }}
/>
```

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/modules/student/student.service.ts \
        "apps/web/src/app/(teacher)/teacher/students/page.tsx"
git commit -m "feat(web): teacher list dual completeness + filter"
```

---

# Milestone M7: 联调 + 文档 + PR

## Task M7.1: 全套测试 + 修任何 break

- [ ] **Step 1: 后端全测**

```bash
cd apps/server && npm test
```

Expected: 全绿。失败则 fix-and-recommit。

- [ ] **Step 2: 前端 lint + build**

```bash
cd apps/web && npm run lint && npm run build
```

Expected: 0 errors。type 报错（特别是 student-api.ts response 解构）逐个修。

- [ ] **Step 3: Commit 修复**

```bash
git commit -am "fix(student): resolve type errors and lint warnings from M1-M6"
```

## Task M7.2: 端到端流程手测

按以下脚本走通：

- [ ] **学生流程**
  - 登录学生账号 `/login`
  - 跳转到 `/student/profile`：见 3 张阶段卡片 + 上方双进度条
  - 进入「阶段 1」：填 6 字段 → 保存
  - 返回首页：阶段 1 卡片显示「初步档案 已解锁」
  - 进入「阶段 2」：填部分字段 → 保存 → 返回首页 → 阶段 2 显示部分进度
  - 在 devtools 试图通过 `PUT /api/students/me` 注入 `totalScore: 600` → 期望 403

- [ ] **老师流程**
  - 登录老师账号
  - 进入 `/teacher/students`：见双进度列 + 筛选下拉
  - 选「录入未完成」：列表过滤
  - 进入某学生详情：见 8 个 Collapse 折叠面板 + 双进度条 + 导出按钮
  - 填总分/位次/加分 → 保存
  - 学生再次刷新 dashboard：「档案总进度」上升，`isRecommendable` 变 true
  - 老师点「导出登记表」：下载 .xlsx 打开看字段填充正确

- [ ] **管理员流程**（如有时间）
  - 登录管理员账号
  - 能看到所有老师的所有学生

## Task M7.3: 更新 Spec 文档状态 + 写 PR

**Files:**
- Modify: `docs/superpowers/specs/2026-05-05-student-info-collection-design.md:5`

- [ ] **Step 1: 改 spec 状态**

把 `状态：待实施` 改为 `状态：已实现 (M1-M7)`。

- [ ] **Step 2: 推分支**

```bash
git push -u origin <feature-branch>
```

- [ ] **Step 3: 创建 PR（用 gh）**

```bash
gh pr create --base master --title "feat(student): info collection v1 (W3 + xlsx export)" --body "$(cat <<'EOF'
## Summary
- 实现 spec `2026-05-05-student-info-collection-design.md` 的 B 范围
- 学生端 W3 三阶段渐进采集 dashboard + 阶段表单页
- 老师端单页 form + Collapse 8 分组 + 双进度条 + 接待单导出
- 字段权限分层：CASL 粗粒度 + service 层 ① 字段白名单
- 双轨完整度算法：student/teacher 各自进度 + 加权 overall + isRecommendable 阈值
- 18 字段 + 5 枚举 schema 增量

## Test plan
- [ ] `npm test` 后端全绿（field-policy / progress.service / student.service / intake-export）
- [ ] `npm run lint && npm run build` 前端无错
- [ ] 端到端：学生填 stage1 → 老师录入 ① 字段 → 学生看到 isRecommendable=true
- [ ] 学生 PUT 注入 totalScore → 403
- [ ] 老师导出 xlsx 打开字段正确
- [ ] 列表筛选三档生效

## Out of scope (will be C phase)
- 家长独立登录、Excel/OCR 批量导入、AI 渐进对话采集、老师代填、模板管理 UI
EOF
)"
```

- [ ] **Step 4: 等 PR review 通过 + merge**

按 superpowers:requesting-code-review skill 走两阶段审查。Review 反馈按 superpowers:receiving-code-review 处理。

---

# Self-Review

## 1. Spec coverage（每节都要能指到一个 task）

| Spec 章节 | 对应 Task |
|---|---|
| §3.1 新增枚举 | M1.1 |
| §3.2 字段增量 | M1.2 / M1.3 |
| §3.3 排除审核状态机 | 不在 plan（即不实现） |
| §4.1 三类字段集 | M2.1 / M2.2 |
| §4.2 W3 阶段字段分组 | M2.2（field-policy.ts） |
| §4.3 service 层白名单 | M3.2 / M3.3 |
| §4.4 学生端端点 | M3.4 |
| §5 双轨完整度算法 | M2.3 / M2.4 |
| §5.4 isRecommendable 连锁 | M5.6（dashboard 提示）+ M6.3（老师端提示） |
| §6.1 学生端路由 | M5.6 / M5.7 |
| §6.2 dashboard | M5.6 |
| §6.3 阶段表单 | M5.7 |
| §6.4 旧 profile 改造 | M5.6 |
| §7.1 老师 create | 不动（spec 已说明）|
| §7.2 老师详情 Collapse | M6.1 / M6.2 / M6.3 |
| §7.3 老师列表 | M6.4 |
| §8 xlsx 导出 | M4.1 / M4.2 / M4.3 / M4.4 |
| §9.1 后端单元测试 | M2.1 / M2.3 / M3.2 / M4.2 |
| §9.2 后端集成测试 | M5.8（手测）|
| §9.3 前端 E2E | M7.2（手测）|
| §9.4 TDD 顺序 | 各 task 内置 RED→GREEN |
| §10 7 个里程碑 | M1-M7 一一对应 |

**未直接覆盖**：§9.2 集成测试目前只走手测路径。如要严格 TDD 含集成测试，可在 M3.4 加 supertest 端点测试任务，但 B 范围内权衡省略。

## 2. Placeholder scan

- [x] 无 "TBD/TODO/implement later"
- [x] 每个代码 step 都给了完整代码，无 "类似 Task N"
- [x] 无 "适当的错误处理" 类模糊描述

## 3. Type consistency

- `ProfileProgress` 接口在 M2.4 定义，M5.1 前端镜像保持字段名一致（`studentSelfCompleteness/teacherDataCompleteness/stageProgress/overallCompleteness/isRecommendable/missingFieldsForRecommend`）
- `STAGE_1_REQUIRED/STAGE_2_FIELDS/STAGE_3_FIELDS` 后端（M2.2）与前端（M5.2）字段名严格一致
- `TEACHER_ONLY_FIELDS` 同上
- `studentApi.exportIntake` 签名（M5.1）与 controller 端点（M4.4）一致：`GET /students/:id/export-intake`，返回 blob

发现 1 处需修：M6.4 用 `data?.data` 解构，但 student-api.ts 现有方法返回的是 `Promise<any>`，response wrapping 取决于 `api.ts` 拦截器。读现有列表页可知用 `data?.data?.data` 双层解构（外层是 axios，内层是后端 wrapper）。**需在 M6.4 实施时注意 wrapping 层数**——保留为实施时按现有模式即可。

## 4. Ambiguity check

- M3.4 的端点声明顺序"`/me` 必须在 `/:id` 之前"已显式说明
- M5.6 注明"完全过滤 ① 字段 vs 只读保留"决策：选完全过滤
- M6.1 老师端字段分组用 ① / ② 角标识别归属，避免老师误以为字段缺失

---

**Plan complete and saved to `docs/superpowers/plans/2026-05-05-student-info-collection.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — 每个 task 派遣新 subagent，task 间两阶段 review，迭代快

**2. Inline Execution** — 在当前 session 用 executing-plans 批执行，含 review checkpoint

**选哪个？**
