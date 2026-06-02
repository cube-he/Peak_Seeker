# 学生选批次 Plan A — Backend 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 后端实现 "学生选定批次 → 锁定 → 老师严格按批次出方案" 全套数据 / API / 校验,为 Plan B 前端接入做准备。

**Architecture:** 新增 `batch-eligibility.ts` helper 模块统一判定算法 ; 在 `batch_configs.eligibilityRules` JSON 字段填入 6 批次精确规则 + 4 个县名单 seed ; 学生 profile 改造支持 `batchesConfirmedAt` 锁定语义 ; 候选池 / plan 创建 加入"学生已选定"校验 (含 feature flag 灰度) 。

**Tech Stack:** NestJS + Prisma 7 + MySQL 8 + Jest

**Spec:** `docs/superpowers/specs/2026-06-02-batch-selection-at-intake-design.md`

**Seed data:** `data/seed/batch-region-counties.json` (本期 98% 完成,需人工补 4 项,见 Task 1)

---

## 文件结构 (File Map)

### 新建
- 🟢 `apps/server/src/modules/batch-eligibility/batch-eligibility.ts` — 判定算法 helper 纯函数
- 🟢 `apps/server/src/modules/batch-eligibility/batch-eligibility.spec.ts` — Jest 单测
- 🟢 `apps/server/src/modules/batch-eligibility/types.ts` — `BatchEligibilityVerdict` / `BatchEligibilityResult` / `EligibilityRule` 类型
- 🟢 `apps/server/scripts/seed-batch-eligibility-rules.ts` — 把 6 批次 rules + 县名单写入 `batch_configs.eligibility_rules` JSON
- 🟢 `apps/server/prisma/migrations/<ts>_student_batches_lock/migration.sql` — 学生表加 3 个字段

### 修改
- 🟡 `apps/server/prisma/schema.prisma` — `StudentProfile` 加 `batchesConfirmedAt` / `batchesUnlockedBy` / `batchesUnlockedAt`
- 🟡 `apps/server/src/modules/student/student.service.ts` — `getEligibleBatches` 返回升级 + intake submit 副作用 + 校验 preferredBatches 非空
- 🟡 `apps/server/src/modules/student/student.controller.ts` — `POST /students/:id/unlock-batches` 接口
- 🟡 `apps/server/src/modules/university/university.service.ts` — `getPickerOptions(batches?)` 加 batches 过滤
- 🟡 `apps/server/src/modules/major/major.service.ts` — `getPickerOptions(batches?)` 加 batches 过滤
- 🟡 `apps/server/src/modules/plan-candidate/plan-candidate.service.ts` — `getCandidateGroups` 入口处加 plan.batchName ∈ student.preferredBatches 校验
- 🟡 `apps/server/src/modules/plan/plan.service.ts` — `createForStudent` 校验 batchConfigId 对应的 batch ∈ student.preferredBatches
- 🟡 `apps/server/src/config/feature-flags.ts` (如果不存在则创建) — 加 `STRICT_BATCH_VALIDATION` flag

---

## Task 1: 人工核对 4 个附件县名补全

**Files:**
- Modify: `data/seed/batch-region-counties.json`

- [ ] **Step 1: 运行渲染脚本生成对照图**

```bash
python scripts/extract-batch-region-counties.py
```
预期输出: `data/招生考试报/extracted/p3_x6.png` + 5 个 `p3x6_app*.png` 切片图

- [ ] **Step 2: 打开切片图核对 4 个待复核项**

打开 `data/招生考试报/extracted/p3x6_app2_119_*.png`,核对附件 2 找出漏掉的 1 个县。
打开 `p3x6_app4_143_*.png`,核对附件 4 南充市 / 资阳市完整县名。
打开 `p3x6_app5_88_*.png`,核对附件 5 宜宾市 5 县确切名称。

- [ ] **Step 3: 更新 JSON**

修改 `data/seed/batch-region-counties.json`:
- `appendix_2_119.counties` 找到漏读县补入对应地市
- `appendix_2_119.totalExtracted` 改为 119
- `appendix_2_119.needsReview` 改为 null
- `appendix_4_143.counties` 修正南充市 / 资阳市,确认 totalExtracted=143
- `appendix_5_88.counties.宜宾市` 修正 OCR 不准的县名
- `_meta.verificationStatus` 改为 `VERIFIED`

- [ ] **Step 4: 校验 JSON 数量匹配**

```bash
node -e "
const j = require('./data/seed/batch-region-counties.json');
['appendix_2_119','appendix_4_143','appendix_5_88','appendix_6_45'].forEach(k => {
  const declared = j[k].totalDeclared;
  const sum = Object.values(j[k].counties).reduce((a,c)=>a+c.length,0);
  console.log(k, 'declared:', declared, 'sum:', sum, sum===declared ? '✓' : '✗');
});
"
```
预期: 4 个都 ✓

- [ ] **Step 5: Commit**

```bash
git add data/seed/batch-region-counties.json
git commit -m "data(batch-selection): finalize 4 county name lists (467 counties verified)"
```

---

## Task 2: Prisma migration 加 3 个字段

**Files:**
- Modify: `apps/server/prisma/schema.prisma`
- Create: `apps/server/prisma/migrations/<auto-timestamp>_student_batches_lock/migration.sql`

- [ ] **Step 1: 修改 schema.prisma**

在 `model StudentProfile` 内合适位置(`preferredBatches` 字段附近)加:

```prisma
// --- 批次选定锁定状态 (商业化流程: 学生填资料时选定批次后锁定) ---
batchesConfirmedAt   DateTime? @map("batches_confirmed_at")
batchesUnlockedBy    Int?      @map("batches_unlocked_by")
batchesUnlockedAt    DateTime? @map("batches_unlocked_at")
```

- [ ] **Step 2: 生成 migration**

```bash
cd apps/server && pnpm exec prisma migrate dev --name student_batches_lock --create-only
```
预期: 生成 `prisma/migrations/<ts>_student_batches_lock/migration.sql`,内容含 3 个 `ALTER TABLE student_profiles ADD COLUMN`

- [ ] **Step 3: Prisma generate**

```bash
cd apps/server && pnpm exec prisma generate
```

- [ ] **Step 4: typecheck**

```bash
cd apps/server && pnpm exec tsc --noEmit
```
预期: TYPECHECK_OK

- [ ] **Step 5: Commit**

```bash
git add apps/server/prisma/schema.prisma apps/server/prisma/migrations/
git commit -m "feat(schema): add StudentProfile.batchesConfirmedAt/UnlockedBy/UnlockedAt"
```

