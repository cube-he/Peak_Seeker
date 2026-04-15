/**
 * 增强数据导入脚本
 * 导入体检受限、地区资格、强基计划、院校增强、专业增强数据
 *
 * 用法:
 *   pnpm import:enriched
 *   DATABASE_URL=mysql://root:password@localhost:3306/volunteer_helper npx ts-node scripts/import-enriched.ts
 *
 * 幂等性: 每次运行前清除相关表，或使用 upsert/updateMany
 */
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

// Load .env from server directory if DATABASE_URL not already set
if (!process.env.DATABASE_URL) {
  const envPath = path.resolve(__dirname, '../apps/server/.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const match = line.match(/^([A-Z_]+)\s*=\s*"?([^"]+)"?\s*$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2];
      }
    }
  }
}

// Prisma v7 requires an explicit adapter; DATABASE_URL must be set in environment
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('Error: DATABASE_URL environment variable is required.');
  console.error('  Set it manually or create apps/server/.env with DATABASE_URL=mysql://...');
  process.exit(1);
}
const adapter = new PrismaMariaDb(DATABASE_URL);
const prisma = new PrismaClient({ adapter } as any);

const OUTPUT_DIR = path.resolve(__dirname, './data-processing/output');

// ==================== 工具函数 ====================

function readJson<T>(filename: string): T[] {
  const filePath = path.join(OUTPUT_DIR, filename);
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw) as T[];
}

function toInt(val: unknown): number | null {
  if (val === null || val === undefined || val === '' || val === '-') return null;
  const n = parseInt(String(val), 10);
  return isNaN(n) ? null : n;
}

function toFloat(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null;
  const n = parseFloat(String(val));
  return isNaN(n) ? null : n;
}

function toStr(val: unknown): string | null {
  if (val === null || val === undefined || val === '') return null;
  return String(val).trim();
}

// ==================== Phase 1: 体检受限 ====================

async function importHealthRestrictions() {
  console.log('\n=== [1/5] Importing Health Restrictions ===');

  const items = readJson<{
    conditionCode: string;
    conditionName: string;
    restrictionType: string;
    severity: string;
    section: string | null;
    restrictionScope: string;
    majorCategory: string | null;
    majorCode: string | null;
    majorName: string | null;
  }>('health_restrictions.json');

  console.log(`  Total records: ${items.length}`);

  // 幂等性：清空后重新导入
  await prisma.healthRestriction.deleteMany({});
  console.log('  Cleared existing data');

  let count = 0;
  for (const item of items) {
    // 全类受限时，majorCategory/majorCode/majorName 置 null
    const majorCategory = item.majorCategory === '所有专业' ? null : toStr(item.majorCategory);
    const majorCode = item.majorCode === '-' ? null : toStr(item.majorCode);
    const majorName = item.majorName === '（所有本科专业）' ? null : toStr(item.majorName);

    await prisma.healthRestriction.create({
      data: {
        conditionCode: item.conditionCode,
        conditionName: item.conditionName,
        restrictionType: item.restrictionType,
        severity: item.severity,
        section: toStr(item.section),
        restrictionScope: item.restrictionScope,
        majorCategory,
        majorCode,
        majorName,
      },
    });

    count++;
    if (count % 200 === 0) process.stdout.write(`  ${count}/${items.length}\r`);
  }

  console.log(`  Imported ${count} health restrictions`);
}

// ==================== Phase 2: 地区资格 ====================

async function importEligibleRegions() {
  console.log('\n=== [2/5] Importing Eligible Regions ===');

  const items = readJson<{
    program: string;
    programLabel: string;
    area: string | null;
    county: string | null;
    detail: string | null;
  }>('eligible_regions.json');

  console.log(`  Total records: ${items.length}`);

  await prisma.eligibleRegion.deleteMany({});
  console.log('  Cleared existing data');

  let count = 0;
  for (const item of items) {
    await prisma.eligibleRegion.create({
      data: {
        program: item.program,
        programLabel: item.programLabel,
        area: item.area ?? '',
        county: toStr(item.county),
        detail: toStr(item.detail),
      },
    });
    count++;
  }

  console.log(`  Imported ${count} eligible regions`);
}

