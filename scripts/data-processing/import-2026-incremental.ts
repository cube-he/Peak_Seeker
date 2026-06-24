/**
 * 外科式 2026 增量导入（安全替代 import_to_db 的全量重建）。
 *
 * 只动 4 张主表派生的表，绝不碰 score_segments / batch_lines / supplementary_records / health：
 *   - universities：按 code upsert（新增 + 更新元数据，不删）
 *   - majors：按 (name, level) find-or-create（不删）
 *   - enrollment_plans：DELETE year IN (2023..2026) → createMany（干净, 无孤儿）
 *   - admission_records：DELETE year IN (2023..2025) → createMany
 *
 * 为什么不用 import_to_db：它 step3 无条件清空 enrollment/admission/universities/征集，
 * step8 征集导入又丢 subject/groupCode/majorCode（C 未覆盖的第三条路径）→ 全量重建会损坏征集。
 *
 * 用法（在 apps/server 目录，读其 .env 的 DATABASE_URL）:
 *   npx tsx ../../scripts/data-processing/import-2026-incremental.ts --data=<dir> --dry-run
 *   npx tsx ../../scripts/data-processing/import-2026-incremental.ts --data=<dir>
 */
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as fs from 'fs';
import * as path from 'path';
import { config } from 'dotenv';

config({ path: path.resolve(__dirname, '..', '..', 'apps', 'server', '.env') });

let DATA_DIR = path.resolve(__dirname, 'output_2026');
let DRY = false;
for (const arg of process.argv.slice(2)) {
  if (arg.startsWith('--data=')) DATA_DIR = path.resolve(arg.slice(7));
  if (arg === '--dry-run') DRY = true;
}

const PLAN_YEARS = [2023, 2024, 2025, 2026];
const ADMISSION_YEARS = [2023, 2024, 2025];

const adapter = new PrismaMariaDb(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter, log: ['warn', 'error'] });

function loadJSON<T>(f: string): T {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf-8'));
}
const toInt = (v: any) => { if (v === null || v === undefined) return null; const n = parseInt(String(v), 10); return isNaN(n) ? null : n; };
const toStr = (v: any) => { if (v === null || v === undefined) return null; const s = String(v).trim(); return s || null; };

