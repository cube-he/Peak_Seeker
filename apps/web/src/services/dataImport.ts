import api from './api';

export interface FetchPageResult {
  url: string;
  title: string;
  image_urls: string[];
  image_count: number;
}

export interface ScoreRow {
  score: number;
  count: number;
  cumulative_count: number;
}

export interface SupplementaryRow {
  exam_type: string;           // 考试类型：历史类/物理类
  enrollment_type: string;     // 招生类型：国家公费师范生等
  university_code: string;     // 院校代码
  university_name: string;     // 院校名称
  university_location: string; // 院校地址
  university_note: string;     // 院校备注
  major_group_code: string;    // 专业组代码
  major_group_subject: string; // 再选科目要求
  major_group_plan: number;    // 专业组计划数
  major_code: string;          // 专业代码
  major_name: string;          // 专业名称
  major_note: string;          // 专业备注
  plan_count: number;          // 专业计划数
  tuition: string;             // 收费标准
  source_url?: string;         // 数据来源网页 URL
  page_number?: number;        // 数据所在页码
}

export interface OcrResult {
  total_rows: number;
  score_range: string;
  is_valid: boolean;
  errors: string[];
  data: ScoreRow[];
}

export interface SupplementaryOcrResult {
  total_rows: number;
  university_count: number;
  major_group_count: number;
  is_valid: boolean;
  errors: string[];
  data: SupplementaryRow[];
}

export interface ConflictItem {
  ocr: SupplementaryRow;
  ai: SupplementaryRow;
  diff: {
    plan_count: boolean;
    tuition: boolean;
  };
}

export interface CompareResult {
  matched: SupplementaryRow[];
  ocr_only: SupplementaryRow[];
  ai_only: SupplementaryRow[];
  conflicts: ConflictItem[];
  summary: {
    total_ocr: number;
    total_ai: number;
    matched_count: number;
    conflict_count: number;
    ocr_only_count: number;
    ai_only_count: number;
  };
}

export interface SupplementaryOcrWithAIResult {
  total_rows: number;
  university_count: number;
  major_group_count: number;
  is_valid: boolean;
  errors: string[];
  data: SupplementaryRow[];
  ai_enabled: boolean;
  comparison: CompareResult | null;
  conflicts_count: number;
  needs_review: boolean;
}

export interface ImportStats {
  year: number;
  province: string;
  examType: string;
  count: number;
  minScore: number;
  maxScore: number;
}

/** 检查服务状态 */
export async function checkImportHealth(): Promise<{
  server: boolean;
  ocrService: boolean;
}> {
  return api.get('/data-import/health');
}

/** 抓取页面提取图片 */
export async function fetchPage(
  url: string,
  dataType = 'score_segment',
): Promise<FetchPageResult> {
  return api.post('/data-import/fetch', { url, dataType }, {
    timeout: 60 * 1000, // 抓取页面最多等 1 分钟
  });
}

/** 执行 OCR 识别（耗时较长，使用独立超时） */
export async function runOcr(params: {
  imageUrls: string[];
  dataType?: string;
  year: number;
  province?: string;
  examType?: string;
  batch?: string;
  sourceUrl?: string;  // 数据来源网页 URL
}): Promise<OcrResult | (SupplementaryOcrResult & { image_data_counts?: number[] })> {
  return api.post('/data-import/ocr', params, {
    timeout: 5 * 60 * 1000, // OCR 识别最多等 5 分钟
  });
}

/** AI 校验状态 */
export type VerifyStatus = 'matched' | 'conflict' | 'ai_only' | 'ocr_only' | 'timeout' | 'error';

/** 带校验状态的数据行 */
export interface VerifiedRow {
  data: SupplementaryRow;
  status: VerifyStatus;
  ai_data?: SupplementaryRow;  // 冲突时的 AI 数据
  diff_fields?: string[];  // 冲突的字段
}

/** AI 校验响应 */
export interface AiVerifyResponse {
  verified_rows: VerifiedRow[];
  summary: Record<VerifyStatus, number>;
  ai_raw_count: number;
  error_message: string;
}

/** 单张图片 AI 验证（用于逐张校验） */
export async function runAiVerifySingle(params: {
  imageUrl: string;
  ocrData?: SupplementaryRow[];  // 该图片的 OCR 识别数据
  year: number;
  province?: string;
  examType?: string;
  batch?: string;
  aiConfigId?: string;
  aiApiKey?: string;
  aiBaseUrl?: string;
  aiModel?: string;
}): Promise<AiVerifyResponse> {
  return api.post('/data-import/ai-verify-single', params, {
    timeout: 3 * 60 * 1000, // 单张图片 AI 验证最多 3 分钟
  });
}

