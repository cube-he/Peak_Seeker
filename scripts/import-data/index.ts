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
// 已按 2026四川高考志愿_清洗后.xlsx 实际列名校验修正
const COL = {
  // 院校信息 (0-4)
  universityName: 0,       // 院校
  universityCode: 1,       // 院校代码 (四川招生代码, 非国标)
  groupCode: 2,            // 专业组代码
  universityGroup: 3,      // 院校专业组
  universityNotes: 4,      // 院校备注

  // 专业信息 (5-9)
  majorName: 5,            // 专业
  majorCode: 6,            // 专业代码
  majorClass: 7,           // 专业类
  majorCategory: 8,        // 门类
  majorNotes: 9,           // 专业备注

  // 招生信息 (10-20)
  subject: 10,             // 科目
  subjectRequirements: 11, // 选科要求
  type: 12,                // 类型
  batch: 13,               // 批次
  oldBatch: 14,            // 老批次
  isNew: 15,               // 是否新增
  groupPlanCount: 16,      // 25专业组计划
  planCount: 17,           // 计划人数
  duration: 18,            // 学制
  tuition: 19,             // 学费
  groupMajors: 20,         // 组内专业

  // 2025年投档数据 (21-22)
  filing25MinScore: 21,    // 25投档最低分
  filing25MinRank: 22,     // 25投档最低位次

  // 2025年专业组数据 (23-25) — 注意: 只有3列, 无maxScore
  group25AdmissionCount: 23, // 25专业组录取人数
  group25MinScore: 24,       // 25专业组最低分
  group25MinRank: 25,        // 25专业组最低位次

  // 2025年专业录取数据 (26-32)
  adm25Count: 26,          // 25录取人数
  major25MinScore: 27,     // 25最低分
  major25MinRank: 28,      // 25最低位次
  major25AvgScore: 29,     // 25平均分
  major25AvgRank: 30,      // 25平均位次
  major25MaxScore: 31,     // 25最高分
  major25MaxRank: 32,      // 25最高位次

  // 2024年专业组数据 (33-35)
  group24MinScore: 33,     // 24专业组最低分
  group24MinRank: 34,      // 24专业组最低分位次
  group24AdmissionCount: 35, // 24专业组录取人数

  // 2024年专业录取数据 (36-42)
  adm24Count: 36,          // 24录取人数
  major24MinScore: 37,     // 24最低分
  major24MinRank: 38,      // 24最低分位次
  major24AvgScore: 39,     // 24平均分
  major24AvgRank: 40,      // 24平均位
  major24MaxScore: 41,     // 24最高分
  major24MaxRank: 42,      // 24最高位

  // 2023年专业录取数据 (43-49)
  adm23Count: 43,          // 23录取人数
  major23MinScore: 44,     // 23最低分
  major23MinRank: 45,      // 23最低分位次
  major23AvgScore: 46,     // 23平均分
  major23AvgRank: 47,      // 23平均位
  major23MaxScore: 48,     // 23最高分
  major23MaxRank: 49,      // 23最高位

  // 2022年专业录取数据 (50-56)
  adm22Count: 50,          // 22录取人数
  major22MinScore: 51,     // 22最低分
  major22MinRank: 52,      // 22最低分位次
  major22AvgScore: 53,     // 22平均分
  major22AvgRank: 54,      // 22平均分位次
  major22MaxScore: 55,     // 22最高分
  major22MaxRank: 56,      // 22最高分位次

  // 院校地理信息 (57-62)
  uniProvince: 57,         // 院校省份
  uniCity: 58,             // 院校城市
  cityLevel: 59,           // 城市等级
  uniType: 60,             // 院校类型
  uniNature: 61,           // 办学性质
  uniDepartment: 62,       // 隶属部门

  // 院校标签和属性 (63-70)
  uniTags: 63,             // 院校标签
  uniLevel: 64,            // 院校层级
  uniRank: 65,             // 院校排名
  uniAdmissionGuide: 66,   // 招生简章
  uniRename: 67,           // 更名合并情况
  uniTransfer: 68,         // 转专业情况
  uniPostgradRate: 69,     // 保研率
  isDoubleFirstClass: 70,  // 是否双一流

  // 学科评估和软科数据 (71-74)
  disciplineEvaluation: 71, // 学科评估等级
  softRating: 72,          // 软科评级
  softRanking: 73,         // 软科排名
  disciplineEval2: 74,     // 学科评估

  // 专业相关信息 (75-78)
  majorLevel: 75,          // 专业水平
  isNationalFeature: 76,   // 是否国家特色
  majorRank: 77,           // 专业排名
  majorHonor: 78,          // 专业荣誉

  // 学位点信息 (79-86)
  localMaster: 79,         // 本校硕士
  localDoctor: 80,         // 本校博士
  masterCount: 81,         // 硕士点数量
  masterPrograms: 82,      // 硕士点专业
  doctoralCount: 83,       // 博士点数量
  doctoralPrograms: 84,    // 博士点专业
  localMasterPoint: 85,    // 本专业硕士点
  localDoctoralPoint: 86,  // 本专业博士点
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
