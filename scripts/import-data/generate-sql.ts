/**
 * 在本地解析 Excel 并生成 SQL 文件
 * 分配固定 ID，避免子查询
 */
import * as XLSX from 'xlsx';
import * as path from 'path';
import * as fs from 'fs';

const COL = {
  universityName: 0, universityCode: 1, groupCode: 2, universityGroup: 3, universityNotes: 4,
  majorName: 5, majorCode: 6, majorClass: 7, majorCategory: 8, majorNotes: 9,
  subject: 10, subjectRequirements: 11, type: 12, batch: 13, oldBatch: 14,
  isNew: 15, groupPlanCount: 16, planCount: 17, duration: 18, tuition: 19, groupMajors: 20,
  group24MinScore: 21, group24MinRank: 22, group24AdmissionCount: 23,
  year24: 24, max24_1: 25, maxRank24_1: 26, avg24_1: 27, avgRank24_1: 28,
  min24: 29, minRank24: 30, avg24: 31, avgRank24: 32, max24: 33, maxRank24: 34, admCount24: 35,
  year23: 36, max23_1: 37, maxRank23_1: 38, avg23_1: 39, avgRank23_1: 40,
  min23: 41, minRank23: 42, minRank23_2: 43, avg23: 44, avgRank23: 45, max23: 46, maxRank23: 47, admCount23: 48,
  year22: 49, max22_1: 50, maxRank22_1: 51, avg22_1: 52, avgRank22_1: 53,
  max22: 54, maxRank22: 55, avg22: 56, avgRank22: 57, min22: 58, minRank22: 59, admCount22: 60,
  uniProvince: 61, uniCity: 62, cityLevel: 63, uniType: 64, uniNature: 65,
  uniDepartment: 66, uniTags: 67, uniLevel: 68, uniRank: 69,
  uniAdmissionGuide: 70, uniRename: 71, uniTransfer: 72, uniPostgradRate: 73,
  isDoubleFirstClass: 74, disciplineEvaluation: 75, isNationalFeature: 76,
  majorRank: 77, majorHonor: 78, localMaster: 79, localDoctor: 80,
  masterCount: 81, masterPrograms: 82, doctoralCount: 83, doctoralPrograms: 84,
};

function toInt(v: any): number | null {
  if (v === null || v === undefined || v === '' || v === '-') return null;
  const n = parseInt(String(v), 10);
  return isNaN(n) ? null : n;
}
function toStr(v: any): string | null {
  if (v === null || v === undefined || v === '') return null;
  return String(v).trim();
}
function parseTags(s: string | null): string[] {
  if (!s) return [];
  return s.split('/').map(t => t.trim()).filter(Boolean);
}
function e(v: string | null): string {
  if (v === null) return 'NULL';
  return "'" + v.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r/g, '').replace(/\n/g, '\\n') + "'";
}
function n(v: number | null): string { return v === null ? 'NULL' : String(v); }
function b(v: boolean): string { return v ? '1' : '0'; }
function j(arr: any[] | undefined): string {
  if (!arr || arr.length === 0) return 'NULL';
  return e(JSON.stringify(arr));
}

