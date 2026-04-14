/**
 * 数据导入脚本 - 将处理好的JSON数据导入MySQL
 *
 * 运行方式（在 apps/server 目录下）:
 *   npx tsx ../../scripts/data-processing/import_to_db.ts --data=../../scripts/data-processing/output
 *
 * 或通过部署脚本远程执行:
 *   python scripts/data-processing/deploy_data.py
 */
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as fs from 'fs';
import * as path from 'path';

const adapter = new PrismaMariaDb(process.env.DATABASE_URL!);
const prisma = new PrismaClient({
  adapter,
  log: ['warn', 'error'],
});

// 默认数据目录
let DATA_DIR = path.resolve(__dirname, 'output');

// 解析CLI参数
for (const arg of process.argv.slice(2)) {
  if (arg.startsWith('--data=')) {
    DATA_DIR = path.resolve(arg.slice(7));
  }
}

function loadJSON<T>(filename: string): T {
  const p = path.join(DATA_DIR, filename);
  console.log(`  Loading ${filename}...`);
  const raw = fs.readFileSync(p, 'utf-8');
  const data = JSON.parse(raw);
  console.log(`  → ${Array.isArray(data) ? data.length + ' records' : 'object'}`);
  return data;
}

function toInt(val: any): number | null {
  if (val === null || val === undefined) return null;
  const n = parseInt(String(val), 10);
  return isNaN(n) ? null : n;
}

function toStr(val: any): string | null {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  return s || null;
}

// ==================== Step 1: Score Segments ====================
async function importScoreSegments() {
  console.log('\n=== [1/7] Score Segments ===');
  const data = loadJSON<any[]>('score_segments.json');

  // 清空
  await prisma.scoreSegment.deleteMany();
  console.log('  Cleared existing data');

  // 批量插入
  const batchSize = 500;
  let total = 0;
  for (let i = 0; i < data.length; i += batchSize) {
    const batch = data.slice(i, i + batchSize).map(r => ({
      year: r.year,
      province: r.province,
      examType: r.examType,
      score: r.score,
      count: r.count || 0,
      cumulativeCount: r.cumulativeCount || 0,
    }));
    await prisma.scoreSegment.createMany({ data: batch, skipDuplicates: true });
    total += batch.length;
    process.stdout.write(`  ${total}/${data.length}\r`);
  }
  console.log(`  Imported ${total} score segments`);
}

// ==================== Step 2: Batch Lines ====================
async function importBatchLines() {
  console.log('\n=== [2/7] Batch Lines ===');
  const data = loadJSON<any[]>('batch_lines.json');

  await prisma.batchLine.deleteMany();
  console.log('  Cleared existing data');

  const records = data.map(r => ({
    year: r.year,
    province: r.province,
    batch: r.batch,
    examType: r.examType,
    batchType: r.batchType,
    score: r.score,
  }));

  await prisma.batchLine.createMany({ data: records, skipDuplicates: true });
  console.log(`  Imported ${records.length} batch lines`);
}

// ==================== Step 3: Universities ====================
async function importUniversities(): Promise<Map<string, number>> {
  console.log('\n=== [3/7] Universities ===');
  const data = loadJSON<any[]>('universities_enriched.json');

  // 清空（需先清依赖表）
  console.log('  Clearing dependent tables...');
  await prisma.admissionRecord.deleteMany();
  await prisma.enrollmentPlan.deleteMany();
  await prisma.university.deleteMany();
  console.log('  Cleared');

  const codeToId = new Map<string, number>();
  let count = 0;

  for (const u of data) {
    const code = String(u.enrollCode);
    const tags = u.tags && Array.isArray(u.tags) ? u.tags : [];

    try {
      const uni = await prisma.university.create({
        data: {
          name: u.name || 'Unknown',
          code: code,
          province: toStr(u.province),
          city: toStr(u.city),
          type: toStr(u.type),
          level: toStr(u.level),
          runningLevel: toStr(u.level),
          runningNature: toStr(u.runningNature),
          isDoubleFirstClass: !!u.isDoubleFirstClass,
          is985: !!u.is985,
          is211: !!u.is211,
          tags: tags.length > 0 ? tags : undefined,
          grade: toStr(u.grade),
          department: toStr(u.department),
          ranking: toStr(u.ranking),
          admissionGuide: toStr(u.admissionGuide),
          renameHistory: toStr(u.renameHistory),
          transferDifficulty: toStr(u.transferDifficulty),
          postgradRate: toStr(u.postgradRate),
          disciplineEvaluationLevel: toStr(u.disciplineEvaluationLevel),
          softRating: toStr(u.softRating),
          softRanking: toInt(u.softRanking),
          hasMasterProgram: !!u.hasMasterProgram,
          hasDoctoralProgram: !!u.hasDoctoralProgram,
          masterProgramCount: toInt(u.masterProgramCount),
          doctoralProgramCount: toInt(u.doctoralProgramCount),
          masterPrograms: u.masterPrograms ? String(u.masterPrograms).split('；').filter(Boolean) : undefined,
          doctoralPrograms: u.doctoralPrograms ? String(u.doctoralPrograms).split('；').filter(Boolean) : undefined,
        },
      });
      codeToId.set(code, uni.id);
      count++;
      if (count % 200 === 0) process.stdout.write(`  ${count}/${data.length}\r`);
    } catch (e: any) {
      console.error(`  Failed: ${u.name} (${code}): ${e.message?.slice(0, 100)}`);
    }
  }
  console.log(`  Imported ${count} universities`);
  return codeToId;
}

