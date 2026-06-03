/**
 * 导入 "专业全量数据_多Sheet.xlsx" 的 sheet "01_专业字典" 到 majors 表。
 * 补齐: description / careerDirections / postgraduateDirections / coreCourses /
 *       satisfactionScore / studentScale / maleRatio / femaleRatio /
 *       degree / standardDuration / category / discipline / level
 *
 * 用法（cd apps/server）：
 *   pnpm import:major-details --file=../../data/03_专家版主表/output/专业全量数据_多Sheet.xlsx
 *   pnpm import:major-details --file=... --dry-run
 *   pnpm import:major-details --file=... --overwrite   // 即使已有值也覆盖
 *
 * 匹配规则:
 *   1. 优先按 code (Excel 专业代码) 匹配 Major.code
 *   2. 兜底按 name (Excel 专业名称) 匹配 Major.name
 *   3. 都不行时跳过, 累计 unmatched 报告
 */
import * as ExcelJS from 'exceljs';
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { parseArgs } from './lib/cli-utils';

const SHEET_NAME = '01_专业字典';

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

function nullIfEmpty(value: unknown): string | null {
  const t = toText(value).trim();
  return t === '' || t === 'NaN' ? null : t;
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

/**
 * 把中文分隔字符串拆成数组。支持 顿号、逗号(全/半角)、分号(全/半角)。
 * 去掉末尾"等。"/"等" 这类无意义后缀。
 * 去重 + 去空 + trim。
 */
function splitChineseList(value: unknown): string[] | null {
  const text = toText(value).trim();
  if (!text) return null;
  // 去末尾 "等。" / "等"
  const cleaned = text.replace(/等[。\.]?\s*$/u, '').trim();
  if (!cleaned) return null;
  const parts = cleaned
    .split(/[、，,；;\n\r]+/u)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!parts.length) return null;
  // 去重
  const seen = new Set<string>();
  const uniq: string[] = [];
  for (const p of parts) {
    if (!seen.has(p)) {
      seen.add(p);
      uniq.push(p);
    }
  }
  return uniq;
}

interface MajorRow {
  code: string | null;
  name: string;
  category: string | null;
  level: string | null;
  discipline: string | null;
  degree: string | null;
  standardDuration: string | null;
  description: string | null;
  careerDirections: string[] | null;
  postgraduateDirections: string[] | null;
  coreCourses: string[] | null;
  satisfactionScore: number | null;
  studentScale: string | null;
  maleRatio: number | null;
  femaleRatio: number | null;
}

function colIndexes(sheet: ExcelJS.Worksheet): Map<string, number> {
  const idx = new Map<string, number>();
  sheet.getRow(1).eachCell((cell, col) => idx.set(toText(cell.value), col));
  return idx;
}

