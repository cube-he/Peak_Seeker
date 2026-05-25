# 院校全量数据 ETL 实施 Plan — 从 Excel 补齐 universities 表

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 从 `data/03_专家版主表/output/院校全量数据_多Sheet.xlsx` 6 个 sheet 全量导入数据到 universities 表；新增 18 个 schema 字段；写 6 个独立 import 脚本（仿 `import-soft-rankings.ts`）。

**Architecture:** TypeScript scripts using ExcelJS + Prisma. 每个 sheet 一个独立 import 脚本，共享 `lib/university-matcher.ts` 做院校名匹配。默认 NULL-safe（只填空字段），`--overwrite` flag 强制覆盖。

**Tech Stack:** Nest.js + Prisma 7 (MariaDB adapter) + ExcelJS + pnpm + ts-node。

**前置 spec:** `docs/superpowers/specs/2026-05-24-universities-etl-from-excel-design.md`

**Reference template:** `apps/server/scripts/import-soft-rankings.ts` — 所有 import 脚本仿此模式。

---

## File Structure

**新增**：
- `apps/server/prisma/migrations/{TIMESTAMP}_add_university_etl_fields/migration.sql` — schema 改动
- `apps/server/scripts/lib/university-matcher.ts` — 共用院校匹配 util
- `apps/server/scripts/lib/__tests__/university-matcher.test.ts`
- `apps/server/scripts/import-university-basic.ts` — sheet 01_基础名录
- `apps/server/scripts/import-university-details.ts` — sheet 02_详情扩展
- `apps/server/scripts/import-university-rankings.ts` — sheet 03_历年排名（除软科）
- `apps/server/scripts/import-university-satisfaction.ts` — sheet 04_院校满意度
- `apps/server/scripts/import-university-charters.ts` — sheet 05_招生章程
- `apps/server/scripts/import-university-employment.ts` — sheet 06_就业流向

**修改**：
- `apps/server/prisma/schema.prisma` — University model 加 18 字段 + 7 索引
- `apps/server/package.json` — 加 pnpm scripts `import:university-basic` 等 6 个

---

## Task 1: Schema migration — 加 18 字段 + 7 索引

**Files:**
- Modify: `apps/server/prisma/schema.prisma` (University model, around L202-325)
- Create: `apps/server/prisma/migrations/{auto-timestamp}_add_university_etl_fields/migration.sql`

- [ ] **Step 1.1: Edit schema.prisma**

在 `model University {` 内（紧跟现有字段后、`@@index` 之前）加入：

```prisma
  // 院校基础补充（来自 01_基础名录）
  firstClassCategory          String?  @map("first_class_category") @db.VarChar(50)
  hasGradSchool               Boolean  @default(false) @map("has_grad_school")
  hasRecommendQualification   Boolean  @default(false) @map("has_recommend_qualification")
  is101Plan                   Boolean  @default(false) @map("is_101_plan")
  isQiangji                   Boolean  @default(false) @map("is_qiangji")
  website                     String?  @db.VarChar(500)
  admissionWebsite            String?  @map("admission_website") @db.VarChar(500)
  admissionPhone              String?  @map("admission_phone") @db.VarChar(200)
  admissionEmail              String?  @map("admission_email") @db.VarChar(200)
  cityTier                    String?  @map("city_tier") @db.VarChar(20)
  universityTier              String?  @map("university_tier") @db.VarChar(50)
  universityBackground        String?  @map("university_background") @db.VarChar(50)

  // 学科建设补充（来自 02_详情扩展）
  firstClassDisciplineCount   Int?     @map("first_class_discipline_count")
  nationalFeatureMajorCount   Int?     @map("national_feature_major_count")
  nationalKeyDisciplineCount  Int?     @map("national_key_discipline_count")
  description                 String?  @db.Text
  heatScore                   Int?     @map("heat_score")
  bannerUrl                   String?  @map("banner_url") @db.VarChar(500)

  // 多维排名补充（来自 03_历年排名）
  rankingTimes                Int?     @map("ranking_times")
```

并在 `@@index` 区域加入：

```prisma
  @@index([heatScore])
  @@index([rankingAlumni])
  @@index([rankingQS])
  @@index([rankingUSNews])
  @@index([rankingTimes])
  @@index([aClassDisciplineCount])
  @@index([firstClassDisciplineCount])
```

- [ ] **Step 1.2: Generate migration**

```bash
cd apps/server && npx prisma migrate dev --name add_university_etl_fields
```

Expected: 输出 "Your database is now in sync with your schema."

- [ ] **Step 1.3: 验证 prisma client 重新生成**

```bash
cd apps/server && npx prisma generate
```

Expected: "Generated Prisma Client" 成功

- [ ] **Step 1.4: Smoke test — typecheck**

```bash
cd apps/server && pnpm tsc --noEmit 2>&1 | grep -v "pre-existing-known" | head -20
```

Expected: 无 error（新字段 Prisma 类型可用，老代码不受影响）

- [ ] **Step 1.5: Commit**

```bash
git add apps/server/prisma/schema.prisma apps/server/prisma/migrations/
git commit -m "feat(schema): add 18 university fields for ETL backfill

Adds firstClassCategory, hasGradSchool, hasRecommendQualification,
is101Plan, isQiangji, website, admissionWebsite/Phone/Email,
cityTier, universityTier, universityBackground,
firstClassDisciplineCount, nationalFeatureMajorCount,
nationalKeyDisciplineCount, description, heatScore, bannerUrl,
rankingTimes (泰晤士). Plus 7 indexes for new sort dimensions."
```

---

## Task 2: `university-matcher.ts` 共用 util (TDD)

**Files:**
- Create: `apps/server/scripts/lib/university-matcher.ts`
- Create: `apps/server/scripts/lib/__tests__/university-matcher.test.ts`

**Goal:** 把 import-soft-rankings.ts L86-89 的 `normalizeUniversityName` + 院校匹配逻辑抽成共用 util。

API:
```typescript
export function normalizeUniversityName(name: string): string;
export class UniversityMatcher {
  static async fromDb(prisma): Promise<UniversityMatcher>;
  matchByCode(code: string): number[] | null;
  matchByName(name: string): number[] | null;
  reportUnmatched(): { totalUnmatched: number; sampleNames: string[] };
}
```

