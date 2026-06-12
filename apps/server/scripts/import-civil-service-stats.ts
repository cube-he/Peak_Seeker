/**
 * 导入 "专业数据_全国_含考公_最终版.xlsx" 的考公指标到 majors 表 cs_* 物化列。
 *
 * 数据源两张 sheet:
 *   14_专业考公指标   — 每专业一行的全国聚合(四年岗位数/招考人数/竞争比/地区系统TOP3/趋势/置信度)
 *   15_考公岗位明细2026 — 职位级明细(~70万行), 流式扫描聚合"地区=四川"的在川可报岗位数
 *
 * 用法（cd apps/server）：
 *   pnpm import:civil-service --file=../../data/03_专家版主表/output/专业数据_全国_含考公_最终版.xlsx
 *   pnpm import:civil-service --file=... --dry-run
 *
 * 匹配规则与 import-major-details 一致: 先按专业代码(含 K/T 后缀)匹配 Major.code, 兜底按名称。
 * 幂等: 全字段覆盖写入(考公数据整表替换语义, 无需 --overwrite 开关)。
 * 注: 不 import scripts/lib(依赖 cli-progress 这类 devDep), 保持编译产物可在仅装
 *     生产依赖的服务器上直接 node 运行。
 */
import * as ExcelJS from 'exceljs';
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

const AGG_SHEET = '14_专业考公指标';
const DETAIL_SHEET = '15_考公岗位明细2026';

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const [k, v] = a.slice(2).split('=', 2);
    if (v !== undefined) out[k] = v;
    else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) out[k] = argv[++i];
    else out[k] = true;
  }
  return out;
}

function toText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'object') {
    const r = (value as any).richText;
    if (Array.isArray(r)) return r.map((i: any) => i.text ?? '').join('');
    const t = (value as any).text;
    if (t != null) return String(t);
    const res = (value as any).result;
    if (res != null) return toText(res);
  }
  return String(value).trim();
}

