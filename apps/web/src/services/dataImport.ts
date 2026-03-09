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
}): Promise<OcrResult | SupplementaryOcrResult> {
  return api.post('/data-import/ocr', params, {
    timeout: 5 * 60 * 1000, // OCR 识别最多等 5 分钟
  });
}

/** 执行 OCR + AI 双重识别（仅支持征集志愿） */
export async function runOcrWithAI(params: {
  imageUrls: string[];
  year: number;
  province?: string;
  examType?: string;
  batch?: string;
  aiApiKey?: string;
  aiBaseUrl?: string;
  aiModel?: string;
  caConfigId?: string;  // CourseAssistant AI 配置 ID
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