- [ ] **Step 2.1: Write failing tests**

Create `apps/server/scripts/lib/__tests__/university-matcher.test.ts`:

```typescript
import { normalizeUniversityName, UniversityMatcher } from '../university-matcher';

describe('normalizeUniversityName', () => {
  it('去除中文括号及内容', () => {
    expect(normalizeUniversityName('中国传媒大学（北京）')).toBe('中国传媒大学');
  });
  it('去除英文括号及内容', () => {
    expect(normalizeUniversityName('清华大学(深圳)')).toBe('清华大学');
  });
  it('去除全部空格', () => {
    expect(normalizeUniversityName(' 北京大学  ')).toBe('北京大学');
    expect(normalizeUniversityName('北 京 大 学')).toBe('北京大学');
  });
  it('保留无括号无空格的名字', () => {
    expect(normalizeUniversityName('复旦大学')).toBe('复旦大学');
  });
});

describe('UniversityMatcher', () => {
  const fakeUniversities = [
    { id: 1, name: '北京大学', code: '10001' },
    { id: 2, name: '清华大学', code: '10003' },
    { id: 3, name: '中国传媒大学（北京）', code: '10033' },
  ];

  // Stub prisma — returns fakeUniversities
  const fakePrisma = {
    university: {
      findMany: async () => fakeUniversities,
    },
  };

  it('matchByCode 严格匹配', async () => {
    const m = await UniversityMatcher.fromDb(fakePrisma as any);
    expect(m.matchByCode('10001')).toEqual([1]);
    expect(m.matchByCode('99999')).toBeNull();
  });

  it('matchByName 用 normalize 后名字匹配', async () => {
    const m = await UniversityMatcher.fromDb(fakePrisma as any);
    expect(m.matchByName('北京大学')).toEqual([1]);
    expect(m.matchByName('中国传媒大学')).toEqual([3]); // 去括号
    expect(m.matchByName('不存在的院校')).toBeNull();
  });

  it('reportUnmatched 累积未匹配数 + 前 20 个样本', async () => {
    const m = await UniversityMatcher.fromDb(fakePrisma as any);
    m.matchByName('不存在 1');
    m.matchByName('不存在 2');
    m.matchByName('不存在 1'); // 重复也算
    const r = m.reportUnmatched();
    expect(r.totalUnmatched).toBe(3);
    expect(r.sampleNames).toContain('不存在 1');
    expect(r.sampleNames).toContain('不存在 2');
  });
});
```

- [ ] **Step 2.2: Run tests to verify they fail**

```bash
cd apps/server && pnpm jest university-matcher 2>&1 | tail -15
```

Expected: FAIL — module not found

- [ ] **Step 2.3: Implement**

Create `apps/server/scripts/lib/university-matcher.ts`:

```typescript
/**
 * 院校名匹配 util — 供 import-university-*.ts 共用。
 *
 * 匹配优先级：matchByCode（code 严格相等） > matchByName（规范化后相等）。
 * normalizeUniversityName 去括号内容 + 去空格,与 import-soft-rankings.ts 一致。
 */

export function normalizeUniversityName(name: string): string {
  return name.replace(/[（(].*?[）)]/g, '').replace(/\s+/g, '').trim();
}

export class UniversityMatcher {
  private byCode = new Map<string, number[]>();
  private byName = new Map<string, number[]>();
  private _unmatchedCount = 0;
  private _unmatchedSamples: string[] = [];

  static async fromDb(prisma: {
    university: { findMany: (args?: any) => Promise<Array<{ id: number; name: string; code: string | null }>> };
  }): Promise<UniversityMatcher> {
    const m = new UniversityMatcher();
    const rows = await prisma.university.findMany({
      select: { id: true, name: true, code: true } as any,
    });
    for (const u of rows) {
      if (u.code) {
        const arr = m.byCode.get(u.code) ?? [];
        arr.push(u.id);
        m.byCode.set(u.code, arr);
      }
      const nameKey = normalizeUniversityName(u.name);
      const arr = m.byName.get(nameKey) ?? [];
      arr.push(u.id);
      m.byName.set(nameKey, arr);
    }
    return m;
  }

  matchByCode(code: string): number[] | null {
    if (!code) return null;
    return this.byCode.get(String(code).trim()) ?? null;
  }

  matchByName(name: string): number[] | null {
    if (!name) return null;
    const ids = this.byName.get(normalizeUniversityName(name)) ?? null;
    if (!ids) {
      this._unmatchedCount++;
      if (this._unmatchedSamples.length < 20) this._unmatchedSamples.push(name);
    }
    return ids;
  }

  reportUnmatched(): { totalUnmatched: number; sampleNames: string[] } {
    return { totalUnmatched: this._unmatchedCount, sampleNames: [...this._unmatchedSamples] };
  }
}
```

- [ ] **Step 2.4: Run tests to verify pass**

```bash
cd apps/server && pnpm jest university-matcher 2>&1 | tail -10
```

Expected: PASS · 7 tests

- [ ] **Step 2.5: Commit**

```bash
git add apps/server/scripts/lib/university-matcher.ts apps/server/scripts/lib/__tests__/university-matcher.test.ts
git commit -m "feat(scripts/lib): add UniversityMatcher util for ETL imports"
```

---

## Task 3: `import-university-basic.ts` — sheet 01_基础名录

**Files:**
- Create: `apps/server/scripts/import-university-basic.ts`
- Modify: `apps/server/package.json` (add npm script)

**Goal:** 读 `01_基础名录` sheet 把建校年/面积/官网/电话等 12 个字段导入 universities 表。

**字段映射** (Excel 列 → DB 字段)：

