# 软科院校排名落地 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把软科 2026 排名数据落地到 `/universities` 院校库页面（优化项 #1-4：类别排名、软科排序、专科/民办补全、卡片口径正名）。

**Architecture:** `University` 表加 4 个排名字段（复用已有 `softRanking`）；新增 xlsx 导入脚本；后端 `findAll` 加按软科排名排序；前端卡片排名口径正名 + 类别排名展示。

**Tech Stack:** Prisma 7 / MariaDB / NestJS（后端）；exceljs（读 xlsx）；Next.js 14 / React 18 / antd（前端）；Jest。

**对应设计文档:** `docs/superpowers/specs/2026-05-22-soft-rankings-design.md`

**测试命令:** 后端在 `apps/server` 跑 `pnpm test -- <pattern>`；前端在 `apps/web` 跑 `pnpm test -- <pattern>`。`pnpm` 在本机 PowerShell 被执行策略拦截，用 bash 执行。

---

## 文件结构

**新建:**
- `apps/server/scripts/import-soft-rankings.ts` — 软科排名 xlsx 导入脚本

**修改:**
- `apps/server/prisma/schema.prisma` — `University` 加 4 个软科排名字段
- `apps/server/prisma/migrations/20260522000000_add_university_soft_ranking_fields/migration.sql`（新建迁移）
- `apps/server/package.json` — 新增 `import:soft-rankings` npm script
- `apps/server/src/modules/university/dto/query-university.dto.ts` — `sortBy` 加 `softRank`
- `apps/server/src/modules/university/university.service.ts` — `findAll` 排序映射
- `apps/server/src/modules/university/university.service.spec.ts` — 测试扩充
- `apps/web/src/services/university.ts` — `UniversityListItem` 加字段
- `apps/web/src/app/(main)/universities/components/UniversityListTab.tsx` — 卡片排名展示 + 排序项

---

## Task 1: schema 新增软科排名字段

**Files:**
- Modify: `apps/server/prisma/schema.prisma`
- 生成: `apps/server/prisma/migrations/20260522000000_add_university_soft_ranking_fields/migration.sql`

- [ ] **Step 1: 在 University model 增加字段**

`schema.prisma` 的 `model University`：找到现有的「软科排名」区块（`softRating` / `softRanking` 两行），在 `softRanking Int? @map("soft_ranking")` 之后插入：

```prisma
  softRankList     String? @map("soft_rank_list") @db.VarChar(20)
  softCategory     String? @map("soft_category") @db.VarChar(50)
  softCategoryRank Int?    @map("soft_category_rank")
  softRankYear     Int?    @map("soft_rank_year") @db.SmallInt
```

并在该 model 末尾的 `@@index` 区块追加一个索引（`softRanking` 字段已存在，本次为它补排序索引）：

```prisma
  @@index([softRanking])
```

- [ ] **Step 2: 手写迁移文件**

本 worktree 没有 `DATABASE_URL`，不跑 `migrate dev`，手写迁移（部署时 `migrate deploy` 执行）。新建 `apps/server/prisma/migrations/20260522000000_add_university_soft_ranking_fields/migration.sql`：

```sql
-- AlterTable
ALTER TABLE `universities` ADD COLUMN `soft_rank_list` VARCHAR(20) NULL,
    ADD COLUMN `soft_category` VARCHAR(50) NULL,
    ADD COLUMN `soft_category_rank` INTEGER NULL,
    ADD COLUMN `soft_rank_year` SMALLINT NULL;

-- CreateIndex
CREATE INDEX `universities_soft_ranking_idx` ON `universities`(`soft_ranking`);
```

- [ ] **Step 3: 重新生成 Prisma Client**

Run（在 `apps/server`）: `pnpm prisma:generate`
Expected: 成功，`University` 类型带上 4 个新字段。

- [ ] **Step 4: 验证编译**

