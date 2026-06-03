'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { pickerApi } from '@/services/picker';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  Alert,
  AutoComplete,
  Button,
  Descriptions,
  Drawer,
  Modal,
  Pagination,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  ArrowLeftOutlined,
  CheckOutlined,
  CloseOutlined,
  DeleteOutlined,
  DownOutlined,
  FileTextOutlined,
  InfoCircleOutlined,
  PlusOutlined,
  RightOutlined,
  SearchOutlined,
  SendOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { studentApi, type EligibleBatch } from '@/services/student-api';
import { planApi, type CandidateGroupSort } from '@/services/plan-api';
import { CandidateCardV3 } from './CandidateCardV3';
import PlanMajorSelectionEditor from '../../components/PlanMajorSelectionEditor';
import {
  findPlanForBatch,
  formatCandidateGroup,
  formatGroupPlanChange,
  formatRankGap,
  formatSubjectCombination,
  formatSupplementary,
  getMajorGroupSelectionPayload,
  getLatestPlansByBatch,
  getPlanItemsForWorkbench,
  getSubjectHighlights,
  hasSupplementaryData,
  isCandidateGroupAlreadyAdded,
  sortPlansForWorkbench,
  summarizeTags,
  type SelectedPlanMajorPayload,
  type WorkbenchPlan,
} from './plan-workbench-utils';
import styles from './candidate-pool-polished.module.css';
import {
  NotesChip,
  HiddenCard, ComparePanel,
} from '@/components/candidate-pool-v2';
import compareStyles from '@/components/candidate-pool-v2/styles.module.css';

type Gradient = 'CHONG' | 'WEN' | 'BAO';
type DynamicGradientTier =
  | 'JI_CHONG'
  | 'CHONG'
  | 'XIAO_CHONG'
  | 'WEN'
  | 'WEN_BAO'
  | 'BAO'
  | 'QIANG_BAO'
  | 'DIBAO';
type MatchStatus = 'PASS' | 'SOFT_FAIL';
type MajorDisplaySection = 'RECOMMENDED' | 'BACKUP' | 'RISK';
type RankRiskEligibility = 'FORMAL' | 'OBSERVE_ONLY' | 'REJECTED' | 'INSUFFICIENT_DATA';

interface DynamicGradientDetail {
  gradient: Gradient;
  tier: DynamicGradientTier;
  baseMinRank?: number | null;
  adjustedMinRank?: number | null;
  rankGapRatio?: number | null;
  reasons?: string[];
}

interface CompetitionDetail {
  currentYear?: number | null;
  previousYear?: number | null;
  currentCount?: number | null;
  previousCount?: number | null;
  currentBatchLineScore?: number | null;
  previousBatchLineScore?: number | null;
}

interface SelectionCompetitionDetail {
  sourceYear?: number | null;
  sourceType?: string | null;
  firstChoice?: string | null;
  requiredSubjects?: string[];
  eligibleCount?: number | null;
  subjectCount?: number | null;
}

interface SupplementaryDetail {
  sourceYear?: number | null;
  scope?: 'UNIVERSITY_BATCH' | 'GROUP' | string | null;
  totalRounds?: number | null;
  totalPlanCount?: number | null;
  supplementaryRate?: number | null;
}

interface FailReason {
  rule: string;
  note: string;
  severity?: string;
}

interface RankStrategyDetail {
  sourceAdmissionYear?: number | null;
  rankSourceYear?: number | string | null;
  candidateRank?: number | null;
  requiredEasierDelta?: number | null;
  rushFormalLimit?: number | null;
  rushObserveLimit?: number | null;
  safeNormalMargin?: number | null;
  safeStrongMargin?: number | null;
  eligibility?: RankRiskEligibility;
  reason?: string | null;
}

interface CandidateMajor {
  enrollmentPlanId: number;
  majorId: number;
  majorCode?: string | null;
  majorName: string;
  majorCategory?: string | null;
  discipline?: string | null;
  softRating?: string | null;
  majorStrengthScore?: number | null;
  description?: string | null;
  careerDirections?: string[] | null;
  postgraduateDirections?: string[] | null;
  coreCourses?: string[] | null;
  employmentRate?: number | string | null;
  avgSalary?: number | string | null;
  degree?: string | null;
  standardDuration?: string | null;
  satisfactionScore?: number | null;
  localMasterPoint?: boolean | null;
  localDoctoralPoint?: boolean | null;
  planCount?: number | null;
  tuition?: number | null;
  duration?: string | null;
  subjectRequirements?: string | null;
  disciplineEval?: string | null;
  isNationalFeature?: boolean | null;
  majorRanking?: string | null;
  majorHonor?: string | null;
  planNotes?: string | null;
  isSinoForeign?: boolean | null;
  majorMinScore?: number | null;
  majorMinRank?: number | null;
  majorAdmissionCount?: number | null;
  previousMajorMinScore?: number | null;
  previousMajorMinRank?: number | null;
  previousMajorAdmissionCount?: number | null;
  matchScore?: number | null;
  matchReasons?: string[];
  matchReason?: string | null;
  dynamicGradient?: DynamicGradientDetail | null;
  suggestedGradient: Gradient;
  matchStatus: MatchStatus;
  failReasons: FailReason[];
  displaySection?: MajorDisplaySection;
  displayReason?: string | null;
  rankStrategy?: RankStrategyDetail | null;
  isRecommendedAnchor?: boolean;
  // 临时搜索高亮: true 表示该专业的 majorName / category 命中了当前搜索关键词。
  // 仅用于 UI 排序(分区内排前)+ 加"搜索匹配"chip, 不影响 anchor / 加入方案的第 1 志愿。
  matchesKeyword?: boolean;
  // 意向梯队命中: true 表示该专业属于当前选中的意向梯队 (后端返回)。
  // 用于分区内排前 + 加绿色"🎯 梯队意向"chip。
  matchesPreferredTier?: boolean;
}

interface CandidateMajorSections {
  recommended: CandidateMajor[];
  backup: CandidateMajor[];
  risk: CandidateMajor[];
}

interface CandidateGroup {
  groupKey: string;
  universityId: number;
  universityName: string;
  universityCode?: string | null;
  university?: {
    is985?: boolean;
    is211?: boolean;
    isDoubleFirstClass?: boolean;
    softRanking?: number | null;
    runningNature?: string | null;
    province?: string | null;
    city?: string | null;
    logoUrl?: string | null;
    postgradRate?: string | null;
    furtherStudyRate?: string | null;
    employmentRate?: string | null;
    avgSalary?: string | null;
    satisfactionOverall?: number | null;
    satisfactionCount?: number | null;
  };
  groupCode?: string | null;
  groupName?: string | null;
  batch?: string | null;
  recruitType?: string | null;
  subjects?: string | null;
  currentPlanYear?: number | null;
  previousPlanYear?: number | null;
  currentPlanCount?: number | null;
  previousPlanCount?: number | null;
  planCountChange?: number | null;
  groupMinScore?: number | null;
  groupMinRank?: number | null;
  groupAdmissionCount?: number | null;
  scoreSource?: 'GROUP' | 'FILING' | 'MAJOR' | 'NONE' | string | null;
  predictedMinRank?: {
    point?: number | null;
    conservative?: number | null;
    optimistic?: number | null;
    confidence?: string | null;
    targetYear?: number | null;
  } | null;
  dynamicGradient?: DynamicGradientDetail | null;
  competition?: CompetitionDetail | null;
  selectionCompetition?: SelectionCompetitionDetail | null;
  supplementary?: SupplementaryDetail | null;
  suggestedGradient: Gradient;
  majorCount: number;
  selectableMajorCount: number;
  softFailCount: number;
  matchScore?: number | null;
  matchReasons?: string[];
  matchReason?: string | null;
  prefMatch?: {
    province?: 'match' | 'mismatch';
    tuition?: 'within' | 'over';
    career?: 'strong' | 'weak';
    subjects?: 'match';
  };
  history3y?: Array<{ year: number; score: number; rank: number }>;
  historyFiling3y?: Array<{ year: number; score: number; rank: number }>;
  universityRank?: number | null;
  anchorMajorMinScore?: number | null;
  anchorMajorMinRank?: number | null;
  majorStrengthScore?: number | null;
  recommendedAnchorEnrollmentPlanId?: number | null;
  majors: CandidateMajor[];
  majorSections?: CandidateMajorSections | null;
  // 后端标记: tier 模式下命中梯队但全 RISK (位次差距过大 / 软规则全失败)
  // 前端据此显示位次差预警, 并禁用 / 警告"加入"按钮
  allRisk?: boolean;
}

interface CandidateGroupListResult {
  groups: CandidateGroup[];
  total: number;
  planYear?: number;
  sourceYear?: number;
  previousYear?: number;
  sourceBatchName?: string;
  isFallbackYear?: boolean;
  studentRankUsed?: number;
  studentRankSource?: 'PROFILE' | 'SCORE_SEGMENT' | 'MISSING' | string;
  storedRank?: number | null;
  scoreBasedRank?: number | null;
}

const STICKY_BAR_STORAGE_KEY = 'plan-workbench:student-bar-expanded';

const GRADIENT_LABEL: Record<DynamicGradientTier, string> = {
  JI_CHONG: '极冲',
  CHONG: '冲',
  XIAO_CHONG: '小冲',
  WEN: '稳',
  WEN_BAO: '稳保',
  BAO: '保',
  QIANG_BAO: '强保',
  DIBAO: '兜底',
};

const GRADIENT_COLOR: Record<DynamicGradientTier, string> = {
  JI_CHONG: 'magenta',
  CHONG: 'red',
  XIAO_CHONG: 'orange',
  WEN: 'blue',
  WEN_BAO: 'geekblue',
  BAO: 'green',
  QIANG_BAO: 'cyan',
  DIBAO: 'lime',
};

// pgv2 设计稿: 8 段动态梯度文字说明 (drawer 内 legend 使用)
const GRAD_DESC: Record<DynamicGradientTier, string> = {
  JI_CHONG: '位次差 > 50%,极有挑战,仅做参考',
  CHONG: '位次差 20-50%,需要发挥',
  XIAO_CHONG: '位次差 < 20%,有机会',
  WEN: '位次基本匹配 ±10%',
  WEN_BAO: '比学生位次稍低,较稳',
  BAO: '位次差 30-50%,大概率录取',
  QIANG_BAO: '位次差 > 50%,基本无虞',
  DIBAO: '位次差 > 70%,兜底保命',
};

// pgv2 设计稿: 4 chip 梯度过滤
type GradientFilterValue = 'all' | 'RUSH' | 'STABLE' | 'SAFE';
const GRADIENT_FILTER_OPTIONS: Array<{
  value: GradientFilterValue;
  label: string;
  tones: DynamicGradientTier[] | null;
}> = [
  { value: 'all', label: '全部', tones: null },
  { value: 'RUSH', label: '冲档', tones: ['JI_CHONG', 'CHONG', 'XIAO_CHONG'] },
  { value: 'STABLE', label: '稳档', tones: ['WEN', 'WEN_BAO'] },
  { value: 'SAFE', label: '保底', tones: ['BAO', 'QIANG_BAO', 'DIBAO'] },
];

const MAJOR_SECTION_LABEL: Record<MajorDisplaySection, string> = {
  RECOMMENDED: '推荐填写',
  BACKUP: '可备选',
  RISK: '风险/不建议',
};

const CANDIDATE_SORT_OPTIONS: Array<{ label: string; value: CandidateGroupSort }> = [
  { label: '综合推荐', value: 'MAJOR_MATCH' },
  { label: '位次更接近', value: 'RANK_FIT' },
  { label: '专业最低分高', value: 'MAJOR_MIN_SCORE_DESC' },
  { label: '学校排名优先', value: 'UNIVERSITY_RANK' },
  { label: '专业实力优先', value: 'MAJOR_STRENGTH' },
  { label: '招生人数多', value: 'PLAN_COUNT_DESC' },
  { label: '征集比例高', value: 'SUPPLEMENTARY_RATE_DESC' },
  { label: '安全程度高', value: 'SAFETY_DESC' },
];

const PRIORITY_MODE_LABEL: Record<string, string> = {
  UNIVERSITY_FIRST: '院校优先',
  MAJOR_FIRST: '专业优先',
  CITY_FIRST: '城市优先',
  BALANCED: '均衡',
};

const CAREER_PLAN_LABEL: Record<string, string> = {
  POSTGRADUATE: '考研深造',
  EMPLOYMENT: '本科就业',
  ABROAD: '出国留学',
  PUBLIC_SERVANT: '公考/编制',
  UNDECIDED: '暂未确定',
};

const STAY_PREFERENCE_LABEL: Record<string, string> = {
  LOCAL_ONLY: '只考虑本省',
  PREFER_LOCAL: '倾向本省',
  NO_PREFERENCE: '地域不限',
  PREFER_OUTSIDE: '倾向外省',
};

