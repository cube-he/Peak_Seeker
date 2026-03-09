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
  university_code: string;
  university_name: string;
  major_code: string;
  major_name: string;
  plan_count: number;
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
  is_valid: boolean;
  errors: string[];
  data: SupplementaryRow[];
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
