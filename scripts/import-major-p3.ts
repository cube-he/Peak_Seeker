/**
 * P3 专业增强数据导入
 *
 * 来源: data/03_专家版主表/output/专业全量数据_多Sheet.xlsx
 *   - 01_专业字典 (3007 行)   -> majors 字典扩展 + 4 维满意度
 *   - 02_专业薪酬就业 (3007 行) -> majors 薪酬就业字段
 *
 * 匹配: 用「专业名称」精确匹配 Major.name (同名多行全部更新)
 *
 * 用法:
 *   EXCEL_PATH=... DATABASE_URL=... npx tsx scripts/import-major-p3.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

// === env 加载 ===
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

const EXCEL_PATH = process.env.EXCEL_PATH
  ? path.resolve(process.env.EXCEL_PATH)
  : path.resolve(__dirname, '../data/03_专家版主表/output/专业全量数据_多Sheet.xlsx');

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

function toFloat(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = parseFloat(String(v));
  return isNaN(n) ? null : n;
}

/** 解析 JSON 数组字符串 `["a","b"]`；失败返回 null */
function parseJsonArray(v: unknown): string[] | null {
  if (!v) return null;
  const raw = String(v).trim();
  if (!raw || raw === '[]' || raw === 'null') return null;
  try {
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) {
      return arr.map((x) => String(x).trim()).filter(Boolean);
    }
  } catch {
    // ignore
  }
  return null;
}

/** 解析 `[21%,17%,...]` 或 `[21,17,...]` 为 number 数组 */
function parsePercentArray(v: unknown): number[] | null {
  if (!v) return null;
  const raw = String(v).trim();
  if (!raw || raw === '[]') return null;
  // 去掉 [ ] 和 %
  const inside = raw.replace(/^\[|\]$/g, '').replace(/%/g, '');
  if (!inside) return null;
  const parts = inside.split(',').map((s) => s.trim());
  const nums = parts.map((s) => parseFloat(s)).filter((n) => !isNaN(n));
  return nums.length > 0 ? nums : null;
}

/** 合并 names + percents 为 [{name, percent}] */
function zipNamePercent(names: string[] | null, percents: number[] | null): { name: string; percent: number }[] | null {
  if (!names || !percents) return null;
  const n = Math.min(names.length, percents.length);
  if (n === 0) return null;
  const out: { name: string; percent: number }[] = [];
  for (let i = 0; i < n; i++) {
    out.push({ name: names[i], percent: percents[i] });
  }
  return out;
}

/** 解析历年薪资 `{2010,3063},{2011,3868},...` */
function parseHistoricalSalary(v: unknown): { year: number; salary: number }[] | null {
  if (!v) return null;
  const raw = String(v).trim();
  if (!raw) return null;
  const out: { year: number; salary: number }[] = [];
  const matches = raw.matchAll(/\{(\d{4}),\s*(\d+)\}/g);
  for (const m of matches) {
    out.push({ year: parseInt(m[1], 10), salary: parseInt(m[2], 10) });
  }
  return out.length > 0 ? out : null;
}

/** 解析工作年限段/工资 对应表: 段是 ["应届生","1-3年"], 工资是 [5750, 5680] -> [{years, salary}] */
function zipYearsSalary(yearsArr: string[] | null, salaryArr: number[] | null) {
  if (!yearsArr || !salaryArr) return null;
  const n = Math.min(yearsArr.length, salaryArr.length);
  if (n === 0) return null;
  const out: { years: string; salary: number }[] = [];
  for (let i = 0; i < n; i++) out.push({ years: yearsArr[i], salary: salaryArr[i] });
  return out;
}

type RowDict = Record<string, unknown>;

function readSheet(sheetName: string): RowDict[] {
  const wb = XLSX.readFile(EXCEL_PATH);
  const ws = wb.Sheets[sheetName];
  if (!ws) throw new Error(`Sheet 不存在: ${sheetName}`);
  return XLSX.utils.sheet_to_json<RowDict>(ws, { defval: null });
}

// ==================== 主流程 ====================