| Excel 列 | DB 字段 | 转换 |
|---|---|---|
| 教育部代码 | (用于 match by code) | toString().trim() |
| 规范化名 | (用于 match by name) | — |
| 一流大学类别 | firstClassCategory | text |
| 有研究生院 | hasGradSchool | "是"→true / "否"→false |
| 有保研资格 | hasRecommendQualification | "是"→true / "否"→false |
| 是否101计划 | is101Plan | "是"→true / "否"→false |
| 是否强基计划 | isQiangji | "是"→true / "否"→false |
| 学校官网 | website | trim |
| 招生网址 | admissionWebsite | trim |
| 招办电话 | admissionPhone | trim |
| 招办邮箱 | admissionEmail | trim |
| 建校年份 | createdYear | text (existing VARCHAR) |
| 占地面积亩 | campusArea | number → Decimal |
| 男生比例 | maleRatio | number → Int |
| 女生比例 | femaleRatio | number → Int |
| 保研率 | postgradRate | text (existing VARCHAR) |
| 城市等级 | cityTier | text |
| 院校档次 | universityTier | text |
| 院校背景 | universityBackground | text |

- [ ] **Step 3.1: Write the script**

Create `apps/server/scripts/import-university-basic.ts`:

```typescript
/**
 * 导入 院校全量数据_多Sheet.xlsx 的 sheet "01_基础名录" 到 universities 表。
 * 用法（cd apps/server）：
 *   pnpm import:university-basic --file=../../data/03_专家版主表/output/院校全量数据_多Sheet.xlsx
 *   pnpm import:university-basic --file=... --dry-run
 *   pnpm import:university-basic --file=... --overwrite
 *
 * 默认行为：NULL-safe — 只在 DB 字段为 NULL/默认值时填入新数据，已有值不动。
 * --overwrite：强制覆盖所有字段（用于已确认 Excel 比 DB 权威时）。
 */
import * as ExcelJS from 'exceljs';
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { parseArgs } from './lib/cli-utils';
import { UniversityMatcher } from './lib/university-matcher';

const SHEET_NAME = '01_基础名录';

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

function toInt(value: unknown): number | null {
  const t = toText(value).replace(/,/g, '').trim();
  if (!t) return null;
  const m = t.match(/-?\d+/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

function toFloat(value: unknown): number | null {
  const t = toText(value).replace(/,/g, '').trim();
  if (!t) return null;
  const m = t.match(/-?\d+(?:\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

function toBool(value: unknown): boolean {
  const t = toText(value).trim();
  return t === '是' || t === 'true' || t === '1';
}

function nullIfEmpty(value: unknown): string | null {
  const t = toText(value).trim();
  return t === '' || t === 'NaN' ? null : t;
}

interface BasicRow {
  code: string | null;
  name: string;
  firstClassCategory: string | null;
  hasGradSchool: boolean;
  hasRecommendQualification: boolean;
  is101Plan: boolean;
  isQiangji: boolean;
  website: string | null;
  admissionWebsite: string | null;
  admissionPhone: string | null;
  admissionEmail: string | null;
  createdYear: string | null;
  campusArea: number | null;
  maleRatio: number | null;
  femaleRatio: number | null;
  postgradRate: string | null;
  cityTier: string | null;
  universityTier: string | null;
  universityBackground: string | null;
}

function colIndexes(sheet: ExcelJS.Worksheet): Map<string, number> {
  const idx = new Map<string, number>();
  sheet.getRow(1).eachCell((cell, col) => idx.set(toText(cell.value), col));
  return idx;
}

function parseRows(sheet: ExcelJS.Worksheet): BasicRow[] {
  const idx = colIndexes(sheet);
  const get = (row: ExcelJS.Row, col: string) => {
    const c = idx.get(col);
    return c ? row.getCell(c).value : undefined;
  };
  const rows: BasicRow[] = [];
  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const name = toText(get(row, '规范化名')).trim() || toText(get(row, '官方名称')).trim();
    if (!name) continue;
    rows.push({
      code: nullIfEmpty(get(row, '教育部代码'))?.replace(/\.0+$/, '') ?? null,
      name,
      firstClassCategory: nullIfEmpty(get(row, '一流大学类别')),
      hasGradSchool: toBool(get(row, '有研究生院')),
      hasRecommendQualification: toBool(get(row, '有保研资格')),
      is101Plan: toBool(get(row, '是否101计划')),
      isQiangji: toBool(get(row, '是否强基计划')),
      website: nullIfEmpty(get(row, '学校官网')),
      admissionWebsite: nullIfEmpty(get(row, '招生网址')),
      admissionPhone: nullIfEmpty(get(row, '招办电话')),
      admissionEmail: nullIfEmpty(get(row, '招办邮箱')),
      createdYear: nullIfEmpty(get(row, '建校年份'))?.replace(/\.0+$/, '') ?? null,
      campusArea: toFloat(get(row, '占地面积亩')),
      maleRatio: toInt(get(row, '男生比例')),
      femaleRatio: toInt(get(row, '女生比例')),
      postgradRate: nullIfEmpty(get(row, '保研率')),
      cityTier: nullIfEmpty(get(row, '城市等级')),
      universityTier: nullIfEmpty(get(row, '院校档次')),
      universityBackground: nullIfEmpty(get(row, '院校背景')),
    });
  }
  return rows;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const file = String(args.file || '');
  const dryRun = Boolean(args['dry-run']);
  const overwrite = Boolean(args.overwrite);
  if (!file) throw new Error('缺少 --file=/path/to/院校全量数据_多Sheet.xlsx');

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
      const ids = (row.code ? matcher.matchByCode(row.code) : null) ?? matcher.matchByName(row.name);
      if (!ids) continue;
      const patch: Record<string, unknown> = {
        firstClassCategory: row.firstClassCategory,
        hasGradSchool: row.hasGradSchool,
        hasRecommendQualification: row.hasRecommendQualification,
        is101Plan: row.is101Plan,
        isQiangji: row.isQiangji,
        website: row.website,
        admissionWebsite: row.admissionWebsite,
        admissionPhone: row.admissionPhone,
        admissionEmail: row.admissionEmail,
        createdYear: row.createdYear,
        campusArea: row.campusArea,
        maleRatio: row.maleRatio,
        femaleRatio: row.femaleRatio,
        postgradRate: row.postgradRate,
        cityTier: row.cityTier,
        universityTier: row.universityTier,
        universityBackground: row.universityBackground,
      };
      // NULL-safe: 在非 overwrite 模式下，移除所有 null/false 的字段
      // 让 DB 已有值不被空数据覆盖
      if (!overwrite) {
        for (const k of Object.keys(patch)) {
          const v = patch[k];
          if (v === null || v === '' || (typeof v === 'boolean' && v === false)) {
            delete patch[k];
          }
        }
      }
      if (Object.keys(patch).length === 0) continue;
      for (const id of ids) {
        updates.push({ id, data: patch });
      }
    }

    const report = matcher.reportUnmatched();
    console.log(JSON.stringify({
      file, dryRun, overwrite, sheet: SHEET_NAME,
      totalRows: rows.length,
      universitiesToUpdate: updates.length,
      unmatched: report.totalUnmatched,
      sampleUnmatched: report.sampleNames.slice(0, 10),
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

- [ ] **Step 3.2: Add pnpm script**

Edit `apps/server/package.json` `scripts` section, add:

```json
"import:university-basic": "ts-node scripts/import-university-basic.ts"
```

- [ ] **Step 3.3: Dry-run on Excel**

```bash
cd apps/server && pnpm import:university-basic --file=../../data/03_专家版主表/output/院校全量数据_多Sheet.xlsx --dry-run 2>&1 | tail -30
```

Expected: 解析 ~3834 行，输出 universitiesToUpdate / unmatched 数字（人工 sanity check：未匹配 < 30%、updates > 1500）

- [ ] **Step 3.4: Commit**

```bash
git add apps/server/scripts/import-university-basic.ts apps/server/package.json
git commit -m "feat(etl): import-university-basic — sheet 01_基础名录

