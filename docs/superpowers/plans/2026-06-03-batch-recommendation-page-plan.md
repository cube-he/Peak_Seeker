# Batch Recommendation Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现「批次推荐页」: 学生 intake submit 后, 老师在专属页面看 6 主批次 × 15 子类别的判定结果 + 政策文件, 勾选最终批次写入 student.preferredBatches。同时回滚 Plan A 的「学生选+锁定」流程。

**Architecture:** 后端: 扩展 batchConfig.eligibilityRules JSON 为 subsets 结构 + 升级 judgeBatchEligibility + 新 POST confirm-batches + 新 GET batch-recommendations。前端: Next.js 新路由 `/teacher/students/:id/batch-recommendations`, 6 个 BatchCard + 折叠 SubsetItem + 文件预览。文件: 上传政策附件到 `/attachments/policy/` (nginx 复用历史案例路由)。

**Tech Stack:** NestJS 7 + Prisma 7 + Jest (后端) / Next.js 14 + React + axios + Jest + RTL (前端) / nginx + scp + pm2 (部署)

**Spec:** `docs/superpowers/specs/2026-06-03-batch-recommendation-page-design.md`

**Reference (Plan A):** `docs/superpowers/specs/2026-06-02-batch-selection-at-intake-design.md`

---

## Phase 1: 后端核心 (Plan A 微调 + schema 升级 + 判定算法升级)

### Task 1: 移除 submitMyIntake 的 preferredBatches 校验和 batchesConfirmedAt 写入

**Files:**
- Modify: `apps/server/src/modules/student/student.service.ts:728-770` (`submitMyIntake` 方法)
- Modify: `apps/server/src/modules/student/student.service.spec.ts` (移除/调整 batches 相关测试)

- [ ] **Step 1: 更新失败的 spec 测试**

打开 `apps/server/src/modules/student/student.service.spec.ts`, 找到 'intake workflow' describe 块。

替换 'submitMyIntake marks a complete student intake as SUBMITTED' 测试的断言:

```typescript
it('submitMyIntake marks a complete student intake as SUBMITTED (不再写 batchesConfirmedAt)', async () => {
  (service as any).progressService.compute.mockReturnValue({
    studentSelfCompleteness: 100,
    teacherDataCompleteness: 0,
    stageProgress: {
      stage1: { filled: 16, total: 16, completed: true },
      stage2: { filled: 0, total: 15, completed: false },
      stage3: { filled: 0, total: 26, completed: false },
    },
    overallCompleteness: 60,
    isRecommendable: false,
    missingFieldsForRecommend: [],
  });
  prisma.studentProfile.findUnique.mockResolvedValue({
    id: 1,
    userId: 100,
    intakeStatus: 'DRAFT',
    preferredBatches: [],  // 空 batches 也允许提交
    user: { id: 100, realName: '小王', phone: '13800000000', gender: 'MALE' },
  });
  prisma.studentProfile.update.mockResolvedValue({ id: 1, intakeStatus: 'SUBMITTED' });

  const result = await (service as any).submitMyIntake(100);

  expect(result).toHaveProperty('intakeStatus', 'SUBMITTED');
  const updateCall = prisma.studentProfile.update.mock.calls[0][0];
  expect(updateCall.data.intakeStatus).toBe('SUBMITTED');
  expect(updateCall.data.intakeSubmittedAt).toEqual(expect.any(Date));
  // 关键: 不再写 batchesConfirmedAt
  expect(updateCall.data.batchesConfirmedAt).toBeUndefined();
});
```

删除测试 'submitMyIntake 在 preferredBatches 为空时拒绝' (功能已移除)。

- [ ] **Step 2: 跑 spec 验证 RED**

```bash
cd apps/server && pnpm exec jest src/modules/student/student.service.spec.ts -t 'intake workflow'
```

Expected: 主测试 FAIL (因为 batchesConfirmedAt 仍被写入), 删除的测试不存在 PASS

- [ ] **Step 3: 改 service 实现移除校验和 batchesConfirmedAt**

打开 `apps/server/src/modules/student/student.service.ts`, 找到 `submitMyIntake`, 删除以下代码块:

```typescript
// 商业化流程: 提交资料必须先选定填报批次, 提交后锁定供老师按批次出方案
const preferredBatches = Array.isArray(profile.preferredBatches)
  ? (profile.preferredBatches as unknown[]).filter((x) => typeof x === 'string')
  : [];
if (preferredBatches.length === 0) {
  throw new BadRequestException('请至少选定 1 个填报批次才能提交资料');
}
```

并删除 `update.data` 中的 `batchesConfirmedAt: new Date()` 一行, 改成不带它的版本:

```typescript
return this.prisma.studentProfile.update({
  where: { id: profile.id },
  data: {
    intakeStatus: 'SUBMITTED',
    intakeSubmittedAt: new Date(),
    intakeReviewedAt: null,
    intakeReviewedBy: null,
    intakeReviewComment: null,
  },
});
```

如果 `BadRequestException` import 不再被本文件其他地方用, 保留 import 不动 (Task 5 还会用)。

- [ ] **Step 4: 跑测试验证 GREEN**

```bash
cd apps/server && pnpm exec jest src/modules/student/student.service.spec.ts
```

Expected: 全部 PASS

- [ ] **Step 5: typecheck**

```bash
cd apps/server && pnpm exec tsc --noEmit
```

Expected: 无错误

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/modules/student/student.service.ts apps/server/src/modules/student/student.service.spec.ts
git commit -m "refactor(student): submitMyIntake no longer requires batches (老师将在推荐页选)

Reverts Plan A's '学生 intake 必选 preferredBatches + 锁定' design.
preferredBatches/batchesConfirmedAt are now written by teacher via
new confirmBatches endpoint after viewing batch recommendation page.

See docs/superpowers/specs/2026-06-03-batch-recommendation-page-design.md § 三

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: 扩展 EligibilityRulesJson 类型加 subsets 数组

**Files:**
- Modify: `apps/server/src/modules/batch-eligibility/types.ts`

- [ ] **Step 1: 写新类型**

打开 `apps/server/src/modules/batch-eligibility/types.ts`, 追加以下类型 (保留原有内容, 后续 Task 3 会改判定算法用它们):

```typescript
// 本期新增: subset-level 判定
// 见 docs/superpowers/specs/2026-06-03-batch-recommendation-page-design.md § 四

export type SubsetVerdict = 'ELIGIBLE' | 'CONDITIONAL' | 'INELIGIBLE' | 'DATA_PENDING';

export type RuleEvalStatus = 'PASS' | 'FAIL' | 'UNCERTAIN' | 'SOFT_HINT';

export interface RuleEvalResult {
  ruleCode: string;
  requirement: string;   // 中文描述, 如 "需农村户籍 + 户籍县 ∈ 119 县"
  actual: string;        // 实际值, 如 "农村户籍, 户籍县=叙永县"
  pass: RuleEvalStatus;
}

export interface ReferenceItem {
  title: string;
  filename: string | null;  // null = 文件待补
  type: 'pdf' | 'xlsx' | 'announcement';
  downloadUrl: string | null;
  available: boolean;
  sourceNote?: string;
}

export interface SubsetRule {
  code: string;          // "guojia_zhuanxiang"
  name: string;          // "国家专项"
  description: string;
  dataPending?: boolean; // true → 不参与判定, verdict = DATA_PENDING
  examTypes?: string[];  // 若与父批次不同
  hardRules?: HardEligibilityRule[];
  softHints?: string[];
  references?: ReferenceFile[];
}

export interface ReferenceFile {
  title: string;
  filename: string | null;
  type: 'pdf' | 'xlsx' | 'announcement';
  sourceNote?: string;
}

export interface SubsetResult {
  code: string;
  name: string;
  description: string;
  verdict: SubsetVerdict;
  rulesEval: RuleEvalResult[];
  references: ReferenceItem[];
}

// 扩展原 EligibilityRulesJson 接口
export interface EligibilityRulesJsonV2 extends EligibilityRulesJson {
  subsets?: SubsetRule[];
}
```

并在 `HardEligibilityRuleCode` union 末尾追加新规则码:

```typescript
export type HardEligibilityRuleCode =
  | 'RURAL_HOUSEHOLD_IN_REGION'
  | 'HOUSEHOLD_IN_REGION'
  | 'AGE_RANGE'
  | 'POLITICAL_REVIEW_REQUIRED'
  | 'PHYSICAL_EXAM_REQUIRED'
  | 'GENDER'                    // (新增) {allowed: 'MALE' | 'FEMALE' | 'BOTH'}
  | 'VISION_STANDARD'           // (新增) SOFT_HINT
  | 'SCHOOL_RECOMMENDATION'     // (新增) SOFT_HINT
  | 'SERVICE_COMMITMENT';       // (新增) SOFT_HINT
```

- [ ] **Step 2: typecheck**

```bash
cd apps/server && pnpm exec tsc --noEmit
```

Expected: 无错误

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/modules/batch-eligibility/types.ts
git commit -m "feat(batch-eligibility): add SubsetRule/SubsetResult types for V2 judging

Plan recommendation Task 2 — adds subset-level judging types alongside
the existing batch-level types, preserving backward compatibility.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: 升级 judgeBatchEligibility 支持 subsets 判定 (TDD)

**Files:**
- Modify: `apps/server/src/modules/batch-eligibility/batch-eligibility.ts`
- Modify: `apps/server/src/modules/batch-eligibility/batch-eligibility.spec.ts`

- [ ] **Step 1: 加新测试 (RED)**

打开 `apps/server/src/modules/batch-eligibility/batch-eligibility.spec.ts`, 文件末尾 `}` 之前追加新 describe:

