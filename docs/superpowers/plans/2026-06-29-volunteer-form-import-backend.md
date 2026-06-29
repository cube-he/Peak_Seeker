# 志愿表导入 · 后端核心（Plan A）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 后端打通「已解析的志愿表(院校代码+组代码列表)→ 解析成系统候选组 → 在该生该批次原方案上派生新版本并写入实填志愿」,并用脚本对袁嘉这份真实数据端到端跑通。

**Architecture:** 新增 `plan-import` 领域。`VolunteerFormResolverService`(纯查询)把 `(schoolCode, groupCode)` 解析成锚定 `enrollmentPlanId`+`selectedMajors`;`StudentBatchMatcherService` 认批次/认人;`VolunteerFormImportService` 建空新版本(版本号 max+1、父链、父 DRAFT→OUTDATED)后**复用 `PlanItemService.add()` 逐条写入**(DRY,白嫖梯度/历史线/去重)。CLI 脚本用 `PrismaMariaDb` adapter 驱动,`--dry-run` 即 R1 真实数据 go/no-go。

**Tech Stack:** NestJS + Prisma 7(`@prisma/adapter-mariadb`)+ Jest(`@nestjs/testing`,mock PrismaService)+ ts-node 脚本。

**Scope:** 这是三个计划中的 Plan A(后端核心)。不含 PDF 解析端点(Plan B)与老师端 UI(Plan C);Plan A 直接吃手写的结构化 fixture,自包含可测,且交付「把袁嘉这份导入」的最初诉求。

---

## 关键事实(实现前必读,来自 spec 与代码核查)

- 一个院校专业组 = `EnrollmentPlan` 多行(每专业一行),键 `(universityId, subjects, batch, recruitType, groupCode, year)`(`schema.prisma:673`)。`schoolCode` = `University.code`(可空唯一)。
- `PlanItemService.add(planId, dto)`(`plan-item.service.ts:100`):吃单个 `dto.enrollmentPlanId`(锚定专业行),自动推院校/组/梯度/历史线快照、存 `selectedMajors`→`fullMajorRanking`,按 `(planId, universityId, groupCode)` 去重,`sequence` 可显式传。要求 plan 状态可编辑(DRAFT 可)。
- `deriveVersion`(`plan.service.ts:605`)会**拷贝父版本全部 PlanItem**(合并语义)——本计划要**替换语义**,故**不复用它**,只复用其「版本号 max+1 / 父 DRAFT→OUTDATED」记账思路。
- `examType` 学生档案存 `'PHYSICS'|'HISTORY'`;`EXAM_TYPE_TO_SUBJECTS`(`plan-item.service.ts:18`)映射 `PHYSICS→'物理'`。`EnrollmentPlan.subjects` 与 `BatchConfig.examType` 都用中文科类名 `'物理'/'历史'`。
- 测试约定:`Test.createTestingModule`,`PrismaService` 用 `useValue` 注入纯对象(`{ model: { method: jest.fn() } }`),`$transaction` mock 成 `(fn)=>fn(tx)` 或 `(ops)=>Promise.all(ops)`。见 `plan-item.service.spec.ts:13`。
- 脚本姿势:`new PrismaClient({ adapter: new PrismaMariaDb(process.env.DATABASE_URL!) } as any)`,`parseArgs` 用 `--key value` / `--apply`。见 `import-historical-records.ts:31`。

## 文件结构

```
apps/server/src/modules/plan-import/
  volunteer-form.types.ts                      # 共享类型(Parsed* / Resolved* / ResolveResult)
  volunteer-form-resolver.service.ts           # ② 组解析(纯查询)
  volunteer-form-resolver.service.spec.ts      # ② 单测(袁嘉子集 fixture)
  student-batch-matcher.service.ts             # ③ 认批次 + 认人候选
  student-batch-matcher.service.spec.ts        # ③ 单测
  volunteer-form-import.service.ts             # ④ 建版 + 复用 add() 写入
  volunteer-form-import.service.spec.ts        # ④ 单测
  plan-import.module.ts                        # Nest 模块(imports PlanModule)
apps/server/src/modules/plan/plan.module.ts    # 修改:exports 增加 PlanItemService
apps/server/scripts/import-volunteer-form.ts   # CLI 驱动(dry-run/apply)
apps/server/scripts/fixtures/yuanjia-volunteers.json  # 袁嘉 41 组手写 fixture
```

---

## Task 1: 真实数据 go/no-go 探针(GATE)

> **✅ 已执行(2026-06-29,生产只读),GATE 通过。结论(后续任务字面量以此为准):**
> - **命中率 41/41**(含全部省外校),解析链 `院校码→University.code→universityId` + `(universityId, groupCode, batch, subjects, year)` 成立。
> - **`batch` 确切串 = `本科批B段`**(PDF 的"本科批次B段"需去"次"归一化 → matcher `canon` 已处理)。
> - **`subjects` 确切值 = `物理`**(resolver `opts.subjects` 用 `物理`,由 examType PHYSICS 映射)。
> - **`major_code` 与 PDF 2 位代号一致**(如 5120/111 = `0G 数学与应用数学 / 13 物理学 / 0N 化学`)→ resolver「名优先码兜底」两条都命中。
>
> 下面的探针步骤为复现留档;实际已跑过,可直接进入 Task 2。

**目的:** 在写任何解析逻辑前,用袁嘉几个代表性 `(院校码,组码)` 跑真实 2026 库,确认解析链成立 + 拿到 3 个关键事实:`本科批B段` 的确切 `batch` 串、`subjects` 确切值(预期 `'物理'`)、`EnrollmentPlan.major_code` 是否等于 PDF 2 位代号。

**前置:** 需能连到含 2026 数据的库。本地 dev 库(`localhost:3306`)默认未启;两条路任选:① 启本地库并导入 2026 数据;② 在生产服务器只读跑(SSH `132.232.245.53`,`cd apps/server` 用其 `.env` 的 `DATABASE_URL`)。**只读,不写。**

**Files:**
- Create(临时,跑完删): `apps/server/scripts/_probe_volunteer_form.ts`

- [ ] **Step 1: 写探针脚本**

```ts
// apps/server/scripts/_probe_volunteer_form.ts  (临时, 跑完 rm)
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

const PAIRS: [string, string][] = [
  ['5120','111'], ['5022','507'], ['5022','508'], ['0357','111'],
  ['3309','206'], ['6104','102'], ['4322','102'], ['3707','106'], ['5320','201'],
];
async function main() {
  const prisma = new PrismaClient({ adapter: new PrismaMariaDb(process.env.DATABASE_URL!) } as any);
  const batches: any[] = await prisma.$queryRawUnsafe(
    "SELECT DISTINCT batch FROM enrollment_plans WHERE year=2026 ORDER BY batch");
  console.log('BATCHES:', batches.map(b => b.batch).join(' | '));
  const subs: any[] = await prisma.$queryRawUnsafe(
    "SELECT DISTINCT subjects FROM enrollment_plans WHERE year=2026 ORDER BY subjects");
  console.log('SUBJECTS:', subs.map(b => JSON.stringify(b.subjects)).join(' | '));
  const codes = [...new Set(PAIRS.map(p => p[0]))];
  const unis = await prisma.university.findMany({ where: { code: { in: codes } }, select: { id: true, code: true, name: true } });
  const byCode = new Map(unis.map(u => [u.code, u]));
  for (const c of codes) console.log('UNI', c, '->', byCode.get(c) ? `${byCode.get(c)!.id} ${byCode.get(c)!.name}` : 'MISS');
  for (const [sc, gc] of PAIRS) {
    const u = byCode.get(sc); if (!u) { console.log(`${sc}/${gc}: uni miss`); continue; }
    const rows = await prisma.enrollmentPlan.findMany({
      where: { universityId: u.id, groupCode: gc, year: 2026 },
      select: { batch: true, subjects: true, majorCode: true, majorName: true }, take: 30 });
    console.log(`${sc}/${gc} ${u.name}: ${rows.length} rows batch=[${[...new Set(rows.map(r=>r.batch))]}] subj=[${[...new Set(rows.map(r=>r.subjects))]}]`);
    rows.slice(0,4).forEach(r => console.log(`    code=${JSON.stringify(r.majorCode)} name=${r.majorName}`));
  }
  await prisma.$disconnect();
}
main().catch(e => { console.error(e?.message || e); process.exit(1); });
```