Run（在 `apps/server`）: `pnpm build`
Expected: 构建成功。

- [ ] **Step 5: Commit**

```bash
git add apps/server/prisma/schema.prisma apps/server/prisma/migrations
git commit -m "feat(server): add university soft-ranking columns"
```

## Task 2: 软科排名 xlsx 导入脚本

读 `data/院校级数据/学校排名.xlsx`，把软科榜单数据按校名匹配回填到 `University` 表。脚本参照既有的 `apps/server/scripts/import-supplementary-xlsx.ts`（同样用 exceljs + PrismaMariaDb adapter + `--file`/`--dry-run` 参数）。

**Files:**
- Create: `apps/server/scripts/import-soft-rankings.ts`
- Modify: `apps/server/package.json`

- [ ] **Step 1: 新增 npm script**

`apps/server/package.json` 的 `scripts` 块加一行：

```json
"import:soft-rankings": "ts-node -r tsconfig-paths/register scripts/import-soft-rankings.ts",
```

- [ ] **Step 2: 编写导入脚本**

新建 `apps/server/scripts/import-soft-rankings.ts`：

```ts
/**
 * 导入软科院校排名 xlsx 到 University 表（softRankList/softRanking/softRankYear/softCategory/softCategoryRank）。
 * 用法（在 apps/server，需 DATABASE_URL）：
 *   pnpm import:soft-rankings --file=../../data/院校级数据/学校排名.xlsx
 *   pnpm import:soft-rankings --file=... --dry-run
 */
import * as ExcelJS from 'exceljs';
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { parseArgs } from './lib/cli-utils';

// 主榜：sheet 名 -> 体系 + 年份
const MAIN_SHEETS: Record<string, { list: string; year: number }> = {
  '中国大学排名（总榜）_10': { list: '本科', year: 2026 },
  '中国民办高校排名（总榜）_-15': { list: '民办', year: 2026 },
  '中国高职院校排名_2025': { list: '高职', year: 2025 },
};

// 类别榜：sheet 名 -> 类别名（仅公办本科专门类别榜）
const CATEGORY_SHEETS: Record<string, string> = {
  '中国医药类大学排名_21': '医药类',
  '中国中医药大学排名_745': '中医药类',
  '中国财经类大学排名_22': '财经类',
  '中国语言类大学排名_23': '语言类',
  '中国政法类大学排名_25': '政法类',
  '中国民族类大学排名_24': '民族类',
  '中国体育类大学排名_26': '体育类',
};

interface MainRankRow { name: string; rank: number; list: string; year: number; }
interface CategoryRankRow { name: string; rank: number; category: string; }

function toText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'object') {
    const richText = (value as { richText?: Array<{ text?: string }> }).richText;
    if (Array.isArray(richText)) return richText.map((i) => i.text ?? '').join('');
    const text = (value as { text?: string }).text;
    if (text != null) return String(text);
    const result = (value as { result?: unknown }).result;
    if (result != null) return toText(result);
  }
  return String(value).trim();
}

function toNumber(value: unknown): number | null {
  const text = toText(value).replace(/,/g, '').trim();
  const match = text.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const n = Number(match[0]);
  return Number.isFinite(n) ? n : null;
}

// 校名匹配规范化：去括号内容、去空格（与 import-supplementary-xlsx.ts 一致）
function normalizeUniversityName(name: string): string {
  return name.replace(/[（(].*?[）)]/g, '').replace(/\s+/g, '').trim();
}

function colIndexes(sheet: ExcelJS.Worksheet): Map<string, number> {
  const indexes = new Map<string, number>();
  sheet.getRow(1).eachCell((cell, col) => indexes.set(toText(cell.value), col));
  return indexes;
}

function parseWorkbook(workbook: ExcelJS.Workbook): {
  main: MainRankRow[];
  category: CategoryRankRow[];
} {
  const main: MainRankRow[] = [];
  const category: CategoryRankRow[] = [];

  for (const [sheetName, cfg] of Object.entries(MAIN_SHEETS)) {
    const sheet = workbook.getWorksheet(sheetName);
    if (!sheet) continue;
    const idx = colIndexes(sheet);
    const nameCol = idx.get('学校中文名');
    const rankCol = idx.get('排名');
    if (!nameCol || !rankCol) continue;
    for (let r = 2; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r);
      const name = toText(row.getCell(nameCol).value);
      const rank = toNumber(row.getCell(rankCol).value);
      if (!name || rank == null) continue;
      main.push({ name, rank, list: cfg.list, year: cfg.year });
    }
  }

  for (const [sheetName, categoryName] of Object.entries(CATEGORY_SHEETS)) {
    const sheet = workbook.getWorksheet(sheetName);
    if (!sheet) continue;
    const idx = colIndexes(sheet);
    const nameCol = idx.get('学校中文名');
    const rankCol = idx.get('排名');
    if (!nameCol || !rankCol) continue;
    for (let r = 2; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r);
      const name = toText(row.getCell(nameCol).value);
      const rank = toNumber(row.getCell(rankCol).value);
      if (!name || rank == null) continue;
      category.push({ name, rank, category: categoryName });
    }
  }

  return { main, category };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const file = String(args.file || '');
  const dryRun = Boolean(args['dry-run']);
  if (!file) throw new Error('缺少 --file=/path/to/学校排名.xlsx');

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(file);
  const { main: mainRows, category: categoryRows } = parseWorkbook(workbook);

  const prisma = new PrismaClient({ adapter: new PrismaMariaDb(process.env.DATABASE_URL!) });
  try {
    const universities = await prisma.university.findMany({ select: { id: true, name: true } });
    const byName = new Map<string, number[]>();
    for (const u of universities) {
      const key = normalizeUniversityName(u.name);
      const arr = byName.get(key);
      if (arr) arr.push(u.id);
      else byName.set(key, [u.id]);
    }

    // 院校 id -> 待写入的软科字段
    const updates = new Map<number, Record<string, unknown>>();
    const addUpdate = (id: number, patch: Record<string, unknown>) => {
      updates.set(id, { ...(updates.get(id) ?? {}), ...patch });
    };
    let mainMatched = 0;
    let categoryMatched = 0;
    let unmatched = 0;

    for (const row of mainRows) {
      const ids = byName.get(normalizeUniversityName(row.name));
      if (!ids) { unmatched++; continue; }
      for (const id of ids) {
        addUpdate(id, { softRankList: row.list, softRanking: row.rank, softRankYear: row.year });
      }
      mainMatched++;
    }
    for (const row of categoryRows) {
      const ids = byName.get(normalizeUniversityName(row.name));
      if (!ids) continue;
      for (const id of ids) {
        addUpdate(id, { softCategory: row.category, softCategoryRank: row.rank });
      }
      categoryMatched++;
    }

    console.log(JSON.stringify({
      file, dryRun,
      mainRows: mainRows.length, categoryRows: categoryRows.length,
      mainMatched, categoryMatched, unmatchedMainRows: unmatched,
      universitiesToUpdate: updates.size,
    }, null, 2));

    if (dryRun) return;

    let done = 0;
    for (const [id, data] of updates) {
      await prisma.university.update({ where: { id }, data });
      done += 1;
      if (done % 200 === 0) console.log(`  ${done}/${updates.size}`);
    }
    console.log(`导入完成：更新 ${done} 所院校`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('导入失败：', e);
  process.exit(1);
});
```

