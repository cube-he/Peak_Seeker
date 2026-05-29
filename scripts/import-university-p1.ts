/**
 * P1 院校增强数据导入
 *
 * 来源: data/03_专家版主表/output/院校全量数据_多Sheet.xlsx
 *   - 01_基础名录   → is101Plan, isQiangji, hasGraduateSchool, hasPostgradRecommend, firstClassCategory
 *   - 02_详情扩展   → 学科建设详情 (counts + 列表 + 教育部学科评估解析)
 *   - 05_招生章程   → 10 个 charter* 结构化字段
 *   - 06_就业流向   → signing* 三个 Json 字段
 *
 * 匹配: 用「规范化名」精确匹配 University.name
 *
 * 用法:
 *   DATABASE_URL=mysql://... npx tsx scripts/import-university-p1.ts
 *   或在仓库根创建 apps/server/.env 含 DATABASE_URL=... 后:
 *   npx tsx scripts/import-university-p1.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

// === env 加载 (同 import-enriched.ts) ===
// 同时探测 ../apps/server/.env（仓库根布局）和 ../.env（脚本在 apps/server/scripts/ 时）
if (!process.env.DATABASE_URL) {
  const candidates = [
    path.resolve(__dirname, '../apps/server/.env'),
    path.resolve(__dirname, '../.env'),
  ];
  for (const envPath of candidates) {
    if (fs.existsSync(envPath)) {
      const lines = fs.readFileSync(envPath, 'utf8').split('\n');
      for (const line of lines) {
        const match = line.match(/^([A-Z_]+)\s*=\s*"?([^"]+)"?\s*$/);
        if (match && !process.env[match[1]]) {
          process.env[match[1]] = match[2];
        }
      }
      break;
    }
  }
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('Error: DATABASE_URL 未设置');
  process.exit(1);
}
const adapter = new PrismaMariaDb(DATABASE_URL);
const prisma = new PrismaClient({ adapter } as any);

// 允许部署到不同目录布局时通过 env 覆盖（生产服务器上从 apps/server/scripts 跑时尤其需要）
const EXCEL_PATH = process.env.EXCEL_PATH
  ? path.resolve(process.env.EXCEL_PATH)
  : path.resolve(__dirname, '../data/03_专家版主表/output/院校全量数据_多Sheet.xlsx');

// ==================== 工具 ====================

function toStr(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

function toInt(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = parseInt(String(v), 10);
  return isNaN(n) ? null : n;
}

function yesNoToBool(v: unknown): boolean {
  // 数据里全部是 "是"/"否"，少量 null（按 false 处理）
  return String(v).trim() === '是';
}

/** 解析 "[\\'985\\', \\'211\\', ...]" 这种 Python list 字符串为数组 */
function parsePyList(v: unknown): string[] | null {
  if (!v) return null;
  const raw = String(v).trim();
  if (!raw || raw === '[]') return null;
  try {
    // Python repr 用单引号；先粗暴替换为双引号再 JSON.parse
    return JSON.parse(raw.replace(/'/g, '"'));
  } catch {
    return null;
  }
}

/** 解析 "A+:5, A:10, A-:10" 为 {A+:5, A:10, ...} */
function parseDisciplineEval(v: unknown): Record<string, number> | null {
  if (!v) return null;
  const raw = String(v).trim();
  if (!raw) return null;
  const out: Record<string, number> = {};
  for (const part of raw.split(/[,，]/)) {
    const m = part.trim().match(/^([A-D][+-]?)\s*[:：]\s*(\d+)$/);
    if (m) out[m[1]] = parseInt(m[2], 10);
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** 解析专业列表，分隔符 `；` 或 `;` 都支持；去掉 [省] 等前缀标记 */
function parseMajorList(v: unknown): string[] | null {
  if (!v) return null;
  const raw = String(v).trim();
  if (!raw) return null;
  const items = raw
    .split(/[；;]/)
    .map((s) => s.trim())
    .filter(Boolean);
  return items.length > 0 ? items : null;
}

/** 解析 "其他省市：8.78%、京外直辖市：1.08%、..." → [{name, percent}] */
function parsePercentList(v: unknown): { name: string; percent: number }[] | null {
  if (!v) return null;
  const raw = String(v).trim();
  if (!raw) return null;
  const out: { name: string; percent: number }[] = [];
  for (const part of raw.split(/[、,，]/)) {
    const m = part.trim().match(/^(.+?)[:：]\s*([\d.]+)%?$/);
    if (m) {
      const percent = parseFloat(m[2]);
      if (!isNaN(percent)) out.push({ name: m[1].trim(), percent });
    }
  }
  return out.length > 0 ? out : null;
}

/** 解析 "中国工商银行：34人、招商银行：18人、..." → [{name, count}] */
function parseEmployerList(v: unknown): { name: string; count: number }[] | null {
  if (!v) return null;
  const raw = String(v).trim();
  if (!raw) return null;
  const out: { name: string; count: number }[] = [];
  for (const part of raw.split(/[、,，]/)) {
    const m = part.trim().match(/^(.+?)[:：]\s*(\d+)人?$/);
    if (m) {
      const count = parseInt(m[2], 10);
      if (!isNaN(count)) out.push({ name: m[1].trim(), count });
    }
  }
  return out.length > 0 ? out : null;
}

// ==================== Excel 读取 ====================

type RowDict = Record<string, unknown>;

function readSheet(sheetName: string): RowDict[] {
  const wb = XLSX.readFile(EXCEL_PATH);
  const ws = wb.Sheets[sheetName];
  if (!ws) {
    throw new Error(`Sheet 不存在: ${sheetName}`);
  }
  return XLSX.utils.sheet_to_json<RowDict>(ws, { defval: null });
}

// ==================== 主流程 ====================

interface NormalizedRecord {
  // 身份/资质
  is101Plan: boolean;
  isQiangji: boolean;
  hasGraduateSchool: boolean;
  hasPostgradRecommend: boolean;
  firstClassCategory: string | null;
  // 学科建设
  keyLabCount: number | null;
  doubleFirstClassSubjectCount: number | null;
  nationalFeatureMajorCount: number | null;
  provincialFeatureMajorCount: number | null;
  disciplineEvaluationDetail: Record<string, number> | null;
  nationalFeatureMajors: string[] | null;
  provincialFeatureMajors: string[] | null;
  doubleFirstClassMajors: string[] | null;
  // 招生章程
  charterFilingRatio: string | null;
  charterMajorAssignment: string | null;
  charterTiebreakRule: string | null;
  charterForeignLangReq: string | null;
  charterSubjectReq: string | null;
  charterPhysicalLimit: string | null;
  charterBonusPolicy: string | null;
  charterTuitionDesc: string | null;
  charterTransferLimit: string | null;
  charterAcceptAdjust: string | null;
  // 就业流向
  signingRegionFlow: { name: string; percent: number }[] | null;
  signingUnitNature: { name: string; percent: number }[] | null;
  mainEmployers: { name: string; count: number }[] | null;
  mainEmployersNote: string | null;
}

function buildRecordMap(): Map<string, Partial<NormalizedRecord>> {
  const map = new Map<string, Partial<NormalizedRecord>>();
  const get = (name: string): Partial<NormalizedRecord> => {
    if (!map.has(name)) map.set(name, {});
    return map.get(name)!;
  };

  console.log('  Reading 01_基础名录 ...');
  for (const row of readSheet('01_基础名录')) {
    const name = toStr(row['规范化名']);
    if (!name) continue;
    const r = get(name);
    r.is101Plan = yesNoToBool(row['是否101计划']);
    r.isQiangji = yesNoToBool(row['是否强基计划']);
    r.hasGraduateSchool = yesNoToBool(row['有研究生院']);
    r.hasPostgradRecommend = yesNoToBool(row['有保研资格']);
    r.firstClassCategory = toStr(row['一流大学类别']);
  }

  console.log('  Reading 02_详情扩展 ...');
  for (const row of readSheet('02_详情扩展')) {
    const name = toStr(row['规范化名']);
    if (!name) continue;
    const r = get(name);
    r.keyLabCount = toInt(row['重点实验室数']);
    r.doubleFirstClassSubjectCount = toInt(row['双一流学科数']);
    r.nationalFeatureMajorCount = toInt(row['国家级特色专业数']);
    r.provincialFeatureMajorCount = toInt(row['省级特色专业数']);
    r.disciplineEvaluationDetail = parseDisciplineEval(row['教育部学科评估']);
    r.nationalFeatureMajors = parseMajorList(row['国家级特色专业']);
    r.provincialFeatureMajors = parseMajorList(row['省级特色专业']);
    r.doubleFirstClassMajors = parseMajorList(row['双一流专业']);
  }

  console.log('  Reading 05_招生章程 ...');
  for (const row of readSheet('05_招生章程')) {
    const name = toStr(row['规范化名']);
    if (!name) continue;
    if (toStr(row['是否有章程']) !== '是') continue;
    const r = get(name);
    r.charterFilingRatio = toStr(row['调档比例']);
    r.charterMajorAssignment = toStr(row['专业分配规则']);
    r.charterTiebreakRule = toStr(row['同分规则']);
    r.charterForeignLangReq = toStr(row['外语要求']);
    r.charterSubjectReq = toStr(row['单科要求']);
    r.charterPhysicalLimit = toStr(row['体检限制']);
    r.charterBonusPolicy = toStr(row['加分政策']);
    r.charterTuitionDesc = toStr(row['学费']);
    r.charterTransferLimit = toStr(row['转专业限制']);
    r.charterAcceptAdjust = toStr(row['服从调剂']);
  }

  console.log('  Reading 06_就业流向 ...');
  for (const row of readSheet('06_就业流向')) {
    const name = toStr(row['规范化名']);
    if (!name) continue;
    const r = get(name);
    r.signingRegionFlow = parsePercentList(row['毕业生签约地区流向']);
    r.signingUnitNature = parsePercentList(row['毕业生签约单位性质']);
    r.mainEmployers = parseEmployerList(row['主要签约单位']);
    r.mainEmployersNote = toStr(row['主要签约单位说明']);
  }

  return map;
}

async function main() {
  console.log('=== P1 院校增强数据导入 ===');
  console.log(`Excel: ${EXCEL_PATH}`);

  if (!fs.existsSync(EXCEL_PATH)) {
    console.error(`Excel 文件不存在: ${EXCEL_PATH}`);
    process.exit(1);
  }

  console.log('\n[1/2] 解析 Excel ...');
  const map = buildRecordMap();
  console.log(`  解析到 ${map.size} 个院校的 P1 数据`);

  console.log('\n[2/2] 写入数据库 ...');
  let updated = 0;
  let notFound = 0;
  const unmatched: string[] = [];

  for (const [name, data] of map.entries()) {
    const result = await prisma.university.updateMany({
      where: { name },
      data: {
        // 注意：所有字段都允许 undefined skip，Prisma 不会写入 undefined
        is101Plan: data.is101Plan ?? false,
        isQiangji: data.isQiangji ?? false,
        hasGraduateSchool: data.hasGraduateSchool ?? false,
        hasPostgradRecommend: data.hasPostgradRecommend ?? false,
        firstClassCategory: data.firstClassCategory ?? null,
        keyLabCount: data.keyLabCount ?? null,
        doubleFirstClassSubjectCount: data.doubleFirstClassSubjectCount ?? null,
        nationalFeatureMajorCount: data.nationalFeatureMajorCount ?? null,
        provincialFeatureMajorCount: data.provincialFeatureMajorCount ?? null,
        ...(data.disciplineEvaluationDetail !== undefined && {
          disciplineEvaluationDetail: data.disciplineEvaluationDetail as any,
        }),
        ...(data.nationalFeatureMajors !== undefined && {
          nationalFeatureMajors: data.nationalFeatureMajors as any,
        }),
        ...(data.provincialFeatureMajors !== undefined && {
          provincialFeatureMajors: data.provincialFeatureMajors as any,
        }),
        ...(data.doubleFirstClassMajors !== undefined && {
          doubleFirstClassMajors: data.doubleFirstClassMajors as any,
        }),
        charterFilingRatio: data.charterFilingRatio ?? null,
        charterMajorAssignment: data.charterMajorAssignment ?? null,
        charterTiebreakRule: data.charterTiebreakRule ?? null,
        charterForeignLangReq: data.charterForeignLangReq ?? null,
        charterSubjectReq: data.charterSubjectReq ?? null,
        charterPhysicalLimit: data.charterPhysicalLimit ?? null,
        charterBonusPolicy: data.charterBonusPolicy ?? null,
        charterTuitionDesc: data.charterTuitionDesc ?? null,
        charterTransferLimit: data.charterTransferLimit ?? null,
        charterAcceptAdjust: data.charterAcceptAdjust ?? null,
        ...(data.signingRegionFlow !== undefined && {
          signingRegionFlow: data.signingRegionFlow as any,
        }),
        ...(data.signingUnitNature !== undefined && {
          signingUnitNature: data.signingUnitNature as any,
        }),
        ...(data.mainEmployers !== undefined && {
          mainEmployers: data.mainEmployers as any,
        }),
        mainEmployersNote: data.mainEmployersNote ?? null,
      },
    });

    if (result.count > 0) {
      updated += result.count;
    } else {
      notFound++;
      if (unmatched.length < 20) unmatched.push(name);
    }
  }

  console.log(`\n  Updated: ${updated} universities`);
  console.log(`  Not found in DB: ${notFound}`);
  if (unmatched.length > 0) {
    console.log(`  示例未匹配 (前 20):`);
    for (const n of unmatched) console.log(`    - ${n}`);
  }

  console.log('\n=== Import Complete ===');
}

main()
  .catch((err) => {
    console.error('Import failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
