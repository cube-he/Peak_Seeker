import api from './api';

export interface CreateStudentDto {
  username: string;
  password: string;
  realName: string;
  phone?: string;
  gender?: 'MALE' | 'FEMALE';
}

export interface BonusItem {
  type: string;
  value: number;
  source?: string;
}

/**
 * UpdateStudentDto - 学生档案更新 DTO
 *
 * 字段权限说明：
 * - ① TEACHER_ONLY：仅老师/管理员可写（学生 PUT /me 时这些字段会被 403 拒绝）
 * - ② shared：学生与老师都可写
 * - ③ STUDENT_ONLY：仅学生端写
 *
 * 后端 field-policy 是单一真理来源；这里的注释是同步快照。
 */
export interface UpdateStudentDto {
  // ── 旧字段保留（向后兼容） ──
  realName?: string;
  phone?: string;
  gender?: string;
  examYear?: number;
  notes?: string;
  dataVersion?: number;

  // ── 基本信息 (②) ──
  parentPhone?: string;
  highSchool?: string;
  classInfo?: string;
  ethnicity?: string;
  politicalStatus?: 'PARTY_MEMBER' | 'LEAGUE_MEMBER' | 'MASSES';

  // ── 户籍 + 高考所在地 (② 学生 / 老师都可写，2026-05-06 redesign 已下放) ──
  province?: string;
  city?: string;
  county?: string;
  isRural?: boolean;
  examLocationProvince?: string;
  examLocationCity?: string;
  examLocationCounty?: string;

  // ── 考试成绩 (② 学生自填，仅 provincialRank ① 后端自动算) ──
  examType?: 'PHYSICS' | 'HISTORY' | 'COMPREHENSIVE_LIBERAL' | 'COMPREHENSIVE_SCIENCE';
  examSource?: 'REAL_EXAM' | 'MOCK_EXAM' | 'ESTIMATED';
  totalScore?: number;
  provincialRank?: number;
  scoreChinese?: number;
  scoreMath?: number;
  scoreEnglish?: number;
  scoreFirstChoice?: number;
  scoreSub1?: number;
  scoreSub2?: number;
  firstChoice?: string;
  reChoices?: string[];

  // ── 加分政策 (② 学生 / 老师都可写，2026-05-06 redesign 已下放) ──
  bonusPolicyStatus?: 'NONE' | 'HAS_BONUS' | 'UNKNOWN';
  bonusItems?: BonusItem[];

  // ── 身体条件 (②) ──
  height?: number;
  weight?: number;
  visionLeft?: number;
  visionRight?: number;
  visionLeftCorrected?: number;
  visionRightCorrected?: number;
  colorBlind?: boolean;
  colorWeak?: boolean;
  physicalLimits?: string[];
  medicalHistory?: string;

  // ── 升学规划 (②) ──
  priorityMode?: 'UNIVERSITY_FIRST' | 'MAJOR_FIRST' | 'CITY_FIRST' | 'BALANCED';
  careerPlan?: 'POSTGRADUATE' | 'EMPLOYMENT' | 'ABROAD' | 'PUBLIC_SERVANT' | 'UNDECIDED';
  careerDirection?: string;
  preferredBatches?: string[];
  militaryInterest?: boolean;
  teacherInterest?: boolean;

  // ── 偏好 (②) ──
  stayPreference?: 'LOCAL_ONLY' | 'PREFER_LOCAL' | 'NO_PREFERENCE' | 'PREFER_OUTSIDE';
  preferredProvinces?: string[];
  preferredCities?: string[];
  preferredMajors?: string[];
  preferredUniversities?: string[];
  preferredMajorCategories?: string[];
  preferredUniversityTypes?: string[];
  preferredTags?: string[];
  excludedProvinces?: string[];
  excludedCities?: string[];
  excludedUniversities?: string[];
  excludedMajors?: string[];
  excludedMajorCategories?: string[];
  acceptLevel?: 'STRICT' | 'MODERATE' | 'RELAXED' | 'UNDECIDED';
  remoteAreaAcceptance?: 'ABSOLUTELY_NO' | 'BACKUP_ONLY' | 'FAMOUS_OK' | 'GOOD_MAJOR_OK';
  coldMajorAcceptance?: 'ABSOLUTELY_NO' | 'FAMOUS_OK' | 'DEVELOPED_AREA_OK' | 'GOOD_PROSPECT_OK';

  // ── 经济条件 (②) ──
  tuitionBudget?: 'LOW' | 'MEDIUM' | 'HIGH' | 'UNLIMITED';
  acceptSinoForeign?: boolean;
  acceptPrivate?: 'STRICT' | 'MODERATE' | 'RELAXED' | 'UNDECIDED';
  acceptCooperation?: 'STRICT' | 'MODERATE' | 'RELAXED' | 'UNDECIDED';
  otherRequirements?: string;

