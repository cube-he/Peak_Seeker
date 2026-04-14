/**
 * Shared types for the v4.4 recommend engine.
 * All sub-modules reference these interfaces instead of ad-hoc types.
 */

// ---- Student profile snapshot used throughout the pipeline ----

export interface StudentProfileSnapshot {
  id: number;
  userId: number;
  province: string;
  examType: string; // PHYSICS | HISTORY | COMPREHENSIVE_LIBERAL | COMPREHENSIVE_SCIENCE
  examYear: number;
  totalScore: number;
  provincialRank: number;
  firstChoice?: string | null;
  reChoices?: string[] | null;

  // Physical restrictions
  colorBlind: boolean;
  colorWeak: boolean;
  vision?: string | null;
  physicalLimits?: Record<string, any> | null;

  // Preferences
  priorityMode: PriorityMode;
  preferredProvinces?: string[] | null;
  preferredCities?: string[] | null;
  preferredMajors?: string[] | null;
  preferredMajorCategories?: string[] | null;
  preferredUniversities?: string[] | null;
  preferredUniversityTypes?: string[] | null;
  preferredTags?: string[] | null;

  // Exclusions
  excludedProvinces?: string[] | null;
  excludedCities?: string[] | null;
  excludedUniversities?: string[] | null;
  excludedMajors?: string[] | null;

  // Financial
  tuitionBudget?: TuitionBudgetLevel | null;
  acceptSinoForeign: boolean;
  acceptPrivate?: string | null;

  // Career
  careerPlan?: string | null;
  stayPreference?: string | null;
}

export type PriorityMode =
  | 'UNIVERSITY_FIRST'
  | 'MAJOR_FIRST'
  | 'CITY_FIRST'
  | 'BALANCED';

export type TuitionBudgetLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'UNLIMITED';

// ---- Rank calculation output ----

export interface RankResult {
  rank: number;
  bestRank: number;
  uncertaintyRange: number;
  sameScoreCount: number;
  flagRangeDown: boolean; // true when sameScoreCount > 300
}

// ---- Range output ----

export interface RangeResult {
  rangeUp: number;
  rangeDown: number;
}

// ---- Candidate after initial filtering ----

export interface RawCandidate {
  // Admission record data
  admissionRecordId: number;
  universityId: number;
  majorId: number;
  year: number;
  province: string;
  batch?: string | null;
  majorMinRank: number | null;
  majorMinScore: number | null;
  majorAvgRank: number | null;
  majorAdmissionCount: number | null;
  groupMinRank: number | null;
  groupCode?: string | null;

  // University snapshot
  universityName: string;
  universityCode?: string | null;
  universityProvince?: string | null;
  universityCity?: string | null;
  is985: boolean;
  is211: boolean;
  isDoubleFirstClass: boolean;
  runningNature?: string | null; // 公办/民办
  universityType?: string | null;
  universityTags?: any;
  postgradRate?: string | null;
  softRanking?: number | null;

  // Major snapshot
  majorName: string;
  majorCode?: string | null;
  majorCategory?: string | null;
  majorLevel?: string | null;
  discipline?: string | null;

  // Enrollment plan data (current year)
  planCount?: number | null;
  tuition?: number | null;
  isSinoForeign: boolean;
  subjects?: string | null;
  subjectRequirements?: string | null;
  enrollmentGroupCode?: string | null;
  enrollmentGroupName?: string | null;
  enrollmentGroupMajors?: string | null;
  enrollmentGroupPlanCount?: number | null;

  // Discipline evaluation from enrollment plan
  disciplineEval?: string | null;
  isNationalFeature: boolean;
  majorRanking?: string | null;
  majorHonor?: string | null;
}

// ---- Scored candidate ----

export interface ScoredCandidate extends RawCandidate {
  compositeScore: number;
  scoreBreakdown: ScoreBreakdown;
  stabilityFactor: number;
  dataReliabilityFactor: number;
  supplementaryAdjustment: number;
  supplementaryRiskNote?: string;
}

export interface ScoreBreakdown {
  tier: number;
  tierRaw: number;
  nature: number;
  natureRaw: number;
  major: number;
  majorRaw: number;
  majorRecommendScore: number;
  majorDisciplineScore: number;
  other: number;
  otherRaw: number;
  otherPlanScore: number;
  otherPostgradScore: number;
  otherLocationScore: number;
  bonus: number;
  rawTotal: number;
  adjustedTotal: number;
  weight_t: number; // the t value (bin position)
}