async function run() {
  await prisma.$connect();
  console.log(`Data dir: ${DATA_DIR}\nMode: ${DRY ? 'DRY-RUN (no writes)' : 'WRITE'}`);

  const universities = loadJSON<any[]>('universities_enriched.json');
  const majors = loadJSON<any[]>('majors_enriched.json');
  const plans = loadJSON<any[]>('enrollment_plans_enriched.json');
  const records = loadJSON<any[]>('admission_records_filled.json');
  console.log(`Loaded: uni=${universities.length} major=${majors.length} plans=${plans.length} admissions=${records.length}`);

  // —— universities: upsert by code (build codeToId) ——
  const codeToId = new Map<string, number>();
  let uniNew = 0, uniUpd = 0;
  for (const u of universities) {
    const code = String(u.enrollCode);
    if (DRY) {
      const existing = await prisma.university.findUnique({ where: { code } });
      existing ? uniUpd++ : uniNew++;
      if (existing) { codeToId.set(code, existing.id); codeToId.set(code.padStart(4, '0'), existing.id); }
      continue;
    }
    const data = {
      name: u.name || 'Unknown', code,
      province: toStr(u.province), city: toStr(u.city), type: toStr(u.type),
      level: toStr(u.level), runningLevel: toStr(u.level), runningNature: toStr(u.runningNature),
      isDoubleFirstClass: !!u.isDoubleFirstClass, is985: !!u.is985, is211: !!u.is211,
      tags: u.tags && u.tags.length ? u.tags : undefined,
      grade: toStr(u.grade), department: toStr(u.department), ranking: toStr(u.ranking),
      admissionGuide: toStr(u.admissionGuide), renameHistory: toStr(u.renameHistory),
      transferDifficulty: toStr(u.transferDifficulty), postgradRate: toStr(u.postgradRate),
      disciplineEvaluationLevel: toStr(u.disciplineEvaluationLevel),
      softRating: toStr(u.softRating), softRanking: toInt(u.softRanking),
      hasMasterProgram: !!u.hasMasterProgram, hasDoctoralProgram: !!u.hasDoctoralProgram,
      masterProgramCount: toInt(u.masterProgramCount), doctoralProgramCount: toInt(u.doctoralProgramCount),
      masterPrograms: u.masterPrograms ? String(u.masterPrograms).split('；').filter(Boolean) : undefined,
      doctoralPrograms: u.doctoralPrograms ? String(u.doctoralPrograms).split('；').filter(Boolean) : undefined,
    };
    const existing = await prisma.university.findUnique({ where: { code } });
    const uni = existing
      ? (uniUpd++, await prisma.university.update({ where: { code }, data }))
      : (uniNew++, await prisma.university.create({ data }));
    codeToId.set(code, uni.id);
    codeToId.set(code.padStart(4, '0'), uni.id);
  }
  console.log(`universities: +${uniNew} new / ${uniUpd} updated`);

  // —— majors: find-or-create by (name, level) ——
  const majorKey = new Map<string, number>();
  let majNew = 0, majExist = 0;
  for (const m of majors) {
    const level = toStr(m.level) || '本科';
    const found = await prisma.major.findFirst({ where: { name: m.name, level } });
    if (found) { majExist++; majorKey.set(`${m.name}|${level}`, found.id); majorKey.set(m.name, found.id); continue; }
    if (DRY) { majNew++; continue; }
    const created = await prisma.major.create({ data: {
      name: m.name, code: toStr(m.code), category: toStr(m.category), level,
      discipline: toStr(m.discipline), type: toStr(m.type), notes: toStr(m.notes),
      majorLevel: toStr(m.majorLevel), softRating: toStr(m.softRating), isRestricted: false,
    } });
    majNew++; majorKey.set(`${m.name}|${level}`, created.id); majorKey.set(m.name, created.id);
  }
  console.log(`majors: +${majNew} new / ${majExist} existing`);

  // —— build plan/admission rows with resolved FKs ——
  const buildPlan = (p: any) => {
    const uniId = codeToId.get(String(p.universityEnrollCode)) ?? codeToId.get(String(p.universityEnrollCode).padStart(4, '0'));
    if (!uniId) return null;
    const level = toStr(p.level) || '本科';
    return {
      universityId: uniId, majorId: majorKey.get(`${p.majorName}|${level}`) ?? majorKey.get(p.majorName) ?? null,
      year: p.year, province: p.province || '四川', planCount: toInt(p.planCount), planNotes: toStr(p.planNotes),
      batch: toStr(p.batch) || '', level: toStr(p.level), subjects: toStr(p.subjects) || '',
      subjectRequirements: toStr(p.subjectRequirements), duration: toStr(p.duration), tuition: toInt(p.tuition),
      isSinoForeign: false, recruitType: toStr(p.recruitType) || '', majorCode: toStr(p.majorCode) || '',
      majorName: toStr(p.majorName) || '', groupCode: toStr(p.groupCode) || '', groupName: toStr(p.groupName),
      groupMajors: toStr(p.groupMajors), groupPlanCount: toInt(p.groupPlanCount), isNew: !!p.isNew,
      oldBatch: toStr(p.oldBatch), disciplineEval: toStr(p.disciplineEval), isNationalFeature: !!p.isNationalFeature,
      majorRanking: toStr(p.majorRanking), majorHonor: toStr(p.majorHonor),
      localMasterPoint: toStr(p.localMasterPoint), localDoctoralPoint: toStr(p.localDoctoralPoint),
    };
  };
  const buildAdm = (r: any) => {
    const uniId = codeToId.get(String(r.universityEnrollCode)) ?? codeToId.get(String(r.universityEnrollCode).padStart(4, '0'));
    if (!uniId) return null;
    const level = toStr(r.level) || '本科';
    return {
      universityId: uniId, majorId: majorKey.get(`${r.majorName}|${level}`) ?? majorKey.get(r.majorName) ?? null,
      year: r.year, province: r.province || '四川', batch: toStr(r.batch) || '',
      majorMinScore: toInt(r.majorMinScore), majorMinRank: toInt(r.majorMinRank), majorAvgScore: toInt(r.majorAvgScore),
      majorAvgRank: toInt(r.majorAvgRank), majorMaxScore: toInt(r.majorMaxScore), majorMaxRank: toInt(r.majorMaxRank),
      majorAdmissionCount: toInt(r.majorAdmissionCount), groupMinScore: toInt(r.groupMinScore), groupMinRank: toInt(r.groupMinRank),
      groupAdmissionCount: toInt(r.groupAdmissionCount), filingMinScore: toInt(r.filingMinScore), filingMinRank: toInt(r.filingMinRank),
      recruitType: toStr(r.recruitType) || '', groupCode: toStr(r.groupCode) || '', majorCode: toStr(r.majorCode) || '',
      majorName: toStr(r.majorName) || '', subjects: toStr(r.subjects) || '',
    };
  };
  const planRows = plans.map(buildPlan).filter(Boolean) as any[];
  const admRows = records.map(buildAdm).filter(Boolean) as any[];
  console.log(`resolved: plans ${planRows.length}/${plans.length} (skipped ${plans.length - planRows.length}), admissions ${admRows.length}/${records.length} (skipped ${records.length - admRows.length})`);

  if (DRY) {
    const before = await prisma.enrollmentPlan.groupBy({ by: ['year'], _count: { _all: true }, where: { year: { in: PLAN_YEARS } } });
    console.log('enrollment_plans 现状(将被替换的年):', before.map(b => `${b.year}=${b._count._all}`).join(' '));
    console.log('DRY-RUN done — 不写库。');
    await prisma.$disconnect();
    return;
  }

  // —— enrollment_plans: year-scoped replace ——
  const delP = await prisma.enrollmentPlan.deleteMany({ where: { year: { in: PLAN_YEARS } } });
  console.log(`enrollment_plans: deleted ${delP.count} (years ${PLAN_YEARS.join(',')})`);
  let insP = 0;
  for (let i = 0; i < planRows.length; i += 500) {
    const b = planRows.slice(i, i + 500);
    const res = await prisma.enrollmentPlan.createMany({ data: b, skipDuplicates: true });
    insP += res.count;
  }
  console.log(`enrollment_plans: inserted ${insP}`);

  // —— admission_records: year-scoped replace ——
  const delA = await prisma.admissionRecord.deleteMany({ where: { year: { in: ADMISSION_YEARS } } });
  console.log(`admission_records: deleted ${delA.count} (years ${ADMISSION_YEARS.join(',')})`);
  let insA = 0;
  for (let i = 0; i < admRows.length; i += 500) {
    const b = admRows.slice(i, i + 500);
    const res = await prisma.admissionRecord.createMany({ data: b, skipDuplicates: true });
    insA += res.count;
  }
  console.log(`admission_records: inserted ${insA}`);
  console.log('WRITE done. 征集/score_segments/batch_lines 未触碰。');
  await prisma.$disconnect();
}

run().catch((e) => { console.error(e); process.exit(1); });