- [ ] **Step 2: 跑探针**

Run: `cd apps/server && npx ts-node -r dotenv/config scripts/_probe_volunteer_form.ts`
Expected: 打印出 2026 的 batch 串清单、subjects 清单、9 个院校代码全部命中(非 MISS)、每个 `(码/组)` 有 ≥1 行 EP。

- [ ] **Step 3: 记录三个事实 + 决策**

把输出里的确切值记下来,后续任务的字面量以此为准:
- `本科批B段` 的确切 `batch` 串(预期 `本科批B段`,可能为 `本科批次B段`)。
- `subjects` 确切值(预期 `物理`)。
- `major_code` 是否 == PDF 2 位代号(`0G`/`13`)→ 决定专业匹配是「名优先码兜底」还是「码可直接用」。

**GATE:** 院校命中率 < 80% 或多数组 0 行 → **停下排查数据完整性/口径**,不要继续往下建。命中良好 → 继续。

- [ ] **Step 4: 删除探针**

Run: `rm apps/server/scripts/_probe_volunteer_form.ts`
(临时探针不留仓库。)

---

## Task 2: 共享类型 + 袁嘉 fixture

**Files:**
- Create: `apps/server/src/modules/plan-import/volunteer-form.types.ts`
- Create: `apps/server/scripts/fixtures/yuanjia-volunteers.json`

- [ ] **Step 1: 写类型**

```ts
// volunteer-form.types.ts
export interface ParsedMajor { code: string; name: string; }
export interface ParsedVolunteer {
  seq: number;
  schoolCode: string;
  schoolName: string;
  groupCode: string;
  majors: ParsedMajor[];
  acceptAdjust: boolean;
}
export interface ParsedIdentity {
  name: string;
  examNumber?: string;
  classInfo?: string;
  idMasked?: string;
}
export interface ParsedForm {
  identity: ParsedIdentity;
  batch: string;          // 原样, 如 "本科批次B段"
  volunteers: ParsedVolunteer[];
}

export interface ResolvedSelectedMajor {
  order: number;
  enrollmentPlanId: number;
  majorId: number;
  majorName: string;
  majorCode: string | null;
}
export type GroupStatus = 'matched' | 'unmatched';
export interface ResolvedGroup {
  seq: number;
  schoolCode: string;
  schoolName: string;
  groupCode: string;
  status: GroupStatus;
  anchorEnrollmentPlanId?: number;
  selectedMajors: ResolvedSelectedMajor[];
  acceptAdjust: boolean;
  unmatchedReason?: string;   // status=unmatched 时
  note?: string;              // 如 "专业未对齐"
}
export interface ResolveSummary { total: number; matched: number; unmatched: number; }
export interface ResolveResult { groups: ResolvedGroup[]; summary: ResolveSummary; }
```

- [ ] **Step 2: 写袁嘉 fixture(全 41 组,从 PDF 解析得来)**

