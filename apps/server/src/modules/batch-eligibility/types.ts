// 学生 × 批次 的可填判定结果类型
// 见 docs/superpowers/specs/2026-06-02-batch-selection-at-intake-design.md § 三

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
  subset?: string; // 仅 HARD_SUBSET_FAIL / 子类 SOFT_HINT 时填(如 "国家专项"、"军队院校")
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
  | 'AGE_RANGE'                  // {min,max,asOf} 年龄区间
  | 'POLITICAL_REVIEW_REQUIRED'  // SOFT_HINT, 提示老师面谈
  | 'PHYSICAL_EXAM_REQUIRED'     // SOFT_HINT, 提示老师面谈
  | 'GENDER'                     // 性别限制 (如军队/公安院校)
  | 'VISION_STANDARD'            // 视力标准 (如军队/公安院校)
  | 'SCHOOL_RECOMMENDATION'      // 校长实名推荐 (如强基计划/综合评价)
  | 'SERVICE_COMMITMENT';        // 服务承诺 (如公费师范/定向培养)

// 本期新增: subset-level 判定
// 见 docs/superpowers/specs/2026-06-03-batch-recommendation-page-design.md § 四

export type SubsetVerdict = 'ELIGIBLE' | 'CONDITIONAL' | 'INELIGIBLE' | 'DATA_PENDING';

export type RuleEvalStatus = 'PASS' | 'FAIL' | 'UNCERTAIN' | 'SOFT_HINT';

export interface RuleEvalResult {
  ruleCode: string;
  requirement: string;
  actual: string;
  pass: RuleEvalStatus;
}

export interface ReferenceItem {
  title: string;
  filename: string | null;
  type: 'pdf' | 'xlsx' | 'announcement';
  downloadUrl: string | null;
  available: boolean;
  sourceNote?: string;
}

export interface SubsetRule {
  code: string;
  name: string;
  description: string;
  dataPending?: boolean;
  examTypes?: string[];
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

export interface EligibilityRulesJsonV2 extends EligibilityRulesJson {
  subsets?: SubsetRule[];
}
