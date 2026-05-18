'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  Alert,
  Button,
  Descriptions,
  Drawer,
  Empty,
  Input,
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
  DeleteOutlined,
  DownOutlined,
  FileTextOutlined,
  PlusOutlined,
  SendOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { studentApi, type EligibleBatch } from '@/services/student-api';
import { planApi, type CandidateGroupSort } from '@/services/plan-api';
import UniversityLogo from '@/components/university/UniversityLogo';
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
  MatchHeader, TrendChart, NotesChip, MetricStrip,
  FilterBar, DEFAULT_FILTERS, HiddenCard, ComparePanel,
  type FilterState, type FilterGradeKey, type TierFilter,
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

function renderHighlights(items: ReturnType<typeof getSubjectHighlights>['strengths'], color: string) {
  if (!items.length) return <span className="text-text-faint">暂无</span>;
  return (
    <Space size={[4, 6]} wrap>
      {items.map((item) => (
        <Tag key={item.key} color={color} className="m-0">
          {item.label} {item.score}/{item.maxScore}
        </Tag>
      ))}
    </Space>
  );
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

function StudentProfileBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className={styles.profileBlock}>
      <h2>{title}</h2>
      <div className={styles.profileBlockBody}>{children}</div>
    </div>
  );
}

function StudentFact({
  label,
  value,
  note,
  accent = false,
}: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  accent?: boolean;
}) {
  return (
    <div className={cx(styles.profileFact, accent && styles.profileFactAccent)}>
      <span>{label}</span>
      <strong>{value}</strong>
      {note ? <em>{note}</em> : null}
    </div>
  );
}

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

function formatCompetition(group: CandidateGroup) {
  const current = group.competition?.currentCount;
  const previous = group.competition?.previousCount;
  if (!current && !previous) return '竞争池暂无';
  return `${group.competition?.currentYear ?? '今年'} ${current ? current.toLocaleString() : '-'} / ${group.competition?.previousYear ?? '去年'} ${previous ? previous.toLocaleString() : '-'}`;
}