// ==================== Step 4: Majors ====================
async function importMajors(): Promise<Map<string, number>> {
  console.log('\n=== [4/7] Majors ===');
  const data = loadJSON<any[]>('majors_enriched.json');

  await prisma.major.deleteMany();
  console.log('  Cleared');

  const nameToId = new Map<string, number>();
  let count = 0;

  for (const m of data) {
    try {
      const major = await prisma.major.create({
        data: {
          name: m.name,
          code: toStr(m.code),
          category: toStr(m.category),
          level: toStr(m.level) === '本科' ? '本科' : (toStr(m.level) || '本科'),
          discipline: toStr(m.discipline),
          type: toStr(m.type),
          notes: toStr(m.notes),
          majorLevel: toStr(m.majorLevel),
          softRating: toStr(m.softRating),
          isRestricted: false,
        },
      });
      nameToId.set(m.name, major.id);
      count++;
    } catch (e: any) {
      console.error(`  Failed: ${m.name}: ${e.message?.slice(0, 100)}`);
    }
  }
  console.log(`  Imported ${count} majors`);
  return nameToId;
}

// ==================== Step 5: Enrollment Plans ====================
async function importEnrollmentPlans(
  uniCodeToId: Map<string, number>,
  majorNameToId: Map<string, number>,
) {
  console.log('\n=== [5/7] Enrollment Plans ===');
  const data = loadJSON<any[]>('enrollment_plans_enriched.json');

  let count = 0;
  let skipped = 0;
  const batchSize = 200;

  for (let i = 0; i < data.length; i += batchSize) {
    const batch = data.slice(i, i + batchSize);
    const records: any[] = [];

    for (const p of batch) {
      const uniId = uniCodeToId.get(String(p.universityEnrollCode));
      const majorId = majorNameToId.get(p.majorName);
      if (!uniId || !majorId) { skipped++; continue; }

      records.push({
        universityId: uniId,
        majorId,
        year: p.year || 2026,
        province: p.province || '四川',
        planCount: toInt(p.planCount),
        planNotes: toStr(p.planNotes),
        batch: toStr(p.batch),
        level: toStr(p.level),
        subjects: toStr(p.subjects),
        subjectRequirements: toStr(p.subjectRequirements),
        duration: toStr(p.duration),
        tuition: toInt(p.tuition),
        isSinoForeign: false,
        groupCode: toStr(p.groupCode),
        groupName: toStr(p.groupName),
        groupMajors: toStr(p.groupMajors),
        groupPlanCount: toInt(p.groupPlanCount),
        isNew: !!p.isNew,
        oldBatch: toStr(p.oldBatch),
        disciplineEval: toStr(p.disciplineEval),
        isNationalFeature: !!p.isNationalFeature,
        majorRanking: toStr(p.majorRanking),
        majorHonor: toStr(p.majorHonor),
        localMasterPoint: toStr(p.localMasterPoint) || null,
        localDoctoralPoint: toStr(p.localDoctoralPoint) || null,
      });
    }

    if (records.length > 0) {
      try {
        await prisma.enrollmentPlan.createMany({ data: records, skipDuplicates: true });
        count += records.length;
      } catch (e: any) {
        // fallback: insert one by one
        for (const r of records) {
          try {
            await prisma.enrollmentPlan.create({ data: r });
            count++;
          } catch { skipped++; }
        }
      }
    }
    if ((i / batchSize) % 10 === 0) process.stdout.write(`  ${count}/${data.length}\r`);
  }
  console.log(`  Imported ${count} plans (skipped ${skipped})`);
}