```typescript
describe('judgeBatchEligibility V2 (subsets 数组)', () => {
  const baseStudent = {
    examType: 'PHYSICS' as const,
    totalScore: 480,
    isRural: true,
    county: '叙永县',
    politicalStatus: null,
    birthDate: new Date('2008-01-01'),
  };
  const baseBatchConfig = (rules: any) => ({
    id: 1,
    batch: '本科批A段',
    examType: '物理',
    eligibilityRules: rules,
  });

  it('subsets 中至少一个 ELIGIBLE → 批次 verdict=ELIGIBLE', () => {
    const rules = {
      scoreFloor: { type: 'BATCH_LINE' },
      examTypes: ['物理'],
      volunteerMode: 'PARALLEL',
      hardEligibility: [],
      subsets: [
        {
          code: 'puton',
          name: '普通类',
          description: '一般本科',
          hardRules: [],
          references: [],
        },
        {
          code: 'guojia_zhuanxiang',
          name: '国家专项',
          description: '面向贫困县',
          hardRules: [{
            scope: 'SUBSET', subset: '国家专项',
            rule: 'HOUSEHOLD_IN_REGION',
            params: { regions: ['其他县'] },
          }],
          references: [],
        },
      ],
    };
    const r = judgeBatchEligibility(baseStudent, baseBatchConfig(rules), { score: 438 });
    expect(r.verdict).toBe('ELIGIBLE');  // 普通类 ELIGIBLE 拉高整批
  });

  it('subsets 全部 INELIGIBLE → 批次 verdict=INELIGIBLE', () => {
    const rules = {
      scoreFloor: { type: 'BATCH_LINE' },
      examTypes: ['物理'],
      volunteerMode: 'PARALLEL',
      hardEligibility: [],
      subsets: [
        {
          code: 'guojia',
          name: '国家专项',
          description: '',
          hardRules: [{
            scope: 'SUBSET', subset: '国家专项',
            rule: 'HOUSEHOLD_IN_REGION',
            params: { regions: ['其他县'] },
          }],
          references: [],
        },
      ],
    };
    const r = judgeBatchEligibility(baseStudent, baseBatchConfig(rules), { score: 438 });
    expect(r.verdict).toBe('INELIGIBLE');
  });

  it('subsets dataPending → 该 subset 不参与聚合, 整批仍 ELIGIBLE', () => {
    const rules = {
      scoreFloor: { type: 'BATCH_LINE' },
      examTypes: ['物理'],
      volunteerMode: 'PARALLEL',
      hardEligibility: [],
      subsets: [
        { code: 'puton', name: '普通类', description: '', hardRules: [], references: [] },
        { code: 'qiangji', name: '强基计划', description: '', dataPending: true, references: [] },
      ],
    };
    const r = judgeBatchEligibility(baseStudent, baseBatchConfig(rules), { score: 438 });
    expect(r.verdict).toBe('ELIGIBLE');
    // V2 返回 subsetResults
    expect((r as any).subsetResults).toBeDefined();
    expect((r as any).subsetResults).toHaveLength(2);
    expect((r as any).subsetResults.find((s: any) => s.code === 'qiangji').verdict).toBe('DATA_PENDING');
  });

  it('SCORE_FAIL 时 subsets 不需要判定, 直接 INELIGIBLE', () => {
    const rules = {
      scoreFloor: { type: 'BATCH_LINE' },
      examTypes: ['物理'],
      volunteerMode: 'PARALLEL',
      hardEligibility: [],
      subsets: [{ code: 'puton', name: '普通类', description: '', hardRules: [], references: [] }],
    };
    const r = judgeBatchEligibility(
      { ...baseStudent, totalScore: 400 },
      baseBatchConfig(rules),
      { score: 438 },
    );
    expect(r.verdict).toBe('INELIGIBLE');
  });

  it('subsets 缺失 → 退化到老逻辑 (向后兼容)', () => {
    const rules = {
      scoreFloor: { type: 'BATCH_LINE' },
      examTypes: ['物理'],
      volunteerMode: 'PARALLEL',
      hardEligibility: [],
      // 无 subsets 字段
    };
    const r = judgeBatchEligibility(baseStudent, baseBatchConfig(rules), { score: 438 });
    expect(r.verdict).toBe('ELIGIBLE');
  });
});
```

- [ ] **Step 2: 跑测试 RED**

```bash
cd apps/server && pnpm exec jest src/modules/batch-eligibility/batch-eligibility.spec.ts -t 'V2 (subsets'
```

Expected: 4-5 个测试 FAIL (subsetResults 字段还没实现)

- [ ] **Step 3: 升级 batch-eligibility.ts 实现**

打开 `apps/server/src/modules/batch-eligibility/batch-eligibility.ts`, 修改导入和返回类型, 加 SubsetResult 处理:

```typescript
// 文件顶部 import 增加 SubsetRule, SubsetResult, SubsetVerdict, RuleEvalResult:
import type {
  BatchEligibilityResult,
  EligibilityReason,
  EligibilityRulesJson,
  HardEligibilityRule,
  SubsetRule,
  SubsetResult,
  SubsetVerdict,
  RuleEvalResult,
} from './types';
```

将 `BatchEligibilityResult` 接口在内联 type 中扩展 (在原有字段下加):

```typescript
// (注: 因 BatchEligibilityResult 是 types.ts 定义的, 不能直接改, 这里通过返回值多带 subsetResults 字段即可,
// 实际 types.ts 中应在原 BatchEligibilityResult interface 加可选字段 subsetResults?: SubsetResult[];)
```

把 `apps/server/src/modules/batch-eligibility/types.ts` 中 `BatchEligibilityResult` 加可选字段:

```typescript
export interface BatchEligibilityResult {
  batchConfigId: number;
  batch: string;
  examType: string;
  verdict: BatchEligibilityVerdict;
  reasons: EligibilityReason[];
  subsetResults?: SubsetResult[];  // 新增: V2 subsets 判定
}
```

然后在 `judgeBatchEligibility` 函数末尾, 在 `return result` 之前, 加 subset 评估逻辑:

```typescript
  // 5. 软建议 (原代码)
  for (const sr of rules.softRecommendation ?? []) {
    reasons.push({ type: 'SOFT_HINT', message: sr.message });
  }

  // === V2: subsets 数组评估 ===
  const subsets = (rules as any).subsets as SubsetRule[] | undefined;
  if (subsets && Array.isArray(subsets) && subsets.length > 0) {
    if (result.verdict === 'INELIGIBLE') {
      // SCORE_FAIL / EXAM_TYPE_MISMATCH 已经直接 return, 这里走不到
      // 防御性: 不评 subsets, 全部 INELIGIBLE
      result.subsetResults = subsets.map((s) => ({
        code: s.code,
        name: s.name,
        description: s.description,
        verdict: 'INELIGIBLE',
        rulesEval: [],
        references: (s.references ?? []).map(refToItem),
      }));
    } else {
      result.subsetResults = subsets.map((s) => evalSubset(student, s));
      // 聚合 batch verdict
      const activeVerdicts = result.subsetResults.filter((s) => s.verdict !== 'DATA_PENDING');
      if (activeVerdicts.length === 0) {
        // 全 dataPending, 保持原 verdict 不动
      } else if (activeVerdicts.some((s) => s.verdict === 'ELIGIBLE')) {
        result.verdict = 'ELIGIBLE';
      } else if (activeVerdicts.every((s) => s.verdict === 'INELIGIBLE')) {
        result.verdict = 'INELIGIBLE';
      } else {
        result.verdict = 'CONDITIONAL';
      }
    }
  }

  return result;
}

function evalSubset(student: StudentForEligibility, subset: SubsetRule): SubsetResult {
  if (subset.dataPending) {
    return {
      code: subset.code,
      name: subset.name,
      description: subset.description,
      verdict: 'DATA_PENDING',
      rulesEval: [],
      references: (subset.references ?? []).map(refToItem),
    };
  }
  const rulesEval: RuleEvalResult[] = [];
  let verdict: SubsetVerdict = 'ELIGIBLE';
  for (const rule of subset.hardRules ?? []) {
    const { satisfied, hint, soft, requirement, actual } = evalHardRuleV2(student, rule);
    const status: RuleEvalStatus = soft
      ? 'SOFT_HINT'
      : satisfied
        ? 'PASS'
        : 'FAIL';
    rulesEval.push({
      ruleCode: rule.rule,
      requirement: requirement ?? rule.rule,
      actual: actual ?? hint,
      pass: status,
    });
    if (!satisfied && !soft) verdict = 'INELIGIBLE';
    else if (soft && verdict === 'ELIGIBLE') verdict = 'CONDITIONAL';
  }
  return {
    code: subset.code,
    name: subset.name,
    description: subset.description,
    verdict,
    rulesEval,
    references: (subset.references ?? []).map(refToItem),
  };
}

function refToItem(ref: { title: string; filename: string | null; type: string; sourceNote?: string }) {
  return {
    title: ref.title,
    filename: ref.filename,
    type: ref.type as 'pdf' | 'xlsx' | 'announcement',
    downloadUrl: ref.filename ? `/attachments/policy/${ref.filename}` : null,
    available: !!ref.filename,
    sourceNote: ref.sourceNote,
  };
}

function evalHardRuleV2(
  student: StudentForEligibility,
  rule: HardEligibilityRule,
): { satisfied: boolean; hint: string; soft?: boolean; requirement?: string; actual?: string } {
  // 复用原 evalHardRule, 加 requirement/actual 字段
  const base = evalHardRule(student, rule);
  // 简化: requirement/actual 用 hint 暂代, Task 5 (seed) 会传入更精确文案
  return { ...base, requirement: undefined, actual: base.hint };
}
```

注意: `evalHardRule` 是原来的函数, 不动。`evalHardRuleV2` 是新增 wrapper。

如果 `RuleEvalStatus` 类型还没 import, 在文件顶部 import 中加。

- [ ] **Step 4: 跑测试 GREEN**

```bash
cd apps/server && pnpm exec jest src/modules/batch-eligibility/batch-eligibility.spec.ts
```

Expected: 全部 PASS (V2 新测试 + 原 11 个测试)

- [ ] **Step 5: typecheck**

```bash
cd apps/server && pnpm exec tsc --noEmit
```

Expected: 无错误

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/modules/batch-eligibility/
git commit -m "feat(batch-eligibility): V2 subsets aggregation for batch-level verdict

judgeBatchEligibility now returns subsetResults[] when rules has
subsets array. Batch verdict aggregates from subset verdicts:
- any subset ELIGIBLE → batch ELIGIBLE
- all INELIGIBLE → batch INELIGIBLE
- dataPending subsets skip aggregation
- otherwise CONDITIONAL

Backward compatible: rules without subsets[] field uses old logic.