interface MergedRecord {
  // 字典字段
  firstImpression?: string | null;
  electiveAdvice?: string | null;
  whatIs?: string | null;
  whatStudy?: string | null;
  whatDo?: string | null;
  employmentProspects?: string | null;
  similarMajors?: string[] | null;
  trainingObjective?: string | null;
  trainingRequirements?: string | null;
  disciplineReq?: string | null;
  knowledgeAbility?: string | null;
  famousPeople?: string[] | null;
  internshipDesc?: string | null;
  professionalCerts?: string[] | null;
  postUpgradeDirection?: string | null;
  setupYear?: number | null;
  // 满意度
  satisfactionOverallCount?: number | null;
  satisfactionTeaching?: number | null;
  satisfactionTeachingCount?: number | null;
  satisfactionCondition?: number | null;
  satisfactionConditionCount?: number | null;
  satisfactionEmployment?: number | null;
  satisfactionEmploymentCount?: number | null;
  // 薪酬就业
  historicalSalary?: any;
  salaryDistribution?: any;
  experienceDistribution?: any;
  educationDistribution?: any;
  regionDistribution?: any;
  industryDistribution?: any;
  positionTop?: string[] | null;
  topRegion?: string | null;
  topIndustry?: string | null;
  employmentRanking?: string | null;
  employmentRankingDesc?: string | null;
  employmentDirectionDesc?: string | null;
  yearSalaryMap?: any;
  avgSalary?: number | null;
}

function buildRecordMap(): Map<string, MergedRecord> {
  const map = new Map<string, MergedRecord>();
  const get = (name: string): MergedRecord => {
    if (!map.has(name)) map.set(name, {});
    return map.get(name)!;
  };

  console.log('  Reading 01_专业字典 ...');
  for (const row of readSheet('01_专业字典')) {
    const name = toStr(row['专业名称']);
    if (!name) continue;
    const r = get(name);
    r.firstImpression = toStr(row['第一印象']);
    r.electiveAdvice = toStr(row['选考建议']);
    r.whatIs = toStr(row['专业是什么']);
    r.whatStudy = toStr(row['专业学什么']);
    r.whatDo = toStr(row['专业干什么']);
    r.employmentProspects = toStr(row['就业去向']);
    // 相近专业可能是 `;`/`；`/`、` 分隔的串
    const similarRaw = toStr(row['相近专业']);
    if (similarRaw) {
      const arr = similarRaw.split(/[；;、,，]/).map((s) => s.trim()).filter(Boolean);
      r.similarMajors = arr.length > 0 ? arr : null;
    }
    r.trainingObjective = toStr(row['培养目标']);
    r.trainingRequirements = toStr(row['培养要求']);
    r.disciplineReq = toStr(row['学科要求']);
    r.knowledgeAbility = toStr(row['知识能力']);
    // 社会名人："夏培肃、周巢尘、黄汉文等。"
    const fpRaw = toStr(row['社会名人']);
    if (fpRaw) {
      const arr = fpRaw.replace(/等[。.]?$/, '').split(/[、,，]/).map((s) => s.trim()).filter(Boolean);
      r.famousPeople = arr.length > 0 ? arr : null;
    }
    r.internshipDesc = toStr(row['实习']);
    const certsRaw = toStr(row['职业资格证书']);
    if (certsRaw) {
      const arr = certsRaw.split(/[；;、,，]/).map((s) => s.trim()).filter(Boolean);
      r.professionalCerts = arr.length > 0 ? arr : null;
    }
    r.postUpgradeDirection = toStr(row['专升本方向']);
    r.setupYear = toInt(row['增设年份']);
    // 满意度
    r.satisfactionOverallCount = toInt(row['综合满意度人数']);
    r.satisfactionTeaching = toFloat(row['教学质量满意度']);
    r.satisfactionTeachingCount = toInt(row['教学质量人数']);
    r.satisfactionCondition = toFloat(row['办学条件满意度']);
    r.satisfactionConditionCount = toInt(row['办学条件人数']);
    r.satisfactionEmployment = toFloat(row['就业满意度']);
    r.satisfactionEmploymentCount = toInt(row['就业满意度人数']);
  }

  console.log('  Reading 02_专业薪酬就业 ...');
  for (const row of readSheet('02_专业薪酬就业')) {
    const name = toStr(row['专业名称']);
    if (!name) continue;
    const r = get(name);

    r.historicalSalary = parseHistoricalSalary(row['历年薪资JSON']);
    r.avgSalary = toInt(row['平均工资']);
    r.topRegion = toStr(row['就业最多地区']);
    r.topIndustry = toStr(row['就业最多行业']);
    r.employmentRanking = toStr(row['就业排名']);
    r.employmentRankingDesc = toStr(row['就业排名描述']);
    r.employmentDirectionDesc = toStr(row['就业方向描述']);

    r.industryDistribution = zipNamePercent(
      parseJsonArray(row['行业分布TOP10']),
      parsePercentArray(row['行业分布比例TOP10']),
    );
    r.regionDistribution = zipNamePercent(
      parseJsonArray(row['地区分布TOP10']),
      parsePercentArray(row['地区分布比例TOP10']),
    );
    r.salaryDistribution = zipNamePercent(
      parseJsonArray(row['工资段分布']),
      parsePercentArray(row['工资段比例']),
    );
    r.experienceDistribution = zipNamePercent(
      parseJsonArray(row['经验段分布']),
      parsePercentArray(row['经验段比例']),
    );
    r.educationDistribution = zipNamePercent(
      parseJsonArray(row['学历要求分布']),
      parsePercentArray(row['学历比例']),
    );

    r.positionTop = parseJsonArray(row['从事岗位TOP']);
    r.yearSalaryMap = zipYearsSalary(
      parseJsonArray(row['工作年限段']),
      parsePercentArray(row['工作年限对应工资']),
    );
  }

  return map;
}

