/**
 * 导入历史志愿填报记录 (从 Excel + 附件目录).
 *
 * 用法 (在服务器跑):
 *   cd apps/server && npx ts-node scripts/import-historical-records.ts \
 *     --excel /tmp/import/志愿填报记录.xlsx \
 *     --attachments-dir /tmp/import \
 *     --teacher-profile-id 11 \
 *     --exam-year 2025 \
 *     --apply
 *
 *   不加 --apply 默认 dry-run (只解析打印, 不写 db).
 *
 * 附件目录结构期望:
 *   {attachments-dir}/咨询单/{学生姓名 咨询单.pdf}
 *   {attachments-dir}/志愿填报截图/{学生姓名 ...}
 *   {attachments-dir}/录取凭证/{hash.jpg}  (Excel 的"录取凭证"列存的就是 hash 文件名)
 *
 * 写入逻辑:
 *   1) 跳过 Excel r1 标题, 逐行处理
 *   2) 每行: 创建 User (role=STUDENT, realName=学生姓名) + StudentProfile (isArchived=true, examYear=2025)
 *   3) 创建 VolunteerPlan (isHistorical=true, status=FINALIZED)
 *   4) 创建 StudentAdmissionResult (admittedUniName, admittedMinScore, ...)
 *   5) 扫附件目录, fuzzy 匹配学生姓名 (前 1-3 字符) → 拷贝到 uploads/historical/{studentId}/{category}_{原名}
 *      → 写 StudentAttachment 记录
 *
 * 重复导入保护: 按 (realName + teacherProfileId + examYear) 唯一性, 已存在则 skip (不更新).
 */
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as ExcelJS from 'exceljs';
import * as bcrypt from 'bcrypt';