5 new spec tests + all 11 original tests pass.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: 重写 seed 脚本填 6 主批次 15 核心子类别

**Files:**
- Modify: `apps/server/scripts/seed-batch-eligibility-rules.ts`

- [ ] **Step 1: 重写 seed 脚本**

整体覆盖 `apps/server/scripts/seed-batch-eligibility-rules.ts` 为新版本 (使用 subsets 数组结构):

```typescript
/**
 * Plan: batch recommendation page Task 4
 * 把 6 主批次的 eligibilityRules JSON (含 subsets) 写入 batch_configs 表
 *
 * 数据源:
 *   - 子类别规则: docs/superpowers/specs/2026-06-03-batch-recommendation-page-design.md § 五
 *   - 县名单 seed: data/seed/batch-region-counties.json
 *
 * 用法 (生产服):
 *   cd /home/ubuntu/apps/volunteer-helper/apps/server && \
 *   set -a && . ./.env && set +a && \
 *   ts-node --transpileOnly scripts/seed-batch-eligibility-rules.ts
 *
 * 幂等: 每次跑都全量 update, 可重复执行。
 */
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { readFileSync } from 'fs';
import { join } from 'path';

const adapter = new PrismaMariaDb(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter } as any);

const COUNTIES_JSON_PATH = join(__dirname, '../../../data/seed/batch-region-counties.json');

function flatten(json: any, key: string): string[] {
  return Object.values(json[key].counties).flat() as string[];
}

const counties = JSON.parse(readFileSync(COUNTIES_JSON_PATH, 'utf-8'));
const REGION_119 = flatten(counties, 'appendix_2_119');
const REGION_143 = flatten(counties, 'appendix_4_143');
const REGION_88 = flatten(counties, 'appendix_5_88');

if (REGION_119.length !== 119) throw new Error(`119 expected, got ${REGION_119.length}`);
if (REGION_143.length !== 143) throw new Error(`143 expected, got ${REGION_143.length}`);
if (REGION_88.length !== 88) throw new Error(`88 expected, got ${REGION_88.length}`);

// 公共文件 references (复用)
const ref_119 = {
  title: '四川省民族地区、原集中连片特殊困难地区和革命老区、艰苦边远地区 119 县名单',
  filename: 'policy_6_119_counties.xlsx',
  type: 'xlsx' as const,
};
const ref_143 = {
  title: '四川省 2024 省级公费师范生范围 143 县名单',
  filename: 'policy_2_143_shifan.xlsx',
  type: 'xlsx' as const,
};
const ref_88 = {
  title: '四川省乡村振兴 88 县名单',
  filename: 'policy_5_88_xiangcun.xlsx',
  type: 'xlsx' as const,
};
const ref_zhaosheng_wuli = {
  title: '招生考试报 2025 物理类前言+附件',
  filename: 'zhaosheng_2025_wuli_qianyan.pdf',
  type: 'pdf' as const,
};
const ref_zhaosheng_lishi = {
  title: '招生考试报 2025 历史类前言+附件',
  filename: 'zhaosheng_2025_lishi_qianyan.pdf',
  type: 'pdf' as const,
};
const ref_junjian = {
  title: '军队选拔军官和文职人员体检标准',
  filename: 'junjian_tijian.pdf',
  type: 'pdf' as const,
};

const RULES: Record<string, any> = {
  本科批A段: {
    scoreFloor: { type: 'BATCH_LINE' },
    examTypes: ['物理', '历史'],
    volunteerMode: 'PARALLEL',
    hardEligibility: [],
    subsets: [
      {
        code: 'puton_a',
        name: '普通类',
        description: '一般本科, 无特殊资格要求',
        hardRules: [],
        references: [ref_zhaosheng_wuli, ref_zhaosheng_lishi],
      },
      {
        code: 'guojia_zhuanxiang',
        name: '国家专项计划',
        description: '面向原贫困地区, 招收农村学生进重点高校',
        hardRules: [
          {
            scope: 'SUBSET', subset: '国家专项',
            rule: 'RURAL_HOUSEHOLD_IN_REGION',
            params: { regions: REGION_119 },
          },
        ],
        softHints: ['户籍连续 3 年 + 学籍连续 3 年, 老师核实'],
        references: [ref_119, ref_zhaosheng_wuli],
      },
      {
        code: 'difang_zhuanxiang',
        name: '地方专项计划',
        description: '省属高校招收本省农村学生',
        hardRules: [
          {
            scope: 'SUBSET', subset: '地方专项',
            rule: 'RURAL_HOUSEHOLD_IN_REGION',
            params: { regions: REGION_119 },
          },
        ],
        references: [ref_119, ref_zhaosheng_wuli],
      },
      {
        code: 'gaoshui_yundong',
        name: '高水平运动队',
        description: '具有运动员等级证书的考生',
        dataPending: true,
        references: [],
      },
    ],
  },
  本科批B段: {
    scoreFloor: { type: 'BATCH_LINE' },
    examTypes: ['物理', '历史'],
    volunteerMode: 'PARALLEL',
    hardEligibility: [],
    subsets: [
      {
        code: 'puton_b',
        name: '普通类',
        description: '一般本科 B 段, 部分原二本院校',
        hardRules: [],
        references: [ref_zhaosheng_wuli, ref_zhaosheng_lishi],
      },
      {
        code: 'gaoxiao_zhuanxiang',
        name: '高校专项计划',
        description: '部分高校单列, 农村学生重点支持',
        hardRules: [
          {
            scope: 'SUBSET', subset: '高校专项',
            rule: 'RURAL_HOUSEHOLD_IN_REGION',
            params: { regions: REGION_119 },
          },
        ],
        softHints: ['中学校长实名推荐, 通过高校审核, 老师核实'],
        references: [ref_119, ref_zhaosheng_wuli],
      },
      {
        code: 'zhongwai_hezuo',
        name: '中外合作办学',
        description: '高学费, 通常是国内+海外联合培养',
        dataPending: true,
        references: [],
      },
      {
        code: 'yingyong_benke',
        name: '应用型本科',
        description: '部分高职升级的应用型本科专业',
        dataPending: true,
        references: [],
      },
    ],
  },
  本科提前批A段: {
    scoreFloor: { type: 'SPECIAL_LINE' },
    examTypes: ['物理', '历史'],
    volunteerMode: 'SEQUENTIAL',
    hardEligibility: [],
    subsets: [
      {
        code: 'junxiao',
        name: '军队院校',
        description: '军队 27 院校, 录取后入伍',
        hardRules: [
          {
            scope: 'SUBSET', subset: '军队院校',
            rule: 'AGE_RANGE',
            params: { min: 16, max: 20, asOf: '2025-08-31' },
          },
          {
            scope: 'SUBSET', subset: '军队院校',
            rule: 'POLITICAL_REVIEW_REQUIRED',
          },
          {
            scope: 'SUBSET', subset: '军队院校',
            rule: 'PHYSICAL_EXAM_REQUIRED',
          },
        ],
        softHints: ['需通过体能测试, 体重身高视力具体标准看军检 PDF, 老师跟家长核实'],
        references: [ref_junjian, ref_zhaosheng_wuli],
      },
      {
        code: 'gongan',
        name: '公安院校',
        description: '公安部直属院校, 政考要求高',
        hardRules: [
          {
            scope: 'SUBSET', subset: '公安院校',
            rule: 'AGE_RANGE',
            params: { min: 16, max: 22, asOf: '2025-08-31' },
          },
          {
            scope: 'SUBSET', subset: '公安院校',
            rule: 'POLITICAL_REVIEW_REQUIRED',
          },
          {
            scope: 'SUBSET', subset: '公安院校',
            rule: 'PHYSICAL_EXAM_REQUIRED',
          },
        ],
        references: [ref_zhaosheng_wuli],
      },
      {
        code: 'sifa',
        name: '司法警官类',
        description: '司法部院校, 警务方向',
        hardRules: [
          {
            scope: 'SUBSET', subset: '司法警官',
            rule: 'POLITICAL_REVIEW_REQUIRED',
          },
          {
            scope: 'SUBSET', subset: '司法警官',
            rule: 'PHYSICAL_EXAM_REQUIRED',
          },
        ],
        references: [ref_zhaosheng_wuli],
      },
      {
        code: 'hanghai',
        name: '航海类',
        description: '航海技术、轮机工程等专业, 视力色觉要求',
        hardRules: [
          {
            scope: 'SUBSET', subset: '航海类',
            rule: 'VISION_STANDARD',
          },
        ],
        softHints: ['裸眼视力 4.7 以上 + 无色盲色弱, 体检表参考招生章程'],
        references: [ref_zhaosheng_wuli],
      },
      {
        code: 'liuxue_dingxiang',
        name: '留学/留俄定向',
        description: '部分院校与海外大学联合培养',
        dataPending: true,
        references: [],
      },
      {
        code: 'gaoxiao_zonghe',
        name: '高校综合评价 (北电中传等)',
        description: '艺术综合评价, 单独招生流程',
        dataPending: true,
        references: [],
      },
    ],
  },
  本科提前批B段: {
    scoreFloor: { type: 'BATCH_LINE', leniency: 20 },
    examTypes: ['物理', '历史'],
    volunteerMode: 'PARALLEL',
    hardEligibility: [],
    subsets: [
      {
        code: 'mianfei_yixue',
        name: '免费医学 (农村订单定向)',
        description: '5+3 全科医师定向培养, 服务期 6 年',
        hardRules: [
          {
            scope: 'SUBSET', subset: '免费医学',
            rule: 'RURAL_HOUSEHOLD_IN_REGION',
            params: { regions: REGION_119 },
          },
          {
            scope: 'SUBSET', subset: '免费医学',
            rule: 'SERVICE_COMMITMENT',
            params: { years: 6 },
          },
        ],
        references: [ref_119, ref_zhaosheng_wuli],
      },
      {
        code: 'sheng_gongfei_shifan',
        name: '省级公费师范生',
        description: '面向本省农村中小学, 服务期 6 年',
        hardRules: [
          {
            scope: 'SUBSET', subset: '省级公费师范',
            rule: 'HOUSEHOLD_IN_REGION',
            params: { regions: REGION_143 },
          },
          {
            scope: 'SUBSET', subset: '省级公费师范',
            rule: 'SERVICE_COMMITMENT',
            params: { years: 6 },
          },
        ],
        references: [ref_143, ref_zhaosheng_wuli],
      },
      {
        code: 'bushu_shifan',
        name: '部属师范本研衔接公费',
        description: '教育部直属 6 师范, 本研衔接, 服务期 6 年',
        hardRules: [
          {
            scope: 'SUBSET', subset: '部属师范',
            rule: 'HOUSEHOLD_IN_REGION',
            params: { regions: REGION_119 },
          },
          {
            scope: 'SUBSET', subset: '部属师范',
            rule: 'SERVICE_COMMITMENT',
            params: { years: 6 },
          },
        ],
        references: [ref_119, ref_zhaosheng_wuli],
      },
      {
        code: 'xiangcun_zhenxing',
        name: '乡村振兴师范',
        description: '面向乡村振兴重点县, 服务期 6 年',
        hardRules: [
          {
            scope: 'SUBSET', subset: '乡村振兴',
            rule: 'HOUSEHOLD_IN_REGION',
            params: { regions: REGION_88 },
          },
          {
            scope: 'SUBSET', subset: '乡村振兴',
            rule: 'SERVICE_COMMITMENT',
            params: { years: 6 },
          },
        ],
        references: [ref_88, ref_zhaosheng_wuli],
      },
    ],
  },
  高职提前批: {
    scoreFloor: { type: 'ZHUANKE_LINE' },
    examTypes: ['物理', '历史'],
    volunteerMode: 'SEQUENTIAL',
    hardEligibility: [],
    subsets: [
      {
        code: 'dingxiang_junshi',
        name: '定向培养军士',
        description: '部分高职院校面向陆海空军方向培养',
        hardRules: [
          {
            scope: 'SUBSET', subset: '定向军士',
            rule: 'AGE_RANGE',
            params: { min: 17, max: 22, asOf: '2025-08-31' },
          },
          {
            scope: 'SUBSET', subset: '定向军士',
            rule: 'POLITICAL_REVIEW_REQUIRED',
          },
          {
            scope: 'SUBSET', subset: '定向军士',
            rule: 'PHYSICAL_EXAM_REQUIRED',
          },
        ],
        references: [ref_junjian, ref_zhaosheng_wuli],
      },
      {
        code: 'kongcheng',
        name: '空中乘务',
        description: '高职空乘专业, 身高/视力/面试',
        hardRules: [
          {
            scope: 'SUBSET', subset: '空乘',
            rule: 'VISION_STANDARD',
          },
        ],
        softHints: ['男生身高 172cm 以上, 女生 162cm 以上 + 面试合格'],
        references: [ref_zhaosheng_wuli],
      },
      {
        code: 'gongan_zhuanke',
        name: '公安专科',
        description: '公安类高职, 同公安院校政考要求',
        dataPending: true,
        references: [],
      },
      {
        code: 'sifa_jingyuan',
        name: '司法警院',
        description: '司法系统专科警院',
        dataPending: true,
        references: [],
      },
      {
        code: 'wunianyi',
        name: '五年制大专',
        description: '初中毕业起的五年一贯制',
        dataPending: true,
        references: [],
      },
    ],
  },
  高职批: {
    scoreFloor: { type: 'ZHUANKE_LINE' },
    examTypes: ['物理', '历史'],
    volunteerMode: 'PARALLEL',
    hardEligibility: [],
    subsets: [
      {
        code: 'puton_zhuan',
        name: '普通高职',
        description: '常规专科, 无特殊资格',
        hardRules: [],
        references: [ref_zhaosheng_wuli, ref_zhaosheng_lishi],
      },
      {
        code: 'zhongwai_zhuan',
        name: '中外合作办学高职',
        description: '高学费, 海外学位衔接',
        dataPending: true,
        references: [],
      },
    ],
  },
};

async function main() {
  console.log('Seeding batch recommendation rules (V2 subsets) for 四川 year=2026...');
  console.log(`Regions: 119/${REGION_119.length} 143/${REGION_143.length} 88/${REGION_88.length}`);
  let updated = 0;
  for (const [batch, rules] of Object.entries(RULES)) {
    const configs = await prisma.batchConfig.findMany({
      where: { batch, province: '四川', year: 2026 },
    });
    if (configs.length === 0) {
      console.warn(`⚠ no batchConfig found for batch="${batch}"`);
      continue;
    }
    for (const cfg of configs) {
      await prisma.batchConfig.update({
        where: { id: cfg.id },
        data: { eligibilityRules: rules as any },
      });
      updated++;
      const subsetCount = rules.subsets?.length ?? 0;
      console.log(`✓ updated batch_configs[id=${cfg.id}] ${batch} / ${cfg.examType} (${subsetCount} subsets)`);
    }
  }
  console.log(`Total updated: ${updated} rows`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 2: typecheck**

```bash
cd apps/server && pnpm exec tsc --noEmit
```

Expected: 无错误

- [ ] **Step 3: 本地跑脚本 (如果本地 DB 没起也行, 生产部署时再跑)**

跳过本地, 直接 commit。Phase 5 部署阶段会在生产跑。

- [ ] **Step 4: Commit**

```bash
git add apps/server/scripts/seed-batch-eligibility-rules.ts
git commit -m "feat(seed): V2 — 6 batches × 15 core subsets + dataPending placeholders