- [ ] **Step 3: 验证脚本可编译加载**

环境调整：本 worktree 无 `DATABASE_URL`，脚本连库部分跑不了。验证方式：在 `apps/server` 跑 `pnpm import:soft-rankings --file=../../data/院校级数据/学校排名.xlsx --dry-run`。

> `--dry-run` 仍会 `findMany` 查 university 做匹配，因此无 DB 时仍会在「连接数据库」阶段失败。**关键判断**：失败应是数据库连接类错误，而非 TypeScript 编译错误、模块解析错误或 xlsx 读取错误（xlsx 文件路径相对 `apps/server` 是 `../../data/院校级数据/学校排名.xlsx`，应能被 exceljs 读到）。若是后者，需修复。

- [ ] **Step 4: Commit**

```bash
git add apps/server/scripts/import-soft-rankings.ts apps/server/package.json
git commit -m "feat(server): add soft-ranking xlsx import script"
```

---

## Task 3: 后端 findAll 支持按软科排名排序

**Files:**
- Modify: `apps/server/src/modules/university/dto/query-university.dto.ts`
- Modify: `apps/server/src/modules/university/university.service.ts`
- Modify: `apps/server/src/modules/university/university.service.spec.ts`

- [ ] **Step 1: 写失败测试**

`university.service.spec.ts` 的 `describe('UniversityService.findAll', ...)` 块内，新增用例（与既有 `sortBy=minRank` 用例同风格）：