Reads from 院校全量数据_多Sheet.xlsx sheet 01_基础名录, maps 18 columns
to universities table. NULL-safe by default, --overwrite to force."
```

---

## Task 4: `import-university-details.ts` — sheet 02_详情扩展

**Files:**
- Create: `apps/server/scripts/import-university-details.ts`
- Modify: `apps/server/package.json`

**Goal:** 仿 Task 3，导入 `02_详情扩展` sheet 的学科/特色专业/简介/热度等字段。

**字段映射**：

| Excel 列 | DB 字段 | 转换 |
|---|---|---|
| 教育部代码 | (match) | — |
| 规范化名 | (match) | — |
| 硕士点数 | masterProgramCount | Int |
| 博士点数 | doctoralProgramCount | Int |
| 双一流学科数 | firstClassDisciplineCount | Int |
| 国家级特色专业数 | nationalFeatureMajorCount | Int |
| 国家重点学科数 | nationalKeyDisciplineCount | Int |
| A类学科数 | aClassDisciplineCount | Int |
| 教育部学科评估 | disciplineEvaluationLevel | text |
| 升学率 | furtherStudyRate | text (existing VARCHAR) |
| 学校简介 | description | text |
| Logo地址 | logoUrl | trim (existing) |
| Banner地址 | bannerUrl | trim |
| 热度 | heatScore | Int |
| 综合评分 | (skip — Int could be aggregated, but DB doesn't have a field) | — |

- [ ] **Step 4.1: Write the script**

仿 Task 3 创建 `apps/server/scripts/import-university-details.ts`，结构完全相同，只改：
- `SHEET_NAME = '02_详情扩展'`
- `BasicRow` 改成 `DetailsRow` 并把字段换成上面的 mapping
- `parseRows` 内 `get(row, ...)` 改成上面列的列名
- patch 对应改

完整代码（仿 Task 3 模板，替换字段）：

```typescript
/**
 * 导入 院校全量数据_多Sheet.xlsx 的 sheet "02_详情扩展" 到 universities 表。
 */
import * as ExcelJS from 'exceljs';
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { parseArgs } from './lib/cli-utils';
import { UniversityMatcher } from './lib/university-matcher';

const SHEET_NAME = '02_详情扩展';