Each batch now has subsets[] array per spec § 五:
- 本科批A段: 普通类/国家专项/地方专项 (+ dataPending 高水平运动队)
- 本科批B段: 普通类/高校专项 (+ dataPending 中外合作/应用型)
- 本科提前批A段: 军校/公安/司法/航海 (+ dataPending 留俄/北电中传)
- 本科提前批B段: 免费医学/省级公费师范/部属师范/乡村振兴
- 高职提前批: 定向军士/空乘 (+ dataPending 公安专科/司法警院/五年制)
- 高职批: 普通高职 (+ dataPending 中外合作高职)

Each subset has hardRules + softHints + references[] (file links).
dataPending=true marks placeholders to fill post-launch.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase 2: 后端 API (confirmBatches + batch-recommendations)

### Task 5: 加 confirmBatches service 方法

**Files:**
- Modify: `apps/server/src/modules/student/student.service.ts`
- Modify: `apps/server/src/modules/student/student.service.spec.ts`

- [ ] **Step 1: 加 spec 测试 (RED)**

在 `student.service.spec.ts` 的 'intake workflow' describe 内 (在 unlockBatches 测试之前) 加:

```typescript
describe('confirmBatches', () => {
  const KNOWN_BATCHES = ['本科批A段', '本科批B段', '本科提前批A段', '本科提前批B段', '高职提前批', '高职批'];

  it('成功: 写入 preferredBatches + batchesConfirmedAt + intakeStatus=VERIFIED', async () => {
    prisma.studentProfile.findUnique.mockResolvedValue({
      id: 1,
      teacherId: 5,
      intakeStatus: 'SUBMITTED',
    });
    prisma.studentProfile.update.mockResolvedValue({ id: 1, intakeStatus: 'VERIFIED' });

    const result = await (service as any).confirmBatches(1, {
      teacherProfileId: 5,
      reviewerUserId: 20,
      preferredBatches: ['本科批A段', '本科批B段'],
      reviewComment: '面谈后确认',
    });

    expect(result).toHaveProperty('intakeStatus', 'VERIFIED');
    expect(prisma.studentProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1 },
        data: expect.objectContaining({
          preferredBatches: ['本科批A段', '本科批B段'],
          batchesConfirmedAt: expect.any(Date),
          intakeStatus: 'VERIFIED',
          intakeReviewedBy: 20,
          intakeReviewedAt: expect.any(Date),
          intakeReviewComment: '面谈后确认',
        }),
      }),
    );
  });

  it('校验失败: preferredBatches 为空数组 → BadRequest', async () => {
    prisma.studentProfile.findUnique.mockResolvedValue({ id: 1, teacherId: 5, intakeStatus: 'SUBMITTED' });
    await expect(
      (service as any).confirmBatches(1, {
        teacherProfileId: 5,
        reviewerUserId: 20,
        preferredBatches: [],
      }),
    ).rejects.toThrow(/至少选定/);
  });

  it('校验失败: preferredBatches 包含未知批次 → BadRequest', async () => {
    prisma.studentProfile.findUnique.mockResolvedValue({ id: 1, teacherId: 5, intakeStatus: 'SUBMITTED' });
    await expect(
      (service as any).confirmBatches(1, {
        teacherProfileId: 5,
        reviewerUserId: 20,
        preferredBatches: ['强基计划'],  // 不在 6 主批次白名单
      }),
    ).rejects.toThrow(/未知批次/);
  });

  it('校验失败: 学生 intakeStatus = DRAFT → Conflict', async () => {
    prisma.studentProfile.findUnique.mockResolvedValue({ id: 1, teacherId: 5, intakeStatus: 'DRAFT' });
    await expect(
      (service as any).confirmBatches(1, {
        teacherProfileId: 5,
        reviewerUserId: 20,
        preferredBatches: ['本科批A段'],
      }),
    ).rejects.toThrow(/学生尚未提交资料/);
  });

  it('权限: 非所属老师 → Forbidden', async () => {
    prisma.studentProfile.findUnique.mockResolvedValue({ id: 1, teacherId: 5, intakeStatus: 'SUBMITTED' });
    await expect(
      (service as any).confirmBatches(1, {
        teacherProfileId: 99,
        reviewerUserId: 20,
        preferredBatches: ['本科批A段'],
      }),
    ).rejects.toThrow(/无权/);
  });
});
```

- [ ] **Step 2: 跑测试 RED**

```bash
cd apps/server && pnpm exec jest src/modules/student/student.service.spec.ts -t 'confirmBatches'
```

Expected: 5 个测试 FAIL (`confirmBatches is not a function`)

- [ ] **Step 3: 在 service 加 confirmBatches 方法**

`apps/server/src/modules/student/student.service.ts` 中, 在 `unlockBatches` 方法后追加:

