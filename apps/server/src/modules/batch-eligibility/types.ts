// 学生 × 批次 的可填判定结果类型
// 见 docs/superpowers/specs/2026-06-02-batch-selection-at-intake-design.md § 三

export type BatchEligibilityVerdict = 'ELIGIBLE' | 'CONDITIONAL' | 'INELIGIBLE' | 'DATA_PENDING';

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
  subsetResults?: SubsetResult[];  // V2 subsets 判定
  scoreInfo?: ScoreInfo;  // 分数信息(仅展示, 不影响 verdict, 分数推荐由 plan-candidate 候选池接手)
}

export interface ScoreInfo {
  studentScore: number | null;       // 学生总分
  lineScore: number | null;          // 批次/特殊/专科线
  lineType: 'BATCH_LINE' | 'SPECIAL_LINE' | 'ZHUANKE_LINE';
  lineMissing: boolean;              // 当年分数线数据是否缺失
  gap: number | null;                // studentScore - lineScore, null 时数据缺失或分数缺
  passesLine: boolean | null;        // true=过线, false=不过, null=数据缺失
  leniency?: number;                 // 容错(本科提前批B 段 20)
  withinLeniency: boolean | null;    // 在容错内 (不过线但差不超 leniency)
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
  | 'PHYSICAL_EXAM_REQUIRED'     // SOFT_HINT, 提示老师面谈 (粗粒度门槛)
  | 'GENDER'                     // 性别限制 (如军队/公安院校)
  | 'VISION_STANDARD'            // 视力标准 (legacy SOFT_HINT, 新规则用 VISION_NAKED_MIN)
  | 'SCHOOL_RECOMMENDATION'      // 校长实名推荐 (如强基计划/综合评价)
  | 'SERVICE_COMMITMENT'         // 服务承诺 (如公费师范/定向培养)
  | 'ETHNICITY_MINORITY'         // 必须少数民族 (民语为主/民预/民族班)
  | 'RURAL_HOUSEHOLD'            // 仅要求农村户籍, 不限定县 (农村订单定向医学生)
  // —— 体检细化规则 (硬性, 学生未填字段 → FAIL, 矫正视力不算) ——
  | 'HEIGHT_MIN_BY_GENDER'       // {male:cm, female:cm} 例: 公安男 170 / 女 160
  | 'WEIGHT_MIN_BY_GENDER'       // {male:kg, female:kg} 例: 司法男 50 / 女 45 (绝对体重下限)
  | 'BMI_RANGE'                  // {min:number, max:number} 例: 军队 17.5-30
  | 'VISION_NAKED_MIN'           // {value:number} 例: 4.8 (单眼裸眼下限, 两眼都要 >= 该值)
  | 'COLOR_VISION_NORMAL';       // 无 params, 要求 colorBlind=false 且 colorWeak=false

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
  type: 'pdf' | 'xlsx' | 'doc' | 'announcement';
  /** 优先 = externalUrl (官网链接); 次 = /attachments/policy/<filename>; 都没 = null */
  downloadUrl: string | null;
  /** true 表示有可点击的链接 (本地文件存在 or 外链有效) */
  available: boolean;
  sourceNote?: string;
  /** announcement / 外站资源: true 时前端只显示"查看", 不分预览/下载 */
  external?: boolean;
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
  /** 招生考试报前言该项目的原文文案（前端"详细"可展开显示） */
  policyText?: string;
}

export interface ReferenceFile {
  title: string;
  filename: string | null;
  type: 'pdf' | 'xlsx' | 'doc' | 'announcement';
  /** 外站链接 (官网公告等), 跟 filename 互斥 */
  externalUrl?: string;
  sourceNote?: string;
}

export interface SubsetResult {
  code: string;
  name: string;
  description: string;
  verdict: SubsetVerdict;
  rulesEval: RuleEvalResult[];
  references: ReferenceItem[];
  /** 招生考试报前言原文文案 */
  policyText?: string;
}

export interface EligibilityRulesJsonV2 extends EligibilityRulesJson {
  subsets?: SubsetRule[];
}
