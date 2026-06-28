# 院校宿舍生活情况 — 入库 + 方案页打印下载 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `全国重点高校宿舍与设施情况汇总.xlsx` 的 28 个宿舍生活字段并入院校库，并在方案详情页新增"院校生活情况"合订打印下载（A4，一校一节）。

**Architecture:** Part A 走现有 import 脚本模式（`UniversityMatcher` 按名匹配 + NULL-safe 增量），加 28 个 `TEXT` 列。Part B 新增独立端点 `GET /plans/:id/dorm-sheet`（按 `planItems.sequence` 去重取院校，纯组装逻辑抽 builder 可单测）+ 打印页 `(print)/plan-dorm/[id]`（复刻 `plan-sheet` 骨架）+ 方案页第三个打印按钮。

**Tech Stack:** Prisma + MariaDB, NestJS, exceljs(脚本), Next.js App Router, antd, @tanstack/react-query, jest。

---

## File Structure

**Part A（入库）**
- Modify: `apps/server/prisma/schema.prisma`（`model University` 加 28 列）
- Create: `apps/server/prisma/migrations/20260628210000_university_dorm_life/migration.sql`
- Create: `apps/server/scripts/import-university-dormitory.ts`
- Modify: `apps/server/package.json`（加 `import:university-dormitory` 脚本）

**Part B 后端**
- Create: `apps/server/src/modules/plan-candidate/plan-dorm-sheet.builder.ts`（`DORM_FIELD_KEYS` + `buildDormSheet`，纯逻辑）
- Create: `apps/server/src/modules/plan-candidate/plan-dorm-sheet.builder.spec.ts`
- Modify: `apps/server/src/modules/plan-candidate/plan-candidate.service.ts`（加 `getDormSheet`）
- Modify: `apps/server/src/modules/plan-candidate/plan-candidate.controller.ts`（加路由）
- Modify: `apps/server/src/modules/plan-candidate/plan-candidate.service.spec.ts`（加归属校验测试）

**Part B 前端**
- Modify: `apps/web/src/services/plan-api.ts`（加 `getDormSheet`）
- Create: `apps/web/src/app/(print)/plan-dorm/[id]/types.ts`
- Create: `apps/web/src/app/(print)/plan-dorm/[id]/dorm-fields.ts`（4 组字段元数据）
- Create: `apps/web/src/app/(print)/plan-dorm/[id]/export-filename.ts` + `__tests__/export-filename.test.ts`
- Create: `apps/web/src/app/(print)/plan-dorm/[id]/DormInfoSheet.tsx`
- Create: `apps/web/src/app/(print)/plan-dorm/[id]/page.tsx`
- Modify: `apps/web/src/app/(teacher)/teacher/plans/[id]/page.tsx`（加第三个按钮）

---

## Task 1: schema 加 28 列 + migration

**Files:**
- Modify: `apps/server/prisma/schema.prisma`（`model University`，在 `rankingTimes` 之后、`campuses` 关联之前插入）
- Create: `apps/server/prisma/migrations/20260628210000_university_dorm_life/migration.sql`

- [ ] **Step 1: 在 schema.prisma 的 `model University` 内插入 28 列**

定位 `rankingTimes  Int? @map("ranking_times")` 这一行（约 377 行），在其后、`campuses  UniversityCampus[]` 之前插入：

```prisma
  // === 宿舍生活情况 (来源: 全国重点高校宿舍与设施情况汇总.xlsx, 纯展示) ===
  multiCampus             String? @map("multi_campus") @db.Text
  loftBed                 String? @map("loft_bed") @db.Text
  roomCapacity            String? @map("room_capacity") @db.Text
  dormAirConditioner      String? @map("dorm_air_conditioner") @db.Text
  privateBathroom         String? @map("private_bathroom") @db.Text
  hotWaterSchedule        String? @map("hot_water_schedule") @db.Text
  washingMachine          String? @map("washing_machine") @db.Text
  dormPowerLimit          String? @map("dorm_power_limit") @db.Text
  classroomAirConditioner String? @map("classroom_air_conditioner") @db.Text
  allNightStudyRoom       String? @map("all_night_study_room") @db.Text
  nightPowerCut           String? @map("night_power_cut") @db.Text
  nightNetworkCut         String? @map("night_network_cut") @db.Text
  dormInspection          String? @map("dorm_inspection") @db.Text
  curfewTime              String? @map("curfew_time") @db.Text
  morningEveningStudy     String? @map("morning_evening_study") @db.Text
  morningRun              String? @map("morning_run") @db.Text
  runningCheckIn          String? @map("running_check_in") @db.Text
  campusNetworkSpeed      String? @map("campus_network_speed") @db.Text
  campusNetworkPrice      String? @map("campus_network_price") @db.Text
  freshmanComputer        String? @map("freshman_computer") @db.Text
  hasSubway               String? @map("has_subway") @db.Text
  distanceToCity          String? @map("distance_to_city") @db.Text
  transportConvenience    String? @map("transport_convenience") @db.Text
  foodDelivery            String? @map("food_delivery") @db.Text
  canteenPrice            String? @map("canteen_price") @db.Text
  supermarketPrice        String? @map("supermarket_price") @db.Text
  expressDelivery         String? @map("express_delivery") @db.Text
  sharedBikes             String? @map("shared_bikes") @db.Text
```