```typescript
  /**
   * 老师在批次推荐页确认最终批次, 同时把 intakeStatus 切到 VERIFIED。
   * 见 docs/superpowers/specs/2026-06-03-batch-recommendation-page-design.md § 六.2
   */
  async confirmBatches(
    studentId: number,
    opts: {
      teacherProfileId?: number;
      reviewerUserId: number;
      preferredBatches: string[];
      reviewComment?: string;
    },
  ) {
    const KNOWN_BATCHES = new Set([
      '本科批A段',
      '本科批B段',
      '本科提前批A段',
      '本科提前批B段',
      '高职提前批',
      '高职批',
    ]);
    if (!Array.isArray(opts.preferredBatches) || opts.preferredBatches.length === 0) {
      throw new BadRequestException('至少选定 1 个批次');
    }
    for (const b of opts.preferredBatches) {
      if (!KNOWN_BATCHES.has(b)) {
        throw new BadRequestException(`未知批次: ${b}`);
      }
    }
    const student = await this.prisma.studentProfile.findUnique({
      where: { id: studentId },
      select: { id: true, teacherId: true, intakeStatus: true },
    });
    if (!student) throw new NotFoundException('学生不存在');
    if (opts.teacherProfileId !== undefined && student.teacherId !== opts.teacherProfileId) {
      throw new ForbiddenException('无权确认不属于自己的学生的批次');
    }
    if (student.intakeStatus !== 'SUBMITTED' && student.intakeStatus !== 'NEEDS_CHANGES') {
      throw new ConflictException('学生尚未提交资料或已确认');
    }
    return this.prisma.studentProfile.update({
      where: { id: studentId },
      data: {
        preferredBatches: opts.preferredBatches as any,
        batchesConfirmedAt: new Date(),
        intakeStatus: 'VERIFIED',
        intakeReviewedBy: opts.reviewerUserId,
        intakeReviewedAt: new Date(),
        intakeReviewComment: opts.reviewComment ?? null,
      },
    });
  }
```

确认 `BadRequestException`、`ConflictException` import 都在文件顶部 (Plan A 已 import)。

- [ ] **Step 4: 跑测试 GREEN**

```bash
cd apps/server && pnpm exec jest src/modules/student/student.service.spec.ts -t 'confirmBatches'
```

Expected: 5 个测试 PASS

- [ ] **Step 5: typecheck**

```bash
cd apps/server && pnpm exec tsc --noEmit
```

Expected: 无错误

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/modules/student/
git commit -m "feat(student): add confirmBatches service method

Plan recommendation Task 5. Teacher writes preferredBatches +
locks batchesConfirmedAt + flips intakeStatus to VERIFIED in one tx.
Validates against 6 主批次 whitelist + teacher ownership.

5 spec tests cover: success, empty batches, unknown batch,
DRAFT student, non-owning teacher.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: 加 POST /students/:id/confirm-batches controller endpoint

**Files:**
- Modify: `apps/server/src/modules/student/student.controller.ts`

- [ ] **Step 1: 加 endpoint**

`apps/server/src/modules/student/student.controller.ts` 中, 在 `unlockBatches` endpoint 后追加:

```typescript
  @Post(':id/confirm-batches')
  @ApiOperation({ summary: '老师在批次推荐页确认最终批次' })
  @CheckPolicies((ability) => ability.can('update', 'StudentProfile'))
  async confirmBatches(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayloadUser,
    @Body() body: { preferredBatches: string[]; reviewComment?: string },
  ) {
    return this.studentService.confirmBatches(id, {
      teacherProfileId: user.role === 'ADMIN' ? undefined : user.teacherProfileId ?? undefined,
      reviewerUserId: user.id,
      preferredBatches: body.preferredBatches,
      reviewComment: body.reviewComment,
    });
  }
```

- [ ] **Step 2: typecheck**

```bash
cd apps/server && pnpm exec tsc --noEmit
```

Expected: 无错误

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/modules/student/student.controller.ts
git commit -m "feat(student): add POST /students/:id/confirm-batches endpoint

Plan recommendation Task 6. Teacher (or ADMIN) endpoint to lock
in batch decision from recommendation page UI.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: 升级 listEligibleForStudent 返回 BatchRecommendationsResponse

**Files:**
- Modify: `apps/server/src/modules/batch-config/batch-config.service.ts`
- Modify: `apps/server/src/modules/batch-config/batch-config.service.spec.ts`

- [ ] **Step 1: 加新测试**

`batch-config.service.spec.ts` 中追加 describe:

```typescript
describe('listEligibleForStudent V2 (含 subsetResults)', () => {
  const baseStudent = {
    id: 10,
    teacherId: 99,
    examType: 'PHYSICS',
    examYear: 2026,
    totalScore: 480,
    province: '四川',
    county: '叙永县',
    isRural: true,
    politicalStatus: null,
    user: { birthDate: new Date('2008-01-01') },
  };
  const teacherUser = {
    role: 'TEACHER',
    teacherProfileId: 99,
    studentProfileId: null,
    isSupervisor: false,
  };

  it('返回 subsetResults 数组 (V2 结构)', async () => {
    prismaMock.studentProfile.findUnique.mockResolvedValue(baseStudent);
    prismaMock.batchConfig.findMany.mockResolvedValue([
      {
        id: 1, batch: '本科批A段', examType: '物理',
        maxGroupCount: 45, maxMajorPerGroup: 6, volunteerMode: 'parallel', admissionOrder: 5,
        eligibilityRules: {
          scoreFloor: { type: 'BATCH_LINE' },
          examTypes: ['物理'],
          volunteerMode: 'PARALLEL',
          hardEligibility: [],
          subsets: [
            { code: 'puton', name: '普通类', description: '一般本科', hardRules: [], references: [] },
            {
              code: 'guojia',
              name: '国家专项',
              description: '面向贫困县',
              hardRules: [{
                scope: 'SUBSET', subset: '国家专项',
                rule: 'RURAL_HOUSEHOLD_IN_REGION',
                params: { regions: ['叙永县'] },
              }],
              references: [{ title: '119 县名单', filename: 'p119.xlsx', type: 'xlsx' }],
            },
          ],
        },
      },
    ]);
    prismaMock.batchLine.findMany.mockResolvedValue([{ batch: '本科批次', examType: '物理类', score: 438 }]);

    const result = await service.listEligibleForStudent(10, teacherUser);
    expect(result[0].verdict).toBe('ELIGIBLE');
    expect(result[0].subsetResults).toHaveLength(2);
    expect(result[0].subsetResults?.[0].code).toBe('puton');
    expect(result[0].subsetResults?.[1].code).toBe('guojia');
    expect(result[0].subsetResults?.[1].references[0].downloadUrl).toBe('/attachments/policy/p119.xlsx');
  });
});
```

- [ ] **Step 2: 跑测试 RED**

```bash
cd apps/server && pnpm exec jest src/modules/batch-config/batch-config.service.spec.ts -t 'V2'
```

Expected: FAIL (subsetResults 字段 undefined)

- [ ] **Step 3: 修改返回类型 (实际改动)**

打开 `apps/server/src/modules/batch-config/batch-config.service.ts`, 找到 `EligibleBatchForStudent` 接口, 加可选字段:

```typescript
export interface EligibleBatchForStudent extends BatchEligibilityResult {
  batchName: string;
  maxGroupCount: number;
  maxMajorPerGroup: number;
  volunteerMode: string;
  admissionOrder: number;
  // subsetResults 已经在 BatchEligibilityResult 里 (Task 3 加的可选字段)
}
```

实际上 `BatchEligibilityResult` 已经有 `subsetResults?` (Task 3 加), 所以 service 不需要再改, 因为 `...verdict` spread 会自动带 subsetResults。

唯一需要验证的是 `judgeBatchEligibility` 返回值确实包含 subsetResults。Task 3 已实现。

- [ ] **Step 4: 跑测试 GREEN**

```bash
cd apps/server && pnpm exec jest src/modules/batch-config/batch-config.service.spec.ts
```

Expected: 全部 PASS (含 V2 新测试)

- [ ] **Step 5: typecheck**

```bash
cd apps/server && pnpm exec tsc --noEmit
```

Expected: 无错误

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/modules/batch-config/batch-config.service.spec.ts
git commit -m "test(batch-config): add V2 spec verifying subsetResults in response

Plan recommendation Task 7. listEligibleForStudent already returns
subsetResults transparently via spread, this test pins the contract.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase 3: 文件上传 + nginx (基础设施)

### Task 8: 上传 8 个本期可用文件到生产 + nginx location

**Files:**
- Create local: `data/政策附件/` 目录 + 8 个文件 (从已有 data/ 复制并重命名)
- Server: `/home/ubuntu/apps/volunteer-helper/attachments/policy/` 上传
- Server nginx config: 加 location block

- [ ] **Step 1: 本地准备 8 文件**

```bash
mkdir -p /c/Users/17697/Documents/VolunteerHelper/data/政策附件
cd /c/Users/17697/Documents/VolunteerHelper/data/政策附件
cp "../07_政策文件/2 2024省级公费师范生范围.xlsx" policy_2_143_shifan.xlsx
cp "../07_政策文件/3 四川省原集中连片特殊困难县和原国家级扶贫开发重点县名单.xlsx" policy_3_68_jizhonglianpian.xlsx
cp "../07_政策文件/4 四川省乡村振兴实施范围县(市、区)名单.xlsx" policy_4_87_xiangcun.xlsx
cp "../07_政策文件/5 四川省原深度贫困县名单.xlsx" policy_5_88_xiangcun.xlsx
cp "../07_政策文件/6 四川省民族地区、原集中连片特殊困难地区和革命老区、艰苦边远地区名单.xlsx" policy_6_119_counties.xlsx
cp "../招生考试报/物理类/物理2025招生计划_前言&附件.pdf" zhaosheng_2025_wuli_qianyan.pdf
cp "../招生考试报/历史类/历史2025招生计划_前言&附件.pdf" zhaosheng_2025_lishi_qianyan.pdf
cp "../07_政策文件/军队选拔军官和文职人员体检标准.pdf" junjian_tijian.pdf
ls -lh
```

Expected: 8 个文件存在。

(注: `policy_5_88_xiangcun.xlsx` 跟 `policy_4_87_xiangcun.xlsx` 名字看着像但内容不同 — policy_5 是 88 县, policy_4 是 87 县。seed 脚本 ref_88 用 policy_5_88_xiangcun.xlsx, ref_lookups 都对得上。)