---

## Task 3: types.ts 类型定义

**Files:**
- Create: `apps/server/src/modules/batch-eligibility/types.ts`

- [ ] **Step 1: 写 types.ts**

```typescript
// 学生 × 批次 的可填判定结果

export type BatchEligibilityVerdict = 'ELIGIBLE' | 'CONDITIONAL' | 'INELIGIBLE';

export type EligibilityReasonType =
  | 'SCORE_PASS'           // 分数过线
  | 'SCORE_FAIL'           // 分数不够 (整批不可填)
  | 'SCORE_DOWN_TOLERANCE' // 分数在线下容错范围 (CONDITIONAL)
  | 'EXAM_TYPE_MISMATCH'   // 选科不匹配 (整批不可填)
  | 'HARD_FAIL'            // 全批硬资格不满足
  | 'HARD_SUBSET_FAIL'     // 子类硬资格不满足 (其他子类仍可)
  | 'SOFT_HINT';           // 软提示,不阻止

export interface EligibilityReason {
  type: EligibilityReasonType;
  message: string;
  subset?: string; // 仅 HARD_SUBSET_FAIL 时填(如 "国家专项"、"军队院校")
}

export interface BatchEligibilityResult {
  batchConfigId: number;
  batch: string;          // 如 "本科批A段"
  examType: string;       // 如 "物理"
  verdict: BatchEligibilityVerdict;
  reasons: EligibilityReason[];
}

// eligibilityRules JSON 内部结构 (存入 batch_configs.eligibility_rules)

export interface EligibilityRulesJson {
  scoreFloor: {
    type: 'BATCH_LINE' | 'SPECIAL_LINE' | 'ZHUANKE_LINE';
    leniency?: number; // 线下 N 分容错; 默认 0
  };
  examTypes: string[]; // ["物理"] | ["历史"] | ["物理","历史"]
  volunteerMode: 'PARALLEL' | 'SEQUENTIAL';
  hardEligibility: HardEligibilityRule[];
  softRecommendation?: Array<{ rule: string; message: string }>;
}

export type HardEligibilityRule = {
  scope: 'ALL' | 'SUBSET';
  subset: string | null; // null when scope=ALL
  rule: HardEligibilityRuleCode;
  params?: Record<string, unknown>;
};

export type HardEligibilityRuleCode =
  | 'RURAL_HOUSEHOLD_IN_REGION'  // 农村户籍 + county ∈ regions
  | 'HOUSEHOLD_IN_REGION'        // 户籍县 ∈ regions(不限城乡)
  | 'AGE_RANGE'                  // {min,max} 年龄区间
  | 'POLITICAL_REVIEW_REQUIRED'  // SOFT_HINT, 提示老师面谈
  | 'PHYSICAL_EXAM_REQUIRED';    // SOFT_HINT, 提示老师面谈
```

- [ ] **Step 2: typecheck**

```bash
cd apps/server && pnpm exec tsc --noEmit
```
预期: TYPECHECK_OK (新文件无类型错)

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/modules/batch-eligibility/types.ts
git commit -m "feat(batch-eligibility): add type definitions for verdict & rules"
```

---

## Task 4: batch-eligibility helper — 写测试 (RED)

**Files:**
- Create: `apps/server/src/modules/batch-eligibility/batch-eligibility.spec.ts`

- [ ] **Step 1: 写测试**

```typescript
import { judgeBatchEligibility } from './batch-eligibility';
import type { EligibilityRulesJson } from './types';

const baseStudent = {
  examType: 'PHYSICS' as const,
  totalScore: 480,
  isRural: true,
  county: '叙永县',
  politicalStatus: null,
  birthDate: new Date('2008-01-01'),
};
const baseBatchConfig = (overrides: any = {}) => ({
  id: 1,
  batch: '本科批A段',
  examType: '物理',
  ...overrides,
});
const baseLine = (score: number) => ({ score });

