import { Injectable, BadRequestException, NotFoundException, ForbiddenException, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { FEATURE_FLAGS } from '../../config/feature-flags';
import { ScoreSegmentService } from '../score-segment/score-segment.service';
import { buildHardFilterWhere } from './filters/hard-filter';
import {
  rollupByUniversity,
  sortCandidateUniversities,
  RollupContext,
} from './university-rollup';
import { GenderRule } from './filters/soft-rules/gender.rule';
import { HealthRestrictionRule } from './filters/soft-rules/health-restriction.rule';
import { HouseholdRule } from './filters/soft-rules/household.rule';
import { EthnicityRule } from './filters/soft-rules/ethnicity.rule';
import { TuitionRule } from './filters/soft-rules/tuition.rule';
import { NatureRule } from './filters/soft-rules/nature.rule';
import { filterGroupsBySinoForeign, filterUniversitiesBySinoForeign } from './sino-foreign-filter';
import { filterGroupsByRecruitType, collectRecruitTypes } from './recruit-type-filter';
import {
  filterGroupsByRankWindow,
  filterUniversitiesByRankWindow,
  poolRankBounds,
  type RankWindow,
} from './rank-window-filter';
import { filterEpsBySubjectRequirement, studentMeetsSubjectRequirement } from './subject-requirement-filter';
import { isRegionMismatch, normalizeRegion } from './region-match';
import { SoftRule, SoftFailReason } from './filters/soft-rule.interface';
import { calcDynamicGradient, calcGradient } from './gradient-calculator';
import { confirmedBonusPoints } from '../policy/bonus-points.util';
import { resolveBatchQueryShape } from './batch-alias';
import type { RankStrategyResult } from '../recommend/interfaces/recommend.types';
import { RankStrategyService } from '../recommend/services/rank-strategy.service';
import {
  flattenPreferredMajors,
  getTierMajors,
  listTiers,
  type PreferredMajorTier,
} from '../../utils/preferred-majors';

interface GetCandidatesQuery {
  page: number;
  pageSize: number;
  keyword?: string; // 旧接口兼容: 院校/专业合并
  keywordUniversity?: string; // 仅匹配 university.name
  keywordMajor?: string; // 匹配 major.name OR majorName
  keywordGroup?: string; // 匹配 groupName(定向县/专业组名), 提前批公费定向场景按县筛组
  // 梯度档位过滤(全池口径, 分页前生效): 冲/稳/保/无史线; 不传 = 全部。
  // 在缓存后的分页层应用, 切档不触发重算
  gradientBand?: 'RUSH' | 'STABLE' | 'SAFE' | 'NO_LINE' | string;
  // DTO 声明为 boolean | string 以绕过 ValidationPipe 隐式转换 (见 dto 注释),
  // 运行时经 @Transform 恒为 boolean; 消费端用 !== false / === false 判断。
  includeSoftFails?: boolean | string;
  sort?: CandidateGroupSort | string; // 院校模式接受 university sort 值
  sortDir?: SortDir; // 排序方向 (GROUP 视图可比较轴): DESC=轴默认, ASC=翻转
  tier?: number;
  excludeAdded?: boolean | string;
  purity?: string; // csv 'S,A,B,C'; 空 = 不过滤
  recruitType?: string; // 招生类型 CSV 多选; 空 = 不过滤; 分页层应用(同 sinoForeign)
  groupBy?: 'GROUP' | 'UNIVERSITY'; // 视图模式; UNIVERSITY=院校卡上卷
  nature?: 'public' | 'private'; // 院校优先视图: 办学性质过滤
  sinoForeign?: 'only' | 'exclude'; // 中外合作过滤: only/exclude/空; 两视图均生效
  includeRegionMismatch?: boolean | string; // 是否展开"非意向地区"院校组(默认 false=折叠); 仅 GROUP 视图
  minScore?: number; // 分数条下界(今年预估分)
  maxScore?: number; // 分数条上界
  // 是否把"硬规则不符"(选科/再选/性别/健康/户籍/民族, 客观资格不符=投档资格不符)也带出来,
  // 放进每组的 hardFailMajors 独立桶(灰显+禁加入), 默认 false=维持原逻辑(直接剔除, 输出不变)。
  includeHardFails?: boolean | string;
}

type CandidateGroupSort =
  | 'MAJOR_MATCH'
  | 'SAFETY'
  | 'MAJOR_MIN_SCORE'
  | 'UNIVERSITY_RANK'
  | 'MAJOR_STRENGTH';
type SortDir = 'ASC' | 'DESC';
type CandidateGroupScoreSource = 'GROUP' | 'FILING' | 'MAJOR' | 'NONE';
type StudentRankSource = 'PROFILE' | 'SCORE_SEGMENT' | 'MISSING';
type FirstChoice = 'PHYSICS' | 'HISTORY';
type SecondarySubject = 'CHEMISTRY' | 'BIOLOGY' | 'GEOGRAPHY' | 'POLITICS';
type CandidateMajorDisplaySection = 'RECOMMENDED' | 'BACKUP' | 'RISK';

interface EnrollmentPlanSourceInput {
  planYear: number;
  province: string;
  batchName: string;
  subjects: string;
}

interface CandidateGroupFullResult {
  total: number;
  planYear: number;
  sourceYear: number;
  admissionBaselineYear: number;
  scoreSegmentYear: number;
  previousYear: number;
  sourceBatchName: string;
  isFallbackYear: boolean;
  studentRankUsed: number;
  studentRankSource: StudentRankSource;
  storedRank: number | null;
  scoreBasedRank: number | null;
  // 政策加分双轨: rawRank = 裸分位次; bonusPoints > 0 时 studentRankUsed 已按 裸分+加分 换算
  studentRawRank: number;
  studentBonusPoints: number;
  // 全池梯度计数(rush=极冲/冲/小冲, stable=稳/稳保, safe=保/强保/兜底) — 前端 tab 用全池口径, 不能拿当前页数
  tierCounts: { rush: number; stable: number; safe: number; noLine: number };
  sort: string; // 院校模式可为 university sort, 故放宽
  groups: any[];
  // 学生当前的意向梯队结构(给前端 chip 渲染); groupCount = 假设切到该 tier 能看到的候选 group 数
  // 不考虑 RECOMMENDED/BACKUP 是否为空 (粗略统计), 已应用硬过滤 + keyword + excludeAdded
  availableTiers: Array<{ tier: number; majors: string[]; groupCount: number }>;
  // 当前应用的 tier (echo 回去, 便于前端 URL 同步)
  appliedTier: number;
  predictedScoreRange?: { min: number; max: number } | null; // 滑块定义域: 全池预测分范围
}

function uniqueValues<T extends string | number>(values: Array<T | null | undefined>): T[] {
  return Array.from(new Set(values.filter((value): value is T => value !== null && value !== undefined)));
}

// 与前端 gradientTier/gradientTone 同口径: dynamicGradient.tier 优先, 缺省按 suggestedGradient
// 组的梯度档位归类: 无史线单列(梯度引擎对无线组兜底 BAO, 混进"保底"会虚高且与卡片标签矛盾)
function gradientBandOf(g: any): 'RUSH' | 'STABLE' | 'SAFE' | 'NO_LINE' {
  if (g?.dynamicGradient && g.dynamicGradient.baseMinRank == null) return 'NO_LINE';
  const tier = g?.dynamicGradient?.tier ?? g?.suggestedGradient ?? 'WEN';
  if (tier === 'JI_CHONG' || tier === 'CHONG' || tier === 'XIAO_CHONG') return 'RUSH';
  if (tier === 'BAO' || tier === 'QIANG_BAO' || tier === 'DIBAO') return 'SAFE';
  return 'STABLE';
}

function countTiers(groups: any[]): { rush: number; stable: number; safe: number; noLine: number } {
  const counts = { rush: 0, stable: 0, safe: 0, noLine: 0 };
  for (const g of groups) {
    const band = gradientBandOf(g);
    if (band === 'NO_LINE') counts.noLine += 1;
    else if (band === 'RUSH') counts.rush += 1;
    else if (band === 'SAFE') counts.safe += 1;
    else counts.stable += 1;
  }
  return counts;
}

function addInFilter(where: Record<string, unknown>, field: string, values: Array<string | number | null | undefined>) {
  const compact = uniqueValues(values);
  if (compact.length > 0) {
    where[field] = { in: compact };
  }
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

// GroupPurity 唯一键不含 recruitType — 单独提供 4 字段拼接
function groupPurityKeyOf(row: {
  universityId: number;
  groupCode?: string | null;
  batch?: string | null;
  subjects?: string | null;
}) {
  return [row.universityId, row.groupCode ?? '', row.batch ?? '', row.subjects ?? ''].join('|');
}

function groupKeyOf(row: {
  universityId: number;
  groupCode?: string | null;
  batch?: string | null;
  recruitType?: string | null;
  subjects?: string | null;
}) {
  return [
    row.universityId,
    row.groupCode ?? '',
    row.batch ?? '',
    row.recruitType ?? '',
    row.subjects ?? '',
  ].join('|');
}

function recordKeyOf(row: {
  universityId: number;
  subjects?: string | null;
  batch?: string | null;
  recruitType?: string | null;
  groupCode?: string | null;
  majorCode?: string | null;
  majorName?: string | null;
  year: number;
}) {
  return [
    row.universityId,
    row.subjects ?? '',
    row.batch ?? '',
    row.recruitType ?? '',
    row.groupCode ?? '',
    row.majorCode ?? '',
    row.majorName ?? '',
    row.year,
  ].join('|');
}

function bestNumber(values: Array<number | null | undefined>, mode: 'min' | 'max' = 'min') {
  const compact = values.filter((value): value is number => typeof value === 'number');
  if (compact.length === 0) return null;
  return mode === 'min' ? Math.min(...compact) : Math.max(...compact);
}

function gradientPriority(gradient: string | null | undefined) {
  if (gradient === 'WEN') return 0;
  if (gradient === 'BAO') return 1;
  if (gradient === 'CHONG') return 2;
  return 3;
}

function tierDefaultPriority(tier: string | null | undefined, gradient: string | null | undefined) {
  const value = tier ?? gradient;
  const order: Record<string, number> = {
    WEN: 0,
    WEN_BAO: 1,
    BAO: 2,
    QIANG_BAO: 3,
    DIBAO: 4,
    XIAO_CHONG: 5,
    CHONG: 6,
    JI_CHONG: 7,
  };
  return order[value ?? ''] ?? gradientPriority(gradient);
}

function tierSafetyPriority(tier: string | null | undefined, gradient: string | null | undefined) {
  const value = tier ?? gradient;
  const order: Record<string, number> = {
    DIBAO: 0,
    QIANG_BAO: 1,
    BAO: 2,
    WEN_BAO: 3,
    WEN: 4,
    XIAO_CHONG: 5,
    CHONG: 6,
    JI_CHONG: 7,
  };
  return order[value ?? ''] ?? 8;
}

function rankFitDistance(studentRank: number, historyMinRank: number | null | undefined) {
  if (!historyMinRank || historyMinRank <= 0) return 999;
  return Math.abs(historyMinRank / studentRank - 1);
}

function metricNumber(value: unknown, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function compareDesc(a: unknown, b: unknown) {
  return metricNumber(b, -Infinity) - metricNumber(a, -Infinity);
}

function compareAscMissingLast(a: unknown, b: unknown) {
  const av = metricNumber(a, Infinity);
  const bv = metricNumber(b, Infinity);
  return av - bv;
}

function rankingNumber(value: unknown) {
  const parsed = metricNumber(value, Infinity);
  return parsed > 0 ? parsed : Infinity;
}

function compareRankingAsc(a: unknown, b: unknown) {
  return rankingNumber(a) - rankingNumber(b);
}

function supplementaryForGroupRisk(supplementary: any) {
  // GROUP_SUBJECT 是真正的"本组本科类"征集(2025 起按专业组代码+科目重建), 可喂给梯度引擎;
  // 旧的院校×批次汇总(会让全批次每组都显安全)不再使用。
  return (supplementary?.scope === 'GROUP_SUBJECT' || supplementary?.scope === 'GROUP') ? supplementary : null;
}

function universityTagScore(group: any) {
  return (
    (group.university?.is985 ? 100 : 0) +
    (group.university?.is211 ? 60 : 0) +
    (group.university?.isDoubleFirstClass ? 40 : 0)
  );
}

function extractRankingScore(value: unknown) {
  const text = String(value ?? '');
  const match = text.match(/\d+/);
  if (!match) return 0;
  const rank = Number(match[0]);
  if (!Number.isFinite(rank) || rank <= 0) return 0;
  return Math.max(0, 100 - rank);
}

// 学生 tuitionBudget 枚举 → 学费上限（元/年）
const TUITION_CAP: Record<string, number> = {
  LOW: 6000,
  MEDIUM: 10000,
  HIGH: 30000,
  UNLIMITED: Number.POSITIVE_INFINITY,
};

interface PrefMatchResult {
  province?: 'match' | 'mismatch';
  tuition?: 'within' | 'over';
  career?: 'strong' | 'weak';
  subjects?: 'match';
}

// 学生偏好对比：candidate group 与 student preferences 的 4 维匹配
function buildPrefMatch(params: {
  studentProvince: string | null | undefined;
  studentTuitionBudget: string | null | undefined;
  studentCareerPlan: string | null | undefined;
  universityProvince: string | null | undefined;
  anchorTuition: number | null | undefined;
  anchorHasMasterPoint: boolean;
  anchorEmploymentRate: number | null | undefined;
}): PrefMatchResult {
  const result: PrefMatchResult = {};

  // 1. 地域：本省 / 外省
  if (params.studentProvince && params.universityProvince) {
    result.province = params.studentProvince === params.universityProvince ? 'match' : 'mismatch';
  }

  // 2. 学费：是否在学生预算内（仅当 student 设了 tuitionBudget 且候选有 tuition）
  if (params.studentTuitionBudget && params.anchorTuition != null) {
    const cap = TUITION_CAP[params.studentTuitionBudget];
    if (cap != null) {
      result.tuition = params.anchorTuition <= cap ? 'within' : 'over';
    }
  }

  // 3. 职业方向：考研 → 看硕士点；就业 → 看就业率；其他不评
  if (params.studentCareerPlan === 'POSTGRADUATE') {
    result.career = params.anchorHasMasterPoint ? 'strong' : 'weak';
  } else if (params.studentCareerPlan === 'EMPLOYMENT') {
    result.career =
      params.anchorEmploymentRate != null && params.anchorEmploymentRate >= 90 ? 'strong' : 'weak';
  }

  // 4. 选科：候选池已按选科过滤，全部 match
  result.subjects = 'match';

  return result;
}

// 人话化 matchReason：地域 · 档次 · 梯度说明（最多 3 段，· 分隔）
function buildMatchReason(params: {
  universityProvince: string | null | undefined;
  studentProvince: string | null | undefined;
  is985: boolean;
  is211: boolean;
  isDoubleFirstClass: boolean;
  runningNature: string | null | undefined;
  gradient: string | null | undefined;
}): string {
  const parts: string[] = [];

  // 1. 地域
  if (params.universityProvince && params.studentProvince) {
    parts.push(params.universityProvince === params.studentProvince ? '本省' : '外省');
  }

  // 2. 档次
  if (params.is985) parts.push('985');
  else if (params.is211) parts.push('211');
  else if (params.isDoubleFirstClass) parts.push('双一流');
  else if (params.runningNature === '民办') parts.push('民办');

  // 3. 梯度说明
  switch (params.gradient) {
    case 'JI_CHONG':
      parts.push('位次差距大');
      break;
    case 'CHONG':
      parts.push('位次有挑战');
      break;
    case 'XIAO_CHONG':
    case 'WEN':
      parts.push('位次安全');
      break;
    case 'WEN_BAO':
      parts.push('稳保兼具');
      break;
    case 'BAO':
    case 'QIANG_BAO':
      parts.push('保底稳');
      break;
    case 'DIBAO':
      parts.push('适合兜底');
      break;
    default:
      break;
  }

  return parts.length > 0 ? parts.join('·') : '常规候选';
}

const CANDIDATE_ENROLLMENT_PLAN_SELECT = {
  id: true,
  universityId: true,
  majorId: true,
  year: true,
  province: true,
  planCount: true,
  planNotes: true,
  batch: true,
  level: true,
  subjects: true,
  subjectRequirements: true,
  duration: true,
  tuition: true,
  isSinoForeign: true,
  recruitType: true,
  majorCode: true,
  majorName: true,
  localMasterPoint: true,
  localDoctoralPoint: true,
  groupCode: true,
  groupName: true,
  groupPlanCount: true,
  isNew: true,
  oldBatch: true,
  disciplineEval: true,
  isNationalFeature: true,
  majorRanking: true,
  majorHonor: true,
  university: {
    select: {
      id: true,
      name: true,
      code: true,
      province: true,
      city: true,
      type: true,
      runningNature: true,
      is985: true,
      is211: true,
      isDoubleFirstClass: true,
      softRanking: true,
      logoUrl: true,
      postgradRate: true,
      furtherStudyRate: true,
      employmentRate: true,
      avgSalary: true,
      satisfactionOverall: true,
      satisfactionCount: true,
      universityBackground: true, // 院校背景标签 (卓越教师/C9联盟/五院四系等, '/' 分隔)
      firstClassCategory: true, // 一流学科分类
    },
  },
  major: {
    select: {
      id: true,
      name: true,
      code: true,
      notes: true,
      category: true,
      discipline: true,
      softRating: true,
      description: true,
      careerDirections: true,
      postgraduateDirections: true,
      coreCourses: true,
      employmentRate: true,
      avgSalary: true,
      degree: true,
      standardDuration: true,
      satisfactionScore: true,
      localMasterPoint: true,
      localDoctoralPoint: true,
    },
  },
};

const CANDIDATE_ADMISSION_RECORD_SELECT = {
  universityId: true,
  subjects: true,
  batch: true,
  recruitType: true,
  groupCode: true,
  majorCode: true,
  majorName: true,
  year: true,
  majorMinScore: true,
  majorMinRank: true,
  majorAdmissionCount: true,
  groupMinScore: true,
  groupMinRank: true,
  groupAdmissionCount: true,
  filingMinScore: true,
  filingMinRank: true,
};

const EXAM_TYPE_TO_SUBJECTS: Record<string, string> = {
  PHYSICS: '物理',
  HISTORY: '历史',
  COMPREHENSIVE_LIBERAL: '文科',
  COMPREHENSIVE_SCIENCE: '理科',
};

const SICHUAN = '\u56db\u5ddd';
const PHYSICS = '\u7269\u7406';
const HISTORY = '\u5386\u53f2';
const SCIENCE = '\u7406\u79d1';
const LIBERAL = '\u6587\u79d1';
const CHEMISTRY = '\u5316\u5b66';
const BIOLOGY = '\u751f\u7269';
const GEOGRAPHY = '\u5730\u7406';
const POLITICS = '\u601d\u60f3\u653f\u6cbb';

const SICHUAN_2025_SELECTION_POOLS: Record<FirstChoice, {
  total: number;
  combinations: Array<{ subjects: SecondarySubject[]; count: number }>;
}> = {
  PHYSICS: {
    total: 327018,
    combinations: [
      { subjects: ['CHEMISTRY', 'BIOLOGY'], count: 224560 },
      { subjects: ['CHEMISTRY', 'GEOGRAPHY'], count: 52826 },
      { subjects: ['CHEMISTRY', 'POLITICS'], count: 30624 },
      { subjects: ['GEOGRAPHY', 'BIOLOGY'], count: 14224 },
      { subjects: ['POLITICS', 'BIOLOGY'], count: 4297 },
      { subjects: ['POLITICS', 'GEOGRAPHY'], count: 487 },
    ],
  },
  HISTORY: {
    total: 233352,
    combinations: [
      { subjects: ['POLITICS', 'GEOGRAPHY'], count: 192118 },
      { subjects: ['POLITICS', 'BIOLOGY'], count: 35758 },
      { subjects: ['GEOGRAPHY', 'BIOLOGY'], count: 4358 },
      { subjects: ['POLITICS', 'CHEMISTRY'], count: 466 },
      { subjects: ['CHEMISTRY', 'BIOLOGY'], count: 504 },
      { subjects: ['CHEMISTRY', 'GEOGRAPHY'], count: 148 },
    ],
  },
};

@Injectable()
export class PlanCandidateService {
  private readonly candidateGroupCache = new Map<string, { expiresAt: number; value: CandidateGroupFullResult }>();
  private readonly candidateGroupCacheTtlMs = 5 * 60 * 1000;
  private readonly candidateGroupCacheLimit = 40;

  constructor(
    private prisma: PrismaService,
    @Optional() private readonly scoreSegmentService?: ScoreSegmentService,
    @Optional() private readonly rankStrategyService?: RankStrategyService,
  ) {}

  private candidateGroupCacheKey(plan: any, q: GetCandidatesQuery) {
    return JSON.stringify({
      planId: plan.id,
      planUpdatedAt: plan.updatedAt instanceof Date ? plan.updatedAt.getTime() : plan.updatedAt,
      studentUpdatedAt: plan.student?.updatedAt instanceof Date ? plan.student.updatedAt.getTime() : plan.student?.updatedAt,
      keyword: q.keyword?.trim() || '',
      keywordUniversity: q.keywordUniversity?.trim() || '',
      keywordMajor: q.keywordMajor?.trim() || '',
      keywordGroup: q.keywordGroup?.trim() || '',
      includeSoftFails: q.includeSoftFails !== false,
      // includeHardFails 影响池构建(是否生成 hardFailMajors), 必须进缓存键, 否则开关切换命中旧池。
      includeHardFails: q.includeHardFails === true || q.includeHardFails === 'true',
      sort: q.sort ?? 'MAJOR_MATCH',
      tier: q.tier ?? 0,
      excludeAdded: q.excludeAdded !== false,
    });
  }

  private getCandidateGroupCache(key: string) {
    const cached = this.candidateGroupCache.get(key);
    if (!cached) return null;
    if (cached.expiresAt < Date.now()) {
      this.candidateGroupCache.delete(key);
      return null;
    }
    return cached.value;
  }

  private setCandidateGroupCache(key: string, value: CandidateGroupFullResult) {
    if (this.candidateGroupCache.size >= this.candidateGroupCacheLimit) {
      const oldest = this.candidateGroupCache.keys().next().value;
      if (oldest) this.candidateGroupCache.delete(oldest);
    }
    this.candidateGroupCache.set(key, {
      expiresAt: Date.now() + this.candidateGroupCacheTtlMs,
      value,
    });
  }

  private paginateCandidateGroups(
    value: CandidateGroupFullResult,
    page: number,
    pageSize: number,
    gradientBand?: string,
    sinoForeign?: 'only' | 'exclude',
    rankWindow?: RankWindow | null,
    includeRegionMismatch = false,
    recruitType?: string,
  ) {
    // 招生类型过滤(分页层): 先把全量池收窄成工作集, 让 band/sino/rank/region/tierCounts 全部基于它,
    // 否则冲/稳/保 chip 计数会大于列表 total(同非意向地区折叠的已有教训)。空选择 = 全部。
    const baseGroups = filterGroupsByRecruitType(value.groups, recruitType);
    // 档位过滤在缓存后的分页层做: 切换冲/稳/保/无史线 chip 不触发全量重算,
    // total 改为档内数量(驱动分页), tierCounts 保持(收窄后)全池口径(驱动 chip 计数)
    const validBand = gradientBand && ['RUSH', 'STABLE', 'SAFE', 'NO_LINE'].includes(gradientBand)
      ? gradientBand
      : null;
    const banded = validBand
      ? baseGroups.filter((g: any) => gradientBandOf(g) === validBand)
      : baseGroups;
    const afterSino = filterGroupsBySinoForeign(banded, sinoForeign);
    const afterRank = filterGroupsByRankWindow(afterSino, rankWindow ?? null);
    // 非意向地区(整所院校都不在学生意向省/市): 默认折叠隐藏, "显示非意向地区"开关展开。
    // 同档位过滤一样在分页层做(切开关不重算池)。count 取当前其他过滤后的口径, 驱动开关 (N)。
    const regionMismatchCount = afterRank.filter((g: any) => g?.regionMismatch).length;
    const pool = includeRegionMismatch ? afterRank : afterRank.filter((g: any) => !g?.regionMismatch);
    const start = (page - 1) * pageSize;
    // tierCounts 驱动冲/稳/保/无史线 chip 计数, 保持(招生类型收窄后)全池口径,
    // 折叠态(includeRegionMismatch=false)下扣掉被隐藏的非意向地区组, 否则 chip 数 > 列表 total。
    const tierCounts = includeRegionMismatch
      ? countTiers(baseGroups)
      : countTiers(baseGroups.filter((g: any) => !g?.regionMismatch));
    return {
      ...value,
      page,
      pageSize,
      total: pool.length,
      regionMismatchCount,
      tierCounts,
      availableRecruitTypes: collectRecruitTypes(value.groups),
      groups: pool.slice(start, start + pageSize),
    };
  }

  // 从学生档案抽取「院校优先」上卷所需的意向集合 (院校名/id/序号 + 意向省市)
  // preferredUniversities 兼容两种形态: ['北大', ...] 或 [{ id, name }, ...]
  private buildRollupContext(student: any): RollupContext {
    const names = new Set<string>();
    const ids = new Set<number>();
    const order = new Map<string, number>();
    const prefU = Array.isArray(student?.preferredUniversities) ? student.preferredUniversities : [];
    prefU.forEach((item: any, idx: number) => {
      if (typeof item === 'string') {
        names.add(item);
        if (!order.has(item)) order.set(item, idx + 1);
      } else if (item && typeof item === 'object') {
        if (typeof item.name === 'string') {
          names.add(item.name);
          if (!order.has(item.name)) order.set(item.name, idx + 1);
        }
        if (typeof item.id === 'number') ids.add(item.id);
      }
    });
    const regions = new Set<string>();
    for (const field of ['preferredProvinces', 'preferredCities']) {
      const arr = Array.isArray(student?.[field]) ? student[field] : [];
      // 去"省/市"后缀归一: 学生意向城市存"成都市", 院校库存"成都", 不归一则地域优先排序/匹配永远对不上
      for (const r of arr) {
        if (typeof r !== 'string') continue;
        const n = normalizeRegion(r);
        if (n) regions.add(n);
      }
    }
    return {
      preferredUniversityNames: names,
      preferredUniversityIds: ids,
      preferredUniversityOrder: order,
      preferredRegions: regions,
    };
  }

  // 院校优先视图: 复用已算好的 group 全集 (value.groups), 按院校上卷 + 院校维度排序 + 按院校分页。
  // 不动 value.groups 顺序 (rollup 内部建新数组), 故缓存对象不被破坏, 两模式共享同一份组聚合。
  private paginateAsUniversities(
    value: CandidateGroupFullResult,
    q: GetCandidatesQuery,
    student: any,
    page: number,
    pageSize: number,
    rankWindow?: RankWindow | null,
  ) {
    const ctx = this.buildRollupContext(student);
    const baseGroups = filterGroupsByRecruitType(value.groups, q.recruitType);
    let universities = rollupByUniversity(baseGroups, ctx);
    // 办学性质过滤 (公办/民办), 在排序+分页前
    if (q.nature === 'public' || q.nature === 'private') {
      universities = universities.filter((u) => {
        const isPub = String(u.university?.runningNature ?? '').includes('公办') ||
          String(u.university?.runningNature ?? '').includes('公立');
        return q.nature === 'public' ? isPub : !isPub;
      });
    }
    // 中外合作过滤 (校内任一组含中外), 在排序+分页前
    universities = filterUniversitiesBySinoForeign(universities, q.sinoForeign);
    // 分数条过滤 (校内任一组命中位次窗口), 在排序+分页前
    universities = filterUniversitiesByRankWindow(universities, rankWindow ?? null);
    // 非意向地区折叠: 整所院校省市都不在学生意向地区时默认折叠隐藏 (院校卡=一所院校, 此处比组视角更自然),
    // includeRegionMismatch=true 才展开。regionMismatch 是院校级属性 (同校所有组一致), 取任一组即可。
    // 与 GROUP 视图同口径: count 在其他过滤之后取, 驱动前端"显示非意向地区 (N)"开关。
    const isRegionMismatchUni = (u: any) =>
      Array.isArray(u.groups) && u.groups.some((g: any) => g?.regionMismatch);
    const regionMismatchCount = universities.filter(isRegionMismatchUni).length;
    if (q.includeRegionMismatch !== true) {
      universities = universities.filter((u) => !isRegionMismatchUni(u));
    }
    sortCandidateUniversities(universities, q.sort ?? 'UNIVERSITY_OVERALL', value.studentRankUsed);
    const start = (page - 1) * pageSize;
    const { groups: _groups, ...meta } = value;
    return {
      ...meta,
      groupBy: 'UNIVERSITY' as const,
      availableRecruitTypes: collectRecruitTypes(value.groups),
      total: universities.length,
      regionMismatchCount,
      page,
      pageSize,
      universities: universities.slice(start, start + pageSize),
    };
  }

  // 分数条: 把分数区间换成位次窗口(高分→小位次, 低分→大位次). 缺服务/缺数据/输入不全 → null(不过滤).
  private async resolveRankWindow(
    minScore: number | undefined,
    maxScore: number | undefined,
    year: number,
    subjects: string,
  ): Promise<RankWindow | null> {
    if (typeof minScore !== 'number' || typeof maxScore !== 'number') return null;
    if (!this.scoreSegmentService) return null;
    try {
      const hi = await this.scoreSegmentService.scoreToRank(year, subjects as any, Math.max(minScore, maxScore));
      const lo = await this.scoreSegmentService.scoreToRank(year, subjects as any, Math.min(minScore, maxScore));
      return { minRank: hi.rank, maxRank: lo.rank };
    } catch {
      return null;
    }
  }

  // 滑块定义域: 全池预测位次的最小/最大换成分数(最小位次→最高分, 最大位次→最低分). 缺服务/数据 → null.
  private async computePredictedScoreRange(
    groups: any[],
    year: number,
    subjects: string,
  ): Promise<{ min: number; max: number } | null> {
    if (!this.scoreSegmentService) return null;
    const bounds = poolRankBounds(groups);
    if (!bounds) return null;
    try {
      const best = await this.scoreSegmentService.rankToScore(year, subjects as any, bounds.minPoint);
      const worst = await this.scoreSegmentService.rankToScore(year, subjects as any, bounds.maxPoint);
      return { min: worst.score, max: best.score };
    } catch {
      return null;
    }
  }

  private provinceAliases(province: string) {
    const values = [province];
    if (province === 'Sichuan' || province === SICHUAN) {
      values.push(SICHUAN, 'Sichuan');
    }
    return uniqueValues(values);
  }

  private normalizeFirstChoice(value?: string | null): FirstChoice | null {
    const text = String(value ?? '').toLowerCase();
    if (text.includes('physics') || text.includes(PHYSICS) || text.includes(SCIENCE)) {
      return 'PHYSICS';
    }
    if (text.includes('history') || text.includes(HISTORY) || text.includes(LIBERAL)) {
      return 'HISTORY';
    }
    return null;
  }

  private examTypeCandidates(subjects: string, year: number) {
    const firstChoice = this.normalizeFirstChoice(subjects);
    if (firstChoice === 'PHYSICS') {
      return year >= 2025
        ? uniqueValues([subjects, PHYSICS, `${PHYSICS}\u7c7b`, 'Physics'])
        : uniqueValues([SCIENCE, 'Science']);
    }
    if (firstChoice === 'HISTORY') {
      return year >= 2025
        ? uniqueValues([subjects, HISTORY, `${HISTORY}\u7c7b`, 'History'])
        : uniqueValues([LIBERAL, 'Liberal']);
    }
    return uniqueValues([subjects]);
  }

  private batchCandidates(batchName: string, year: number) {
    const text = String(batchName ?? '');
    const candidates = [batchName];
    if (year >= 2025) {
      if (text.includes('\u7279\u6b8a') || text.includes('\u9ad8\u6821\u4e13\u9879')) {
        candidates.push('\u7279\u6b8a\u7c7b\u578b\u62db\u751f\u63a7\u5236\u7ebf', '\u7279\u6b8a\u7c7b\u578b');
      } else if (text.includes('\u4e13\u79d1') || text.toLowerCase().includes('specialty')) {
        candidates.push('\u9ad8\u804c\uff08\u4e13\u79d1\uff09\u6279\u6b21', '\u4e13\u79d1');
      } else if (text.includes('\u672c\u79d1') || text.toLowerCase().includes('batch')) {
        candidates.push('\u672c\u79d1\u6279\u6b21', '\u672c\u79d1B');
      }
    } else {
      if (text.includes('\u4e13\u79d1') || text.toLowerCase().includes('specialty')) {
        candidates.push('\u4e13\u79d1\u6279', '\u4e13\u79d1');
      } else if (text.includes('\u4e00') || text.toLowerCase().includes('first')) {
        candidates.push('\u672c\u79d1\u7b2c\u4e00\u6279', '\u672c\u4e00');
      } else {
        candidates.push('\u672c\u79d1\u7b2c\u4e8c\u6279', '\u672c\u4e8c');
      }
    }
    return uniqueValues(candidates);
  }

  private async lookupBatchCompetition(province: string, subjects: string, batchName: string, year: number) {
    const examTypes = this.examTypeCandidates(subjects, year);
    const batchNames = this.batchCandidates(batchName, year);
    if (!examTypes.length || !batchNames.length || !(this.prisma as any).batchLine?.findFirst) {
      return null;
    }

    const line = await (this.prisma as any).batchLine.findFirst({
      where: {
        year,
        province: { in: this.provinceAliases(province) },
        batch: { in: batchNames },
        examType: { in: examTypes },
      },
      orderBy: { score: 'desc' },
    });
    if (!line || !(this.prisma as any).scoreSegment?.findFirst) return null;

    const segment = await (this.prisma as any).scoreSegment.findFirst({
      where: {
        year,
        province: { in: this.provinceAliases(province) },
        examType: { in: examTypes },
        score: line.score,
      },
    });

    return {
      year,
      batch: line.batch,
      examType: line.examType,
      batchLineScore: line.score,
      count: segment?.cumulativeCount ?? null,
    };
  }

  private async resolveBatchCompetition(province: string, subjects: string, batchName: string, currentYear: number) {
    const previousYear = currentYear - 1;
    const [current, previous] = await Promise.all([
      this.lookupBatchCompetition(province, subjects, batchName, currentYear),
      this.lookupBatchCompetition(province, subjects, batchName, previousYear),
    ]);
    return {
      currentYear,
      previousYear,
      currentCount: current?.count ?? null,
      previousCount: previous?.count ?? null,
      currentBatchLineScore: current?.batchLineScore ?? null,
      previousBatchLineScore: previous?.batchLineScore ?? null,
      currentBatch: current?.batch ?? null,
      previousBatch: previous?.batch ?? null,
      currentExamType: current?.examType ?? null,
      previousExamType: previous?.examType ?? null,
    };
  }

  private requiredSecondarySubjects(text?: string | null): SecondarySubject[] {
    const value = String(text ?? '').toLowerCase();
    const subjects: SecondarySubject[] = [];
    if (value.includes('chemistry') || value.includes(CHEMISTRY)) subjects.push('CHEMISTRY');
    if (value.includes('biology') || value.includes(BIOLOGY)) subjects.push('BIOLOGY');
    if (value.includes('geography') || value.includes(GEOGRAPHY)) subjects.push('GEOGRAPHY');
    if (value.includes('politics') || value.includes(POLITICS) || value.includes('\u653f\u6cbb')) subjects.push('POLITICS');
    return uniqueValues(subjects);
  }

  private estimateSelectionCompetition(rows: any[], subjects: string) {
    const firstChoice = this.normalizeFirstChoice(subjects);
    if (!firstChoice) {
      return {
        sourceYear: null,
        sourceType: 'MISSING',
        firstChoice: null,
        requiredSubjects: [],
        eligibleCount: null,
        subjectCount: null,
      };
    }

    const requirementText = rows
      .map((row) => row.subjectRequirements)
      .find((value) => typeof value === 'string' && value.trim().length > 0) ?? '';
    const requiredSubjects = this.requiredSecondarySubjects(requirementText);
    const pool = SICHUAN_2025_SELECTION_POOLS[firstChoice];
    const eligibleCount = requiredSubjects.length
      ? pool.combinations
        .filter((combo) => requiredSubjects.every((required) => combo.subjects.includes(required)))
        .reduce((sum, combo) => sum + combo.count, 0)
      : pool.total;

    return {
      sourceYear: 2025,
      sourceType: 'PUBLIC_ESTIMATE',
      firstChoice,
      requiredSubjects,
      eligibleCount,
      subjectCount: pool.total,
    };
  }

  // 征集(已校验版 2025 起重建): supplementary_records 含 subject(物理/历史)+ groupCode + majorCode。
  // 按 (院校, 批次, 专业组代码) 聚合到组级, 用学生科类过滤(物理生只看物理征集), 多轮累计。
  // 同时给出组内各专业的征集数(byMajorCode/byMajorName), 供展开态专业行显示。
  private async loadSupplementaryByGroup(
    groups: Map<string, any[]>,
    province: string,
    year: number,
    studentSubject?: string,
  ) {
    const result = new Map<string, any>();
    if (groups.size === 0 || !(this.prisma as any).supplementaryRecord?.findMany) return result;

    const groupRows = Array.from(groups.entries()).map(([groupKey, rows]) => ({ groupKey, row: rows[0] }));
    const records = await (this.prisma as any).supplementaryRecord.findMany({
      where: {
        province: { in: this.provinceAliases(province) },
        year,
        universityId: { in: uniqueValues(groupRows.map(({ row }) => row.universityId)) },
        groupCode: { not: null },
        ...(studentSubject ? { subject: studentSubject } : {}),
      },
      select: {
        universityId: true, batch: true, groupCode: true, subject: true,
        majorCode: true, majorName: true, planCount: true, roundNumber: true,
      },
    });

    // 聚合: 院校|批次|组代码 → 累计计划数 + 轮次集合 + 组内各专业征集
    const agg = new Map<string, { total: number; rounds: Set<number>; byCode: Map<string, number>; byName: Map<string, number> }>();
    for (const r of records) {
      const key = `${r.universityId}|${r.batch}|${r.groupCode}`;
      let a = agg.get(key);
      if (!a) { a = { total: 0, rounds: new Set(), byCode: new Map(), byName: new Map() }; agg.set(key, a); }
      const pc = r.planCount ?? 0;
      a.total += pc;
      if (r.roundNumber != null) a.rounds.add(r.roundNumber);
      if (r.majorCode) a.byCode.set(r.majorCode, (a.byCode.get(r.majorCode) ?? 0) + pc);
      if (r.majorName) a.byName.set(r.majorName, (a.byName.get(r.majorName) ?? 0) + pc);
    }

    for (const { groupKey, row } of groupRows) {
      const a = agg.get(`${row.universityId}|${row.batch}|${row.groupCode}`);
      if (!a || a.total <= 0) continue;
      result.set(groupKey, {
        scope: 'GROUP_SUBJECT',
        subject: studentSubject ?? null,
        sourceYear: year,
        totalPlanCount: a.total,
        totalRounds: a.rounds.size,
        byMajorCode: a.byCode,
        byMajorName: a.byName,
      });
    }
    return result;
  }

  private async resolveEnrollmentPlanSource(input: EnrollmentPlanSourceInput) {
    // 批次名走别名解析 (配置口径 → 数据实名), 否则专项/高职/预科批次永远查到 0 行
    const shape = resolveBatchQueryShape(input.batchName);
    const rows = await this.prisma.enrollmentPlan.groupBy({
      by: ['year'],
      where: {
        province: input.province,
        batch: shape.batches.length === 1 ? shape.batches[0] : { in: shape.batches },
        ...(shape.recruitTypeContains ? { recruitType: { contains: shape.recruitTypeContains } } : {}),
        subjects: input.subjects,
        year: { lte: input.planYear },
      },
      _count: { _all: true },
      orderBy: { year: 'desc' },
      take: 1,
    });
    const sourceYear = rows[0]?.year ?? input.planYear;

    // 解耦取数年: 招生计划(sourceYear)归招生计划; 录取线/换算各自落到≤planYear的最近有数据年,
    // 否则 2026 计划入库即 sourceYear=2026, 而录取/段表止于2025 → 当年线空 → 全组 NO_LINE。
    const [adBaselineRows, segBaselineRows] = await Promise.all([
      this.prisma.admissionRecord.groupBy({
        by: ['year'],
        where: { province: input.province, year: { lte: input.planYear } },
        orderBy: { year: 'desc' },
        take: 1,
      }),
      this.prisma.scoreSegment.groupBy({
        by: ['year'],
        where: { province: input.province, year: { lte: input.planYear } },
        orderBy: { year: 'desc' },
        take: 1,
      }),
    ]);
    const admissionBaselineYear = adBaselineRows[0]?.year ?? sourceYear;
    const scoreSegmentYear = segBaselineRows[0]?.year ?? sourceYear;

    return {
      planYear: input.planYear,
      sourceYear,
      admissionBaselineYear,
      scoreSegmentYear,
      sourceBatchName: input.batchName,
      isFallbackYear: sourceYear !== input.planYear,
    };
  }

  private buildAdmissionRecordWhere(eps: any[], province: string, years = [2024, 2025]) {
    const where: Record<string, unknown> = {
      year: { in: years },
      province,
    };

    addInFilter(where, 'subjects', eps.map((ep) => ep.subjects));
    addInFilter(where, 'batch', eps.map((ep) => ep.batch));
    addInFilter(where, 'recruitType', eps.map((ep) => ep.recruitType));
    addInFilter(where, 'universityId', eps.map((ep) => ep.universityId));
    addInFilter(where, 'groupCode', eps.map((ep) => ep.groupCode));
    addInFilter(where, 'majorCode', eps.map((ep) => ep.majorCode));

    return where;
  }

  // 硬过滤规则: 学生身份属性 (性别 / 健康 / 户籍 / 民族), 不可改变, 不符合直接剔除该专业, 不进任何分区
  private buildHardRules(restrictions: any[]): SoftRule[] {
    return [
      new HealthRestrictionRule(restrictions),
      new GenderRule(),
      new HouseholdRule(),
      new EthnicityRule(),
    ];
  }

  // 软规则: 学生/家长可权衡的偏好 (学费 / 办学性质), 不符合时进风险区, 由 includeSoftFails 控制是否显示
  // 注: 地域不在此 —— 它是院校级整组属性, 走独立的 regionMismatch 标记 + "显示非意向地区"开关折叠, 见 region-match.ts
  private buildSoftRules(): SoftRule[] {
    return [
      new TuitionRule(),
      new NatureRule(),
    ];
  }

  private checkSoftFails(student: any, ep: any, rules: SoftRule[]): SoftFailReason[] {
    const reasons: SoftFailReason[] = [];
    for (const rule of rules) {
      const res = rule.check(student as any, ep as any);
      if (!res.pass && res.reason) reasons.push(res.reason);
    }

    const excludedMajors = asStringArray(student.excludedMajors);
    const excludedCategories = asStringArray(student.excludedMajorCategories);
    const majorName = ep.majorName || ep.major?.name || '';
    const majorCategory = ep.major?.category || '';
    if (excludedMajors.includes(majorName)) {
      reasons.push({
        rule: 'preference.excluded_major',
        expected: 'not excluded',
        actual: majorName,
        severity: 'SOFT_PREFERENCE',
        note: `Student excluded major ${majorName}`,
      });
    }
    if (majorCategory && excludedCategories.includes(majorCategory)) {
      reasons.push({
        rule: 'preference.excluded_major_category',
        expected: 'not excluded',
        actual: majorCategory,
        severity: 'SOFT_PREFERENCE',
        note: `Student excluded major category ${majorCategory}`,
      });
    }
    return reasons;
  }

  private scoreMajorMatch(student: any, ep: any) {
    const preferredMajors = flattenPreferredMajors(student.preferredMajors);
    const preferredCategories = asStringArray(student.preferredMajorCategories);
    const excludedMajors = asStringArray(student.excludedMajors);
    const excludedCategories = asStringArray(student.excludedMajorCategories);
    const majorName = ep.majorName || ep.major?.name || '';
    const category = ep.major?.category || '';
    const reasons: string[] = [];
    let score = 0;

    if (excludedMajors.includes(majorName)) score -= 1000;
    if (category && excludedCategories.includes(category)) score -= 800;
    if (preferredMajors.includes(majorName)) {
      score += 100;
      reasons.push('preferred major');
    }
    if (category && preferredCategories.includes(category)) {
      score += 45;
      reasons.push('preferred category');
    }
    if (typeof ep.major?.employmentRate === 'number') score += Math.min(15, ep.major.employmentRate / 10);
    if (typeof ep.major?.avgSalary === 'number') score += Math.min(10, ep.major.avgSalary / 2000);
    if (String(ep.disciplineEval || '').startsWith('A')) score += 12;
    if (ep.isNationalFeature) score += 8;
    if (String(ep.major?.softRating || '').startsWith('A')) score += 6;

    return { score, reasons };
  }

  private gradeScore(value: unknown) {
    const text = String(value ?? '').trim().toUpperCase();
    if (!text) return 0;
    if (text.startsWith('A+')) return 100;
    if (text.startsWith('A-')) return 88;
    if (text.startsWith('A')) return 94;
    if (text.startsWith('B+')) return 78;
    if (text.startsWith('B-')) return 66;
    if (text.startsWith('B')) return 72;
    if (text.startsWith('C+')) return 58;
    if (text.startsWith('C-')) return 46;
    if (text.startsWith('C')) return 52;
    return 0;
  }

  private majorStrengthScore(ep: any) {
    const evalScore = this.gradeScore(ep.disciplineEval);
    const softScore = this.gradeScore(ep.major?.softRating);
    const rankingScore = extractRankingScore(ep.majorRanking);
    const featureScore = ep.isNationalFeature ? 8 : 0;
    return Number((evalScore * 0.48 + softScore * 0.32 + rankingScore * 0.12 + featureScore).toFixed(2));
  }

  private compareCandidateGroupFallback(a: any, b: any, studentRank: number, includeMatchScore = true) {
    const soft = (a.softFailCount ?? 0) - (b.softFailCount ?? 0);
    if (soft !== 0) return soft;

    const tier = tierDefaultPriority(a.dynamicGradient?.tier, a.suggestedGradient) -
      tierDefaultPriority(b.dynamicGradient?.tier, b.suggestedGradient);
    if (tier !== 0) return tier;

    if (includeMatchScore && b.matchScore !== a.matchScore) return (b.matchScore ?? -999) - (a.matchScore ?? -999);

    const ar = rankFitDistance(studentRank, a.dynamicGradient?.adjustedMinRank ?? a.groupMinRank);
    const br = rankFitDistance(studentRank, b.dynamicGradient?.adjustedMinRank ?? b.groupMinRank);
    if (ar !== br) return ar - br;

    return (b.currentPlanCount ?? 0) - (a.currentPlanCount ?? 0);
  }

  private sortCandidateGroups(groups: any[], sort: string = 'MAJOR_MATCH', studentRank: number, sortDir: SortDir = 'DESC') {
    // 方向: DESC = 该轴默认(好的/分高/最稳在前), ASC = 翻转。
    // sign 只翻转「轴主比较」; softFailCount(合规)永远第一、永不翻; MAJOR_MATCH(综合推荐)无方向。
    const sign = sortDir === 'ASC' ? -1 : 1;

    groups.sort((a, b) => {
      const soft = (a.softFailCount ?? 0) - (b.softFailCount ?? 0);
      if (soft !== 0) return soft;

      if (sort === 'SAFETY') {
        // 录取概率轴: 默认偏保(兜底→保→稳→冲), rankGapRatio 作同档内细分; 翻转 = 偏冲。
        const prim = (tierSafetyPriority(a.dynamicGradient?.tier, a.suggestedGradient) -
          tierSafetyPriority(b.dynamicGradient?.tier, b.suggestedGradient)) ||
          compareDesc(a.dynamicGradient?.rankGapRatio, b.dynamicGradient?.rankGapRatio);
        if (prim !== 0) return prim * sign;
        return this.compareCandidateGroupFallback(a, b, studentRank, false);
      }

      if (sort === 'MAJOR_MIN_SCORE') {
        // 专业最低分轴: 默认分高在前; 翻转 = 分低(捡漏)。
        const prim = compareDesc(a.anchorMajorMinScore ?? a.groupMinScore, b.anchorMajorMinScore ?? b.groupMinScore);
        if (prim !== 0) return prim * sign;
        return this.compareCandidateGroupFallback(a, b, studentRank, false);
      }

      if (sort === 'UNIVERSITY_RANK') {
        // 院校层次轴: 默认好校在前(软科排名升序; 同名次按 985/211 标签分); 翻转 = 普通校在前。
        const prim = compareRankingAsc(a.universityRank ?? a.university?.softRanking, b.universityRank ?? b.university?.softRanking) ||
          compareDesc(universityTagScore(a), universityTagScore(b));
        if (prim !== 0) return prim * sign;
        return this.compareCandidateGroupFallback(a, b, studentRank, false);
      }

      if (sort === 'MAJOR_STRENGTH') {
        // 专业实力轴: 默认强在前; 翻转 = 弱在前。
        const prim = compareDesc(a.majorStrengthScore, b.majorStrengthScore);
        if (prim !== 0) return prim * sign;
        return this.compareCandidateGroupFallback(a, b, studentRank, false);
      }

      // MAJOR_MATCH 综合推荐(默认): 梯度默认序 + 专业匹配度, 无方向。
      return this.compareCandidateGroupFallback(a, b, studentRank, true);
    });
  }

  // 聚合 3 年组级历史：返回 history3y（组最低）+ historyFiling3y（投档线），按 year ASC 排
  // 数据演进：早期记录只有 majorMin，2024 起有 groupMin，2025 起有 filing。
  // 组最低 fallback 到 majorMin 以维持趋势连续；投档线不 fallback（保严谨）。
  private pickGroupHistory(records: any[], sourceYear: number) {
    const history3y: Array<{ year: number; score: number; rank: number; count: number | null }> = [];
    const historyFiling3y: Array<{ year: number; score: number; rank: number }> = [];

    for (let offset = 2; offset >= 0; offset--) {
      const year = sourceYear - offset;
      const yearRecords = records.filter((r) => r.year === year);
      if (yearRecords.length === 0) continue;

      // 组最低：优先 groupMin，缺失时 fallback majorMin（数据演进所致）
      const groupScore =
        bestNumber(yearRecords.map((r) => r.groupMinScore)) ??
        bestNumber(yearRecords.map((r) => r.majorMinScore));
      const groupRank =
        bestNumber(yearRecords.map((r) => r.groupMinRank), 'max') ??
        bestNumber(yearRecords.map((r) => r.majorMinRank), 'max');
      // 录取数: 只取组级总数(groupAdmissionCount), 不 fallback 专业级(语义不同, 会偏小); 缺则 null → 前端显 "—"
      const groupCount = bestNumber(yearRecords.map((r) => r.groupAdmissionCount), 'max');
      if (groupScore !== null && groupRank !== null) {
        history3y.push({ year, score: groupScore, rank: groupRank, count: groupCount });
      }

      // 投档线不 fallback（投档分 ≠ 专业最低分，语义不同）
      const filingScore = bestNumber(yearRecords.map((r) => r.filingMinScore));
      const filingRank = bestNumber(yearRecords.map((r) => r.filingMinRank), 'max');
      if (filingScore !== null && filingRank !== null) {
        historyFiling3y.push({ year, score: filingScore, rank: filingRank });
      }
    }

    return { history3y, historyFiling3y };
  }

  private pickGroupScore(records: any[], baselineYear: number) {
    // 就近年回退: 基线年无线时, 落到 ≤基线年的最近一个有线年(避免个别组无谓塌成 NO_LINE)。
    // 基线年有线时, years 降序第一个即基线年, 命中即停 → 行为与"只取基线年"一致。
    const years = Array.from(
      new Set(records.map((r) => r.year).filter((y) => typeof y === 'number' && y <= baselineYear)),
    ).sort((a, b) => b - a);
    let current: any[] = [];
    for (const y of years) {
      const yearRecords = records.filter((record) => record.year === y);
      const hasLine =
        bestNumber(yearRecords.map((r) => r.groupMinScore)) !== null ||
        bestNumber(yearRecords.map((r) => r.groupMinRank), 'max') !== null ||
        bestNumber(yearRecords.map((r) => r.filingMinScore)) !== null ||
        bestNumber(yearRecords.map((r) => r.filingMinRank), 'max') !== null ||
        bestNumber(yearRecords.map((r) => r.majorMinScore)) !== null ||
        bestNumber(yearRecords.map((r) => r.majorMinRank), 'max') !== null;
      current = yearRecords;
      if (hasLine) break;
    }
    const groupScore = bestNumber(current.map((record) => record.groupMinScore));
    const groupRank = bestNumber(current.map((record) => record.groupMinRank), 'max');
    if (groupScore !== null || groupRank !== null) {
      return {
        groupMinScore: groupScore,
        groupMinRank: groupRank,
        groupAdmissionCount: bestNumber(current.map((record) => record.groupAdmissionCount), 'max'),
        scoreSource: 'GROUP' as CandidateGroupScoreSource,
      };
    }

    const filingScore = bestNumber(current.map((record) => record.filingMinScore));
    const filingRank = bestNumber(current.map((record) => record.filingMinRank), 'max');
    if (filingScore !== null || filingRank !== null) {
      return {
        groupMinScore: filingScore,
        groupMinRank: filingRank,
        groupAdmissionCount: null,
        scoreSource: 'FILING' as CandidateGroupScoreSource,
      };
    }

    const majorScore = bestNumber(current.map((record) => record.majorMinScore));
    const majorRank = bestNumber(current.map((record) => record.majorMinRank), 'max');
    return {
      groupMinScore: majorScore,
      groupMinRank: majorRank,
      groupAdmissionCount: null,
      scoreSource: majorScore !== null || majorRank !== null ? 'MAJOR' as CandidateGroupScoreSource : 'NONE' as CandidateGroupScoreSource,
    };
  }

  private planCountForGroup(rows: any[]) {
    const groupPlanCount = rows.find((row) => typeof row.groupPlanCount === 'number')?.groupPlanCount;
    if (typeof groupPlanCount === 'number') return groupPlanCount;
    return rows.reduce((sum, row) => sum + (typeof row.planCount === 'number' ? row.planCount : 0), 0) || null;
  }

  private isPositiveRank(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value > 0;
  }

  private shouldUseScoreBasedRank(storedRank: number | null, scoreBasedRank: number | null) {
    if (!scoreBasedRank) return false;
    if (!storedRank) return true;
    const smaller = Math.min(storedRank, scoreBasedRank);
    const larger = Math.max(storedRank, scoreBasedRank);
    return smaller > 0 && larger / smaller >= 3;
  }

  private async resolveStudentRank(student: any, sourceYear: number) {
    const storedRank = this.isPositiveRank(student.provincialRank) ? student.provincialRank : null;
    let scoreBasedRank: number | null = null;

    const subjects = EXAM_TYPE_TO_SUBJECTS[student.examType ?? ''];
    if (this.scoreSegmentService && subjects && this.isPositiveRank(student.totalScore)) {
      try {
        const converted = await this.scoreSegmentService.scoreToRank(sourceYear, subjects as any, student.totalScore);
        scoreBasedRank = this.isPositiveRank(converted.rank) ? converted.rank : null;
      } catch {
        scoreBasedRank = null;
      }
    }

    const useScoreBased = this.shouldUseScoreBasedRank(storedRank, scoreBasedRank);
    const rank = useScoreBased ? scoreBasedRank : storedRank ?? scoreBasedRank;
    const source: StudentRankSource = rank
      ? (useScoreBased || !storedRank ? 'SCORE_SEGMENT' : 'PROFILE')
      : 'MISSING';

    // 已确认政策加分参与投档 → 用 裸分+加分 换算"有效位次"参与梯度/排序,
    // 否则专项县学生(如三州彝族 +20)的整个候选池判定系统性偏严。
    // 裸分位次保留在 rawRank 供前端双轨展示。
    const bonusPoints = confirmedBonusPoints(student);
    let bonusAdjustedRank: number | null = null;
    if (bonusPoints > 0 && this.scoreSegmentService && subjects && this.isPositiveRank(student.totalScore)) {
      try {
        const adjusted = await this.scoreSegmentService.scoreToRank(
          sourceYear,
          subjects as any,
          student.totalScore + bonusPoints,
        );
        bonusAdjustedRank = this.isPositiveRank(adjusted.rank) ? adjusted.rank : null;
      } catch {
        bonusAdjustedRank = null;
      }
    }

    const rawRank = rank ?? 999999;
    const effectiveRank = bonusAdjustedRank && bonusAdjustedRank < rawRank ? bonusAdjustedRank : rawRank;

    return {
      rank: effectiveRank,
      source,
      storedRank,
      scoreBasedRank,
      rawRank,
      bonusPoints: effectiveRank !== rawRank ? bonusPoints : 0,
    };
  }

  private hasStrictMajorPreference(student: any) {
    return flattenPreferredMajors(student.preferredMajors).length > 0 ||
      asStringArray(student.preferredMajorCategories).length > 0;
  }

  private isPreferredMajor(student: any, ep: any) {
    const majorName = ep.majorName || ep.major?.name || '';
    const category = ep.major?.category || '';
    return flattenPreferredMajors(student.preferredMajors).includes(majorName) ||
      (category ? asStringArray(student.preferredMajorCategories).includes(category) : false);
  }

  // 判断 EP 是否命中搜索关键词 (只看专业名 / 类别, 不看院校名 / groupName,
  // 因为院校/组名命中不指向具体专业, 不应当作锚定)
  private isMajorMatchKeyword(ep: any, keyword?: string): boolean {
    if (!keyword) return false;
    const k = keyword.trim();
    if (!k) return false;
    const majorName = ep.majorName ?? ep.major?.name ?? '';
    const category = ep.major?.category ?? '';
    return String(majorName).includes(k) || String(category).includes(k);
  }

  private classifyMajorDisplay(student: any, ep: any, failReasons: SoftFailReason[], rankStrategy: RankStrategyResult, tierMajors?: string[]) {
    if (failReasons.length > 0) {
      return {
        displaySection: 'RISK' as CandidateMajorDisplaySection,
        displayReason: failReasons[0]?.note ?? '条件不合适，建议人工判断',
      };
    }
    if (rankStrategy.eligibility === 'INSUFFICIENT_DATA') {
      return {
        displaySection: 'RISK' as CandidateMajorDisplaySection,
        displayReason: '缺少有效位次，需要人工判断',
      };
    }
    if (rankStrategy.eligibility === 'REJECTED') {
      return {
        displaySection: 'RISK' as CandidateMajorDisplaySection,
        displayReason: '位次明显超出历史可解释范围',
      };
    }

    // tier 过滤模式 (老师选了具体梯队): 优先于学生 profile 的整体意向集合
    // 命中梯队 → RECOMMENDED; 同组其他 PASS 专业 → BACKUP (作服从调剂参考)
    if (tierMajors && tierMajors.length > 0) {
      if (tierMajors.includes(ep.majorName)) {
        return {
          displaySection: 'RECOMMENDED' as CandidateMajorDisplaySection,
          displayReason: '梯队意向专业',
        };
      }
      return {
        displaySection: 'BACKUP' as CandidateMajorDisplaySection,
        displayReason: '同专业组其他专业,作服从调剂参考',
      };
    }

    const strictPreference = this.hasStrictMajorPreference(student);
    if (strictPreference && !this.isPreferredMajor(student, ep)) {
      return {
        displaySection: 'BACKUP' as CandidateMajorDisplaySection,
        displayReason: '不在学生意向范围内，仅作备选',
      };
    }

    return {
      displaySection: 'RECOMMENDED' as CandidateMajorDisplaySection,
      displayReason: rankStrategy.eligibility === 'OBSERVE_ONLY'
        ? '位次偏冒险，建议老师观察'
        : strictPreference
          ? '符合学生意向且位次可参考'
          : '未排除且位次可参考',
    };
  }

  private sortCandidateMajors(majors: any[]) {
    majors.sort((a, b) => {
      if (a.matchStatus !== b.matchStatus) return a.matchStatus === 'PASS' ? -1 : 1;
      if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
      const ar = a.rankDiffRatio ?? 999;
      const br = b.rankDiffRatio ?? 999;
      return Math.abs(ar - 1) - Math.abs(br - 1);
    });
  }

  private splitMajorSections(majors: any[]) {
    return {
      recommended: majors.filter((major) => major.displaySection === 'RECOMMENDED'),
      backup: majors.filter((major) => major.displaySection === 'BACKUP'),
      risk: majors.filter((major) => major.displaySection === 'RISK'),
    };
  }

  private emptyRankStrategy(sourceAdmissionYear: number, candidateRank: number | null, eligibility: RankStrategyResult['eligibility'], reason: string): RankStrategyResult {
    return {
      sourceAdmissionYear,
      rankSourceYear: sourceAdmissionYear,
      candidateRank,
      requiredEasierDelta: null,
      safetyMargin: null,
      rankBucket: 'UNKNOWN',
      sampleScope: eligibility === 'INSUFFICIENT_DATA' ? 'INSUFFICIENT_DATA' : 'RANK_BUCKET',
      sampleSize: 0,
      basisPairs: [],
      rushFormalLimit: 0,
      rushObserveLimit: 0,
      safeNormalMargin: 0,
      safeStrongMargin: 0,
      insufficientData: eligibility === 'INSUFFICIENT_DATA',
      eligibility,
      reason,
    };
  }

  private async evaluateRankStrategy(input: {
    studentRank: number;
    candidateRank: number | null | undefined;
    studentExamYear: number;
    province: string;
    examType?: string | null;
    batch?: string | null;
    sourceAdmissionYear: number;
  }) {
    const candidateRank = this.isPositiveRank(input.candidateRank) ? input.candidateRank : null;
    if (!candidateRank) {
      return this.emptyRankStrategy(input.sourceAdmissionYear, null, 'INSUFFICIENT_DATA', 'missing valid candidate rank');
    }
    if (!this.rankStrategyService) {
      return this.emptyRankStrategy(input.sourceAdmissionYear, candidateRank, 'FORMAL', 'rank strategy service unavailable');
    }
    return this.rankStrategyService.evaluateCandidate({
      studentRank: input.studentRank,
      candidateRank,
      studentExamYear: input.studentExamYear,
      province: input.province,
      examType: input.examType,
      batch: input.batch,
      sourceAdmissionYear: input.sourceAdmissionYear,
    });
  }

  async getCandidateGroups(planId: number, q: GetCandidatesQuery, userId?: number) {
    const plan = await this.prisma.volunteerPlan.findUnique({
      where: { id: planId },
      include: {
        student: true,
        planItems: true,
      },
    });
    if (!plan) throw new NotFoundException('方案不存在');
    if (userId && plan.createdById !== userId && plan.student.userId !== userId) {
      throw new ForbiddenException('无权查看此方案候选池');
    }
    if (!plan.batchName) throw new NotFoundException('方案缺少批次信息');

    const student = await this.prisma.studentProfile.findUnique({
      where: { id: plan.studentId },
      include: { user: true },
    });
    if (!student) throw new NotFoundException('学生不存在');

    // 商业化流程: plan 批次必须在学生 preferredBatches 中
    // 见 docs/superpowers/specs/2026-06-02-batch-selection-at-intake-design.md § 十
    const studentBatches = Array.isArray(student.preferredBatches)
      ? (student.preferredBatches as unknown[]).filter((x): x is string => typeof x === 'string')
      : [];
    if (studentBatches.length > 0 && plan.batchName && !studentBatches.includes(plan.batchName)) {
      const msg = `该 plan 的批次「${plan.batchName}」未被学生选定 (已选: ${studentBatches.join(', ')})`;
      if (FEATURE_FLAGS.STRICT_BATCH_VALIDATION) {
        throw new BadRequestException(msg);
      }
      console.warn('[STRICT_BATCH_VALIDATION disabled]', msg);
    }

    // 意向梯队过滤: 取该梯队的专业列表用于后续 group/major 级过滤; 0 / undefined 表示不过滤
    const tierMajors = (q.tier && q.tier > 0)
      ? getTierMajors(student.preferredMajors, q.tier)
      : [];
    // 已加入当前 plan 的 group 简易 key (universityId|groupCode) 集合, 默认隐藏
    // 同一 plan 下 batch/recruitType/subjects 都相同, 不需要完整 5 元组
    const excludeAdded = q.excludeAdded !== false;
    const addedGroupKeys = new Set<string>();
    if (excludeAdded && Array.isArray((plan as any).planItems)) {
      for (const item of (plan as any).planItems) {
        if (!item) continue;
        addedGroupKeys.add(`${item.universityId}|${item.groupCode ?? ''}`);
      }
    }

    const province = student.province ?? '四川';
    const subjects = EXAM_TYPE_TO_SUBJECTS[student.examType ?? 'PHYSICS'] || '物理';
    const source = await this.resolveEnrollmentPlanSource({
      planYear: plan.year,
      province,
      batchName: plan.batchName,
      subjects,
    });
    // keyword 不能在 EnrollmentPlan 行级直接 OR 过滤,否则同一专业组里非命中的专业行会被丢掉,
    // 导致 UI 上"专业组里只显示搜到的那个专业"。
    // 改法:先用 keyword 圈出命中的 groupKey 集合,再用 groupKey 限制后续 fetch,
    // 这样命中专业所在专业组的"其余专业"也会被拉回。
    const where = buildHardFilterWhere({
      year: source.sourceYear,
      province,
      batchName: plan.batchName,
      subjects,
      // keyword 不传 — 由下面 groupKey 预查询处理
    });
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 20;
    const rankWindow = await this.resolveRankWindow(q.minScore, q.maxScore, source.scoreSegmentYear, subjects);
    const cacheKey = this.candidateGroupCacheKey(plan, q);
    const cached = this.getCandidateGroupCache(cacheKey);
    if (cached) {
      if (q.groupBy === 'UNIVERSITY') {
        return this.paginateAsUniversities(cached, q, student, page, pageSize, rankWindow);
      }
      return this.paginateCandidateGroups(cached, page, pageSize, q.gradientBand, q.sinoForeign, rankWindow, q.includeRegionMismatch === true, q.recruitType);
    }

    // 拆分搜索: 院校 / 专业各自独立; 同时填则 AND 组合 (院校的特定专业)
    // 兜底: 旧 keyword 参数视为"同时匹配院校或专业" (OR 组合, 老 URL / 老前端兼容)
    const kwUniversity = q.keywordUniversity?.trim();
    const kwMajor = q.keywordMajor?.trim();
    const kwGroup = q.keywordGroup?.trim();
    const kwLegacy = q.keyword?.trim();
    const hasNewKeywords = Boolean(kwUniversity || kwMajor || kwGroup);
    const hasAnyKeyword = hasNewKeywords || Boolean(kwLegacy);
    // 专业层"搜索匹配"chip 用的 keyword: 优先专业搜索, 兜底旧 keyword
    const matchKeyword = kwMajor || kwLegacy;
    if (hasAnyKeyword) {
      // 构造 where 条件:
      //   - 新接口: AND 院校 + 专业 (任一为空时只加另一边)
      //   - 旧接口: OR 院校/专业 (单关键词合并语义, 不匹配 groupName 因为老师不会搜)
      const keywordWhere: Record<string, unknown> = {};
      if (hasNewKeywords) {
        const ands: any[] = [];
        // 院校匹配同时查当前名 + renameHistory (合并/改名前的旧名). 老师搜"北方交通大学"也能命中"北京交通大学"
        if (kwUniversity) ands.push({
          university: {
            OR: [
              { name: { contains: kwUniversity } },
              { renameHistory: { contains: kwUniversity } },
            ],
          },
        });
        if (kwMajor) ands.push({
          OR: [
            { major: { name: { contains: kwMajor } } },
            { majorName: { contains: kwMajor } },
          ],
        });
        // 组名搜索: 提前批公费/优师的定向县在 groupName("定向凉山州昭觉县"), 老师按县筛组
        if (kwGroup) ands.push({ groupName: { contains: kwGroup } });
        if (ands.length > 0) keywordWhere.AND = ands;
      } else if (kwLegacy) {
        keywordWhere.OR = [
          { university: { name: { contains: kwLegacy } } },
          { university: { renameHistory: { contains: kwLegacy } } },
          { major: { name: { contains: kwLegacy } } },
          { majorName: { contains: kwLegacy } },
        ];
      }
      const matchedGroups = await this.prisma.enrollmentPlan.findMany({
        where: { ...where, ...keywordWhere },
        select: {
          universityId: true,
          groupCode: true,
          batch: true,
          recruitType: true,
          subjects: true,
        },
        distinct: ['universityId', 'groupCode', 'batch', 'recruitType', 'subjects'],
      });
      if (matchedGroups.length === 0) {
        // keyword 命中 0 个 group, 直接返回空(避免后续昂贵查询)
        const studentRankInfo = await this.resolveStudentRank(student, source.scoreSegmentYear);
        const emptyResult: CandidateGroupFullResult = {
          total: 0,
          planYear: source.planYear,
          sourceYear: source.sourceYear,
          admissionBaselineYear: source.admissionBaselineYear,
          scoreSegmentYear: source.scoreSegmentYear,
          previousYear: source.sourceYear - 1,
          sourceBatchName: source.sourceBatchName,
          isFallbackYear: source.isFallbackYear,
          studentRankUsed: studentRankInfo.rank,
          studentRankSource: studentRankInfo.source,
          storedRank: studentRankInfo.storedRank,
          scoreBasedRank: studentRankInfo.scoreBasedRank,
          studentRawRank: studentRankInfo.rawRank,
          studentBonusPoints: studentRankInfo.bonusPoints,
          tierCounts: { rush: 0, stable: 0, safe: 0, noLine: 0 },
          sort: q.sort ?? 'MAJOR_MATCH',
          groups: [],
          availableTiers: listTiers(student.preferredMajors).map((t) => ({
            ...t,
            groupCount: 0,
          })),
          appliedTier: q.tier ?? 0,
          predictedScoreRange: null,
        };
        this.setCandidateGroupCache(cacheKey, emptyResult);
        return this.paginateCandidateGroups(emptyResult, page, pageSize, q.gradientBand, q.sinoForeign, rankWindow, q.includeRegionMismatch === true, q.recruitType);
      }
      (where as any).OR = matchedGroups.map((g) => ({
        universityId: g.universityId,
        groupCode: g.groupCode,
        batch: g.batch,
        recruitType: g.recruitType,
        subjects: g.subjects,
      }));
    }

    const [epsRaw, restrictions] = await Promise.all([
      this.prisma.enrollmentPlan.findMany({
        where,
        select: CANDIDATE_ENROLLMENT_PLAN_SELECT,
      }),
      this.prisma.healthRestriction.findMany(),
    ]);
    // 再选科目硬过滤: 剔除学生选科不满足"再选科目要求"的专业(投档资格不符, 不进候选).
    // reChoices 空 → filterEps 原样返回(不过滤), 交生成前置校验催补.
    const includeHardFails = q.includeHardFails === true || q.includeHardFails === 'true';
    // includeHardFails 时不预过滤"再选不符" — 留到循环里标 HARD_FAIL(灰显+禁加入), 而非直接剔除。
    const cleanReChoices = (Array.isArray(student.reChoices) ? student.reChoices : [])
      .filter((s: unknown): s is string => typeof s === 'string' && s.trim().length > 0)
      .map((s: string) => s.trim());
    const eps = includeHardFails ? epsRaw : filterEpsBySubjectRequirement(epsRaw, student.reChoices);
    const hardRules = this.buildHardRules(restrictions);
    const softRules = this.buildSoftRules();
    // 3 年历史：admissionBaselineYear / -1 / -2（录取线基准年, 可早于计划年; 前端 TrendChart 需要 3 点）
    const years = [source.admissionBaselineYear, source.admissionBaselineYear - 1, source.admissionBaselineYear - 2];
    const adRecords = eps.length
      ? await this.prisma.admissionRecord.findMany({
          where: this.buildAdmissionRecordWhere(eps, province, years),
          select: CANDIDATE_ADMISSION_RECORD_SELECT,
        })
      : [];

    const adIndex = new Map<string, any>();
    const adByGroupYear = new Map<string, any[]>();
    for (const ar of adRecords) {
      adIndex.set(recordKeyOf(ar), ar);
      const groupYearKey = `${groupKeyOf(ar)}|${ar.year}`;
      const records = adByGroupYear.get(groupYearKey) ?? [];
      records.push(ar);
      adByGroupYear.set(groupYearKey, records);
    }

    const groups = new Map<string, any[]>();
    for (const ep of eps) {
      const key = groupKeyOf(ep);
      const rows = groups.get(key) ?? [];
      rows.push(ep);
      groups.set(key, rows);
    }

    const previousWhere: Record<string, unknown> = {
      province,
      year: source.sourceYear - 1,
    };
    addInFilter(previousWhere, 'subjects', eps.map((ep) => ep.subjects));
    addInFilter(previousWhere, 'batch', eps.map((ep) => ep.batch));
    addInFilter(previousWhere, 'recruitType', eps.map((ep) => ep.recruitType));
    addInFilter(previousWhere, 'universityId', eps.map((ep) => ep.universityId));
    addInFilter(previousWhere, 'groupCode', eps.map((ep) => ep.groupCode));
    const previousPlansPromise = eps.length
      ? this.prisma.enrollmentPlan.findMany({
          where: previousWhere,
          select: {
            universityId: true,
            subjects: true,
            batch: true,
            recruitType: true,
            groupCode: true,
            groupPlanCount: true,
            planCount: true,
          },
        })
      : [];

    const predictionMapPromise = (async () => {
      const predictionMap = new Map<string, any>();
      if (groups.size > 0 && (this.prisma as any).rankPrediction?.findMany) {
        const predictionWhere: Record<string, unknown> = {
          targetYear: source.planYear,
        };
        const groupRows = Array.from(groups.values()).map((rows) => rows[0]);
        addInFilter(predictionWhere, 'subjects', groupRows.map((row) => row.subjects));
        addInFilter(predictionWhere, 'batch', groupRows.map((row) => row.batch));
        addInFilter(predictionWhere, 'recruitType', groupRows.map((row) => row.recruitType));
        addInFilter(predictionWhere, 'universityId', groupRows.map((row) => row.universityId));
        addInFilter(predictionWhere, 'groupCode', groupRows.map((row) => row.groupCode));
        const preds = await (this.prisma as any).rankPrediction.findMany({
          where: predictionWhere,
          select: {
            universityId: true,
            subjects: true,
            batch: true,
            recruitType: true,
            groupCode: true,
            pointRank: true,
            conservativeRank: true,
            optimisticRank: true,
            basisYears: true,
            confidence: true,
            targetYear: true,
          },
        });
        for (const pred of preds) {
          const key = groupKeyOf(pred);
          if (!groups.has(key)) continue;
          predictionMap.set(key, {
            point: pred.pointRank,
            conservative: pred.conservativeRank,
            optimistic: pred.optimisticRank,
            basisYears: pred.basisYears,
            confidence: pred.confidence,
            targetYear: pred.targetYear,
          });
        }
      }
      return predictionMap;
    })();

    // GroupPurity 客观纯净度（S/A/B/C）— 预计算好直接读，N+1 安全：批量 IN 查询
    const purityMapPromise = (async () => {
      const purityMap = new Map<string, any>();
      if (groups.size === 0 || !(this.prisma as any).groupPurity?.findMany) {
        return purityMap;
      }
      const groupRows = Array.from(groups.values()).map((rows) => rows[0]);
      const purityWhere: Record<string, unknown> = {
        year: source.sourceYear,
        province,
      };
      addInFilter(purityWhere, 'universityId', groupRows.map((row) => row.universityId));
      addInFilter(purityWhere, 'groupCode', groupRows.map((row) => row.groupCode));
      addInFilter(purityWhere, 'batch', groupRows.map((row) => row.batch));
      addInFilter(purityWhere, 'subjects', groupRows.map((row) => row.subjects));
      const rows = await (this.prisma as any).groupPurity.findMany({
        where: purityWhere,
        select: {
          universityId: true,
          groupCode: true,
          batch: true,
          subjects: true,
          level: true,
          majorCount: true,
          dominantCategory: true,
          dominantDiscipline: true,
          dominantDisciplineRatio: true,
          crossCategoryCount: true,
          hasForeign: true,
          mixedForeign: true,
          reasons: true,
        },
      });
      for (const p of rows) {
        purityMap.set(groupPurityKeyOf(p), {
          level: p.level,
          majorCount: p.majorCount,
          dominantCategory: p.dominantCategory,
          dominantDiscipline: p.dominantDiscipline,
          dominantDisciplineRatio: p.dominantDisciplineRatio,
          crossCategoryCount: p.crossCategoryCount,
          hasForeign: p.hasForeign,
          mixedForeign: p.mixedForeign,
          reasons: p.reasons,
        });
      }
      return purityMap;
    })();

    const [
      previousPlans,
      predictionMap,
      batchCompetition,
      supplementaryByGroup,
      studentRankInfo,
      purityMap,
    ] = await Promise.all([
      previousPlansPromise,
      predictionMapPromise,
      this.resolveBatchCompetition(province, subjects, plan.batchName, source.admissionBaselineYear),
      this.loadSupplementaryByGroup(groups, province, source.admissionBaselineYear, subjects),
      this.resolveStudentRank(student, source.scoreSegmentYear),
      purityMapPromise,
    ]);
    const previousByGroup = new Map<string, any[]>();
    for (const row of previousPlans) {
      const key = groupKeyOf(row);
      const rows = previousByGroup.get(key) ?? [];
      rows.push(row);
      previousByGroup.set(key, rows);
    }
    const studentRank = studentRankInfo.rank;
    const resultGroups = (await Promise.all(Array.from(groups.entries()).map(async ([groupKey, rows]) => {
      // tier 过滤: 整个 group 至少含该梯队任一专业, 否则整组隐藏
      const hitsTier = tierMajors.length > 0 && rows.some((ep: any) => tierMajors.includes(ep.majorName));
      if (tierMajors.length > 0 && !hitsTier) return null;
      // excludeAdded 过滤: 已加入当前 plan 的组隐藏 (用简易 key universityId|groupCode)
      if (excludeAdded) {
        const first = rows[0];
        const simpleKey = `${first.universityId}|${first.groupCode ?? ''}`;
        if (addedGroupKeys.has(simpleKey)) return null;
      }

      const groupRecords = [
        ...(adByGroupYear.get(`${groupKey}|${source.admissionBaselineYear}`) ?? []),
        ...(adByGroupYear.get(`${groupKey}|${source.admissionBaselineYear - 1}`) ?? []),
        ...(adByGroupYear.get(`${groupKey}|${source.admissionBaselineYear - 2}`) ?? []),
      ];
      const groupScore = this.pickGroupScore(groupRecords, source.admissionBaselineYear);
      const groupHistory = this.pickGroupHistory(groupRecords, source.admissionBaselineYear);
      const first = rows[0];
      const currentPlanCount = this.planCountForGroup(rows);
      // 年度对比只信 group_plan_count(组级整组计划)。2024/2023 导入未填该字段、且把组级计划数
      // 复制进了 plan_count 每行 → 逐行求和会把组总数放大约「专业数」倍(实查 245→5769),
      // 既污染卡片"招生计划变动",又误导 calcDynamicGradient 把整组判为"计划腰斩"下调风险。
      // 故缺 group_plan_count 即视为去年计划不可比 → null(不走 planCountForGroup 的求和兜底)。
      const previousPlanCount =
        (previousByGroup.get(groupKey) ?? []).find((r: any) => typeof r.groupPlanCount === 'number')
          ?.groupPlanCount ?? null;
      const selectionCompetition = this.estimateSelectionCompetition(rows, first.subjects ?? subjects);
      const supplementary = supplementaryByGroup.get(groupKey) ?? null;
      const riskSupplementary = supplementaryForGroupRisk(supplementary);

      const majorsRaw = await Promise.all(rows.map(async (ep) => {
        // 硬过滤: 性别/健康/户籍/民族 + 再选不符 = 客观资格不符(投档资格不符, 真填会退档)。
        // 默认直接剔除(不进任何分区); includeHardFails 时改标 HARD_FAIL 放独立桶(前端灰显+禁加入)。
        const hardFails = this.checkSoftFails(student, ep, hardRules);
        const reChoiceOk = cleanReChoices.length === 0
          || studentMeetsSubjectRequirement(ep.subjectRequirements, cleanReChoices);
        if (hardFails.length > 0 || !reChoiceOk) {
          if (!includeHardFails) return null;
          return {
            enrollmentPlanId: ep.id,
            universityId: ep.universityId,
            majorId: ep.majorId,
            majorCode: ep.majorCode,
            majorName: ep.majorName,
            majorCategory: ep.major?.category ?? null,
            planCount: ep.planCount,
            tuition: ep.tuition,
            subjectRequirements: ep.subjectRequirements,
            matchStatus: 'HARD_FAIL',
            hardFailReasons: [
              ...hardFails.map((r: any) => r.note),
              ...(reChoiceOk ? [] : [`选科不符: 需 ${ep.subjectRequirements || '指定再选科目'}`]),
            ],
          } as any;
        }

        const currentRecord = adIndex.get(recordKeyOf({ ...ep, year: source.admissionBaselineYear }));
        const previousRecord = adIndex.get(recordKeyOf({ ...ep, year: source.admissionBaselineYear - 1 }));
        // 软规则: 学费/办学性质 — 不符合时进 SOFT_FAIL, 由 includeSoftFails 控制
        const failReasons = this.checkSoftFails(student, ep, softRules);
        const match = this.scoreMajorMatch(student, ep);
        // 专业线缺失时回退组线: 四川平行志愿按专业组投档, 组线即进档线 —— 提前批/专项批
        // 的录取数据普遍只有组级线, 不回退会让全组专业被判"数据不足"进 RISK, 整组消失
        const rankStrategy = await this.evaluateRankStrategy({
          studentRank,
          candidateRank: currentRecord?.majorMinRank
            ?? currentRecord?.groupMinRank
            ?? groupScore?.groupMinRank
            ?? null,
          studentExamYear: plan.year,
          province,
          examType: student.examType,
          batch: plan.batchName,
          sourceAdmissionYear: source.admissionBaselineYear,
        });
        const display = this.classifyMajorDisplay(student, ep, failReasons, rankStrategy, tierMajors);
        const historyMin = groupScore.groupMinRank ?? currentRecord?.majorMinRank ?? null;
        const rankDiffRatio = historyMin ? studentRank / historyMin : null;
        const dynamicGradient = calcDynamicGradient({
          studentRank,
          historyMinRank: historyMin,
          currentPlanCount,
          previousPlanCount,
          currentCompetitionCount: batchCompetition.currentCount,
          previousCompetitionCount: batchCompetition.previousCount,
          selectionCompetitionCount: selectionCompetition.eligibleCount,
          subjectCompetitionCount: selectionCompetition.subjectCount,
          selectionDataConfidence: selectionCompetition.sourceType === 'PUBLIC_ESTIMATE' ? 'PUBLIC_ESTIMATE' : 'MISSING',
          supplementary: riskSupplementary,
        });
        return {
          enrollmentPlanId: ep.id,
          universityId: ep.universityId,
          majorId: ep.majorId,
          majorCode: ep.majorCode,
          majorName: ep.majorName,
          majorCategory: ep.major?.category ?? null,
          discipline: ep.major?.discipline ?? null,
          softRating: ep.major?.softRating ?? null,
          description: ep.major?.description ?? null,
          careerDirections: ep.major?.careerDirections ?? null,
          postgraduateDirections: ep.major?.postgraduateDirections ?? null,
          coreCourses: ep.major?.coreCourses ?? null,
          employmentRate: ep.major?.employmentRate ?? null,
          avgSalary: ep.major?.avgSalary ?? null,
          degree: ep.major?.degree ?? null,
          standardDuration: ep.major?.standardDuration ?? ep.duration ?? null,
          satisfactionScore: ep.major?.satisfactionScore ?? null,
          // 硕/博点要读 enrollment_plan 自身的 local_master_point/doctoral(按院校×专业组导入,
          // 值为学科名串, 约 37%/16% 的计划有), 不能读 major 关联的同名 Boolean 列 —— 那列
          // 全表是默认 false, 从没回填过, 会让每行的 硕/博 都灰显(看着像每个学校都有点)。
          localMasterPoint: !!ep.localMasterPoint,
          localDoctoralPoint: !!ep.localDoctoralPoint,
          planCount: ep.planCount,
          tuition: ep.tuition,
          duration: ep.duration,
          subjectRequirements: ep.subjectRequirements,
          disciplineEval: ep.disciplineEval,
          isNationalFeature: ep.isNationalFeature,
          majorRanking: ep.majorRanking,
          majorHonor: ep.majorHonor,
          majorStrengthScore: this.majorStrengthScore(ep),
          // 专业级征集数(本科类·累计各轮): 展开态专业行显示, 比组级更精确到"这个专业没录满多少"
          supplementaryCount: supplementary
            ? (supplementary.byMajorCode?.get(ep.majorCode) ?? supplementary.byMajorName?.get(ep.majorName) ?? null)
            : null,
          planNotes: ep.planNotes,
          isSinoForeign: ep.isSinoForeign,
          majorMinScore: currentRecord?.majorMinScore ?? null,
          majorMinRank: currentRecord?.majorMinRank ?? null,
          majorAdmissionCount: currentRecord?.majorAdmissionCount ?? null,
          previousMajorMinScore: previousRecord?.majorMinScore ?? null,
          previousMajorMinRank: previousRecord?.majorMinRank ?? null,
          previousMajorAdmissionCount: previousRecord?.majorAdmissionCount ?? null,
          matchScore: match.score,
          matchReasons: match.reasons,
          rankDiffRatio,
          dynamicGradient,
          suggestedGradient: dynamicGradient.gradient,
          matchStatus: failReasons.length === 0 ? 'PASS' : 'SOFT_FAIL',
          failReasons,
          displaySection: display.displaySection,
          displayReason: display.displayReason,
          rankStrategy,
          isRecommendedAnchor: false,
          // 临时视觉标记: keyword 命中 majorName / category 时为 true,
          // 前端据此把命中专业排到所在分区头部 + 加"搜索匹配"chip。
          // 不影响 displaySection / anchor / 加入方案时的第 1 志愿 — 那些都按持久语义 (意向) 走。
          matchesKeyword: this.isMajorMatchKeyword(ep, matchKeyword),
          // tier 命中标记: 当前应用 tier 时, 该 EP 的 majorName 在该梯队的专业列表里。
          // 前端据此把命中专业排到分区头部 + 加绿色"🎯 梯队意向"chip。
          matchesPreferredTier: tierMajors.length > 0 && tierMajors.includes(ep.majorName),
        };
      }));
      // 非 null = 通过硬过滤(PASS/SOFT_FAIL) 或 HARD_FAIL(includeHardFails 时保留)。
      // HARD_FAIL 单独放 hardFailMajors 桶, 不进 majors → 完全不影响现有分区/计数/锚定/梯度。
      const allMajors = (majorsRaw as any[]).filter((m): m is any => m !== null);
      const hardFailMajors = allMajors.filter((m) => m.matchStatus === 'HARD_FAIL');
      const majors = allMajors.filter((m) => m.matchStatus !== 'HARD_FAIL');

      const visibleMajors = q.includeSoftFails === false
        ? majors.filter((major) => major.matchStatus === 'PASS')
        : majors;
      this.sortCandidateMajors(visibleMajors);
      const majorSections = this.splitMajorSections(visibleMajors);
      // recommended + backup 都空时通常丢弃 (避免噪音), 但下面三种情况保留全 RISK group:
      //   1. tier 模式下命中 tier (老师明确想看该梯队意向)
      //   2. keyword 搜索 (老师主动搜某院校 / 专业, 应该看到 — 哪怕位次远不达)
      //   3. 全组 RISK 仅因位次原因 — REJECTED(位次明显高于学生)是极冲选项,
      //      INSUFFICIENT_DATA(新组无任何历史线)是"待人工判断"的真实库存;
      //      提前批/公费师范常降分录取且新设定向组无历史线, 灭掉会让无线机会组只能靠关键词搜出来
      const isAllRisk = majorSections.recommended.length === 0 && majorSections.backup.length === 0;
      const allRiskIsRankOnly = isAllRisk && visibleMajors.length > 0 &&
        visibleMajors.every((m) =>
          (m.rankStrategy?.eligibility === 'REJECTED' || m.rankStrategy?.eligibility === 'INSUFFICIENT_DATA') &&
          (m.failReasons ?? []).length === 0);
      if (isAllRisk && !allRiskIsRankOnly && !hitsTier && !hasAnyKeyword) return null;

      const orderedMajors = [
        ...majorSections.recommended,
        ...majorSections.backup,
        ...majorSections.risk,
      ];
      if (orderedMajors[0]) orderedMajors[0].isRecommendedAnchor = true;

      const recommendedAnchor = orderedMajors[0];
      const majorStrengthScore = bestNumber(orderedMajors.map((major) => major.majorStrengthScore), 'max');
      const groupHistoryMin = groupScore.groupMinRank ?? recommendedAnchor?.majorMinRank ?? null;
      const dynamicGradient = calcDynamicGradient({
        studentRank,
        historyMinRank: groupHistoryMin,
        currentPlanCount,
        previousPlanCount,
        currentCompetitionCount: batchCompetition.currentCount,
        previousCompetitionCount: batchCompetition.previousCount,
        selectionCompetitionCount: selectionCompetition.eligibleCount,
        subjectCompetitionCount: selectionCompetition.subjectCount,
        selectionDataConfidence: selectionCompetition.sourceType === 'PUBLIC_ESTIMATE' ? 'PUBLIC_ESTIMATE' : 'MISSING',
        supplementary: riskSupplementary,
      });
      return {
        groupKey,
        universityId: first.universityId,
        universityName: first.university?.name ?? '',
        universityCode: first.university?.code ?? null,
        universityRank: first.university?.softRanking ?? null,
        // 非意向地区标记(院校级): 学生填了意向省/市 且 本校省市都不命中 → 前端默认折叠进"显示非意向地区"开关
        regionMismatch: isRegionMismatch(
          first.university?.province ?? null,
          first.university?.city ?? null,
          student.preferredProvinces,
          student.preferredCities,
        ),
        university: {
          id: first.universityId,
          name: first.university?.name ?? '',
          code: first.university?.code ?? null,
          province: first.university?.province ?? null,
          city: first.university?.city ?? null,
          type: first.university?.type ?? null,
          runningNature: first.university?.runningNature ?? null,
          is985: first.university?.is985 ?? false,
          is211: first.university?.is211 ?? false,
          isDoubleFirstClass: first.university?.isDoubleFirstClass ?? false,
          softRanking: first.university?.softRanking ?? null,
          logoUrl: first.university?.logoUrl ?? null,
          postgradRate: first.university?.postgradRate ?? null,
          furtherStudyRate: first.university?.furtherStudyRate ?? null,
          employmentRate: first.university?.employmentRate ?? null,
          avgSalary: first.university?.avgSalary ?? null,
          satisfactionOverall: first.university?.satisfactionOverall ?? null,
          satisfactionCount: first.university?.satisfactionCount ?? null,
          universityBackground: first.university?.universityBackground ?? null,
          firstClassCategory: first.university?.firstClassCategory ?? null,
        },
        groupCode: first.groupCode,
        groupName: first.groupName,
        batch: first.batch,
        recruitType: first.recruitType,
        subjects: first.subjects,
        currentPlanYear: source.sourceYear,
        previousPlanYear: source.sourceYear - 1,
        currentPlanCount,
        previousPlanCount,
        planCountChange:
          currentPlanCount !== null && previousPlanCount !== null
            ? currentPlanCount - previousPlanCount
            : null,
        groupMinScore: groupScore.groupMinScore,
        groupMinRank: groupScore.groupMinRank,
        groupAdmissionCount: groupScore.groupAdmissionCount,
        scoreSource: groupScore.scoreSource,
        predictedMinRank: predictionMap.get(groupKey) ?? null,
        purity: purityMap.get(groupPurityKeyOf(first)) ?? null,
        dynamicGradient,
        competition: batchCompetition,
        selectionCompetition,
        // 组级·学生科类·多轮累计征集(byMajorCode/byMajorName 是 Map, 不外泄, 只出干净字段)
        supplementary: supplementary
          ? {
              scope: supplementary.scope,
              subject: supplementary.subject,
              sourceYear: supplementary.sourceYear,
              totalPlanCount: supplementary.totalPlanCount,
              totalRounds: supplementary.totalRounds,
            }
          : null,
        suggestedGradient: dynamicGradient.gradient,
        anchorMajorMinScore: recommendedAnchor?.majorMinScore ?? null,
        anchorMajorMinRank: recommendedAnchor?.majorMinRank ?? null,
        // 锚定专业的就业/薪资/学费透出: 卡片指标条优先用专业级(院校级 employmentRate/avgSalary 常空),
        // 学费(锚定专业 EnrollmentPlan.tuition)是家长高频问题, 直接上折叠态
        anchorEmploymentRate: recommendedAnchor?.employmentRate ?? null,
        anchorAvgSalary: recommendedAnchor?.avgSalary ?? null,
        anchorTuition: recommendedAnchor?.tuition ?? null,
        majorStrengthScore,
        majorCount: rows.length,
        selectableMajorCount: majorSections.recommended.length + majorSections.backup.length,
        softFailCount: majorSections.risk.filter((major) => major.matchStatus === 'SOFT_FAIL').length,
        // 软规则分类计数（#3）: 学费 / 办学性质 / 其他；同 major 多原因都计入
        softFailBreakdown: majorSections.risk.reduce(
          (acc: { tuition: number; nature: number; other: number }, major: any) => {
            if (major.matchStatus !== 'SOFT_FAIL') return acc;
            const seen = new Set<string>();
            (major.failReasons ?? []).forEach((r: any) => {
              if (r?.rule === 'tuition' && !seen.has('tuition')) { acc.tuition += 1; seen.add('tuition'); }
              else if (r?.rule === 'nature' && !seen.has('nature')) { acc.nature += 1; seen.add('nature'); }
              else if (!['tuition', 'nature'].includes(r?.rule) && !seen.has('other')) { acc.other += 1; seen.add('other'); }
            });
            return acc;
          },
          { tuition: 0, nature: 0, other: 0 },
        ),
        matchScore: recommendedAnchor?.matchScore ?? -999,
        matchReasons: recommendedAnchor?.matchReasons ?? [],
        matchReason: buildMatchReason({
          universityProvince: first.university?.province,
          studentProvince: student.province,
          is985: first.university?.is985 ?? false,
          is211: first.university?.is211 ?? false,
          isDoubleFirstClass: first.university?.isDoubleFirstClass ?? false,
          runningNature: first.university?.runningNature,
          gradient: dynamicGradient.gradient,
        }),
        prefMatch: buildPrefMatch({
          studentProvince: student.province,
          studentTuitionBudget: (student as any).tuitionBudget ?? null,
          studentCareerPlan: (student as any).careerPlan ?? null,
          universityProvince: first.university?.province,
          anchorTuition: first.tuition,
          // 同上: 读 enrollment_plan 自身的硕士点(majors.localMasterPoint 全表 false 没回填)
          anchorHasMasterPoint: !!first.localMasterPoint,
          anchorEmploymentRate:
            typeof first.major?.employmentRate === 'number'
              ? first.major.employmentRate
              : null,
        }),
        history3y: groupHistory.history3y,
        historyFiling3y: groupHistory.historyFiling3y,
        recommendedAnchorEnrollmentPlanId: recommendedAnchor?.enrollmentPlanId ?? null,
        majors: orderedMajors,
        // 硬规则不符(资格不符)独立桶: 仅 includeHardFails 时非空; 前端灰显+锁+禁加入。
        hardFailMajors,
        majorSections,
        // 全 RISK 标记: 当 tier 命中但所有专业都进 RISK 时为 true. 前端据此显示位次差预警 +
        // 禁用/警告"加入"按钮 (避免老师误加位次远远不到的专业)
        allRisk: isAllRisk,
      };
    }))).filter((group): group is any => Boolean(group));

    // 无史线组的人工判断锚点: 有线组分数带, 同校同 recruitType 优先, 没有则回退全批次同 recruitType。
    // 公费师范的现实形态是"整校有线(川师) vs 整校无线(西华师大等)", 同校口径常落空, 批次口径才是
    // 老师实际参照的对照("省级公费有线组 541~617")。
    // 锚是客观对照, 用独立的批次级查询(distinct 组), 不随关键词/学生硬过滤收窄
    const hasNoLineGroup = (resultGroups as any[]).some(
      (g) => g.dynamicGradient && g.dynamicGradient.baseMinRank == null,
    );
    if (hasNoLineGroup) {
      const bandWhere: Record<string, unknown> = {
        province,
        year: source.admissionBaselineYear,
        groupMinScore: { not: null },
      };
      addInFilter(bandWhere, 'subjects', eps.map((ep) => ep.subjects));
      addInFilter(bandWhere, 'batch', eps.map((ep) => ep.batch));
      const bandRows = await this.prisma.admissionRecord.findMany({
        where: bandWhere,
        select: { universityId: true, recruitType: true, groupCode: true, groupMinScore: true },
        distinct: ['universityId', 'recruitType', 'groupCode'],
      });
      const accumulateBand = (
        map: Map<string, { min: number; max: number; count: number }>,
        key: string,
        score: number,
      ) => {
        const band = map.get(key);
        if (!band) map.set(key, { min: score, max: score, count: 1 });
        else {
          band.min = Math.min(band.min, score);
          band.max = Math.max(band.max, score);
          band.count += 1;
        }
      };
      const uniBands = new Map<string, { min: number; max: number; count: number }>();
      const rtBands = new Map<string, { min: number; max: number; count: number }>();
      for (const row of bandRows as any[]) {
        if (row.groupMinScore == null) continue;
        accumulateBand(uniBands, `${row.universityId}|${row.recruitType ?? ''}`, row.groupMinScore);
        accumulateBand(rtBands, row.recruitType ?? '', row.groupMinScore);
      }
      for (const g of resultGroups as any[]) {
        if (g.dynamicGradient && g.dynamicGradient.baseMinRank == null) {
          const uniBand = uniBands.get(`${g.universityId}|${g.recruitType ?? ''}`);
          const rtBand = rtBands.get(g.recruitType ?? '');
          g.siblingLineBand = uniBand
            ? { ...uniBand, scope: 'UNIVERSITY' }
            : rtBand
              ? { ...rtBand, scope: 'BATCH' }
              : null;
        }
      }
    }

    // 客观纯净度过滤（#4）: q.purity 为 csv 'S,A'，空 = 不过滤
    const purityWhitelist = (q.purity ?? '')
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter((s) => ['S', 'A', 'B', 'C'].includes(s));
    if (purityWhitelist.length > 0 && purityWhitelist.length < 4) {
      const allowed = new Set(purityWhitelist);
      // 无 purity 数据的组保留（避免老组完全消失）
      for (let i = resultGroups.length - 1; i >= 0; i--) {
        const lv = (resultGroups[i] as any)?.purity?.level;
        if (lv && !allowed.has(lv)) resultGroups.splice(i, 1);
      }
    }

    this.sortCandidateGroups(resultGroups, q.sort ?? 'MAJOR_MATCH', studentRank, q.sortDir ?? 'DESC');

    // matchScore 归一化：原 scoreMajorMatch 算法理论 0-196，实际多数 0-30。
    // 前端 MatchHeader 按 0-100 制着色（≥85 绿/70-84 蓝/<70 橙），导致几乎所有候选
    // 都显示低匹配。这里按本批最高分拉伸到 0-100，让色阶有意义。
    // 保留原始相对排序（单调变换不改变顺序）；原始分保留在 matchScoreRaw。
    if (resultGroups.length > 0) {
      const rawScores = (resultGroups as any[]).map((g) => {
        const n = Number(g.matchScore);
        return Number.isFinite(n) && n > 0 ? n : 0;
      });
      const rawMax = Math.max(0, ...rawScores);
      for (let i = 0; i < resultGroups.length; i++) {
        const g = resultGroups[i] as any;
        g.matchScoreRaw = Number.isFinite(Number(g.matchScore)) ? Number(g.matchScore) : null;
        g.matchScore = rawMax > 0 ? Math.round((rawScores[i] / rawMax) * 100) : 0;
      }
    }

    // 每个梯队的命中数: 在硬过滤 + keyword + excludeAdded 后, 含该 tier 任一专业的 group 数
    // 现在循环里 tier 模式下全 RISK 也保留, 所以这个数字 = 切到该梯队后真实看到的 group 数 (准确)
    const tiersStructure = listTiers(student.preferredMajors);
    const availableTiers = tiersStructure.map((t) => {
      let count = 0;
      for (const [, rows] of groups.entries()) {
        if (excludeAdded) {
          const first = rows[0] as any;
          const simpleKey = `${first.universityId}|${first.groupCode ?? ''}`;
          if (addedGroupKeys.has(simpleKey)) continue;
        }
        if (rows.some((ep: any) => t.majors.includes(ep.majorName))) count++;
      }
      return { tier: t.tier, majors: t.majors, groupCount: count };
    });

    const fullResult: CandidateGroupFullResult = {
      total: resultGroups.length,
      planYear: source.planYear,
      sourceYear: source.sourceYear,
      admissionBaselineYear: source.admissionBaselineYear,
      scoreSegmentYear: source.scoreSegmentYear,
      previousYear: source.sourceYear - 1,
      sourceBatchName: source.sourceBatchName,
      isFallbackYear: source.isFallbackYear,
      studentRankUsed: studentRankInfo.rank,
      studentRankSource: studentRankInfo.source,
      storedRank: studentRankInfo.storedRank,
      scoreBasedRank: studentRankInfo.scoreBasedRank,
      studentRawRank: studentRankInfo.rawRank,
      studentBonusPoints: studentRankInfo.bonusPoints,
      tierCounts: countTiers(resultGroups),
      sort: q.sort ?? 'MAJOR_MATCH',
      groups: resultGroups,
      availableTiers,
      appliedTier: q.tier ?? 0,
      predictedScoreRange: await this.computePredictedScoreRange(resultGroups, source.scoreSegmentYear, subjects),
    };
    this.setCandidateGroupCache(cacheKey, fullResult);
    if (q.groupBy === 'UNIVERSITY') {
      return this.paginateAsUniversities(fullResult, q, student, page, pageSize, rankWindow);
    }
    return this.paginateCandidateGroups(fullResult, page, pageSize, q.gradientBand, q.sinoForeign, rankWindow, q.includeRegionMismatch === true, q.recruitType);
  }

  async getCandidates(planId: number, q: GetCandidatesQuery, userId?: number) {
    const plan = await this.prisma.volunteerPlan.findUnique({
      where: { id: planId },
      include: { student: true },
    });
    if (!plan) throw new NotFoundException('方案不存在');
    if (userId && plan.createdById !== userId && plan.student.userId !== userId) {
      throw new ForbiddenException('无权查看此方案候选池');
    }
    if (!plan.batchName) throw new NotFoundException('方案缺少批次信息');

    const student = await this.prisma.studentProfile.findUnique({
      where: { id: plan.studentId },
      include: { user: true },
    });
    if (!student) throw new NotFoundException('学生不存在');

    const province = student.province ?? '四川';
    const subjects = EXAM_TYPE_TO_SUBJECTS[student.examType ?? 'PHYSICS'] || '物理';
    const source = await this.resolveEnrollmentPlanSource({
      planYear: plan.year,
      province,
      batchName: plan.batchName,
      subjects,
    });
    const where = buildHardFilterWhere({
      year: source.sourceYear,
      province,
      batchName: plan.batchName,
      subjects,
      keyword: q.keyword,
    });
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 20;
    const enrollmentPlanTake = Math.min(Math.max(page * pageSize * 5, 200), 1000);

    const eps = await this.prisma.enrollmentPlan.findMany({
      where,
      include: { university: true, major: true },
      take: enrollmentPlanTake,
    });

    const restrictions = await this.prisma.healthRestriction.findMany();
    const hardRules = this.buildHardRules(restrictions);
    const softRules = this.buildSoftRules();

    const adRecords = eps.length
      ? await this.prisma.admissionRecord.findMany({
          where: this.buildAdmissionRecordWhere(eps, province, [
            source.admissionBaselineYear - 1,
            source.admissionBaselineYear,
          ]),
        })
      : [];
    const adIndex = new Map<string, any>();
    for (const ar of adRecords) {
      const key = `${ar.universityId}|${ar.subjects}|${ar.batch}|${ar.recruitType}|${ar.groupCode}|${ar.majorCode}|${ar.majorName}|${ar.year}`;
      adIndex.set(key, ar);
    }

    // 历史线锚定 admissionBaselineYear（当前年）与其上一年；字段名沿用 25/24 历史命名(前端契约), 语义已由基线年驱动
    const yCur = source.admissionBaselineYear;
    const yPrev = source.admissionBaselineYear - 1;
    const getHist = (ep: any) => {
      const kCur = `${ep.universityId}|${ep.subjects}|${ep.batch}|${ep.recruitType}|${ep.groupCode}|${ep.majorCode}|${ep.majorName}|${yCur}`;
      const kPrev = `${ep.universityId}|${ep.subjects}|${ep.batch}|${ep.recruitType}|${ep.groupCode}|${ep.majorCode}|${ep.majorName}|${yPrev}`;
      const rCur = adIndex.get(kCur);
      const rPrev = adIndex.get(kPrev);
      return {
        score25Group: rCur?.groupMinScore ?? null,
        rank25Group: rCur?.groupMinRank ?? null,
        score25Major: rCur?.majorMinScore ?? null,
        rank25Major: rCur?.majorMinRank ?? null,
        score24Major: rPrev?.majorMinScore ?? null,
        rank24Major: rPrev?.majorMinRank ?? null,
      };
    };

    const studentRankInfo = await this.resolveStudentRank(student, source.scoreSegmentYear);
    const studentRank = studentRankInfo.rank;
    const enriched = eps.flatMap((ep): any[] => {
      // 硬过滤: 学生身份不符合 (性别/健康/户籍/民族) 直接剔除该 EP
      for (const rule of hardRules) {
        const res = rule.check(student as any, ep as any);
        if (!res.pass) return [];
      }
      const reasons: SoftFailReason[] = [];
      for (const rule of softRules) {
        const res = rule.check(student as any, ep as any);
        if (!res.pass && res.reason) reasons.push(res.reason);
      }
      const history = getHist(ep);
      const historyMin = history.rank25Group ?? history.rank25Major ?? null;
      const suggestedGradient = calcGradient(studentRank, historyMin);
      const rankDiffRatio = historyMin ? studentRank / historyMin : null;

      return [{
        enrollmentPlanId: ep.id,
        universityId: ep.universityId,
        universityName: ep.university.name,
        groupCode: ep.groupCode,
        groupName: ep.groupName,
        majorId: ep.majorId,
        majorName: ep.majorName,
        majorCode: ep.majorCode,
        recruitType: ep.recruitType,
        planCount: ep.planCount,
        tuition: ep.tuition,
        subjectRequirements: ep.subjectRequirements,
        history,
        rankDiffRatio,
        suggestedGradient,
        matchStatus: reasons.length === 0 ? 'PASS' : 'SOFT_FAIL',
        failReasons: reasons,
      }];
    });

    let visible = enriched;
    if (q.includeSoftFails === false) {
      visible = enriched.filter((x) => x.matchStatus === 'PASS');
    }

    visible.sort((a, b) => {
      if (a.matchStatus !== b.matchStatus) return a.matchStatus === 'PASS' ? -1 : 1;
      if (a.failReasons.length !== b.failReasons.length) {
        return a.failReasons.length - b.failReasons.length;
      }
      const ar = a.rankDiffRatio ?? 999;
      const br = b.rankDiffRatio ?? 999;
      return Math.abs(ar - 1) - Math.abs(br - 1);
    });

    const start = (page - 1) * pageSize;
    return {
      total: visible.length,
      page,
      pageSize,
      planYear: source.planYear,
      sourceYear: source.sourceYear,
      admissionBaselineYear: source.admissionBaselineYear,
      scoreSegmentYear: source.scoreSegmentYear,
      sourceBatchName: source.sourceBatchName,
      isFallbackYear: source.isFallbackYear,
      studentRankUsed: studentRankInfo.rank,
      studentRankSource: studentRankInfo.source,
      storedRank: studentRankInfo.storedRank,
      scoreBasedRank: studentRankInfo.scoreBasedRank,
      studentRawRank: studentRankInfo.rawRank,
      studentBonusPoints: studentRankInfo.bonusPoints,
      items: visible.slice(start, start + pageSize),
    };
  }
}