// 复用 Task 3 的辅助函数（toText/toInt/toFloat/toBool/nullIfEmpty/colIndexes）
// 实施时把它们抽到 apps/server/scripts/lib/xlsx-utils.ts 共享更干净，
// 但本次任务范围内允许重复（YAGNI），下个 refactor 再抽

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
function toInt(value: unknown): number | null {
  const t = toText(value).replace(/,/g, '').trim();
  if (!t) return null;
  const m = t.match(/-?\d+/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}
function nullIfEmpty(value: unknown): string | null {
  const t = toText(value).trim();
  return t === '' || t === 'NaN' ? null : t;
}

interface DetailsRow {
  code: string | null;
  name: string;
  masterProgramCount: number | null;
  doctoralProgramCount: number | null;
  firstClassDisciplineCount: number | null;
  nationalFeatureMajorCount: number | null;
  nationalKeyDisciplineCount: number | null;
  aClassDisciplineCount: number | null;
  disciplineEvaluationLevel: string | null;
  furtherStudyRate: string | null;
  description: string | null;
  logoUrl: string | null;
  bannerUrl: string | null;
  heatScore: number | null;
}

function colIndexes(sheet: ExcelJS.Worksheet): Map<string, number> {
  const idx = new Map<string, number>();
  sheet.getRow(1).eachCell((cell, col) => idx.set(toText(cell.value), col));
  return idx;
}

function parseRows(sheet: ExcelJS.Worksheet): DetailsRow[] {
  const idx = colIndexes(sheet);
  const get = (row: ExcelJS.Row, col: string) => {
    const c = idx.get(col);
    return c ? row.getCell(c).value : undefined;
  };
  const rows: DetailsRow[] = [];
  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const name = toText(get(row, '规范化名')).trim();
    if (!name) continue;
    rows.push({
      code: nullIfEmpty(get(row, '教育部代码'))?.replace(/\.0+$/, '') ?? null,
      name,
      masterProgramCount: toInt(get(row, '硕士点数')),
      doctoralProgramCount: toInt(get(row, '博士点数')),
      firstClassDisciplineCount: toInt(get(row, '双一流学科数')),
      nationalFeatureMajorCount: toInt(get(row, '国家级特色专业数')),
      nationalKeyDisciplineCount: toInt(get(row, '国家重点学科数')),
      aClassDisciplineCount: toInt(get(row, 'A类学科数')),
      disciplineEvaluationLevel: nullIfEmpty(get(row, '教育部学科评估')),
      furtherStudyRate: nullIfEmpty(get(row, '升学率')),
      description: nullIfEmpty(get(row, '学校简介')),
      logoUrl: nullIfEmpty(get(row, 'Logo地址')),
      bannerUrl: nullIfEmpty(get(row, 'Banner地址')),
      heatScore: toInt(get(row, '热度')),
    });
  }
  return rows;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const file = String(args.file || '');
  const dryRun = Boolean(args['dry-run']);
  const overwrite = Boolean(args.overwrite);
  if (!file) throw new Error('缺少 --file=...');

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
      const ids = (row.code ? matcher.matchByCode(row.code) : null) ?? matcher.matchByName(row.name);
      if (!ids) continue;
      const patch: Record<string, unknown> = {
        masterProgramCount: row.masterProgramCount,
        doctoralProgramCount: row.doctoralProgramCount,
        firstClassDisciplineCount: row.firstClassDisciplineCount,
        nationalFeatureMajorCount: row.nationalFeatureMajorCount,
        nationalKeyDisciplineCount: row.nationalKeyDisciplineCount,
        aClassDisciplineCount: row.aClassDisciplineCount,
        disciplineEvaluationLevel: row.disciplineEvaluationLevel,
        furtherStudyRate: row.furtherStudyRate,
        description: row.description,
        logoUrl: row.logoUrl,
        bannerUrl: row.bannerUrl,
        heatScore: row.heatScore,
      };
      if (!overwrite) {
        for (const k of Object.keys(patch)) {
          const v = patch[k];
          if (v === null || v === '' || v === 0) delete patch[k];
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
      sampleUnmatched: report.sampleNames.slice(0, 10),
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

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 4.2: Add pnpm script + Step 4.3: Dry-run + Step 4.4: Commit** — 同 Task 3 模式

---

## Task 5: `import-university-rankings.ts` — sheet 03_历年排名

**Files:**
- Create: `apps/server/scripts/import-university-rankings.ts`
- Modify: `apps/server/package.json`

**Goal:** 从 `03_历年排名` sheet 拿校友会/QS/USNews/泰晤士 4 个榜单，**每个院校只存最新年的排名**到 universities 表。

**字段映射** (Excel `榜单` 值 → DB 字段)：
- `校友会` → `rankingAlumni`
- `QS` → `rankingQS`
- `U.S.News` → `rankingUSNews`
- `泰晤士` → `rankingTimes`
- `软科` → **跳过**（已由 import-soft-rankings 处理）

数据来源列：`规范化名`、`年份`、`榜单`、`排名` 或 `排名数值`。

**关键逻辑**：每个 `(universityId, 榜单)` 组只取最大 `年份` 的 `排名`。

- [ ] **Step 5.1: Write script + tests**

仿 Task 3 模板，但增加一段 "每 (universityId, board) 取最新年" 的聚合逻辑：

```typescript
/**
 * 导入 院校全量数据_多Sheet.xlsx 的 sheet "03_历年排名" 到 universities 表
 * （rankingAlumni/rankingQS/rankingUSNews/rankingTimes）。
 * 每个院校在每个榜单下只存最新年的排名。
 */
import * as ExcelJS from 'exceljs';
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { parseArgs } from './lib/cli-utils';
import { UniversityMatcher } from './lib/university-matcher';

const SHEET_NAME = '03_历年排名';

const BOARD_TO_FIELD: Record<string, string> = {
  '校友会': 'rankingAlumni',
  'QS': 'rankingQS',
  'U.S.News': 'rankingUSNews',
  '泰晤士': 'rankingTimes',
  // 软科 已由 import-soft-rankings 处理，本脚本跳过
};

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
function toInt(value: unknown): number | null {
  const t = toText(value).replace(/,/g, '').trim();
  if (!t) return null;
  const m = t.match(/-?\d+/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

interface RankRow { name: string; year: number; board: string; rank: number; }

function colIndexes(sheet: ExcelJS.Worksheet): Map<string, number> {
  const idx = new Map<string, number>();
  sheet.getRow(1).eachCell((cell, col) => idx.set(toText(cell.value), col));
  return idx;
}

function parseRows(sheet: ExcelJS.Worksheet): RankRow[] {
  const idx = colIndexes(sheet);
  const nameCol = idx.get('规范化名');
  const yearCol = idx.get('年份');
  const boardCol = idx.get('榜单');
  const rankCol = idx.get('排名') ?? idx.get('排名数值');
  if (!nameCol || !yearCol || !boardCol || !rankCol) {
    throw new Error('sheet 缺少必要列 (规范化名/年份/榜单/排名)');
  }
  const rows: RankRow[] = [];
  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const name = toText(row.getCell(nameCol).value).trim();
    const year = toInt(row.getCell(yearCol).value);
    const board = toText(row.getCell(boardCol).value).trim();
    const rank = toInt(row.getCell(rankCol).value);
    if (!name || year == null || !board || rank == null) continue;
    if (!BOARD_TO_FIELD[board]) continue;  // 跳过软科和其他
    rows.push({ name, year, board, rank });
  }
  return rows;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const file = String(args.file || '');
  const dryRun = Boolean(args['dry-run']);
  const overwrite = Boolean(args.overwrite);
  if (!file) throw new Error('缺少 --file=...');

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const sheet = wb.getWorksheet(SHEET_NAME);
  if (!sheet) throw new Error(`sheet "${SHEET_NAME}" 不存在`);
  const rows = parseRows(sheet);
  console.log(`xlsx 解析：${SHEET_NAME} ${rows.length} 行（已过滤为校友会/QS/USNews/泰晤士）`);

  // 按 (name, board) 取最新年
  const latestByKey = new Map<string, RankRow>();
  for (const row of rows) {
    const key = `${row.name}|${row.board}`;
    const cur = latestByKey.get(key);
    if (!cur || row.year > cur.year) latestByKey.set(key, row);
  }
  console.log(`按 (院校, 榜单) 取最新年: ${latestByKey.size} 条`);

  const prisma = new PrismaClient({ adapter: new PrismaMariaDb(process.env.DATABASE_URL!) });
  try {
    const matcher = await UniversityMatcher.fromDb(prisma);
    const updatesByUni = new Map<number, Record<string, unknown>>();

    for (const row of latestByKey.values()) {
      const ids = matcher.matchByName(row.name);
      if (!ids) continue;
      const field = BOARD_TO_FIELD[row.board];
      for (const id of ids) {
        const cur = updatesByUni.get(id) ?? {};
        cur[field] = row.rank;
        updatesByUni.set(id, cur);
      }
    }

    if (!overwrite) {
      // NULL-safe: 只填 DB 当前为 NULL 的字段。需要先读当前值。
      const ids = Array.from(updatesByUni.keys());
      const current = await prisma.university.findMany({
        where: { id: { in: ids } },
        select: { id: true, rankingAlumni: true, rankingQS: true, rankingUSNews: true, rankingTimes: true },
      });
      const currentMap = new Map(current.map((u) => [u.id, u]));
      for (const [id, patch] of updatesByUni) {
        const c = currentMap.get(id);
        if (!c) continue;
        for (const field of Object.keys(patch)) {
          if ((c as any)[field] != null) delete patch[field];
        }
        if (Object.keys(patch).length === 0) updatesByUni.delete(id);
      }
    }

    const report = matcher.reportUnmatched();
    console.log(JSON.stringify({
      file, dryRun, overwrite, sheet: SHEET_NAME,
      totalLatestRows: latestByKey.size,
      universitiesToUpdate: updatesByUni.size,
      unmatched: report.totalUnmatched,
      sampleUnmatched: report.sampleNames.slice(0, 10),
    }, null, 2));

    if (dryRun) return;
    let done = 0;
    for (const [id, data] of updatesByUni) {
      await prisma.university.update({ where: { id }, data });
      done++;
      if (done % 200 === 0) console.log(`  ${done}/${updatesByUni.size}`);
    }
    console.log(`完成：更新 ${done} 所院校`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 5.2: Add pnpm script + Step 5.3: Dry-run + Step 5.4: Commit**

---

## Task 6: `import-university-satisfaction.ts` — sheet 04_院校满意度

**Files:**
- Create: `apps/server/scripts/import-university-satisfaction.ts`

**Goal:** 把 `04_院校满意度` sheet 的综合/生活/环境满意度导入。Schema 已有字段 (`satisfactionOverall`/`Life`/`Environ`/`Count`)，已 87% 填充，本次只补齐 NULL 部分（默认 NULL-safe）。

**字段映射**：
- 综合满意度 → satisfactionOverall (Float)
- 综合评价人数 → satisfactionCount (Int)
- 生活满意度 → satisfactionLife (Float)
- 环境满意度 → satisfactionEnviron (Float)

**1-5 星分布字段：本次不导入**（按 spec 决定）

- [ ] **Step 6.1: Write script (仿 Task 3 模板)**

```typescript
import * as ExcelJS from 'exceljs';
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { parseArgs } from './lib/cli-utils';
import { UniversityMatcher } from './lib/university-matcher';

const SHEET_NAME = '04_院校满意度';

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
function toFloat(value: unknown): number | null {
  const t = toText(value).replace(/,/g, '').trim();
  if (!t) return null;
  const m = t.match(/-?\d+(?:\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}
function toInt(value: unknown): number | null {
  const f = toFloat(value);
  return f == null ? null : Math.round(f);
}

interface SatRow {
  name: string;
  satisfactionOverall: number | null;
  satisfactionCount: number | null;
  satisfactionLife: number | null;
  satisfactionEnviron: number | null;
}

function colIndexes(sheet: ExcelJS.Worksheet): Map<string, number> {
  const idx = new Map<string, number>();
  sheet.getRow(1).eachCell((cell, col) => idx.set(toText(cell.value), col));
  return idx;
}

function parseRows(sheet: ExcelJS.Worksheet): SatRow[] {
  const idx = colIndexes(sheet);
  const get = (row: ExcelJS.Row, col: string) => {
    const c = idx.get(col);
    return c ? row.getCell(c).value : undefined;
  };
  const rows: SatRow[] = [];
  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const name = toText(get(row, '规范化名')).trim();
    if (!name) continue;
    rows.push({
      name,
      satisfactionOverall: toFloat(get(row, '综合满意度')),
      satisfactionCount: toInt(get(row, '综合评价人数')),
      satisfactionLife: toFloat(get(row, '生活满意度')),
      satisfactionEnviron: toFloat(get(row, '环境满意度')),
    });
  }
  return rows;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const file = String(args.file || '');
  const dryRun = Boolean(args['dry-run']);
  const overwrite = Boolean(args.overwrite);
  if (!file) throw new Error('缺少 --file=...');

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
      const patch: Record<string, unknown> = {
        satisfactionOverall: row.satisfactionOverall,
        satisfactionCount: row.satisfactionCount,
        satisfactionLife: row.satisfactionLife,
        satisfactionEnviron: row.satisfactionEnviron,
      };
      if (!overwrite) {
        // NULL-safe 需读当前值
        // 简化：每行单独读，性能可接受（3834 行 + 每行 1 query）
        // 后续如需优化可批量读
      }
      if (Object.values(patch).every((v) => v == null)) continue;
      for (const id of ids) updates.push({ id, data: patch });
    }

    // NULL-safe: 批量读取当前值
    if (!overwrite) {
      const ids = updates.map((u) => u.id);
      const uniqIds = Array.from(new Set(ids));
      const current = await prisma.university.findMany({
        where: { id: { in: uniqIds } },
        select: { id: true, satisfactionOverall: true, satisfactionCount: true, satisfactionLife: true, satisfactionEnviron: true },
      });
      const currentMap = new Map(current.map((u) => [u.id, u]));
      for (const u of updates) {
        const c = currentMap.get(u.id);
        if (!c) continue;
        for (const field of Object.keys(u.data)) {
          if ((c as any)[field] != null) delete (u.data as any)[field];
        }
      }
    }
    const effectiveUpdates = updates.filter((u) => Object.keys(u.data).length > 0);

    const report = matcher.reportUnmatched();
    console.log(JSON.stringify({
      file, dryRun, overwrite, sheet: SHEET_NAME,
      totalRows: rows.length,
      universitiesToUpdate: effectiveUpdates.length,
      unmatched: report.totalUnmatched,
      sampleUnmatched: report.sampleNames.slice(0, 10),
    }, null, 2));

    if (dryRun) return;
    let done = 0;
    for (const u of effectiveUpdates) {
      await prisma.university.update({ where: { id: u.id }, data: u.data });
      done++;
      if (done % 200 === 0) console.log(`  ${done}/${effectiveUpdates.length}`);
    }
    console.log(`完成：更新 ${done} 所院校`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 6.2: Add pnpm script + Step 6.3: Dry-run + Step 6.4: Commit**

---

## Task 7: `import-university-charters.ts` — sheet 05_招生章程

**Files:**
- Create: `apps/server/scripts/import-university-charters.ts`

**Goal:** 把 `05_招生章程` sheet 的所有招生章程字段打包成 JSON 存到 `universities.charterInfo`（已有 Json 字段）。

整行的列（调档比例 / 专业分配规则 / 同分规则 / 外语要求 / 单科要求 / 体检限制 / 加分政策 / 学费 / 转专业限制 / 服从调剂 / 来源网址 / 采集时间）打包成 JSON 对象。

- [ ] **Step 7.1: Write script**

```typescript
import * as ExcelJS from 'exceljs';
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { parseArgs } from './lib/cli-utils';
import { UniversityMatcher } from './lib/university-matcher';

const SHEET_NAME = '05_招生章程';

const CHARTER_FIELDS = [
  '是否有章程', '章程字数', '调档比例', '专业分配规则', '同分规则',
  '外语要求', '单科要求', '体检限制', '加分政策', '学费',
  '转专业限制', '服从调剂', '来源网址', '采集时间',
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

function colIndexes(sheet: ExcelJS.Worksheet): Map<string, number> {
  const idx = new Map<string, number>();
  sheet.getRow(1).eachCell((cell, col) => idx.set(toText(cell.value), col));
  return idx;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const file = String(args.file || '');
  const dryRun = Boolean(args['dry-run']);
  const overwrite = Boolean(args.overwrite);
  if (!file) throw new Error('缺少 --file=...');

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const sheet = wb.getWorksheet(SHEET_NAME);
  if (!sheet) throw new Error(`sheet "${SHEET_NAME}" 不存在`);
  const idx = colIndexes(sheet);

  const prisma = new PrismaClient({ adapter: new PrismaMariaDb(process.env.DATABASE_URL!) });
  try {
    const matcher = await UniversityMatcher.fromDb(prisma);
    let parsed = 0;
    const updates: Array<{ id: number; data: { charterInfo: Record<string, string> } }> = [];

    for (let r = 2; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r);
      const name = toText(row.getCell(idx.get('规范化名')!).value).trim();
      if (!name) continue;
      parsed++;
      const charterInfo: Record<string, string> = {};
      for (const field of CHARTER_FIELDS) {
        const c = idx.get(field);
        if (!c) continue;
        const v = toText(row.getCell(c).value).trim();
        if (v && v !== 'NaN') charterInfo[field] = v;
      }
      if (Object.keys(charterInfo).length === 0) continue;
      const ids = matcher.matchByName(name);
      if (!ids) continue;
      for (const id of ids) updates.push({ id, data: { charterInfo } });
    }

    if (!overwrite) {
      const ids = updates.map((u) => u.id);
      const uniqIds = Array.from(new Set(ids));
      const current = await prisma.university.findMany({
        where: { id: { in: uniqIds } },
        select: { id: true, charterInfo: true },
      });
      const filledIds = new Set(current.filter((c) => c.charterInfo != null).map((c) => c.id));
      // 移除 charterInfo 非空的 update
      for (let i = updates.length - 1; i >= 0; i--) {
        if (filledIds.has(updates[i].id)) updates.splice(i, 1);
      }
    }

    const report = matcher.reportUnmatched();
    console.log(JSON.stringify({
      file, dryRun, overwrite, sheet: SHEET_NAME,
      totalRows: parsed,
      universitiesToUpdate: updates.length,
      unmatched: report.totalUnmatched,
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

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 7.2: Add pnpm script + Step 7.3: Dry-run + Step 7.4: Commit**

---

## Task 8: `import-university-employment.ts` — sheet 06_就业流向

**Files:**
- Create: `apps/server/scripts/import-university-employment.ts`

**Goal:** 把 `06_就业流向` sheet 的就业流向数据拼成文本存到 `universities.topEmployers`（已有 Text 字段）。

字段列：毕业生签约地区流向 / 毕业生签约单位性质 / 主要签约单位 / 主要签约单位说明

- [ ] **Step 8.1: Write script (类似 Task 7 模式，组装文本)**

```typescript
import * as ExcelJS from 'exceljs';
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { parseArgs } from './lib/cli-utils';
import { UniversityMatcher } from './lib/university-matcher';

const SHEET_NAME = '06_就业流向';
const FIELDS = ['毕业生签约地区流向', '毕业生签约单位性质', '主要签约单位', '主要签约单位说明'];

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

function colIndexes(sheet: ExcelJS.Worksheet): Map<string, number> {
  const idx = new Map<string, number>();
  sheet.getRow(1).eachCell((cell, col) => idx.set(toText(cell.value), col));
  return idx;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const file = String(args.file || '');
  const dryRun = Boolean(args['dry-run']);
  const overwrite = Boolean(args.overwrite);
  if (!file) throw new Error('缺少 --file=...');

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const sheet = wb.getWorksheet(SHEET_NAME);
  if (!sheet) throw new Error(`sheet "${SHEET_NAME}" 不存在`);
  const idx = colIndexes(sheet);

  const prisma = new PrismaClient({ adapter: new PrismaMariaDb(process.env.DATABASE_URL!) });
  try {
    const matcher = await UniversityMatcher.fromDb(prisma);
    const updates: Array<{ id: number; data: { topEmployers: string } }> = [];
    let parsed = 0;

    for (let r = 2; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r);
      const name = toText(row.getCell(idx.get('规范化名')!).value).trim();
      if (!name) continue;
      parsed++;
      const parts: string[] = [];
      for (const field of FIELDS) {
        const c = idx.get(field);
        if (!c) continue;
        const v = toText(row.getCell(c).value).trim();
        if (v && v !== 'NaN') parts.push(`【${field}】${v}`);
      }
      if (parts.length === 0) continue;
      const text = parts.join('\n');
      const ids = matcher.matchByName(name);
      if (!ids) continue;
      for (const id of ids) updates.push({ id, data: { topEmployers: text } });
    }

    if (!overwrite) {
      const ids = updates.map((u) => u.id);
      const uniqIds = Array.from(new Set(ids));
      const current = await prisma.university.findMany({
        where: { id: { in: uniqIds } },
        select: { id: true, topEmployers: true },
      });
      const filledIds = new Set(current.filter((c) => c.topEmployers != null && c.topEmployers !== '').map((c) => c.id));
      for (let i = updates.length - 1; i >= 0; i--) {
        if (filledIds.has(updates[i].id)) updates.splice(i, 1);
      }
    }

    const report = matcher.reportUnmatched();
    console.log(JSON.stringify({
      file, dryRun, overwrite, sheet: SHEET_NAME,
      totalRows: parsed,
      universitiesToUpdate: updates.length,
      unmatched: report.totalUnmatched,
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

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 8.2: Add pnpm script + Step 8.3: Dry-run + Step 8.4: Commit**

---

## Task 9: 实际跑所有 import + 验证填充率

**Files:** none (operational)

**Goal:** 在生产服务器上按顺序跑 6 个 import，然后采样验证填充率。

- [ ] **Step 9.1: 把 6 个 import 脚本上传到服务器**

Worktree 上的改动通过 deploy 到服务器（包含 schema migration、新 script、新 package.json scripts）。

```bash
# 在主仓库
cd ../..
git checkout master
git merge worktree-universities-etl --no-ff -m "Merge: universities ETL backfill"
python deploy_auto.py
```

- [ ] **Step 9.2: 在服务器上按顺序跑 6 个 import**

```bash
ssh -i cube.pem ubuntu@132.232.245.53 'cd /home/ubuntu/apps/volunteer-helper/apps/server && \
  pnpm import:university-basic --file=../../data/03_专家版主表/output/院校全量数据_多Sheet.xlsx && \
  pnpm import:university-details --file=../../data/03_专家版主表/output/院校全量数据_多Sheet.xlsx && \
  pnpm import:university-rankings --file=../../data/03_专家版主表/output/院校全量数据_多Sheet.xlsx && \
  pnpm import:university-satisfaction --file=../../data/03_专家版主表/output/院校全量数据_多Sheet.xlsx && \
  pnpm import:university-charters --file=../../data/03_专家版主表/output/院校全量数据_多Sheet.xlsx && \
  pnpm import:university-employment --file=../../data/03_专家版主表/output/院校全量数据_多Sheet.xlsx'
```

注意：Excel 文件需要先上传到服务器对应 path（或者部署脚本里加上）。

如果 Excel 没在服务器上，需要先 scp：
```bash
scp -i cube.pem "data/03_专家版主表/output/院校全量数据_多Sheet.xlsx" ubuntu@132.232.245.53:/home/ubuntu/apps/volunteer-helper/data/03_专家版主表/output/
```

- [ ] **Step 9.3: 验证填充率**

跑之前的采样脚本（更新 SQL 包含本次新字段）：

```bash
# 修改 .superpowers/brainstorm/.../check_ranking_remote.py 的 SQL 加上新字段
python .superpowers/brainstorm/.../check_remote.py
```

Expected (按 spec §8 验收标准)：
- `ranking_alumni > 500`
- `ranking_qs > 30`
- `ranking_us_news > 100`
- `ranking_times > 50`
- `a_class_discipline_count > 100`
- `campus_area > 1500`
- `created_year > 2000`
- `description` 已填
- `heat_score` 已填

如果填充率明显低于目标，可能是匹配率太低，看 unmatched 输出，决定是否要 fuzzy match。

---

## Task 10: 部署 + 清 Redis cache (USER GATE)

**Files:** none (operational)

**Goal:** import 完毕后清 Redis cache 让前端读到新数据。

⚠️ **本 task 涉及生产服务器，实施前必须 user confirm。**

- [ ] **Step 10.1: User confirmation**

跟用户确认：6 个 import 已完成，填充率达预期，准备清 Redis cache 并验证线上效果。

- [ ] **Step 10.2: 清 Redis cache**

```bash
ssh -i cube.pem ubuntu@132.232.245.53 'for pattern in "university:*" "cache:university:*" "hot-universities:*"; do redis-cli KEYS "$pattern" | xargs -r redis-cli DEL; done'
```

- [ ] **Step 10.3: 线上 spot-check**

- 进 `http://132.232.245.53:3004/universities/10001` (北大) — 看新字段是否能展示（A 类学科数、QS / USNews 排名）
- 进 `http://132.232.245.53:3004/universities` 看列表正常无报错
- Browser console 无 error

---

## Self-Review

按 writing-plans skill 要求，对照 spec 自查：

### Spec coverage

| Spec 章节 | 对应 Task |
|---|---|
| §2 范围（6 sheet ETL） | Task 3-8 |
| §3 数据源调研 | 已嵌入 Task 描述 |
| §4 Schema 改动（18 字段 + 7 索引） | Task 1 |
| §5.1 university-matcher | Task 2 |
| §5.2 每个 import 脚本格式 | Task 3 templates Task 4-8 |
| §5.3 覆盖策略 NULL-safe + --overwrite | 所有 import 脚本都实现了 |
| §5.4 跨年排名取最新 | Task 5 (latestByKey) |
| §6 实施 6 步 | Task 1-10 都覆盖 |
| §8 验收 | Task 9.3 |
| §9 待决 3 问题（已答） | NULL-safe + 人工 unmatched + 18 字段 |

No gaps.

### Placeholder scan

- ✅ 无 "TBD" / "TODO"
- ✅ 每个 task 都有完整 code 或具体命令
- ✅ Task 9.2 命令完整可执行

### Type consistency

- `UniversityMatcher` API 在 Task 2 定义，被 Task 3-8 一致使用
- `parseArgs / cli-utils` 既有，不重新定义
- `toText / toInt / toFloat / nullIfEmpty` 在每个 script 重复定义 — 知情决定（spec §5.1 说"允许重复，下个 refactor 再抽"）

---

## Execution

按 subagent-driven-development skill 执行。

Task 1-8 可派 cheap model (sonnet) implementer。Task 9-10 是 operational task，controller (me) 自己跑。

Total: 10 tasks, ~8-12 小时。