function toInt(value: unknown): number | null {
  const t = toText(value).replace(/,/g, '').trim();
  if (!t) return null;
  const m = t.match(/-?\d+/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

function toFloat(value: unknown): number | null {
  const t = toText(value).replace(/,/g, '').trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function nullIfEmpty(value: unknown): string | null {
  const t = toText(value).trim();
  return t === '' || t === 'NaN' ? null : t;
}

interface CsRow {
  code: string;
  name: string;
  jobs2023: number | null;
  jobs2024: number | null;
  jobs2025: number | null;
  jobs2026: number | null;
  jobsTotal: number | null;
  recruitTotal: number | null;
  competition: number | null;
  regionTop3: string | null;
  systemTop3: string | null;
  trendDelta: number | null;
  trendLabel: string | null;
  confidence: number | null;
}

/**
 * 单次流式遍历工作簿: 聚合 sheet(14) 解析成行, 明细 sheet(15, ~70万行) 聚合在川岗位数。
 * 必须全程流式 — 非流式 readFile 会把明细 sheet 的 XML 当单字符串解压,
 * 超过 V8 字符串上限直接 RangeError(67MB 工作簿实测爆)。
 */
async function readWorkbook(file: string): Promise<{ rows: CsRow[]; scJobs: Map<string, number> }> {
  const rows: CsRow[] = [];
  const scJobs = new Map<string, number>();
  const reader = new (ExcelJS as any).stream.xlsx.WorkbookReader(file, {
    sharedStrings: 'cache',
    styles: 'ignore',
    hyperlinks: 'ignore',
    worksheets: 'emit',
  });
  // 流式 reader 拿不到真实 sheet 名(全是 "SheetN"), 改按表头签名识别目标 sheet
  for await (const sheet of reader) {
    let header: Map<string, number> | null = null;
    let mode: 'AGG' | 'DETAIL' | 'SKIP' = 'SKIP';
    let scanned = 0;
    for await (const row of sheet as any) {
      const values: any[] = (row as any).values ?? [];
      if (!header) {
        header = new Map<string, number>();
        values.forEach((v, i) => { if (v != null) header!.set(toText(v), i); });
        if (header.has('专业代码') && header.has('可报岗位数_2026')) mode = 'AGG';
        else if (header.has('专业代码') && header.has('职位代码') && header.has('地区')) mode = 'DETAIL';
        if (mode === 'SKIP') break; // 非目标 sheet, 读完表头立即跳过
        continue;
      }
      if (mode === 'AGG') {
        const get = (col: string) => values[header!.get(col) ?? -1];
        const code = nullIfEmpty(get('专业代码'));
        const name = toText(get('专业名称')).trim();
        if (!code && !name) continue;
        rows.push({
          code: code ?? '',
          name,
          jobs2023: toInt(get('可报岗位数_2023')),
          jobs2024: toInt(get('可报岗位数_2024')),
          jobs2025: toInt(get('可报岗位数_2025')),
          jobs2026: toInt(get('可报岗位数_2026')),
          jobsTotal: toInt(get('可报岗位数_合计')),
          recruitTotal: toInt(get('招考人数_合计')),
          competition: toFloat(get('平均报名竞争比_2026')),
          regionTop3: nullIfEmpty(get('地区TOP3'))?.slice(0, 120) ?? null,
          systemTop3: nullIfEmpty(get('系统TOP3'))?.slice(0, 300) ?? null,
          trendDelta: toInt(get('趋势_26减23')),
          trendLabel: nullIfEmpty(get('趋势标签'))?.slice(0, 20) ?? null,
          confidence: toFloat(get('平均置信度')),
        });
      } else {
        scanned++;
        const region = toText(values[header.get('地区') ?? -1]);
        if (!region.includes('四川')) continue;
        const year = toText(values[header.get('年份') ?? -1]);
        if (year && year !== '2026') continue;
        const code = toText(values[header.get('专业代码') ?? -1]);
        if (!code) continue;
        scJobs.set(code, (scJobs.get(code) ?? 0) + 1);
      }
    }
    if (mode === 'DETAIL') {
      console.log(`明细扫描 ${scanned} 行, 在川聚合覆盖 ${scJobs.size} 个专业代码`);
    }
  }
  return { rows, scJobs };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const file = String(args.file || '');
  const dryRun = Boolean(args['dry-run']);
  if (!file) throw new Error('缺少 --file=...');

  const { rows, scJobs } = await readWorkbook(file);
  if (rows.length === 0) throw new Error(`sheet "${AGG_SHEET}" 不存在或为空`);
  console.log(`xlsx 解析: ${AGG_SHEET} ${rows.length} 行`);

  const prisma = new PrismaClient({ adapter: new PrismaMariaDb(process.env.DATABASE_URL!) });
  try {
    const allMajors = await prisma.major.findMany({ select: { id: true, name: true, code: true } });
    console.log(`db: ${allMajors.length} majors 加载完毕`);

    const codeIndex = new Map<string, number[]>();
    const nameIndex = new Map<string, number[]>();
    for (const m of allMajors) {
      if (m.code) {
        const k = m.code.trim();
        if (!codeIndex.has(k)) codeIndex.set(k, []);
        codeIndex.get(k)!.push(m.id);
      }
      if (m.name) {
        const k = m.name.trim();
        if (!nameIndex.has(k)) nameIndex.set(k, []);
        nameIndex.get(k)!.push(m.id);
      }
    }

    const updates: Array<{ id: number; data: Record<string, unknown> }> = [];
    const unmatched: string[] = [];
    let multiHit = 0;
    for (const row of rows) {
      let ids: number[] | undefined;
      if (row.code) ids = codeIndex.get(row.code);
      if (!ids || ids.length === 0) ids = nameIndex.get(row.name);
      if (!ids || ids.length === 0) {
        unmatched.push(`${row.code}|${row.name}`);
        continue;
      }
      if (ids.length > 1) multiHit++;
      const data = {
        csJobs2023: row.jobs2023,
        csJobs2024: row.jobs2024,
        csJobs2025: row.jobs2025,
        csJobs2026: row.jobs2026,
        csJobsTotal: row.jobsTotal,
        csRecruitTotal: row.recruitTotal,
        csCompetition: row.competition,
        csTrendDelta: row.trendDelta,
        csTrendLabel: row.trendLabel,
        csRegionTop3: row.regionTop3,
        csSystemTop3: row.systemTop3,
        csScJobs2026: scJobs.get(row.code) ?? null,
        csConfidence: row.confidence,
        csYear: 2026,
      };
      for (const id of ids) updates.push({ id, data });
    }

    console.log(JSON.stringify({
      file, dryRun,
      aggRows: rows.length,
      majorsToUpdate: updates.length,
      multiHitRows: multiHit,
      unmatchedCount: unmatched.length,
      sampleUnmatched: unmatched.slice(0, 10),
      scJobsCodes: scJobs.size,
    }, null, 2));

    if (dryRun) return;
    let done = 0;
    let err = 0;
    for (const u of updates) {
      try {
        await prisma.major.update({ where: { id: u.id }, data: u.data });
        done++;
      } catch (e) {
        err++;
        if (err <= 3) console.error('update failed id=', u.id, e);
      }
    }
    console.log(`更新完成: ok=${done} err=${err}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