  // ── 兴趣性格 (②) ──
  interests?: string[];
  personalityType?: string;
  selfDescription?: string;

  // ── 填表元信息 (③ 学生端独有) ──
  formFiller?: 'STUDENT' | 'PARENT' | 'TOGETHER';
  parentSignedAt?: string;
}

export interface StudentListParams {
  search?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

export interface EligibleBatch {
  batchConfigId: number;
  batchName: string;
  maxGroupCount: number;
  maxMajorPerGroup: number;
  volunteerMode: string;
  admissionOrder: number;
}

/**
 * 双轨完整度响应（与后端 ProgressService.compute 输出对齐）
 */
export interface ProfileProgress {
  studentSelfCompleteness: number;
  teacherDataCompleteness: number;
  stageProgress: {
    stage1: { filled: number; total: number; completed: boolean };
    stage2: { filled: number; total: number; completed: boolean };
    stage3: { filled: number; total: number; completed: boolean };
  };
  overallCompleteness: number;
  isRecommendable: boolean;
  missingFieldsForRecommend: string[];
}

export const studentApi = {
  // Teacher endpoints — manage students
  getList(params?: StudentListParams): Promise<any> {
    const query = {
      keyword: params?.search?.trim() || undefined,
      status: params?.status || undefined,
      page: params?.page,
      pageSize: params?.pageSize,
    };
    return api.get('/students', { params: query }) as any;
  },

  getById(id: string): Promise<any> {
    return api.get(`/students/${id}`) as any;
  },

  create(data: CreateStudentDto): Promise<any> {
    return api.post('/students', data) as any;
  },

  update(id: string, data: UpdateStudentDto): Promise<any> {
    return api.put(`/students/${id}/profile`, data) as any;
  },

  reviewIntake(id: string, data: { action: 'VERIFY' | 'REQUEST_CHANGE'; comment?: string }): Promise<any> {
    return api.post(`/students/${id}/intake-review`, data) as any;
  },

  delete(id: string): Promise<any> {
    return api.delete(`/students/${id}`) as any;
  },

  // ── Student self-service endpoints ──

  getMyProfile(): Promise<any> {
    return api.get('/students/me') as any;
  },

  updateMyProfile(data: UpdateStudentDto): Promise<any> {
    return api.put('/students/me', data) as any;
  },

  // 实际后端直接返回 ProfileProgress 对象 (无 {data: ...} 包装).
  // 类型签名之前是 {data: ProfileProgress} 是误标, 已和后端 curl 对齐.
  getMyProgress(): Promise<ProfileProgress> {
    return api.get('/students/me/progress') as any;
  },

  submitMyIntake(): Promise<any> {
    return api.post('/students/me/submit-intake') as any;
  },

  // ── Teacher: export intake form ──

  exportIntake(id: string): Promise<Blob> {
    return api.get(`/students/${id}/export-intake`, {
      responseType: 'blob',
    }) as any;
  },

  async getEligibleBatches(id: string): Promise<EligibleBatch[]> {
    // 后端 listEligibleForStudent 返回 { batches, intakeGap }
    // (旧版本直接返回数组, 兼容老 cache)
    const raw = (await api.get(`/students/${id}/eligible-batches`)) as any;
    if (Array.isArray(raw)) return raw as EligibleBatch[];
    return (raw?.batches ?? []) as EligibleBatch[];
  },

  // Light recommendation for student self-service
  quickRecommend(params: { score: number }): Promise<any> {
    return api.post('/recommend/quick', params) as any;
  },

  /** PUT /students/me — sends only the changed field(s); DTO fields all @IsOptional */
  patchMyProfile(data: Partial<UpdateStudentDto>): Promise<any> {
    return api.put('/students/me', data) as any;
  },

  /**
   * 获取学生资料字段变更日志(按时间倒序)
   */
  async getChangeLogs(
    studentId: number | string,
    params: { limit?: number; offset?: number; fieldKey?: string } = {},
  ) {
    const search = new URLSearchParams();
    if (params.limit) search.set('limit', String(params.limit));
    if (params.offset) search.set('offset', String(params.offset));
    if (params.fieldKey) search.set('fieldKey', params.fieldKey);
    const qs = search.toString();
    return (await api.get(
      `/students/${studentId}/change-logs${qs ? `?${qs}` : ''}`,
    )) as unknown as {
      logs: Array<{
        id: number;
        createdAt: string;
        studentId: number;
        changedById: number;
        actor: string;
        fieldKey: string;
        oldValue: string | null;
        newValue: string | null;
        changedBy: { id: number; realName: string | null; username: string };
      }>;
      total: number;
      limit: number;
      offset: number;
    };
  },
};