// ==================== Phase 3: 强基计划 ====================

async function importQiangjiAdmissions() {
  console.log('\n=== [3/5] Importing Qiangji Admissions ===');

  const items = readJson<{
    school: string;
    subject: string | null;
    major: string;
    admissionMethod: string | null;
    entryScore2024: number | null;
    entryScore2023: number | null;
    entryScore2022: number | null;
    admitScore2024: number | null;
    admitScore2023: number | null;
    admitScore2022: number | null;
    gaokaoScore2024: number | null;
    gaokaoRank2024: number | null;
    gaokaoScore2023: number | null;
    gaokaoRank2023: number | null;
    gaokaoScore2022: number | null;
    gaokaoRank2022: number | null;
  }>('qiangji_admissions.json');

  console.log(`  Source records: ${items.length}`);

  type YearEntry = {
    school: string;
    major: string;
    subject: string | null;
    admissionMethod: string | null;
    year: number;
    entryScore: number | null;
    admitScore: number | null;
    gaokaoScore: number | null;
    gaokaoRank: number | null;
  };

  // 将每条记录展开为多年行，跳过四个分数全为 null 的年份
  const years: Array<{ year: number; suffix: '2024' | '2023' | '2022' }> = [
    { year: 2024, suffix: '2024' },
    { year: 2023, suffix: '2023' },
    { year: 2022, suffix: '2022' },
  ];

  const rows: YearEntry[] = [];
  for (const item of items) {
    // 清理换行符：subject 和 admissionMethod 中的 \n 替换为 、
    const subject = item.subject ? item.subject.replace(/\n/g, '、') : null;
    const admissionMethod = item.admissionMethod
      ? item.admissionMethod.replace(/\n/g, '、')
      : null;

    for (const { year, suffix } of years) {
      const entryScore = toInt(item[`entryScore${suffix}` as keyof typeof item]);
      const admitScore = toInt(item[`admitScore${suffix}` as keyof typeof item]);
      const gaokaoScore = toInt(item[`gaokaoScore${suffix}` as keyof typeof item]);
      const gaokaoRank = toInt(item[`gaokaoRank${suffix}` as keyof typeof item]);

      // 四个分数全为 null 时跳过该年份
      if (
        entryScore === null &&
        admitScore === null &&
        gaokaoScore === null &&
        gaokaoRank === null
      ) {
        continue;
      }

      rows.push({
        school: item.school,
        major: item.major,
        subject,
        admissionMethod,
        year,
        entryScore,
        admitScore,
        gaokaoScore,
        gaokaoRank,
      });
    }
  }

  console.log(`  Expanded to ${rows.length} year-rows`);

  let count = 0;
  let skipped = 0;
  for (const row of rows) {
    try {
      await prisma.qiangjiAdmission.upsert({
        where: {
          school_major_year: {
            school: row.school,
            major: row.major,
            year: row.year,
          },
        },
        update: {
          subject: row.subject,
          admissionMethod: row.admissionMethod,
          entryScore: row.entryScore,
          admitScore: row.admitScore,
          gaokaoScore: row.gaokaoScore,
          gaokaoRank: row.gaokaoRank,
        },
        create: {
          school: row.school,
          major: row.major,
          subject: row.subject,
          admissionMethod: row.admissionMethod,
          year: row.year,
          entryScore: row.entryScore,
          admitScore: row.admitScore,
          gaokaoScore: row.gaokaoScore,
          gaokaoRank: row.gaokaoRank,
        },
      });
      count++;
    } catch (err) {
      skipped++;
    }
  }

  console.log(`  Imported ${count} qiangji admissions (skipped ${skipped})`);
}

// ==================== Phase 4: 院校增强 ====================