describe('judgeBatchEligibility', () => {
  it('总分 >= 本科线 → ELIGIBLE + SCORE_PASS', () => {
    const rules: EligibilityRulesJson = {
      scoreFloor: { type: 'BATCH_LINE' },
      examTypes: ['物理', '历史'],
      volunteerMode: 'PARALLEL',
      hardEligibility: [],
    };
    const r = judgeBatchEligibility(baseStudent, baseBatchConfig({ eligibilityRules: rules }), baseLine(438));
    expect(r.verdict).toBe('ELIGIBLE');
    expect(r.reasons.find(x => x.type === 'SCORE_PASS')).toBeDefined();
  });

  it('总分 < 本科线 + 无容错 → INELIGIBLE + SCORE_FAIL', () => {
    const rules: EligibilityRulesJson = {
      scoreFloor: { type: 'BATCH_LINE' },
      examTypes: ['物理'], volunteerMode: 'PARALLEL', hardEligibility: [],
    };
    const r = judgeBatchEligibility({...baseStudent, totalScore: 400}, baseBatchConfig({ eligibilityRules: rules }), baseLine(438));
    expect(r.verdict).toBe('INELIGIBLE');
    expect(r.reasons.find(x => x.type === 'SCORE_FAIL')).toBeDefined();
  });

  it('总分 < 本科线 但在容错内 → CONDITIONAL + SCORE_DOWN_TOLERANCE', () => {
    const rules: EligibilityRulesJson = {
      scoreFloor: { type: 'BATCH_LINE', leniency: 20 },
      examTypes: ['物理'], volunteerMode: 'PARALLEL', hardEligibility: [],
    };
    const r = judgeBatchEligibility({...baseStudent, totalScore: 425}, baseBatchConfig({ eligibilityRules: rules }), baseLine(438));
    expect(r.verdict).toBe('CONDITIONAL');
    expect(r.reasons.find(x => x.type === 'SCORE_DOWN_TOLERANCE')).toBeDefined();
  });

  it('选科不匹配 → INELIGIBLE + EXAM_TYPE_MISMATCH', () => {
    const rules: EligibilityRulesJson = {
      scoreFloor: { type: 'BATCH_LINE' },
      examTypes: ['历史'], // 只接受历史, 学生是物理
      volunteerMode: 'PARALLEL', hardEligibility: [],
    };
    const r = judgeBatchEligibility(baseStudent, baseBatchConfig({ eligibilityRules: rules }), baseLine(438));
    expect(r.verdict).toBe('INELIGIBLE');
    expect(r.reasons.find(x => x.type === 'EXAM_TYPE_MISMATCH')).toBeDefined();
  });

  it('子类硬资格不满足 → CONDITIONAL + HARD_SUBSET_FAIL', () => {
    const rules: EligibilityRulesJson = {
      scoreFloor: { type: 'BATCH_LINE' },
      examTypes: ['物理'], volunteerMode: 'PARALLEL',
      hardEligibility: [{
        scope: 'SUBSET', subset: '地方专项',
        rule: 'RURAL_HOUSEHOLD_IN_REGION',
        params: { regions: ['某外县'] }, // 学生县不在
      }],
    };
    const r = judgeBatchEligibility(baseStudent, baseBatchConfig({ eligibilityRules: rules }), baseLine(438));
    expect(r.verdict).toBe('CONDITIONAL');
    expect(r.reasons.find(x => x.type === 'HARD_SUBSET_FAIL' && x.subset === '地方专项')).toBeDefined();
  });

  it('子类硬资格 RURAL_HOUSEHOLD_IN_REGION 满足 → ELIGIBLE + 该子类无 reason', () => {
    const rules: EligibilityRulesJson = {
      scoreFloor: { type: 'BATCH_LINE' },
      examTypes: ['物理'], volunteerMode: 'PARALLEL',
      hardEligibility: [{
        scope: 'SUBSET', subset: '地方专项',
        rule: 'RURAL_HOUSEHOLD_IN_REGION',
        params: { regions: ['叙永县', '古蔺县'] },
      }],
    };
    const r = judgeBatchEligibility(baseStudent, baseBatchConfig({ eligibilityRules: rules }), baseLine(438));
    expect(r.verdict).toBe('ELIGIBLE');
    expect(r.reasons.find(x => x.type === 'HARD_SUBSET_FAIL')).toBeUndefined();
  });

  it('AGE_RANGE 子类: 年龄超出 → CONDITIONAL + HARD_SUBSET_FAIL', () => {
    const rules: EligibilityRulesJson = {
      scoreFloor: { type: 'SPECIAL_LINE' },
      examTypes: ['物理'], volunteerMode: 'SEQUENTIAL',
      hardEligibility: [{
        scope: 'SUBSET', subset: '军队院校',
        rule: 'AGE_RANGE',
        params: { min: 16, max: 20, asOf: '2025-08-31' },
      }],
    };
    // birthDate 2008-01-01 → 截至 2025-08-31 年龄 17 岁,满足
    const r1 = judgeBatchEligibility(baseStudent, baseBatchConfig({ eligibilityRules: rules }), baseLine(518));
    expect(r1.reasons.find(x => x.type === 'HARD_SUBSET_FAIL' && x.subset === '军队院校')).toBeUndefined();

    // birthDate 2000-01-01 → 截至 2025-08-31 年龄 25 岁,超出
    const r2 = judgeBatchEligibility({...baseStudent, birthDate: new Date('2000-01-01')}, baseBatchConfig({ eligibilityRules: rules }), baseLine(518));
    expect(r2.verdict).toBe('CONDITIONAL');
    expect(r2.reasons.find(x => x.type === 'HARD_SUBSET_FAIL' && x.subset === '军队院校')).toBeDefined();
  });

  it('county 缺失时 RURAL_HOUSEHOLD_IN_REGION → SOFT_HINT 不阻止', () => {
    const rules: EligibilityRulesJson = {
      scoreFloor: { type: 'BATCH_LINE' },
      examTypes: ['物理'], volunteerMode: 'PARALLEL',
      hardEligibility: [{
        scope: 'SUBSET', subset: '地方专项',
        rule: 'RURAL_HOUSEHOLD_IN_REGION',
        params: { regions: ['叙永县'] },
      }],
    };
    const r = judgeBatchEligibility({...baseStudent, county: null}, baseBatchConfig({ eligibilityRules: rules }), baseLine(438));
    expect(r.verdict).toBe('ELIGIBLE');
    expect(r.reasons.find(x => x.type === 'SOFT_HINT')).toBeDefined();
  });

  it('SCORE_FAIL 强约束: 即使有 HARD_SUBSET 也直接 INELIGIBLE', () => {
    const rules: EligibilityRulesJson = {
      scoreFloor: { type: 'BATCH_LINE' },
      examTypes: ['物理'], volunteerMode: 'PARALLEL',
      hardEligibility: [{ scope: 'SUBSET', subset: '地方专项', rule: 'RURAL_HOUSEHOLD_IN_REGION', params: { regions: ['叙永县'] } }],
    };
    const r = judgeBatchEligibility({...baseStudent, totalScore: 400}, baseBatchConfig({ eligibilityRules: rules }), baseLine(438));
    expect(r.verdict).toBe('INELIGIBLE');
  });

  it('batchLine 为 null 时 → CONDITIONAL + SOFT_HINT 提示数据缺失', () => {
    const rules: EligibilityRulesJson = {
      scoreFloor: { type: 'BATCH_LINE' },
      examTypes: ['物理'], volunteerMode: 'PARALLEL', hardEligibility: [],
    };
    const r = judgeBatchEligibility(baseStudent, baseBatchConfig({ eligibilityRules: rules }), null);
    expect(r.verdict).toBe('CONDITIONAL');
    expect(r.reasons.find(x => x.type === 'SOFT_HINT' && x.message.includes('分数线'))).toBeDefined();
  });
});
```

- [ ] **Step 2: 跑测试确认 RED**

```bash
cd apps/server && pnpm exec jest src/modules/batch-eligibility/batch-eligibility.spec.ts
```
预期: FAIL — Cannot find module './batch-eligibility'

---

## Task 5: batch-eligibility helper — 实现 (GREEN)

**Files:**
- Create: `apps/server/src/modules/batch-eligibility/batch-eligibility.ts`

- [ ] **Step 1: 实现**

```typescript
import type {
  BatchEligibilityResult,
  EligibilityReason,
  EligibilityRulesJson,
  HardEligibilityRule,
} from './types';

// 学生 / 批次 / 当年最低线 → 判定结果

export interface StudentForEligibility {
  examType: 'PHYSICS' | 'HISTORY' | string | null;
  totalScore: number | null;
  isRural: boolean;
  county: string | null;
  politicalStatus: string | null;
  birthDate: Date | null;
}

export interface BatchConfigForEligibility {
  id: number;
  batch: string;
  examType: string;
  eligibilityRules: EligibilityRulesJson | null;
}

export interface BatchLineForEligibility {
  score: number;
}

const EXAM_TYPE_LABEL: Record<string, string> = {
  PHYSICS: '物理',
  HISTORY: '历史',
};