interface CliArgs {
  excel: string;
  attachmentsDir: string;
  teacherProfileId: number;
  examYear: number;
  apply: boolean;
  uploadsRoot: string;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const get = (k: string): string | undefined => {
    const i = args.indexOf(`--${k}`);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const has = (k: string) => args.includes(`--${k}`);

  const excel = get('excel');
  const attachmentsDir = get('attachments-dir');
  const teacherProfileId = Number(get('teacher-profile-id'));
  const examYear = Number(get('exam-year') ?? '2025');
  const apply = has('apply');
  const uploadsRoot = get('uploads-root') ?? path.join(__dirname, '..', 'uploads');

  if (!excel) throw new Error('--excel <path> 必填');
  if (!attachmentsDir) throw new Error('--attachments-dir <path> 必填');
  if (!teacherProfileId || isNaN(teacherProfileId))
    throw new Error('--teacher-profile-id <int> 必填 (这批学生归属哪个老师)');
  if (!examYear || isNaN(examYear)) throw new Error('--exam-year <int> 必填');

  return { excel, attachmentsDir, teacherProfileId, examYear, apply, uploadsRoot };
}

// Excel 列索引 (1-based, 跟 exceljs 一致)
const COL = {
  realName: 1,
  gender: 2,
  ethnicity: 3,
  firstChoice: 4,
  reChoices: 5,
  totalScore: 6,
  prevYearScore: 7,
  provincialRank: 8,
  hukou: 9,
  examLocation: 10,
  phone: 11,
  politicalStatus: 12,
  height: 13,
  weight: 14,
  vision: 15,
  colorVision: 16,
  health: 17,
  bonusPolicy: 18,
  priorityMode: 19,
  preferredBatch: 20,
  preferredRegions: 21,
  reception: 22,
  planTeacher: 23,
  review: 24,
  status: 25,
  fillBatch: 26,
  planLink: 27,
  consultationFile: 28,
  submissionScreenshotFiles: 29,
  admittedUniName: 30,
  admissionProofFile: 31,
  admittedMinScore: 32,
  admittedMinRank: 33,
  scoreDiff: 34,
  sequenceNo: 35,
  createdAt: 36,
  updatedAt: 37,
};

function cell(row: ExcelJS.Row, col: number): string | null {
  const v = row.getCell(col).value;
  if (v == null || v === '') return null;
  if (typeof v === 'object' && 'text' in v) return String((v as any).text).trim();
  return String(v).trim();
}
function numCell(row: ExcelJS.Row, col: number): number | null {
  const s = cell(row, col);
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function mapPriorityMode(s: string | null): 'UNIVERSITY_FIRST' | 'MAJOR_FIRST' | null {
  if (!s) return null;
  if (s.includes('院校')) return 'UNIVERSITY_FIRST';
  if (s.includes('专业')) return 'MAJOR_FIRST';
  return null;
}
function mapPoliticalStatus(s: string | null): 'PARTY_MEMBER' | 'LEAGUE_MEMBER' | 'MASSES' | null {
  if (!s) return null;
  if (s.includes('党员')) return 'PARTY_MEMBER';
  if (s.includes('团员')) return 'LEAGUE_MEMBER';
  if (s.includes('群众')) return 'MASSES';
  return null;
}
function mapExamType(firstChoice: string | null): 'PHYSICS' | 'HISTORY' | null {
  if (!firstChoice) return null;
  if (firstChoice.includes('物理')) return 'PHYSICS';
  if (firstChoice.includes('历史')) return 'HISTORY';
  return null;
}
function mapGender(s: string | null): 'MALE' | 'FEMALE' | null {
  if (!s) return null;
  if (s.includes('男')) return 'MALE';
  if (s.includes('女')) return 'FEMALE';
  return null;
}

function parseVision(s: string | null): { left: number | null; right: number | null } {
  if (!s) return { left: null, right: null };
  const parts = s.split(/[,，\s]+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return { left: null, right: null };
  const toNum = (p: string) => {
    const n = Number(p);
    return Number.isFinite(n) ? n : null;
  };
  return { left: toNum(parts[0]), right: toNum(parts[1]) };
}

interface ParsedRow {
  rowNum: number;
  realName: string;
  gender: 'MALE' | 'FEMALE' | null;
  ethnicity: string | null;
  examType: 'PHYSICS' | 'HISTORY' | null;
  firstChoice: string | null;
  reChoices: string[];
  totalScore: number | null;
  provincialRank: number | null;
  county: string | null;
  examLocationCounty: string | null;
  phone: string | null;
  politicalStatus: ReturnType<typeof mapPoliticalStatus>;
  height: number | null;
  weight: number | null;
  visionLeft: number | null;
  visionRight: number | null;
  priorityMode: ReturnType<typeof mapPriorityMode>;
  preferredBatch: string | null;
  preferredRegions: string[];
  fillBatch: string | null;
  planLinkText: string | null;
  consultationFile: string | null;
  submissionScreenshotFile: string | null;
  admittedUniName: string | null;
  admissionProofFile: string | null;
  admittedMinScore: number | null;
  admittedMinRank: number | null;
  scoreDiff: number | null;
  sequenceNo: number | null;
}

function parseExcel(filePath: string): Promise<ParsedRow[]> {
  return (async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(filePath);
    const sh = wb.worksheets[0];
    const out: ParsedRow[] = [];
    sh.eachRow((row, rn) => {
      if (rn === 1) return;
      const realName = cell(row, COL.realName);
      if (!realName) return;
      const reChoices = (cell(row, COL.reChoices) ?? '')
        .split(/[,，]/)
        .map((s) => s.trim())
        .filter(Boolean);
      const preferredRegions = (cell(row, COL.preferredRegions) ?? '')
        .split(/[,，]/)
        .map((s) => s.trim())
        .filter(Boolean);
      const firstChoice = cell(row, COL.firstChoice);
      const vision = parseVision(cell(row, COL.vision));

      // 志愿填报截图列可能 "胡程亮 志愿填报6.30.pdf,胡程亮 志愿填报6.30.pdf" (副本逗号分隔)
      const screenshotRaw = cell(row, COL.submissionScreenshotFiles);
      const submissionScreenshotFile = screenshotRaw
        ? screenshotRaw.split(/[,，]/)[0].trim()
        : null;

      out.push({
        rowNum: rn,
        realName,
        gender: mapGender(cell(row, COL.gender)),
        ethnicity: cell(row, COL.ethnicity),
        examType: mapExamType(firstChoice),
        firstChoice,
        reChoices,
        totalScore: numCell(row, COL.totalScore),
        provincialRank: numCell(row, COL.provincialRank),
        county: cell(row, COL.hukou),
        examLocationCounty: cell(row, COL.examLocation),
        phone: cell(row, COL.phone),
        politicalStatus: mapPoliticalStatus(cell(row, COL.politicalStatus)),
        height: numCell(row, COL.height),
        weight: numCell(row, COL.weight),
        visionLeft: vision.left,
        visionRight: vision.right,
        priorityMode: mapPriorityMode(cell(row, COL.priorityMode)),
        preferredBatch: cell(row, COL.preferredBatch),
        preferredRegions,
        fillBatch: cell(row, COL.fillBatch),
        planLinkText: cell(row, COL.planLink),
        consultationFile: cell(row, COL.consultationFile),
        submissionScreenshotFile,
        admittedUniName: cell(row, COL.admittedUniName),
        admissionProofFile: cell(row, COL.admissionProofFile),
        admittedMinScore: numCell(row, COL.admittedMinScore),
        admittedMinRank: numCell(row, COL.admittedMinRank),
        scoreDiff: numCell(row, COL.scoreDiff),
        sequenceNo: numCell(row, COL.sequenceNo),
      });
    });
    return out;
  })();
}

// 附件目录 → 三个子目录
const ATTACHMENT_SUBDIRS = {
  consultation: '咨询单',
  submission_screenshot: '志愿填报截图',
  admission_proof: '录取凭证',
} as const;

interface ImportPlan {
  row: ParsedRow;
  attachments: Array<{
    category: keyof typeof ATTACHMENT_SUBDIRS;
    sourcePath: string;
    originalName: string;
    mimeType: string;
    fileSize: number;
  }>;
}

function findAttachmentsForRow(row: ParsedRow, attachmentsDir: string): ImportPlan['attachments'] {
  const out: ImportPlan['attachments'] = [];
  // 直接按 Excel 中的文件名列查找 (不 fuzzy 匹配, 避免错位)
  const fileEntries: Array<[keyof typeof ATTACHMENT_SUBDIRS, string | null]> = [
    ['consultation', row.consultationFile],
    ['submission_screenshot', row.submissionScreenshotFile],
    ['admission_proof', row.admissionProofFile],
  ];
  for (const [category, fname] of fileEntries) {
    if (!fname) continue;
    // Excel 中保存的文件名是带 _ 还是带空格 — 实际看到 "胡程亮 咨询单.pdf" 带空格
    // 但物理目录里可能不一致, 先按原名查, 不存在则 fuzzy (用学生姓名 prefix 找)
    const subdir = path.join(attachmentsDir, ATTACHMENT_SUBDIRS[category]);
    const exactPath = path.join(subdir, fname);
    let actualPath: string | null = null;
    if (fs.existsSync(exactPath)) {
      actualPath = exactPath;
    } else {
      // fuzzy: 列出目录, 找文件名包含学生姓名的第一个
      if (fs.existsSync(subdir)) {
        const candidates = fs.readdirSync(subdir).filter((f) => f.includes(row.realName));
        if (candidates.length > 0) actualPath = path.join(subdir, candidates[0]);
      }
    }
    // 录取凭证用 hash 文件名, 不会包含学生姓名 — 只接受 exact 命中
    if (category === 'admission_proof' && !actualPath) continue;
    if (!actualPath) {
      console.warn(`  [WARN] 找不到附件: ${category}/${fname} (学生 ${row.realName})`);
      continue;
    }
    const stat = fs.statSync(actualPath);
    out.push({
      category,
      sourcePath: actualPath,
      originalName: path.basename(actualPath),
      mimeType: path.extname(actualPath).toLowerCase() === '.pdf'
        ? 'application/pdf'
        : 'image/jpeg',
      fileSize: stat.size,
    });
  }
  return out;
}

async function main() {
  const args = parseArgs();
  console.log('====== 历史志愿填报记录导入 ======');
  console.log(`  Excel: ${args.excel}`);
  console.log(`  Attachments dir: ${args.attachmentsDir}`);
  console.log(`  Teacher profile ID: ${args.teacherProfileId}`);
  console.log(`  Exam year: ${args.examYear}`);
  console.log(`  Mode: ${args.apply ? '✅ APPLY (写 db + 拷贝附件)' : '🟡 DRY-RUN (仅打印)'}`);
  console.log(`  Uploads root: ${args.uploadsRoot}`);
  console.log('');

  // 1. 解析 Excel
  const rows = await parseExcel(args.excel);
  console.log(`📄 解析到 ${rows.length} 行学生数据`);

  // 2. 匹配附件
  const plans: ImportPlan[] = rows.map((row) => ({
    row,
    attachments: findAttachmentsForRow(row, args.attachmentsDir),
  }));

  for (const p of plans) {
    console.log(
      `  - ${p.row.realName} (${p.row.gender}, ${p.row.examType}, ${p.row.totalScore}分) ` +
        `→ 录取: ${p.row.admittedUniName ?? '无'} | 附件 ${p.attachments.length} 个`,
    );
  }

  if (!args.apply) {
    console.log('\n🟡 dry-run 结束, 不写入 db. 加 --apply 真实执行.');
    return;
  }

  // 3. 写入 db (Apply mode)
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL 环境变量必填');
  const adapter = new PrismaMariaDb(databaseUrl);
  const prisma = new PrismaClient({ adapter } as any);

  // 校验 teacher_profile 存在
  const teacher = await prisma.teacherProfile.findUnique({
    where: { id: args.teacherProfileId },
    include: { user: true },
  });
  if (!teacher) throw new Error(`teacher_profile id=${args.teacherProfileId} 不存在`);
  console.log(`\n✅ 归属老师: ${teacher.user.realName ?? teacher.user.username} (profile id=${teacher.id})`);

  // 准备 uploads/historical/ 目录
  const historicalUploadsRoot = path.join(args.uploadsRoot, 'historical');
  fs.mkdirSync(historicalUploadsRoot, { recursive: true });

  let createdStudents = 0;
  let skippedStudents = 0;
  let createdAttachments = 0;

  for (const plan of plans) {
    const r = plan.row;

    // 重复检查: realName + teacher + examYear
    const existing = await prisma.studentProfile.findFirst({
      where: {
        teacherId: args.teacherProfileId,
        examYear: args.examYear,
        user: { realName: r.realName },
      },
      include: { user: true },
    });
    if (existing) {
      console.log(`  ⏭️  已存在, 跳过: ${r.realName} (student id=${existing.id})`);
      skippedStudents++;
      continue;
    }

    // 创建 User (历史档案: 用 historical_{年份}_{姓名拼音随机} 当 username, 不让真登录)
    const safeUsername =
      `hist_${args.examYear}_${r.realName}`
        .replace(/[^a-zA-Z0-9_一-龥]/g, '')
        .slice(0, 50);
    const randomPassword = await bcrypt.hash(
      `${Math.random().toString(36).slice(2)}_${Date.now()}`,
      10,
    );

    const user = await prisma.user.create({
      data: {
        username: safeUsername,
        passwordHash: randomPassword,
        realName: r.realName,
        gender: r.gender,
        ethnicity: r.ethnicity,
        phone: r.phone,
        role: 'STUDENT',
      },
    });

    // 创建 StudentProfile (isArchived=true)
    const profile = await prisma.studentProfile.create({
      data: {
        userId: user.id,
        teacherId: args.teacherProfileId,
        county: r.county,
        examLocationCounty: r.examLocationCounty,
        parentPhone: null,
        politicalStatus: r.politicalStatus,
        examType: r.examType,
        examYear: args.examYear,
        totalScore: r.totalScore,
        provincialRank: r.provincialRank,
        firstChoice: r.firstChoice,
        reChoices: r.reChoices.length > 0 ? r.reChoices : undefined,
        height: r.height ? String(r.height) : null,
        weight: r.weight ? String(r.weight) : null,
        visionLeft: r.visionLeft ? String(r.visionLeft) : null,
        visionRight: r.visionRight ? String(r.visionRight) : null,
        priorityMode: r.priorityMode,
        preferredProvinces: r.preferredRegions.length > 0 ? r.preferredRegions : undefined,
        status: 'ACTIVE',
        intakeStatus: 'VERIFIED',
        isArchived: true,
        serviceYear: args.examYear,
        // 历史档案导入: 没有真实填表人, 用 TOGETHER 占位 (FormFiller enum 只有 STUDENT/PARENT/TOGETHER)
        formFiller: 'TOGETHER',
      },
    });

    // 创建 VolunteerPlan (isHistorical=true, status=FINALIZED)
    await prisma.volunteerPlan.create({
      data: {
        studentId: profile.id,
        createdById: teacher.userId,
        name: `${r.realName} ${args.examYear} 志愿方案`,
        year: args.examYear,
        province: '四川',
        status: 'FINALIZED',
        batchName: r.fillBatch,
        versionNote: r.planLinkText ?? null,
        isHistorical: true,
        isFavorite: true,
        scoreUsed: r.totalScore,
        rankUsed: r.provincialRank,
      },
    });

    // 创建 StudentAdmissionResult
    if (r.admittedUniName) {
      await prisma.studentAdmissionResult.create({
        data: {
          studentId: profile.id,
          admittedUniName: r.admittedUniName,
          admittedMinScore: r.admittedMinScore,
          admittedMinRank: r.admittedMinRank,
          scoreDiff: r.scoreDiff,
          sequenceNo: r.sequenceNo,
          batchName: r.fillBatch,
        },
      });
    }

    // 拷贝附件 + 创建 StudentAttachment 记录
    const studentDir = path.join(historicalUploadsRoot, String(profile.id));
    fs.mkdirSync(studentDir, { recursive: true });
    for (const att of plan.attachments) {
      const destFileName = `${att.category}_${att.originalName}`;
      const destPath = path.join(studentDir, destFileName);
      fs.copyFileSync(att.sourcePath, destPath);
      const relPath = path.relative(args.uploadsRoot, destPath).replace(/\\/g, '/');
      await prisma.studentAttachment.create({
        data: {
          studentId: profile.id,
          category: att.category,
          originalName: att.originalName,
          storagePath: relPath,
          mimeType: att.mimeType,
          fileSize: att.fileSize,
          uploadedById: teacher.userId,
        },
      });
      createdAttachments++;
    }

    console.log(
      `  ✅ 创建: ${r.realName} (student id=${profile.id}, ${plan.attachments.length} 个附件)`,
    );
    createdStudents++;
  }

  console.log(
    `\n✅ 完成: 创建 ${createdStudents} 个学生, 跳过 ${skippedStudents} 已存在, ${createdAttachments} 个附件入库.`,
  );
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('❌ 导入失败:', e);
  process.exit(1);
});
