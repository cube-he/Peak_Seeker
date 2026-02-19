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