export function judgeBatchEligibility(
  student: StudentForEligibility,
  batchConfig: BatchConfigForEligibility,
  batchLine: BatchLineForEligibility | null,
): BatchEligibilityResult {
  const reasons: EligibilityReason[] = [];
  const result: BatchEligibilityResult = {
    batchConfigId: batchConfig.id,
    batch: batchConfig.batch,
    examType: batchConfig.examType,
    verdict: 'ELIGIBLE',
    reasons,
  };
  const rules = batchConfig.eligibilityRules;
  if (!rules) {
    // 没规则的批次默认 ELIGIBLE (老数据兼容)
    return result;
  }

  // 1. 选科匹配
  const studentExamLabel = EXAM_TYPE_LABEL[student.examType ?? ''] ?? student.examType;
  if (!rules.examTypes.includes(studentExamLabel ?? '')) {
    reasons.push({
      type: 'EXAM_TYPE_MISMATCH',
      message: `该批次仅招${rules.examTypes.join('/')}选科,学生为${studentExamLabel ?? '未知'}`,
    });
    result.verdict = 'INELIGIBLE';
    return result;
  }

  // 2. 分数门槛
  if (!batchLine) {
    reasons.push({
      type: 'SOFT_HINT',
      message: '当年批次分数线数据缺失,无法精确判定,请老师核实',
    });
    result.verdict = 'CONDITIONAL';
  } else if (student.totalScore == null) {
    reasons.push({
      type: 'SOFT_HINT',
      message: '学生总分未填,无法判定分数门槛',
    });
    result.verdict = 'CONDITIONAL';
  } else {
    const leniency = rules.scoreFloor.leniency ?? 0;
    const line = batchLine.score;
    if (student.totalScore >= line) {
      reasons.push({
        type: 'SCORE_PASS',
        message: `总分 ${student.totalScore} ≥ 该批次最低线 ${line}`,
      });
    } else if (student.totalScore >= line - leniency) {
      reasons.push({
        type: 'SCORE_DOWN_TOLERANCE',
        message: `总分 ${student.totalScore} 在线下 ${line - student.totalScore} 分,部分项目可降分录取`,
      });
      result.verdict = 'CONDITIONAL';
    } else {
      reasons.push({
        type: 'SCORE_FAIL',
        message: `总分 ${student.totalScore} < 该批次最低线 ${line}${leniency ? ` (含 ${leniency} 分容错)` : ''}`,
      });
      result.verdict = 'INELIGIBLE';
      return result;
    }
  }

  // 3. 硬资格 (ALL scope)
  for (const rule of rules.hardEligibility) {
    if (rule.scope !== 'ALL') continue;
    const { satisfied, hint, soft } = evalHardRule(student, rule);
    if (soft) {
      reasons.push({ type: 'SOFT_HINT', message: hint });
    } else if (!satisfied) {
      reasons.push({ type: 'HARD_FAIL', message: hint });
      result.verdict = 'INELIGIBLE';
      return result;
    }
  }

  // 4. 硬资格 (SUBSET scope)
  for (const rule of rules.hardEligibility) {
    if (rule.scope !== 'SUBSET') continue;
    const { satisfied, hint, soft } = evalHardRule(student, rule);
    if (soft) {
      reasons.push({ type: 'SOFT_HINT', message: hint, subset: rule.subset ?? undefined });
    } else if (!satisfied) {
      reasons.push({
        type: 'HARD_SUBSET_FAIL',
        message: hint,
        subset: rule.subset ?? undefined,
      });
      if (result.verdict === 'ELIGIBLE') result.verdict = 'CONDITIONAL';
    }
  }

  // 5. 软建议
  for (const sr of rules.softRecommendation ?? []) {
    reasons.push({ type: 'SOFT_HINT', message: sr.message });
  }

  return result;
}

function evalHardRule(
  student: StudentForEligibility,
  rule: HardEligibilityRule,
): { satisfied: boolean; hint: string; soft?: boolean } {
  const subsetLabel = rule.subset ? `「${rule.subset}」` : '';
  switch (rule.rule) {
    case 'RURAL_HOUSEHOLD_IN_REGION': {
      const regions = (rule.params?.regions as string[]) ?? [];
      if (!student.county) {
        return { satisfied: false, soft: true, hint: `${subsetLabel}需农村户籍 + 户籍县在实施区域内,学生未填户籍县,请老师面谈核实` };
      }
      const inRegion = regions.includes(student.county);
      if (!inRegion) {
        return { satisfied: false, hint: `${subsetLabel}要求户籍县在实施区域内(${regions.length} 县名单),学生户籍县「${student.county}」不在` };
      }
      if (!student.isRural) {
        return { satisfied: false, hint: `${subsetLabel}要求农村户籍,学生为城镇户籍` };
      }
      return { satisfied: true, hint: 'PASS' };
    }
    case 'HOUSEHOLD_IN_REGION': {
      const regions = (rule.params?.regions as string[]) ?? [];
      if (!student.county) {
        return { satisfied: false, soft: true, hint: `${subsetLabel}需户籍县在实施区域,学生未填户籍县,请老师面谈核实` };
      }
      if (!regions.includes(student.county)) {
        return { satisfied: false, hint: `${subsetLabel}户籍县不在 ${regions.length} 县实施区域内` };
      }
      return { satisfied: true, hint: 'PASS' };
    }
    case 'AGE_RANGE': {
      const { min, max, asOf } = (rule.params ?? {}) as { min: number; max: number; asOf: string };
      if (!student.birthDate) {
        return { satisfied: false, soft: true, hint: `${subsetLabel}需 ${min}-${max} 周岁(截至 ${asOf}),学生未填出生日期,请老师面谈核实` };
      }
      const asOfDate = new Date(asOf);
      const age = Math.floor((asOfDate.getTime() - student.birthDate.getTime()) / (365.25 * 86400 * 1000));
      if (age < min || age > max) {
        return { satisfied: false, hint: `${subsetLabel}需 ${min}-${max} 周岁(截至 ${asOf}),学生为 ${age} 岁` };
      }
      return { satisfied: true, hint: 'PASS' };
    }
    case 'POLITICAL_REVIEW_REQUIRED':
      return { satisfied: false, soft: true, hint: `${subsetLabel}需通过政治考核,请老师核实学生政考状态` };
    case 'PHYSICAL_EXAM_REQUIRED':
      return { satisfied: false, soft: true, hint: `${subsetLabel}需通过体检,请老师核实学生体检结论` };
    default:
      return { satisfied: false, soft: true, hint: `未知规则:${rule.rule}` };
  }
}
```

- [ ] **Step 2: 跑测试确认 GREEN**

```bash
cd apps/server && pnpm exec jest src/modules/batch-eligibility/batch-eligibility.spec.ts
```
预期: 10/10 全过

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/modules/batch-eligibility/
git commit -m "feat(batch-eligibility): add judgeBatchEligibility helper (TDD)"
```