- [ ] **Step 2: scp 到生产**

```bash
cd /c/Users/17697/Documents/VolunteerHelper
ssh -i cube.pem ubuntu@132.232.245.53 "mkdir -p /home/ubuntu/apps/volunteer-helper/attachments/policy"
scp -i cube.pem data/政策附件/*.{xlsx,pdf} ubuntu@132.232.245.53:/home/ubuntu/apps/volunteer-helper/attachments/policy/
ssh -i cube.pem ubuntu@132.232.245.53 "ls -lh /home/ubuntu/apps/volunteer-helper/attachments/policy/"
```

Expected: 服务器列出 8 个文件。

- [ ] **Step 3: nginx config 加 location**

SSH 到生产并 sudo 编辑:

```bash
ssh -i cube.pem ubuntu@132.232.245.53 "sudo cat /etc/nginx/sites-enabled/volunteer-helper | grep -A 3 'attachments'"
```

如果已有 `/attachments/historical/` 类似 location, 复制一份, path 改成 policy。

模板:

```nginx
location /attachments/policy/ {
  alias /home/ubuntu/apps/volunteer-helper/attachments/policy/;
  add_header Content-Disposition "inline";
  expires 1d;
  add_header Cache-Control "private, max-age=86400";
}
```

加完执行:

```bash
ssh -i cube.pem ubuntu@132.232.245.53 "sudo nginx -t && sudo nginx -s reload"
```

Expected: `nginx: configuration test is successful`

- [ ] **Step 4: 验证可下载**

```bash
ssh -i cube.pem ubuntu@132.232.245.53 "curl -s -o /dev/null -w '%{http_code} %{size_download}\n' http://localhost/attachments/policy/policy_6_119_counties.xlsx"
```

Expected: `200 11651` (或接近, 文件大小)

- [ ] **Step 5: 本地加 .gitignore (data/政策附件 不入仓)**

打开 `.gitignore`, 检查是否已有 `data/*` (Plan A 已加)。如果没有, 加:

```
/data/政策附件/
```

如果 `/data/*` 已经覆盖, 不需要再改。

- [ ] **Step 6: Commit (gitignore 改动 if any) + 部署记录**

```bash
cd /c/Users/17697/Documents/VolunteerHelper
# 如果 gitignore 有改:
git add .gitignore
git commit -m "infra: upload 8 policy attachment files + nginx /attachments/policy/

Plan recommendation Task 8. 8 files uploaded to prod:
- 5 county/eligibility xlsx
- 2 招生考试报 2025 PDF (物理/历史 前言+附件)
- 1 军队体检标准 PDF

nginx location /attachments/policy/ alias to /home/ubuntu/.../policy/
inline Content-Disposition (PDF 可在浏览器预览).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

(如果 gitignore 无改动, 跳过 commit, 服务器侧改动不入仓。)

---

## Phase 4: 前端推荐页

### Task 9: 前端 API client + types

**Files:**
- Create: `apps/web/src/lib/api/batchRecommendations.ts`
- Create: `apps/web/src/lib/api/__tests__/batchRecommendations.test.ts`

- [ ] **Step 1: 写 client**

```typescript
// apps/web/src/lib/api/batchRecommendations.ts
import { httpClient } from './client'; // 项目现有 axios wrapper, 若名字不同需调整 import

export type Verdict = 'ELIGIBLE' | 'CONDITIONAL' | 'INELIGIBLE' | 'DATA_PENDING';

export interface ReferenceItem {
  title: string;
  filename: string | null;
  type: 'pdf' | 'xlsx' | 'announcement';
  downloadUrl: string | null;
  available: boolean;
  sourceNote?: string;
}

export interface SubsetResult {
  code: string;
  name: string;
  description: string;
  verdict: Verdict;
  rulesEval: Array<{
    ruleCode: string;
    requirement: string;
    actual: string;
    pass: 'PASS' | 'FAIL' | 'UNCERTAIN' | 'SOFT_HINT';
  }>;
  references: ReferenceItem[];
}

export interface BatchRecommendation {
  batchConfigId: number;
  batchName: string;
  volunteerMode: string;
  admissionOrder: number;
  verdict: Verdict;
  reasons: Array<{ type: string; message: string }>;
  subsetResults?: SubsetResult[];
}

export interface BatchRecommendationsResponse {
  batches: BatchRecommendation[];
  batchesConfirmedAt: string | null;
}

export async function fetchBatchRecommendations(studentId: number): Promise<BatchRecommendationsResponse> {
  // 复用现有 eligible-batches 端点返回 + 学生 lock 状态 (Phase 5 时如果需要单独 endpoint, 再加)
  const batches = await httpClient.get<BatchRecommendation[]>(`/students/${studentId}/eligible-batches`);
  // 取学生 batchesConfirmedAt
  const student = await httpClient.get<{ batchesConfirmedAt: string | null }>(`/students/${studentId}`);
  return {
    batches,
    batchesConfirmedAt: student.batchesConfirmedAt,
  };
}

export async function confirmBatches(
  studentId: number,
  preferredBatches: string[],
  reviewComment?: string,
): Promise<void> {
  await httpClient.post(`/students/${studentId}/confirm-batches`, {
    preferredBatches,
    reviewComment,
  });
}

export async function unlockBatches(studentId: number): Promise<void> {
  await httpClient.post(`/students/${studentId}/unlock-batches`, {});
}
```

(注: 实际 import 路径取决于项目 axios wrapper 在哪。先用 placeholder `./client`, 实施时检查替换。)

- [ ] **Step 2: 写 client unit test**

```typescript
// apps/web/src/lib/api/__tests__/batchRecommendations.test.ts
jest.mock('../client', () => ({
  httpClient: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));
import { fetchBatchRecommendations, confirmBatches, unlockBatches } from '../batchRecommendations';
import { httpClient } from '../client';

describe('batchRecommendations API client', () => {
  beforeEach(() => jest.clearAllMocks());

  it('fetchBatchRecommendations 调 2 个端点合并', async () => {
    (httpClient.get as jest.Mock)
      .mockResolvedValueOnce([{ batchConfigId: 1, batchName: '本科批A段', verdict: 'ELIGIBLE' }])
      .mockResolvedValueOnce({ batchesConfirmedAt: null });
    const result = await fetchBatchRecommendations(10);
    expect(httpClient.get).toHaveBeenCalledWith('/students/10/eligible-batches');
    expect(httpClient.get).toHaveBeenCalledWith('/students/10');
    expect(result.batches).toHaveLength(1);
    expect(result.batchesConfirmedAt).toBe(null);
  });

  it('confirmBatches 提交 preferredBatches', async () => {
    (httpClient.post as jest.Mock).mockResolvedValueOnce({});
    await confirmBatches(10, ['本科批A段', '本科批B段'], '面谈备注');
    expect(httpClient.post).toHaveBeenCalledWith('/students/10/confirm-batches', {
      preferredBatches: ['本科批A段', '本科批B段'],
      reviewComment: '面谈备注',
    });
  });

  it('unlockBatches 发空 body', async () => {
    (httpClient.post as jest.Mock).mockResolvedValueOnce({});
    await unlockBatches(10);
    expect(httpClient.post).toHaveBeenCalledWith('/students/10/unlock-batches', {});
  });
});
```

- [ ] **Step 3: 跑测试**

```bash
cd apps/web && pnpm exec jest src/lib/api/__tests__/batchRecommendations.test.ts
```

Expected: 3 PASS

- [ ] **Step 4: typecheck**

```bash
cd apps/web && pnpm exec tsc --noEmit
```

Expected: 无错误 (若 `./client` 路径不对, 调整)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/api/batchRecommendations.ts apps/web/src/lib/api/__tests__/batchRecommendations.test.ts
git commit -m "feat(api): batchRecommendations client (fetch/confirm/unlock)

Plan recommendation Task 9. Frontend API wrapper for new batch
recommendation page. Combines GET /eligible-batches + GET /students/:id
into single fetch, plus POST confirm-batches and POST unlock-batches.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: 推荐页主组件 + 路由 + 数据获取

**Files:**
- Create: `apps/web/src/app/(teacher)/teacher/students/[id]/batch-recommendations/page.tsx`
- Create: `apps/web/src/app/(teacher)/teacher/students/[id]/batch-recommendations/BatchRecommendationsClient.tsx`

- [ ] **Step 1: 写 server-side page (Next.js 14 app router)**

```typescript
// apps/web/src/app/(teacher)/teacher/students/[id]/batch-recommendations/page.tsx
import { BatchRecommendationsClient } from './BatchRecommendationsClient';

export default function Page({ params }: { params: { id: string } }) {
  const studentId = Number(params.id);
  if (!Number.isFinite(studentId) || studentId <= 0) {
    return <div>无效的学生 ID</div>;
  }
  return <BatchRecommendationsClient studentId={studentId} />;
}
```

- [ ] **Step 2: 写 client component**

```typescript
// apps/web/src/app/(teacher)/teacher/students/[id]/batch-recommendations/BatchRecommendationsClient.tsx
'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  fetchBatchRecommendations,
  confirmBatches,
  unlockBatches,
  type BatchRecommendationsResponse,
} from '@/lib/api/batchRecommendations';