```ts
it('sortBy=softRank orders by the softRanking column', async () => {
  const { svc, prisma } = setup([uni()]);
  await svc.findAll({ page: 1, pageSize: 20, sortBy: 'softRank', sortOrder: 'asc' } as any);
  expect(prisma.university.findMany.mock.calls[0][0].orderBy).toEqual({ softRanking: 'asc' });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run（在 `apps/server`）: `pnpm test -- university.service`
Expected: FAIL —— `findAll` 的 `orderByField` 未映射 `softRank`，`orderBy` 会是 `{ softRank: 'asc' }`。

- [ ] **Step 3: 扩展 DTO 与 findAll**

`query-university.dto.ts`：`sortBy` 的 `@IsIn` 与 `@ApiPropertyOptional` 的 `enum` 增加 `softRank`：

```ts
  @ApiPropertyOptional({ description: '排序字段', enum: ['name', 'province', 'type', 'minRank', 'tier', 'softRank'] })
  @IsOptional()
  @IsIn(['name', 'province', 'type', 'minRank', 'tier', 'softRank'])
  sortBy?: string = 'name';
```

`university.service.ts` 的 `findAll`：`orderByField` 的三目表达式增加 `softRank` 分支：

```ts
  const orderByField =
    sortBy === 'minRank' ? minRankField
    : sortBy === 'tier' ? predRankField
    : sortBy === 'softRank' ? 'softRanking'
    : sortBy;
```

（其余 findAll 逻辑不变。`softRanking` 升序，Prisma 默认 NULL 排末尾——未上软科榜的院校沉底。）

- [ ] **Step 4: 跑测试确认通过**

Run（在 `apps/server`）: `pnpm test -- university.service`
Expected: PASS（新用例 + 既有 findAll / findById / getFilters 等用例全绿）。

- [ ] **Step 5: 验证编译**

Run（在 `apps/server`）: `pnpm build`
Expected: 构建成功。

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/modules/university/dto/query-university.dto.ts apps/server/src/modules/university/university.service.ts apps/server/src/modules/university/university.service.spec.ts
git commit -m "feat(server): support sorting universities by soft ranking"
```

## Task 4: 前端 service 补软科排名字段

**Files:**
- Modify: `apps/web/src/services/university.ts`

- [ ] **Step 1: UniversityListItem 加字段**

`UniversityListItem` interface 末尾新增 5 个字段（`softRanking` 等在后端 `findAll` 响应里本就带出，类型未列，一并补上）：

```ts
  softRanking: number | null;
  softRankList: string | null;
  softCategory: string | null;
  softCategoryRank: number | null;
  softRankYear: number | null;
```

- [ ] **Step 2: 验证**