async function main() {
  console.log('=== P3 专业增强数据导入 ===');
  console.log(`Excel: ${EXCEL_PATH}`);

  if (!fs.existsSync(EXCEL_PATH)) {
    console.error(`Excel 文件不存在: ${EXCEL_PATH}`);
    process.exit(1);
  }

  console.log('\n[1/2] 解析 Excel ...');
  const map = buildRecordMap();
  console.log(`  解析到 ${map.size} 个专业的 P3 数据`);

  console.log('\n[2/2] 写入数据库 ...');
  let updated = 0;
  let notFound = 0;
  const unmatched: string[] = [];

  for (const [name, data] of map.entries()) {
    const result = await prisma.major.updateMany({
      where: { name },
      data: {
        firstImpression: data.firstImpression ?? null,
        electiveAdvice: data.electiveAdvice ?? null,
        whatIs: data.whatIs ?? null,
        whatStudy: data.whatStudy ?? null,
        whatDo: data.whatDo ?? null,
        employmentProspects: data.employmentProspects ?? null,
        ...(data.similarMajors !== undefined && { similarMajors: data.similarMajors as any }),
        trainingObjective: data.trainingObjective ?? null,
        trainingRequirements: data.trainingRequirements ?? null,
        disciplineReq: data.disciplineReq ?? null,
        knowledgeAbility: data.knowledgeAbility ?? null,
        ...(data.famousPeople !== undefined && { famousPeople: data.famousPeople as any }),
        internshipDesc: data.internshipDesc ?? null,
        ...(data.professionalCerts !== undefined && { professionalCerts: data.professionalCerts as any }),
        postUpgradeDirection: data.postUpgradeDirection ?? null,
        ...(data.setupYear != null && { setupYear: data.setupYear }),
        satisfactionOverallCount: data.satisfactionOverallCount ?? null,
        satisfactionTeaching: data.satisfactionTeaching ?? null,
        satisfactionTeachingCount: data.satisfactionTeachingCount ?? null,
        satisfactionCondition: data.satisfactionCondition ?? null,
        satisfactionConditionCount: data.satisfactionConditionCount ?? null,
        satisfactionEmployment: data.satisfactionEmployment ?? null,
        satisfactionEmploymentCount: data.satisfactionEmploymentCount ?? null,
        ...(data.historicalSalary !== undefined && { historicalSalary: data.historicalSalary }),
        ...(data.salaryDistribution !== undefined && { salaryDistribution: data.salaryDistribution }),
        ...(data.experienceDistribution !== undefined && { experienceDistribution: data.experienceDistribution }),
        ...(data.educationDistribution !== undefined && { educationDistribution: data.educationDistribution }),
        ...(data.regionDistribution !== undefined && { regionDistribution: data.regionDistribution }),
        ...(data.industryDistribution !== undefined && { industryDistribution: data.industryDistribution }),
        ...(data.positionTop !== undefined && { positionTop: data.positionTop as any }),
        topRegion: data.topRegion ?? null,
        topIndustry: data.topIndustry ?? null,
        employmentRanking: data.employmentRanking ?? null,
        employmentRankingDesc: data.employmentRankingDesc ?? null,
        employmentDirectionDesc: data.employmentDirectionDesc ?? null,
        ...(data.yearSalaryMap !== undefined && { yearSalaryMap: data.yearSalaryMap }),
        ...(data.avgSalary != null && { avgSalary: data.avgSalary }),
      },
    });

    if (result.count > 0) updated += result.count;
    else {
      notFound++;
      if (unmatched.length < 20) unmatched.push(name);
    }
  }

  console.log(`\n  Updated: ${updated} major rows`);
  console.log(`  Not found in DB: ${notFound}`);
  if (unmatched.length > 0) {
    console.log(`  示例未匹配:`);
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