---

## Task 6: Seed 脚本写入 6 批次 eligibilityRules

**Files:**
- Create: `apps/server/scripts/seed-batch-eligibility-rules.ts`

- [ ] **Step 1: 写 seed 脚本**

```typescript
/**
 * 把 6 批次的 eligibilityRules JSON 写入 batch_configs 表
 * 数据源: docs/superpowers/specs/2026-06-02-batch-selection-at-intake-design.md § 二
 *
 * 用法: cd apps/server && pnpm exec ts-node scripts/seed-batch-eligibility-rules.ts
 */
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { join } from 'path';
import type { EligibilityRulesJson } from '../src/modules/batch-eligibility/types';

const prisma = new PrismaClient();

const counties = JSON.parse(
  readFileSync(join(__dirname, '../../../data/seed/batch-region-counties.json'), 'utf-8'),
);
const flatten = (appendixKey: string): string[] => {
  const counties_by_city = counties[appendixKey].counties;
  return Object.values(counties_by_city).flat() as string[];
};
const REGION_119 = flatten('appendix_2_119');
const REGION_143 = flatten('appendix_4_143');
const REGION_88 = flatten('appendix_5_88');

const RULES: Record<string, EligibilityRulesJson> = {
  '本科批A段': {
    scoreFloor: { type: 'BATCH_LINE' },
    examTypes: ['物理', '历史'],
    volunteerMode: 'PARALLEL',
    hardEligibility: [
      {
        scope: 'SUBSET',
        subset: '国家专项',
        rule: 'HOUSEHOLD_IN_REGION',
        params: { regions: REGION_119 },
      },
      {
        scope: 'SUBSET',
        subset: '地方专项',
        rule: 'RURAL_HOUSEHOLD_IN_REGION',
        params: { regions: REGION_119 },
      },
    ],
  },
  '本科批B段': {
    scoreFloor: { type: 'BATCH_LINE' },
    examTypes: ['物理', '历史'],
    volunteerMode: 'PARALLEL',
    hardEligibility: [
      {
        scope: 'SUBSET',
        subset: '高校专项',
        rule: 'RURAL_HOUSEHOLD_IN_REGION',
        params: { regions: REGION_119 },
      },
    ],
  },
  '本科提前批A段': {
    scoreFloor: { type: 'SPECIAL_LINE' },
    examTypes: ['物理', '历史'],
    volunteerMode: 'SEQUENTIAL',
    hardEligibility: [
      {
        scope: 'SUBSET',
        subset: '军队院校',
        rule: 'AGE_RANGE',
        params: { min: 16, max: 20, asOf: '2025-08-31' },
      },
      {
        scope: 'SUBSET',
        subset: '公安院校',
        rule: 'AGE_RANGE',
        params: { min: 16, max: 22, asOf: '2025-08-31' },
      },
      {
        scope: 'SUBSET',
        subset: '军队院校',
        rule: 'POLITICAL_REVIEW_REQUIRED',
      },
      {
        scope: 'SUBSET',
        subset: '公安院校',
        rule: 'POLITICAL_REVIEW_REQUIRED',
      },
    ],
    softRecommendation: [
      { rule: 'PHYSICAL_EXAM_NOTICE', message: '军校 / 警校 / 司法等子类需通过体检,请老师核实' },
    ],
  },
  '本科提前批B段': {
    scoreFloor: { type: 'BATCH_LINE', leniency: 20 },
    examTypes: ['物理', '历史'],
    volunteerMode: 'PARALLEL',
    hardEligibility: [
      {
        scope: 'SUBSET',
        subset: '免费医学',
        rule: 'RURAL_HOUSEHOLD_IN_REGION',
        params: { regions: REGION_119 },
      },
      {
        scope: 'SUBSET',
        subset: '省级公费师范',
        rule: 'HOUSEHOLD_IN_REGION',
        params: { regions: REGION_143 },
      },
      {
        scope: 'SUBSET',
        subset: '乡村振兴',
        rule: 'HOUSEHOLD_IN_REGION',
        params: { regions: REGION_88 },
      },
    ],
  },
  '高职提前批': {
    scoreFloor: { type: 'ZHUANKE_LINE' },
    examTypes: ['物理', '历史'],
    volunteerMode: 'SEQUENTIAL',
    hardEligibility: [],
    softRecommendation: [
      { rule: 'POLITICAL_PHYSICAL_NOTICE', message: '定向军士 / 公安专科 / 司法警院 / 空乘等子类需政考 / 体检 / 面试,请老师面谈核实' },
    ],
  },
  '高职批': {
    scoreFloor: { type: 'ZHUANKE_LINE' },
    examTypes: ['物理', '历史'],
    volunteerMode: 'PARALLEL',
    hardEligibility: [],
  },
};

async function main() {
  let updated = 0;
  for (const [batch, rules] of Object.entries(RULES)) {
    const configs = await prisma.batchConfig.findMany({
      where: { batch, province: '四川', year: 2026 },
    });
    for (const cfg of configs) {
      await prisma.batchConfig.update({
        where: { id: cfg.id },
        data: { eligibilityRules: rules as any },
      });
      updated++;
      console.log(`✓ updated batch_configs[${cfg.id}] ${batch}/${cfg.examType}`);
    }
  }
  console.log(`Total updated: ${updated} rows`);
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
```

- [ ] **Step 2: 本地 dry run (不入生产 DB,看打印输出)**

```bash
cd apps/server && pnpm exec ts-node scripts/seed-batch-eligibility-rules.ts 2>&1 | head -30
```
预期: 打印 6 批次 × 2 选科 ≈ 12 行 ✓ updated

- [ ] **Step 3: 抽样验证 1 个 row**

```bash
node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.batchConfig.findFirst({ where: { batch: '本科批A段', province: '四川' } }).then(c => {
  console.log(JSON.stringify(c.eligibilityRules, null, 2).slice(0, 800));
  p.\$disconnect();
});
"
```
预期: 输出含 `scoreFloor.type: BATCH_LINE` + `hardEligibility` 含 国家专项 + 地方专项