// ==================== Step 6: Admission Records ====================
async function importAdmissionRecords(
  uniCodeToId: Map<string, number>,
  majorNameToId: Map<string, number>,
) {
  console.log('\n=== [6/7] Admission Records ===');
  const data = loadJSON<any[]>('admission_records_filled.json');

  let count = 0;
  let skipped = 0;
  const batchSize = 300;

  for (let i = 0; i < data.length; i += batchSize) {
    const batch = data.slice(i, i + batchSize);
    const records: any[] = [];

    for (const r of batch) {
      const uniId = uniCodeToId.get(String(r.universityEnrollCode));
      const majorId = majorNameToId.get(r.majorName);
      if (!uniId || !majorId) { skipped++; continue; }

      records.push({
        universityId: uniId,
        majorId,
        year: r.year,
        province: r.province || '四川',
        majorMinScore: toInt(r.majorMinScore),
        majorMinRank: toInt(r.majorMinRank),
        majorAvgScore: toInt(r.majorAvgScore),
        majorAvgRank: toInt(r.majorAvgRank),
        majorMaxScore: toInt(r.majorMaxScore),
        majorMaxRank: toInt(r.majorMaxRank),
        majorAdmissionCount: toInt(r.majorAdmissionCount),
        groupMinScore: toInt(r.groupMinScore),
        groupMinRank: toInt(r.groupMinRank),
        groupAdmissionCount: toInt(r.groupAdmissionCount),
        filingMinScore: toInt(r.filingMinScore),
        filingMinRank: toInt(r.filingMinRank),
      });
    }

    if (records.length > 0) {
      try {
        await prisma.admissionRecord.createMany({ data: records, skipDuplicates: true });
        count += records.length;
      } catch {
        for (const r of records) {
          try {
            await prisma.admissionRecord.create({ data: r });
            count++;
          } catch { skipped++; }
        }
      }
    }
    if ((i / batchSize) % 20 === 0) process.stdout.write(`  ${count}/${data.length}\r`);
  }
  console.log(`  Imported ${count} records (skipped ${skipped})`);
}

// ==================== Step 7: Health Restrictions (raw SQL) ====================
async function importHealthRestrictions() {
  console.log('\n=== [7/7] Health Restrictions ===');
  const data = loadJSON<any[]>('health_restrictions.json');

  // 建表（如果不存在）
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS health_restrictions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      condition_code VARCHAR(50) NOT NULL,
      condition_name TEXT NOT NULL,
      restriction_type VARCHAR(50) NOT NULL,
      severity VARCHAR(20) NOT NULL,
      section VARCHAR(100),
      restriction_scope VARCHAR(50),
      major_category VARCHAR(200),
      major_code VARCHAR(50),
      major_name VARCHAR(200),
      created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3)
    )
  `);

  await prisma.$executeRawUnsafe('TRUNCATE TABLE health_restrictions');

  // 批量插入
  const batchSize = 200;
  let count = 0;
  for (let i = 0; i < data.length; i += batchSize) {
    const batch = data.slice(i, i + batchSize);
    const values = batch.map(r => {
      const esc = (v: any) => v ? `'${String(v).replace(/'/g, "''")}'` : 'NULL';
      return `(${esc(r.conditionCode)}, ${esc(r.conditionName)}, ${esc(r.restrictionType)}, ` +
             `${esc(r.severity)}, ${esc(r.section)}, ${esc(r.restrictionScope)}, ` +
             `${esc(r.majorCategory)}, ${esc(r.majorCode)}, ${esc(r.majorName)})`;
    }).join(',\n');

    await prisma.$executeRawUnsafe(`
      INSERT INTO health_restrictions
      (condition_code, condition_name, restriction_type, severity, section, restriction_scope, major_category, major_code, major_name)
      VALUES ${values}
    `);
    count += batch.length;
  }
  console.log(`  Imported ${count} health restrictions`);
}

// ==================== Main ====================
async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║        智愿家 数据导入 (JSON → MySQL via Prisma)        ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`Data dir: ${DATA_DIR}`);

  const start = Date.now();

  try {
    await prisma.$connect();
    console.log('Database connected ✓\n');

    // 1-2: 独立表
    await importScoreSegments();
    await importBatchLines();

    // 3-4: 主实体（返回ID映射）
    const uniMap = await importUniversities();
    const majorMap = await importMajors();

    // 5-6: 依赖表
    await importEnrollmentPlans(uniMap, majorMap);
    await importAdmissionRecords(uniMap, majorMap);

    // 7: 扩展表
    await importHealthRestrictions();

    const elapsed = ((Date.now() - start) / 1000).toFixed(0);
    console.log(`\n${'='.repeat(60)}`);
    console.log(`导入完成 ✓ (${elapsed}s)`);
    console.log(`${'='.repeat(60)}`);
  } catch (err) {
    console.error('Import failed:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