```json
// apps/server/scripts/fixtures/yuanjia-volunteers.json
{
  "identity": { "name": "袁嘉", "examNumber": "26510108150957", "classInfo": "10班", "idMasked": "510181****0029" },
  "batch": "本科批次B段",
  "examTypeHint": "PHYSICS",
  "volunteers": [
    { "seq": 1, "schoolCode": "5120", "schoolName": "四川师范大学", "groupCode": "111", "acceptAdjust": true, "majors": [{"code":"0G","name":"数学与应用数学"},{"code":"0N","name":"化学"},{"code":"13","name":"物理学"}] },
    { "seq": 2, "schoolCode": "5102", "schoolName": "成都理工大学", "groupCode": "112", "acceptAdjust": true, "majors": [{"code":"1M","name":"数学与应用数学"},{"code":"1K","name":"应用物理学"},{"code":"1L","name":"应用统计学"},{"code":"3H","name":"量子信息科学"}] },
    { "seq": 3, "schoolCode": "5109", "schoolName": "西华大学", "groupCode": "109", "acceptAdjust": true, "majors": [{"code":"47","name":"数学与应用数学"},{"code":"10","name":"化学"},{"code":"60","name":"应用物理学"}] },
    { "seq": 4, "schoolCode": "5025", "schoolName": "重庆理工大学", "groupCode": "101", "acceptAdjust": true, "majors": [{"code":"26","name":"新能源科学与工程"},{"code":"62","name":"储能科学与工程"},{"code":"68","name":"网络空间安全"},{"code":"21","name":"通信工程"},{"code":"04","name":"能源与动力工程"},{"code":"57","name":"人工智能"}] },
    { "seq": 5, "schoolCode": "5002", "schoolName": "重庆交通大学", "groupCode": "501", "acceptAdjust": true, "majors": [{"code":"40","name":"新能源材料与器件"},{"code":"44","name":"低空技术与工程"},{"code":"36","name":"数据科学与大数据技术"},{"code":"11","name":"水利水电工程"},{"code":"12","name":"智慧水利"},{"code":"54","name":"数学类"}] },
    { "seq": 6, "schoolCode": "5101", "schoolName": "西南石油大学", "groupCode": "116", "acceptAdjust": true, "majors": [{"code":"44","name":"经济学"},{"code":"48","name":"大数据管理与应用"},{"code":"47","name":"会计学"},{"code":"46","name":"国际经济与贸易"},{"code":"45","name":"电子商务"},{"code":"42","name":"工商管理"}] },
    { "seq": 7, "schoolCode": "3309", "schoolName": "浙江师范大学", "groupCode": "206", "acceptAdjust": true, "majors": [{"code":"32","name":"数学与应用数学(师范)"},{"code":"38","name":"智能科学与技术"},{"code":"39","name":"人工智能(智能精准诊疗)"},{"code":"42","name":"材料科学与工程"},{"code":"43","name":"光电信息科学与工程"},{"code":"44","name":"电子信息工程"}] },
    { "seq": 8, "schoolCode": "5022", "schoolName": "重庆科技大学", "groupCode": "507", "acceptAdjust": true, "majors": [{"code":"06","name":"数学与应用数学"},{"code":"10","name":"应用统计学"},{"code":"27","name":"电气工程及其自动化"},{"code":"28","name":"智能电网信息工程"},{"code":"29","name":"自动化"},{"code":"31","name":"软件工程"}] },
    { "seq": 9, "schoolCode": "5022", "schoolName": "重庆科技大学", "groupCode": "508", "acceptAdjust": true, "majors": [{"code":"24","name":"新能源材料与器件"},{"code":"26","name":"储能科学与工程"},{"code":"25","name":"能源与动力工程"},{"code":"13","name":"材料成型及控制工程"},{"code":"19","name":"金属材料工程"},{"code":"20","name":"无机非金属材料工程"}] },
    { "seq": 10, "schoolCode": "5105", "schoolName": "西南科技大学", "groupCode": "111", "acceptAdjust": true, "majors": [{"code":"40","name":"数学与应用数学"},{"code":"19","name":"计算机科学与技术"},{"code":"22","name":"数据科学与大数据技术"},{"code":"20","name":"软件工程"},{"code":"21","name":"信息安全"},{"code":"68","name":"医学影像技术"}] },
    { "seq": 11, "schoolCode": "0357", "schoolName": "西南民族大学", "groupCode": "111", "acceptAdjust": true, "majors": [{"code":"35","name":"数学与应用数学(数智交叉创新班)"},{"code":"36","name":"数据科学与大数据技术"},{"code":"37","name":"统计学"},{"code":"43","name":"网络空间安全"},{"code":"47","name":"化学(有机合成方向，新能源方向)"},{"code":"38","name":"信息与计算科学"}] },
    { "seq": 12, "schoolCode": "5010", "schoolName": "重庆师范大学", "groupCode": "204", "acceptAdjust": true, "majors": [{"code":"2W","name":"数学与应用数学"},{"code":"3A","name":"数据科学与大数据技术"},{"code":"3B","name":"物理学"},{"code":"3R","name":"电子信息科学与技术"},{"code":"3G","name":"量子信息科学"},{"code":"4Z","name":"智能科学与技术"}] },
    { "seq": 13, "schoolCode": "5120", "schoolName": "四川师范大学", "groupCode": "115", "acceptAdjust": true, "majors": [{"code":"0H","name":"信息与计算科学"},{"code":"0J","name":"统计学"},{"code":"0K","name":"金融数学"},{"code":"0P","name":"环境工程"}] },
    { "seq": 14, "schoolCode": "6104", "schoolName": "西安建筑科技大学", "groupCode": "102", "acceptAdjust": true, "majors": [{"code":"14","name":"新能源材料与器件"},{"code":"01","name":"计算机科学与技术"},{"code":"02","name":"通信工程"},{"code":"03","name":"人工智能"},{"code":"04","name":"自动化"},{"code":"07","name":"电气工程及其自动化"}] },
    { "seq": 15, "schoolCode": "5107", "schoolName": "成都信息工程大学", "groupCode": "211", "acceptAdjust": true, "majors": [{"code":"0Y","name":"数学与应用数学"},{"code":"0E","name":"应用物理学"},{"code":"18","name":"统计学"},{"code":"0A","name":"测绘工程"},{"code":"0C","name":"环境工程"},{"code":"0D","name":"环境科学"}] },
    { "seq": 16, "schoolCode": "3611", "schoolName": "江西师范大学", "groupCode": "501", "acceptAdjust": true, "majors": [{"code":"BQ","name":"数学与应用数学(英才班)"}] },
    { "seq": 17, "schoolCode": "5106", "schoolName": "广安理工学院", "groupCode": "101", "acceptAdjust": true, "majors": [{"code":"03","name":"新能源材料与器件"},{"code":"02","name":"化学工程与工艺"},{"code":"01","name":"高分子材料与工程"}] },
    { "seq": 18, "schoolCode": "5122", "schoolName": "西华师范大学", "groupCode": "105", "acceptAdjust": true, "majors": [{"code":"32","name":"数学与应用数学(师范)"},{"code":"60","name":"化学(师范)"},{"code":"67","name":"物理学(师范)"},{"code":"77","name":"网络空间安全"},{"code":"07","name":"科学教育(师范)"},{"code":"33","name":"统计学"}] },
    { "seq": 19, "schoolCode": "5108", "schoolName": "四川轻化工大学", "groupCode": "107", "acceptAdjust": true, "majors": [{"code":"34","name":"新能源材料与器件"},{"code":"38","name":"应用物理学"},{"code":"40","name":"核工程与核技术"},{"code":"09","name":"材料科学与工程"},{"code":"10","name":"高分子材料与工程"},{"code":"33","name":"无机非金属材料工程"}] },
    { "seq": 20, "schoolCode": "3611", "schoolName": "江西师范大学", "groupCode": "505", "acceptAdjust": true, "majors": [{"code":"BU","name":"计算机科学与技术"},{"code":"BV","name":"人工智能"},{"code":"BW","name":"电子信息类"},{"code":"BX","name":"统计学"},{"code":"BY","name":"应用化学"},{"code":"BZ","name":"化学工程与工艺"}] },
    { "seq": 21, "schoolCode": "5142", "schoolName": "成都工业学院", "groupCode": "109", "acceptAdjust": true, "majors": [{"code":"34","name":"新能源科学与工程"},{"code":"28","name":"智能制造工程"},{"code":"29","name":"物联网工程"},{"code":"30","name":"人工智能"},{"code":"35","name":"电子科学与技术"}] },
    { "seq": 22, "schoolCode": "5108", "schoolName": "四川轻化工大学", "groupCode": "106", "acceptAdjust": true, "majors": [{"code":"13","name":"数学与应用数学"},{"code":"14","name":"信息与计算科学"},{"code":"15","name":"应用统计学"},{"code":"23","name":"智能制造工程"},{"code":"24","name":"机械电子工程"},{"code":"25","name":"工业设计"}] },
    { "seq": 23, "schoolCode": "5109", "schoolName": "西华大学", "groupCode": "116", "acceptAdjust": true, "majors": [{"code":"27","name":"国际经济与贸易"},{"code":"16","name":"人力资源管理"},{"code":"38","name":"物流工程"},{"code":"09","name":"工业工程"}] },
    { "seq": 24, "schoolCode": "5126", "schoolName": "成都师范学院", "groupCode": "104", "acceptAdjust": true, "majors": [{"code":"15","name":"数学与应用数学"},{"code":"16","name":"物理学"},{"code":"33","name":"数据计算及应用"}] },
    { "seq": 25, "schoolCode": "5126", "schoolName": "成都师范学院", "groupCode": "105", "acceptAdjust": true, "majors": [{"code":"40","name":"无人机系统应用技术"},{"code":"22","name":"电子科学与技术"},{"code":"38","name":"机器人工程"},{"code":"34","name":"智能车辆工程"}] },
    { "seq": 26, "schoolCode": "5124", "schoolName": "内江师范学院", "groupCode": "504", "acceptAdjust": true, "majors": [{"code":"04","name":"数学与应用数学"},{"code":"09","name":"化学类"},{"code":"06","name":"物理学"}] },
    { "seq": 27, "schoolCode": "5125", "schoolName": "宜宾学院", "groupCode": "105", "acceptAdjust": true, "majors": [{"code":"16","name":"数学与应用数学"},{"code":"17","name":"物理学"}] },
    { "seq": 28, "schoolCode": "5123", "schoolName": "绵阳师范学院", "groupCode": "501", "acceptAdjust": true, "majors": [{"code":"18","name":"数学与应用数学"},{"code":"19","name":"物理学"},{"code":"21","name":"化学"},{"code":"34","name":"计算机科学与技术"},{"code":"27","name":"生物科学"}] },
    { "seq": 29, "schoolCode": "4322", "schoolName": "湖南第一师范学院", "groupCode": "102", "acceptAdjust": true, "majors": [{"code":"15","name":"应用统计学"},{"code":"19","name":"物理学"},{"code":"26","name":"通信工程"},{"code":"27","name":"人工智能"},{"code":"30","name":"计算机科学与技术"},{"code":"57","name":"工业智能"}] },
    { "seq": 30, "schoolCode": "4220", "schoolName": "湖北第二师范学院", "groupCode": "104", "acceptAdjust": true, "majors": [{"code":"0L","name":"数学与应用数学"},{"code":"0M","name":"应用统计学"},{"code":"18","name":"材料科学与工程(绿色储能方向)"},{"code":"0Y","name":"化学"},{"code":"07","name":"电子信息类"},{"code":"0V","name":"计算机类"}] },
    { "seq": 31, "schoolCode": "5147", "schoolName": "四川旅游学院", "groupCode": "102", "acceptAdjust": true, "majors": [{"code":"0D","name":"数字媒体技术"},{"code":"0V","name":"应用统计学"},{"code":"0F","name":"人工智能"},{"code":"0G","name":"软件工程"},{"code":"0H","name":"智能装备与系统"},{"code":"11","name":"工业设计"}] },
    { "seq": 32, "schoolCode": "5133", "schoolName": "乐山师范学院", "groupCode": "110", "acceptAdjust": true, "majors": [{"code":"6B","name":"数学与应用数学"},{"code":"6C","name":"物理学"},{"code":"6D","name":"应用统计学"}] },
    { "seq": 33, "schoolCode": "5114", "schoolName": "西昌学院", "groupCode": "105", "acceptAdjust": true, "majors": [{"code":"19","name":"数学与应用数学"},{"code":"17","name":"化学"},{"code":"22","name":"物理学"},{"code":"60","name":"生物科学"}] },
    { "seq": 34, "schoolCode": "5130", "schoolName": "阿坝师范学院", "groupCode": "109", "acceptAdjust": true, "majors": [{"code":"28","name":"数学与应用数学"},{"code":"37","name":"化学"},{"code":"32","name":"物理学"},{"code":"29","name":"应用统计学"},{"code":"39","name":"化学测量学与技术"},{"code":"35","name":"生物科学"}] },
    { "seq": 35, "schoolCode": "4341", "schoolName": "湖南工程学院", "groupCode": "101", "acceptAdjust": true, "majors": [{"code":"05","name":"新能源科学与工程"},{"code":"01","name":"电气工程及其自动化"},{"code":"22","name":"通信工程"},{"code":"23","name":"网络工程"},{"code":"25","name":"人工智能"},{"code":"07","name":"机械设计制造及其自动化"}] },
    { "seq": 36, "schoolCode": "5143", "schoolName": "四川民族学院", "groupCode": "106", "acceptAdjust": true, "majors": [{"code":"14","name":"数学与应用数学"},{"code":"15","name":"物理学"},{"code":"27","name":"新能源科学与工程"},{"code":"16","name":"计算机科学与技术"},{"code":"17","name":"数据科学与大数据技术"},{"code":"28","name":"智能科学与技术"}] },
    { "seq": 37, "schoolCode": "5309", "schoolName": "云南师范大学", "groupCode": "104", "acceptAdjust": true, "majors": [{"code":"71","name":"数学与应用数学"}] },
    { "seq": 38, "schoolCode": "3341", "schoolName": "浙江外国语学院", "groupCode": "105", "acceptAdjust": true, "majors": [{"code":"26","name":"数学与应用数学(师范)"},{"code":"28","name":"计算机科学与技术"}] },
    { "seq": 39, "schoolCode": "5027", "schoolName": "重庆第二师范学院", "groupCode": "504", "acceptAdjust": true, "majors": [{"code":"18","name":"数学与应用数学"},{"code":"16","name":"信息与计算科学"},{"code":"17","name":"数据科学与大数据技术"},{"code":"20","name":"人工智能"},{"code":"21","name":"计算机科学与技术"},{"code":"23","name":"电子与计算机工程"}] },
    { "seq": 40, "schoolCode": "3707", "schoolName": "曲阜师范大学", "groupCode": "106", "acceptAdjust": true, "majors": [{"code":"B7","name":"数学与应用数学"},{"code":"3Y","name":"化学"},{"code":"T4","name":"数据科学与大数据技术"},{"code":"5S","name":"化学工程与工艺"},{"code":"Q8","name":"软件工程"},{"code":"T3","name":"网络工程"}] },
    { "seq": 41, "schoolCode": "5320", "schoolName": "云南民族大学", "groupCode": "201", "acceptAdjust": true, "majors": [{"code":"45","name":"数学与应用数学"},{"code":"50","name":"数据科学与大数据技术"},{"code":"60","name":"应用化学"}] }
  ]
}
```