// ---- Gradient classification ----

export enum GradientType {
  HIGH_RUSH = 'HIGH_RUSH', // 高冲
  RUSH = 'RUSH', // 冲
  STABLE_RUSH = 'STABLE_RUSH', // 稳冲
  STABLE = 'STABLE', // 稳
  SAFE_STABLE = 'SAFE_STABLE', // 稳保
  SAFE = 'SAFE', // 保
}

export const GRADIENT_DISTRIBUTION: Record<GradientType, number> = {
  [GradientType.HIGH_RUSH]: 13,
  [GradientType.RUSH]: 11,
  [GradientType.STABLE_RUSH]: 10,
  [GradientType.STABLE]: 10,
  [GradientType.SAFE_STABLE]: 6,
  [GradientType.SAFE]: 5,
};

export const TOTAL_GROUPS = 55;

// ---- Bin with candidates ----

export interface Bin {
  index: number;
  gradient: GradientType;
  rankStart: number;
  rankEnd: number;
  candidates: ScoredCandidate[];
  anchor?: ScoredCandidate; // highest scoring candidate in this bin
}

// ---- Cleanliness enum ----
// Maps to Prisma Cleanliness enum: CLEAN, MINOR_ISSUE, MODERATE_ISSUE, MAJOR_ISSUE

export enum CleanlinessLevel {
  CLEAN = 'CLEAN',
  MIXED = 'MINOR_ISSUE', // Maps to Prisma MINOR_ISSUE
  POOR = 'MAJOR_ISSUE', // Maps to Prisma MAJOR_ISSUE
}

// ---- Plan item output (ready for PlanItem table) ----

export interface PlanItemOutput {
  sequence: number;
  gradient: 'CHONG' | 'WEN' | 'BAO';
  universityId: number;
  universityName: string;
  universityCode?: string | null;
  groupCode?: string | null;
  groupName?: string | null;
  majorId: number;
  majorName: string;
  majorCode?: string | null;
  anchorMajor: string;
  groupMajorCount: number;
  recommendedOrder?: string | null;
  fullMajorRanking?: any;
  subjectRequirement?: string | null;
  schoolNature?: string | null;
  schoolTags?: string | null;
  acceptAdjust: boolean;

  // Historical data snapshots
  score25Group?: number | null;
  rank25Group?: number | null;
  score25Major?: number | null;
  rank25Major?: number | null;
  score24Major?: number | null;
  rank24Major?: number | null;
  lastYearMinScore?: number | null;
  lastYearMinRank?: number | null;
  lastYearAvgScore?: number | null;
  lastYearAvgRank?: number | null;
  avgMinRank3y?: number | null;

  planCount?: number | null;
  tuition?: number | null;
  cleanliness?: CleanlinessLevel;
  selectionReason?: string;
  riskWarning?: string;
  adjustmentAdvice?: string;
  isManuallyModified: boolean;
  compositeScore: number;
  scoreBreakdown: ScoreBreakdown;
}

// ---- Plan generation job data ----

export interface PlanGenerationJobData {
  studentId: number;
  createdById: number;
  batch?: string;
  priorityMode?: PriorityMode;
  overrides?: {
    rangeUp?: number;
    rangeDown?: number;
    totalGroups?: number;
    bonusRules?: Record<string, number>;
  };
}

export interface PlanGenerationProgress {
  jobId: string;
  stage: string;
  percentage: number;
  message: string;
}

// ---- Failure classification ----

export enum FailureType {
  TRANSIENT = 'TRANSIENT', // retry 3x
  DATA_ERROR = 'DATA_ERROR', // notify teacher
  ALGORITHM_ERROR = 'ALGORITHM_ERROR', // suggest fix
  SYSTEM_ERROR = 'SYSTEM_ERROR', // notify admin
}

// ---- Export format ----

export type ExportFormat = 'excel_full' | 'excel_compact' | 'pdf';

// ---- Replacement suggestion ----

export interface ReplacementSuggestion {
  candidate: ScoredCandidate;
  reason: string;
}
