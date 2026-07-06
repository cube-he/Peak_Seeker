import api from './api';

export interface GeneratePlanParams {
  batch: string;
  rushRatio?: number;
  stableRatio?: number;
  safeRatio?: number;
  examSource?: string;
}

export interface CreatePlanForStudentParams {
  batchConfigId: number;
  name?: string;
  notes?: string;
}

export interface CandidateListParams {
  page?: number;
  pageSize?: number;
  keyword?: string; // 旧接口兼容: 院校/专业合并搜索
  keywordUniversity?: string; // 院校名搜索 (新拆分)
  keywordMajor?: string; // 专业名搜索 (新拆分); 同时填则 AND 组合
  includeSoftFails?: boolean;
}

// 排序「轴」(GROUP 视图); 方向由 sortDir 单独控制。MAJOR_MATCH 综合推荐无方向。
export type CandidateGroupSort =
  | 'MAJOR_MATCH'
  | 'SAFETY'
  | 'MAJOR_MIN_SCORE'
  | 'UNIVERSITY_RANK'
  | 'PLAN_COUNT_CHANGE'
  | 'SUPPLEMENTARY';

// 排序方向: DESC = 该轴默认(好的/分高/最稳在前), ASC = 翻转
export type CandidateSortDir = 'ASC' | 'DESC';

// 院校优先视图 (groupBy=UNIVERSITY) 的排序
export type CandidateUniversitySort =
  | 'UNIVERSITY_OVERALL'
  | 'UNIVERSITY_RANK'
  | 'REGION_FIRST'
  | 'UNIVERSITY_TIER';

export interface CandidateGroupListParams extends CandidateListParams {
  sort?: CandidateGroupSort | CandidateUniversitySort;
  // GROUP 视图排序方向: DESC=轴默认, ASC=翻转 (院校视图不传)
  sortDir?: CandidateSortDir;
  // 组名/定向县搜索 (提前批公费定向按县筛组)
  keywordGroup?: string;
  // 专业备注搜索 (planNotes LIKE; 体检/学费/中外合作方向等)
  keywordPlanNotes?: string;
  // 梯度档位过滤 (全池口径, 服务端分页前生效); 不传 = 全部
  gradientBand?: 'RUSH' | 'STABLE' | 'SAFE' | 'NO_LINE';
  // 意向梯队过滤 (0 / undefined = 不过滤, 1+ = 该梯队号)
  tier?: number;
  // 是否隐藏已加入当前 plan 的院校组 (默认 true)
  excludeAdded?: boolean;
  // 仅显示已加入当前 plan 的院校组(复盘); true 优先于 excludeAdded
  onlyAdded?: boolean;
  // 客观纯净度过滤. 空数组或 undefined = 不过滤; ['S','A'] = 仅显示干净/较纯
  purity?: string[];
  // 招生类型过滤. 空数组/undefined = 不过滤; ['普通类本科'] = 仅该类
  recruitType?: string[];
  // 视图模式: 不传/GROUP = 专业组卡; UNIVERSITY = 院校卡上卷
  groupBy?: 'GROUP' | 'UNIVERSITY';
  // 办学性质过滤 (两视图通用): public/private/sinoForeign/hkMacau/independent, 不传=全部
  nature?: 'public' | 'private' | 'sinoForeign' | 'hkMacau' | 'independent';
  // 中外合作办学过滤 (only=只看, exclude=排除, 不传=全部)
  sinoForeign?: 'only' | 'exclude';
  // 院校标签 CSV: 985 / 211 / doubleFirstClass; 多选 AND
  tags?: string;
  // 院校背景 CSV: 九校联盟 / 卓越大学联盟 / 国防七子 / 兵工七子 / 法学五院四系 / 六大农林 / 电气二龙四虎
  backgrounds?: string;
  // 院校所在省 CSV
  universityProvinces?: string;
  // 院校所在市 CSV
  universityCities?: string;
  // 新增院校/专业: major=组含 isNew 专业, university=院校首次在川招生, either=任一
  isNewItem?: 'major' | 'university' | 'either';
  // 是否展开"非意向地区"院校组 (默认 false=折叠隐藏); 仅 GROUP 视图
  includeRegionMismatch?: boolean;
  // 是否带出"硬规则不符"(资格不符)放各组 hardFailMajors 桶(灰显+禁加入); 默认不带
  includeHardFails?: boolean;
  // 是否把过高(够不着)/过低 noise 组也放出来(建池层默认丢掉); "显示全部"置 true
  includeOutOfReach?: boolean;
  minScore?: number;
  maxScore?: number;
}

export interface TeacherPlanListParams {
  search?: string;
  batch?: string;
  status?: string;
  studentId?: string;
  page?: number;
  pageSize?: number;
}

export interface StudentPlanListParams {
  batchConfigId?: number;
  latest?: boolean;
}