- [ ] **Step 3: 提交**

```bash
git add apps/server/src/modules/plan-import/volunteer-form.types.ts apps/server/scripts/fixtures/yuanjia-volunteers.json
git commit -m "feat(plan-import): 志愿表导入共享类型 + 袁嘉 fixture"
```

---

## Task 3: ② 组解析 service（TDD）

**Files:**
- Create: `apps/server/src/modules/plan-import/volunteer-form-resolver.service.ts`
- Test: `apps/server/src/modules/plan-import/volunteer-form-resolver.service.spec.ts`

- [ ] **Step 1: 写失败测试**

```ts
// volunteer-form-resolver.service.spec.ts
import { Test } from '@nestjs/testing';
import { VolunteerFormResolverService } from './volunteer-form-resolver.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ParsedVolunteer } from './volunteer-form.types';

describe('VolunteerFormResolverService.resolveGroups', () => {
  let service: VolunteerFormResolverService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      university: { findMany: jest.fn() },
      enrollmentPlan: { findMany: jest.fn() },
    };
    const mod = await Test.createTestingModule({
      providers: [
        VolunteerFormResolverService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = mod.get(VolunteerFormResolverService);
  });

  const opts = { year: 2026, subjects: '物理', batch: '本科批B段' };

  it('院校代码不在库 → unmatched(院校代码不在库)', async () => {
    prisma.university.findMany.mockResolvedValue([]); // 5120 查不到
    const v: ParsedVolunteer = { seq: 1, schoolCode: '5120', schoolName: '四川师范大学', groupCode: '111', acceptAdjust: true, majors: [{ code: '0G', name: '数学与应用数学' }] };
    const r = await service.resolveGroups([v], opts);
    expect(r.groups[0].status).toBe('unmatched');
    expect(r.groups[0].unmatchedReason).toBe('院校代码不在库');
    expect(r.summary).toEqual({ total: 1, matched: 0, unmatched: 1 });
  });

  it('该批次无此组 → unmatched(该批次无此专业组)', async () => {
    prisma.university.findMany.mockResolvedValue([{ id: 11, code: '5120', name: '四川师范大学' }]);
    prisma.enrollmentPlan.findMany.mockResolvedValue([]);
    const v: ParsedVolunteer = { seq: 1, schoolCode: '5120', schoolName: '四川师范大学', groupCode: '111', acceptAdjust: true, majors: [{ code: '0G', name: '数学与应用数学' }] };
    const r = await service.resolveGroups([v], opts);
    expect(r.groups[0].status).toBe('unmatched');
    expect(r.groups[0].unmatchedReason).toBe('该批次无此专业组');
  });

  it('命中 → 锚定第一个匹配专业的 EP, selectedMajors 按 PDF 顺序, 名字优先匹配', async () => {
    prisma.university.findMany.mockResolvedValue([{ id: 11, code: '5120', name: '四川师范大学' }]);
    prisma.enrollmentPlan.findMany.mockResolvedValue([
      { id: 901, majorId: 1, majorCode: '0N', majorName: '化学' },
      { id: 902, majorId: 2, majorCode: '0G', majorName: '数学与应用数学' },
      { id: 903, majorId: 3, majorCode: '13', majorName: '物理学' },
    ]);
    const v: ParsedVolunteer = { seq: 1, schoolCode: '5120', schoolName: '四川师范大学', groupCode: '111', acceptAdjust: true,
      majors: [{ code: '0G', name: '数学与应用数学' }, { code: '0N', name: '化学' }, { code: '13', name: '物理学' }] };
    const r = await service.resolveGroups([v], opts);
    expect(r.groups[0].status).toBe('matched');
    expect(r.groups[0].anchorEnrollmentPlanId).toBe(902); // 数学(PDF第一个)
    expect(r.groups[0].selectedMajors.map(m => m.enrollmentPlanId)).toEqual([902, 901, 903]);
    expect(r.groups[0].selectedMajors.map(m => m.order)).toEqual([1, 2, 3]);
    expect(r.groups[0].acceptAdjust).toBe(true);
  });

  it('专业全对不上 → 组仍 matched, 锚定取该组任一 EP, selectedMajors 空, note=专业未对齐', async () => {
    prisma.university.findMany.mockResolvedValue([{ id: 11, code: '5120', name: '四川师范大学' }]);
    prisma.enrollmentPlan.findMany.mockResolvedValue([{ id: 901, majorId: 1, majorCode: 'ZZ', majorName: '别的专业' }]);
    const v: ParsedVolunteer = { seq: 1, schoolCode: '5120', schoolName: '四川师范大学', groupCode: '111', acceptAdjust: true, majors: [{ code: '0G', name: '数学与应用数学' }] };
    const r = await service.resolveGroups([v], opts);
    expect(r.groups[0].status).toBe('matched');
    expect(r.groups[0].anchorEnrollmentPlanId).toBe(901);
    expect(r.groups[0].selectedMajors).toEqual([]);
    expect(r.groups[0].note).toBe('专业未对齐');
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd apps/server && npx jest src/modules/plan-import/volunteer-form-resolver.service.spec.ts`
Expected: FAIL（`Cannot find module './volunteer-form-resolver.service'`）。

