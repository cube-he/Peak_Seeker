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
  // null = 学生未填户籍性质 (RURAL_HOUSEHOLD 规则区分"未填"与"城镇")
  isRural: boolean | null;
  county: string | null;
  politicalStatus: string | null;
  birthDate: Date | null;
  ethnicity: string | null;   // 民族 (汉族/藏族/彝族/...)
  gender: string | null;       // MALE/FEMALE
  // —— 体检字段 (军/警/航/空乘资格审查需要, 矫正视力不算) ——
  height: number | null;       // cm
  weight: number | null;       // kg
  visionLeft: number | null;   // 裸眼, 例 4.8
  visionRight: number | null;
  colorBlind: boolean | null;
  colorWeak: boolean | null;
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
        // 全 dataPending → batch verdict 也 DATA_PENDING (不再误判 ELIGIBLE)
        result.verdict = 'DATA_PENDING';
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
  ETHNICITY_MINORITY: '限少数民族考生',
  RURAL_HOUSEHOLD: '农村户籍',
  HEIGHT_MIN_BY_GENDER: '身高下限',
  WEIGHT_MIN_BY_GENDER: '体重下限',
  BMI_RANGE: 'BMI 范围',
  VISION_NAKED_MIN: '裸眼视力下限',
  COLOR_VISION_NORMAL: '色觉正常 (无色盲色弱)',
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
      policyText: subset.policyText,
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
  // softHints 是机器无法判定、必须老师人工核实的要求（户籍/学籍年限、体能测试、
  // 民语学籍等）。渲染成 SOFT_HINT 条目让页面可见，并把通过降为"条件通过"。
  for (const hint of subset.softHints ?? []) {
    rulesEval.push({
      ruleCode: 'SOFT_HINT',
      requirement: hint,
      actual: '需老师人工核实',
      pass: 'SOFT_HINT',
    });
    if (verdict === 'ELIGIBLE') verdict = 'CONDITIONAL';
  }
  return {
    code: subset.code,
    name: subset.name,
    description: subset.description,
    verdict,
    rulesEval,
    references: (subset.references ?? []).map(refToItem),
    policyText: subset.policyText,
  };
}