/** 执行 OCR + AI 双重识别（仅支持征集志愿） */
export async function runOcrWithAI(params: {
  imageUrls: string[];
  year: number;
  province?: string;
  examType?: string;
  batch?: string;
  sourceUrl?: string;  // 数据来源网页 URL
  aiConfigId?: string;  // 本地 AI 配置 ID
  aiApiKey?: string;
  aiBaseUrl?: string;
  aiModel?: string;
}): Promise<SupplementaryOcrWithAIResult> {
  return api.post('/data-import/ocr-with-ai', {
    ...params,
    dataType: 'supplementary',
    enableAi: true,
  }, {
    timeout: 10 * 60 * 1000, // AI 校验需要更长时间
  });
}

/** 保存一分一段数据到数据库 */
export async function saveImportData(params: {
  year: number;
  province?: string;
  examType?: string;
  dataType?: string;
  data: { score: number; count: number; cumulativeCount: number }[];
}): Promise<{ success: boolean; affectedRows: number }> {
  return api.post('/data-import/save', params);
}

/** 保存征集志愿数据到数据库 */
export async function saveSupplementaryData(params: {
  year: number;
  province?: string;
  examType?: string;
  batch?: string;
  data: SupplementaryRow[];
}): Promise<{ success: boolean; affectedRows: number; message: string }> {
  return api.post('/data-import/save-supplementary', params);
}

/** 获取导入统计 */
export async function getImportStats(): Promise<ImportStats[]> {
  return api.get('/data-import/stats');
}

// ==================== AI 配置管理 ====================

export interface AiConfig {
  id: string;
  name: string;
  provider: string;
  apiBaseUrl?: string;
  modelName?: string;
  isDefault: boolean;
  isActive: boolean;
  models: {
    id: string;
    modelName: string;
    displayName?: string;
    isDefault: boolean;
  }[];
  createdAt: string;
  updatedAt: string;
}

/** 获取所有 AI 配置 */
export async function getAiConfigs(): Promise<{ configs: AiConfig[] }> {
  return api.get('/ai-config');
}

/** 获取默认 AI 配置 */
export async function getDefaultAiConfig(): Promise<AiConfig> {
  return api.get('/ai-config/default');
}

/** 创建 AI 配置 */
export async function createAiConfig(data: {
  name: string;
  provider: string;
  apiKey: string;
  apiBaseUrl?: string;
  modelName?: string;
  isDefault?: boolean;
}): Promise<AiConfig> {
  return api.post('/ai-config', data);
}

/** 更新 AI 配置 */
export async function updateAiConfig(
  id: string,
  data: {
    name?: string;
    apiKey?: string;
    apiBaseUrl?: string;
    modelName?: string;
    isDefault?: boolean;
    isActive?: boolean;
  },
): Promise<AiConfig> {
  return api.put(`/ai-config/${id}`, data);
}

/** 删除 AI 配置 */
export async function deleteAiConfig(id: string): Promise<{ success: boolean }> {
  return api.delete(`/ai-config/${id}`);
}

// ==================== 多引擎交叉校验 ====================

/** 引擎结果摘要 */
export interface EngineResultSummary {
  engine: string;
  success: boolean;
  record_count: number;
  error: string;
}

/** 字段差异 */
export interface FieldDiff {
  field_name: string;
  values: Record<string, string>;
  is_consistent: boolean;
  majority_value: string;
}

/** 单条记录校验结果 */
export interface RecordValidationResult {
  record_key: string;
  confidence: 'high' | 'medium' | 'low' | 'conflict' | 'single';
  review_status: 'auto_approved' | 'pending_review';
  merged_data: Record<string, unknown>;
  engine_sources: string[];
  conflict_fields: string[];
  field_diffs: FieldDiff[];
  review_note: string;
}

/** 多引擎校验响应 */
export interface MultiEngineValidationResponse {
  engines_used: string[];
  engines_success: string[];
  engines_failed: Record<string, string>;
  engine_results: EngineResultSummary[];
  total_records: number;
  high_confidence: number;
  medium_confidence: number;
  low_confidence: number;
  conflicts: number;
  auto_approved_count: number;
  pending_review_count: number;
  approved_data: SupplementaryRow[];
  pending_review_data: RecordValidationResult[];
  is_valid: boolean;
  errors: string[];
}

/** 多引擎交叉校验 OCR */
export async function runMultiEngineOcr(params: {
  imageUrls: string[];
  dataType?: string;
  year: number;
  province?: string;
  examType?: string;
  batch?: string;
  enableBaidu?: boolean;
  enablePaddleocr?: boolean;
  enableRapid?: boolean;
  enableAi?: boolean;
  aiApiKey?: string;
  aiBaseUrl?: string;
  aiModel?: string;
}): Promise<MultiEngineValidationResponse> {
  return api.post('/data-import/ocr-multi-engine', params, {
    timeout: 10 * 60 * 1000, // 多引擎校验需要更长时间
  });
}