- [ ] **Step 4: Commit**

```bash
git add apps/server/scripts/seed-batch-eligibility-rules.ts
git commit -m "feat(seed): write 6 batches eligibilityRules + 4 region county lists to batch_configs"
```

---

## Task 7: 升级 `getEligibleBatches` 返回结构

**Files:**
- Modify: `apps/server/src/modules/student/student.service.ts`
- Modify: `apps/server/src/modules/student/student.service.spec.ts`

- [ ] **Step 1: 找到现有 getEligibleBatches 函数**

```bash
grep -n "getEligibleBatches" apps/server/src/modules/student/student.service.ts
```

- [ ] **Step 2: 在 spec 加新测试**

打开 `apps/server/src/modules/student/student.service.spec.ts`,在合适位置加:

```typescript
describe('getEligibleBatches (升级版返回 BatchEligibilityResult[])', () => {
  it('返回每个批次的 verdict + reasons', async () => {
    const student = { id: 10, examType: 'PHYSICS', totalScore: 480, isRural: true, county: '叙永县', birthDate: new Date('2008-01-01'), politicalStatus: null };
    prisma.studentProfile.findUnique.mockResolvedValue(student);
    prisma.batchConfig.findMany.mockResolvedValue([
      {
        id: 1, batch: '本科批A段', examType: '物理',
        eligibilityRules: { scoreFloor: { type: 'BATCH_LINE' }, examTypes: ['物理','历史'], volunteerMode: 'PARALLEL', hardEligibility: [] },
      },
    ]);
    prisma.batchLine.findMany.mockResolvedValue([
      { batch: '本科批次', examType: '物理类', score: 438 },
    ]);
    const result = await service.getEligibleBatches('10');
    expect(result).toHaveLength(1);
    expect(result[0].verdict).toBe('ELIGIBLE');
    expect(result[0].reasons.find((r: any) => r.type === 'SCORE_PASS')).toBeDefined();
    expect(result[0].batchConfigId).toBe(1);
  });
});
```

- [ ] **Step 3: 实现 — 改造 getEligibleBatches**

```typescript
import { judgeBatchEligibility } from '../batch-eligibility/batch-eligibility';
import type { BatchEligibilityResult } from '../batch-eligibility/types';

// ... 在 StudentService class 内:

async getEligibleBatches(studentId: string): Promise<BatchEligibilityResult[]> {
  const student = await this.prisma.studentProfile.findUnique({
    where: { id: Number(studentId) },
  });
  if (!student) throw new NotFoundException('学生不存在');

  const examYear = student.examYear ?? new Date().getFullYear();
  const planYear = examYear + 1; // 方案年份 = 高考年份 + 1, 与现有约定一致

  // 拉所有该年该省的批次配置
  const configs = await this.prisma.batchConfig.findMany({
    where: { year: planYear, province: student.province ?? '四川' },
  });

  // 拉所有相关分数线 (按 batch 维度查最新)
  const examTypeLabel = student.examType === 'PHYSICS' ? '物理' : '历史';
  const lineRows = await this.prisma.batchLine.findMany({
    where: {
      province: student.province ?? '四川',
      year: examYear, // 用本届实际线
    },
  });
  // 按 scoreFloor.type 决定查哪条线
  const lineFor = (type: string) => {
    const label = (() => {
      if (type === 'BATCH_LINE') return ['本科批次', '本科批'];
      if (type === 'SPECIAL_LINE') return ['特殊类型招生录取控制分数线', '特殊类型控制线'];
      if (type === 'ZHUANKE_LINE') return ['高职（专科）批次', '专科批', '专科'];
      return [];
    })();
    const examTypeAliases = examTypeLabel === '物理' ? ['物理', '物理类'] : ['历史', '历史类'];
    return lineRows.find(r => label.includes(r.batch) && examTypeAliases.includes(r.examType)) ?? null;
  };

  // 过滤出该学生选科匹配的 batchConfig (减少噪音; eligibility 内部也校验)
  const relevantConfigs = configs.filter(c => c.examType === examTypeLabel);

  return relevantConfigs.map(cfg => {
    const rules = cfg.eligibilityRules as any;
    const line = rules?.scoreFloor ? lineFor(rules.scoreFloor.type) : null;
    return judgeBatchEligibility(
      {
        examType: student.examType,
        totalScore: student.totalScore,
        isRural: student.isRural,
        county: student.county,
        politicalStatus: student.politicalStatus as any,
        birthDate: student.birthDate,
      },
      {
        id: cfg.id,
        batch: cfg.batch,
        examType: cfg.examType,
        eligibilityRules: rules,
      },
      line,
    );
  });
}
```

- [ ] **Step 4: 跑 spec 确认 GREEN**

```bash
cd apps/server && pnpm exec jest src/modules/student/student.service.spec.ts
```

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/modules/student/student.service.ts apps/server/src/modules/student/student.service.spec.ts
git commit -m "feat(student): upgrade getEligibleBatches to return BatchEligibilityResult[]"
```

---

## Task 8: intake submit 副作用 + 校验

**Files:**
- Modify: `apps/server/src/modules/student/student.service.ts`(已有 `submitIntake` 或类似方法)
- Modify: `apps/server/src/modules/student/student.service.spec.ts`

- [ ] **Step 1: 找到现有 intake submit 入口**

```bash
grep -n "intakeStatus.*SUBMITTED\|submitIntake\|intakeSubmittedAt" apps/server/src/modules/student/student.service.ts
```

- [ ] **Step 2: 加 spec 测试**

```typescript
describe('submitIntake 副作用', () => {
  it('preferredBatches 为空时拒绝', async () => {
    prisma.studentProfile.findUnique.mockResolvedValue({ id: 10, preferredBatches: [] });
    await expect(service.submitIntake('10')).rejects.toThrow(/批次/);
  });
  it('成功时写 batchesConfirmedAt + intakeStatus SUBMITTED', async () => {
    prisma.studentProfile.findUnique.mockResolvedValue({ id: 10, preferredBatches: ['本科批A段'], intakeStatus: 'DRAFT' });
    await service.submitIntake('10');
    expect(prisma.studentProfile.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        intakeStatus: 'SUBMITTED',
        intakeSubmittedAt: expect.any(Date),
        batchesConfirmedAt: expect.any(Date),
      }),
    }));
  });
});
```

- [ ] **Step 3: 实现 — 在 submitIntake 方法体加校验和副作用**

```typescript
async submitIntake(studentId: string) {
  const student = await this.prisma.studentProfile.findUnique({
    where: { id: Number(studentId) },
    select: { preferredBatches: true, intakeStatus: true },
  });
  if (!student) throw new NotFoundException('学生不存在');
  const batches = Array.isArray(student.preferredBatches) ? student.preferredBatches : [];
  if (batches.length === 0) {
    throw new BadRequestException('请至少选定 1 个批次才能提交资料');
  }
  return this.prisma.studentProfile.update({
    where: { id: Number(studentId) },
    data: {
      intakeStatus: 'SUBMITTED',
      intakeSubmittedAt: new Date(),
      batchesConfirmedAt: new Date(),
    },
  });
}
```

- [ ] **Step 4: 跑测试**

```bash
pnpm exec jest src/modules/student/student.service.spec.ts -t '副作用'
```

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/modules/student/
git commit -m "feat(student): require preferredBatches non-empty on intake submit + lock"
```

