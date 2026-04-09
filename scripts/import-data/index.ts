/**
 * 高考志愿填报数据导入脚本
 * 从 Excel 文件解析院校、专业、招生计划、录取数据，写入 MySQL
 *
 * 用法:
 *   cd scripts/import-data
 *   pnpm install
 *   tsx index.ts --file="../../2026四川高考志愿_清洗后.xlsx" --province="四川"
 */
import * as XLSX from 'xlsx';
import { PrismaClient } from '@prisma/client';
import * as path from 'path';

const prisma = new PrismaClient();

// ==================== Excel 列索引 (87列格式 - 2026年) ====================
const COL = {
  // 院校信息 (0-4)
  universityName: 0,
  universityCode: 1,
  groupCode: 2,
  universityGroup: 3,
  universityNotes: 4,

  // 专业信息 (5-9)
  majorName: 5,
  majorCode: 6,
  majorClass: 7,
  majorCategory: 8,
  majorNotes: 9,

  // 招生信息 (10-20)
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

  // 2025年投档数据 (21-22)
  filing25MinScore: 21,
  filing25MinRank: 22,

  // 2025年专业组数据 (23-26)
  group25MinScore: 23,
  group25MaxScore: 24,
  group25MinRank: 25,
  group25AdmissionCount: 26,

  // 2025年专业录取数据 (27-33)
  adm25Count: 27,
  major25MinScore: 28,
  major25MinRank: 29,
  major25AvgScore: 30,
  major25AvgRank: 31,
  major25MaxScore: 32,
  major25MaxRank: 33,

  // 2024年专业组数据 (34-36)
  group24MinScore: 34,
  group24MinRank: 35,
  group24AdmissionCount: 36,

  // 2024年专业录取数据 (37-43)
  adm24Count: 37,
  major24MinScore: 38,
  major24MinRank: 39,
  major24AvgScore: 40,
  major24AvgRank: 41,
  major24MaxScore: 42,
  major24MaxRank: 43,

  // 2023年专业录取数据 (44-50)
  adm23Count: 44,
  major23MinScore: 45,
  major23MinRank: 46,
  major23AvgScore: 47,
  major23AvgRank: 48,
  major23MaxScore: 49,
  major23MaxRank: 50,

  // 2022年专业录取数据 (51-57)
  adm22Count: 51,
  major22MinScore: 52,
  major22MinRank: 53,
  major22AvgScore: 54,
  major22AvgRank: 55,
  major22MaxScore: 56,
  major22MaxRank: 57,

  // 院校地理信息 (58-63)
  uniProvince: 58,
  uniCity: 59,
  cityLevel: 60,
  uniType: 61,
  uniNature: 62,
  uniDepartment: 63,

  // 院校标签和属性 (64-71)
  uniTags: 64,
  uniLevel: 65,
  uniRank: 66,
  uniAdmissionGuide: 67,
  uniRename: 68,
  uniTransfer: 69,
  uniPostgradRate: 70,
  isDoubleFirstClass: 71,

  // 学科评估和软科数据 (72-75)
  disciplineEvaluation: 72,
  softRating: 73,
  softRanking: 74,
  majorLevel: 75,

  // 专业相关信息 (76-80)
  majorSoftRating: 76,
  isNationalFeature: 77,
  majorRank: 78,
  majorHonor: 79,
  localMaster: 80,

  // 学位点信息 (81-86)
  localDoctor: 81,
  masterCount: 82,
  masterPrograms: 83,
  doctoralCount: 84,
  doctoralPrograms: 85,
  localMasterPoint: 86,
  localDoctoralPoint: 87,
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

  // Step 1: Extract and import unique universities
  console.log('\n=== [1/5] Importing Universities ===');
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
      softRating: toStr(row[COL.softRating]),
      softRanking: toInt(row[COL.softRanking]),
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

  // Step 2: Extract and import unique majors
  console.log('\n=== [2/5] Importing Majors ===');
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
      majorLevel: toStr(row[COL.majorLevel]),
      softRating: toStr(row[COL.majorSoftRating]),
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

  // Step 3: Import enrollment plans (2026)
  console.log('\n=== [3/5] Importing Enrollment Plans (2026) ===');
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
      year: 2026,
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
      localMasterPoint: !!toStr(row[COL.localMasterPoint]),
      localDoctoralPoint: !!toStr(row[COL.localDoctoralPoint]),
    };

    try {
      await prisma.enrollmentPlan.upsert({
        where: {
          universityId_majorId_year_province: {
            universityId, majorId, year: 2026, province: sheetName,
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

  // Step 4: Import admission records (2025, 2024, 2023, 2022)
  console.log('\n=== [4/5] Importing Admission Records ===');
  let admCount = 0;
  let admSkipped = 0;

  for (const row of dataRows) {
    const uniCode = toStr(row[COL.universityCode]);
    const majorName = toStr(row[COL.majorName]);
    if (!uniCode || !majorName) continue;

    const universityId = uniIdMap.get(uniCode);
    const majorId = majorIdMap.get(majorName);
    if (!universityId || !majorId) { admSkipped++; continue; }

    // 2025 data (new complete data)
    const min25 = toInt(row[COL.major25MinScore]);
    const minRank25 = toInt(row[COL.major25MinRank]);
    if (min25 || minRank25) {
      try {
        const data25 = {
          universityId, majorId, year: 2025, province: sheetName,
          majorMinScore: min25,
          majorMinRank: minRank25,
          majorAdmissionCount: toInt(row[COL.adm25Count]),
          majorAvgScore: toInt(row[COL.major25AvgScore]),
          majorAvgRank: toInt(row[COL.major25AvgRank]),
          majorMaxScore: toInt(row[COL.major25MaxScore]),
          majorMaxRank: toInt(row[COL.major25MaxRank]),
          groupMinScore: toInt(row[COL.group25MinScore]),
          groupMinRank: toInt(row[COL.group25MinRank]),
          groupAdmissionCount: toInt(row[COL.group25AdmissionCount]),
          filingMinScore: toInt(row[COL.filing25MinScore]),
          filingMinRank: toInt(row[COL.filing25MinRank]),
        };
        await prisma.admissionRecord.upsert({
          where: {
            universityId_majorId_year_province: {
              universityId, majorId, year: 2025, province: sheetName,
            },
          },
          update: data25,
          create: data25,
        });
        admCount++;
      } catch { admSkipped++; }
    }

    // 2024 data
    const min24 = toInt(row[COL.major24MinScore]);
    const minRank24 = toInt(row[COL.major24MinRank]);
    if (min24 || minRank24) {
      try {
        const data24 = {
          universityId, majorId, year: 2024, province: sheetName,
          majorMinScore: min24,
          majorMinRank: minRank24,
          majorAdmissionCount: toInt(row[COL.adm24Count]),
          majorAvgScore: toInt(row[COL.major24AvgScore]),
          majorAvgRank: toInt(row[COL.major24AvgRank]),
          majorMaxScore: toInt(row[COL.major24MaxScore]),
          majorMaxRank: toInt(row[COL.major24MaxRank]),
          groupMinScore: toInt(row[COL.group24MinScore]),
          groupMinRank: toInt(row[COL.group24MinRank]),
          groupAdmissionCount: toInt(row[COL.group24AdmissionCount]),
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
    const min23 = toInt(row[COL.major23MinScore]);
    const minRank23 = toInt(row[COL.major23MinRank]);
    if (min23 || minRank23) {
      try {
        const data23 = {
          universityId, majorId, year: 2023, province: sheetName,
          majorMinScore: min23,
          majorMinRank: minRank23,
          majorAdmissionCount: toInt(row[COL.adm23Count]),
          majorAvgScore: toInt(row[COL.major23AvgScore]),
          majorAvgRank: toInt(row[COL.major23AvgRank]),
          majorMaxScore: toInt(row[COL.major23MaxScore]),
          majorMaxRank: toInt(row[COL.major23MaxRank]),
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
    const min22 = toInt(row[COL.major22MinScore]);
    const minRank22 = toInt(row[COL.major22MinRank]);
    if (min22 || minRank22) {
      try {
        const data22 = {
          universityId, majorId, year: 2022, province: sheetName,
          majorMinScore: min22,
          majorMinRank: minRank22,
          majorAdmissionCount: toInt(row[COL.adm22Count]),
          majorAvgScore: toInt(row[COL.major22AvgScore]),
          majorAvgRank: toInt(row[COL.major22AvgRank]),
          majorMaxScore: toInt(row[COL.major22MaxScore]),
          majorMaxRank: toInt(row[COL.major22MaxRank]),
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

  console.log('\n=== [5/5] Score Segments ===');
  console.log('  (Import from CSV file - please run score-segments script separately)');

  console.log('\n=== Import Complete ===');
  console.log(`  Universities: ${uniCount}`);
  console.log(`  Majors: ${majorCount}`);
  console.log(`  Enrollment Plans (2026): ${planCount}`);
  console.log(`  Admission Records (2025+2024+2023+2022): ${admCount}`);
}

// ==================== CLI ====================
async function main() {
  const args = process.argv.slice(2);
  let filePath = '../../2026四川高考志愿_清洗后.xlsx';
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