async function main() {
  const args = process.argv.slice(2);
  let filePath = '../../2025高考志愿填报--西典学校整合版.xlsx';
  let province = '四川';
  for (const arg of args) {
    if (arg.startsWith('--file=')) filePath = arg.slice(7);
    if (arg.startsWith('--province=')) province = arg.slice(11);
  }
  filePath = path.resolve(__dirname, filePath);
  console.log(`Reading: ${filePath} [${province}]`);

  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[province];
  if (!ws) {
    console.error(`Sheet not found. Available: ${wb.SheetNames.join(', ')}`);
    process.exit(1);
  }
  const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
  const dataRows = rows.slice(1).filter(r => r[COL.universityName]);
  console.log(`Data rows: ${dataRows.length}`);

  // 收集唯一院校和专业，分配 ID
  const uniMap = new Map<string, { id: number; data: any }>();
  const majorMap = new Map<string, { id: number; data: any }>();
  let uniId = 1, majorId = 1;

  for (const row of dataRows) {
    const code = toStr(row[COL.universityCode]);
    if (code && !uniMap.has(code)) {
      const tags = parseTags(toStr(row[COL.uniTags]));
      uniMap.set(code, {
        id: uniId++,
        data: {
          name: toStr(row[COL.universityName])!, code,
          province: toStr(row[COL.uniProvince]), city: toStr(row[COL.uniCity]),
          type: toStr(row[COL.uniType]), level: toStr(row[COL.uniLevel]),
          nature: toStr(row[COL.uniNature]),
          isDFC: tags.includes('双一流'), is985: tags.includes('985'), is211: tags.includes('211'),
          tags, grade: toStr(row[COL.cityLevel]),
          hasMaster: !!toInt(row[COL.masterCount]), hasDoctoral: !!toInt(row[COL.doctoralCount]),
          masterCount: toInt(row[COL.masterCount]), doctoralCount: toInt(row[COL.doctoralCount]),
          masterProgs: toStr(row[COL.masterPrograms])?.split('；'),
          doctoralProgs: toStr(row[COL.doctoralPrograms])?.split('；'),
          notes: toStr(row[COL.universityNotes]),
          // 新增 5 字段 + 2 已有未导入字段
          department: toStr(row[COL.uniDepartment]),
          ranking: toStr(row[COL.uniRank]),
          admissionGuide: toStr(row[COL.uniAdmissionGuide]),
          renameHistory: toStr(row[COL.uniRename]),
          postgradRate: toStr(row[COL.uniPostgradRate]),
          transferDifficulty: toStr(row[COL.uniTransfer]),
          disciplineEvalLevel: toStr(row[COL.disciplineEvaluation]),
        }
      });
    }
    const mName = toStr(row[COL.majorName]);
    if (mName && !majorMap.has(mName)) {
      majorMap.set(mName, {
        id: majorId++,
        data: {
          name: mName, code: toStr(row[COL.majorCode]),
          category: toStr(row[COL.majorCategory]),
          level: toStr(row[COL.uniLevel]) === '本科' ? '本科' : '专科',
          discipline: toStr(row[COL.majorClass]),
          type: toStr(row[COL.type]), notes: toStr(row[COL.majorNotes]),
          localMaster: toStr(row[COL.localMaster]) === '是',
          localDoctor: toStr(row[COL.localDoctor]) === '是',
        }
      });
    }
  }

  console.log(`Universities: ${uniMap.size}, Majors: ${majorMap.size}`);

  const out = fs.createWriteStream(path.resolve(__dirname, 'import-data.sql'), 'utf8');
  out.write('SET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS = 0;\n');
  out.write('-- Clear existing data\n');
  out.write('TRUNCATE TABLE admission_records;\n');
  out.write('TRUNCATE TABLE enrollment_plans;\n');
  out.write('TRUNCATE TABLE majors;\n');
  out.write('TRUNCATE TABLE universities;\n\n');

  // Universities - 批量插入
  console.log('Writing universities...');
  const uniBatch: string[] = [];
  for (const [, { id, data: u }] of uniMap) {
    uniBatch.push(`(${id}, ${e(u.name)}, ${e(u.code)}, ${e(u.province)}, ${e(u.city)}, ${e(u.type)}, ${e(u.level)}, ${e(u.level)}, ${e(u.nature)}, ${b(u.isDFC)}, ${b(u.is985)}, ${b(u.is211)}, ${j(u.tags)}, ${e(u.grade)}, ${b(u.hasMaster)}, ${b(u.hasDoctoral)}, ${n(u.masterCount)}, ${n(u.doctoralCount)}, ${j(u.masterProgs)}, ${j(u.doctoralProgs)}, ${e(u.notes)}, ${e(u.department)}, ${e(u.ranking)}, ${e(u.admissionGuide)}, ${e(u.renameHistory)}, ${e(u.postgradRate)}, ${e(u.transferDifficulty)}, ${e(u.disciplineEvalLevel)}, NOW(), NOW())`);
    if (uniBatch.length >= 100) {
      out.write(`INSERT INTO universities (id, name, code, province, city, university_type, university_level, running_level, running_nature, is_double_first_class, is_985, is_211, university_tags, university_grade, has_master_program, has_doctoral_program, master_program_count, doctoral_program_count, master_programs, doctoral_programs, notes, department, ranking, admission_guide, rename_history, postgrad_rate, transfer_difficulty, discipline_evaluation_level, created_at, updated_at) VALUES\n${uniBatch.join(',\n')};\n`);
      uniBatch.length = 0;
    }
  }
  if (uniBatch.length > 0) {
    out.write(`INSERT INTO universities (id, name, code, province, city, university_type, university_level, running_level, running_nature, is_double_first_class, is_985, is_211, university_tags, university_grade, has_master_program, has_doctoral_program, master_program_count, doctoral_program_count, master_programs, doctoral_programs, notes, department, ranking, admission_guide, rename_history, postgrad_rate, transfer_difficulty, discipline_evaluation_level, created_at, updated_at) VALUES\n${uniBatch.join(',\n')};\n`);
  }
  out.write('\n');

  // Majors - 批量插入
  console.log('Writing majors...');
  const majBatch: string[] = [];
  for (const [, { id, data: m }] of majorMap) {
    majBatch.push(`(${id}, ${e(m.name)}, ${e(m.code)}, ${e(m.category)}, ${e(m.level)}, ${e(m.discipline)}, ${e(m.type)}, ${e(m.notes)}, 0, ${b(m.localMaster)}, ${b(m.localDoctor)}, NOW(), NOW())`);
    if (majBatch.length >= 100) {
      out.write(`INSERT INTO majors (id, name, code, major_category, major_level, discipline, major_type, major_notes, is_restricted, local_master_point, local_doctoral_point, created_at, updated_at) VALUES\n${majBatch.join(',\n')};\n`);
      majBatch.length = 0;
    }
  }
  if (majBatch.length > 0) {
    out.write(`INSERT INTO majors (id, name, code, major_category, major_level, discipline, major_type, major_notes, is_restricted, local_master_point, local_doctoral_point, created_at, updated_at) VALUES\n${majBatch.join(',\n')};\n`);
  }
  out.write('\n');

  // Enrollment Plans - 批量插入
  console.log('Writing enrollment plans...');
  let planCount = 0;
  const planBatch: string[] = [];
  for (const row of dataRows) {
    const uniCode = toStr(row[COL.universityCode]);
    const majorName = toStr(row[COL.majorName]);
    if (!uniCode || !majorName) continue;
    const uid = uniMap.get(uniCode)?.id;
    const mid = majorMap.get(majorName)?.id;
    if (!uid || !mid) continue;

    planBatch.push(`(${uid}, ${mid}, 2025, ${e(province)}, ${n(toInt(row[COL.planCount]))}, ${e(toStr(row[COL.universityNotes]))}, ${e(toStr(row[COL.batch]))}, ${e(toStr(row[COL.uniLevel]))}, ${e(toStr(row[COL.subject]))}, ${e(toStr(row[COL.subjectRequirements]))}, ${e(toStr(row[COL.duration]))}, ${n(toInt(row[COL.tuition]))}, 0, ${e(toStr(row[COL.groupCode]))}, ${e(toStr(row[COL.universityGroup]))}, ${e(toStr(row[COL.groupMajors]))}, ${n(toInt(row[COL.groupPlanCount]))}, ${b(toStr(row[COL.isNew]) === '是')}, ${e(toStr(row[COL.oldBatch]))}, ${e(toStr(row[COL.disciplineEvaluation]))}, ${b(toStr(row[COL.isNationalFeature]) === '是')}, ${e(toStr(row[COL.majorRank]))}, ${e(toStr(row[COL.majorHonor]))}, NOW(), NOW())`);
    planCount++;
    if (planBatch.length >= 200) {
      out.write(`INSERT IGNORE INTO enrollment_plans (university_id, major_id, year, province, plan_count, plan_notes, batch, level, subjects, subject_requirements, duration, tuition, is_sino_foreign, group_code, group_name, group_majors, group_plan_count, is_new, old_batch, discipline_eval, is_national_feature, major_ranking, major_honor, created_at, updated_at) VALUES\n${planBatch.join(',\n')};\n`);
      planBatch.length = 0;
    }
  }
  if (planBatch.length > 0) {
    out.write(`INSERT IGNORE INTO enrollment_plans (university_id, major_id, year, province, plan_count, plan_notes, batch, level, subjects, subject_requirements, duration, tuition, is_sino_foreign, group_code, group_name, group_majors, group_plan_count, is_new, old_batch, discipline_eval, is_national_feature, major_ranking, major_honor, created_at, updated_at) VALUES\n${planBatch.join(',\n')};\n`);
  }
  console.log(`  ${planCount} plans`);
  out.write('\n');

  // Admission Records - 批量插入
  console.log('Writing admission records...');
  let admCount = 0;
  const admBatch: string[] = [];

  function flushAdm() {
    if (admBatch.length === 0) return;
    out.write(`INSERT IGNORE INTO admission_records (university_id, major_id, year, province, major_min_score, major_min_rank, major_admission_count, university_min_score, university_min_rank, university_avg_score, university_avg_rank, university_max_score, university_max_rank, university_admission_count, created_at, updated_at) VALUES\n${admBatch.join(',\n')};\n`);
    admBatch.length = 0;
  }

  for (const row of dataRows) {
    const uniCode = toStr(row[COL.universityCode]);
    const majorName = toStr(row[COL.majorName]);
    if (!uniCode || !majorName) continue;
    const uid = uniMap.get(uniCode)?.id;
    const mid = majorMap.get(majorName)?.id;
    if (!uid || !mid) continue;

    // 2024
    const min24 = toInt(row[COL.min24]), minRank24 = toInt(row[COL.minRank24]);
    if (min24 || minRank24) {
      admBatch.push(`(${uid}, ${mid}, 2024, ${e(province)}, ${n(min24)}, ${n(minRank24)}, ${n(toInt(row[COL.admCount24]))}, ${n(toInt(row[COL.group24MinScore]))}, ${n(toInt(row[COL.group24MinRank]))}, ${n(toInt(row[COL.avg24]))}, ${n(toInt(row[COL.avgRank24]))}, ${n(toInt(row[COL.max24]))}, ${n(toInt(row[COL.maxRank24]))}, ${n(toInt(row[COL.group24AdmissionCount]))}, NOW(), NOW())`);
      admCount++;
      if (admBatch.length >= 200) flushAdm();
    }

    // 2023
    const min23 = toInt(row[COL.min23]), minRank23 = toInt(row[COL.minRank23]);
    if (min23 || minRank23) {
      admBatch.push(`(${uid}, ${mid}, 2023, ${e(province)}, ${n(min23)}, ${n(minRank23)}, ${n(toInt(row[COL.admCount23]))}, NULL, NULL, ${n(toInt(row[COL.avg23]))}, ${n(toInt(row[COL.avgRank23]))}, ${n(toInt(row[COL.max23]))}, ${n(toInt(row[COL.maxRank23]))}, NULL, NOW(), NOW())`);
      admCount++;
      if (admBatch.length >= 200) flushAdm();
    }

    // 2022
    const min22 = toInt(row[COL.min22]), minRank22 = toInt(row[COL.minRank22]);
    if (min22 || minRank22) {
      admBatch.push(`(${uid}, ${mid}, 2022, ${e(province)}, ${n(min22)}, ${n(minRank22)}, ${n(toInt(row[COL.admCount22]))}, NULL, NULL, ${n(toInt(row[COL.avg22]))}, ${n(toInt(row[COL.avgRank22]))}, ${n(toInt(row[COL.max22]))}, ${n(toInt(row[COL.maxRank22]))}, NULL, NOW(), NOW())`);
      admCount++;
      if (admBatch.length >= 200) flushAdm();
    }
  }
  flushAdm();
  console.log(`  ${admCount} admission records`);

  out.write('\nSET FOREIGN_KEY_CHECKS = 1;\n');
  out.end();

  await new Promise(resolve => out.on('finish', resolve));
  const stats = fs.statSync(path.resolve(__dirname, 'import-data.sql'));
  console.log(`\nDone! SQL file: import-data.sql (${(stats.size / 1024 / 1024).toFixed(1)} MB)`);
}

main().catch(err => { console.error(err); process.exit(1); });