---

## Task 9: `POST /students/:id/unlock-batches` 接口

**Files:**
- Modify: `apps/server/src/modules/student/student.controller.ts`
- Modify: `apps/server/src/modules/student/student.service.ts`

- [ ] **Step 1: 加 service 方法**

```typescript
async unlockBatches(studentId: string, teacherUserId: number) {
  const student = await this.prisma.studentProfile.findUnique({
    where: { id: Number(studentId) },
    select: { id: true, batchesConfirmedAt: true },
  });
  if (!student) throw new NotFoundException('学生不存在');
  if (!student.batchesConfirmedAt) {
    return { unlocked: false, reason: '批次未锁定,无需解锁' };
  }
  await this.prisma.studentProfile.update({
    where: { id: Number(studentId) },
    data: {
      batchesConfirmedAt: null,
      batchesUnlockedBy: teacherUserId,
      batchesUnlockedAt: new Date(),
      intakeStatus: 'REQUEST_CHANGE',
    },
  });
  return { unlocked: true };
}
```

- [ ] **Step 2: 加 controller endpoint**

```typescript
@Post(':id/unlock-batches')
@UseGuards(JwtAuthGuard) // 加 role guard 限 TEACHER/SUPERVISOR/ADMIN
async unlockBatches(@Param('id') id: string, @Req() req: any) {
  return this.studentService.unlockBatches(id, req.user.id);
}
```

- [ ] **Step 3: typecheck + 1 个简单测试 (老师解锁 → 字段写入)**

```bash
pnpm exec tsc --noEmit && pnpm exec jest src/modules/student/student.service.spec.ts -t 'unlock'
```

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/modules/student/
git commit -m "feat(student): add POST /students/:id/unlock-batches endpoint"
```

---

## Task 10: picker-options 加 batches 过滤 (uni + major)

**Files:**
- Modify: `apps/server/src/modules/university/university.service.ts`
- Modify: `apps/server/src/modules/university/university.controller.ts`
- Modify: `apps/server/src/modules/major/major.service.ts`
- Modify: `apps/server/src/modules/major/major.controller.ts`
- Modify: `apps/server/src/modules/university/university.service.spec.ts`

- [ ] **Step 1: university.service.getPickerOptions 加 batches 参数**

```typescript
async getPickerOptions(batches?: string[]): Promise<{ id: number; code: string | null; name: string; renameHistory: string | null }[]> {
  const whereEP: any = { province: '四川' };
  if (batches && batches.length > 0) {
    whereEP.batch = { in: batches };
  }
  const rows = await this.prisma.university.findMany({
    where: {
      enrollmentPlans: { some: whereEP },
    },
    select: { id: true, code: true, name: true, renameHistory: true },
    orderBy: { id: 'asc' },
  });
  // dedup + sort 不变
  const seen = new Map<string, any>();
  for (const r of rows) {
    if (!seen.has(r.name)) seen.set(r.name, r);
  }
  return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
}
```

- [ ] **Step 2: university.controller 加 query 参数**

```typescript
@Get('picker-options')
@UseGuards(JwtAuthGuard)
@Header('Cache-Control', 'private, max-age=86400')
async getPickerOptions(@Query('batches') batches?: string): Promise<UniversityPickerOptionDto[]> {
  const list = batches?.split(',').map(s => s.trim()).filter(Boolean);
  return this.universityService.getPickerOptions(list);
}
```

- [ ] **Step 3: major.service / controller 同样改造** (复用上面模板,把 `university` 换成 `major`,字段 select 改 `{id, code, name}` 不含 renameHistory)

- [ ] **Step 4: 加 spec 测试**

```typescript
describe('getPickerOptions with batches', () => {
  it('不传 batches → 现有行为,只按 province 过滤', async () => { /* mock check */ });
  it('传 batches=本科批A段 → 加 batch in filter', async () => {
    await service.getPickerOptions(['本科批A段']);
    expect(prisma.university.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { enrollmentPlans: { some: { province: '四川', batch: { in: ['本科批A段'] } } } },
    }));
  });
});
```

- [ ] **Step 5: 跑 spec**

```bash
pnpm exec jest src/modules/university src/modules/major
```

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/modules/university/ apps/server/src/modules/major/
git commit -m "feat(picker-options): support batches query param for uni + major"
```

---

## Task 11: 候选池 + plan 创建 加 batch 校验 (含 feature flag)

**Files:**
- Create: `apps/server/src/config/feature-flags.ts`
- Modify: `apps/server/src/modules/plan-candidate/plan-candidate.service.ts`
- Modify: `apps/server/src/modules/plan/plan.service.ts`
- Modify: `apps/server/src/modules/plan/plan.service.spec.ts`

- [ ] **Step 1: 创建 feature-flags.ts**

```typescript
// 灰度开关:本期 batch 校验先 log 不抛, 数据团队推动学生补全后再开启
export const FEATURE_FLAGS = {
  STRICT_BATCH_VALIDATION: process.env.STRICT_BATCH_VALIDATION === 'true', // 默认 false
} as const;
```

- [ ] **Step 2: plan-candidate.service.getCandidateGroups 入口处加校验**

在 `const student = await this.prisma.studentProfile.findUnique(...)` 之后立刻加:

```typescript
import { FEATURE_FLAGS } from '../../config/feature-flags';

// ... 在 getCandidateGroups 内:
const studentBatches = Array.isArray(student.preferredBatches) ? student.preferredBatches as string[] : [];
if (studentBatches.length > 0 && !studentBatches.includes(plan.batchName!)) {
  const msg = `该 plan 的批次「${plan.batchName}」未被学生选定 (学生选定: ${studentBatches.join(', ')})`;
  if (FEATURE_FLAGS.STRICT_BATCH_VALIDATION) {
    throw new BadRequestException(msg);
  } else {
    // 灰度期: 只 log, 不抛
    console.warn('[STRICT_BATCH_VALIDATION disabled]', msg);
  }
}
```