- [ ] **Step 2: 写 migration.sql**

Create `apps/server/prisma/migrations/20260628210000_university_dorm_life/migration.sql`：

```sql
-- AlterTable: 院校宿舍生活情况 28 列 (TEXT 行外存储, 规避行宽上限)
ALTER TABLE `universities`
  ADD COLUMN `multi_campus` TEXT NULL,
  ADD COLUMN `loft_bed` TEXT NULL,
  ADD COLUMN `room_capacity` TEXT NULL,
  ADD COLUMN `dorm_air_conditioner` TEXT NULL,
  ADD COLUMN `private_bathroom` TEXT NULL,
  ADD COLUMN `hot_water_schedule` TEXT NULL,
  ADD COLUMN `washing_machine` TEXT NULL,
  ADD COLUMN `dorm_power_limit` TEXT NULL,
  ADD COLUMN `classroom_air_conditioner` TEXT NULL,
  ADD COLUMN `all_night_study_room` TEXT NULL,
  ADD COLUMN `night_power_cut` TEXT NULL,
  ADD COLUMN `night_network_cut` TEXT NULL,
  ADD COLUMN `dorm_inspection` TEXT NULL,
  ADD COLUMN `curfew_time` TEXT NULL,
  ADD COLUMN `morning_evening_study` TEXT NULL,
  ADD COLUMN `morning_run` TEXT NULL,
  ADD COLUMN `running_check_in` TEXT NULL,
  ADD COLUMN `campus_network_speed` TEXT NULL,
  ADD COLUMN `campus_network_price` TEXT NULL,
  ADD COLUMN `freshman_computer` TEXT NULL,
  ADD COLUMN `has_subway` TEXT NULL,
  ADD COLUMN `distance_to_city` TEXT NULL,
  ADD COLUMN `transport_convenience` TEXT NULL,
  ADD COLUMN `food_delivery` TEXT NULL,
  ADD COLUMN `canteen_price` TEXT NULL,
  ADD COLUMN `supermarket_price` TEXT NULL,
  ADD COLUMN `express_delivery` TEXT NULL,
  ADD COLUMN `shared_bikes` TEXT NULL;
```

- [ ] **Step 3: 生成 client + 本地应用迁移验证**

Run（cd apps/server）：
```bash
pnpm prisma generate
pnpm prisma migrate deploy
```
Expected: `migrate deploy` 输出 `Applying migration 20260628210000_university_dorm_life`，无报错（行宽未超限）。`prisma generate` 后 `University` 类型含 28 个新字段。

- [ ] **Step 4: Commit**

```bash
git add apps/server/prisma/schema.prisma apps/server/prisma/migrations/20260628210000_university_dorm_life/
git commit -m "feat(university): 院校库加 28 个宿舍生活字段 + migration"
```

---

## Task 2: 导入脚本 import-university-dormitory.ts

**Files:**
- Create: `apps/server/scripts/import-university-dormitory.ts`
- Modify: `apps/server/package.json`

- [ ] **Step 1: 写导入脚本（复刻 import-university-basic 模式）**

Create `apps/server/scripts/import-university-dormitory.ts`：

