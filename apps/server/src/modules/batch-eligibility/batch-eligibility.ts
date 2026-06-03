// batch-eligibility.ts — Plan A Task 5 (TDD GREEN)
// 学生 × 批次 × 当年最低线 → 判定结果
// 见 docs/superpowers/specs/2026-06-02-batch-selection-at-intake-design.md § 三、六

import type {
  BatchEligibilityResult,
  EligibilityReason,
  EligibilityRulesJson,
  HardEligibilityRule,
  SubsetRule,
  SubsetResult,
  SubsetVerdict,
  RuleEvalResult,
  RuleEvalStatus,
  ScoreInfo,
} from './types';

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
    // 没规则的批次默认 ELIGIBLE (老数据兼容,实施时通过 seed 写规则后此分支不再触发)
    return result;
  }

  // 1. 选科匹配 (硬过滤)
  const studentExamLabel = EXAM_TYPE_LABEL[student.examType ?? ''] ?? student.examType;
  if (!rules.examTypes.includes(studentExamLabel ?? '')) {
    reasons.push({
      type: 'EXAM_TYPE_MISMATCH',
      message: `该批次仅招 ${rules.examTypes.join('/')} 选科, 学生为 ${studentExamLabel ?? '未知'}`,
    });
    result.verdict = 'INELIGIBLE';
    return result;
  }

  // 2. 分数信息 (仅展示, 不影响 verdict, 分数推荐由 plan-candidate 候选池接手)
  const scoreInfo: ScoreInfo = {
    studentScore: student.totalScore,
    lineScore: batchLine?.score ?? null,
    lineType: rules.scoreFloor.type,
    lineMissing: !batchLine,
    gap: (batchLine && student.totalScore != null) ? student.totalScore - batchLine.score : null,
    passesLine: (batchLine && student.totalScore != null) ? student.totalScore >= batchLine.score : null,
    leniency: rules.scoreFloor.leniency,
    withinLeniency: null,
  };
  if (batchLine && student.totalScore != null) {
    const leniency = rules.scoreFloor.leniency ?? 0;
    if (student.totalScore >= batchLine.score) {
      reasons.push({
        type: 'SCORE_PASS',
        message: `总分 ${student.totalScore} ≥ 该批次最低线 ${batchLine.score}`,
      });
      scoreInfo.withinLeniency = false;
    } else if (student.totalScore >= batchLine.score - leniency) {
      reasons.push({
        type: 'SCORE_DOWN_TOLERANCE',
        message: `总分 ${student.totalScore} 在线下 ${batchLine.score - student.totalScore} 分, 部分项目可降分录取`,
      });
      scoreInfo.withinLeniency = true;
    } else {
      // 注意: 不再 INELIGIBLE 早 return, 只 push reason 让 UI 展示
      reasons.push({
        type: 'SCORE_FAIL',
        message: `总分 ${student.totalScore} < 该批次最低线 ${batchLine.score}${leniency ? ` (含 ${leniency} 分容错)` : ''}`,
      });
      scoreInfo.withinLeniency = false;
    }
  } else if (!batchLine) {
    reasons.push({
      type: 'SOFT_HINT',
      message: '当年批次分数线数据缺失, 无法精确判定, 请老师核实',
    });
  } else if (student.totalScore == null) {
    reasons.push({
      type: 'SOFT_HINT',
      message: '学生总分未填, 无法判定分数门槛',
    });
  }
  result.scoreInfo = scoreInfo;

  // 3. 硬资格 (ALL scope) — 全批硬卡
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

  // 4. 硬资格 (SUBSET scope) — 仅该子类阻止, 整批仍 CONDITIONAL
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

  // === V2: subsets 数组评估 ===
  // 见 docs/superpowers/specs/2026-06-03-batch-recommendation-page-design.md § 四
  const subsets = (rules as any).subsets as SubsetRule[] | undefined;
  if (subsets && Array.isArray(subsets) && subsets.length > 0) {
    if (result.verdict === 'INELIGIBLE') {
      // EXAM_TYPE_MISMATCH / HARD_FAIL 已经直接 return, 这里走不到
      // (SCORE_FAIL 不再影响 verdict, 已改为 scoreInfo 展示)
      // 防御性: 全部标记 INELIGIBLE 跟着批次走
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

// 规则码 → 中文需求描述 (UI 卡片摘要展示)
const REQUIREMENT_LABEL: Record<string, string> = {
  RURAL_HOUSEHOLD_IN_REGION: '农村户籍 + 户籍县 ∈ 119 县',
  HOUSEHOLD_IN_REGION: '户籍县 ∈ 指定区域',
  AGE_RANGE: '年龄要求',
  POLITICAL_REVIEW_REQUIRED: '需通过政治考核',
  PHYSICAL_EXAM_REQUIRED: '需通过体检',
  VISION_STANDARD: '视力 / 色觉标准',
  SCHOOL_RECOMMENDATION: '需中学校长推荐',
  SERVICE_COMMITMENT: '需签 6 年服务承诺',
  GENDER: '性别限制',
};

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
    const { satisfied, hint, soft } = evalHardRule(student, rule);
    const status: RuleEvalStatus = soft
      ? 'SOFT_HINT'
      : satisfied
        ? 'PASS'
        : 'FAIL';
    rulesEval.push({
      ruleCode: rule.rule,
      requirement: REQUIREMENT_LABEL[rule.rule] ?? rule.rule,
      actual: hint,
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

function refToItem(ref: { title: string; filename: string | null; type: string; sourceNote?: string }): SubsetResult['references'][number] {
  return {
    title: ref.title,
    filename: ref.filename,
    type: ref.type as 'pdf' | 'xlsx' | 'announcement',
    downloadUrl: ref.filename ? `/attachments/policy/${ref.filename}` : null,
    available: !!ref.filename,
    sourceNote: ref.sourceNote,
  };
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
        return { satisfied: false, soft: true, hint: `${subsetLabel}需农村户籍 + 户籍县在实施区域内, 学生未填户籍县, 请老师面谈核实` };
      }
      if (!regions.includes(student.county)) {
        return { satisfied: false, hint: `${subsetLabel}要求户籍县在实施区域内 (${regions.length} 县名单), 学生户籍县「${student.county}」不在` };
      }
      if (!student.isRural) {
        return { satisfied: false, hint: `${subsetLabel}要求农村户籍, 学生为城镇户籍` };
      }
      return { satisfied: true, hint: 'PASS' };
    }
    case 'HOUSEHOLD_IN_REGION': {
      const regions = (rule.params?.regions as string[]) ?? [];
      if (!student.county) {
        return { satisfied: false, soft: true, hint: `${subsetLabel}需户籍县在实施区域, 学生未填户籍县, 请老师面谈核实` };
      }
      if (!regions.includes(student.county)) {
        return { satisfied: false, hint: `${subsetLabel}户籍县不在 ${regions.length} 县实施区域内` };
      }
      return { satisfied: true, hint: 'PASS' };
    }
    case 'AGE_RANGE': {
      const { min, max, asOf } = (rule.params ?? {}) as { min: number; max: number; asOf: string };
      if (!student.birthDate) {
        return { satisfied: false, soft: true, hint: `${subsetLabel}需 ${min}-${max} 周岁 (截至 ${asOf}), 学生未填出生日期, 请老师面谈核实` };
      }
      const asOfDate = new Date(asOf);
      const age = Math.floor((asOfDate.getTime() - student.birthDate.getTime()) / (365.25 * 86400 * 1000));
      if (age < min || age > max) {
        return { satisfied: false, hint: `${subsetLabel}需 ${min}-${max} 周岁 (截至 ${asOf}), 学生为 ${age} 岁` };
      }
      return { satisfied: true, hint: 'PASS' };
    }
    case 'POLITICAL_REVIEW_REQUIRED':
      return { satisfied: false, soft: true, hint: `${subsetLabel}需通过政治考核, 请老师核实学生政考状态` };
    case 'PHYSICAL_EXAM_REQUIRED':
      return { satisfied: false, soft: true, hint: `${subsetLabel}需通过体检, 请老师核实学生体检结论` };
    default:
      return { satisfied: false, soft: true, hint: `未知规则: ${(rule as any).rule}` };
  }
}