function refToItem(ref: {
  title: string;
  filename: string | null;
  type: string;
  externalUrl?: string;
  sourceNote?: string;
}): SubsetResult['references'][number] {
  // 三种情况:
  //   1) externalUrl 优先 (官网公告 / 教育考试院链接), 直接外跳, external=true
  //   2) filename 有, 走本地 /attachments/policy/<filename>
  //   3) 都没 → null, available=false ("文件待补")
  if (ref.externalUrl) {
    return {
      title: ref.title,
      filename: null,
      type: ref.type as 'pdf' | 'xlsx' | 'doc' | 'announcement',
      downloadUrl: ref.externalUrl,
      available: true,
      sourceNote: ref.sourceNote,
      external: true,
    };
  }
  return {
    title: ref.title,
    filename: ref.filename,
    type: ref.type as 'pdf' | 'xlsx' | 'doc' | 'announcement',
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
    // 设计原则:
    //   - 学生明确填了 + 不符 → satisfied=false, soft=false → 资格不符 (INELIGIBLE)
    //   - 学生客观字段未填 (本人该填的: 户籍县/出生日期/民族/性别) → satisfied=false, soft=false → 资格不符 (INELIGIBLE)
    //     hint 明示"未填"让老师催学生补, 不是误判 "条件通过"
    //   - 老师面谈才能确定的 (政考/体检/视力/服务承诺/校长推荐) → satisfied=false, soft=true → 条件通过 (CONDITIONAL)
    case 'RURAL_HOUSEHOLD_IN_REGION': {
      const regions = (rule.params?.regions as string[]) ?? [];
      if (!student.isRural) {
        return { satisfied: false, hint: `${subsetLabel}要求农村户籍, 学生为城镇户籍` };
      }
      if (!student.county) {
        return { satisfied: false, hint: `${subsetLabel}需户籍县在 ${regions.length} 县实施区域内, 学生未填户籍县 → 请先催学生补完资料` };
      }
      if (!regions.includes(student.county)) {
        return { satisfied: false, hint: `${subsetLabel}要求户籍县在实施区域内 (${regions.length} 县名单), 学生户籍县「${student.county}」不在` };
      }
      return { satisfied: true, hint: 'PASS' };
    }
    case 'RURAL_HOUSEHOLD': {
      // 仅要求农村户籍, 不限定县 (农村订单定向医学生: "户籍地须在农村")
      if (student.isRural == null) {
        return { satisfied: false, hint: `${subsetLabel}要求农村户籍, 学生未填户籍性质 → 请先催学生补完资料` };
      }
      if (!student.isRural) {
        return { satisfied: false, hint: `${subsetLabel}要求农村户籍, 学生为城镇户籍` };
      }
      return { satisfied: true, hint: 'PASS' };
    }
    case 'HOUSEHOLD_IN_REGION': {
      const regions = (rule.params?.regions as string[]) ?? [];
      if (!student.county) {
        return { satisfied: false, hint: `${subsetLabel}需户籍县在 ${regions.length} 县实施区域, 学生未填户籍县 → 请先催学生补完资料` };
      }
      if (!regions.includes(student.county)) {
        return { satisfied: false, hint: `${subsetLabel}户籍县「${student.county}」不在 ${regions.length} 县实施区域内` };
      }
      return { satisfied: true, hint: 'PASS' };
    }
    case 'AGE_RANGE': {
      // min 可选: 公告只给上限时(如定向军士「不超过20周岁」, 无下限)省略 min, 仅判 ≤max。
      const { min, max, asOf } = (rule.params ?? {}) as { min?: number; max: number; asOf: string };
      const rangeLabel = min != null ? `${min}-${max} 周岁` : `不超过 ${max} 周岁`;
      if (!student.birthDate) {
        return { satisfied: false, hint: `${subsetLabel}需 ${rangeLabel} (截至 ${asOf}), 学生未填出生日期 → 请先催学生补完资料` };
      }
      const asOfDate = new Date(asOf);
      const age = Math.floor((asOfDate.getTime() - student.birthDate.getTime()) / (365.25 * 86400 * 1000));
      if ((min != null && age < min) || age > max) {
        return { satisfied: false, hint: `${subsetLabel}需 ${rangeLabel} (截至 ${asOf}), 学生为 ${age} 岁` };
      }
      return { satisfied: true, hint: 'PASS' };
    }
    case 'POLITICAL_REVIEW_REQUIRED':
      // 政考必须现场面审, 系统层只 SOFT_HINT, 学生 politicalStatus 仅作提示
      return {
        satisfied: false,
        soft: true,
        hint: `${subsetLabel}需通过政治考核${student.politicalStatus ? ` (学生当前: ${student.politicalStatus})` : ''}, 请老师面谈核实`,
      };
    case 'PHYSICAL_EXAM_REQUIRED':
      return { satisfied: false, soft: true, hint: `${subsetLabel}需通过体检, 请老师核实学生体检结论` };
    case 'VISION_STANDARD':
      return { satisfied: false, soft: true, hint: `${subsetLabel}有视力/色觉要求, 请老师核实体检结论` };
    case 'SCHOOL_RECOMMENDATION':
      return { satisfied: false, soft: true, hint: `${subsetLabel}需中学校长实名推荐, 请老师核实推荐函` };
    case 'SERVICE_COMMITMENT': {
      const years = (rule.params?.years as number) ?? 6;
      return {
        satisfied: false,
        soft: true,
        hint: `${subsetLabel}需签 ${years} 年服务承诺书, 请老师与家长面谈确认意愿`,
      };
    }
    case 'GENDER': {
      const allowed = (rule.params?.allowed as 'MALE' | 'FEMALE' | 'BOTH') ?? 'BOTH';
      if (allowed === 'BOTH') return { satisfied: true, hint: 'PASS' };
      if (!student.gender) {
        return { satisfied: false, soft: true, hint: `${subsetLabel}限 ${allowed === 'MALE' ? '男生' : '女生'} 报考, 学生未填性别, 请老师核实` };
      }
      if (student.gender !== allowed) {
        return { satisfied: false, hint: `${subsetLabel}限 ${allowed === 'MALE' ? '男生' : '女生'} 报考, 学生为 ${student.gender === 'MALE' ? '男生' : '女生'}` };
      }
      return { satisfied: true, hint: 'PASS' };
    }
    case 'ETHNICITY_MINORITY': {
      // 民族字段值通常为 "汉族" / "藏族" / "彝族" 等
      // null/未填 → SOFT_HINT, 汉族 → FAIL, 其他 → PASS
      if (!student.ethnicity) {
        return { satisfied: false, soft: true, hint: `${subsetLabel}限少数民族考生, 学生未填民族, 请老师核实` };
      }
      if (student.ethnicity === '汉族' || student.ethnicity.toUpperCase() === 'HAN') {
        return { satisfied: false, hint: `${subsetLabel}限少数民族考生, 学生为汉族` };
      }
      return { satisfied: true, hint: 'PASS' };
    }
    // —— 体检细化 4 类硬规则 (用户决策: 未填 → FAIL; 矫正视力不算) ——
    case 'HEIGHT_MIN_BY_GENDER': {
      const { male, female } = (rule.params ?? {}) as { male: number; female: number };
      if (!student.gender) {
        return { satisfied: false, hint: `${subsetLabel}需身高男 ≥${male}cm / 女 ≥${female}cm, 学生未填性别 → 请先催学生补完资料` };
      }
      const minH = student.gender === 'MALE' ? male : female;
      if (student.height == null) {
        return { satisfied: false, hint: `${subsetLabel}需身高 ≥${minH}cm, 学生未填身高 → 请先催学生补完体检数据` };
      }
      if (student.height < minH) {
        return { satisfied: false, hint: `${subsetLabel}需身高 ≥${minH}cm, 学生身高 ${student.height}cm 不达标` };
      }
      return { satisfied: true, hint: 'PASS' };
    }
    case 'WEIGHT_MIN_BY_GENDER': {
      const { male, female } = (rule.params ?? {}) as { male: number; female: number };
      if (!student.gender) {
        return { satisfied: false, hint: `${subsetLabel}需体重男 ≥${male}kg / 女 ≥${female}kg, 学生未填性别 → 请先催学生补完资料` };
      }
      const minW = student.gender === 'MALE' ? male : female;
      if (student.weight == null) {
        return { satisfied: false, hint: `${subsetLabel}需体重 ≥${minW}kg, 学生未填体重 → 请先催学生补完体检数据` };
      }
      if (student.weight < minW) {
        return { satisfied: false, hint: `${subsetLabel}需体重 ≥${minW}kg, 学生体重 ${student.weight}kg 不达标` };
      }
      return { satisfied: true, hint: 'PASS' };
    }
    case 'BMI_RANGE': {
      // 兼容两种 params:
      //   {min, max}                     → 统一范围 (军队/公安/司法用此)
      //   {male:{min,max}, female:{...}} → 男女分开 (定向军士按应征公民标准: 男 17.5-30, 女 17-24)
      const p = rule.params as any;
      const range: { min: number; max: number } = p?.male && p?.female
        ? (student.gender === 'FEMALE' ? p.female : p.male)
        : { min: p?.min as number, max: p?.max as number };
      if (!student.gender && p?.male) {
        return { satisfied: false, hint: `${subsetLabel}需 BMI 男女不同 (男 ${p.male.min}-${p.male.max} / 女 ${p.female.min}-${p.female.max}), 学生未填性别 → 请先催学生补完资料` };
      }
      if (student.height == null || student.weight == null) {
        return { satisfied: false, hint: `${subsetLabel}需 BMI 在 ${range.min}-${range.max}, 学生未填身高或体重 → 请先催学生补完体检数据` };
      }
      const bmi = student.weight / Math.pow(student.height / 100, 2);
      if (bmi < range.min || bmi > range.max) {
        return { satisfied: false, hint: `${subsetLabel}需 BMI 在 ${range.min}-${range.max}, 学生 BMI ${bmi.toFixed(1)} (身高 ${student.height}cm / 体重 ${student.weight}kg) 不达标` };
      }
      return { satisfied: true, hint: 'PASS' };
    }
    case 'VISION_NAKED_MIN': {
      // 两眼裸眼都需要 ≥value, 矫正视力按用户决策不算
      const { value } = (rule.params ?? {}) as { value: number };
      if (student.visionLeft == null || student.visionRight == null) {
        return { satisfied: false, hint: `${subsetLabel}需两眼裸眼 ≥${value} (矫正不算), 学生未填裸眼视力 → 请先催学生补完体检数据` };
      }
      const lo = Math.min(student.visionLeft, student.visionRight);
      if (lo < value) {
        return { satisfied: false, hint: `${subsetLabel}需两眼裸眼 ≥${value} (矫正不算), 学生最差眼 ${lo} 不达标 (L:${student.visionLeft} R:${student.visionRight})` };
      }
      return { satisfied: true, hint: 'PASS' };
    }
    case 'COLOR_VISION_NORMAL': {
      // 严格态度: null/未填 → FAIL ("未确认"); 任一为 true → FAIL ("有色弱/色盲")
      if (student.colorBlind == null || student.colorWeak == null) {
        return { satisfied: false, hint: `${subsetLabel}需色觉正常 (无色盲色弱), 学生未确认色觉项 → 请先催学生补完体检数据` };
      }
      if (student.colorBlind || student.colorWeak) {
        const issues = [
          student.colorBlind ? '色盲' : null,
          student.colorWeak ? '色弱' : null,
        ].filter(Boolean).join('/');
        return { satisfied: false, hint: `${subsetLabel}需色觉正常 (无色盲色弱), 学生有 ${issues}` };
      }
      return { satisfied: true, hint: 'PASS' };
    }
    default:
      // 不明规则码: 安全策略是 SOFT_HINT (待人工确认) 而非默认 PASS
      return { satisfied: false, soft: true, hint: `${subsetLabel}存在未识别的规则 ${(rule as any).rule}, 请老师面谈核实` };
  }
}