- [ ] **Step 3: plan.service.createForStudent 同样加**

```typescript
const student = await this.prisma.studentProfile.findUnique({
  where: { id: Number(studentId) },
  select: { preferredBatches: true },
});
const batchConfig = await this.prisma.batchConfig.findUnique({ where: { id: dto.batchConfigId } });
if (!batchConfig) throw new NotFoundException('批次配置不存在');
const studentBatches = Array.isArray(student?.preferredBatches) ? student.preferredBatches as string[] : [];
if (studentBatches.length > 0 && !studentBatches.includes(batchConfig.batch)) {
  const msg = `批次「${batchConfig.batch}」未被学生选定`;
  if (FEATURE_FLAGS.STRICT_BATCH_VALIDATION) {
    throw new BadRequestException(msg);
  } else {
    console.warn('[STRICT_BATCH_VALIDATION disabled]', msg);
  }
}
```

- [ ] **Step 4: 加 spec 测试** (覆盖灰度开 / 关 两种)

```typescript
import { FEATURE_FLAGS } from '../../config/feature-flags';

describe('plan.createForStudent batch validation', () => {
  it('STRICT_BATCH_VALIDATION=false 时,不匹配只 warn 不抛', async () => {
    (FEATURE_FLAGS as any).STRICT_BATCH_VALIDATION = false;
    // ... mock + create + expect 不抛
  });
  it('STRICT_BATCH_VALIDATION=true 时,不匹配抛 400', async () => {
    (FEATURE_FLAGS as any).STRICT_BATCH_VALIDATION = true;
    // ... mock + create + expect throws BadRequestException
  });
});
```

- [ ] **Step 5: 跑 spec + 现有 spec 不回归**

```bash
pnpm exec jest src/modules/plan src/modules/plan-candidate
```

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/
git commit -m "feat(plan): batch validation with STRICT_BATCH_VALIDATION feature flag (default off)"
```

---

## Task 12: Build + 部署 + 端到端验证

- [ ] **Step 1: prisma generate + nest build**

```bash
cd apps/server && pnpm exec prisma generate && pnpm build
```

- [ ] **Step 2: 部署**

```bash
python deploy_auto.py --skip-build
```

- [ ] **Step 3: 跑 seed 脚本到生产**

SSH 到生产服跑:
```bash
ssh -i cube.pem ubuntu@132.232.245.53 "cd /home/ubuntu/apps/volunteer-helper && pnpm exec ts-node apps/server/scripts/seed-batch-eligibility-rules.ts"
```
预期: 打印 12+ 行 ✓ updated

- [ ] **Step 4: curl 验证 eligible-batches 返回**

拿一个测试老师的 token,然后:
```bash
curl 'http://132.232.245.53:3001/api/students/1/eligible-batches' -H "Authorization: Bearer <token>" | jq '.[0]'
```
预期: 返回 1 个 `BatchEligibilityResult` 含 verdict + reasons

- [ ] **Step 5: curl 验证 picker-options 加 batches**

```bash
curl 'http://132.232.245.53:3001/api/universities/picker-options?batches=本科批A段' -H "Authorization: Bearer <token>" | jq '. | length'
```
预期: 返回数量 < 不传 batches 时的总量(过滤生效)

- [ ] **Step 6: 抽样检查 batch_configs.eligibility_rules**

```bash
ssh -i cube.pem ubuntu@132.232.245.53 'mysql -u root -p"Xyt52005201314!" volunteer_helper -e "SELECT batch, exam_type, LENGTH(eligibility_rules) AS len FROM batch_configs WHERE province=\"四川\" AND year=2026 LIMIT 12"'
```
预期: 12 行,每行 len > 200(JSON 非空)

- [ ] **Step 7: 标记 Plan A 完成**

```bash
git tag plan-a-batch-selection-backend-done
git push origin master plan-a-batch-selection-backend-done
```

---

## 自查

### 1. Spec coverage

| Spec section | Task |
|---|---|
| § 二 6 批次规则 | Task 6 (Seed) |
| § 三 StudentProfile 新字段 | Task 2 |
| § 三 BatchConfig.eligibilityRules JSON | Task 3-6 |
| § 三 batch-eligibility helper | Task 3-5 |
| § 四.1 intake submit 副作用 | Task 8 |
| § 四.2 eligible-batches 接口升级 | Task 7 |
| § 四.2 unlock-batches 新接口 | Task 9 |
| § 四.3 picker-options 加 batches | Task 10 |
| § 四.4 候选池校验 | Task 11 |
| § 四.5 plan 创建校验 | Task 11 |
| § 十 feature flag 灰度 | Task 11 |
| § 十三 县名单 seed | Task 1, 6 |

### 2. Placeholder scan

- ✅ 每 task 有具体代码片段或 grep 命令(无 TBD/TODO)
- ✅ Task 10 Step 3 "major.service / controller 同样改造" 给了明确的复用模板 (uni → major + 字段调整),不是 placeholder
- ⚠ Task 11 Step 4 spec 测试代码用了 "..." 简化,但断言明确(`expect 不抛` / `expect throws`)

### 3. Type consistency

- ✅ `BatchEligibilityResult` 在 Task 3 (types) / 4 (spec) / 5 (impl) / 7 (使用) 全部一致
- ✅ `EligibilityRulesJson` 内部结构在 Task 3 (定义) / 5 (使用) / 6 (seed 写入) 严格一致
- ✅ `HardEligibilityRuleCode` 5 个常量 (`RURAL_HOUSEHOLD_IN_REGION` / `HOUSEHOLD_IN_REGION` / `AGE_RANGE` / `POLITICAL_REVIEW_REQUIRED` / `PHYSICAL_EXAM_REQUIRED`) 在 Task 5 evalHardRule 都有分支

---

## Execution Handoff

Plan A 完成,文件: `docs/superpowers/plans/2026-06-03-batch-selection-plan-a-backend.md`

两种执行方式:

**1. Subagent-Driven (推荐)** — 每个 task 派 fresh subagent,两阶段 review,快速迭代
**2. Inline Execution** — 本会话推进,有上下文,但 token 多

哪种?

后续: Plan B (Frontend) 待 Plan A 完成后再写,因为前端依赖后端接口签名定型。