async function enrichUniversities() {
  console.log('\n=== [4/5] Enriching Universities ===');

  const items = readJson<{
    enrollCode: number;
    name: string;
    department: string | null;
    ranking: number | null;
    admissionGuide: string | null;
    renameHistory: string | null;
    postgradRate: string | null;
    disciplineEvaluationLevel: string | null;
    softRating: string | null;
    softRanking: number | null;
    masterProgramCount: number | null;
    doctoralProgramCount: number | null;
    hasMasterProgram: boolean;
    hasDoctoralProgram: boolean;
    masterPrograms: string | null;
    doctoralPrograms: string | null;
    maleRatio: number | null;
    femaleRatio: number | null;
    createdYear: string | null;
    logoUrl: string | null;
    aClassDisciplineCount: number | null;
    rankingAlumni: number | null;
    rankingQS: number | null;
    rankingUSNews: number | null;
    satisfactionOverall: number | null;
    satisfactionLife: number | null;
    satisfactionEnviron: number | null;
    satisfactionCount: number | null;
    charterFilingRatio: string | null;
    charterMajorAllocation: string | null;
    charterTiebreaker: string | null;
    charterLanguageReq: string | null;
    charterPhysicalReq: string | null;
    charterBonusPolicy: string | null;
    charterAdjustment: string | null;
    employmentRate: string | null;
    furtherStudyRate: string | null;
    avgSalary: string | null;
    topEmployers: string | null;
  }>('universities_enriched.json');

  console.log(`  Total enriched universities: ${items.length}`);

  let updated = 0;
  let notFound = 0;

  for (const item of items) {
    // University.code 存储四川招生代码（字符串），enriched 数据中为数字 enrollCode
    const enrollCodeStr = String(item.enrollCode);

    // 合并 7 个 charter* 字段为 charterInfo JSON
    const charterInfo =
      item.charterFilingRatio ||
      item.charterMajorAllocation ||
      item.charterTiebreaker ||
      item.charterLanguageReq ||
      item.charterPhysicalReq ||
      item.charterBonusPolicy ||
      item.charterAdjustment
        ? {
            filingRatio: toStr(item.charterFilingRatio),
            majorAllocation: toStr(item.charterMajorAllocation),
            tiebreaker: toStr(item.charterTiebreaker),
            languageReq: toStr(item.charterLanguageReq),
            physicalReq: toStr(item.charterPhysicalReq),
            bonusPolicy: toStr(item.charterBonusPolicy),
            adjustment: toStr(item.charterAdjustment),
          }
        : null;

    // masterPrograms/doctoralPrograms 在 enriched 数据中是分号分隔的字符串，需拆分为数组
    const masterProgramsArr =
      item.masterPrograms ? item.masterPrograms.split('；').filter(Boolean) : undefined;
    const doctoralProgramsArr =
      item.doctoralPrograms ? item.doctoralPrograms.split('；').filter(Boolean) : undefined;

    try {
      const result = await prisma.university.updateMany({
        where: { code: enrollCodeStr },
        data: {
          department: toStr(item.department),
          ranking: item.ranking !== null ? String(item.ranking) : undefined,
          admissionGuide: toStr(item.admissionGuide),
          renameHistory: toStr(item.renameHistory),
          postgradRate: toStr(item.postgradRate),
          disciplineEvaluationLevel: toStr(item.disciplineEvaluationLevel),
          softRating: toStr(item.softRating),
          softRanking: toInt(item.softRanking),
          masterProgramCount: toInt(item.masterProgramCount),
          doctoralProgramCount: toInt(item.doctoralProgramCount),
          hasMasterProgram: item.hasMasterProgram,
          hasDoctoralProgram: item.hasDoctoralProgram,
          ...(masterProgramsArr !== undefined && { masterPrograms: masterProgramsArr }),
          ...(doctoralProgramsArr !== undefined && { doctoralPrograms: doctoralProgramsArr }),
          maleRatio: toInt(item.maleRatio),
          femaleRatio: toInt(item.femaleRatio),
          createdYear: toStr(item.createdYear),
          logoUrl: toStr(item.logoUrl),
          aClassDisciplineCount: toInt(item.aClassDisciplineCount),
          rankingAlumni: toInt(item.rankingAlumni),
          rankingQS: toInt(item.rankingQS),
          rankingUSNews: toInt(item.rankingUSNews),
          satisfactionOverall: toFloat(item.satisfactionOverall),
          satisfactionLife: toFloat(item.satisfactionLife),
          satisfactionEnviron: toFloat(item.satisfactionEnviron),
          satisfactionCount: toInt(item.satisfactionCount),
          employmentRate: toStr(item.employmentRate),
          furtherStudyRate: toStr(item.furtherStudyRate),
          avgSalary: toStr(item.avgSalary),
          topEmployers: toStr(item.topEmployers),
          ...(charterInfo !== null && { charterInfo }),
        },
      });

      if (result.count > 0) {
        updated += result.count;
      } else {
        notFound++;
      }
    } catch (err) {
      notFound++;
    }

    if ((updated + notFound) % 200 === 0) {
      process.stdout.write(`  ${updated} updated, ${notFound} not found\r`);
    }
  }

  console.log(`  Updated ${updated} universities (${notFound} not found in DB)`);
}