- [ ] **Step 3: 写实现**

```ts
// volunteer-form-resolver.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ParsedVolunteer, ParsedMajor, ResolvedGroup, ResolveResult, ResolvedSelectedMajor,
} from './volunteer-form.types';

@Injectable()
export class VolunteerFormResolverService {
  constructor(private prisma: PrismaService) {}

  async resolveGroups(
    volunteers: ParsedVolunteer[],
    opts: { year: number; subjects: string; batch: string },
  ): Promise<ResolveResult> {
    const codes = [...new Set(volunteers.map(v => v.schoolCode))];
    const unis = await this.prisma.university.findMany({
      where: { code: { in: codes } },
      select: { id: true, code: true, name: true },
    });
    const uniByCode = new Map<string, { id: number }>(unis.map((u: any) => [u.code, u]));

    const groups: ResolvedGroup[] = [];
    for (const v of volunteers) {
      const uni = uniByCode.get(v.schoolCode);
      if (!uni) { groups.push(this.unmatched(v, '院校代码不在库')); continue; }

      const eps = await this.prisma.enrollmentPlan.findMany({
        where: { universityId: uni.id, groupCode: v.groupCode, year: opts.year, batch: opts.batch, subjects: opts.subjects },
        select: { id: true, majorId: true, majorCode: true, majorName: true },
      });
      if (eps.length === 0) { groups.push(this.unmatched(v, '该批次无此专业组')); continue; }

      const selected: ResolvedSelectedMajor[] = [];
      for (const m of v.majors) {
        const ep = this.matchMajor(eps, m);
        if (ep) {
          selected.push({ order: selected.length + 1, enrollmentPlanId: ep.id, majorId: ep.majorId, majorName: ep.majorName, majorCode: ep.majorCode || null });
        }
      }
      groups.push({
        seq: v.seq, schoolCode: v.schoolCode, schoolName: v.schoolName, groupCode: v.groupCode,
        status: 'matched',
        anchorEnrollmentPlanId: selected[0]?.enrollmentPlanId ?? eps[0].id,
        selectedMajors: selected.slice(0, 6),
        acceptAdjust: v.acceptAdjust,
        note: selected.length === 0 ? '专业未对齐' : undefined,
      });
    }
    const matched = groups.filter(g => g.status === 'matched').length;
    return { groups, summary: { total: groups.length, matched, unmatched: groups.length - matched } };
  }

  private norm(s: string): string {
    return s.replace(/[\s（）()【】]/g, '').trim();
  }

  private matchMajor(eps: any[], m: ParsedMajor) {
    const byName = eps.find(e => this.norm(e.majorName) === this.norm(m.name));
    if (byName) return byName;
    if (m.code) { const byCode = eps.find(e => e.majorCode === m.code); if (byCode) return byCode; }
    return null;
  }

  private unmatched(v: ParsedVolunteer, reason: string): ResolvedGroup {
    return { seq: v.seq, schoolCode: v.schoolCode, schoolName: v.schoolName, groupCode: v.groupCode,
      status: 'unmatched', selectedMajors: [], acceptAdjust: v.acceptAdjust, unmatchedReason: reason };
  }
}
```