const TUITION_BUDGET_LABEL: Record<string, string> = {
  LOW: '低(<6k/年)',
  MEDIUM: '中(6k-1w)',
  HIGH: '高(1w-3w)',
  UNLIMITED: '不限',
};

const ACCEPT_LEVEL_LABEL: Record<string, string> = {
  STRICT: '严格限制',
  MODERATE: '谨慎考虑',
  RELAXED: '可接受',
  UNDECIDED: '未确定',
};

const REMOTE_AREA_LABEL: Record<string, string> = {
  ABSOLUTELY_NO: '不接受偏远',
  BACKUP_ONLY: '仅兜底考虑',
  FAMOUS_OK: '名校可接受',
  GOOD_MAJOR_OK: '好专业可接受',
};

const COLD_MAJOR_LABEL: Record<string, string> = {
  ABSOLUTELY_NO: '不接受冷门',
  FAMOUS_OK: '名校可接受',
  DEVELOPED_AREA_OK: '发达地区可接受',
  GOOD_PROSPECT_OK: '前景好可接受',
};

const INTAKE_STATUS_LABEL: Record<string, string> = {
  DRAFT: '资料草稿',
  SUBMITTED: '待老师确认',
  VERIFIED: '资料已确认',
  REQUEST_CHANGE: '已退回修改',
};

const EXAM_SOURCE_LABEL: Record<string, string> = {
  REAL_EXAM: '正式高考',
  MOCK_EXAM: '模拟考',
  ESTIMATED: '估分',
};

function unwrap<T>(value: any): T {
  return (value?.data ?? value) as T;
}

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

function formatValue(value?: number | string | null, suffix = '') {
  if (value === null || value === undefined || value === '') return '-';
  return `${typeof value === 'number' ? value.toLocaleString() : value}${suffix}`;
}

function formatLabel(value: unknown, labels: Record<string, string>) {
  if (typeof value !== 'string' || !value.trim()) return '-';
  return labels[value] ?? value;
}

function formatPlainText(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : '-';
}

function formatBooleanChoice(value: unknown, yes = '接受', no = '不接受') {
  if (typeof value !== 'boolean') return '未填写';
  return value ? yes : no;
}

function renderTags(values?: string[] | null, color: string = 'default') {
  const items = Array.isArray(values) ? values.filter(Boolean).slice(0, 10) : [];
  if (!items.length) return <span className="text-text-faint">暂无</span>;
  return (
    <Space size={[4, 6]} wrap>
      {items.map((value) => (
        <Tag key={value} color={color} className="m-0">{value}</Tag>
      ))}
    </Space>
  );
}

// pgv2 设计稿 profile 行:左 label + 右值
function ProfLine({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="pgv2-prof-line">
      <span className="k">{k}</span>
      <div className="v">{v}</div>
    </div>
  );
}

// pgv2 设计稿 5 个紧凑横排 fact (替换 stat-cluster 5 大卡)
function Fact({ k, v, sub, tone }: { k: string; v: ReactNode; sub: ReactNode; tone?: 'accent' | 'safe' | 'rush' | 'primary' }) {
  return (
    <div className={`pgv2-fact ${tone ? `tone-${tone}` : ''}`}>
      <div className="k">{k}</div>
      <div className="v">{v}</div>
      <div className="sub">{sub}</div>
    </div>
  );
}

// pgv2 设计稿 chip 渲染(产 pgv2-tag,替代 antd Tag);空数组显示"暂无"
function pgvChips(items: any, tone: string = 'muted') {
  const arr = getArrayValues(items);
  if (!arr.length) return <span className="pgv2-empty">暂无</span>;
  return arr.map((s: any, i: number) => (
    <span key={i} className={`pgv2-tag tone-${tone}`}>{String(s)}</span>
  ));
}

function getStudentName(student?: Record<string, any>) {
  return student?.user?.realName || student?.realName || student?.user?.username || '-';
}

function getArrayValues(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : [];
}

function getPhysicalLimitTags(student?: Record<string, any>) {
  return [
    ...(getArrayValues(student?.physicalLimits)),
    student?.colorBlind ? '色盲' : null,
    student?.colorWeak ? '色弱' : null,
    student?.medicalHistory ? `病史：${student.medicalHistory}` : null,
  ].filter((item): item is string => Boolean(item));
}

/* StudentProfileBlock / StudentFact 已被 pgv2-profile-grid + pgv2-facts 替换 */

function gradientTier(item: { suggestedGradient?: Gradient; dynamicGradient?: DynamicGradientDetail | null }): DynamicGradientTier {
  return item.dynamicGradient?.tier ?? item.suggestedGradient ?? 'WEN';
}

function gradientTone(tier: DynamicGradientTier) {
  if (tier === 'JI_CHONG' || tier === 'CHONG' || tier === 'XIAO_CHONG') return 'rush';
  if (tier === 'BAO' || tier === 'QIANG_BAO' || tier === 'DIBAO') return 'safe';
  return 'stable';
}

function tagClass(tone: 'rush' | 'stable' | 'safe' | 'muted' | 'warn' | 'extreme') {
  const toneClass = {
    rush: styles.tagRush,
    stable: styles.tagStable,
    safe: styles.tagSafe,
    muted: styles.tagMuted,
    warn: styles.tagWarn,
    extreme: styles.tagExtreme,
  }[tone];
  return cx(styles.tag, toneClass);
}

/* formatCompetition / formatSelectionCompetition 已删 — 候选卡区改用 CandidateCardV3, 不再需要这两个 helper */

function formatRankValue(value?: number | null) {
  return value ? `${value.toLocaleString()} 位` : '-';
}

function formatScoreValue(value?: number | null) {
  return value == null ? '-' : `${value} 分`;
}

function formatScoreRankValue(score?: number | null, rank?: number | null) {
  return `${formatScoreValue(score)} / ${formatRankValue(rank)}`;
}

function formatTuition(value?: number | null) {
  return value ? `${value.toLocaleString()} 元/年` : '-';
}

function getAnchorMajor(group: CandidateGroup) {
  const sections = getMajorSections(group);
  return group.majors.find((major) => major.enrollmentPlanId === group.recommendedAnchorEnrollmentPlanId) ??
    sections.recommended[0] ??
    group.majors[0];
}

function getMajorSections(group: CandidateGroup): CandidateMajorSections {
  return group.majorSections ?? {
    recommended: group.majors ?? [],
    backup: [],
    risk: [],
  };
}

function majorSectionTone(section: MajorDisplaySection, major: CandidateMajor) {
  if (section === 'RISK') return 'warn';
  if (section === 'BACKUP') return 'muted';
  return major.matchStatus === 'SOFT_FAIL' ? 'warn' : gradientTone(gradientTier(major));
}

function getRankingClass(ranking?: string | null): string {
  if (!ranking) return '';
  const norm = String(ranking).replace(/[\s+]/g, (m) => m === '+' ? '+' : '').trim();
  if (norm === 'A+') return compareStyles.majorRankingAplus;
  if (norm === 'A') return compareStyles.majorRankingA;
  if (norm === 'B+') return compareStyles.majorRankingBplus;
  if (norm === 'B') return compareStyles.majorRankingB;
  return compareStyles.majorRankingC;
}