function formatSelectionCompetition(group: CandidateGroup) {
  const detail = group.selectionCompetition;
  if (!detail?.eligibleCount) return '选科池暂无';
  const source = detail.sourceType === 'PUBLIC_ESTIMATE' ? `${detail.sourceYear} 参考` : detail.sourceYear ?? '当前';
  return `选科池 ${detail.eligibleCount.toLocaleString()} 人 (${source})`;
}

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
  return (
    <div className={styles.majorSection}>
      <div className={styles.majorSectionHead}>
        <span>{title}</span>
        <em>{majors.length}</em>
      </div>
      <div className={styles.majorSectionRows}>
        {majors.map((major) => {
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
  const [keyword, setKeyword] = useState('');
  const [searchText, setSearchText] = useState('');
  const [includeSoftFails, setIncludeSoftFails] = useState(true);
  const [candidateSort, setCandidateSort] = useState<CandidateGroupSort>('MAJOR_MATCH');
  // 默认显示「组最低」：后端对组最低做了 majorMin fallback，趋势连续性更好
  // 切到「投档线」时只显示 2025 起的真投档数据（早期记录缺失 filing 字段）
  const [trendType, setTrendType] = useState<'filing' | 'min'>('min');
  const [poolFilters, setPoolFilters] = useState<FilterState>(DEFAULT_FILTERS);
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
    queryKey: ['plan-candidate-groups', planId, keyword, includeSoftFails, candidateSort, candidatePage],
    queryFn: () => planApi.getCandidateGroups(planId!, {
      page: candidatePage,
      pageSize: candidatePageSize,
      keyword,
      includeSoftFails,
      sort: candidateSort,
    }),
    enabled: !!planId,
  });
  const candidateGroups = unwrap<CandidateGroupListResult>(groupData);
  const groups = candidateGroups?.groups ?? [];

  // 前端筛选：基于 poolFilters 过滤 groups（不改变 service 返回顺序）
  const visibleGroups = useMemo(() => {
    return groups.filter((group) => {
      // 梯度筛选
      const tier = gradientTier(group) as FilterGradeKey;
      if (!poolFilters.grades.has(tier)) return false;

      // 档次筛选
      const cardTiers: TierFilter[] = [];
      if (group.university?.is985) cardTiers.push('985');
      if (group.university?.is211) cardTiers.push('211');
      if (group.university?.isDoubleFirstClass) cardTiers.push('DFC');
      if (cardTiers.length === 0) cardTiers.push('other');
      const tierMatch = cardTiers.some((t) => poolFilters.tiers.has(t));
      if (!tierMatch) return false;

      // 地域筛选（依据后端计算的 prefMatch.province）
      if (poolFilters.province === 'local' && group.prefMatch?.province !== 'match') return false;
      if (poolFilters.province === 'outside' && group.prefMatch?.province !== 'mismatch') return false;

      return true;
    });
  }, [groups, poolFilters]);
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
  }, [planId, keyword, includeSoftFails, candidateSort]);

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

  return (
    <div className={styles.page}>
      <Link href={`/teacher/students/${studentId}`} className={styles.backLink}>
        <ArrowLeftOutlined /> 返回学生详情
      </Link>

      <section className={styles.compactHeader}>
        <div className={styles.studentIdentity}>
          <div className={styles.studentTop}>
            <div>
              <h1>生成方案工作台</h1>
              <p>学生：{student?.user?.realName || student?.realName || student?.user?.username || '-'} · 当前方案按后端候选池实时计算</p>
            </div>
            <div className={styles.headerActions}>
            <Select
              placeholder="选择批次"
              value={batchConfigId}
              loading={batchLoading}
              options={batchOptions}
              onChange={setBatchConfigId}
              className="min-w-[260px]"
            />
            <button
              type="button"
              className={cx(styles.btn, styles.btnSmall, styles.btnPrimary)}
              disabled={!batchConfigId || student?.intakeStatus !== 'VERIFIED'}
              onClick={openOrCreatePlan}
            >
              <FileTextOutlined />
              {selectedBatchPlan ? '打开已有方案' : '创建方案草稿'}
            </button>
            {planId ? (
              <>
                <button type="button" className={cx(styles.btn, styles.btnSmall)} onClick={() => router.push(`/teacher/plans/${planId}`)}>查看详情</button>
                <button
                  type="button"
                  className={cx(styles.btn, styles.btnSmall, styles.btnPrimary)}
                  disabled={plan?.status !== 'DRAFT' || !planItems.length}
                  onClick={() => submitMutation.mutate()}
                >
                  <SendOutlined />
                  提交审核
                </button>
              </>
            ) : null}
            </div>
          </div>
          <div className={styles.studentProfileGrid}>
            <div className={styles.scoreOverview}>
              <StudentFact label="总分" value={formatScoreValue(student?.totalScore)} note={scoreRankNote} accent />
              <StudentFact label="档案位次" value={formatRankValue(student?.provincialRank)} note="学生档案记录" accent />
              <StudentFact label="排序位次" value={formatRankValue(studentRankForDecision)} note={isUsingScoreBasedRank ? '已按一分一段修正' : '候选池计算口径'} accent />
              <StudentFact label="资料状态" value={formatLabel(student?.intakeStatus || 'DRAFT', INTAKE_STATUS_LABEL)} note={student?.intakeStatus || 'DRAFT'} />
              <StudentFact label="选科组合" value={subjectCombination} note={formatLabel(student?.examSource, EXAM_SOURCE_LABEL)} />
            </div>

            <div className={styles.profileDetailsGrid}>
              <StudentProfileBlock title="科目结构">
                <div className={styles.subjectScoreGrid}>
                  <StudentFact label="语文" value={formatScoreValue(student?.scoreChinese)} />
                  <StudentFact label="数学" value={formatScoreValue(student?.scoreMath)} />
                  <StudentFact label="英语" value={formatScoreValue(student?.scoreEnglish)} />
                  <StudentFact label="首选科目" value={formatScoreValue(student?.scoreFirstChoice)} />
                  <StudentFact label="再选一" value={formatScoreValue(student?.scoreSub1)} />
                  <StudentFact label="再选二" value={formatScoreValue(student?.scoreSub2)} />
                </div>
                <div className={styles.profileLine}>
                  <span>优势科目</span>
                  <div>{renderHighlights(subjectHighlights.strengths, 'green')}</div>
                </div>
                <div className={styles.profileLine}>
                  <span>短板科目</span>
                  <div>{renderHighlights(subjectHighlights.weaknesses, 'orange')}</div>
                </div>
              </StudentProfileBlock>

              <StudentProfileBlock title="意向信息">
                <div className={styles.profileLine}><span>优先模式</span><strong>{formatLabel(student?.priorityMode, PRIORITY_MODE_LABEL)}</strong></div>
                <div className={styles.profileLine}><span>留省偏好</span><strong>{formatLabel(student?.stayPreference, STAY_PREFERENCE_LABEL)}</strong></div>
                <div className={styles.profileLine}><span>升学/职业</span><strong>{formatLabel(student?.careerPlan, CAREER_PLAN_LABEL)} · {formatPlainText(student?.careerDirection)}</strong></div>
                <div className={styles.profileLine}><span>地域意向</span><div>{renderTags([...getArrayValues(student?.preferredProvinces), ...getArrayValues(student?.preferredCities)], 'blue')}</div></div>
                <div className={styles.profileLine}><span>院校意向</span><div>{renderTags(student?.preferredUniversities, 'geekblue')}</div></div>
                <div className={styles.profileLine}><span>专业意向</span><div>{renderTags([...getArrayValues(student?.preferredMajors), ...getArrayValues(student?.preferredMajorCategories)], 'green')}</div></div>
                <div className={styles.profileLine}><span>意向批次</span><div>{renderTags(student?.preferredBatches, 'purple')}</div></div>
              </StudentProfileBlock>

              <StudentProfileBlock title="排除与红线">
                <div className={styles.profileLine}><span>排除地域</span><div>{renderTags([...getArrayValues(student?.excludedProvinces), ...getArrayValues(student?.excludedCities)], 'red')}</div></div>
                <div className={styles.profileLine}><span>排除院校</span><div>{renderTags(student?.excludedUniversities, 'red')}</div></div>
                <div className={styles.profileLine}><span>排除专业</span><div>{renderTags([...getArrayValues(student?.excludedMajors), ...getArrayValues(student?.excludedMajorCategories)], 'volcano')}</div></div>
                <div className={styles.profileLine}><span>接受边界</span><div>{renderTags(riskPreferenceTags, 'gold')}</div></div>
                <div className={styles.profileLine}><span>身体限制</span><div>{renderTags(physicalLimitTags, 'orange')}</div></div>
                <div className={styles.profileLine}><span>其他要求</span><strong>{formatPlainText(student?.otherRequirements)}</strong></div>
              </StudentProfileBlock>
            </div>
          </div>
          <div className={styles.noteRow}>
            <span className={styles.collectionNote}>已有方案</span>
            {existingPlansLoading ? <span className={styles.collectionNote}>加载中...</span> : null}
            {existingPlans.length ? existingPlans.map((existingPlan) => {
              const batchName = existingPlan.batchName ?? existingPlan.batch ?? `批次 ${existingPlan.batchConfigId ?? existingPlan.id}`;
              return (
                <button
                  key={existingPlan.id}
                  type="button"
                  className={cx(styles.btn, styles.btnSmall, existingPlan.id === planId && styles.btnPrimary)}
                  onClick={() => openPlan(existingPlan)}
                >
                  {batchName} · V{existingPlan.versionNo ?? 1} · {existingPlan.status ?? 'DRAFT'}
                </button>
              );
            }) : <span className={styles.collectionNote}>暂无已创建方案</span>}
          </div>
        </div>
        {student?.intakeStatus !== 'VERIFIED' ? (
          <Alert className="mt-4" type="warning" showIcon message="学生资料尚未确认，需要先在学生详情页完成资料审核。" />
        ) : null}
      </section>

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
        <div className={styles.summaryStrip}>
          <div className={styles.summaryCard}><div className={styles.label}>候选总量</div><div className={styles.value}>{candidateGroups?.total ?? 0}</div><div className={styles.hint}>专业组候选</div></div>
          <div className={styles.summaryCard}><div className={styles.label}>排序位次</div><div className={styles.value}>{formatRankValue(studentRankForDecision)}</div><div className={styles.hint}>{isUsingScoreBasedRank ? '一分一段估算' : '档案位次'}</div></div>
          <div className={styles.summaryCard}><div className={styles.label}>方案年份</div><div className={styles.value}>{candidateGroups?.planYear ?? '-'}</div><div className={styles.hint}>招生计划口径</div></div>
          <div className={styles.summaryCard}><div className={styles.label}>当前方案</div><div className={styles.value}>{planItems.length}</div><div className={styles.hint}>已加入志愿项</div></div>
        </div>

        <div className={styles.workbench}>
          <section className={styles.panel}>
            <div className={styles.panelHead}>
              <div className={styles.panelTitle}>
                <h2>院校专业组候选池</h2>
                <p>按后端候选结果展示专业组，排序参考位次、专业匹配、计划变化、竞争池、选科池和征集口径。</p>
              </div>
            </div>
            <div className={styles.toolbar}>
              <Input.Search
                placeholder="院校/专业/专业组"
                allowClear
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                onSearch={setKeyword}
              />
              <div className={styles.filterRow}>
                <Select
                  value={candidateSort}
                  onChange={(value: CandidateGroupSort) => setCandidateSort(value)}
                  options={CANDIDATE_SORT_OPTIONS}
                  className="w-[170px]"
                />
                <Select
                  value={includeSoftFails ? 'all' : 'pass'}
                  onChange={(value) => setIncludeSoftFails(value === 'all')}
                  options={[
                    { label: '显示风险项', value: 'all' },
                    { label: '仅可选项', value: 'pass' },
                  ]}
                  className="w-[130px]"
                />
              </div>
            </div>
            <div className={styles.candidateView}>
              <FilterBar
                filters={poolFilters}
                setFilters={setPoolFilters}
                filteredCount={visibleGroups.length}
                totalCount={groups.length}
              />
              <div className={styles.densityNote}>
                <div>
                  当前展示 <strong>{visibleGroups.length}</strong> 个候选，按 <strong>{CANDIDATE_SORT_OPTIONS.find((item) => item.value === candidateSort)?.label}</strong> 排序
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ display: 'inline-flex', gap: 2, padding: 2, borderRadius: 6, background: 'var(--surface-dim, #f0eee6)' }}>
                    <button
                      type="button"
                      onClick={() => setTrendType('filing')}
                      style={{
                        height: 22, padding: '0 10px', borderRadius: 4, border: 0, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                        background: trendType === 'filing' ? '#fff' : 'transparent',
                        color: trendType === 'filing' ? '#1e3a5f' : '#6b6962',
                        boxShadow: trendType === 'filing' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                      }}
                    >
                      投档线趋势
                    </button>
                    <button
                      type="button"
                      onClick={() => setTrendType('min')}
                      style={{
                        height: 22, padding: '0 10px', borderRadius: 4, border: 0, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                        background: trendType === 'min' ? '#fff' : 'transparent',
                        color: trendType === 'min' ? '#1e3a5f' : '#6b6962',
                        boxShadow: trendType === 'min' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                      }}
                    >
                      组最低趋势
                    </button>
                  </div>
                  <span>{includeSoftFails ? '包含风险项' : '仅显示可选项'}</span>
                </div>
              </div>
              {isUsingFallbackYear ? (
                <Alert
                  type="info"
                  showIcon
                  message={`当前候选池参考 ${candidateGroups.sourceYear} 年招生计划，方案年份仍为 ${candidateGroups.planYear}。人数变化按 ${candidateGroups.previousYear ?? (candidateGroups.sourceYear! - 1)} 年对比。`}
                />
              ) : null}

              {isUsingScoreBasedRank ? (
                <Alert
                  type="warning"
                  showIcon
                  message={`档案位次 ${candidateGroups?.storedRank?.toLocaleString()} 与 ${student?.totalScore ?? '-'} 分明显不匹配，候选排序已按 ${candidateGroups?.sourceYear ?? '当前'} 年一分一段估算位次 ${candidateGroups?.scoreBasedRank?.toLocaleString()} 计算。`}
                />
              ) : null}

              {groupLoading ? (
                <div className="py-16 text-center">
                  <Spin size="large" />
                  <div className="mt-4 text-sm font-medium text-text">正在计算候选专业组</div>
                  <div className="mt-1 text-xs text-text-tertiary">系统正在综合位次、计划变化、竞争人数、选科池和征集数据</div>
                </div>
              ) : visibleGroups.length ? (
                <>
                  <div className={styles.cardList}>
                    {visibleGroups.map((group) => {
                      // 隐藏的卡：渲染塌缩 HiddenCard
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
                      const planChange = formatGroupPlanChange(group);
                      const added = isCandidateGroupAlreadyAdded(group, planItems);
                      const anchor = getAnchorMajor(group);
                      const adjustedRank = getAdjustedRank(group, anchor);
                      const rankGap = formatRankGap(studentRankForDecision, adjustedRank);
                      const majorSections = getMajorSections(group);
                      const previewMajors = (majorSections.recommended.length ? majorSections.recommended : group.majors)
                        .slice(0, expanded ? Math.min(majorSections.recommended.length || group.majors.length, 6) : 3);
                      const evidence = [
                        ...(group.matchReasons ?? []),
                        ...(anchor?.matchReasons ?? []),
                      ].filter(Boolean);
                      const trendPoints = (trendType === 'filing' ? group.historyFiling3y : group.history3y) ?? [];
                      const ms = group.matchScore ?? 0;
                      const weightClass =
                        ms >= 85 ? compareStyles.cardPrimary :
                        ms > 0 && ms < 70 ? compareStyles.cardSecondary :
                        '';
                      const comparedClass = compareSet.has(group.groupKey) ? compareStyles.cardCompared : '';
                      const trendDelta = trendPoints.length >= 2
                        ? trendPoints[trendPoints.length - 1].score - trendPoints[0].score
                        : null;
                      return (
                        <article key={group.groupKey} className={`${styles.candidateCard} ${weightClass} ${comparedClass}`}>
                          <MatchHeader
                            matchScore={group.matchScore ?? 0}
                            matchReason={group.matchReason}
                            prefMatch={group.prefMatch}
                            compared={compareSet.has(group.groupKey)}
                            onCompareToggle={() => toggleCompare(group.groupKey)}
                          />
                          {trendPoints.length > 0 ? (
                            <div style={{ padding: '8px 16px', borderTop: '1px solid #f0eee6', borderBottom: '1px solid #f0eee6', background: '#faf9f5', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 11, color: '#6b6962', fontWeight: 600, letterSpacing: 0.4, whiteSpace: 'nowrap', flexShrink: 0 }}>
                                {trendType === 'filing' ? '近 3 年投档线' : '近 3 年组最低分'}
                              </span>
                              <div style={{ width: 280, flexShrink: 0 }}>
                                <TrendChart points={trendPoints} />
                              </div>
                              <div style={{ fontSize: 12, color: '#6b6962', marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', flexWrap: 'wrap' }}>
                                {trendDelta != null ? (
                                  <>
                                    <span style={{ fontFamily: 'Georgia, "Noto Serif SC", SimSun, serif', fontWeight: 600, color: '#1a1a19' }}>
                                      {trendPoints[0].score} → {trendPoints[trendPoints.length - 1].score}
                                    </span>
                                    <span style={{
                                      fontSize: 11, fontWeight: 700,
                                      padding: '2px 6px', borderRadius: 4,
                                      background: trendDelta > 0 ? '#fef2f2' : trendDelta < 0 ? '#f0fff4' : '#f0eee6',
                                      color: trendDelta > 0 ? '#c53030' : trendDelta < 0 ? '#276749' : '#6b6962',
                                    }}>
                                      {trendDelta > 0 ? '+' : ''}{trendDelta}
                                    </span>
                                    <span style={{ fontSize: 10, color: '#87867f' }}>{trendPoints.length} 年</span>
                                  </>
                                ) : null}
                                {group.predictedMinRank?.point != null ? (
                                  <span
                                    title={`基于 ${group.predictedMinRank.targetYear ?? '2026'} 年预测 · 信心 ${group.predictedMinRank.confidence ?? '—'}`}
                                    style={{
                                      display: 'inline-flex', alignItems: 'center', gap: 4,
                                      padding: '3px 8px', borderRadius: 5,
                                      background: '#fdf8ec', border: '1px solid #f0dfad',
                                      color: '#8a6510', fontSize: 11, fontWeight: 600,
                                      cursor: 'help',
                                    }}
                                  >
                                    ◇ {group.predictedMinRank.targetYear ?? 2026} 预测 ~{group.predictedMinRank.point.toLocaleString()} 位
                                    {group.predictedMinRank.confidence ? (
                                      <span style={{
                                        marginLeft: 2,
                                        padding: '0 4px',
                                        borderRadius: 3,
                                        fontSize: 9,
                                        background: group.predictedMinRank.confidence === 'high' ? '#e8f5ec'
                                          : group.predictedMinRank.confidence === 'medium' ? '#ebf4ff'
                                          : '#f0eee6',
                                        color: group.predictedMinRank.confidence === 'high' ? '#276749'
                                          : group.predictedMinRank.confidence === 'medium' ? '#2c5282'
                                          : '#87867f',
                                      }}>
                                        {group.predictedMinRank.confidence === 'high' ? '高'
                                          : group.predictedMinRank.confidence === 'medium' ? '中'
                                          : '低'}
                                      </span>
                                    ) : null}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          ) : null}
                          <div className={styles.candidateTop}>
                            <UniversityLogo name={group.universityName || '学校'} logoUrl={group.university?.logoUrl} size={40} />
                            <button type="button" className="min-w-0 border-0 bg-transparent p-0 text-left" onClick={() => toggleGroup(group.groupKey)}>
                              <div className={styles.nameLine}>
                                <h3>{group.universityName}</h3>
                                <span className={tagClass(gradientTone(gradientTier(group)))}>{GRADIENT_LABEL[gradientTier(group)]}</span>
                                {added ? <span className={tagClass('muted')}>已加入</span> : null}
                                {group.softFailCount > 0 ? <span className={tagClass('warn')}>{group.softFailCount} 个风险专业</span> : null}
                                <UniversityBadges group={group} />
                              </div>
                              <div className={styles.subLine}>
                                {group.university?.province || group.university?.city ? <span>{group.university?.province}{group.university?.city ? ` · ${group.university.city}` : ''}</span> : null}
                                <span className={styles.dot}>·</span>
                                <span>{formatCandidateGroup(group)}</span>
                              </div>
                            </button>
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                              <div className={`${compareStyles.gradeBadge} ${
                                gradientTone(gradientTier(group)) === 'rush' ? compareStyles.gradeBadgeRush :
                                gradientTone(gradientTier(group)) === 'safe' ? compareStyles.gradeBadgeSafe :
                                compareStyles.gradeBadgeStable
                              }`}>
                                <span className={compareStyles.gradeLabel}>梯度</span>
                                <span className={compareStyles.gradeValue}>{GRADIENT_LABEL[gradientTier(group)]}</span>
                                <span className={compareStyles.gradeNote}>{rankGap.text}</span>
                              </div>
                              <div className={styles.cardActions}>
                              <button type="button" className={cx(styles.btn, styles.btnSmall)} onClick={() => anchor && setActiveDetail({ group, major: anchor })}>详情</button>
                              <button
                                type="button"
                                className={cx(styles.btn, styles.btnSmall)}
                                onClick={() => toggleGroup(group.groupKey)}
                              >
                                专业 <DownOutlined rotate={expanded ? 180 : 0} />
                              </button>
                              {anchor ? (
                                <button
                                  type="button"
                                  className={cx(styles.btn, styles.btnSmall, !added && styles.btnPrimary)}
                                  disabled={added}
                                  onClick={() => addCandidateGroup(group, anchor)}
                                >
                                  <PlusOutlined />
                                  {getAddActionLabel(group, anchor, added)}
                                </button>
                              ) : null}
                              <button
                                type="button"
                                className={cx(styles.btn, styles.btnSmall)}
                                onClick={() => hideGroup(group.groupKey)}
                                title="不考虑此校（可恢复）"
                                style={{ color: '#87867f' }}
                              >
                                ✕ 不考虑
                              </button>
                              </div>
                            </div>
                          </div>

                          <MetricStrip
                            planCount={group.currentPlanCount}
                            planDelta={group.planCountChange}
                            postgradRate={group.university?.postgradRate}
                            furtherStudyRate={group.university?.furtherStudyRate}
                            employmentRate={group.university?.employmentRate}
                            avgSalary={group.university?.avgSalary}
                            satisfaction={group.university?.satisfactionOverall}
                            satisfactionSample={group.university?.satisfactionCount}
                            tuition={anchor?.tuition ?? null}
                            duration={anchor?.duration ?? anchor?.standardDuration ?? null}
                          />

                          <div className={styles.majorList}>
                            <CandidateMajorSection
                              title={MAJOR_SECTION_LABEL.RECOMMENDED}
                              section="RECOMMENDED"
                              majors={previewMajors}
                              group={group}
                              onAdd={addCandidateGroup}
                              addingMajorKey={added ? group.recommendedAnchorEnrollmentPlanId : null}
                            />
                          </div>

                          {expanded ? (() => {
                            const currentTab = groupExpandTabs[group.groupKey] ?? 'majors';
                            return (
                              <>
                                <div className={compareStyles.expandedTabs}>
                                  <button
                                    type="button"
                                    className={`${compareStyles.expandedTab} ${currentTab === 'majors' ? compareStyles.active : ''}`}
                                    onClick={() => setGroupExpandTab(group.groupKey, 'majors')}
                                  >
                                    完整专业（{group.majorCount}）
                                  </button>
                                  <button
                                    type="button"
                                    className={`${compareStyles.expandedTab} ${currentTab === 'evidence' ? compareStyles.active : ''}`}
                                    onClick={() => setGroupExpandTab(group.groupKey, 'evidence')}
                                  >
                                    数据依据 / 模型校验
                                  </button>
                                  <button
                                    type="button"
                                    className={`${compareStyles.expandedTab} ${currentTab === 'school' ? compareStyles.active : ''}`}
                                    onClick={() => setGroupExpandTab(group.groupKey, 'school')}
                                  >
                                    院校详情
                                  </button>
                                </div>
                                <div className={compareStyles.expandedPanel}>
                                  {currentTab === 'majors' ? (
                                    <>
                                      <CandidateMajorSection
                                        title={MAJOR_SECTION_LABEL.BACKUP}
                                        section="BACKUP"
                                        majors={majorSections.backup}
                                        group={group}
                                        onAdd={addCandidateGroup}
                                        addingMajorKey={added ? group.recommendedAnchorEnrollmentPlanId : null}
                                      />
                                      <CandidateMajorSection
                                        title={MAJOR_SECTION_LABEL.RISK}
                                        section="RISK"
                                        majors={majorSections.risk}
                                        group={group}
                                        onAdd={addCandidateGroup}
                                        addingMajorKey={added ? group.recommendedAnchorEnrollmentPlanId : null}
                                      />
                                      <div className="mt-4">
                                        <Table
                                          rowKey="enrollmentPlanId"
                                          size="small"
                                          columns={majorColumns(group)}
                                          dataSource={group.majors}
                                          pagination={false}
                                          scroll={{ x: 900 }}
                                        />
                                      </div>
                                    </>
                                  ) : currentTab === 'evidence' ? (
                                    <div className={styles.dataEvidence}>
                                      <div className={styles.evidenceTitle}>数据依据</div>
                                      <div className={styles.evidenceGrid}>
                                        <EvidenceItem label="位次依据">
                                          排序位次 {formatRankValue(studentRankForDecision)}，修正位次 {formatRankValue(adjustedRank)}，{rankGap.text}。
                                        </EvidenceItem>
                                        <EvidenceItem label="计划变化">{planChange.text}</EvidenceItem>
                                        <EvidenceItem label="竞争变化">{formatCompetition(group)}；{formatSelectionCompetition(group)}</EvidenceItem>
                                        <EvidenceItem label="风险提示">
                                          {group.dynamicGradient?.reasons?.length
                                            ? group.dynamicGradient.reasons.slice(0, 2).join('；')
                                            : evidence.length ? evidence.slice(0, 2).join('；') : '按专业匹配排序'}
                                        </EvidenceItem>
                                      </div>
                                      {group.supplementary?.scope === 'UNIVERSITY_BATCH' ? (
                                        <div className={styles.noteRow}>
                                          <span className={styles.compareNote}>院校批次征集仅参考，不直接降低专业组风险</span>
                                        </div>
                                      ) : null}
                                    </div>
                                  ) : (
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
                                      <div style={{ padding: 12, background: '#fff', border: '1px solid #f0eee6', borderRadius: 8 }}>
                                        <div style={{ fontSize: 11, color: '#87867f', letterSpacing: 0.5, marginBottom: 6, fontWeight: 600 }}>办学层次</div>
                                        <div style={{ fontSize: 13, color: '#1a1a19', lineHeight: 1.6 }}>
                                          {group.university?.is985 ? '985 工程 · ' : ''}
                                          {group.university?.is211 ? '211 工程 · ' : ''}
                                          {group.university?.isDoubleFirstClass ? '双一流建设高校 · ' : ''}
                                          {group.university?.runningNature ?? '—'}
                                        </div>
                                      </div>
                                      <div style={{ padding: 12, background: '#fff', border: '1px solid #f0eee6', borderRadius: 8 }}>
                                        <div style={{ fontSize: 11, color: '#87867f', letterSpacing: 0.5, marginBottom: 6, fontWeight: 600 }}>排名参考</div>
                                        <div style={{ fontSize: 13, color: '#1a1a19', lineHeight: 1.6 }}>
                                          软科 #{group.university?.softRanking ?? '—'}
                                        </div>
                                      </div>
                                      <div style={{ padding: 12, background: '#fff', border: '1px solid #f0eee6', borderRadius: 8 }}>
                                        <div style={{ fontSize: 11, color: '#87867f', letterSpacing: 0.5, marginBottom: 6, fontWeight: 600 }}>地理位置</div>
                                        <div style={{ fontSize: 13, color: '#1a1a19', lineHeight: 1.6 }}>
                                          {group.university?.province ?? '—'}{group.university?.city ? ' · ' + group.university.city : ''}
                                        </div>
                                      </div>
                                      <div style={{ padding: 12, background: '#fff', border: '1px solid #f0eee6', borderRadius: 8 }}>
                                        <div style={{ fontSize: 11, color: '#87867f', letterSpacing: 0.5, marginBottom: 6, fontWeight: 600 }}>升学就业</div>
                                        <div style={{ fontSize: 13, color: '#1a1a19', lineHeight: 1.6 }}>
                                          {group.university?.postgradRate ? `保研 ${group.university.postgradRate}` : ''}
                                          {group.university?.furtherStudyRate ? ` · 升学 ${group.university.furtherStudyRate}` : ''}
                                          {group.university?.employmentRate ? ` · 就业 ${group.university.employmentRate}` : ''}
                                          {group.university?.avgSalary ? ` · 月薪 ${group.university.avgSalary}` : ''}
                                          {!group.university?.postgradRate && !group.university?.employmentRate ? '—' : ''}
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </>
                            );
                          })() : null}
                        </article>
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
              ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无符合条件的专业组" />
              )}
            </div>
          </section>

          <aside className={styles.rail}>
            <div className={styles.railCard}>
              <h3>当前方案健康度</h3>
              {planFetching ? <Spin size="small" /> : null}
              <div className={styles.healthGrid}>
                <div className={styles.healthStat}><span>已选</span><strong>{planItems.length}</strong></div>
                <div className={styles.healthStat}><span>风险</span><strong>{planItems.filter((item: any) => item.overrideSoftFail).length}</strong></div>
                <div className={styles.healthStat}><span>状态</span><strong>{plan?.status ?? '-'}</strong></div>
              </div>
              <div className={styles.dist}><span /><span /><span /></div>
              <div className={styles.distLabels}><span>冲类</span><span>稳类</span><span>保类</span></div>
              <div className={styles.gapList}>
                <div><span>候选池</span><b>{candidateGroups?.total ?? 0} 个专业组</b></div>
                <div><span>排序位次</span><b>{formatRankValue(studentRankForDecision)}</b></div>
                <div><span>资料状态</span><b>{student?.intakeStatus || 'DRAFT'}</b></div>
              </div>
            </div>

            <div className={styles.railCard}>
              <h3>已选专业组</h3>
            {planItems.length ? (
              <div className={styles.selectedList}>
                {planItems.map((item: any) => (
                  <div key={item.id} className={styles.selectedItem}>
                    <div className={styles.selectedTop}>
                      <div>
                        <div className={styles.selectedName}>{item.order ?? item.sequence}. {item.universityName}</div>
                        <div className={styles.selectedMeta}>
                          {item.groupCode ? `专业组 ${item.groupCode} · ` : ''}{item.recommendedOrder ?? item.majorName}
                          {' · '}
                          {item.rank25Group ?? item.rank25Major ? `${(item.rank25Group ?? item.rank25Major).toLocaleString()} 位` : '位次 -'}
                        </div>
                      </div>
                      {plan?.status === 'DRAFT' ? (
                        <button
                          type="button"
                          className={cx(styles.btn, styles.btnSmall)}
                          disabled={removeMutation.isPending}
                          onClick={() => removeMutation.mutate(item.id)}
                          aria-label="移除"
                        >
                          <DeleteOutlined />
                        </button>
                      ) : null}
                    </div>
                    <details className={styles.selectedMajorsPanel}>
                      <summary>展开组内专业</summary>
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
                    </details>
                  </div>
                ))}
              </div>
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="从左侧专业组加入志愿项" />
            )}
            </div>

            <div className={styles.railCard}>
              <h3>下一步建议</h3>
              <div className={styles.suggestion}>
                <span className={styles.suggestionMark}>i</span>
                <ol className={styles.nextSteps}>
                  <li>优先补足稳 / 稳保，要求学生位次覆盖修正位次。</li>
                  <li>极冲只做备选，不占正式推荐名额。</li>
                  <li>软性风险专业先复核限制，再加入方案。</li>
                </ol>
              </div>
              <button
                type="button"
                className={cx(styles.btn, styles.btnPrimary)}
                disabled={plan?.status !== 'DRAFT' || !planItems.length || submitMutation.isPending}
                onClick={() => submitMutation.mutate()}
              >
                <CheckOutlined />
                提交主管审核
              </button>
            </div>
          </aside>
        </div>
        </>
      ) : null}

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
                {activeDetail.major.description || '该专业暂无长文本介绍，当前优先展示已接入的招生计划、录取和就业升学数据。'}
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

      {/* 浮动对比 bar */}
      {compareSet.size > 0 ? (
        <div className={compareStyles.compareBar}>
          <span className={compareStyles.compareBarIcon}>⚖</span>
          <div className={compareStyles.compareBarText}>
            已选 <b>{compareSet.size}</b> / 4 项参与对比
            <div className={compareStyles.compareBarNames}>
              {Array.from(compareSet).map((key) => visibleGroups.find((g) => g.groupKey === key)?.universityName ?? '').filter(Boolean).join(' · ')}
            </div>
          </div>
          <button className={compareStyles.compareBarBtnGhost} onClick={() => setCompareSet(new Set())}>
            清空
          </button>
          <button
            className={compareStyles.compareBarBtnPrimary}
            disabled={compareSet.size < 2}
            onClick={() => setCompareDrawerOpen(true)}
          >
            打开对比 →
          </button>
        </div>
      ) : null}

      {/* 对比 Drawer */}
      <Drawer
        open={compareDrawerOpen}
        onClose={() => setCompareDrawerOpen(false)}
        title={<span>⚖ 候选对比（{compareSet.size} 项）</span>}
        width={typeof window !== 'undefined' ? Math.min(1180, window.innerWidth * 0.92) : 1100}
        placement="right"
      >
        <ComparePanel
          groups={Array.from(compareSet)
            .map((key) => visibleGroups.find((g) => g.groupKey === key))
            .filter((g): g is NonNullable<typeof g> => Boolean(g))}
        />
      </Drawer>
    </div>
  );
}