export function BatchRecommendationsClient({ studentId }: { studentId: number }) {
  const router = useRouter();
  const [data, setData] = useState<BatchRecommendationsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchBatchRecommendations(studentId)
      .then((r) => {
        setData(r);
        // 若已锁定, 用既有 preferredBatches 预填选中状态
        // (eligible-batches 返回不含 preferredBatches, 由 batchesConfirmedAt 表示是否锁定)
      })
      .catch((e) => setError(String(e?.response?.data?.message ?? e?.message ?? e)));
  }, [studentId]);

  if (error) return <div className="p-6 text-red-600">加载失败: {error}</div>;
  if (!data) return <div className="p-6">加载中…</div>;

  const isLocked = !!data.batchesConfirmedAt;

  function toggle(batchName: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(batchName)) next.delete(batchName);
      else next.add(batchName);
      return next;
    });
  }

  async function handleSubmit() {
    if (selected.size === 0) {
      setError('至少勾选 1 个批次');
      return;
    }
    setSubmitting(true);
    try {
      await confirmBatches(studentId, Array.from(selected), comment || undefined);
      router.push(`/teacher/students/${studentId}`);
    } catch (e: any) {
      setError(String(e?.response?.data?.message ?? e?.message ?? e));
      setSubmitting(false);
    }
  }

  async function handleUnlock() {
    if (!confirm('确认解锁? 学生会回到资料修改状态')) return;
    setSubmitting(true);
    try {
      await unlockBatches(studentId);
      const fresh = await fetchBatchRecommendations(studentId);
      setData(fresh);
      setSelected(new Set());
    } catch (e: any) {
      setError(String(e?.response?.data?.message ?? e?.message ?? e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="p-6 space-y-6">
      {isLocked && (
        <div className="border p-4 bg-yellow-50">
          <div>已锁定: {new Date(data.batchesConfirmedAt!).toLocaleString()}</div>
          <button
            className="mt-2 px-3 py-1 border rounded"
            disabled={submitting}
            onClick={handleUnlock}
          >
            重新打开
          </button>
        </div>
      )}
      <h1 className="text-xl font-bold">批次推荐</h1>
      <a
        href={`/teacher/students/${studentId}`}
        className="text-blue-600 underline text-sm"
      >
        ← 返回学生详情 / 回填资料
      </a>
      <BatchCardList
        batches={data.batches}
        selected={selected}
        onToggle={toggle}
        disabled={isLocked || submitting}
      />
      {!isLocked && (
        <div className="border-t pt-4 sticky bottom-0 bg-white">
          <div className="mb-2">已选 {selected.size} 个批次</div>
          <textarea
            className="w-full border rounded p-2 mb-2"
            placeholder="老师备注 (可选)"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          <button
            className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
            disabled={submitting || selected.size === 0}
            onClick={handleSubmit}
          >
            确认并提交
          </button>
        </div>
      )}
    </div>
  );
}

// 占位组件, Task 11 实装
function BatchCardList({
  batches,
  selected,
  onToggle,
  disabled,
}: {
  batches: any[];
  selected: Set<string>;
  onToggle: (b: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="space-y-4">
      {batches.map((b) => (
        <div key={b.batchConfigId} className="border p-4 rounded">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={selected.has(b.batchName)}
              onChange={() => onToggle(b.batchName)}
              disabled={disabled}
            />
            <span className="font-semibold">{b.batchName}</span>
            <span className="text-sm text-gray-600">[{b.verdict}]</span>
          </label>
          <div className="mt-2 text-sm">
            {(b.subsetResults ?? []).map((s: any) => (
              <div key={s.code} className="ml-4 text-gray-700">
                ▸ {s.name} — {s.verdict}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: typecheck**

```bash
cd apps/web && pnpm exec tsc --noEmit
```

Expected: 无错误

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/\(teacher\)/teacher/students/\[id\]/batch-recommendations/
git commit -m "feat(teacher): batch recommendation page skeleton + data flow

Plan recommendation Task 10. Page + client component:
- /teacher/students/:id/batch-recommendations route
- Fetch batches via API client
- Lock banner + unlock button
- Checkbox selection state
- Submit → POST confirm-batches → redirect to student detail

Visual polish (BatchCard / SubsetItem 详细展开) deferred to Task 11
+ claude-design pass.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: 子类别详情面板 + 文件列表组件

**Files:**
- Create: `apps/web/src/app/(teacher)/teacher/students/[id]/batch-recommendations/BatchCard.tsx`
- Create: `apps/web/src/app/(teacher)/teacher/students/[id]/batch-recommendations/SubsetItem.tsx`
- Create: `apps/web/src/app/(teacher)/teacher/students/[id]/batch-recommendations/ReferencesList.tsx`
- Modify: `BatchRecommendationsClient.tsx` 改用 BatchCard

- [ ] **Step 1: 写 BatchCard**

```typescript
// apps/web/src/app/(teacher)/teacher/students/[id]/batch-recommendations/BatchCard.tsx
'use client';
import { useState } from 'react';
import { SubsetItem } from './SubsetItem';
import type { BatchRecommendation } from '@/lib/api/batchRecommendations';

const VERDICT_TEXT: Record<string, { label: string; color: string }> = {
  ELIGIBLE: { label: '推荐', color: 'bg-green-100 text-green-700' },
  CONDITIONAL: { label: '可冲', color: 'bg-yellow-100 text-yellow-700' },
  INELIGIBLE: { label: '不可填', color: 'bg-red-100 text-red-700' },
  DATA_PENDING: { label: '详情待补充', color: 'bg-gray-100 text-gray-700' },
};

export function BatchCard({
  batch,
  selected,
  onToggle,
  disabled,
}: {
  batch: BatchRecommendation;
  selected: boolean;
  onToggle: () => void;
  disabled: boolean;
}) {
  const v = VERDICT_TEXT[batch.verdict] ?? VERDICT_TEXT.DATA_PENDING;
  const topReason = batch.reasons?.[0]?.message ?? '—';
  return (
    <div className="border rounded p-4">
      <div className="flex items-start justify-between gap-2">
        <label className="flex items-start gap-2 flex-1">
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggle}
            disabled={disabled}
            className="mt-1"
          />
          <div>
            <div className="font-semibold">{batch.batchName}</div>
            <div className="text-xs text-gray-500">志愿模式: {batch.volunteerMode}</div>
            <div className="text-sm mt-1">{topReason}</div>
          </div>
        </label>
        <span className={`text-xs px-2 py-1 rounded ${v.color}`}>{v.label}</span>
      </div>
      <div className="mt-3 space-y-2">
        {(batch.subsetResults ?? []).map((s) => (
          <SubsetItem key={s.code} subset={s} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 写 SubsetItem**

```typescript
// apps/web/src/app/(teacher)/teacher/students/[id]/batch-recommendations/SubsetItem.tsx
'use client';
import { useState } from 'react';
import { ReferencesList } from './ReferencesList';
import type { SubsetResult } from '@/lib/api/batchRecommendations';

const VERDICT_LABEL: Record<string, string> = {
  ELIGIBLE: '推荐', CONDITIONAL: '可冲', INELIGIBLE: '不可填', DATA_PENDING: '详情待补充',
};
const PASS_ICON: Record<string, string> = {
  PASS: '✓', FAIL: '✗', UNCERTAIN: '?', SOFT_HINT: 'ℹ',
};

export function SubsetItem({ subset }: { subset: SubsetResult }) {
  const [expanded, setExpanded] = useState(false);
  const oneLineReason = subset.rulesEval.find((r) => r.pass === 'FAIL')?.requirement
    ?? subset.rulesEval.find((r) => r.pass === 'SOFT_HINT')?.requirement
    ?? subset.description;
  return (
    <div className="border-l-2 pl-3">
      <button
        type="button"
        className="w-full text-left text-sm hover:bg-gray-50 p-1"
        onClick={() => setExpanded((x) => !x)}
      >
        <span className="font-medium">{subset.name}</span>
        <span className="ml-2 text-xs text-gray-500">[{VERDICT_LABEL[subset.verdict]}]</span>
        <span className="ml-2 text-xs text-gray-600">— {oneLineReason}</span>
        <span className="float-right text-xs text-blue-600">{expanded ? '收起 ▲' : '展开 ▼'}</span>
      </button>
      {expanded && (
        <div className="ml-3 mt-2 text-xs space-y-2">
          <div className="text-gray-700">{subset.description}</div>
          {subset.rulesEval.length > 0 && (
            <ul className="space-y-1">
              {subset.rulesEval.map((r, i) => (
                <li key={i}>
                  <span className="mr-1">{PASS_ICON[r.pass]}</span>
                  <span>{r.requirement}: {r.actual}</span>
                </li>
              ))}
            </ul>
          )}
          <ReferencesList references={subset.references} />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: 写 ReferencesList**

```typescript
// apps/web/src/app/(teacher)/teacher/students/[id]/batch-recommendations/ReferencesList.tsx
'use client';
import type { ReferenceItem } from '@/lib/api/batchRecommendations';

export function ReferencesList({ references }: { references: ReferenceItem[] }) {
  if (!references || references.length === 0) return null;
  return (
    <div>
      <div className="font-medium mb-1">相关文件:</div>
      <ul className="space-y-1">
        {references.map((ref, i) => (
          <li key={i} className="flex items-center gap-2">
            <span>{ref.type === 'pdf' ? '📄' : ref.type === 'xlsx' ? '📊' : '🌐'}</span>
            <span>{ref.title}</span>
            {ref.available && ref.downloadUrl ? (
              <>
                <a className="text-blue-600 underline" href={ref.downloadUrl} target="_blank" rel="noopener">预览</a>
                <a className="text-blue-600 underline" href={`${ref.downloadUrl}?download=1`}>下载</a>
              </>
            ) : (
              <span className="text-gray-400 text-xs italic">
                文件待补
                {ref.sourceNote && <> — {ref.sourceNote}</>}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: 改 BatchRecommendationsClient 用 BatchCard**

`BatchRecommendationsClient.tsx` 中, 删除底部的 placeholder `BatchCardList` 函数定义, 在文件顶部 import:

```typescript
import { BatchCard } from './BatchCard';
```

替换组件渲染:

```typescript
<div className="space-y-4">
  {data.batches.map((b) => (
    <BatchCard
      key={b.batchConfigId}
      batch={b}
      selected={selected.has(b.batchName)}
      onToggle={() => toggle(b.batchName)}
      disabled={isLocked || submitting}
    />
  ))}
</div>
```

(替换原 `<BatchCardList ... />`。)

- [ ] **Step 5: typecheck**

```bash
cd apps/web && pnpm exec tsc --noEmit
```

Expected: 无错误

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/\(teacher\)/teacher/students/\[id\]/batch-recommendations/
git commit -m "feat(teacher): BatchCard + SubsetItem + ReferencesList components

Plan recommendation Task 11. Full UI components:
- BatchCard: 卡片 + verdict 标签 + 勾选框 + 一句话原因
- SubsetItem: 折叠态 / 展开态; 展开显示 rulesEval 逐条 + ReferencesList
- ReferencesList: 文件名 + 预览/下载 / 缺失文件 sourceNote

Verdict 中文映射 + PASS/FAIL/UNCERTAIN/SOFT_HINT 图标。
Styling: 基础 Tailwind, 留 claude-design 后续 polish.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: 老师 dashboard 待审列表行链接 + 学生详情页按钮

**Files:**
- Modify: 找老师 dashboard 待审列表组件 (具体路径见 Step 1)
- Modify: 找学生详情页主组件

- [ ] **Step 1: 找文件位置**

```bash
grep -rn "intakeStatus.*SUBMITTED" /c/Users/17697/Documents/VolunteerHelper/apps/web/src --include="*.tsx" --include="*.ts" 2>&1 | head -10
```

记下 1-2 个匹配文件。

```bash
grep -rn "查看推荐批次\|batch-recommendations" /c/Users/17697/Documents/VolunteerHelper/apps/web/src --include="*.tsx" --include="*.ts" 2>&1 | head -10
```

确认目前还没接入。

- [ ] **Step 2: 老师待审列表 — 行链接改路由**

打开找到的待审列表组件 (`apps/web/src/app/(teacher)/teacher/dashboard/*` 或 `apps/web/src/components/teacher/*` 下)。

找到 SUBMITTED 学生行的 onClick / href, 改成:

```tsx
href={`/teacher/students/${student.id}/batch-recommendations`}
```

(如果原来是详情页 `/teacher/students/${student.id}`, 改这一行即可。)

- [ ] **Step 3: 学生详情页加 "查看推荐批次" 按钮**

打开 `apps/web/src/app/(teacher)/teacher/students/[id]/page.tsx`, 找到 intakeStatus 显示区域 (通常在头部 Status 区), 加按钮:

```tsx
{(student.intakeStatus === 'SUBMITTED' || student.intakeStatus === 'NEEDS_CHANGES' || student.intakeStatus === 'VERIFIED') && (
  <a
    href={`/teacher/students/${student.id}/batch-recommendations`}
    className="px-3 py-1 border rounded text-sm hover:bg-gray-50"
  >
    {student.batchesConfirmedAt ? '查看/修改批次' : '查看推荐批次'}
  </a>
)}
```

- [ ] **Step 4: typecheck**

```bash
cd apps/web && pnpm exec tsc --noEmit
```

Expected: 无错误

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/
git commit -m "feat(teacher): wire dashboard SUBMITTED row + detail page button to recommendation page

Plan recommendation Task 12. Two entry points to batch-recommendations:
- Dashboard 待审列表 row click
- Student detail page 「查看推荐批次」 button (visible after SUBMITTED)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase 5: 部署 + e2e

### Task 13: 后端 build + 部署 + seed 重跑

**Files:** N/A (部署)

- [ ] **Step 1: 后端 build**

```bash
cd /c/Users/17697/Documents/VolunteerHelper/apps/server
pnpm exec prisma generate
pnpm build
```

Expected: dist/ 更新, 无错误

- [ ] **Step 2: 部署**

```bash
cd /c/Users/17697/Documents/VolunteerHelper
python deploy_auto.py --skip-build --skip-tests
```

Expected: scp 上传 + pm2 重启 + warmup 4 路由 200

- [ ] **Step 3: scp seed 脚本 + 跑 seed**

```bash
cd /c/Users/17697/Documents/VolunteerHelper
scp -i cube.pem apps/server/scripts/seed-batch-eligibility-rules.ts ubuntu@132.232.245.53:/home/ubuntu/apps/volunteer-helper/apps/server/scripts/
ssh -i cube.pem ubuntu@132.232.245.53 "cd /home/ubuntu/apps/volunteer-helper/apps/server && set -a && . ./.env && set +a && ts-node --transpileOnly scripts/seed-batch-eligibility-rules.ts 2>&1 | tail -20"
```

Expected: `Total updated: 10 rows` (5 主批次 × 物理/历史; 本科批 A 段在 DB 是细分行, 仍会 warn 但 5 行 update OK)

- [ ] **Step 4: DB 验证 subsets 写入**

```bash
ssh -i cube.pem ubuntu@132.232.245.53 "cd /home/ubuntu/apps/volunteer-helper/apps/server && set -a && . ./.env && set +a && DBPASS=\$(echo \$DATABASE_URL | sed -E 's|.*//[^:]+:([^@]+)@.*|\1|') && mysql -u root -p\"\$DBPASS\" volunteer_helper -e \"SELECT batch, exam_type, JSON_LENGTH(JSON_EXTRACT(eligibility_rules, '\\\$.subsets')) AS subsetN FROM batch_configs WHERE province='四川' AND year=2026 AND eligibility_rules IS NOT NULL ORDER BY admission_order, exam_type\""
```

Expected: 每行 subsetN ≥ 2

- [ ] **Step 5: 无 commit (部署本身)**

---

### Task 14: 前端 build + 部署

**Files:** N/A (部署)

- [ ] **Step 1: web build**

```bash
cd /c/Users/17697/Documents/VolunteerHelper/apps/web
pnpm build
```

Expected: `.next/` 更新, 无错误

- [ ] **Step 2: 部署 (deploy_auto 同时部 web 和 server)**

```bash
cd /c/Users/17697/Documents/VolunteerHelper
python deploy_auto.py --skip-build --skip-tests
```

Expected: 部署成功, pm2 重启, warmup 200

- [ ] **Step 3: 检查 /teacher/students/:id/batch-recommendations 路由 (无 token 401)**

```bash
ssh -i cube.pem ubuntu@132.232.245.53 "curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3004/teacher/students/1/batch-recommendations"
```

Expected: 200 (Next.js 渲染了 HTML, 客户端 fetch 才会触发 401, 这是 SPA 行为正常)

---

### Task 15: 三角色 e2e 复测

**Files:** N/A (验证)

- [ ] **Step 1: 学生角色登录 → 填资料 → 提交**

浏览器或 curl 登录学生账号。  
Step a: 填学生资料 (假设已有测试学生 id=1)  
Step b: 调 POST /api/v1/students/me/submit-intake (无 body)  
Expected: 返回 intakeStatus=SUBMITTED, 不再要求 preferredBatches

- [ ] **Step 2: 老师角色登录 → dashboard 看待审列表 → 点击进推荐页**

浏览器登录老师账号, 访问 dashboard, 确认待审列表中能看到刚提交的学生。  
点击行 → 跳到 `/teacher/students/1/batch-recommendations`

Expected: 加载推荐页, 显示 5-6 个批次卡片, 至少一个有 verdict + subsets

- [ ] **Step 3: 老师点击展开某个子类别 → 看文件预览**

展开"国家专项"子类别, 应该看到 119 县名单文件项, 点"预览"应在新 tab 打开 xlsx (浏览器可能下载, 因为 xlsx 默认不在浏览器渲染)。

- [ ] **Step 4: 老师勾 2 个批次 + 填备注 + 提交**

勾"本科批 A 段"、"本科批 B 段", 备注"面谈后选定", 点"确认并提交"。

Expected: 跳到 `/teacher/students/1` 学生详情页, intakeStatus 显示 VERIFIED, batchesConfirmedAt 有时间戳, preferredBatches=["本科批A段", "本科批B段"]。

- [ ] **Step 5: 老师重新进入推荐页 → 应锁定 → 点"重新打开"**

访问 `/teacher/students/1/batch-recommendations`, 看到顶部"已锁定 [时间]"banner + "重新打开"按钮, 点之确认。

Expected: 推荐页解锁, 勾选清空, 可以重新选

- [ ] **Step 6: 主管角色 (admin) 访问推荐页**

主管访问 `/teacher/students/1/batch-recommendations`, 应能正常加载 (CASL ADMIN can update StudentProfile)。

- [ ] **Step 7: 记录测试结果到 task #166**

测试通过则继续, 失败则记录 issue。

- [ ] **Step 8: 关闭 task #166**

```bash
# 在 TaskUpdate 工具中标记 task 166 = completed
```

---

## 自查

### Spec 覆盖

| Spec 章节 | 对应 Task |
|---|---|
| § 二 工作流 | 整体 |
| § 三 Plan A 微调 | Task 1 + Task 5 + Task 12 |
| § 四 数据模型 (subsets) | Task 2 + Task 3 + Task 4 |
| § 五 批次清单 (15 核心 + 11 占位) | Task 4 |
| § 六.1 GET batch-recommendations | Task 7 (复用 eligible-batches) |
| § 六.2 POST confirm-batches | Task 5 + Task 6 |
| § 六.3 POST unlock-batches | Plan A 已有, Task 12 前端使用 |
| § 六.4 文件下载 nginx | Task 8 |
| § 七 文件上传清单 | Task 8 |
| § 八 前端信息架构 | Task 10 + Task 11 + Task 12 |
| § 九 数据迁移 | Task 4 (seed 重写) + Task 13 (生产跑 seed) |
| § 十 边界 / 风险 | 各 Task 实施时遵守 |

无遗漏。

### 类型一致性

- `Verdict` 4 种: ELIGIBLE/CONDITIONAL/INELIGIBLE/DATA_PENDING — 前后端统一
- `RuleEvalStatus`: PASS/FAIL/UNCERTAIN/SOFT_HINT — 前后端统一
- `SubsetResult.code`: 前端用 string, 后端写 snake_case ascii — 一致
- `BatchRecommendation.batchName`: 6 主批次中文名 — confirmBatches 白名单一致

### 已知遗留

- 本科批 A 段子分类规则 (国家专项/地方专项作为细分 batch_config 行) seed 时被跳过, 但 subsets 数组在主"本科批A段"行里。如果 picker-options 或 plan 创建用了细分 batch 名, 这边校验失败。Task 13 部署后看实际 log。
- 11 个 dataPending 子类别 UI 显示"详情待补充", 后期数据补全后激活。

---

## 执行选择

Plan complete and saved to `docs/superpowers/plans/2026-06-03-batch-recommendation-page-plan.md`.

**两种执行模式:**

1. **Subagent-Driven (推荐)** — 每个 task 派 fresh subagent, 我在每 task 间做两阶段 review, 快速迭代
2. **Inline Execution** — 在本会话内顺序执行所有 task, 中间设 checkpoint review

**哪种?**