function parseRows(sheet: ExcelJS.Worksheet): MajorRow[] {
  const idx = colIndexes(sheet);
  const get = (row: ExcelJS.Row, col: string) => {
    const c = idx.get(col);
    return c ? row.getCell(c).value : undefined;
  };
  const rows: MajorRow[] = [];
  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const name = toText(get(row, '专业名称')).trim();
    if (!name) continue;
    // 专业简介 优先, 没有就用 培养目标
    const description = nullIfEmpty(get(row, '专业简介')) ?? nullIfEmpty(get(row, '培养目标'));
    rows.push({
      code: nullIfEmpty(get(row, '专业代码'))?.replace(/\.0+$/, '') ?? null,
      name,
      category: nullIfEmpty(get(row, '学科门类')),
      level: nullIfEmpty(get(row, '层次')),
      discipline: nullIfEmpty(get(row, '专业类')),
      degree: nullIfEmpty(get(row, '授予学位')),
      standardDuration: nullIfEmpty(get(row, '修业年限')),
      description,
      careerDirections: splitChineseList(get(row, '就业方向')),
      postgraduateDirections: splitChineseList(get(row, '考研方向')),
      coreCourses: splitChineseList(get(row, '主要课程')),
      satisfactionScore: toFloat(get(row, '综合满意度')),
      studentScale: nullIfEmpty(get(row, '学生规模')),
      maleRatio: toInt(get(row, '男生比例')),
      femaleRatio: toInt(get(row, '女生比例')),
    });
  }
  return rows;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const file = String(args.file || '');
  const dryRun = Boolean(args['dry-run']);
  const overwrite = Boolean(args.overwrite);
  if (!file) throw new Error('缺少 --file=...');

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const sheet = wb.getWorksheet(SHEET_NAME);
  if (!sheet) throw new Error(`sheet "${SHEET_NAME}" 不存在`);
  const rows = parseRows(sheet);
  console.log(`xlsx 解析: ${SHEET_NAME} ${rows.length} 行`);

  const prisma = new PrismaClient({ adapter: new PrismaMariaDb(process.env.DATABASE_URL!) });
  try {
    // 加载现有 majors, 建 code/name 索引
    const allMajors = await prisma.major.findMany({
      select: {
        id: true, name: true, code: true,
        description: true, careerDirections: true, postgraduateDirections: true,
        coreCourses: true, satisfactionScore: true, studentScale: true,
        maleRatio: true, femaleRatio: true, degree: true, standardDuration: true,
        category: true, discipline: true, level: true,
      },
    });
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
    const byId = new Map(allMajors.map((m) => [m.id, m]));

    const updates: Array<{ id: number; data: Record<string, unknown> }> = [];
    const unmatched: string[] = [];
    let multiHit = 0;

    for (const row of rows) {
      let ids: number[] | undefined;
      if (row.code) ids = codeIndex.get(row.code);
      if (!ids || ids.length === 0) ids = nameIndex.get(row.name);
      if (!ids || ids.length === 0) {
        unmatched.push(`${row.code ?? ''}|${row.name}`);
        continue;
      }
      if (ids.length > 1) multiHit++;

      // 候选 patch 字段
      const patch: Record<string, unknown> = {
        description: row.description,
        careerDirections: row.careerDirections,
        postgraduateDirections: row.postgraduateDirections,
        coreCourses: row.coreCourses,
        satisfactionScore: row.satisfactionScore,
        studentScale: row.studentScale,
        maleRatio: row.maleRatio,
        femaleRatio: row.femaleRatio,
        degree: row.degree,
        standardDuration: row.standardDuration,
        category: row.category,
        discipline: row.discipline,
        level: row.level,
      };
      // 清掉空值
      for (const k of Object.keys(patch)) {
        const v = patch[k];
        if (v === null || v === undefined || v === '' ||
            (Array.isArray(v) && v.length === 0)) {
          delete patch[k];
        }
      }

      // 非 overwrite 模式: 跳过已有值的字段
      if (!overwrite) {
        for (const id of ids) {
          const existing = byId.get(id);
          if (!existing) continue;
          const localPatch: Record<string, unknown> = {};
          for (const k of Object.keys(patch)) {
            const cur = (existing as any)[k];
            // careerDirections / postgraduateDirections / coreCourses 是 Json,
            // 用 Array.isArray + length>0 判断 "已有值"
            const hasExisting = Array.isArray(cur)
              ? cur.length > 0
              : cur !== null && cur !== undefined && cur !== '';
            if (!hasExisting) localPatch[k] = patch[k];
          }
          if (Object.keys(localPatch).length > 0) {
            updates.push({ id, data: localPatch });
          }
        }
      } else {
        for (const id of ids) {
          if (Object.keys(patch).length > 0) updates.push({ id, data: patch });
        }
      }
    }

    console.log(JSON.stringify({
      file, dryRun, overwrite, sheet: SHEET_NAME,
      totalRows: rows.length,
      majorsToUpdate: updates.length,
      multiHitRows: multiHit,
      unmatchedCount: unmatched.length,
      sampleUnmatched: unmatched.slice(0, 10),
    }, null, 2));

    if (dryRun) return;
    let done = 0;
    let err = 0;
    for (const u of updates) {
      try {
        await prisma.major.update({ where: { id: u.id }, data: u.data });
        done++;
      } catch (e: any) {
        err++;
        if (err < 5) console.error(`  [ERR] id=${u.id}: ${e?.message ?? e}`);
      }
      if (done % 200 === 0 && done > 0) console.log(`  ${done}/${updates.length}`);
    }
    console.log(`完成: 更新 ${done} 条 major, 失败 ${err}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