function CandidateMajorSection({
  title,
  section,
  majors,
  group,
  onAdd,
  addingMajorKey,
}: {
  title: string;
  section: MajorDisplaySection;
  majors: CandidateMajor[];
  group?: CandidateGroup;
  onAdd?: (group: CandidateGroup, major: CandidateMajor) => void;
  addingMajorKey?: number | null;
}) {
  if (!majors.length) return null;
  // 视觉排序优先级 (不改 anchor 持久语义):
  //   1. matchesPreferredTier (意向梯队命中) 排最前
  //   2. matchesKeyword (搜索命中) 次之
  const sortedMajors = [...majors].sort((a, b) => {
    const ap = a.matchesPreferredTier ? 1 : 0;
    const bp = b.matchesPreferredTier ? 1 : 0;
    if (ap !== bp) return bp - ap;
    return (b.matchesKeyword ? 1 : 0) - (a.matchesKeyword ? 1 : 0);
  });
  return (
    <div className={styles.majorSection}>
      <div className={styles.majorSectionHead}>
        <span>{title}</span>
        <em>{majors.length}</em>
      </div>
      <div className={styles.majorSectionRows}>
        {sortedMajors.map((major) => {
          const starClass =
            section === 'RECOMMENDED' ? compareStyles.majorStarRec :
            section === 'RISK' ? compareStyles.majorStarRisk :
            compareStyles.majorStarBak;

          // 1 年涨跌（majorMinScore vs previousMajorMinScore）
          const curr = major.majorMinScore;
          const prev = major.previousMajorMinScore;
          const trendArrow =
            curr != null && prev != null
              ? curr > prev
                ? <span className={`${compareStyles.majorTrendArrow} ${compareStyles.majorTrendUp}`}>↗</span>
                : curr < prev
                  ? <span className={`${compareStyles.majorTrendArrow} ${compareStyles.majorTrendDown}`}>↘</span>
                  : <span className={`${compareStyles.majorTrendArrow} ${compareStyles.majorTrendFlat}`}>→</span>
              : <span className={`${compareStyles.majorTrendArrow} ${compareStyles.majorTrendFlat}`}>—</span>;

          const isAdded = addingMajorKey === major.enrollmentPlanId;

          return (
            <div
              key={major.enrollmentPlanId}
              className={`${compareStyles.majorRowV2} ${section === 'RISK' ? compareStyles.majorRowV2Risk : ''}`}
            >
              <div className={`${compareStyles.majorStarV2} ${starClass}`}>★</div>

              <div className={compareStyles.majorNameV2}>
                <b>{major.majorName}</b>
                {/* 评级优先级：① 学科评估等级 disciplineEval (A+/A/B+ 字母) - 学校×专业最权威
                    ② 专业排名 majorRanking (#N 数字) - 全国该专业排名，覆盖率更高
                    都没有就不显示 */}
                {(() => {
                  const evalText = major.disciplineEval && String(major.disciplineEval).trim() && String(major.disciplineEval).trim() !== '/' ? String(major.disciplineEval).trim() : null;
                  if (evalText) {
                    return (
                      <span
                        className={`${compareStyles.majorRankingChip} ${getRankingClass(evalText)}`}
                        title="学科评估等级（学校×专业）"
                      >
                        {evalText}
                      </span>
                    );
                  }
                  const rankText = major.majorRanking && String(major.majorRanking).trim() && String(major.majorRanking).trim() !== '/' ? String(major.majorRanking).trim() : null;
                  if (rankText) {
                    const n = parseInt(rankText, 10);
                    const numClass =
                      !Number.isFinite(n) ? compareStyles.majorRankNumOther :
                      n <= 3 ? compareStyles.majorRankNumTop3 :
                      n <= 10 ? compareStyles.majorRankNumTop10 :
                      n <= 30 ? compareStyles.majorRankNumTop30 :
                      n <= 100 ? compareStyles.majorRankNumTop100 :
                      compareStyles.majorRankNumOther;
                    return (
                      <span
                        className={`${compareStyles.majorRankNum} ${numClass}`}
                        title={`专业全国排名 第 ${rankText} 名`}
                      >
                        #{rankText}
                      </span>
                    );
                  }
                  return null;
                })()}
                {major.isNationalFeature ? <span className={`${compareStyles.majorTag} ${compareStyles.majorTagNational}`}>国家特色</span> : null}
                {major.isSinoForeign ? <span className={`${compareStyles.majorTag} ${compareStyles.majorTagSino}`}>中外</span> : null}
                {major.matchesKeyword ? (
                  <span
                    style={{
                      marginLeft: 6,
                      padding: '1px 6px',
                      borderRadius: 4,
                      fontSize: 11,
                      fontWeight: 600,
                      background: '#fffbe6',
                      color: '#d48806',
                      border: '1px solid #ffe58f',
                    }}
                    title="临时高亮:命中当前搜索关键词。不影响该专业组的锚定专业(以学生意向为准)。"
                  >
                    🔍 搜索匹配
                  </span>
                ) : null}
                {major.matchesPreferredTier ? (
                  <span
                    style={{
                      marginLeft: 6,
                      padding: '1px 6px',
                      borderRadius: 4,
                      fontSize: 11,
                      fontWeight: 600,
                      background: '#f6ffed',
                      color: '#389e0d',
                      border: '1px solid #b7eb8f',
                    }}
                    title="该专业属于当前选中的意向梯队。"
                  >
                    🎯 梯队意向
                  </span>
                ) : null}
                {major.planNotes ? <NotesChip notes={major.planNotes} /> : null}
              </div>

              <div className={compareStyles.majorScoreCell}>
                <div className={compareStyles.scoreMain}>
                  <span className={compareStyles.scoreMainValue}>{curr ?? '—'}</span>
                  {curr != null && prev != null && curr !== prev ? (
                    <span style={{
                      fontSize: 11, fontWeight: 600,
                      color: curr > prev ? '#c53030' : '#276749',
                    }}>
                      {curr > prev ? '+' : ''}{curr - prev}
                    </span>
                  ) : null}
                </div>
                <div className={compareStyles.scoreSub}>
                  位次 {major.majorMinRank?.toLocaleString() ?? '—'}
                </div>
              </div>

              <div className={compareStyles.degreePoints}>
                <span className={major.localMasterPoint ? compareStyles.has : ''}>硕</span>
                <span className={(major as any).localDoctoralPoint ? compareStyles.has : ''}>博</span>
              </div>

              {trendArrow}

              <div className={compareStyles.majorPlanText}>
                本专业 <b>{major.planCount ?? '—'}</b> 人
              </div>

              {group && onAdd ? (
                <button
                  type="button"
                  className={`${compareStyles.majorRowAction} ${isAdded ? compareStyles.majorRowActionDone : ''}`}
                  onClick={() => onAdd(group, major)}
                  disabled={isAdded}
                >
                  {isAdded ? '✓ 已加入' : <><PlusOutlined /> 加入</>}
                </button>
              ) : (
                <span className={tagClass(majorSectionTone(section, major))}>
                  {section === 'RISK' ? MAJOR_SECTION_LABEL.RISK : section === 'BACKUP' ? MAJOR_SECTION_LABEL.BACKUP : GRADIENT_LABEL[gradientTier(major)]}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function getAdjustedRank(group: CandidateGroup, major?: CandidateMajor | null) {
  return major?.dynamicGradient?.adjustedMinRank ?? group.dynamicGradient?.adjustedMinRank ?? group.predictedMinRank?.point ?? null;
}

function getAddActionLabel(group: CandidateGroup, major?: CandidateMajor, added?: boolean) {
  if (added) return '已在方案';
  if (!major) return '暂无可加入专业';
  if (major.matchStatus === 'SOFT_FAIL' || group.softFailCount > 0) return '确认风险后加入';
  return '加入并补满专业';
}

function selectedMajorSectionLabel(section?: string | null) {
  if (section === 'RECOMMENDED' || section === 'BACKUP' || section === 'RISK') {
    return MAJOR_SECTION_LABEL[section];
  }
  return '专业';
}

function getDecisionText(group: CandidateGroup, major: CandidateMajor | undefined, studentRank?: number | null) {
  const gap = formatRankGap(studentRank, getAdjustedRank(group, major));
  if (gap.tone === 'behind') return `${gap.text}，建议只作冲档或备选，加入前必须复核风险。`;
  if (major?.matchStatus === 'SOFT_FAIL') return `${gap.text}，位次可参考，但该专业命中软性风险。`;
  if (gap.tone === 'ahead') return `${gap.text}，可进入正式推荐，仍需确认专业排序。`;
  return '位次口径不足，先复核分数线、招生计划和专业限制。';
}

function riskReviewItems(group: CandidateGroup, major: CandidateMajor | undefined, studentRank?: number | null) {
  const planChange = formatGroupPlanChange(group);
  const adjustedRank = getAdjustedRank(group, major);
  const gap = formatRankGap(studentRank, adjustedRank);
  const supplementaryScope = group.supplementary?.scope;
  return [
    {
      title: '位次风险',
      tone: gap.tone === 'behind' ? 'danger' : gap.tone === 'ahead' ? 'ok' : 'warn',
      content: adjustedRank
        ? `排序位次 ${formatRankValue(studentRank)}，修正位次 ${formatRankValue(adjustedRank)}，${gap.text}。`
        : '暂无修正位次，不能只按分数判断风险。',
    },
    {
      title: '招生计划变化',
      tone: planChange.tone === 'down' ? 'warn' : 'ok',
      content: planChange.text,
    },
    {
      title: '专业组结构',
      tone: group.softFailCount > 0 ? 'warn' : 'ok',
      content: `${group.majorCount} 个专业，${group.selectableMajorCount} 个可选，${group.softFailCount} 个软性风险专业。`,
    },
    {
      title: '选科/限制',
      tone: major?.matchStatus === 'SOFT_FAIL' ? 'danger' : 'ok',
      content: major?.failReasons?.length
        ? major.failReasons.map((reason) => reason.note).join('；')
        : major?.subjectRequirements || group.subjects || '未命中软限制风险。',
    },
    {
      title: '征集参考',
      tone: supplementaryScope === 'UNIVERSITY_BATCH' ? 'warn' : hasSupplementaryData(group) ? 'warn' : 'ok',
      content: supplementaryScope === 'UNIVERSITY_BATCH'
        ? `${formatSupplementary(group)}，仅说明院校批次曾有余缺，不能直接降低本专业组风险。`
        : formatSupplementary(group),
    },
  ];
}

function EvidenceItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.evidenceItem}>
      <b>{label}</b>
      <span>{children}</span>
    </div>
  );
}

function UniversityBadges({ group }: { group: CandidateGroup }) {
  const tags = [
    group.university?.is985 ? '985' : null,
    group.university?.is211 ? '211' : null,
    group.university?.isDoubleFirstClass ? '双一流' : null,
    group.university?.runningNature,
  ].filter(Boolean);
  if (!tags.length) return null;
  return (
    <>
      {tags.map((tag) => <span key={String(tag)} className={tagClass('muted')}>{tag}</span>)}
    </>
  );
}

// 院校搜索 AutoComplete: 输入时联想院校名 + 旧名 (renameHistory).
// 老师输入"川"看到"四川大学"; 输入"北方交通大学"看到"北京交通大学 (原 北方交通大学)"
function UniversitySearchAutoComplete({
  value, onChange, onCommit,
}: { value: string; onChange: (v: string) => void; onCommit: (v: string) => void }) {
  const { data } = useQuery({
    queryKey: ['picker-options', 'universities'],
    queryFn: () => pickerApi.universities(),
    staleTime: Infinity,
  });
  const universities = data ?? [];
  const options = useMemo(() => {
    const q = value.trim();
    if (!q) return [];
    const lower = q.toLowerCase();
    // 名称命中优先, renameHistory 命中其次
    const nameHits: any[] = [];
    const renameHits: any[] = [];
    for (const u of universities) {
      if (u.name.toLowerCase().includes(lower)) {
        nameHits.push({ value: u.name, label: u.name });
      } else if (u.renameHistory && u.renameHistory.includes(q)) {
        renameHits.push({
          value: u.name,
          label: `${u.name}  (含旧名: ${u.renameHistory.slice(0, 30)}${u.renameHistory.length > 30 ? '…' : ''})`,
        });
      }
      if (nameHits.length + renameHits.length >= 20) break;
    }
    return [...nameHits.slice(0, 12), ...renameHits.slice(0, 8)];
  }, [value, universities]);
  return (
    <span className="pgv2-search" title="按院校名搜索, 输入旧名 (如「北方交通大学」) 也能匹配到改名后的院校">
      <SearchOutlined />
      <AutoComplete
        value={value}
        options={options}
        onChange={onChange}
        onSelect={(v: string) => { onChange(v); onCommit(v); }}
        onBlur={() => onCommit(value)}
        onKeyDown={(e) => { if (e.key === 'Enter') onCommit(value); }}
        placeholder="搜索院校"
        style={{ width: 220 }}
        allowClear
        notFoundContent={null}
      />
    </span>
  );
}

// 专业搜索 AutoComplete: 输入时联想专业名
function MajorSearchAutoComplete({
  value, onChange, onCommit,
}: { value: string; onChange: (v: string) => void; onCommit: (v: string) => void }) {
  const { data } = useQuery({
    queryKey: ['picker-options', 'majors'],
    queryFn: () => pickerApi.majors(),
    staleTime: Infinity,
  });
  const majors = data ?? [];
  const options = useMemo(() => {
    const q = value.trim();
    if (!q) return [];
    const lower = q.toLowerCase();
    const hits: any[] = [];
    for (const m of majors) {
      if (m.name.toLowerCase().includes(lower)) {
        hits.push({ value: m.name, label: m.name });
        if (hits.length >= 20) break;
      }
    }
    return hits;
  }, [value, majors]);
  return (
    <span className="pgv2-search" title="按专业名搜索, 同时填院校则 AND 组合">
      <SearchOutlined />
      <AutoComplete
        value={value}
        options={options}
        onChange={onChange}
        onSelect={(v: string) => { onChange(v); onCommit(v); }}
        onBlur={() => onCommit(value)}
        onKeyDown={(e) => { if (e.key === 'Enter') onCommit(value); }}
        placeholder="搜索专业"
        style={{ width: 220 }}
        allowClear
        notFoundContent={null}
      />
    </span>
  );
}

export default function GeneratePlanPage() {
  const params = useParams<{ studentId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const studentId = params.studentId;
  const [batchConfigId, setBatchConfigId] = useState<number>();
  const [planId, setPlanId] = useState<number | undefined>(() => {
    const existingPlanId = Number(searchParams.get('planId'));
    return Number.isFinite(existingPlanId) && existingPlanId > 0 ? existingPlanId : undefined;
  });
  // 院校 / 专业各自独立输入, 同时填则后端 AND 组合
  const keyword = ''; // 旧参数兼容: UI 不再用单一 keyword, 此变量保留为空避免改动 API/cache key 结构
  const [keywordUniversity, setKeywordUniversity] = useState('');
  const [keywordMajor, setKeywordMajor] = useState('');
  const [searchTextUniversity, setSearchTextUniversity] = useState('');
  const [searchTextMajor, setSearchTextMajor] = useState('');
  const [includeSoftFails, setIncludeSoftFails] = useState(true);
  const [candidateSort, setCandidateSort] = useState<CandidateGroupSort>('MAJOR_MATCH');
  // 意向梯队过滤 (0 = 全部, 1+ = 该梯队). 默认 1 (学生没填意向时自动落到 0)
  const [appliedTier, setAppliedTier] = useState<number>(() => {
    const t = Number(searchParams.get('tier'));
    return Number.isFinite(t) && t >= 0 ? t : 1;
  });
  // 是否隐藏已加入当前 plan 的院校组 (默认 true)
  const [excludeAdded, setExcludeAdded] = useState<boolean>(
    searchParams.get('excludeAdded') !== 'false',
  );
  // FilterBar / 趋势 toggle 已下线: pgv2 设计稿用 4 chip 梯度 + showHidden 替代
  // 不持久化的"不考虑"集合（per-session）
  const [hiddenGroupKeys, setHiddenGroupKeys] = useState<Set<string>>(new Set());
  const hideGroup = (key: string) => setHiddenGroupKeys((prev) => new Set([...prev, key]));
  const restoreGroup = (key: string) =>
    setHiddenGroupKeys((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });

  // 展开态 Tab（per-group），默认 majors
  const [groupExpandTabs, setGroupExpandTabs] = useState<Record<string, 'majors' | 'evidence' | 'school'>>({});
  const setGroupExpandTab = (key: string, tab: 'majors' | 'evidence' | 'school') =>
    setGroupExpandTabs((prev) => ({ ...prev, [key]: tab }));

  // 算法路径 Drawer
  const [algoDrawerOpen, setAlgoDrawerOpen] = useState(false);

  // 多卡对比（最多 4 张）
  const [compareSet, setCompareSet] = useState<Set<string>>(new Set());
  const [compareDrawerOpen, setCompareDrawerOpen] = useState(false);
  const toggleCompare = (key: string) =>
    setCompareSet((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else if (next.size < 4) next.add(key);
      return next;
    });
  const [candidatePage, setCandidatePage] = useState(1);
  const [expandedGroupKeys, setExpandedGroupKeys] = useState<string[]>([]);
  // pgv2 设计稿: profile 可折叠 + 显示已隐藏 toggle + 8 段梯度 chip 过滤
  const [profileOpen, setProfileOpen] = useState(true);
  const [showHidden, setShowHidden] = useState(false);
  const [gradientFilter, setGradientFilter] = useState<GradientFilterValue>('all');
  // pgv2 设计稿: rail 志愿层 HTML5 drag-and-drop 排序 + 单项展开
  const [localPlanItems, setLocalPlanItems] = useState<any[]>([]);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [expandedRailItemId, setExpandedRailItemId] = useState<number | null>(null);
  const [activeDetail, setActiveDetail] = useState<{ group: CandidateGroup; major: CandidateMajor } | null>(null);
  const [stickyBarExpanded, setStickyBarExpanded] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(STICKY_BAR_STORAGE_KEY) === '1';
  });
  const candidatePageSize = 12;

  const { data: studentData, isLoading: studentLoading } = useQuery({
    queryKey: ['student-detail', studentId],
    queryFn: () => studentApi.getById(studentId),
  });
  const student = unwrap<Record<string, any>>(studentData);

  const { data: batchData, isLoading: batchLoading } = useQuery({
    queryKey: ['eligible-batches', studentId],
    queryFn: () => studentApi.getEligibleBatches(studentId),
  });
  const batches = unwrap<EligibleBatch[]>(batchData) ?? [];

  const { data: existingPlanData, isLoading: existingPlansLoading } = useQuery({
    queryKey: ['student-plans-latest', studentId],
    queryFn: () => planApi.listForStudent(studentId, { latest: true }),
  });
  const existingPlanRows = unwrap<WorkbenchPlan[]>(existingPlanData) ?? [];
  const existingPlans = useMemo(
    () => sortPlansForWorkbench(getLatestPlansByBatch(existingPlanRows), batches),
    [existingPlanRows, batches],
  );

  const { data: planData, isFetching: planFetching } = useQuery({
    queryKey: ['plan-detail', planId],
    queryFn: () => planApi.getById(String(planId)),
    enabled: !!planId,
  });
  const plan = unwrap<Record<string, any>>(planData);
  const planItems = getPlanItemsForWorkbench(plan);

  const { data: groupData, isFetching: groupLoading } = useQuery({
    queryKey: ['plan-candidate-groups', planId, keyword, keywordUniversity, keywordMajor, includeSoftFails, candidateSort, candidatePage, appliedTier, excludeAdded],
    queryFn: () => planApi.getCandidateGroups(planId!, {
      page: candidatePage,
      pageSize: candidatePageSize,
      keyword,
      keywordUniversity,
      keywordMajor,
      includeSoftFails,
      sort: candidateSort,
      tier: appliedTier,
      excludeAdded,
    }),
    enabled: !!planId,
  });
  const candidateGroups = unwrap<CandidateGroupListResult>(groupData);
  const groups = candidateGroups?.groups ?? [];

  // 前端筛选: pgv2 设计稿 4 chip 梯度 + 显示已隐藏 toggle
  const visibleGroups = useMemo(() => {
    return groups.filter((group) => {
      if (!showHidden && hiddenGroupKeys.has(group.groupKey)) return false;
      if (gradientFilter !== 'all') {
        const tier = gradientTier(group);
        const opt = GRADIENT_FILTER_OPTIONS.find((o) => o.value === gradientFilter);
        if (opt?.tones && !opt.tones.includes(tier)) return false;
      }
      return true;
    });
  }, [groups, hiddenGroupKeys, showHidden, gradientFilter]);

  // pgv2 设计稿 rail 三段统计: 把 planItem 3-tier (CHONG/WEN/BAO) 映射到 rush/stable/safe
  const tierStats = useMemo(() => {
    const acc = { rush: 0, stable: 0, safe: 0 };
    planItems.forEach((it: any) => {
      const g = it.gradient ?? it.suggestedGradient;
      if (g === 'CHONG') acc.rush += 1;
      else if (g === 'WEN') acc.stable += 1;
      else acc.safe += 1;
    });
    return acc;
  }, [planItems]);
  const isUsingFallbackYear = Boolean(candidateGroups?.isFallbackYear && candidateGroups.sourceYear && candidateGroups.planYear);
  const isUsingScoreBasedRank = Boolean(
    candidateGroups?.studentRankSource === 'SCORE_SEGMENT' &&
    candidateGroups.scoreBasedRank &&
    candidateGroups.storedRank &&
    candidateGroups.scoreBasedRank !== candidateGroups.storedRank,
  );
  const rawStudentRank = Number(student?.provincialRank);
  const rawStudentScore = Number(student?.totalScore);
  const studentRankForDecision = candidateGroups?.studentRankUsed ?? (Number.isFinite(rawStudentRank) && rawStudentRank > 0 ? rawStudentRank : undefined);
  const studentScoreForDecision = Number.isFinite(rawStudentScore) ? rawStudentScore : undefined;
  const subjectCombination = formatSubjectCombination(student ?? {});
  const subjectHighlights = getSubjectHighlights(student ?? {});
  const physicalLimitTags = getPhysicalLimitTags(student);

  const selectedBatchPlan = useMemo(
    () => findPlanForBatch(existingPlans, batchConfigId),
    [existingPlans, batchConfigId],
  );
  const selectedBatchName = batches.find((batch) => batch.batchConfigId === batchConfigId)?.batchName
    ?? selectedBatchPlan?.batchName
    ?? selectedBatchPlan?.batch
    ?? plan?.batchName
    ?? '未选择批次';
  const rankCheck = student?.rankCheck as { isEstimated?: boolean; sourceYear?: number | null } | undefined;
  const scoreRankNote = isUsingScoreBasedRank
    ? `排序按 ${formatRankValue(candidateGroups?.scoreBasedRank)} 计算`
    : rankCheck?.isEstimated
      ? `一分一段暂用 ${rankCheck.sourceYear ?? '-'} 年`
      : formatLabel(student?.examSource, EXAM_SOURCE_LABEL);
  const preferredLocationSummary = summarizeTags([
    ...getArrayValues(student?.preferredProvinces),
    ...getArrayValues(student?.preferredCities),
  ], 2);
  const preferredMajorSummary = summarizeTags([
    ...getArrayValues(student?.preferredMajors),
    ...getArrayValues(student?.preferredMajorCategories),
  ], 2);
  const excludedSummary = summarizeTags([
    ...getArrayValues(student?.excludedProvinces),
    ...getArrayValues(student?.excludedCities),
    ...getArrayValues(student?.excludedUniversities),
    ...getArrayValues(student?.excludedMajors),
    ...getArrayValues(student?.excludedMajorCategories),
  ], 3);
  const stickyStrengthSummary = subjectHighlights.strengths.length
    ? subjectHighlights.strengths.map((item) => `${item.label}${item.score}`).join('、')
    : '暂无';
  const stickyWeaknessSummary = subjectHighlights.weaknesses.length
    ? subjectHighlights.weaknesses.map((item) => `${item.label}${item.score}`).join('、')
    : '暂无';
  const riskPreferenceTags = [
    formatLabel(student?.tuitionBudget, TUITION_BUDGET_LABEL),
    student?.acceptPrivate ? `民办：${formatLabel(student.acceptPrivate, ACCEPT_LEVEL_LABEL)}` : null,
    typeof student?.acceptSinoForeign === 'boolean' ? `中外：${formatBooleanChoice(student.acceptSinoForeign)}` : null,
    formatLabel(student?.remoteAreaAcceptance, REMOTE_AREA_LABEL),
    formatLabel(student?.coldMajorAcceptance, COLD_MAJOR_LABEL),
  ].filter((item): item is string => Boolean(item && item !== '-'));

  useEffect(() => {
    if (!planId && existingPlans.length > 0) {
      const firstPlan = existingPlans[0];
      setPlanId(firstPlan.id);
      setBatchConfigId(firstPlan.batchConfigId ?? undefined);
    }
  }, [existingPlans, planId]);

  useEffect(() => {
    setCandidatePage(1);
    setExpandedGroupKeys([]);
  }, [planId, keyword, keywordUniversity, keywordMajor, includeSoftFails, candidateSort, appliedTier, excludeAdded]);

  // URL 同步: appliedTier / excludeAdded 写回 ?tier=N&excludeAdded=false
  // (沿用 P1-11 模式: 前进后退 + 分享链接保留状态)
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (appliedTier > 0) params.set('tier', String(appliedTier));
    else params.delete('tier');
    if (!excludeAdded) params.set('excludeAdded', 'false');
    else params.delete('excludeAdded');
    const next = params.toString();
    const current = searchParams.toString();
    if (next !== current) {
      router.replace(`?${next}`, { scroll: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedTier, excludeAdded]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STICKY_BAR_STORAGE_KEY, stickyBarExpanded ? '1' : '0');
  }, [stickyBarExpanded]);

  const createMutation = useMutation({
    mutationFn: () => planApi.createForStudent(studentId, { batchConfigId: batchConfigId! }),
    onSuccess: (res) => {
      const created = unwrap<Record<string, any>>(res);
      setPlanId(created.id);
      setBatchConfigId(created.batchConfigId ?? batchConfigId);
      queryClient.invalidateQueries({ queryKey: ['student-plans-latest', studentId] });
      void message.success('方案草稿已就绪');
    },
    onError: (error: any) => {
      void message.error(error?.response?.data?.message ?? '创建方案失败');
    },
  });

  const addMutation = useMutation({
    mutationFn: ({
      group,
      major,
      selectedMajors,
      candidateMajorRanking,
      softFailReasons,
    }: {
      group: CandidateGroup;
      major: CandidateMajor;
      selectedMajors: SelectedPlanMajorPayload[];
      candidateMajorRanking: SelectedPlanMajorPayload[];
      softFailReasons: FailReason[];
    }) =>
      planApi.addItem(planId!, {
        enrollmentPlanId: major.enrollmentPlanId,
        gradient: major.suggestedGradient ?? group.suggestedGradient,
        acceptAdjust: true,
        selectedMajors,
        candidateMajorRanking,
        selectionReason: [
          `锚定专业：${major.majorName}`,
          `建议专业顺序：${selectedMajors.map((item) => item.majorName).join('、')}`,
          '服从调剂：是',
          ...(group.dynamicGradient?.reasons ?? []),
          ...(group.matchReasons ?? []),
          ...(major.matchReasons ?? []),
        ].filter(Boolean).join('；'),
        softFailReasons,
        softFailOverrideConfirmed: softFailReasons.length > 0 ? true : undefined,
        overrideReason: softFailReasons.length > 0 ? '已在加入专业组弹窗确认服从调剂和风险专业' : undefined,
      }),
    onSuccess: () => {
      void message.success('已加入当前方案');
      queryClient.invalidateQueries({ queryKey: ['plan-detail', planId] });
    },
    onError: (error: any) => {
      void message.error(error?.response?.data?.message ?? '加入失败');
    },
  });

  const submitMutation = useMutation({
    mutationFn: () => planApi.submitForReview(String(planId)),
    onSuccess: () => {
      void message.success('已提交主管审核');
      router.push(`/teacher/plans/${planId}`);
    },
    onError: (error: any) => {
      void message.error(error?.response?.data?.message ?? '提交审核失败');
    },
  });

  const removeMutation = useMutation({
    mutationFn: (itemId: number) => planApi.deleteItem(String(planId), itemId),
    onSuccess: () => {
      void message.success('已移出方案');
      queryClient.invalidateQueries({ queryKey: ['plan-detail', planId] });
    },
    onError: (error: any) => {
      void message.error(error?.response?.data?.message ?? '移出失败');
    },
  });

  const updateMajorSelectionMutation = useMutation({
    mutationFn: ({
      itemId,
      selectedMajors,
      candidateMajorRanking,
    }: {
      itemId: number;
      selectedMajors: SelectedPlanMajorPayload[];
      candidateMajorRanking: SelectedPlanMajorPayload[];
    }) => planApi.updateItem(String(planId), itemId, {
      selectedMajors,
      candidateMajorRanking,
    }),
    onSuccess: () => {
      const wasPendingReview = plan?.status === 'PENDING_REVIEW';
      void message.success(wasPendingReview ? '已保存，方案已退回草稿，请重新提交' : '专业选择已保存');
      queryClient.invalidateQueries({ queryKey: ['plan-detail', planId] });
      queryClient.invalidateQueries({ queryKey: ['student-plans-latest', studentId] });
    },
    onError: (error: any) => {
      void message.error(error?.response?.data?.message ?? '专业选择保存失败');
    },
  });

  // pgv2 rail: 志愿层 drag-and-drop 持久化
  const reorderMutation = useMutation({
    mutationFn: (itemIds: number[]) => planApi.reorderItems(String(planId), itemIds),
    onSuccess: () => {
      void message.success('志愿顺序已保存');
      queryClient.invalidateQueries({ queryKey: ['plan-detail', planId] });
    },
    onError: (error: any) => {
      void message.error(error?.response?.data?.message ?? '志愿顺序保存失败');
      setLocalPlanItems(planItems); // 失败回滚
    },
  });

  // 同步 react-query 数据到本地 rail state (拖动持有本地, mutation 成功后 query 重拉同步回来)
  useEffect(() => {
    setLocalPlanItems(planItems);
  }, [plan?.id, planItems.length, planItems.map((it: any) => it.id).join(',')]);

  const handleRailDragEnd = () => {
    if (dragIdx == null || dragOverIdx == null || dragIdx === dragOverIdx) {
      setDragIdx(null);
      setDragOverIdx(null);
      return;
    }
    const next = [...localPlanItems];
    const [moved] = next.splice(dragIdx, 1);
    next.splice(dragOverIdx, 0, moved);
    setLocalPlanItems(next);
    reorderMutation.mutate(next.map((it: any) => it.id));
    setDragIdx(null);
    setDragOverIdx(null);
  };

  const batchOptions = useMemo(
    () =>
      batches.map((b) => {
        const existingPlan = findPlanForBatch(existingPlans, b.batchConfigId);
        const suffix = existingPlan ? ` · 已有V${existingPlan.versionNo ?? 1}` : '';
        return { label: `${b.batchName}（${b.maxGroupCount}组）${suffix}`, value: b.batchConfigId };
      }),
    [batches, existingPlans],
  );

  const openPlan = (nextPlan: WorkbenchPlan) => {
    setPlanId(nextPlan.id);
    setBatchConfigId(nextPlan.batchConfigId ?? undefined);
  };

  const openOrCreatePlan = () => {
    if (!batchConfigId) return;
    if (selectedBatchPlan) {
      openPlan(selectedBatchPlan);
      void message.success('已打开已有方案');
      return;
    }
    createMutation.mutate();
  };

  const toggleGroup = (key: string) => {
    setExpandedGroupKeys((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
    );
  };

  const addCandidateGroup = (group: CandidateGroup, major: CandidateMajor) => {
    if (isCandidateGroupAlreadyAdded(group, planItems)) {
      void message.warning('该专业组已经在当前方案中');
      return;
    }
    const selection = getMajorGroupSelectionPayload(group, {
      preferredMajors: student?.preferredMajors ?? [],
      preferredMajorCategories: student?.preferredMajorCategories ?? [],
    });
    const anchorMajor = group.majors.find((item) => item.enrollmentPlanId === selection.selectedMajors[0]?.enrollmentPlanId) ?? major;
    if (!selection.selectedMajors.length) {
      void message.warning('该专业组暂无可带入专业');
      return;
    }
    const selectedIds = new Set(selection.selectedMajors.map((item) => item.enrollmentPlanId));
    const softFailReasons = group.majors
      .filter((item) => selectedIds.has(item.enrollmentPlanId))
      .flatMap((item) => item.failReasons ?? []);

    Modal.confirm({
      title: '确认加入专业组',
      content: (
        <div className="space-y-3">
          <Alert
            type="info"
            showIcon
            message="将按服从调剂口径补满专业"
            description="系统只新增一条院校专业组志愿，并保存下面的专业填写顺序。"
          />
          <div className="space-y-2">
            {selection.selectedMajors.map((item) => (
              <div key={item.enrollmentPlanId} className="flex items-center justify-between gap-3 rounded-md bg-gray-50 px-3 py-2 text-sm">
                <span className="min-w-0 truncate">{item.order}. {item.majorName}</span>
                <Tag color={item.displaySection === 'RISK' ? 'warning' : item.displaySection === 'BACKUP' ? 'default' : 'success'}>
                  {selectedMajorSectionLabel(item.displaySection)}
                </Tag>
              </div>
            ))}
          </div>
          <div className="text-xs text-text-tertiary">服从调剂：是。少于等于 6 个专业时全部带入，超过 6 个时优先学生意向专业。</div>
        </div>
      ),
      okText: '确认加入',
      cancelText: '取消',
      onOk: () => addMutation.mutate({
        group,
        major: anchorMajor,
        selectedMajors: selection.selectedMajors,
        candidateMajorRanking: selection.candidateMajorRanking,
        softFailReasons,
      }),
    });
  };

  const majorColumns = (group: CandidateGroup): ColumnsType<CandidateMajor> => [
    {
      title: '专业名称',
      key: 'major',
      render: (_, major) => (
        <button
          type="button"
          className="text-left text-primary hover:text-primary-light"
          onClick={() => setActiveDetail({ group, major })}
        >
          <span className="font-medium">{major.majorName}</span>
          {major.majorCode ? <span className="ml-2 font-mono text-xs text-text-tertiary">{major.majorCode}</span> : null}
          {major.isRecommendedAnchor ? <Tag color="gold" className="ml-2">推荐锚定</Tag> : null}
          {major.displaySection ? <Tag color={major.displaySection === 'RISK' ? 'warning' : major.displaySection === 'BACKUP' ? 'default' : 'success'} className="ml-2">{MAJOR_SECTION_LABEL[major.displaySection]}</Tag> : null}
          {major.planNotes ? <span className="ml-2 inline-block"><NotesChip notes={major.planNotes} /></span> : null}
          {major.displayReason ? <div className="mt-1 text-xs text-text-tertiary">{major.displayReason}</div> : null}
        </button>
      ),
    },
    {
      title: '最低分 / 位次',
      width: 150,
      render: (_, major) => <span>{formatScoreRankValue(major.majorMinScore, major.majorMinRank)}</span>,
    },
    {
      title: '招生计划',
      dataIndex: 'planCount',
      width: 90,
      render: (value) => formatValue(value, '人'),
    },
    {
      title: '学制 / 学费',
      width: 130,
      render: (_, major) => (
        <div className="text-sm">
          <div>{major.standardDuration || major.duration || '-'}</div>
          <div className="text-xs text-text-tertiary">{formatTuition(major.tuition)}</div>
        </div>
      ),
    },
    {
      title: '匹配状态',
      width: 100,
      render: (_, major) => major.matchStatus === 'SOFT_FAIL'
        ? <Tag icon={<WarningOutlined />} color="warning">有风险</Tag>
        : <Tag color="success">可选</Tag>,
    },
    {
      title: '梯度',
      width: 90,
      render: (_, major) => (
        <Space size={4} wrap>
          <Tag color={GRADIENT_COLOR[gradientTier(major)]}>{GRADIENT_LABEL[gradientTier(major)]}</Tag>
        </Space>
      ),
    },
    {
      title: '操作',
      width: 160,
      render: (_, major) => {
        const added = isCandidateGroupAlreadyAdded(group, planItems);
        return (
          <Space size={6}>
            <Button size="small" onClick={() => setActiveDetail({ group, major })}>详情</Button>
            <Button
              size="small"
              type="primary"
              icon={<PlusOutlined />}
              disabled={added}
              loading={addMutation.isPending}
              onClick={() => addCandidateGroup(group, major)}
            >
              {added ? '已加入' : '加入'}
            </Button>
          </Space>
        );
      },
    },
  ];

  if (studentLoading) {
    return <div className="py-24 text-center"><Spin size="large" /></div>;
  }

  // pgv2 设计稿: 顶部 eyebrow / facts / pool / toolbar / tier-bar / source-note / rail / compare-bar / drawer
  const currentSortLabel = CANDIDATE_SORT_OPTIONS.find((item) => item.value === candidateSort)?.label ?? '综合推荐';
  const intakeReady = student?.intakeStatus === 'VERIFIED';
  return (
    <div className="view-transition pgv2-page">
      {/* —— Region 1: pgv2-top 返回 + eyebrow + 标题 + 学生 + 批次 + 操作 —— */}
      <div className="pgv2-top">
        <div className="pgv2-top-l">
          <button
            type="button"
            className="pgv2-back"
            onClick={() => router.push(`/teacher/students/${studentId}`)}
          >
            <ArrowLeftOutlined /> 返回学生详情
          </button>
          <div>
            <div className="pgv2-eyebrow">PLAN BUILDER</div>
            <h1 className="pgv2-title">生成方案工作台</h1>
            <div className="pgv2-sub">
              学生:<strong>{getStudentName(student)}</strong>
              <span className="dot" />
              <span>当前方案按后端候选池实时计算</span>
            </div>
          </div>
        </div>
        <div className="pgv2-top-r">
          <div className="pgv2-batch">
            <label>批次</label>
            <Select
              placeholder="请选择批次..."
              value={batchConfigId}
              loading={batchLoading}
              options={batchOptions}
              onChange={setBatchConfigId}
              style={{ minWidth: 220 }}
            />
          </div>
          <Button
            type="primary"
            disabled={!batchConfigId || !intakeReady}
            onClick={openOrCreatePlan}
            icon={selectedBatchPlan ? <FileTextOutlined /> : <PlusOutlined />}
          >
            {selectedBatchPlan ? '打开已有方案' : '创建方案草稿'}
          </Button>
          {planId ? (
            <>
              <Button onClick={() => router.push(`/teacher/plans/${planId}`)} icon={<FileTextOutlined />}>
                查看详情
              </Button>
              <Button
                disabled={plan?.status !== 'DRAFT' || !planItems.length}
                onClick={() => submitMutation.mutate()}
                icon={<SendOutlined />}
              >
                提交审核
              </Button>
            </>
          ) : null}
          <Button onClick={() => setAlgoDrawerOpen(true)} icon={<InfoCircleOutlined />}>
            算法路径
          </Button>
        </div>
      </div>

      {/* —— 资料未确认 Alert (pgv2 设计稿风格) —— */}
      {!intakeReady ? (
        <div className="pgv2-alert tone-warn fade-up">
          <span className="ic"><WarningOutlined /></span>
          <div>
            <strong>学生资料尚未确认</strong>
            ,当前状态为「{formatLabel(student?.intakeStatus || 'DRAFT', INTAKE_STATUS_LABEL)}」。
            需要先在学生详情页完成资料审核,才能进入下一步生成方案。
          </div>
        </div>
      ) : null}

      {/* —— 档案位次 / 一分一段 mismatch Alert —— */}
      {isUsingScoreBasedRank ? (
        <div className="pgv2-alert tone-info fade-up">
          <span className="ic"><InfoCircleOutlined /></span>
          <div>
            档案位次 <strong>{candidateGroups?.storedRank?.toLocaleString()}</strong> 与
            高考分 <strong>{student?.totalScore}</strong> 明显不匹配。候选排序已按 {candidateGroups?.sourceYear ?? '当前'} 年一分一段估算位次
            <strong> {candidateGroups?.scoreBasedRank?.toLocaleString()}</strong> 计算。
          </div>
        </div>
      ) : null}

      {/* —— Region 2: pgv2-profile 学生 Profile 可折叠 (5 facts + 三栏 + 已有方案) —— */}
      <div className="pgv2-profile fade-up">
        <button
          type="button"
          className="pgv2-profile-head"
          onClick={() => setProfileOpen((o) => !o)}
        >
          <h3>
            <span className="ic"><FileTextOutlined /></span>
            学生 Profile
            <span className="muted">5 关键指标 + 科目结构 + 意向信息 + 排除红线</span>
          </h3>
          <span className={`pgv2-chev ${profileOpen ? 'is-open' : ''}`}><RightOutlined /></span>
        </button>
        {profileOpen ? (
          <>
            {/* —— Region: pgv2-facts 5 紧凑横排 —— */}
            <div className="pgv2-facts">
              <Fact
                k="总分"
                v={formatScoreValue(student?.totalScore)}
                sub={scoreRankNote || '高考实考'}
              />
              <Fact
                k="档案位次"
                v={formatRankValue(student?.provincialRank)}
                sub="学生档案记录"
              />
              <Fact
                k="排序位次"
                v={formatRankValue(studentRankForDecision)}
                sub={isUsingScoreBasedRank ? '已按一分一段修正' : '候选池计算口径'}
                tone="accent"
              />
              <Fact
                k="资料状态"
                v={
                  <span style={{ color: intakeReady ? 'var(--safe)' : 'var(--rush)' }}>
                    {formatLabel(student?.intakeStatus || 'DRAFT', INTAKE_STATUS_LABEL)}
                  </span>
                }
                sub={intakeReady ? '可生成方案' : '需先确认'}
              />
              <Fact
                k="选科组合"
                v={subjectCombination}
                sub={formatLabel(student?.examSource, EXAM_SOURCE_LABEL)}
              />
            </div>

            {/* —— 三栏 profile (科目结构 / 意向信息 / 排除红线) —— */}
            <div className="pgv2-profile-grid">
              <div className="pgv2-profile-col">
                <h5>科目结构</h5>
                <div className="pgv2-subj-grid">
                  {[
                    ['语文', student?.scoreChinese],
                    ['数学', student?.scoreMath],
                    ['英语', student?.scoreEnglish],
                    ['首选', student?.scoreFirstChoice],
                    ['再选一', student?.scoreSub1],
                    ['再选二', student?.scoreSub2],
                  ].map(([lbl, v]) => (
                    <div className="pgv2-subj" key={String(lbl)}>
                      <span className="lbl">{lbl}</span>
                      <span className="num">{v == null ? '—' : String(v)}</span>
                    </div>
                  ))}
                </div>
                <div className="pgv2-chips-row">
                  <span className="pgv2-chip-label">优势</span>
                  <div>{pgvChips(subjectHighlights.strengths, 'safe')}</div>
                </div>
                <div className="pgv2-chips-row">
                  <span className="pgv2-chip-label">短板</span>
                  <div>{pgvChips(subjectHighlights.weaknesses, 'rush')}</div>
                </div>
              </div>

              <div className="pgv2-profile-col">
                <h5>意向信息</h5>
                <ProfLine k="优先模式" v={<strong>{formatLabel(student?.priorityMode, PRIORITY_MODE_LABEL)}</strong>} />
                <ProfLine k="留省偏好" v={formatLabel(student?.stayPreference, STAY_PREFERENCE_LABEL)} />
                <ProfLine k="升学/职业" v={`${formatLabel(student?.careerPlan, CAREER_PLAN_LABEL)} · ${formatPlainText(student?.careerDirection)}`} />
                <ProfLine k="地域意向" v={pgvChips([...getArrayValues(student?.preferredProvinces), ...getArrayValues(student?.preferredCities)], 'primary')} />
                <ProfLine k="院校意向" v={pgvChips(student?.preferredUniversities, 'primary')} />
                <ProfLine k="专业意向" v={pgvChips([...getArrayValues(student?.preferredMajors), ...getArrayValues(student?.preferredMajorCategories)], 'safe')} />
                <ProfLine k="意向批次" v={pgvChips(student?.preferredBatches, 'accent')} />
              </div>

              <div className="pgv2-profile-col">
                <h5>排除与红线</h5>
                <ProfLine k="排除地域" v={pgvChips([...getArrayValues(student?.excludedProvinces), ...getArrayValues(student?.excludedCities)], 'rush')} />
                <ProfLine k="排除院校" v={pgvChips(student?.excludedUniversities, 'rush')} />
                <ProfLine k="排除专业" v={pgvChips([...getArrayValues(student?.excludedMajors), ...getArrayValues(student?.excludedMajorCategories)], 'rush')} />
                <ProfLine k="接受边界" v={pgvChips(riskPreferenceTags, 'accent')} />
                <ProfLine k="身体限制" v={pgvChips(physicalLimitTags, 'rush')} />
                <ProfLine k="其他要求" v={<strong>{formatPlainText(student?.otherRequirements)}</strong>} />
              </div>
            </div>

            {/* —— 已有方案 chips —— */}
            <div className="pgv2-existing-row">
              <span className="pgv2-existing-label">已有方案</span>
              {existingPlansLoading ? (
                <span className="pgv2-existing-empty">加载中...</span>
              ) : existingPlans.length === 0 ? (
                <span className="pgv2-existing-empty">暂无已创建方案</span>
              ) : (
                existingPlans.map((existingPlan) => {
                  const batchName = existingPlan.batchName ?? existingPlan.batch ?? `批次 ${existingPlan.batchConfigId ?? existingPlan.id}`;
                  const isActive = existingPlan.id === planId;
                  const isFinal = existingPlan.status === 'FINALIZED';
                  return (
                    <button
                      key={existingPlan.id}
                      type="button"
                      className={`pgv2-existing-chip ${isActive ? 'is-active' : ''}`}
                      onClick={() => openPlan(existingPlan)}
                    >
                      <span className="bch">{batchName}</span>
                      <span className="ver">V{existingPlan.versionNo ?? 1}</span>
                      <span className={`st st-${(existingPlan.status || 'draft').toLowerCase()}`}>{isFinal ? '终稿' : '草稿'}</span>
                    </button>
                  );
                })
              )}
            </div>
          </>
        ) : null}
      </div>

      {/* —— sticky bar (现有实现, 不在 9 区块改造范围) —— */}
      <div className={styles.stickyStudentBar} aria-label="学生关键信息常驻摘要">
        <div className={styles.stickyBarPrimary}>
          <div className={styles.stickyStudentIdentity}>
            <strong>{getStudentName(student)}</strong>
            <span>{selectedBatchName} · {plan ? `方案 ${plan.versionNo ? `V${plan.versionNo}` : ''} ${plan.status ?? '-'}` : '未打开方案'}</span>
          </div>
          <div className={styles.stickyStudentFacts}>
            <span><b>总分</b>{formatScoreValue(student?.totalScore)}</span>
            <span><b>位次</b>{formatRankValue(studentRankForDecision)}</span>
            <span><b>选科</b>{subjectCombination}</span>
          </div>
          <button
            type="button"
            className={styles.stickyBarToggle}
            aria-expanded={stickyBarExpanded}
            aria-controls="sticky-bar-secondary"
            onClick={() => setStickyBarExpanded((prev) => !prev)}
          >
            {stickyBarExpanded ? '收起' : '展开'}
            <DownOutlined rotate={stickyBarExpanded ? 180 : 0} />
          </button>
        </div>
        {stickyBarExpanded ? (
          <div className={styles.stickyBarSecondary} id="sticky-bar-secondary">
            <span><b>优势</b>{stickyStrengthSummary}</span>
            <span><b>短板</b>{stickyWeaknessSummary}</span>
            <span><b>意向</b>{preferredLocationSummary} / {preferredMajorSummary}</span>
            <span><b>排除</b>{excludedSummary}</span>
            <span><b>接受边界</b>{riskPreferenceTags.length ? riskPreferenceTags.join('、') : '未填写'}</span>
          </div>
        ) : null}
      </div>

      {planId ? (
        <>
          {/* —— 4 指标 strip —— */}
          <div className="pgv2-metric-strip fade-up">
            <div className="pgv2-metric">
              <span className="k">候选总量</span>
              <span className="v">{candidateGroups?.total ?? 0}</span>
              <span className="sub">专业组候选 · 已隐藏 {hiddenGroupKeys.size}</span>
            </div>
            <div className="pgv2-metric">
              <span className="k">排序位次</span>
              <span className="v">{formatRankValue(studentRankForDecision)}</span>
              <span className="sub">{isUsingScoreBasedRank ? '一分一段估算' : '档案位次'}</span>
            </div>
            <div className="pgv2-metric">
              <span className="k">方案年份</span>
              <span className="v">{candidateGroups?.planYear ?? '-'}</span>
              <span className="sub">招生计划口径</span>
            </div>
            <div className="pgv2-metric tone-accent">
              <span className="k">当前方案</span>
              <span className="v">{planItems.length}</span>
              <span className="sub">已加入志愿项</span>
            </div>
          </div>

          {/* —— 主区: 候选池 + 当前方案 —— */}
          <div className="pgv2-workbench">
            {/* —— Region 3: pgv2-pool 候选池 —— */}
            <section className="pgv2-pool">
              <div className="pgv2-pool-head">
                <div>
                  <h2>院校专业组候选池</h2>
                  <p>按后端候选结果展示专业组,排序参考位次、专业匹配、计划变化、竞争池、选科池和征集口径</p>
                </div>
              </div>

              {/* —— Region 4: pgv2-toolbar 搜索 + 排序 + 显示已隐藏 —— */}
              <div className="pgv2-toolbar">
                <UniversitySearchAutoComplete
                  value={searchTextUniversity}
                  onChange={setSearchTextUniversity}
                  onCommit={setKeywordUniversity}
                />
                <MajorSearchAutoComplete
                  value={searchTextMajor}
                  onChange={setSearchTextMajor}
                  onCommit={setKeywordMajor}
                />
                <select
                  className="pgv2-sort"
                  value={candidateSort}
                  onChange={(event) => setCandidateSort(event.target.value as CandidateGroupSort)}
                >
                  {CANDIDATE_SORT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>排序:{o.label}</option>
                  ))}
                </select>
                <label className="pgv2-toggle">
                  <input
                    type="checkbox"
                    checked={showHidden}
                    onChange={(event) => setShowHidden(event.target.checked)}
                  />
                  显示已隐藏 ({hiddenGroupKeys.size})
                </label>
                <label
                  className="pgv2-toggle"
                  title="勾选: 显示学费超预算 / 民办性质不符等可权衡的专业 (进风险区);不勾: 这些专业直接从候选隐藏。学生性别/健康/户籍/民族不符的专业总是被剔除(不进候选)"
                >
                  <input
                    type="checkbox"
                    checked={includeSoftFails}
                    onChange={(event) => setIncludeSoftFails(event.target.checked)}
                  />
                  显示学费/办学性质不符
                </label>
                <label className="pgv2-toggle">
                  <input
                    type="checkbox"
                    checked={!excludeAdded}
                    onChange={(event) => setExcludeAdded(!event.target.checked)}
                  />
                  显示已填报院校专业组
                </label>
              </div>

              {/* —— 意向梯队过滤 chip (每个 chip 带粗略命中数) —— */}
              {((candidateGroups as any)?.availableTiers ?? []).length > 0 ? (
                <div className="pgv2-tier-bar" style={{ marginTop: 4 }}>
                  <span style={{ color: '#666', fontSize: 12, marginRight: 6 }}>意向梯队</span>
                  <button
                    type="button"
                    className={`pgv2-tier-chip ${appliedTier === 0 ? 'is-active' : ''}`}
                    onClick={() => setAppliedTier(0)}
                  >
                    全部
                  </button>
                  {((candidateGroups as any).availableTiers as Array<{tier: number; majors: string[]; groupCount: number}>).map((t) => {
                    const head = t.majors[0] ?? '(空)';
                    const more = t.majors.length > 1 ? ` +${t.majors.length - 1}` : '';
                    const empty = t.groupCount === 0;
                    return (
                      <button
                        key={t.tier}
                        type="button"
                        className={`pgv2-tier-chip ${appliedTier === t.tier ? 'is-active' : ''}`}
                        onClick={() => setAppliedTier(t.tier)}
                        title={`${t.majors.join('、')} — 本批次候选 ${t.groupCount} 组`}
                        style={empty ? { opacity: 0.55 } : undefined}
                      >
                        梯队{t.tier}: {head}{more} <span style={{ color: empty ? '#bfbfbf' : '#666', fontWeight: 400 }}>({t.groupCount})</span>
                      </button>
                    );
                  })}
                </div>
              ) : null}

              {/* —— Region 5: pgv2-tier-bar 8 段梯度过滤 chip —— */}
              <div className="pgv2-tier-bar">
                {GRADIENT_FILTER_OPTIONS.map((o) => {
                  const baseGroups = groups.filter((g) => showHidden || !hiddenGroupKeys.has(g.groupKey));
                  const n = o.tones
                    ? baseGroups.filter((g) => o.tones!.includes(gradientTier(g))).length
                    : baseGroups.length;
                  return (
                    <button
                      key={o.value}
                      type="button"
                      className={`pgv2-tier-chip ${gradientFilter === o.value ? 'is-active' : ''}`}
                      onClick={() => setGradientFilter(o.value)}
                    >
                      {o.label} <span className="n">{n}</span>
                    </button>
                  );
                })}
                <span className="pgv2-tier-sep" aria-hidden="true" />
                <span className="pgv2-density-note">
                  当前展示 <strong>{visibleGroups.length}</strong> 个候选, 按
                  <strong> {currentSortLabel}</strong> 排序
                </span>
              </div>

              {/* —— Region 6: pgv2-source-note 计划口径回退提示 —— */}
              {isUsingFallbackYear ? (
                <div className="pgv2-source-note">
                  <InfoCircleOutlined />
                  当前候选池参考 <strong>{candidateGroups!.sourceYear}</strong> 年招生计划,
                  方案年份为 <strong>{candidateGroups!.planYear}</strong>。人数变化按
                  <strong> {candidateGroups!.previousYear ?? (candidateGroups!.sourceYear! - 1)}</strong> 年对比。
                </div>
              ) : null}

              {/* —— 候选卡片列表 —— */}
              {groupLoading ? (
                <div className="py-16 text-center">
                  <Spin size="large" />
                  <div className="mt-4 text-sm font-medium text-text">正在计算候选专业组</div>
                  <div className="mt-1 text-xs text-text-tertiary">系统正在综合位次、计划变化、竞争人数、选科池和征集数据</div>
                </div>
              ) : visibleGroups.length === 0 ? (
                <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                  {(() => {
                    // 优先告诉老师"当前梯队没候选, 别的梯队有"
                    const tiers = ((candidateGroups as any)?.availableTiers ?? []) as Array<{tier: number; majors: string[]; groupCount: number}>;
                    const current = tiers.find((t) => t.tier === appliedTier);
                    const hasOther = tiers.some((t) => t.tier !== appliedTier && t.groupCount > 0);
                    if (appliedTier > 0 && current && current.groupCount === 0) {
                      return (
                        <>
                          <div>梯队{appliedTier}「{current.majors.join('、')}」在<strong>{plan?.batchName ?? '本批次'}</strong>{candidateGroups?.sourceYear ? `（${candidateGroups.sourceYear}年）` : ''}没有招生院校</div>
                          <div style={{ marginTop: 8, fontSize: 12 }}>
                            {hasOther
                              ? '上方 chip 旁的数字是各梯队的候选数。点 [全部] 或有数字的梯队查看候选'
                              : '所有梯队在本批次都无候选。可考虑切换批次或调整意向'}
                          </div>
                        </>
                      );
                    }
                    if (keyword || keywordUniversity || keywordMajor) {
                      const parts: string[] = [];
                      if (keywordUniversity) parts.push(`院校「${keywordUniversity}」`);
                      if (keywordMajor) parts.push(`专业「${keywordMajor}」`);
                      if (!parts.length && keyword) parts.push(`「${keyword}」`);
                      // 当前选了具体梯队时, 搜索可能被 tier 排除 — 提示切到「全部」
                      const hint = appliedTier > 0
                        ? '试试点上方 [全部] 梯队 chip,该院校 / 专业可能不在当前梯队的招生计划里'
                        : '可能该院校 / 专业不在本批次 (' + (plan?.batchName ?? '当前批次') + ') + 选科范围内,或换个词试试';
                      return (
                        <>
                          {parts.join(' + ')} 没匹到候选
                          <div style={{ marginTop: 8, fontSize: 12 }}>{hint}</div>
                        </>
                      );
                    }
                    // tier > 0 + groupCount > 0 + visible = 0: 说明被前端 8 段梯度 chip 或已隐藏过滤掉了
                    if (appliedTier > 0 && current && current.groupCount > 0) {
                      return (
                        <>
                          梯队{appliedTier} 有 {current.groupCount} 个候选,但被当前梯度筛选 / 已隐藏过滤掉
                          <div style={{ marginTop: 8, fontSize: 12 }}>试试点上方[全部]梯度 chip 或勾「显示已隐藏」</div>
                        </>
                      );
                    }
                    if (excludeAdded) {
                      return (
                        <>
                          剩余候选都已加入方案
                          <div style={{ marginTop: 8, fontSize: 12 }}>勾选「显示已填报院校专业组」可查看已加入的</div>
                        </>
                      );
                    }
                    return <>没有符合条件的候选 · 试试切换梯度或清空关键词</>;
                  })()}
                </div>
              ) : (
                <>
                  <div className="pgv2-cards">
                    {visibleGroups.map((group) => {
                      if (hiddenGroupKeys.has(group.groupKey)) {
                        return (
                          <HiddenCard
                            key={group.groupKey}
                            universityName={group.universityName}
                            meta={`${GRADIENT_LABEL[gradientTier(group)]}${group.university?.softRanking ? ' · 软科 #' + group.university.softRanking : ''}${group.university?.city ? ' · ' + group.university.city : ''}`}
                            onRestore={() => restoreGroup(group.groupKey)}
                          />
                        );
                      }
                      const expanded = expandedGroupKeys.includes(group.groupKey);
                      const added = isCandidateGroupAlreadyAdded(group, planItems);
                      const anchor = getAnchorMajor(group);
                      const adjustedRank = getAdjustedRank(group, anchor);
                      const majorSections = getMajorSections(group);
                      return (
                        <CandidateCardV3
                          key={group.groupKey}
                          group={group}
                          isExpanded={expanded}
                          isHidden={false}
                          isCompare={compareSet.has(group.groupKey)}
                          isAdded={added}
                          studentRankForDecision={studentRankForDecision}
                          adjustedRank={adjustedRank}
                          expandedTab={(groupExpandTabs[group.groupKey] ?? 'majors') as 'majors' | 'evidence' | 'school'}
                          onToggleExpand={() => toggleGroup(group.groupKey)}
                          onToggleCompare={() => toggleCompare(group.groupKey)}
                          onHide={() => hideGroup(group.groupKey)}
                          onRestore={() => restoreGroup(group.groupKey)}
                          onAdd={() => anchor && addCandidateGroup(group, anchor)}
                          onTabChange={(tab) => setGroupExpandTab(group.groupKey, tab)}
                          renderExpandedContent={(tab) => {
                            if (tab === 'majors') {
                              // 全 RISK 组的位次差预警: 让老师一眼看到学生位次 vs 历史最低位次的差距
                              const allRiskBanner = group.allRisk ? (() => {
                                const stu = studentRankForDecision;
                                const tierHit = group.majors.find((m: any) => m.matchesPreferredTier) ?? group.majors[0];
                                const histRank = tierHit?.majorMinRank;
                                const histScore = tierHit?.majorMinScore;
                                const ratio = stu && histRank ? Math.round((stu / histRank) * 10) / 10 : null;
                                return (
                                  <div style={{
                                    margin: '8px 0',
                                    padding: '10px 12px',
                                    background: '#fff1f0',
                                    border: '1px solid #ffa39e',
                                    borderRadius: 6,
                                    fontSize: 13,
                                    lineHeight: 1.6,
                                  }}>
                                    <div style={{ fontWeight: 600, color: '#cf1322', marginBottom: 4 }}>
                                      ⚠ 位次差距过大,该梯队意向专业本批次无可推荐候选
                                    </div>
                                    <div style={{ color: '#595959' }}>
                                      学生位次 <strong>{stu?.toLocaleString() ?? '—'}</strong>
                                      {tierHit ? (
                                        <>
                                          {' '}vs {tierHit.majorName} 历史最低{' '}
                                          <strong>{histScore ?? '—'}分 / 位次 {histRank?.toLocaleString() ?? '—'}</strong>
                                          {ratio ? <span style={{ marginLeft: 6, color: '#cf1322' }}>(学生位次约为 {ratio} 倍)</span> : null}
                                        </>
                                      ) : null}
                                    </div>
                                    <div style={{ color: '#8c8c8c', fontSize: 12, marginTop: 4 }}>
                                      下方为该专业组详细录取数据,可参考。如需加入请先与学生沟通调整意向。
                                    </div>
                                  </div>
                                );
                              })() : null;
                              return (
                                <>
                                  {allRiskBanner}
                                  <CandidateMajorSection title="推荐填写" section="RECOMMENDED" majors={majorSections.recommended} group={group} onAdd={addCandidateGroup} />
                                  <CandidateMajorSection title="可备选" section="BACKUP" majors={majorSections.backup} group={group} onAdd={addCandidateGroup} />
                                  <CandidateMajorSection title="风险/不建议" section="RISK" majors={majorSections.risk} group={group} onAdd={addCandidateGroup} />
                                </>
                              );
                            }
                            if (tab === 'evidence') {
                              return (
                                <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                                  {riskReviewItems(group, anchor, studentRankForDecision).map((it: any, i: number) => (
                                    <EvidenceItem key={i} label={it.title}>{it.content}</EvidenceItem>
                                  ))}
                                </div>
                              );
                            }
                            if (tab === 'school') {
                              return (
                                <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}><UniversityBadges group={group} /></div>
                                  <div>软科排名: {group.university?.softRanking ?? '—'}</div>
                                  <div>办学性质: {group.university?.runningNature ?? '—'}</div>
                                  <div>院校所在地: {group.university?.province ?? '—'} {group.university?.city ?? ''}</div>
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                      );
                    })}
                  </div>
                  {candidateGroups && candidateGroups.total > candidatePageSize ? (
                    <div className="flex justify-end pt-1">
                      <Pagination
                        size="small"
                        current={candidatePage}
                        pageSize={candidatePageSize}
                        total={candidateGroups.total}
                        showSizeChanger={false}
                        showTotal={(total) => `共 ${total} 个专业组`}
                        onChange={setCandidatePage}
                      />
                    </div>
                  ) : null}
                </>
              )}
            </section>

            {/* —— Region 7: pgv2-rail 右侧 sticky 当前方案 (最大重写) —— */}
            <aside className="pgv2-rail">
              <div className="pgv2-rail-card">
                <h3>
                  <span className="ic"><FileTextOutlined /></span>
                  当前方案
                  {selectedBatchPlan ? (
                    <span className="pgv2-tag tone-accent">V{selectedBatchPlan.versionNo ?? 1}</span>
                  ) : null}
                  {planFetching ? <Spin size="small" style={{ marginLeft: 'auto' }} /> : null}
                </h3>

                {/* 三梯度 + 总数 统计 */}
                <div className="pgv2-rail-stats">
                  <div className="rs">
                    <span className="lbl">冲档</span>
                    <span className="num rush">{tierStats.rush}</span>
                  </div>
                  <div className="rs">
                    <span className="lbl">稳档</span>
                    <span className="num accent">{tierStats.stable}</span>
                  </div>
                  <div className="rs">
                    <span className="lbl">保底</span>
                    <span className={`num ${tierStats.safe < 4 ? 'rush' : 'safe'}`}>{tierStats.safe}</span>
                  </div>
                  <div className="rs total">
                    <span className="lbl">总数</span>
                    <span className="num">{planItems.length} / 45</span>
                  </div>
                </div>

                {/* 已选志愿列表 (HTML5 drag-and-drop 排序, onDragEnd 调 reorderItems 持久化) */}
                <div className="pgv2-rail-list">
                  {localPlanItems.length === 0 ? (
                    <div style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                      从左侧专业组加入志愿项
                    </div>
                  ) : (
                    localPlanItems.map((item: any, pi: number) => {
                      const g = item.gradient ?? item.suggestedGradient ?? 'WEN';
                      const tone = g === 'CHONG' ? 'rush' : g === 'WEN' ? 'stable' : 'safe';
                      const tierLabel = g === 'CHONG' ? '冲' : g === 'WEN' ? '稳' : '保';
                      const idx = pi + 1;
                      const isOpen = expandedRailItemId === item.id;
                      const isDragging = dragIdx === pi;
                      const isOver = dragOverIdx === pi && dragIdx !== pi;
                      const canDrag = plan?.status === 'DRAFT' && !reorderMutation.isPending;
                      return (
                        <div
                          className={`pgv2-rail-item-wrap ${isOpen ? 'is-open' : ''} ${isDragging ? 'dragging' : ''} ${isOver ? 'drag-over' : ''}`}
                          key={item.id ?? pi}
                          draggable={canDrag}
                          onDragStart={(e) => {
                            if (!canDrag) return;
                            setDragIdx(pi);
                            e.dataTransfer.effectAllowed = 'move';
                          }}
                          onDragOver={(e) => {
                            if (!canDrag) return;
                            e.preventDefault();
                            setDragOverIdx(pi);
                          }}
                          onDragEnd={handleRailDragEnd}
                        >
                          <div
                            className="pgv2-rail-item"
                            onClick={() => setExpandedRailItemId(isOpen ? null : item.id)}
                          >
                            <span className="rail-grip" title={canDrag ? '拖动调整顺位' : '草稿状态下可拖动'}>⋮⋮</span>
                            <span className="idx">{String(idx).padStart(2, '0')}</span>
                            <span className={`pgv2-tier-tag tone-${tone}`}>{tierLabel}</span>
                            <span className="meta">
                              <span className="uni">{item.universityName}</span>
                              <span className="grp">
                                {item.groupCode ? `[${item.groupCode}] ` : ''}
                                {item.recommendedOrder ?? item.majorName ?? ''}
                              </span>
                            </span>
                            {plan?.status === 'DRAFT' ? (
                              <button
                                type="button"
                                className="pgv2-rail-del"
                                disabled={removeMutation.isPending}
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); removeMutation.mutate(item.id); }}
                                aria-label="移除"
                              >
                                <DeleteOutlined />
                              </button>
                            ) : null}
                          </div>
                          {isOpen ? (
                          <div style={{ padding: '8px 12px 12px' }}>
                            <PlanMajorSelectionEditor
                              item={item}
                              status={plan?.status}
                              editable={plan?.status === 'DRAFT' || plan?.status === 'PENDING_REVIEW'}
                              saving={updateMajorSelectionMutation.isPending}
                              onSave={(payload) => updateMajorSelectionMutation.mutate({
                                itemId: item.id,
                                ...payload,
                              })}
                            />
                          </div>
                          ) : null}
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="pgv2-rail-tip">
                  <strong>服从调剂规则:</strong>
                  少于等于 6 个专业时全部带入,超过 6 个时优先学生意向专业
                </div>

                <div className="pgv2-hints">
                  <h4>下一步建议</h4>
                  <div className="pgv2-hint tone-accent">
                    <span className="ic"><InfoCircleOutlined /></span>
                    <span>优先补足稳 / 稳保,要求学生位次覆盖修正位次。</span>
                  </div>
                  <div className="pgv2-hint tone-rush">
                    <span className="ic"><WarningOutlined /></span>
                    <span>极冲只做备选,不占正式推荐名额。</span>
                  </div>
                  <div className="pgv2-hint tone-safe">
                    <span className="ic"><CheckOutlined /></span>
                    <span>软性风险专业先复核限制,再加入方案。</span>
                  </div>
                  <Button
                    type="primary"
                    block
                    style={{ marginTop: 12 }}
                    disabled={plan?.status !== 'DRAFT' || !planItems.length || submitMutation.isPending}
                    onClick={() => submitMutation.mutate()}
                    icon={<CheckOutlined />}
                  >
                    提交主管审核
                  </Button>
                </div>
              </div>
            </aside>
          </div>
        </>
      ) : null}

      {/* —— 专业组复核 Drawer (保留现有 antd Drawer 实现) —— */}
      <Drawer
        width={880}
        rootClassName={styles.drawerRoot}
        title={activeDetail ? (
          <div>
            <div className={styles.drawerTitle}>
              <h2>{activeDetail.group.universityName}</h2>
              <span className={tagClass(gradientTone(gradientTier(activeDetail.group)))}>{GRADIENT_LABEL[gradientTier(activeDetail.group)]}</span>
              {isCandidateGroupAlreadyAdded(activeDetail.group, planItems) ? <span className={tagClass('muted')}>已在方案</span> : null}
            </div>
            <div className={styles.drawerMeta}>
              <span>{formatCandidateGroup(activeDetail.group)}</span>
              {activeDetail.group.subjects ? ` · ${activeDetail.group.subjects}` : ''}
              {activeDetail.group.university?.city ? ` · ${activeDetail.group.university.city}` : ''}
            </div>
          </div>
        ) : '专业组复核'}
        open={!!activeDetail}
        onClose={() => setActiveDetail(null)}
        extra={activeDetail ? (
          <button
            type="button"
            className={cx(styles.btn, styles.btnSmall, styles.btnPrimary)}
            disabled={isCandidateGroupAlreadyAdded(activeDetail.group, planItems)}
            onClick={() => addCandidateGroup(activeDetail.group, activeDetail.major)}
          >
            <PlusOutlined />
            {getAddActionLabel(activeDetail.group, activeDetail.major, isCandidateGroupAlreadyAdded(activeDetail.group, planItems))}
          </button>
        ) : null}
        footer={activeDetail ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-sm text-text-tertiary">复核位次、招生计划和软性限制后再加入方案。</span>
            <div className={styles.footActions}>
              <button type="button" className={styles.btn} onClick={() => setActiveDetail(null)}>关闭</button>
              <button
                type="button"
                className={cx(styles.btn, styles.btnPrimary)}
                disabled={isCandidateGroupAlreadyAdded(activeDetail.group, planItems)}
                onClick={() => addCandidateGroup(activeDetail.group, activeDetail.major)}
              >
                <PlusOutlined />
                {getAddActionLabel(activeDetail.group, activeDetail.major, isCandidateGroupAlreadyAdded(activeDetail.group, planItems))}
              </button>
            </div>
          </div>
        ) : null}
      >
        {activeDetail ? (
          <div>
            <section className={styles.decisionSummary}>
              <div className={styles.decisionGrid}>
                <div className={styles.decisionCell}><div className={styles.label}>Anchor</div><div className={styles.value}>{activeDetail.major.majorName}</div></div>
                <div className={styles.decisionCell}><div className={styles.label}>Student Rank</div><div className={styles.value}><span className={styles.rank}>{formatRankValue(studentRankForDecision)}</span><span className={styles.score}>{formatScoreValue(studentScoreForDecision)}</span></div></div>
                <div className={styles.decisionCell}><div className={styles.label}>Group Min</div><div className={styles.value}><span className={styles.rank}>{formatRankValue(activeDetail.group.groupMinRank)}</span><span className={styles.score}>{formatScoreValue(activeDetail.group.groupMinScore)}</span></div></div>
                <div className={styles.decisionCell}><div className={styles.label}>Major Min</div><div className={styles.value}><span className={styles.rank}>{formatRankValue(activeDetail.major.majorMinRank)}</span><span className={styles.score}>{formatScoreValue(activeDetail.major.majorMinScore)}</span></div></div>
                <div className={styles.decisionCell}><div className={styles.label}>Adjusted Rank</div><div className={styles.value}><span className={styles.rank}>{formatRankValue(getAdjustedRank(activeDetail.group, activeDetail.major))}</span><span className={styles.score}>dynamicGradient.adjustedMinRank</span></div></div>
                <div className={styles.decisionCell}><div className={styles.label}>Judgement</div><div className={styles.value}>{getDecisionText(activeDetail.group, activeDetail.major, studentRankForDecision)}</div></div>
              </div>
            </section>

            <section className={styles.drawerSection}>
              <h3>专业列表</h3>
              <Table
                className={styles.drawerTable}
                rowKey="enrollmentPlanId"
                size="small"
                columns={majorColumns(activeDetail.group)}
                dataSource={activeDetail.group.majors}
                pagination={false}
                scroll={{ x: 900 }}
              />
            </section>

            <section className={styles.drawerSection}>
              <h3>风险复核</h3>
              <div className={styles.riskReview}>
                {riskReviewItems(activeDetail.group, activeDetail.major, studentRankForDecision).map((item) => (
                  <div
                    key={item.title}
                    className={cx(
                      styles.riskItem,
                      item.tone === 'danger' && styles.riskDanger,
                      item.tone === 'warn' && styles.riskWarn,
                      item.tone === 'ok' && styles.riskOk,
                    )}
                  >
                    <b>{item.title}</b>
                    <div>{item.content}</div>
                  </div>
                ))}
              </div>
            </section>

            <section className={styles.drawerSection}>
              <h3>历史数据</h3>
              <Table
                className={styles.drawerTable}
                size="small"
                pagination={false}
                rowKey="year"
                dataSource={[
                  {
                    year: activeDetail.group.currentPlanYear ?? '当前',
                    score: activeDetail.major.majorMinScore,
                    rank: activeDetail.major.majorMinRank,
                    count: activeDetail.major.majorAdmissionCount,
                    source: '专业录取',
                  },
                  {
                    year: activeDetail.group.previousPlanYear ?? '上一年',
                    score: activeDetail.major.previousMajorMinScore,
                    rank: activeDetail.major.previousMajorMinRank,
                    count: activeDetail.major.previousMajorAdmissionCount,
                    source: '历史专业',
                  },
                ]}
                columns={[
                  { title: '年份', dataIndex: 'year', width: 90 },
                  { title: '最低分', dataIndex: 'score', render: (value) => value ?? '-' },
                  { title: '最低位次', dataIndex: 'rank', render: (value) => formatRankValue(value) },
                  { title: '录取人数', dataIndex: 'count', render: (value) => value ?? '-' },
                  { title: '数据来源', dataIndex: 'source' },
                ]}
              />
              {activeDetail.major.planNotes ? (
                <Alert className="mt-3" type="info" showIcon message="招生备注" description={activeDetail.major.planNotes} />
              ) : null}
              {activeDetail.major.subjectRequirements ? (
                <Alert className="mt-3" type="warning" showIcon message="选科要求" description={activeDetail.major.subjectRequirements} />
              ) : null}
            </section>

            <section className={styles.drawerSection}>
              <h3>专业画像</h3>
              <Descriptions bordered size="small" column={2}>
                <Descriptions.Item label="专业代码">{activeDetail.major.majorCode || '-'}</Descriptions.Item>
                <Descriptions.Item label="门类">{activeDetail.major.majorCategory || '-'}</Descriptions.Item>
                <Descriptions.Item label="学科">{activeDetail.major.discipline || '-'}</Descriptions.Item>
                <Descriptions.Item label="评级">{activeDetail.major.softRating || activeDetail.major.disciplineEval || '-'}</Descriptions.Item>
                <Descriptions.Item label="学位">{activeDetail.major.degree || '-'}</Descriptions.Item>
                <Descriptions.Item label="学制">{activeDetail.major.standardDuration || activeDetail.major.duration || '-'}</Descriptions.Item>
                <Descriptions.Item label="学费">{formatTuition(activeDetail.major.tuition)}</Descriptions.Item>
                <Descriptions.Item label="招生计划">{formatValue(activeDetail.major.planCount, '人')}</Descriptions.Item>
                <Descriptions.Item label="就业率">{formatValue(activeDetail.major.employmentRate, '%')}</Descriptions.Item>
                <Descriptions.Item label="平均薪资">{formatValue(activeDetail.major.avgSalary, '元')}</Descriptions.Item>
              </Descriptions>
              <p className="mt-3 text-sm leading-relaxed text-text-tertiary">
                {activeDetail.major.description || '该专业暂无长文本介绍,当前优先展示已接入的招生计划、录取和就业升学数据。'}
              </p>
              <div className="mt-3 space-y-3">
                <div>
                  <div className="mb-1 text-xs text-text-faint">核心课程</div>
                  {renderTags(activeDetail.major.coreCourses, 'blue')}
                </div>
                <div>
                  <div className="mb-1 text-xs text-text-faint">就业方向</div>
                  {renderTags(activeDetail.major.careerDirections, 'green')}
                </div>
                <div>
                  <div className="mb-1 text-xs text-text-faint">升学方向</div>
                  {renderTags(activeDetail.major.postgraduateDirections, 'purple')}
                </div>
              </div>
            </section>
          </div>
        ) : null}
      </Drawer>

      {/* —— Region 8: pgv2-compare-bar 底部对比浮条 —— */}
      {compareSet.size > 0 ? (
        <div className="pgv2-compare-bar">
          <span className="ic">⚖</span>
          <span className="cnt">已选 <strong>{compareSet.size}</strong> / 4 个对比</span>
          <span className="names">
            {Array.from(compareSet)
              .map((key) => visibleGroups.find((g) => g.groupKey === key)?.universityName ?? '')
              .filter(Boolean)
              .join(' · ')}
          </span>
          <button type="button" className="ghost" onClick={() => setCompareSet(new Set())}>清除</button>
          <button
            type="button"
            className="primary"
            disabled={compareSet.size < 2}
            onClick={() => setCompareDrawerOpen(true)}
          >
            进入对比 →
          </button>
        </div>
      ) : null}

      {/* —— 对比 Drawer (保留 antd) —— */}
      <Drawer
        open={compareDrawerOpen}
        onClose={() => setCompareDrawerOpen(false)}
        title={<span>⚖ 候选对比({compareSet.size} 项)</span>}
        width={typeof window !== 'undefined' ? Math.min(1180, window.innerWidth * 0.92) : 1100}
        placement="right"
      >
        <ComparePanel
          groups={Array.from(compareSet)
            .map((key) => visibleGroups.find((g) => g.groupKey === key))
            .filter((g): g is NonNullable<typeof g> => Boolean(g))}
        />
      </Drawer>

      {/* —— Region 9: pgv2-drawer 算法路径 (复刻设计稿自定义 drawer) —— */}
      {algoDrawerOpen ? (
        <>
          <div className="pgv2-drawer-mask" onClick={() => setAlgoDrawerOpen(false)} />
          <div className="pgv2-drawer" role="dialog" aria-label="算法路径">
            <div className="pgv2-drawer-head">
              <div>
                <div className="pgv2-eyebrow">ALGORITHM PATH</div>
                <h2>候选池生成路径</h2>
                <div className="pgv2-sub">实时计算 · 透明可审计</div>
              </div>
              <button type="button" className="pgv2-drawer-close" onClick={() => setAlgoDrawerOpen(false)}>
                <CloseOutlined />
              </button>
            </div>

            <div className="pgv2-drawer-body">
              <div className="pgv2-drawer-sect">
                <h4>位次源</h4>
                <div className="pgv2-rank-source">
                  <div className={`rs-row ${!isUsingScoreBasedRank ? 'is-active' : ''}`}>
                    <span>档案位次</span>
                    <strong>{candidateGroups?.storedRank?.toLocaleString() ?? student?.provincialRank?.toLocaleString() ?? '—'}</strong>
                    <em>学生档案录入</em>
                  </div>
                  <div className={`rs-row ${isUsingScoreBasedRank ? 'is-active' : ''}`}>
                    <span>一分一段估算</span>
                    <strong>{candidateGroups?.scoreBasedRank?.toLocaleString() ?? '—'}</strong>
                    <em>{student?.totalScore ?? '—'} 分 · {candidateGroups?.sourceYear ?? '当前'} 年</em>
                  </div>
                </div>
                {isUsingScoreBasedRank ? (
                  <div className="pgv2-drawer-tip">
                    档案位次与分数明显不匹配,系统默认按 <strong>一分一段估算位次</strong> 计算候选池
                  </div>
                ) : null}
              </div>

              <div className="pgv2-drawer-sect">
                <h4>本次候选池生成步骤</h4>
                <ol className="pgv2-steps">
                  {[
                    `学生输入: 选科 ${subjectCombination} · 总分 ${student?.totalScore ?? '—'} · 位次 ${candidateGroups?.studentRankUsed?.toLocaleString() ?? '—'}`,
                    `批次设定: ${selectedBatchName ?? '未选批次'}`,
                    '硬过滤(选科+体检+生源地): 由后端硬过滤剔除不符合硬条件的院校组',
                    `软规则过滤(意向+加分等): 意向城市 ${preferredLocationSummary} · 意向专业 ${preferredMajorSummary}`,
                    `候选池规模: 共 ${candidateGroups?.total ?? 0} 个院校专业组(其中 ${groups.filter((g) => g.softFailCount > 0).length} 个软命中风险)`,
                    `当前已选: ${planItems.length} 个志愿项,${planItems.length > 0 ? '可继续添加 / 调整' : '尚未添加'}`,
                  ].map((s, i) => (
                    <li key={i}>
                      <span className="no">{String(i + 1).padStart(2, '0')}</span>
                      <span className="txt">{s}</span>
                    </li>
                  ))}
                </ol>
              </div>

              <div className="pgv2-drawer-sect">
                <h4>8 段动态梯度说明</h4>
                <div className="pgv2-grad-legend">
                  {(Object.keys(GRADIENT_LABEL) as DynamicGradientTier[]).map((k) => (
                    <div className="gl" key={k}>
                      <span className={`pgv2-tier-tag tone-${gradientTone(k)}`}>{GRADIENT_LABEL[k]}</span>
                      <span className="desc">{GRAD_DESC[k]}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pgv2-drawer-tip">
                <strong>免责提示:</strong> 算法基于历史录取数据 + 当年招生计划计算,实际录取可能受当年志愿填报情况影响。
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