```ts
/**
 * 导入 全国重点高校宿舍与设施情况汇总.xlsx (Sheet1) 的 28 个宿舍生活字段到 universities 表。
 * 用法（cd apps/server）：
 *   pnpm import:university-dormitory --file=../../data/03_专家版主表/output/全国重点高校宿舍与设施情况汇总.xlsx --dry-run
 *   pnpm import:university-dormitory --file=... --overwrite
 *
 * file1 只有院校名称没有 code → 按规范化名匹配; 同名命中多个 id 时全部 patch(校级数据)。
 * 默认 NULL-safe: 只在 DB 字段为 NULL 时填; --overwrite 强制覆盖。
 */
import * as ExcelJS from 'exceljs';
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { parseArgs } from './lib/cli-utils';
import { UniversityMatcher } from './lib/university-matcher';

const SHEET_NAME = 'Sheet1';

// [prisma 字段, file1 表头(已剥离 ⭐)]
const FIELD_MAP: Array<[string, string]> = [
  ['multiCampus', '存在多校区'],
  ['loftBed', '上床下桌'],
  ['roomCapacity', '几人间'],
  ['dormAirConditioner', '宿舍空调'],
  ['privateBathroom', '独立卫浴'],
  ['hotWaterSchedule', '洗澡热水时段'],
  ['washingMachine', '洗衣机'],
  ['dormPowerLimit', '宿舍限电瓦数'],
  ['classroomAirConditioner', '教室空调'],
  ['allNightStudyRoom', '通宵自习室'],
  ['nightPowerCut', '夜间断电'],
  ['nightNetworkCut', '夜间断网'],
  ['dormInspection', '查寝情况'],
  ['curfewTime', '晚归门禁时间'],
  ['morningEveningStudy', '早晚自习'],
  ['morningRun', '晨跑要求'],
  ['runningCheckIn', '跑步打卡要求'],
  ['campusNetworkSpeed', '校园网速度'],
  ['campusNetworkPrice', '校园网价格'],
  ['freshmanComputer', '大一带电脑'],
  ['hasSubway', '地铁'],
  ['distanceToCity', '市区距离'],
  ['transportConvenience', '学校交通便利'],
  ['foodDelivery', '点外卖'],
  ['canteenPrice', '食堂价格感受'],
  ['supermarketPrice', '超市价格感受'],
  ['expressDelivery', '收发快递'],
  ['sharedBikes', '共享单车'],
];

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

// 列头去 ⭐ 后建索引(file1 有 "⭐存在多校区"/"⭐市区距离")。
function colIndexes(sheet: ExcelJS.Worksheet): Map<string, number> {
  const idx = new Map<string, number>();
  sheet.getRow(1).eachCell((cell, col) => {
    idx.set(toText(cell.value).replace(/⭐/g, '').trim(), col);
  });
  return idx;
}

interface DormRow {
  name: string;
  fields: Record<string, string | null>;
}

function parseRows(sheet: ExcelJS.Worksheet): DormRow[] {
  const idx = colIndexes(sheet);
  const nameCol = idx.get('院校名称');
  if (!nameCol) throw new Error('找不到列 "院校名称"');
  const rows: DormRow[] = [];
  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const name = toText(row.getCell(nameCol).value).trim();
    if (!name) continue;
    const fields: Record<string, string | null> = {};
    for (const [field, header] of FIELD_MAP) {
      const c = idx.get(header);
      fields[field] = c ? nullIfEmpty(row.getCell(c).value) : null;
    }
    rows.push({ name, fields });
  }
  return rows;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const file = String(args.file || '');
  const dryRun = Boolean(args['dry-run']);
  const overwrite = Boolean(args.overwrite);
  if (!file) throw new Error('缺少 --file=/path/to/全国重点高校宿舍与设施情况汇总.xlsx');

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const sheet = wb.getWorksheet(SHEET_NAME);
  if (!sheet) throw new Error(`sheet "${SHEET_NAME}" 不存在`);
  const rows = parseRows(sheet);
  console.log(`xlsx 解析：${SHEET_NAME} ${rows.length} 行`);

  const prisma = new PrismaClient({ adapter: new PrismaMariaDb(process.env.DATABASE_URL!) });
  try {
    const matcher = await UniversityMatcher.fromDb(prisma);
    const updates: Array<{ id: number; data: Record<string, unknown> }> = [];

    for (const row of rows) {
      const ids = matcher.matchByName(row.name);
      if (!ids) continue;
      const patch: Record<string, unknown> = { ...row.fields };
      if (!overwrite) {
        for (const k of Object.keys(patch)) {
          if (patch[k] === null) delete patch[k];
        }
      }
      if (Object.keys(patch).length === 0) continue;
      for (const id of ids) updates.push({ id, data: patch });
    }

    const report = matcher.reportUnmatched();
    console.log(JSON.stringify({
      file, dryRun, overwrite, sheet: SHEET_NAME,
      totalRows: rows.length,
      universitiesToUpdate: updates.length,
      unmatched: report.totalUnmatched,
      sampleUnmatched: report.sampleNames.slice(0, 20),
    }, null, 2));

    if (dryRun) return;

    let done = 0;
    for (const u of updates) {
      await prisma.university.update({ where: { id: u.id }, data: u.data });
      done++;
      if (done % 200 === 0) console.log(`  ${done}/${updates.length}`);
    }
    console.log(`完成：更新 ${done} 所院校`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: 注册 package.json 脚本**

在 `apps/server/package.json` 的 `import:major-details` 行之后加一行：
```json
    "import:university-dormitory": "ts-node -r dotenv/config scripts/import-university-dormitory.ts",
```

- [ ] **Step 3: dry-run 验证匹配率**

Run（cd apps/server）：
```bash
pnpm import:university-dormitory --file=../../data/03_专家版主表/output/全国重点高校宿舍与设施情况汇总.xlsx --dry-run
```
Expected: 打印 `totalRows≈3056`、`universitiesToUpdate`>0、`unmatched` 列表。**人工检查 `sampleUnmatched`**：若是带括号分校/罕见名可接受；若大面积主流校对不上则停下排查（可能 SHEET_NAME 或表头读错）。

- [ ] **Step 4: 正式导入本地库**

Run：
```bash
pnpm import:university-dormitory --file=../../data/03_专家版主表/output/全国重点高校宿舍与设施情况汇总.xlsx
```
Expected: `完成：更新 N 所院校`。

- [ ] **Step 5: Commit**

```bash
git add apps/server/scripts/import-university-dormitory.ts apps/server/package.json
git commit -m "feat(university): 宿舍生活数据导入脚本(按名匹配/NULL-safe)"
```

---

## Task 3: 后端 builder（TDD，纯逻辑）

**Files:**
- Create: `apps/server/src/modules/plan-candidate/plan-dorm-sheet.builder.ts`
- Test: `apps/server/src/modules/plan-candidate/plan-dorm-sheet.builder.spec.ts`

- [ ] **Step 1: 写失败测试**

Create `apps/server/src/modules/plan-candidate/plan-dorm-sheet.builder.spec.ts`：

```ts
import { buildDormSheet, DORM_FIELD_KEYS } from './plan-dorm-sheet.builder';

const plan = {
  id: 78,
  batchName: '本科批',
  year: 2026,
  student: { user: { realName: '张三' } },
  planItems: [
    { sequence: 1, universityId: 10 },
    { sequence: 2, universityId: 20 },
    { sequence: 3, universityId: 10 }, // 同校重复, 应去重保第一次出现顺序
  ],
};

