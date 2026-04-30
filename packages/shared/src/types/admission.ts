// 招生计划类型
export interface EnrollmentPlan {
  id: number;
  universityId: number;
  majorId: number;
  year: number;
  province: string;
  planCount: number | null;
  planNotes: string | null;
  batch: string | null;
  level: string | null;
  subjects: string | null;
  subjectRequirements: string | null;
  duration: string | null;
  tuition: number | null;
  isSinoForeign: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// 录取数据类型
export interface AdmissionRecord {
  id: number;
  universityId: number;
  majorId: number;
  year: number;
  province: string;
  majorMinScore: number | null;
  majorMinRank: number | null;
  majorAdmissionCount: number | null;
  universityMinScore: number | null;
  universityMinRank: number | null;
  universityAvgScore: number | null;
  universityAvgRank: number | null;
  universityMaxScore: number | null;
  universityMaxRank: number | null;
  universityAdmissionCount: number | null;
  createdAt: Date;
  updatedAt: Date;
}

// 录取趋势数据
export interface AdmissionTrend {
  year: number;
  minScore: number | null;
  minRank: number | null;
  avgScore: number | null;
  maxScore: number | null;
  admissionCount: number | null;
}

// 单年录取数据（聚合结果中的年度数据）
export interface YearlyAdmissionData {
  year: number;
  // 专业级数据（2022-2024较完整）
  majorMinScore: number | null;
  majorMinRank: number | null;
  majorAvgScore: number | null;
  majorAvgRank: number | null;
  majorAdmissionCount: number | null;
  // 专业组级数据（2024-2025较完整）
  groupMinScore: number | null;
  groupMinRank: number | null;
  groupAdmissionCount: number | null;
}

// 当年招生计划
export interface CurrentEnrollmentPlan {
  planCount: number | null;
  tuition: number | null;
  duration: string | null;
  subjectRequirements: string | null;
  disciplineEval: string | null;
  majorRanking: string | null;
  majorHonor: string | null;
  localMasterPoint: string | null;
  localDoctoralPoint: string | null;
  isNew: boolean;
  isSinoForeign: boolean;
  planNotes: string | null;
}

// 院校摘要（聚合结果中的院校信息）
export interface UniversitySummary {
  id: number;
  name: string;
  code: string;
  province: string;
  city: string;
  type: string | null;
  runningNature: string | null;
  is985: boolean;
  is211: boolean;
  isDoubleFirstClass: boolean;
}

// 专业摘要
export interface MajorSummary {
  id: number;
  name: string;
  category: string | null;
  discipline: string | null;
  softRating: string | null;
}

// 聚合录取结果 — 一条 = 一个"院校+专业"组合的完整画像
export interface AggregatedAdmissionItem {
  university: UniversitySummary;
  major: MajorSummary;
  majorCode: string;
  majorName: string;
  groupCode: string;
  batch: string;
  subjects: string;
  recruitType: string;
  yearlyData: YearlyAdmissionData[];
  currentPlan: CurrentEnrollmentPlan | null;
}

// 聚合查询参数
export interface AggregatedAdmissionQuery {
  score?: number;
  rank?: number;
  province: string;
  range?: number;
  batch?: string;
  subjects?: string;
  recruitType?: string;
  is985?: boolean;
  is211?: boolean;
  isDoubleFirstClass?: boolean;
  page?: number;
  pageSize?: number;
}

// 聚合查询响应
export interface AggregatedAdmissionResponse {
  data: AggregatedAdmissionItem[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
  };
}