Run（在 `apps/web`）: `pnpm build`
Expected: 构建成功。

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/services/university.ts
git commit -m "feat(web): add soft-ranking fields to university list item type"
```

## Task 5: 前端卡片软科排名展示 + 排序项

**Files:**
- Modify: `apps/web/src/app/(main)/universities/components/UniversityListTab.tsx`
- Modify: `apps/web/src/app/(main)/universities/components/__tests__/UniversityListTab.test.tsx`

- [ ] **Step 1: 写失败测试**

`UniversityListTab.test.tsx` 的 `describe` 内新增用例：

```ts
it('shows soft ranking and category rank on the card', async () => {
  mockedService.getList.mockResolvedValue({
    data: [{
      id: 9, name: '某财经大学', code: null, province: '上海', city: '上海',
      type: '财经', level: '本科', runningNature: '公办',
      is985: false, is211: true, isDoubleFirstClass: true, ranking: null, logoUrl: null,
      latestAdmission: null, predictedMinRank: null,
      softRanking: 66, softRankList: '本科', softRankYear: 2026,
      softCategory: '财经类', softCategoryRank: 5,
    }],
    pagination: { page: 1, pageSize: 12, total: 1, totalPages: 1 },
  });
  renderTab();
  expect(await screen.findByText(/软科2026/)).toBeInTheDocument();
  expect(screen.getByText(/财经类 #5/)).toBeInTheDocument();
});
```

- [ ] **Step 2: 跑测试确认失败**

Run（在 `apps/web`）: `pnpm test -- UniversityListTab`
Expected: FAIL —— 卡片暂未渲染软科排名。

- [ ] **Step 3: 改 UniversityCard 的排名展示**

`UniversityCard` 里地区/排名信息那一行（当前含 `{uni.ranking && <span>综合排名 {uni.ranking}</span>}`），把 `综合排名` 那个 `<span>` 替换为软科排名 + 类别排名两段：

```tsx
<div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-muted">
  <span className="inline-flex items-center gap-1">
    <EnvironmentOutlined />
    {uni.province || '-'} {uni.city || ''}
  </span>
  {uni.softRanking != null && (
    <span>
      软科{uni.softRankYear ?? ''} {uni.softRankList ?? ''}#{uni.softRanking}
    </span>
  )}
  {uni.softCategory && uni.softCategoryRank != null && (
    <span>{uni.softCategory} #{uni.softCategoryRank}</span>
  )}
  {uni.code && <span>院校代码 {uni.code}</span>}
</div>
```

（`uni.ranking` 旧的口径不明的「综合排名」不再展示。其余行不变。）

- [ ] **Step 4: 排序条加「软科排名」**

`SORTS` 常量在「位次排序」之后插入一项：

```tsx
  { label: '软科排名', value: { sortBy: 'softRank', sortOrder: 'asc' } },
```

（软科排名排序不依赖考生位次，无 `needsRank`。）

- [ ] **Step 5: 跑测试确认通过**

Run（在 `apps/web`）: `pnpm test -- UniversityListTab`
Expected: PASS。

- [ ] **Step 6: 验证编译**

Run（在 `apps/web`）: `pnpm build`
Expected: 构建成功。

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/(main)/universities/components/UniversityListTab.tsx apps/web/src/app/(main)/universities/components/__tests__/UniversityListTab.test.tsx
git commit -m "feat(web): show soft ranking on cards and add soft-rank sort"
```

---

## 实施顺序

Task 1（schema）→ Task 2（导入脚本）→ Task 3（后端排序）→ Task 4（前端类型）→ Task 5（前端展示）。Task 1 是其余的前置。

## 部署注意

1. `apps/server`：`prisma migrate deploy` 应用迁移（4 字段 + index）
2. `apps/server`：`pnpm import:soft-rankings --file=../../data/院校级数据/学校排名.xlsx` 导入软科数据
3. 清 Redis 缓存 `cache:university:*`
4. 按既有 `deploy_auto.py` 部署

