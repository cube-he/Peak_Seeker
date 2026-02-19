// 院校相关类型
export interface University {
  id: number;
  name: string;
  code: string | null;
  province: string | null;
  city: string | null;
  type: string | null;
  level: string | null;
  runningLevel: string | null;
  runningNature: string | null;
  isDoubleFirstClass: boolean;
  is985: boolean;
  is211: boolean;
  tags: string[];
  grade: string | null;
  disciplineEvaluationLevel: string | null;
  hasMasterProgram: boolean;
  hasDoctoralProgram: boolean;
  masterProgramCount: number | null;
  masterPrograms: string[];
  doctoralProgramCount: number | null;
  doctoralPrograms: string[];
  campusArea: number | null;
  transferDifficulty: string | null;
  militaryTrainingDuration: string | null;
  isFeatured: boolean;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UniversityListItem {
  id: number;
  name: string;
  code: string | null;
  province: string | null;
  city: string | null;
  type: string | null;
  level: string | null;
  runningNature: string | null;
  isDoubleFirstClass: boolean;
  is985: boolean;
  is211: boolean;
  tags: string[];
  latestAdmission?: {
    year: number;
    minScore: number | null;
    minRank: number | null;
    avgScore: number | null;
  };
}

export interface UniversityDetail extends University {
  enrollmentPlans?: EnrollmentPlan[];
  admissionRecords?: AdmissionRecord[];
}
