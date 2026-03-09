/**
 * 高考志愿填报数据导入脚本
 * 从 Excel 文件解析院校、专业、招生计划、录取数据，写入 MySQL
 *
 * 用法:
 *   cd scripts/import-data
 *   pnpm install
 *   tsx index.ts --file="../../2025高考志愿填报--西典学校整合版.xlsx" --province="四川"
 */
import * as XLSX from 'xlsx';
import { PrismaClient } from '@prisma/client';
import * as path from 'path';

const prisma = new PrismaClient();

// ==================== Excel ��索引 ====================
const COL = {
  // 院校信息
  universityName: 0,
  universityCode: 1,
  groupCode: 2,
  universityGroup: 3,
  universityNotes: 4,

  // 专业信息
  majorName: 5,
  majorCode: 6,
  majorClass: 7,
  majorCategory: 8,
  majorNotes: 9,

  // 招生信息
  subject: 10,
  subjectRequirements: 11,
  type: 12,
  batch: 13,
  oldBatch: 14,
  isNew: 15,
  groupPlanCount: 16,
  planCount: 17,
  duration: 18,
  tuition: 19,
  groupMajors: 20,

  // 24年专业组数据
  group24MinScore: 21,
  group24MinRank: 22,
  group24AdmissionCount: 23,

  // 24年专业录取数据
  year24: 24,
  max24_1: 25,
  maxRank24_1: 26,
  avg24_1: 27,
  avgRank24_1: 28,
  min24: 29,
  minRank24: 30,
  avg24: 31,
  avgRank24: 32,
  max24: 33,
  maxRank24: 34,
  admCount24: 35,

  // 23年专业录取数据
  year23: 36,
  max23_1: 37,
  maxRank23_1: 38,
  avg23_1: 39,
  avgRank23_1: 40,
  min23: 41,
  minRank23: 42,
  minRank23_2: 43,
  avg23: 44,
  avgRank23: 45,
  max23: 46,
  maxRank23: 47,
  admCount23: 48,

  // 22年专业录取数据
  year22: 49,
  max22_1: 50,
  maxRank22_1: 51,
  avg22_1: 52,
  avgRank22_1: 53,
  max22: 54,
  maxRank22: 55,
  avg22: 56,
  avgRank22: 57,
  min22: 58,
  minRank22: 59,
  admCount22: 60,

  // 院校详细信息
  uniProvince: 61,
  uniCity: 62,
  cityLevel: 63,
  uniType: 64,
  uniNature: 65,
  uniDepartment: 66,
  uniTags: 67,
  uniLevel: 68,
  uniRank: 69,
  uniAdmissionGuide: 70,
  uniRename: 71,
  uniTransfer: 72,
  uniPostgradRate: 73,
  isDoubleFirstClass: 74,
  disciplineEvaluation: 75,
  isNationalFeature: 76,
  majorRank: 77,
  majorHonor: 78,
  localMaster: 79,
  localDoctor: 80,
  masterCount: 81,
  masterPrograms: 82,
  doctoralCount: 83,
  doctoralPrograms: 84,
};

// ==================== 工具函数 ====================
function toInt(val: any): number | null {
  if (val === null || val === undefined || val === '' || val === '-') return null;
  const n = parseInt(String(val), 10);
  return isNaN(n) ? null : n;
}

function toStr(val: any): string | null {
  if (val === null || val === undefined || val === '') return null;
  return String(val).trim();
}

function parseTags(tagStr: string | null): string[] {
  if (!tagStr) return [];
  return tagStr.split('/').map(t => t.trim()).filter(Boolean);
}