const universities = [
  { id: 20, name: '北京大学', province: '北京', city: '北京', runningLevel: '本科', runningNature: '公办', roomCapacity: '4', dormAirConditioner: '有' },
  { id: 10, name: '四川大学', province: '四川', city: '成都', runningLevel: '本科', runningNature: '公办' }, // 28 字段全空
];

describe('buildDormSheet', () => {
  it('按 planItems.sequence 去重保序', () => {
    const sheet = buildDormSheet({ plan: plan as any, universities: universities as any });
    expect(sheet.universities.map((u) => u.id)).toEqual([10, 20]);
  });

  it('plan/student 元信息透出', () => {
    const sheet = buildDormSheet({ plan: plan as any, universities: universities as any });
    expect(sheet.plan).toEqual({ id: 78, batchName: '本科批', year: 2026 });
    expect(sheet.student).toEqual({ name: '张三' });
  });

  it('28 字段全空的院校 hasData=false', () => {
    const sheet = buildDormSheet({ plan: plan as any, universities: universities as any });
    const scu = sheet.universities.find((u) => u.id === 10)!;
    expect(scu.hasData).toBe(false);
    expect(scu.dorm.roomCapacity).toBeNull();
  });

  it('有任一字段的院校 hasData=true 且字段透出', () => {
    const sheet = buildDormSheet({ plan: plan as any, universities: universities as any });
    const pku = sheet.universities.find((u) => u.id === 20)!;
    expect(pku.hasData).toBe(true);
    expect(pku.dorm.roomCapacity).toBe('4');
    expect(pku.dorm.dormAirConditioner).toBe('有');
  });

  it('DORM_FIELD_KEYS 含 28 个字段', () => {
    expect(DORM_FIELD_KEYS).toHaveLength(28);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run（cd apps/server）：`pnpm jest plan-dorm-sheet.builder --silent`
Expected: FAIL，`Cannot find module './plan-dorm-sheet.builder'`。

- [ ] **Step 3: 写 builder 实现**

Create `apps/server/src/modules/plan-candidate/plan-dorm-sheet.builder.ts`：

```ts
// 院校宿舍生活情况打印表 — 纯组装(去重保序 + hasData 判定), 无 Prisma, 可单测。

export const DORM_FIELD_KEYS = [
  'multiCampus', 'loftBed', 'roomCapacity', 'dormAirConditioner', 'privateBathroom',
  'hotWaterSchedule', 'washingMachine', 'dormPowerLimit', 'classroomAirConditioner',
  'allNightStudyRoom', 'nightPowerCut', 'nightNetworkCut', 'dormInspection', 'curfewTime',
  'morningEveningStudy', 'morningRun', 'runningCheckIn', 'campusNetworkSpeed',
  'campusNetworkPrice', 'freshmanComputer', 'hasSubway', 'distanceToCity',
  'transportConvenience', 'foodDelivery', 'canteenPrice', 'supermarketPrice',
  'expressDelivery', 'sharedBikes',
] as const;

export type DormFieldKey = (typeof DORM_FIELD_KEYS)[number];

export interface DormUniversity {
  id: number;
  name: string;
  province: string | null;
  city: string | null;
  runningLevel: string | null;
  runningNature: string | null;
  dorm: Record<DormFieldKey, string | null>;
  hasData: boolean;
}

export interface DormSheet {
  plan: { id: number; batchName: string | null; year: number | null };
  student: { name: string | null };
  universities: DormUniversity[];
}

interface BuildInput {
  plan: {
    id: number;
    batchName: string | null;
    year: number | null;
    student?: { user?: { realName?: string | null } | null } | null;
    planItems: Array<{ sequence: number; universityId: number }>;
  };
  universities: Array<Record<string, unknown> & { id: number; name: string }>;
}

export function buildDormSheet({ plan, universities }: BuildInput): DormSheet {
  const uById = new Map(universities.map((u) => [u.id, u]));

  // planItems 已按 sequence 排序(调用方保证); 去重保第一次出现顺序。
  const seen = new Set<number>();
  const orderedIds: number[] = [];
  for (const item of plan.planItems) {
    if (seen.has(item.universityId)) continue;
    seen.add(item.universityId);
    orderedIds.push(item.universityId);
  }

  const out: DormUniversity[] = [];
  for (const id of orderedIds) {
    const u = uById.get(id);
    if (!u) continue; // 院校被删等极端情况, 跳过
    const dorm = {} as Record<DormFieldKey, string | null>;
    let hasData = false;
    for (const k of DORM_FIELD_KEYS) {
      const v = u[k];
      const val = typeof v === 'string' && v.trim() !== '' ? v : null;
      dorm[k] = val;
      if (val !== null) hasData = true;
    }
    out.push({
      id: u.id,
      name: String(u.name),
      province: (u.province as string) ?? null,
      city: (u.city as string) ?? null,
      runningLevel: (u.runningLevel as string) ?? null,
      runningNature: (u.runningNature as string) ?? null,
      dorm,
      hasData,
    });
  }

  return {
    plan: { id: plan.id, batchName: plan.batchName, year: plan.year },
    student: { name: plan.student?.user?.realName ?? null },
    universities: out,
  };
}
```

- [ ] **Step 4: 运行测试确认通过**

Run：`pnpm jest plan-dorm-sheet.builder --silent`
Expected: PASS（5 个用例全绿）。

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/modules/plan-candidate/plan-dorm-sheet.builder.ts apps/server/src/modules/plan-candidate/plan-dorm-sheet.builder.spec.ts
git commit -m "feat(plan): 宿舍生活打印表 builder(去重保序+hasData)"
```

---

## Task 4: service.getDormSheet + controller 路由（TDD 归属校验）

**Files:**
- Modify: `apps/server/src/modules/plan-candidate/plan-candidate.service.ts`
- Modify: `apps/server/src/modules/plan-candidate/plan-candidate.controller.ts`
- Test: `apps/server/src/modules/plan-candidate/plan-candidate.service.spec.ts`

- [ ] **Step 1: 写失败测试（追加到 service.spec.ts 末尾，`describe` 块内）**

在 `plan-candidate.service.spec.ts` 末尾的最外层 `describe('PlanCandidateService', ...)` 闭合 `})` 之前追加：

```ts
  describe('getDormSheet', () => {
    const planRow = {
      id: 78, batchName: '本科批', year: 2026, createdById: 21,
      student: { userId: 68, user: { realName: '张三' } },
      planItems: [
        { sequence: 1, universityId: 10 },
        { sequence: 2, universityId: 20 },
      ],
    };

    it('越权(非创建者非学生本人)抛 Forbidden', async () => {
      prisma.volunteerPlan.findUnique.mockResolvedValue(planRow);
      await expect(service.getDormSheet(78, 999)).rejects.toThrow('无权查看此方案');
    });

    it('方案不存在抛 NotFound', async () => {
      prisma.volunteerPlan.findUnique.mockResolvedValue(null);
      await expect(service.getDormSheet(78, 21)).rejects.toThrow('方案不存在');
    });

    it('创建者可取, 按方案顺序去重返回院校生活数据', async () => {
      prisma.volunteerPlan.findUnique.mockResolvedValue(planRow);
      prisma.university = {
        findMany: jest.fn().mockResolvedValue([
          { id: 20, name: '北京大学', province: '北京', city: '北京', runningLevel: '本科', runningNature: '公办', roomCapacity: '4' },
          { id: 10, name: '四川大学', province: '四川', city: '成都', runningLevel: '本科', runningNature: '公办', roomCapacity: '6' },
        ]),
      };
      const sheet: any = await service.getDormSheet(78, 21);
      expect(sheet.universities.map((u: any) => u.id)).toEqual([10, 20]);
      expect(sheet.student.name).toBe('张三');
      expect(sheet.universities[0].dorm.roomCapacity).toBe('6');
    });
  });
```

- [ ] **Step 2: 运行测试确认失败**

Run：`pnpm jest plan-candidate.service --silent -t getDormSheet`
Expected: FAIL，`service.getDormSheet is not a function`。

- [ ] **Step 3: 在 service 末尾加 getDormSheet**

`plan-candidate.service.ts` 顶部确认已 import `ForbiddenException, NotFoundException`（`getExportRows` 已用，无需新增）。在文件 `getExportRows` 方法之后、类闭合之前插入。先确认顶部已有 `import { buildDormSheet, DORM_FIELD_KEYS } from './plan-dorm-sheet.builder';`（与 `buildExportSheet` import 并列加一行）：

```ts
  async getDormSheet(planId: number, userId?: number) {
    const plan = await this.prisma.volunteerPlan.findUnique({
      where: { id: planId },
      include: {
        planItems: { orderBy: { sequence: 'asc' }, select: { sequence: true, universityId: true } },
        student: { include: { user: true } },
      },
    });
    if (!plan) throw new NotFoundException('方案不存在');
    if (userId && plan.createdById !== userId && plan.student?.userId !== userId) {
      throw new ForbiddenException('无权查看此方案');
    }

    const ids = Array.from(new Set(plan.planItems.map((i) => i.universityId)));
    const select: Record<string, true> = {
      id: true, name: true, province: true, city: true, runningLevel: true, runningNature: true,
    };
    for (const k of DORM_FIELD_KEYS) select[k] = true;

    const universities = ids.length
      ? await this.prisma.university.findMany({ where: { id: { in: ids } }, select: select as any })
      : [];

    return buildDormSheet({ plan: plan as any, universities: universities as any });
  }
```

- [ ] **Step 4: 在 controller 加路由**

`plan-candidate.controller.ts`，在 `getExportRows` 方法之后插入：

```ts
  @Get(':planId/dorm-sheet')
  getDormSheet(
    @Param('planId', ParseIntPipe) planId: number,
    @Req() req: any,
  ) {
    return this.service.getDormSheet(planId, req.user.id);
  }
```

- [ ] **Step 5: 运行测试确认通过**

Run：`pnpm jest plan-candidate.service --silent -t getDormSheet`
Expected: PASS（3 个用例）。

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/modules/plan-candidate/plan-candidate.service.ts apps/server/src/modules/plan-candidate/plan-candidate.controller.ts apps/server/src/modules/plan-candidate/plan-candidate.service.spec.ts
git commit -m "feat(plan): GET /plans/:id/dorm-sheet 端点(归属校验+去重取院校)"
```

---

## Task 5: 后端构建验证

- [ ] **Step 1: 构建 server**

Run：`pnpm --filter server build`
Expected: 无 TS 报错。若 `select as any` 之外报类型错，按提示修。

- [ ] **Step 2: 跑该模块全部测试确认无回归**

Run（cd apps/server）：`pnpm jest plan-candidate --silent`
Expected: 该 suite 全绿（对照 [[test_suite_baseline_failures]] baseline，无新增红）。

---

## Task 6: 前端 API + 类型 + 字段元数据

**Files:**
- Modify: `apps/web/src/services/plan-api.ts`
- Create: `apps/web/src/app/(print)/plan-dorm/[id]/types.ts`
- Create: `apps/web/src/app/(print)/plan-dorm/[id]/dorm-fields.ts`

- [ ] **Step 1: plan-api 加 getDormSheet**

`plan-api.ts`，在 `getExportRows` 之后插入：

```ts
  getDormSheet(planId: number | string): Promise<any> {
    return api.get(`/plans/${planId}/dorm-sheet`) as any;
  },
```

- [ ] **Step 2: 打印页 types.ts**

Create `apps/web/src/app/(print)/plan-dorm/[id]/types.ts`：

```ts
export interface DormSheetUniversity {
  id: number;
  name: string;
  province: string | null;
  city: string | null;
  runningLevel: string | null;
  runningNature: string | null;
  dorm: Record<string, string | null>;
  hasData: boolean;
}

export interface DormSheet {
  plan: { id: number; batchName: string | null; year: number | null };
  student: { name: string | null };
  universities: DormSheetUniversity[];
}
```

- [ ] **Step 3: 字段分组元数据 dorm-fields.ts**

Create `apps/web/src/app/(print)/plan-dorm/[id]/dorm-fields.ts`：

```ts
// 28 字段的 4 组分块(渲染顺序 + 中文标签)。key 必须与后端 DORM_FIELD_KEYS 一致。
export interface DormFieldGroup {
  title: string;
  fields: Array<{ key: string; label: string }>;
}

export const DORM_FIELD_GROUPS: DormFieldGroup[] = [
  {
    title: '住宿条件',
    fields: [
      { key: 'multiCampus', label: '多校区' },
      { key: 'loftBed', label: '上床下桌' },
      { key: 'roomCapacity', label: '几人间' },
      { key: 'dormAirConditioner', label: '宿舍空调' },
      { key: 'privateBathroom', label: '独立卫浴' },
      { key: 'hotWaterSchedule', label: '洗澡热水时段' },
      { key: 'washingMachine', label: '洗衣机' },
      { key: 'dormPowerLimit', label: '宿舍限电瓦数' },
    ],
  },
  {
    title: '教学管理',
    fields: [
      { key: 'classroomAirConditioner', label: '教室空调' },
      { key: 'allNightStudyRoom', label: '通宵自习室' },
      { key: 'nightPowerCut', label: '夜间断电' },
      { key: 'nightNetworkCut', label: '夜间断网' },
      { key: 'dormInspection', label: '查寝情况' },
      { key: 'curfewTime', label: '晚归门禁时间' },
      { key: 'morningEveningStudy', label: '早晚自习' },
      { key: 'morningRun', label: '晨跑要求' },
      { key: 'runningCheckIn', label: '跑步打卡要求' },
    ],
  },
  {
    title: '网络',
    fields: [
      { key: 'campusNetworkSpeed', label: '校园网速度' },
      { key: 'campusNetworkPrice', label: '校园网价格' },
      { key: 'freshmanComputer', label: '大一带电脑' },
    ],
  },
  {
    title: '周边生活',
    fields: [
      { key: 'hasSubway', label: '地铁' },
      { key: 'distanceToCity', label: '市区距离' },
      { key: 'transportConvenience', label: '交通便利' },
      { key: 'foodDelivery', label: '点外卖' },
      { key: 'canteenPrice', label: '食堂价格' },
      { key: 'supermarketPrice', label: '超市价格' },
      { key: 'expressDelivery', label: '收发快递' },
      { key: 'sharedBikes', label: '共享单车' },
    ],
  },
];
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/services/plan-api.ts "apps/web/src/app/(print)/plan-dorm/[id]/types.ts" "apps/web/src/app/(print)/plan-dorm/[id]/dorm-fields.ts"
git commit -m "feat(web): 宿舍生活打印页 API/类型/字段分组元数据"
```

---

## Task 7: 文件名工具（TDD）

**Files:**
- Create: `apps/web/src/app/(print)/plan-dorm/[id]/export-filename.ts`
- Test: `apps/web/src/app/(print)/plan-dorm/[id]/__tests__/export-filename.test.ts`

- [ ] **Step 1: 写失败测试**

Create `apps/web/src/app/(print)/plan-dorm/[id]/__tests__/export-filename.test.ts`：

```ts
import { buildDormTitle } from '../export-filename';

describe('buildDormTitle', () => {
  const now = new Date('2026-06-28T10:00:00');

  it('拼 学生_批次_院校生活情况_日期', () => {
    const t = buildDormTitle({ student: { name: '王润' }, plan: { batchName: '本科批B段' } } as any, now);
    expect(t).toBe('王润_本科批B段_院校生活情况_20260628');
  });

  it('清洗非法字符 + 缺名兜底', () => {
    const t = buildDormTitle({ student: { name: 'a/b' }, plan: { batchName: null } } as any, now);
    expect(t).toBe('a_b_院校生活情况_20260628');
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run（cd apps/web）：`pnpm jest export-filename --silent` （或 `npx jest src/app/\(print\)/plan-dorm`）
Expected: FAIL，找不到模块。

- [ ] **Step 3: 写实现（复刻 plan-sheet 的 export-filename）**

Create `apps/web/src/app/(print)/plan-dorm/[id]/export-filename.ts`：

```ts
import type { DormSheet } from './types';

// 院校生活情况导出文件名(浏览器「另存为 PDF」默认取 document.title)。
// 形如: 王润_本科批B段_院校生活情况_20260628
export function buildDormTitle(
  sheet: Pick<DormSheet, 'student' | 'plan'>,
  now: Date = new Date(),
): string {
  const safe = (s: string) => (s || '').replace(/[\\/:*?"<>|]/g, '_').trim();
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(
    now.getDate(),
  ).padStart(2, '0')}`;
  const parts = [safe(sheet.student?.name ?? '') || '学生', safe(sheet.plan?.batchName ?? '')].filter(
    Boolean,
  );
  return `${parts.join('_')}_院校生活情况_${ymd}`.replace(/_+/g, '_');
}
```

- [ ] **Step 4: 运行确认通过**

Run：`pnpm jest export-filename --silent`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/(print)/plan-dorm/[id]/export-filename.ts" "apps/web/src/app/(print)/plan-dorm/[id]/__tests__/export-filename.test.ts"
git commit -m "feat(web): 院校生活情况导出文件名工具"
```

---

## Task 8: DormInfoSheet 组件

**Files:**
- Create: `apps/web/src/app/(print)/plan-dorm/[id]/DormInfoSheet.tsx`

- [ ] **Step 1: 写组件**

Create `apps/web/src/app/(print)/plan-dorm/[id]/DormInfoSheet.tsx`：

```tsx
import { DORM_FIELD_GROUPS } from './dorm-fields';
import type { DormSheet, DormSheetUniversity } from './types';

function UniversitySection({ u, index }: { u: DormSheetUniversity; index: number }) {
  const meta = [u.province, u.city, u.runningLevel, u.runningNature].filter(Boolean).join(' · ');
  return (
    <section
      style={{
        breakInside: 'avoid',
        pageBreakInside: 'avoid',
        marginBottom: 18,
        ...(index > 0 ? { breakBefore: 'page', pageBreakBefore: 'always' } : {}),
      }}
    >
      <div style={{ borderBottom: '2px solid #333', paddingBottom: 4, marginBottom: 8 }}>
        <span style={{ fontSize: 18, fontWeight: 700 }}>{u.name}</span>
        {meta && <span style={{ fontSize: 12, color: '#666', marginLeft: 10 }}>{meta}</span>}
      </div>

      {!u.hasData ? (
        <div style={{ fontSize: 13, color: '#999', padding: '12px 0' }}>暂无该校生活数据</div>
      ) : (
        DORM_FIELD_GROUPS.map((group) => (
          <div key={group.title} style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#444', margin: '4px 0' }}>
              {group.title}
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <tbody>
                {group.fields.map((f) => (
                  <tr key={f.key}>
                    <td
                      style={{
                        border: '1px solid #ddd', padding: '3px 8px', width: 110,
                        background: '#fafafa', color: '#555', whiteSpace: 'nowrap', verticalAlign: 'top',
                      }}
                    >
                      {f.label}
                    </td>
                    <td style={{ border: '1px solid #ddd', padding: '3px 8px' }}>
                      {u.dorm[f.key] ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))
      )}
    </section>
  );
}

export default function DormInfoSheet({ sheet }: { sheet: DormSheet }) {
  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>
        {sheet.student.name ?? '学生'} · 院校生活情况
      </h1>
      <div style={{ fontSize: 12, color: '#666', marginBottom: 16 }}>
        {[sheet.plan.batchName, sheet.plan.year ? `${sheet.plan.year}年` : null]
          .filter(Boolean)
          .join(' · ')}
        　共 {sheet.universities.length} 所院校
      </div>
      {sheet.universities.map((u, i) => (
        <UniversitySection key={u.id} u={u} index={i} />
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add "apps/web/src/app/(print)/plan-dorm/[id]/DormInfoSheet.tsx"
git commit -m "feat(web): DormInfoSheet 一校一节渲染组件"
```

---

## Task 9: 打印页 page.tsx

**Files:**
- Create: `apps/web/src/app/(print)/plan-dorm/[id]/page.tsx`

- [ ] **Step 1: 写打印页（复刻 plan-sheet/page.tsx）**

Create `apps/web/src/app/(print)/plan-dorm/[id]/page.tsx`：

```tsx
'use client';

import { useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Button, Empty, Spin } from 'antd';
import { PrinterOutlined } from '@ant-design/icons';
import { planApi } from '@/services/plan-api';
import DormInfoSheet from './DormInfoSheet';
import { buildDormTitle } from './export-filename';
import type { DormSheet } from './types';

const PRINT_CSS = `
@page { size: A4 portrait; margin: 12mm; }
@media print {
  .no-print { display: none !important; }
  html, body { background: #fff !important; }
}
`;

export default function PlanDormPrintPage() {
  const params = useParams<{ id: string }>();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['plan-dorm-sheet', params.id],
    queryFn: () => planApi.getDormSheet(params.id) as Promise<DormSheet>,
    enabled: !!params.id,
  });

  useEffect(() => {
    if (!data) return;
    const prev = document.title;
    document.title = buildDormTitle(data);
    return () => {
      document.title = prev;
    };
  }, [data]);

  return (
    <div style={{ padding: 16, background: '#fff', minHeight: '100vh' }}>
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
      <div className="no-print" style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
        <Button type="primary" icon={<PrinterOutlined />} onClick={() => window.print()}>
          打印 / 另存为 PDF（A4 竖版）
        </Button>
        <span style={{ fontSize: 12, color: '#6b6962' }}>
          打印对话框里选 A4、纵向；可直接「另存为 PDF」发学生。
        </span>
      </div>

      {isLoading ? (
        <Spin />
      ) : isError ? (
        <Empty description="加载失败，请确认已登录且有权访问该方案" />
      ) : !data || data.universities.length === 0 ? (
        <Empty description="该方案暂无院校" />
      ) : (
        <DormInfoSheet sheet={data} />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add "apps/web/src/app/(print)/plan-dorm/[id]/page.tsx"
git commit -m "feat(web): 院校生活情况打印页(A4竖版/Ctrl+P存PDF)"
```

---

## Task 10: 方案详情页加第三个打印按钮

**Files:**
- Modify: `apps/web/src/app/(teacher)/teacher/plans/[id]/page.tsx`（约 1250-1255 行）

- [ ] **Step 1: 在"填报预案表"按钮之后加按钮**

定位约 1250 行的 `填报预案表（A4 竖版）` 那个 `<Button>` 闭合 `</Button>` 之后、提示 `<span>` 之前，插入：

```tsx
          <Button
            icon={<ExportOutlined />}
            onClick={() => window.open(`/plan-dorm/${planId}`, '_blank', 'noopener')}
          >
            院校生活情况（A4）
          </Button>
```

（`ExportOutlined` 该文件顶部已 import，见家长版按钮；如未 import 则补。`planId` 同上下文已有。）

- [ ] **Step 2: 构建 web 验证**

Run：`pnpm --filter web build`
Expected: 编译通过，`(print)/plan-dorm/[id]` 与方案页均无 TS/lint 报错。

- [ ] **Step 3: Commit**

```bash
git add "apps/web/src/app/(teacher)/teacher/plans/[id]/page.tsx"
git commit -m "feat(web): 方案页加「院校生活情况」打印按钮"
```

---

## Task 11: 本地人工验证

- [ ] **Step 1: 起服务，登录老师，开方案 78**

参考 `/run` 或既有启动方式起 server(:3003) + web(:3004)。登录演示老师，进 `/teacher/plans/78`，点"打印/导出 PDF"卡片里新按钮"院校生活情况（A4）"。
Expected: 新标签打开打印页，按方案梯度顺序列出各院校，每校 4 组宿舍生活字段；无数据院校显示"暂无该校生活数据"；`document.title` 为 `学生_批次_院校生活情况_日期`。

- [ ] **Step 2: Ctrl+P 预览版面**

Expected: A4 竖版，校与校分页，表格不跨页割裂。若版面拥挤/换行难看，记为 claude-design 精修项（不在本计划内硬修）。

---

## Task 12: 部署生产 + 线上导入

> 参考 [[deploy_workflow]] [[worktree_env_local]]：worktree 需先确认 `.env.production.local` 等本地配置已就位再 build。

- [ ] **Step 1: 构建两端**

Run：`pnpm --filter server build && pnpm --filter web build`

- [ ] **Step 2: 增量部署**

Run：`python deploy_auto.py --skip-build --skip-tests`
Expected: 上传 dist/.next/prisma → 远端 `migrate deploy` 应用 `20260628210000_university_dorm_life`（加 28 列）→ 三服务重启 → 预热 OK。

- [ ] **Step 3: 生产跑导入脚本**

把 `全国重点高校宿舍与设施情况汇总.xlsx` SFTP 到远端（或确认 `data/` 已同步），SSH 远端：
```bash
cd /home/ubuntu/apps/volunteer-helper/apps/server
pnpm import:university-dormitory --file=<远端xlsx路径> --dry-run   # 先核匹配率
pnpm import:university-dormitory --file=<远端xlsx路径>            # 正式
```
Expected: `完成：更新 N 所院校`。

- [ ] **Step 4: 生产验证**

登录生产老师端 `http://132.232.245.53:3004/teacher/plans/78`，点新按钮，确认打印页有真实宿舍生活数据。若读到空值且本地有数据 → 清 `cache:university:*` 后重试（[[post_deploy_clear_cache]]）。

---

## Self-Review（已核对）

- **Spec coverage**：Part A 28 列(Task 1)/导入(Task 2)/同步线上(Task 12)；Part B 端点(Task 4)/打印页(Task 9)/按钮(Task 10) 全覆盖。
- **类型一致性**：`DORM_FIELD_KEYS`(server 28) ↔ `DORM_FIELD_GROUPS`(web 28 key) 一一对应；`DormSheet`/`getDormSheet` 在 server 与 web types.ts 形状一致；`buildDormTitle`/`buildDormSheet` 命名贯穿。
- **无占位符**：所有代码步骤含完整代码，migration 时间戳已定 `20260628210000`。