// ==================== Phase 5: 专业增强 ====================

async function enrichMajors() {
  console.log('\n=== [5/5] Enriching Majors ===');

  const items = readJson<{
    name: string;
    softRating: string | null;
    description: string | null;
    maleRatio: number | null;
    femaleRatio: number | null;
    studentScale: string | null;
    careerDirections: string[] | null;
    postgraduateDirections: string[] | null;
    satisfactionScore: number | null;
    coreCourses?: string | null;
    degree?: string | null;
    standardDuration?: number | string | null;
  }>('majors_enriched.json');

  console.log(`  Total enriched majors: ${items.length}`);

  let updated = 0;
  let notFound = 0;

  for (const item of items) {
    // 专业代码不唯一，用专业名称匹配（同名多行时全部更新）
    const result = await prisma.major.updateMany({
      where: { name: item.name },
      data: {
        softRating: toStr(item.softRating),
        description: toStr(item.description),
        maleRatio: toInt(item.maleRatio),
        femaleRatio: toInt(item.femaleRatio),
        studentScale: toStr(item.studentScale),
        ...(item.careerDirections !== undefined && {
          careerDirections: item.careerDirections,
        }),
        ...(item.postgraduateDirections !== undefined && {
          postgraduateDirections: item.postgraduateDirections,
        }),
        satisfactionScore: toFloat(item.satisfactionScore),
        ...(item.coreCourses !== undefined && {
          coreCourses: item.coreCourses
            ? item.coreCourses.split(',').map((s: string) => s.trim()).filter(Boolean)
            : null,
        }),
        ...(item.degree !== undefined && { degree: toStr(item.degree) }),
        ...(item.standardDuration !== undefined && {
          standardDuration: item.standardDuration !== null ? String(item.standardDuration) : null,
        }),
      },
    });

    if (result.count > 0) {
      updated += result.count;
    } else {
      notFound++;
    }

    if ((updated + notFound) % 200 === 0) {
      process.stdout.write(`  ${updated} updated, ${notFound} not found\r`);
    }
  }

  console.log(`  Updated ${updated} major rows (${notFound} names not found in DB)`);
}

// ==================== Main ====================

async function main() {
  console.log('=== VolunteerHelper Enriched Data Import ===');
  console.log(`Output dir: ${OUTPUT_DIR}`);

  try {
    await importHealthRestrictions();
    await importEligibleRegions();
    await importQiangjiAdmissions();
    await enrichUniversities();
    await enrichMajors();

    console.log('\n=== Import Complete ===');
  } catch (err) {
    console.error('Import failed:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