function parsePercentage(val: any): number | null {
  if (!val) return null;
  const s = String(val).replace('%', '').trim();
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

// ==================== 导入逻辑 ====================
async function importData(filePath: string, sheetName: string) {
  console.log(`\nReading Excel: ${filePath} [${sheetName}]`);
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[sheetName];
  if (!ws) {
    console.error(`Sheet "${sheetName}" not found. Available: ${wb.SheetNames.join(', ')}`);
    process.exit(1);
  }

  const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
  const dataRows = rows.slice(1).filter(r => r[COL.universityName]); // skip header, skip empty
  console.log(`Total data rows: ${dataRows.length}`);

  // Step 1: Extract unique universities
  console.log('\n=== [1/4] Importing Universities ===');
  const uniMap = new Map<string, any>(); // code -> data
  for (const row of dataRows) {
    const code = toStr(row[COL.universityCode]);
    if (!code || uniMap.has(code)) continue;

    const tags = parseTags(toStr(row[COL.uniTags]));
    uniMap.set(code, {
      name: toStr(row[COL.universityName])!,
      code,
      province: toStr(row[COL.uniProvince]),
      city: toStr(row[COL.uniCity]),
      type: toStr(row[COL.uniType]),
      level: toStr(row[COL.uniLevel]),
      runningLevel: toStr(row[COL.uniLevel]),
      runningNature: toStr(row[COL.uniNature]),
      isDoubleFirstClass: tags.includes('双一流'),
      is985: tags.includes('985'),
      is211: tags.includes('211'),
      tags: tags.length > 0 ? tags : undefined,
      grade: toStr(row[COL.cityLevel]),
      hasMasterProgram: !!toInt(row[COL.masterCount]),
      hasDoctoralProgram: !!toInt(row[COL.doctoralCount]),
      masterProgramCount: toInt(row[COL.masterCount]),
      doctoralProgramCount: toInt(row[COL.doctoralCount]),
      masterPrograms: toStr(row[COL.masterPrograms]) ? toStr(row[COL.masterPrograms])!.split('；') : undefined,
      doctoralPrograms: toStr(row[COL.doctoralPrograms]) ? toStr(row[COL.doctoralPrograms])!.split('；') : undefined,
      notes: toStr(row[COL.universityNotes]),
    });
  }
  console.log(`  Unique universities: ${uniMap.size}`);

  // Batch upsert universities
  const uniIdMap = new Map<string, number>(); // code -> db id
  let uniCount = 0;
  for (const [code, data] of uniMap) {
    const uni = await prisma.university.upsert({
      where: { code },
      update: data,
      create: data,
    });
    uniIdMap.set(code, uni.id);
    uniCount++;
    if (uniCount % 100 === 0) process.stdout.write(`  ${uniCount}/${uniMap.size}\r`);
  }
  console.log(`  Imported ${uniCount} universities`);

  // Step 2: Extract unique majors
  console.log('\n=== [2/4] Importing Majors ===');
  const majorMap = new Map<string, any>(); // name -> data (use name as key since codes repeat)
  for (const row of dataRows) {
    const name = toStr(row[COL.majorName]);
    if (!name || majorMap.has(name)) continue;

    majorMap.set(name, {
      name,
      code: toStr(row[COL.majorCode]),
      category: toStr(row[COL.majorCategory]),
      level: toStr(row[COL.uniLevel]) === '本科' ? '本科' : '专科',
      discipline: toStr(row[COL.majorClass]),
      type: toStr(row[COL.type]),
      notes: toStr(row[COL.majorNotes]),
      isRestricted: false,
    });
  }
  console.log(`  Unique majors: ${majorMap.size}`);

  const majorIdMap = new Map<string, number>(); // name -> db id
  let majorCount = 0;
  for (const [name, data] of majorMap) {
    // Use upsert by finding existing or creating
    let major = await prisma.major.findFirst({ where: { name } });
    if (major) {
      major = await prisma.major.update({ where: { id: major.id }, data });
    } else {
      major = await prisma.major.create({ data });
    }
    majorIdMap.set(name, major.id);
    majorCount++;
    if (majorCount % 100 === 0) process.stdout.write(`  ${majorCount}/${majorMap.size}\r`);
  }
  console.log(`  Imported ${majorCount} majors`);

  // Step 3: Import enrollment plans (2025)
  console.log('\n=== [3/4] Importing Enrollment Plans (2025) ===');
  let planCount = 0;
  let planSkipped = 0;
  for (const row of dataRows) {
    const uniCode = toStr(row[COL.universityCode]);
    const majorName = toStr(row[COL.majorName]);
    if (!uniCode || !majorName) continue;

    const universityId = uniIdMap.get(uniCode);
    const majorId = majorIdMap.get(majorName);
    if (!universityId || !majorId) { planSkipped++; continue; }

    const planData = {
      universityId,
      majorId,
      year: 2025,
      province: sheetName,
      planCount: toInt(row[COL.planCount]),
      planNotes: toStr(row[COL.universityNotes]),
      batch: toStr(row[COL.batch]),
      level: toStr(row[COL.uniLevel]),
      subjects: toStr(row[COL.subject]),
      subjectRequirements: toStr(row[COL.subjectRequirements]),
      duration: toStr(row[COL.duration]),
      tuition: toInt(row[COL.tuition]),
      isSinoForeign: false,
    };

    try {
      await prisma.enrollmentPlan.upsert({
        where: {
          universityId_majorId_year_province: {
            universityId, majorId, year: 2025, province: sheetName,
          },
        },
        update: planData,
        create: planData,
      });
      planCount++;
    } catch {
      planSkipped++;
    }
    if (planCount % 500 === 0) process.stdout.write(`  ${planCount} plans\r`);
  }
  console.log(`  Imported ${planCount} enrollment plans (skipped ${planSkipped})`);

  // Step 4: Import admission records (2022, 2023, 2024)
  console.log('\n=== [4/4] Importing Admission Records ===');
  let admCount = 0;
  let admSkipped = 0;

  for (const row of dataRows) {
    const uniCode = toStr(row[COL.universityCode]);
    const majorName = toStr(row[COL.majorName]);
    if (!uniCode || !majorName) continue;

    const universityId = uniIdMap.get(uniCode);
    const majorId = majorIdMap.get(majorName);
    if (!universityId || !majorId) { admSkipped++; continue; }

    // 2024 data
    const min24 = toInt(row[COL.min24]);
    const minRank24 = toInt(row[COL.minRank24]);
    if (min24 || minRank24) {
      try {
        const data24 = {
          universityId, majorId, year: 2024, province: sheetName,
          majorMinScore: min24,
          majorMinRank: minRank24,
          majorAdmissionCount: toInt(row[COL.admCount24]),
          universityMinScore: toInt(row[COL.group24MinScore]),
          universityMinRank: toInt(row[COL.group24MinRank]),
          universityAvgScore: toInt(row[COL.avg24]),
          universityAvgRank: toInt(row[COL.avgRank24]),
          universityMaxScore: toInt(row[COL.max24]),
          universityMaxRank: toInt(row[COL.maxRank24]),
          universityAdmissionCount: toInt(row[COL.group24AdmissionCount]),
        };
        await prisma.admissionRecord.upsert({
          where: {
            universityId_majorId_year_province: {
              universityId, majorId, year: 2024, province: sheetName,
            },
          },
          update: data24,
          create: data24,
        });
        admCount++;
      } catch { admSkipped++; }
    }

    // 2023 data
    const min23 = toInt(row[COL.min23]);
    const minRank23 = toInt(row[COL.minRank23]);
    if (min23 || minRank23) {
      try {
        const data23 = {
          universityId, majorId, year: 2023, province: sheetName,
          majorMinScore: min23,
          majorMinRank: minRank23,
          majorAdmissionCount: toInt(row[COL.admCount23]),
          universityAvgScore: toInt(row[COL.avg23]),
          universityAvgRank: toInt(row[COL.avgRank23]),
          universityMaxScore: toInt(row[COL.max23]),
          universityMaxRank: toInt(row[COL.maxRank23]),
        };
        await prisma.admissionRecord.upsert({
          where: {
            universityId_majorId_year_province: {
              universityId, majorId, year: 2023, province: sheetName,
            },
          },
          update: data23,
          create: data23,
        });
        admCount++;
      } catch { admSkipped++; }
    }

    // 2022 data
    const min22 = toInt(row[COL.min22]);
    const minRank22 = toInt(row[COL.minRank22]);
    if (min22 || minRank22) {
      try {
        const data22 = {
          universityId, majorId, year: 2022, province: sheetName,
          majorMinScore: min22,
          majorMinRank: minRank22,
          majorAdmissionCount: toInt(row[COL.admCount22]),
          universityAvgScore: toInt(row[COL.avg22]),
          universityAvgRank: toInt(row[COL.avgRank22]),
          universityMaxScore: toInt(row[COL.max22]),
          universityMaxRank: toInt(row[COL.maxRank22]),
        };
        await prisma.admissionRecord.upsert({
          where: {
            universityId_majorId_year_province: {
              universityId, majorId, year: 2022, province: sheetName,
            },
          },
          update: data22,
          create: data22,
        });
        admCount++;
      } catch { admSkipped++; }
    }

    if (admCount % 1000 === 0) process.stdout.write(`  ${admCount} records\r`);
  }
  console.log(`  Imported ${admCount} admission records (skipped ${admSkipped})`);

  console.log('\n=== Import Complete ===');
  console.log(`  Universities: ${uniCount}`);
  console.log(`  Majors: ${majorCount}`);
  console.log(`  Enrollment Plans: ${planCount}`);
  console.log(`  Admission Records: ${admCount}`);
}

// ==================== CLI ====================
async function main() {
  const args = process.argv.slice(2);
  let filePath = '../../2025高考志愿填报--西典学校整合版.xlsx';
  let province = '四川';

  for (const arg of args) {
    if (arg.startsWith('--file=')) filePath = arg.slice(7);
    if (arg.startsWith('--province=')) province = arg.slice(11);
  }

  filePath = path.resolve(__dirname, filePath);
  console.log('=== VolunteerHelper Data Import ===');
  console.log(`File: ${filePath}`);
  console.log(`Province/Sheet: ${province}`);

  try {
    await importData(filePath, province);
  } catch (err) {
    console.error('Import failed:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