> 若 Task 1 发现 `major_code` 与 PDF 2 位代号一致,以上「名优先码兜底」已自然覆盖;若发现名字本身就足够,代码兜底也无害。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd apps/server && npx jest src/modules/plan-import/volunteer-form-resolver.service.spec.ts`
Expected: PASS（4 个用例全过）。

- [ ] **Step 5: 提交**

```bash
git add apps/server/src/modules/plan-import/volunteer-form-resolver.service.ts apps/server/src/modules/plan-import/volunteer-form-resolver.service.spec.ts
git commit -m "feat(plan-import): 组解析 service(院校码+组码→锚定EP+selectedMajors)"
```

---

## Task 4: ③ 认批次 + 认人候选 service（TDD）

**Files:**
- Create: `apps/server/src/modules/plan-import/student-batch-matcher.service.ts`
- Test: `apps/server/src/modules/plan-import/student-batch-matcher.service.spec.ts`

- [ ] **Step 1: 写失败测试**

```ts
// student-batch-matcher.service.spec.ts
import { Test } from '@nestjs/testing';
import { StudentBatchMatcherService } from './student-batch-matcher.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('StudentBatchMatcherService', () => {
  let service: StudentBatchMatcherService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      batchConfig: { findMany: jest.fn() },
      studentProfile: { findMany: jest.fn() },
    };
    const mod = await Test.createTestingModule({
      providers: [
        StudentBatchMatcherService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = mod.get(StudentBatchMatcherService);
  });

  it('matchBatchConfig: 批次名归一化(本科批次B段 == 本科批B段) + examType 映射 PHYSICS→物理', async () => {
    prisma.batchConfig.findMany.mockResolvedValue([
      { id: 7, year: 2026, province: '四川', batch: '本科批B段', examType: '物理' },
      { id: 8, year: 2026, province: '四川', batch: '本科批A段', examType: '物理' },
    ]);
    const bc = await service.matchBatchConfig('本科批次B段', 'PHYSICS', 2026, '四川');
    expect(bc?.id).toBe(7);
  });

  it('matchBatchConfig: 找不到返回 null', async () => {
    prisma.batchConfig.findMany.mockResolvedValue([{ id: 8, batch: '本科批A段', examType: '物理' }]);
    const bc = await service.matchBatchConfig('本科批次B段', 'PHYSICS', 2026, '四川');
    expect(bc).toBeNull();
  });

  it('findCandidateStudents: 在该老师名下按姓名匹配, 班级一致排前', async () => {
    prisma.studentProfile.findMany.mockResolvedValue([
      { id: 100, classInfo: '9班', user: { realName: '袁嘉' } },
      { id: 101, classInfo: '10班', user: { realName: '袁嘉' } },
    ]);
    const list = await service.findCandidateStudents({ name: '袁嘉', classInfo: '10班' }, 42);
    expect(list.map(s => s.id)).toEqual([101, 100]); // 班级命中的排前
    expect(prisma.studentProfile.findMany).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd apps/server && npx jest src/modules/plan-import/student-batch-matcher.service.spec.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 写实现**

```ts
// student-batch-matcher.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ParsedIdentity } from './volunteer-form.types';

const EXAM_TYPE_TO_BATCH_EXAMTYPE: Record<string, string> = { PHYSICS: '物理', HISTORY: '历史' };

@Injectable()
export class StudentBatchMatcherService {
  constructor(private prisma: PrismaService) {}

  private canon(s: string): string {
    return (s || '').replace(/次/g, '').replace(/\s/g, '');
  }

  async matchBatchConfig(parsedBatch: string, examType: string, year: number, province: string) {
    const examTypeCn = EXAM_TYPE_TO_BATCH_EXAMTYPE[examType] ?? examType;
    const rows = await this.prisma.batchConfig.findMany({ where: { year, province, examType: examTypeCn } });
    const target = this.canon(parsedBatch);
    return rows.find((r: any) => this.canon(r.batch) === target) ?? null;
  }

  // 在该老师名下学生里按姓名匹配; 班级一致的排前。考生号未入库、证件号掩码, 故不参与唯一反查。
  // 师生关联: StudentProfile.teacherId → TeacherProfile.id; 入参 teacherUserId 是老师的 User.id,
  // 故经 teacher.userId 过滤。realName 在 User 上(user 关联)。
  async findCandidateStudents(identity: Pick<ParsedIdentity, 'name' | 'classInfo'>, teacherUserId: number) {
    const rows = await this.prisma.studentProfile.findMany({
      where: { teacher: { userId: teacherUserId }, user: { realName: identity.name } },
      include: { user: { select: { realName: true } } },
    });
    const classWanted = (identity.classInfo || '').replace(/\s/g, '');
    return rows.sort((a: any, b: any) => {
      const am = a.classInfo && classWanted && a.classInfo.includes(classWanted) ? 0 : 1;
      const bm = b.classInfo && classWanted && b.classInfo.includes(classWanted) ? 0 : 1;
      return am - bm;
    });
  }
}
```

> **已核(schema.prisma:852)**:`StudentProfile.teacherId → TeacherProfile`,`userId → User`(`realName` 在 User 上),`examType` 为 `NewExamType` 枚举(`PHYSICS`/`HISTORY`)。故按 `teacher: { userId: teacherUserId }` + `user: { realName }` 过滤,无 `createdById` 字段。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd apps/server && npx jest src/modules/plan-import/student-batch-matcher.service.spec.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add apps/server/src/modules/plan-import/student-batch-matcher.service.ts apps/server/src/modules/plan-import/student-batch-matcher.service.spec.ts
git commit -m "feat(plan-import): 认批次(名归一化)+认人候选 service"
```

---

## Task 5: ④ 导入建版 service（TDD）

复用 `PlanItemService.add()` 写每条志愿(白嫖梯度/历史线/去重)。本 service 只负责:建空新版本(版本号 max+1、父链、`versionNote`)→ 逐条 `add()` → 父 DRAFT 置 OUTDATED。

**Files:**
- Create: `apps/server/src/modules/plan-import/volunteer-form-import.service.ts`
- Test: `apps/server/src/modules/plan-import/volunteer-form-import.service.spec.ts`
- Modify: `apps/server/src/modules/plan/plan.module.ts`（exports 增加 `PlanItemService`）

- [ ] **Step 1: 让 PlanModule 导出 PlanItemService**

`plan.module.ts` 的 `exports` 数组加入 `PlanItemService`：

```ts
  exports: [PlanService, PlanReviewDraftService, RiskEngineService, PlanItemService],
```

- [ ] **Step 2: 写失败测试**

```ts
// volunteer-form-import.service.spec.ts
import { Test } from '@nestjs/testing';
import { VolunteerFormImportService } from './volunteer-form-import.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PlanItemService } from '../plan/plan-item.service';
import { ResolvedGroup } from './volunteer-form.types';

describe('VolunteerFormImportService.commit', () => {
  let service: VolunteerFormImportService;
  let prisma: any;
  let planItem: any;

  const tx = () => ({
    volunteerPlan: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
  });

  beforeEach(async () => {
    const txObj = tx();
    prisma = {
      studentProfile: { findUnique: jest.fn() },
      batchConfig: { findUnique: jest.fn() },
      $transaction: jest.fn(async (fn: any) => fn(txObj)),
      __tx: txObj,
    };
    planItem = { add: jest.fn().mockResolvedValue({ id: 1 }) };
    const mod = await Test.createTestingModule({
      providers: [
        VolunteerFormImportService,
        { provide: PrismaService, useValue: prisma },
        { provide: PlanItemService, useValue: planItem },
      ],
    }).compile();
    service = mod.get(VolunteerFormImportService);
  });

  const matched: ResolvedGroup = {
    seq: 1, schoolCode: '5120', schoolName: '四川师范大学', groupCode: '111', status: 'matched',
    anchorEnrollmentPlanId: 902, acceptAdjust: true,
    selectedMajors: [{ order: 1, enrollmentPlanId: 902, majorId: 2, majorName: '数学与应用数学', majorCode: '0G' }],
  };
  const unmatched: ResolvedGroup = {
    seq: 2, schoolCode: '9999', schoolName: 'X', groupCode: '000', status: 'unmatched', acceptAdjust: true, selectedMajors: [], unmatchedReason: '院校代码不在库',
  };

  it('建新版本: versionNo=父max+1, parentVersionId=父, status=DRAFT; 只写 matched; 父DRAFT置OUTDATED', async () => {
    prisma.studentProfile.findUnique.mockResolvedValue({ id: 10, userId: 50 });
    prisma.batchConfig.findUnique.mockResolvedValue({ id: 7, year: 2026, province: '四川', batch: '本科批B段' });
    prisma.__tx.volunteerPlan.findFirst.mockResolvedValue({ id: 200, versionNo: 1, status: 'DRAFT', name: '袁嘉-本科批B段-v1', createdById: 42 });
    prisma.__tx.volunteerPlan.create.mockResolvedValue({ id: 201, versionNo: 2 });

    const res = await service.commit({ studentId: 10, batchConfigId: 7, resolvedGroups: [matched, unmatched], actorUserId: 42 });

    expect(res.id).toBe(201);
    const createArg = prisma.__tx.volunteerPlan.create.mock.calls[0][0].data;
    expect(createArg.versionNo).toBe(2);
    expect(createArg.parentVersionId).toBe(200);
    expect(createArg.status).toBe('DRAFT');
    expect(createArg.batchConfigId).toBe(7);
    // 只对 matched 调 add(), sequence 按 seq
    expect(planItem.add).toHaveBeenCalledTimes(1);
    const [planId, dto] = planItem.add.mock.calls[0];
    expect(planId).toBe(201);
    expect(dto.enrollmentPlanId).toBe(902);
    expect(dto.acceptAdjust).toBe(true);
    expect(dto.selectedMajors).toHaveLength(1);
    // 父 DRAFT → OUTDATED
    expect(prisma.__tx.volunteerPlan.update).toHaveBeenCalledWith({ where: { id: 200 }, data: { status: 'OUTDATED' } });
  });

  it('无父版本: versionNo=1, parentVersionId=null, 不调 update', async () => {
    prisma.studentProfile.findUnique.mockResolvedValue({ id: 10, userId: 50 });
    prisma.batchConfig.findUnique.mockResolvedValue({ id: 7, year: 2026, province: '四川', batch: '本科批B段' });
    prisma.__tx.volunteerPlan.findFirst.mockResolvedValue(null);
    prisma.__tx.volunteerPlan.create.mockResolvedValue({ id: 201, versionNo: 1 });

    await service.commit({ studentId: 10, batchConfigId: 7, resolvedGroups: [matched], actorUserId: 42 });

    const createArg = prisma.__tx.volunteerPlan.create.mock.calls[0][0].data;
    expect(createArg.versionNo).toBe(1);
    expect(createArg.parentVersionId).toBeNull();
    expect(prisma.__tx.volunteerPlan.update).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: 跑测试确认失败**

Run: `cd apps/server && npx jest src/modules/plan-import/volunteer-form-import.service.spec.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 4: 写实现**

```ts
// volunteer-form-import.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PlanItemService } from '../plan/plan-item.service';
import { ResolvedGroup } from './volunteer-form.types';

@Injectable()
export class VolunteerFormImportService {
  constructor(
    private prisma: PrismaService,
    private planItem: PlanItemService,
  ) {}

  async commit(input: {
    studentId: number;
    batchConfigId: number;
    resolvedGroups: ResolvedGroup[];
    actorUserId: number;
    versionNote?: string;
  }) {
    const student = await this.prisma.studentProfile.findUnique({ where: { id: input.studentId } });
    if (!student) throw new NotFoundException('学生不存在');
    const bc = await this.prisma.batchConfig.findUnique({ where: { id: input.batchConfigId } });
    if (!bc) throw new NotFoundException('批次配置不存在');

    const matched = input.resolvedGroups
      .filter(g => g.status === 'matched' && g.anchorEnrollmentPlanId)
      .sort((a, b) => a.seq - b.seq);

    // 1) 事务内建空新版本 + 锁父
    const newPlan = await this.prisma.$transaction(async (tx: any) => {
      const parent = await tx.volunteerPlan.findFirst({
        where: { studentId: input.studentId, batchConfigId: input.batchConfigId },
        orderBy: { versionNo: 'desc' },
      });
      const nextVersionNo = (parent?.versionNo ?? 0) + 1;
      const baseName = parent?.name?.replace(/-(初版|v\d+)$/, '') ?? `${bc.batch}`;
      const created = await tx.volunteerPlan.create({
        data: {
          studentId: input.studentId,
          createdById: input.actorUserId,
          name: `${baseName}-v${nextVersionNo}`,
          year: bc.year,
          province: bc.province,
          batchName: bc.batch,
          batchConfigId: input.batchConfigId,
          recommendType: 'MANUAL',
          status: 'DRAFT',
          versionNo: nextVersionNo,
          parentVersionId: parent?.id ?? null,
          versionNote: input.versionNote ?? '从志愿表导入（实填）',
        },
      });
      if (parent?.status === 'DRAFT') {
        await tx.volunteerPlan.update({ where: { id: parent.id }, data: { status: 'OUTDATED' } });
      }
      return created;
    });

    // 2) 逐条复用 add()(在新 DRAFT 版本上); 单条失败不阻断, 记录返回
    const failures: { seq: number; reason: string }[] = [];
    for (const g of matched) {
      try {
        await this.planItem.add(newPlan.id, {
          enrollmentPlanId: g.anchorEnrollmentPlanId!,
          sequence: g.seq,
          acceptAdjust: g.acceptAdjust,
          selectedMajors: g.selectedMajors,
          candidateMajorRanking: g.selectedMajors,
        } as any, input.actorUserId);
      } catch (e: any) {
        failures.push({ seq: g.seq, reason: e?.message ?? String(e) });
      }
    }
    return { ...newPlan, importedCount: matched.length - failures.length, failures };
  }
}
```

- [ ] **Step 5: 跑测试确认通过**

Run: `cd apps/server && npx jest src/modules/plan-import/volunteer-form-import.service.spec.ts`
Expected: PASS（2 个用例过）。

- [ ] **Step 6: 提交**

```bash
git add apps/server/src/modules/plan-import/volunteer-form-import.service.ts apps/server/src/modules/plan-import/volunteer-form-import.service.spec.ts apps/server/src/modules/plan/plan.module.ts
git commit -m "feat(plan-import): 导入建版 service(替换语义, 复用add逐条写入)"
```

---

## Task 6: 模块装配 + CLI 驱动脚本（端到端跑袁嘉）

**Files:**
- Create: `apps/server/src/modules/plan-import/plan-import.module.ts`
- Create: `apps/server/scripts/import-volunteer-form.ts`
- Modify: `apps/server/src/app.module.ts`（注册 `PlanImportModule`）

- [ ] **Step 1: 写 Nest 模块**

```ts
// plan-import.module.ts
import { Module } from '@nestjs/common';
import { PlanModule } from '../plan/plan.module';
import { VolunteerFormResolverService } from './volunteer-form-resolver.service';
import { StudentBatchMatcherService } from './student-batch-matcher.service';
import { VolunteerFormImportService } from './volunteer-form-import.service';

@Module({
  imports: [PlanModule],
  providers: [VolunteerFormResolverService, StudentBatchMatcherService, VolunteerFormImportService],
  exports: [VolunteerFormResolverService, StudentBatchMatcherService, VolunteerFormImportService],
})
export class PlanImportModule {}
```

在 `app.module.ts` 的 `imports` 数组加入 `PlanImportModule`（核对 import 路径 `./modules/plan-import/plan-import.module`）。

- [ ] **Step 2: 写 CLI 驱动脚本**

```ts
// apps/server/scripts/import-volunteer-form.ts
/**
 * 用法:
 *   cd apps/server && npx ts-node -r dotenv/config scripts/import-volunteer-form.ts \
 *     --form scripts/fixtures/yuanjia-volunteers.json --student-id 38 [--apply]
 *   不加 --apply 默认 dry-run(只解析打印命中率, 不写库) = R1 go/no-go。
 */
import * as fs from 'fs';
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { VolunteerFormResolverService } from '../src/modules/plan-import/volunteer-form-resolver.service';
import { StudentBatchMatcherService } from '../src/modules/plan-import/student-batch-matcher.service';
import { VolunteerFormImportService } from '../src/modules/plan-import/volunteer-form-import.service';
import { PlanItemService } from '../src/modules/plan/plan-item.service';
import { PlanStateMachineService } from '../src/modules/plan/plan-state-machine.service';
import { RiskEngineService } from '../src/modules/plan/risk-engine/risk-engine.service';

function arg(k: string) { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : undefined; }
const has = (k: string) => process.argv.includes(`--${k}`);

async function main() {
  const formPath = arg('form'); const studentId = Number(arg('student-id')); const apply = has('apply');
  if (!formPath || !studentId) throw new Error('--form <path> 和 --student-id <id> 必填');
  const form = JSON.parse(fs.readFileSync(formPath, 'utf-8'));

  const prisma = new PrismaClient({ adapter: new PrismaMariaDb(process.env.DATABASE_URL!) } as any);
  const resolver = new VolunteerFormResolverService(prisma as any);
  const matcher = new StudentBatchMatcherService(prisma as any);

  // 认人 → 取学生(此处脚本用显式 --student-id; 同时取出该生所属老师的 userId 作 actor)
  const student = await (prisma as any).studentProfile.findUnique({
    where: { id: studentId },
    include: { user: { select: { realName: true } }, teacher: { select: { userId: true } } },
  });
  if (!student) throw new Error(`学生 ${studentId} 不存在`);
  console.log(`学生: ${student.user?.realName} (#${studentId}) examType=${student.examType} 老师userId=${student.teacher?.userId}`);

  // 认批次
  const bc = await matcher.matchBatchConfig(form.batch, student.examType, student.examYear ?? form.year ?? 2026, student.province ?? '四川');
  if (!bc) throw new Error(`批次未配置: ${form.batch} / ${student.examType}`);
  console.log(`批次: ${bc.batch} (#${bc.id}) examType=${bc.examType} year=${bc.year}`);

  // 组解析
  const subjectsMap: Record<string, string> = { PHYSICS: '物理', HISTORY: '历史' };
  const r = await resolver.resolveGroups(form.volunteers, { year: bc.year, subjects: subjectsMap[student.examType] ?? '物理', batch: bc.batch });
  console.log(`\n命中 ${r.summary.matched}/${r.summary.total}, 未命中 ${r.summary.unmatched}`);
  r.groups.filter(g => g.status === 'unmatched').forEach(g => console.log(`  ✗ ${g.seq} ${g.schoolName}/${g.groupCode}: ${g.unmatchedReason}`));
  r.groups.filter(g => g.note).forEach(g => console.log(`  ⚠ ${g.seq} ${g.schoolName}/${g.groupCode}: ${g.note}`));

  if (!apply) { console.log('\n[dry-run] 未写库。加 --apply 落库。'); await prisma.$disconnect(); return; }

  const importSvc = new VolunteerFormImportService(
    prisma as any,
    new PlanItemService(prisma as any, new PlanStateMachineService(), { recomputeForPlan: async () => ({}) } as any),
  );
  const actorUserId = student.teacher?.userId;
  if (!actorUserId) throw new Error('该生未关联老师, 无法确定方案归属 actorUserId');
  const plan = await importSvc.commit({ studentId, batchConfigId: bc.id, resolvedGroups: r.groups, actorUserId });
  console.log(`\n✓ 新版本 plan #${plan.id} v${plan.versionNo}, 写入 ${(plan as any).importedCount} 条`);
  if ((plan as any).failures?.length) console.log('失败:', (plan as any).failures);
  await prisma.$disconnect();
}
main().catch(e => { console.error(e?.message || e); process.exit(1); });
```

> CLI 手动 `new PlanItemService(...)` 的依赖顺序要对齐其构造签名 `(prisma, sm, riskEngine, scoreSegment?)`(`plan-item.service.ts:25`)。`scoreSegment` 可省(可选,加分换算缺它时退回裸分位次)。

- [ ] **Step 3: dry-run(= R1 真实数据 go/no-go)**

Run: `cd apps/server && npx ts-node -r dotenv/config scripts/import-volunteer-form.ts --form scripts/fixtures/yuanjia-volunteers.json --student-id <袁嘉的studentId>`
Expected: 打印学生=袁嘉、批次=本科批B段、命中 N/41 + 未命中清单。**确认 N 合理(省内校应全中,省外校视数据完整性)。**

> 袁嘉的 `studentId`:用 `npx ts-node -r dotenv/config -e "..."` 按 realName 查,或从老师端学生列表拿。

- [ ] **Step 4: apply 落库(原始诉求达成)**

Run: 同上加 `--apply`
Expected: 打印「✓ 新版本 plan #X vN, 写入 N 条」。

- [ ] **Step 5: 提交**

```bash
git add apps/server/src/modules/plan-import/plan-import.module.ts apps/server/scripts/import-volunteer-form.ts apps/server/src/app.module.ts
git commit -m "feat(plan-import): 模块装配 + CLI 驱动脚本(端到端导入志愿表)"
```

---

## Task 7: 全套校验 + 真人走查

- [ ] **Step 1: 跑 plan-import 全部单测**

Run: `cd apps/server && npx jest src/modules/plan-import`
Expected: 三个 spec 全 PASS。

- [ ] **Step 2: server build(类型不破)**

Run: `pnpm --filter server build`
Expected: 构建成功,无 TS 错误。

- [ ] **Step 3: 真人走查(老师端)**

- 登录袁嘉的出方案老师账号 → 进袁嘉详情 → 该批次方案列表应出现新版本 vN(`从志愿表导入（实填）`),原 DRAFT 初稿变 OUTDATED 只读。
- 打开新版本 → 志愿数 = 命中数,顺序与 PDF 一致,服从调剂=是。
- 版本对比选原推荐方案 → 看到「推荐 vs 实填」红绿 diff。

- [ ] **Step 4: 记忆落档(可选)**

把「志愿表导入后端核心已上线 + Task1 实测命中率/数据缺口」写入项目记忆,供 Plan B/C 与后续部署参考。

---

## Self-Review

**1. Spec coverage：**
- spec ②组解析 → Task 3 ✅；③认人认批次 → Task 4 ✅；④导入建版(替换语义) → Task 5 ✅；CLI 端到端跑袁嘉(spec §8 step6) → Task 6 ✅；R1 go/no-go → Task 1 + Task 6 step3 ✅；未命中部分导入+报告 → resolver/commit 的 unmatched 处理 + CLI 打印 ✅。
- 不在 Plan A:①PDF 解析端点(Plan B)、⑤UI(Plan C)、preview/commit HTTP 端点(随 Plan C)。已在 Scope 注明。

**2. Placeholder scan：** 无 TBD/TODO;两处「按 schema 实际核字段名」(StudentProfile 的师生关联字段、relation 名)是**真实存在的待核点**,已给明确核查指令而非占位。

**3. Type consistency：** `ResolvedGroup`/`ResolvedSelectedMajor`/`ResolveResult` 在 Task 2 定义,Task 3/5/6 一致引用;`resolveGroups(volunteers, {year,subjects,batch})`、`commit({studentId,batchConfigId,resolvedGroups,actorUserId,versionNote?})`、`matchBatchConfig(parsedBatch,examType,year,province)`、`findCandidateStudents(identity,teacherUserId)` 各处签名一致;`PlanItemService.add(planId, dto, actorUserId)` 对齐 `plan-item.service.ts:100`。

**4. 风险点状态:** ① Task 1 三事实(batch=`本科批B段`/subjects=`物理`/major_code 与 PDF 一致)→ **已实测确认**(见 Task 1 callout),Task 6 `subjectsMap`/resolver 字面已对;② StudentProfile 师生关联 = `teacherId→TeacherProfile`(经 `teacher.userId`)→ **已核改**(Task 4/6);③ `VolunteerPlan.create` 字段(`batchName`/`recommendType`/`province`/`parentVersionId`/`versionNote`)已按 `deriveVersion` 的 create 对齐(`plan.service.ts:630`)。