export const planApi = {
  // Teacher endpoints
  getTeacherPlans(params?: TeacherPlanListParams): Promise<any> {
    return api.get('/plans/teacher', {
      params: {
        search: params?.search?.trim() || undefined,
        batch: params?.batch || undefined,
        status: params?.status || undefined,
        studentId: params?.studentId || undefined,
        page: params?.page,
        pageSize: params?.pageSize,
      },
    }) as any;
  },

  generate(studentId: string, params: GeneratePlanParams): Promise<any> {
    return api.post(`/plans/generate/${studentId}`, params) as any;
  },

  createForStudent(studentId: string, data: CreatePlanForStudentParams): Promise<any> {
    return api.post(`/students/${studentId}/plans`, data) as any;
  },

  listForStudent(studentId: string, params?: StudentPlanListParams): Promise<any> {
    return api.get(`/students/${studentId}/plans`, {
      params: {
        batchConfigId: params?.batchConfigId,
        latest: params?.latest,
      },
    }) as any;
  },

  getCandidates(planId: string | number, params?: CandidateListParams): Promise<any> {
    return api.get(`/plans/${planId}/candidates`, {
      params: {
        page: params?.page ?? 1,
        pageSize: params?.pageSize ?? 30,
        keyword: params?.keyword?.trim() || undefined,
        includeSoftFails: params?.includeSoftFails,
      },
    }) as any;
  },

  getCandidateGroups(planId: string | number, params?: CandidateGroupListParams): Promise<any> {
    return api.get(`/plans/${planId}/candidate-groups`, {
      params: {
        page: params?.page ?? 1,
        pageSize: params?.pageSize ?? 20,
        keyword: params?.keyword?.trim() || undefined,
        keywordUniversity: params?.keywordUniversity?.trim() || undefined,
        keywordMajor: params?.keywordMajor?.trim() || undefined,
        keywordGroup: params?.keywordGroup?.trim() || undefined,
        keywordPlanNotes: params?.keywordPlanNotes?.trim() || undefined,
        gradientBand: params?.gradientBand,
        includeSoftFails: params?.includeSoftFails,
        sort: params?.sort ?? 'MAJOR_MATCH',
        sortDir: params?.sortDir,
        tier: params?.tier,
        excludeAdded: params?.excludeAdded,
        onlyAdded: params?.onlyAdded ? true : undefined,
        purity: params?.purity && params.purity.length > 0 && params.purity.length < 4
          ? params.purity.join(',')
          : undefined,
        recruitType: params?.recruitType && params.recruitType.length > 0
          ? params.recruitType.join(',')
          : undefined,
        groupBy: params?.groupBy,
        nature: params?.nature,
        sinoForeign: params?.sinoForeign,
        tags: params?.tags || undefined,
        backgrounds: params?.backgrounds || undefined,
        universityProvinces: params?.universityProvinces || undefined,
        universityCities: params?.universityCities || undefined,
        isNewItem: params?.isNewItem,
        includeRegionMismatch: params?.includeRegionMismatch,
        includeHardFails: params?.includeHardFails,
        includeOutOfReach: params?.includeOutOfReach ? true : undefined,
        minScore: params?.minScore,
        maxScore: params?.maxScore,
      },
    }) as any;
  },

  getById(id: string): Promise<any> {
    return api.get(`/plans/${id}`) as any;
  },

  addItem(planId: string | number, data: Record<string, unknown>): Promise<any> {
    return api.post(`/plans/${planId}/items`, data) as any;
  },

  updateItem(planId: string | number, itemId: string | number, data: Record<string, unknown>): Promise<any> {
    return api.patch(`/plans/${planId}/items/${itemId}`, data) as any;
  },

  updatePlan(id: string, data: Record<string, unknown>): Promise<any> {
    return api.put(`/plans/${id}`, data) as any;
  },

  deletePlan(id: string | number): Promise<any> {
    return api.delete(`/plans/${id}`) as any;
  },

  deleteItem(planId: string | number, itemId: number): Promise<any> {
    return api.delete(`/plans/${planId}/items/${itemId}`) as any;
  },

  /** 清空该方案全部志愿项 (DELETE /plans/:planId/items) */
  clearItems(planId: string | number): Promise<any> {
    return api.delete(`/plans/${planId}/items`) as any;
  },

  /**
   * 重排志愿顺序 (POST /plans/:planId/items/reorder)
   * itemIds: 按目标新顺序排好的 item.id 数组, 后端把 sequence 重写为索引+1
   */
  reorderItems(planId: string | number, itemIds: number[]): Promise<any> {
    return api.post(`/plans/${planId}/items/reorder`, { itemIds }) as any;
  },

  submitForReview(id: string, underfillReason?: string): Promise<any> {
    return api.post(`/plans/${id}/submit-review`, underfillReason ? { underfillReason } : undefined) as any;
  },

  /** 撤回审核(PENDING_REVIEW → DRAFT, 仅出方案老师; 主管认领后不可撤) */
  withdrawReview(id: string, reason?: string): Promise<any> {
    return api.post(`/plans/${id}/withdraw-review`, reason ? { reason } : undefined) as any;
  },

  /**
   * 派生新版本(拷贝 PlanItem,状态回 DRAFT)。
   * DRAFT 初稿派生 = 另存为二稿(初稿自动置 OUTDATED 只读); REJECTED 同理继续通道。
   * versionNote: 可选版本备注(如"二稿—删A加B")。
   */
  deriveVersion(id: string | number, versionNote?: string): Promise<any> {
    return api.post(`/plans/${id}/derive-version`, versionNote ? { versionNote } : undefined) as any;
  },

  startReview(id: string): Promise<any> {
    return api.post(`/plans/${id}/start-review`) as any;
  },

  reviewPlan(id: string, data: { action: 'APPROVE' | 'REJECT' | 'REQUEST_CHANGE' | 'COMMENT'; comment?: string; itemAnnotations?: Array<{ sequence: number; annotation: string }> }): Promise<any> {
    return api.post(`/plans/${id}/review`, data) as any;
  },

  // 获取当前用户对该方案的审核草稿，返回 null 表示未保存过草稿
  // NOTE: api.ts response interceptor already returns response.data; do NOT
  // re-access .data on the awaited value — that yields undefined.
  async getReviewDraft(planId: number | string): Promise<null | {
    id: number;
    planId: number;
    reviewerId: number;
    comment: string | null;
    itemAnnotations: { sequence: number; annotation: string }[] | null;
    updatedAt: string;
  }> {
    return (await api.get(`/plans/${planId}/review-draft`)) as any;
  },

  async upsertReviewDraft(
    planId: number | string,
    payload: {
      comment?: string;
      itemAnnotations?: { sequence: number; annotation: string }[];
    },
  ): Promise<any> {
    return await api.put(`/plans/${planId}/review-draft`, payload);
  },

  async deleteReviewDraft(planId: number | string): Promise<{ ok: true }> {
    return (await api.delete(`/plans/${planId}/review-draft`)) as unknown as { ok: true };
  },

  async getVersions(planId: number | string) {
    return (await api.get(`/plans/${planId}/versions`)) as unknown as {
      current: number;
      versions: Array<{
        id: number;
        versionNo: number;
        versionNote: string | null;
        status: string;
        parentVersionId: number | null;
        createdAt: string;
        updatedAt: string;
        name: string;
        isFinal: boolean;
      }>;
    };
  },

  approvePlan(id: string, comment?: string): Promise<any> {
    return api.post(`/plans/${id}/review`, { action: 'APPROVE', comment }) as any;
  },

  finalizePlan(id: string): Promise<any> {
    return api.post(`/plans/${id}/finalize`) as any;
  },

  /**
   * 导出方案 Excel(走 recommend 模块的 exceljs 实现, 不依赖 puppeteer/chrome)
   * format: excel_full = A3 24 列完整版; excel_compact = A4 12 列精简版
   */
  async exportExcel(planId: number | string, format: 'excel_full' | 'excel_compact' = 'excel_full') {
    return (await api.post(
      `/recommend/plans/${planId}/export`,
      { format },
      { responseType: 'blob' },
    )) as unknown as Blob;
  },

  getExportRows(planId: number | string): Promise<any> {
    return api.get(`/plans/${planId}/export-rows`) as any;
  },

  getDormSheet(planId: number | string): Promise<any> {
    return api.get(`/plans/${planId}/dorm-sheet`) as any;
  },

  async getRisks(planId: number | string) {
    return (await api.get(`/plans/${planId}/risks`)) as unknown as Array<{
      id: number;
      planItemId: number;
      ruleCode: string;
      severity: 'critical' | 'moderate' | 'minor';
      category: string;
      message: string;
      detail: any;
      resolvedAt: string | null;
      resolution: string | null;
      planItem: { sequence: number; universityName: string; majorName: string };
    }>;
  },

  async recomputeRisks(planId: number | string) {
    return await api.post(`/plans/${planId}/risks/recompute`);
  },

  async resolveRisk(riskId: number, resolution: 'accepted' | 'replaced' | 'ignored', note?: string) {
    return await api.post(`/plans/risks/${riskId}/resolve`, { resolution, note });
  },

  // 方案导出 PDF
  exportPlan(id: string): Promise<any> {
    return api.get(`/plans/${id}/export.pdf`, { responseType: 'blob' }) as any;
  },

  // Student endpoints
  getMyPlans(): Promise<any> {
    return api.get('/plans/mine') as any;
  },

  confirmPlan(id: string): Promise<any> {
    return api.post(`/plans/${id}/parent-confirm`) as any;
  },

  requestChange(id: string, comment: string): Promise<any> {
    return api.post(`/plans/${id}/parent-request-change`, { comment }) as any;
  },
};
