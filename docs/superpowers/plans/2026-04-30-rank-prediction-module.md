# 位次预估模块（PR-1）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立位次预估基础设施 —— 一分一段表 ETL + 跨年等位算法 + 冲稳保阈值配置 + 全站可挂的 `<RankInput/>` 组件。

**Architecture:** 后端新建 `score-segment` 与 `algorithm-config` 两个 NestJS 模块。`score-segment` 负责"分数↔位次↔跨年等效"的纯算法服务（数据来自一次性 ETL 写入的 `score_segments` 表）；`algorithm-config` 负责冲稳保阈值的读写（用 `SystemConfig` 表存键值，避免引入 `AlgorithmConfig` 表的版本化复杂度）。前端新建 Zustand 全局 `useStudentRank` store + `RankInput` 组件，挂载到 5 个页面；管理员页 `/admin/algorithm-config` 提供阈值调整 UI。

**Tech Stack:** NestJS 10 / Prisma / Jest（后端） · Next.js 14 App Router / Zustand 4.5 / TanStack Query / antd / exceljs（前端）

**前置约定（实施前必读）：**
- 后端测试用 Jest，跟随 `apps/server/src/modules/timeline/timeline.service.spec.ts` 的写法（手写 `prisma` mock，不引 `@nestjs/testing`）。
- 后端运行测试统一用：`cd apps/server && pnpm jest <相对路径>`（仓库 monorepo，pnpm 已配）。
- 提交粒度：每个 Task 末尾 commit 一次。message 用中文 conventional 风格 `feat: xx` / `test: xx` / `chore: xx`，不带 Co-Authored-By 行（用户全局 `~/.claude/settings.json` 已禁用 attribution）。
- 关闭计划任务时执行 `cd apps/server && pnpm prisma generate` 一次（已存在的 `ScoreSegment` 与 `SystemConfig` 模型不需要 `prisma migrate`，本计划不改 schema）。
- 所有路径用 Windows 反斜杠风格的 absolute path 已不必要，本计划全部用 POSIX 相对路径，工作目录 = 仓库根 `C:\Users\Administrator\Documents\VolunteerHelper`。

---

## 文件结构总览

**后端新建：**
```
apps/server/scripts/etl-score-segments.ts            # 一次性 ETL
apps/server/src/modules/score-segment/
  ├── score-segment.module.ts
  ├── score-segment.service.ts                       # 算法核心
  ├── score-segment.service.spec.ts
  ├── score-segment.controller.ts
  ├── score-segment.controller.spec.ts
  ├── exam-type.helper.ts                            # 科类映射纯函数
  ├── exam-type.helper.spec.ts
  └── dto/
      ├── lookup.dto.ts
      └── equivalent.dto.ts
apps/server/src/modules/algorithm-config/
  ├── algorithm-config.module.ts
  ├── algorithm-config.service.ts
  ├── algorithm-config.service.spec.ts
  ├── algorithm-config.controller.ts
  └── dto/
      └── thresholds.dto.ts
```

**后端修改：**
```
apps/server/src/app.module.ts            # 注册两个新模块
```

**前端新建：**
```
apps/web/src/services/score-segment.ts
apps/web/src/services/algorithm-config.ts
apps/web/src/stores/studentRankStore.ts
apps/web/src/components/score/RankInput.tsx
apps/web/src/components/score/EquivalentScores.tsx
apps/web/src/components/score/RankBadge.tsx
apps/web/src/app/(admin)/admin/algorithm-config/page.tsx
```

**前端修改：**
```
apps/web/src/app/page.tsx                              # Hero 右栏挂 RankInput
apps/web/src/app/(main)/universities/page.tsx          # 左侧筛选区上方挂 RankInput
apps/web/src/app/(main)/majors/page.tsx                # 左侧门类导航上方挂 RankInput
apps/web/src/app/(main)/universities/[id]/page.tsx     # Hero 右侧挂 RankInput
apps/web/src/app/(main)/majors/[id]/page.tsx           # Hero 右侧挂 RankInput
apps/web/src/stores/authStore.ts                       # logout 时清空学生位次
```

---

## Backend

### Task 1: 准备 ETL 脚本骨架

**Files:**
- Create: `apps/server/scripts/etl-score-segments.ts`

- [ ] **Step 1: 确认依赖已就位**

```bash
cd apps/server && node -e "require('exceljs'); require('@prisma/client'); console.log('ok')"
```

Expected: `ok`（exceljs 与 @prisma/client 都已在 dependencies）

- [ ] **Step 2: 写最小骨架（只解析、不写库）**

文件 `apps/server/scripts/etl-score-segments.ts`：

```ts
/**
 * 一次性 ETL：把 data/03_专家版主表/output/一分一段表_四川_2022-2025.xlsx
 * 导入 score_segments 表。幂等可重跑。
 *
 * 用法：cd apps/server && pnpm ts-node scripts/etl-score-segments.ts [xlsx_path]
 */
import * as path from 'path';
import * as ExcelJS from 'exceljs';
import { PrismaClient } from '@prisma/client';

const DEFAULT_XLSX = path.resolve(
  __dirname,
  '../../../data/03_专家版主表/output/一分一段表_四川_2022-2025.xlsx',
);

interface Row {
  year: number;
  examType: string;
  score: number;
  count: number;
  cumulativeCount: number;
}

async function readRows(xlsxPath: string): Promise<Row[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(xlsxPath);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error(`空表: ${xlsxPath}`);

  // 期望列：ID/省份代码/年份/科类/本专类型/最高分/最低分/同分人数/最高位次/最低位次/...
  const headerRow = ws.getRow(1).values as (string | undefined)[];
  const idx = (name: string) => headerRow.findIndex((v) => v === name);
  const yearIdx = idx('年份');
  const typeIdx = idx('科类');
  const minScoreIdx = idx('最低分');
  const countIdx = idx('同分人数');
  const minRankIdx = idx('最低位次');

  if ([yearIdx, typeIdx, minScoreIdx, countIdx, minRankIdx].some((i) => i < 0)) {
    throw new Error(`列名缺失，实际表头: ${headerRow.join(',')}`);
  }

  const rows: Row[] = [];
  ws.eachRow((row, n) => {
    if (n === 1) return; // skip header
    const v = row.values as any[];
    rows.push({
      year: Number(v[yearIdx]),
      examType: String(v[typeIdx]).trim(),
      score: Number(v[minScoreIdx]),
      count: Number(v[countIdx]),
      cumulativeCount: Number(v[minRankIdx]),
    });
  });
  return rows.filter((r) => Number.isFinite(r.score) && Number.isFinite(r.cumulativeCount));
}

async function main() {
  const xlsx = process.argv[2] || DEFAULT_XLSX;
  console.log(`[ETL] 读取 ${xlsx}`);
  const rows = await readRows(xlsx);
  console.log(`[ETL] 解析到 ${rows.length} 行`);
  console.log(`[ETL] 样本前 3 行:`, rows.slice(0, 3));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 3: 试跑解析阶段**

```bash
cd apps/server && pnpm ts-node scripts/etl-score-segments.ts
```

Expected: 输出 "解析到 4000+ 行"，并打印 3 行样本（含 year/examType/score/count/cumulativeCount 字段）。如表头列名实际不同（中文空格、全角等），按报错调整 `idx(...)` 的字符串字面量。

- [ ] **Step 4: 加入写库逻辑**

在 `main()` 末尾追加：

```ts
  const prisma = new PrismaClient();
  let upserted = 0;
  for (const r of rows) {
    await prisma.scoreSegment.upsert({
      where: {
        year_province_examType_score: {
          year: r.year,
          province: '四川',
          examType: r.examType,
          score: r.score,
        },
      },
      create: {
        year: r.year,
        province: '四川',
        examType: r.examType,
        score: r.score,
        count: r.count,
        cumulativeCount: r.cumulativeCount,
      },
      update: {
        count: r.count,
        cumulativeCount: r.cumulativeCount,
      },
    });
    upserted++;
    if (upserted % 500 === 0) console.log(`  upserted ${upserted}/${rows.length}`);
  }
  await prisma.$disconnect();
  console.log(`[ETL] 完成: ${upserted} 行`);
```

- [ ] **Step 5: 提交（不实际跑生产，跑生产留到 Task 2 验证）**

```bash
git add apps/server/scripts/etl-score-segments.ts
git commit -m "feat: 一分一段表 ETL 脚本（解析 + upsert）"
```

---

### Task 2: 本地跑 ETL 验证数据落库

**Files:**
- 无新文件，只跑脚本验证

- [ ] **Step 1: 确认本地 .env 指向开发库**

```bash
cd apps/server && cat .env.local 2>/dev/null | grep DATABASE_URL || cat .env | grep DATABASE_URL
```

Expected: 看到 `DATABASE_URL=mysql://...`，确认指向开发库（不要在生产跑 ETL）。

- [ ] **Step 2: 跑 ETL**

```bash
cd apps/server && pnpm ts-node scripts/etl-score-segments.ts
```

Expected: 最后输出 `[ETL] 完成: 4000+ 行`，无报错。

- [ ] **Step 3: 验证数据完整性**

```bash
cd apps/server && pnpm prisma db execute --stdin <<'SQL'
SELECT year, exam_type, COUNT(*) AS rows, MIN(score) AS min_s, MAX(score) AS max_s, MAX(cumulative_count) AS total
FROM score_segments
WHERE province = '四川'
GROUP BY year, exam_type
ORDER BY year, exam_type;
SQL
```

Expected: 看到 8 组数据 —— 2022-2024 各 2 类（理科/文科），2025 各 2 类（物理/历史）；每组 cumulative_count 最大值在 18-30 万区间，符合四川考生规模。

- [ ] **Step 4: 第二次跑（验证幂等）**

```bash
cd apps/server && pnpm ts-node scripts/etl-score-segments.ts
```

Expected: 同样 4000+ 行 upsert 完成，count 不翻倍（upsert 只更新不重复插入）。

- [ ] **Step 5: 不需要 commit（无文件改动）**

---

### Task 3: 科类映射纯函数 + 测试

**Files:**
- Create: `apps/server/src/modules/score-segment/exam-type.helper.ts`
- Test: `apps/server/src/modules/score-segment/exam-type.helper.spec.ts`

- [ ] **Step 1: 写失败测试**

文件 `apps/server/src/modules/score-segment/exam-type.helper.spec.ts`：

```ts
import { mapExamType } from './exam-type.helper';

describe('mapExamType', () => {
  it('物理 → 理科 当目标年 ≤ 2024', () => {
    expect(mapExamType('物理', 2024)).toBe('理科');
    expect(mapExamType('物理', 2022)).toBe('理科');
  });

  it('历史 → 文科 当目标年 ≤ 2024', () => {
    expect(mapExamType('历史', 2024)).toBe('文科');
  });

  it('物理 → 物理 当目标年 ≥ 2025', () => {
    expect(mapExamType('物理', 2025)).toBe('物理');
    expect(mapExamType('物理', 2026)).toBe('物理');
  });

  it('理科 → 理科（同年保持）', () => {
    expect(mapExamType('理科', 2023)).toBe('理科');
    expect(mapExamType('理科', 2025)).toBe('理科');
  });

  it('文科 → 文科', () => {
    expect(mapExamType('文科', 2025)).toBe('文科');
  });

  it('不识别的科类 → 抛错', () => {
    expect(() => mapExamType('xxx' as any, 2025)).toThrow(/不支持的科类/);
  });
});
```

- [ ] **Step 2: 跑测试确认 RED**

```bash
cd apps/server && pnpm jest src/modules/score-segment/exam-type.helper.spec.ts
```

Expected: FAIL — `Cannot find module './exam-type.helper'`。

- [ ] **Step 3: 实现**

文件 `apps/server/src/modules/score-segment/exam-type.helper.ts`：

```ts
export type ExamType = '物理' | '历史' | '理科' | '文科';

/**
 * 跨年科类映射：把当前年的科类映射到目标年表里使用的科类。
 * 业内通行：物理↔理科 / 历史↔文科。2025 起四川改为物理/历史/理科/文科四类。
 */
export function mapExamType(current: ExamType, targetYear: number): ExamType {
  if (current === '理科' || current === '文科') return current;
  if (current === '物理') return targetYear <= 2024 ? '理科' : '物理';
  if (current === '历史') return targetYear <= 2024 ? '文科' : '历史';
  throw new Error(`不支持的科类: ${current}`);
}
```

- [ ] **Step 4: 跑测试确认 GREEN**

```bash
cd apps/server && pnpm jest src/modules/score-segment/exam-type.helper.spec.ts
```

Expected: 6 passed。

- [ ] **Step 5: 提交**

```bash
git add apps/server/src/modules/score-segment/exam-type.helper.ts apps/server/src/modules/score-segment/exam-type.helper.spec.ts
git commit -m "feat: 科类映射纯函数（物理↔理科 / 历史↔文科）"
```

---

### Task 4: ScoreSegmentService — scoreToRank / rankToScore

**Files:**
- Create: `apps/server/src/modules/score-segment/score-segment.service.ts`
- Test: `apps/server/src/modules/score-segment/score-segment.service.spec.ts`

- [ ] **Step 1: 写失败测试**

文件 `apps/server/src/modules/score-segment/score-segment.service.spec.ts`：

```ts
import { ScoreSegmentService } from './score-segment.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('ScoreSegmentService', () => {
  let service: ScoreSegmentService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      scoreSegment: {
        findFirst: jest.fn(),
      },
    };
    service = new ScoreSegmentService(prisma as unknown as PrismaService);
  });

  describe('scoreToRank', () => {
    it('返回查到的累计位次', async () => {
      // 模拟 580 分的最低位次是 28500
      prisma.scoreSegment.findFirst.mockImplementation(({ where, orderBy }: any) => {
        // 该实现下 service 会请求 score <= 580 的最高一行
        if (where.score?.lte === 580) {
          return Promise.resolve({ score: 580, cumulativeCount: 28500 });
        }
        return Promise.resolve(null);
      });
      // 全省总人数（用最低分行的 cumulativeCount 作上限）
      prisma.scoreSegment.findFirst.mockImplementationOnce(() =>
        Promise.resolve({ score: 580, cumulativeCount: 28500 }),
      );

      const result = await service.scoreToRank(2025, '物理', 580);
      expect(result.rank).toBe(28500);
      expect(result.score).toBe(580);
    });

    it('分数高于最高分 → rank=1（顶端）', async () => {
      prisma.scoreSegment.findFirst.mockImplementation(({ where }: any) => {
        if (where.score?.lte) return Promise.resolve(null); // 无人 ≤ 800
        return Promise.resolve({ score: 700, cumulativeCount: 1 }); // 最高分行
      });
      const result = await service.scoreToRank(2025, '物理', 800);
      expect(result.rank).toBe(1);
    });
  });

  describe('rankToScore', () => {
    it('返回该位次对应的最高分（cumulativeCount >= rank 的最高 score）', async () => {
      prisma.scoreSegment.findFirst.mockResolvedValue({ score: 580, cumulativeCount: 28500 });
      const result = await service.rankToScore(2025, '物理', 28500);
      expect(result.score).toBe(580);
      expect(result.rank).toBe(28500);
    });

    it('位次超出范围 → 返回最低分', async () => {
      // 第一次查询返回 null（无 cumulativeCount >= 999999 的行）
      prisma.scoreSegment.findFirst.mockResolvedValueOnce(null);
      // 第二次查询返回最低分行
      prisma.scoreSegment.findFirst.mockResolvedValueOnce({ score: 100, cumulativeCount: 300000 });
      const result = await service.rankToScore(2025, '物理', 999999);
      expect(result.score).toBe(100);
    });
  });
});
```

- [ ] **Step 2: 跑测试确认 RED**

```bash
cd apps/server && pnpm jest src/modules/score-segment/score-segment.service.spec.ts
```

Expected: FAIL — 找不到 `./score-segment.service`。

- [ ] **Step 3: 实现 service**

文件 `apps/server/src/modules/score-segment/score-segment.service.ts`：

```ts
import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ExamType, mapExamType } from './exam-type.helper';

interface LookupResult {
  year: number;
  examType: ExamType;
  score: number;
  rank: number;
  percentile: number; // 0..1
}

interface EquivalentResult {
  base: LookupResult;
  equivalents: LookupResult[];
}

@Injectable()
export class ScoreSegmentService {
  private readonly PROVINCE = '四川';
  private readonly SUPPORTED_YEARS = [2022, 2023, 2024, 2025];

  constructor(private readonly prisma: PrismaService) {}

  /** 分数 → 位次（找 score ≤ 输入 的最高分对应的累计位次） */
  async scoreToRank(year: number, examType: ExamType, score: number): Promise<LookupResult> {
    if (score < 0 || score > 750) throw new BadRequestException('分数需在 0..750');

    const totalCount = await this.getTotalCount(year, examType);

    const row = await this.prisma.scoreSegment.findFirst({
      where: { year, province: this.PROVINCE, examType, score: { lte: score } },
      orderBy: { score: 'desc' },
    });

    // 高于最高分 → rank=1
    if (!row) {
      return { year, examType, score, rank: 1, percentile: 1 / Math.max(totalCount, 1) };
    }
    return {
      year,
      examType,
      score: row.score,
      rank: row.cumulativeCount,
      percentile: row.cumulativeCount / Math.max(totalCount, 1),
    };
  }

  /** 位次 → 分数（找 cumulativeCount ≥ 输入位次 的最高分） */
  async rankToScore(year: number, examType: ExamType, rank: number): Promise<LookupResult> {
    if (rank < 1) throw new BadRequestException('位次需 ≥ 1');

    const totalCount = await this.getTotalCount(year, examType);

    const row = await this.prisma.scoreSegment.findFirst({
      where: {
        year,
        province: this.PROVINCE,
        examType,
        cumulativeCount: { gte: rank },
      },
      orderBy: { score: 'desc' },
    });

    if (row) {
      return {
        year,
        examType,
        score: row.score,
        rank,
        percentile: rank / Math.max(totalCount, 1),
      };
    }

    // 位次超过总人数 → 返回最低分
    const lowest = await this.prisma.scoreSegment.findFirst({
      where: { year, province: this.PROVINCE, examType },
      orderBy: { score: 'asc' },
    });
    return {
      year,
      examType,
      score: lowest?.score ?? 0,
      rank,
      percentile: 1,
    };
  }

  /** 总人数 = 该年该科类 cumulativeCount 最大值 */
  private async getTotalCount(year: number, examType: ExamType): Promise<number> {
    const row = await this.prisma.scoreSegment.findFirst({
      where: { year, province: this.PROVINCE, examType },
      orderBy: { cumulativeCount: 'desc' },
    });
    return row?.cumulativeCount ?? 0;
  }

  /** 跨年等位换算 — Task 5 实现 */
  async equivalent(
    _baseYear: number,
    _examType: ExamType,
    _rank: number,
  ): Promise<EquivalentResult> {
    throw new Error('not implemented');
  }
}
```

- [ ] **Step 4: 跑测试确认 GREEN**

```bash
cd apps/server && pnpm jest src/modules/score-segment/score-segment.service.spec.ts
```

Expected: 4 passed。如果 mock 调用次数与实现不匹配，调整测试里 `mockImplementationOnce` 的顺序与 service 内 query 顺序对齐（service 内调用顺序：`getTotalCount` → 主查询）。

- [ ] **Step 5: 提交**

```bash
git add apps/server/src/modules/score-segment/score-segment.service.ts apps/server/src/modules/score-segment/score-segment.service.spec.ts
git commit -m "feat: ScoreSegmentService 实现 scoreToRank / rankToScore"
```

---

### Task 5: ScoreSegmentService — equivalent（跨年等位）

**Files:**
- Modify: `apps/server/src/modules/score-segment/score-segment.service.ts`
- Modify: `apps/server/src/modules/score-segment/score-segment.service.spec.ts`

- [ ] **Step 1: 追加失败测试**

在 `score-segment.service.spec.ts` 末尾的 `describe('ScoreSegmentService', ...)` 内追加：

```ts
  describe('equivalent', () => {
    it('线性比例法换算：p=R/N 然后用各年 N 反推 R_y', async () => {
      // 基准年 2025 物理，rank=20000，假设 2025 物理总人数 N=200000 → p=0.10
      // 2024 理科 N=180000 → R_y = 0.10 * 180000 = 18000
      const stub = (year: number, examType: string, totalCount: number, rankToScoreMap: Record<number, number>) => {
        return ({ where, orderBy }: any) => {
          if (where.year !== year || where.examType !== examType) return Promise.resolve(null);
          // getTotalCount 调用：orderBy cumulativeCount desc
          if (orderBy?.cumulativeCount === 'desc') {
            return Promise.resolve({ score: 0, cumulativeCount: totalCount });
          }
          // rankToScore 调用：where.cumulativeCount.gte = R_y, orderBy score desc
          if (where.cumulativeCount?.gte != null) {
            const R = where.cumulativeCount.gte;
            const matchedScore = rankToScoreMap[R];
            return matchedScore != null
              ? Promise.resolve({ score: matchedScore, cumulativeCount: R })
              : Promise.resolve(null);
          }
          return Promise.resolve(null);
        };
      };

      // 让 findFirst 按 (year, examType) 路由
      prisma.scoreSegment.findFirst.mockImplementation((args: any) => {
        const { where } = args;
        if (where.year === 2025 && where.examType === '物理') {
          return stub(2025, '物理', 200000, { 20000: 600 })(args);
        }
        if (where.year === 2024 && where.examType === '理科') {
          return stub(2024, '理科', 180000, { 18000: 595 })(args);
        }
        if (where.year === 2023 && where.examType === '理科') {
          return stub(2023, '理科', 190000, { 19000: 590 })(args);
        }
        if (where.year === 2022 && where.examType === '理科') {
          return stub(2022, '理科', 195000, { 19500: 585 })(args);
        }
        return Promise.resolve(null);
      });

      const result = await service.equivalent(2025, '物理', 20000);
      expect(result.base.year).toBe(2025);
      expect(result.base.rank).toBe(20000);
      expect(result.equivalents).toHaveLength(3); // 2024/2023/2022
      const e2024 = result.equivalents.find((e) => e.year === 2024)!;
      expect(e2024.examType).toBe('理科');
      expect(e2024.rank).toBe(18000);
      expect(e2024.score).toBe(595);
    });
  });
```

- [ ] **Step 2: 跑测试确认 RED**

```bash
cd apps/server && pnpm jest src/modules/score-segment/score-segment.service.spec.ts -t equivalent
```

Expected: FAIL — `not implemented`。

- [ ] **Step 3: 实现 equivalent**

替换 `score-segment.service.ts` 末尾的占位 `equivalent`：

```ts
  /**
   * 跨年等位换算（线性比例法）
   * p = R / N_baseYear
   * 对每个目标年 y: examType_y = mapExamType(K, y); R_y = round(p × N_y); 查 rankToScore
   */
  async equivalent(
    baseYear: number,
    examType: ExamType,
    rank: number,
  ): Promise<EquivalentResult> {
    const baseTotal = await this.getTotalCount(baseYear, examType);
    if (baseTotal === 0) {
      throw new BadRequestException(`${baseYear} 年 ${examType} 无数据`);
    }
    const baseScore = await this.rankToScore(baseYear, examType, rank);
    const p = rank / baseTotal;

    const targetYears = this.SUPPORTED_YEARS.filter((y) => y !== baseYear);
    const equivalents: LookupResult[] = [];
    for (const y of targetYears) {
      const yExamType = mapExamType(examType, y);
      const yTotal = await this.getTotalCount(y, yExamType);
      if (yTotal === 0) continue; // 目标年缺数据，跳过
      const Ry = Math.max(1, Math.round(p * yTotal));
      const yScore = await this.rankToScore(y, yExamType, Ry);
      equivalents.push(yScore);
    }

    return {
      base: { ...baseScore, rank, percentile: p },
      equivalents,
    };
  }
```

- [ ] **Step 4: 跑测试确认 GREEN**

```bash
cd apps/server && pnpm jest src/modules/score-segment/score-segment.service.spec.ts
```

Expected: 5 passed。

- [ ] **Step 5: 提交**

```bash
git add apps/server/src/modules/score-segment/score-segment.service.ts apps/server/src/modules/score-segment/score-segment.service.spec.ts
git commit -m "feat: equivalent 跨年等位换算（线性比例法）"
```

---

### Task 6: ScoreSegmentService — classify（冲稳保）

**Files:**
- Modify: `apps/server/src/modules/score-segment/score-segment.service.ts`
- Modify: `apps/server/src/modules/score-segment/score-segment.service.spec.ts`

- [ ] **Step 1: 追加失败测试**

在 spec 文件末尾、`describe('ScoreSegmentService')` 内追加：

```ts
  describe('classify', () => {
    const cfg = {
      rush:   { min: 0.85, max: 0.95 },
      safe:   { min: 0.95, max: 1.05 },
      stable: { min: 1.05, max: 1.20 },
    };

    it('ratio 在 [0.85, 0.95) → rush', () => {
      // 院校位次 25500 / 学生位次 30000 ≈ 0.85
      expect(service.classify(30000, 25500, cfg)).toBe('rush');
      expect(service.classify(30000, 28499, cfg)).toBe('rush'); // 0.9499...
    });

    it('ratio 在 [0.95, 1.05] → safe', () => {
      expect(service.classify(30000, 28500, cfg)).toBe('safe'); // 0.95
      expect(service.classify(30000, 31500, cfg)).toBe('safe'); // 1.05
    });

    it('ratio 在 (1.05, 1.20] → stable', () => {
      expect(service.classify(30000, 31501, cfg)).toBe('stable');
      expect(service.classify(30000, 36000, cfg)).toBe('stable'); // 1.20
    });

    it('ratio 超出范围 → null', () => {
      expect(service.classify(30000, 25499, cfg)).toBeNull(); // < 0.85
      expect(service.classify(30000, 36001, cfg)).toBeNull(); // > 1.20
    });

    it('院校位次或学生位次缺失 → null', () => {
      expect(service.classify(null as any, 28500, cfg)).toBeNull();
      expect(service.classify(30000, null as any, cfg)).toBeNull();
    });
  });
```

- [ ] **Step 2: 跑测试确认 RED**

```bash
cd apps/server && pnpm jest src/modules/score-segment/score-segment.service.spec.ts -t classify
```

Expected: FAIL — `service.classify is not a function`。

- [ ] **Step 3: 实现 classify**

在 `score-segment.service.ts` 内添加：

```ts
export interface RushSafeStableConfig {
  rush: { min: number; max: number };
  safe: { min: number; max: number };
  stable: { min: number; max: number };
}
```

并在 `ScoreSegmentService` 类内追加：

```ts
  /**
   * 冲稳保判定。ratio = 院校历史最低位次 / 学生位次。
   * - rush.min ≤ ratio < rush.max → 'rush'
   * - safe.min ≤ ratio ≤ safe.max → 'safe'
   * - stable.min < ratio ≤ stable.max → 'stable'
   * - 其他 → null
   */
  classify(
    studentRank: number,
    universityRank: number,
    config: RushSafeStableConfig,
  ): 'rush' | 'safe' | 'stable' | null {
    if (!studentRank || !universityRank) return null;
    const r = universityRank / studentRank;
    if (r >= config.rush.min && r < config.rush.max) return 'rush';
    if (r >= config.safe.min && r <= config.safe.max) return 'safe';
    if (r > config.stable.min && r <= config.stable.max) return 'stable';
    return null;
  }
```

- [ ] **Step 4: 跑测试确认 GREEN**

```bash
cd apps/server && pnpm jest src/modules/score-segment/score-segment.service.spec.ts
```

Expected: 全部通过（含 classify 5 个用例）。

- [ ] **Step 5: 提交**

```bash
git add apps/server/src/modules/score-segment/score-segment.service.ts apps/server/src/modules/score-segment/score-segment.service.spec.ts
git commit -m "feat: classify 冲稳保判定（基于 ratio 区间）"
```

---

### Task 7: ScoreSegment DTO + Controller + Module

**Files:**
- Create: `apps/server/src/modules/score-segment/dto/lookup.dto.ts`
- Create: `apps/server/src/modules/score-segment/dto/equivalent.dto.ts`
- Create: `apps/server/src/modules/score-segment/score-segment.controller.ts`
- Create: `apps/server/src/modules/score-segment/score-segment.module.ts`
- Test: `apps/server/src/modules/score-segment/score-segment.controller.spec.ts`

- [ ] **Step 1: 写 DTO**

文件 `apps/server/src/modules/score-segment/dto/lookup.dto.ts`：

```ts
import { IsInt, IsString, IsOptional, Min, Max, IsIn, ValidateIf } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LookupDto {
  @ApiProperty({ example: 2025 })
  @Type(() => Number)
  @IsInt()
  @Min(2022)
  @Max(2030)
  year!: number;

  @ApiProperty({ enum: ['物理', '历史', '理科', '文科'] })
  @IsString()
  @IsIn(['物理', '历史', '理科', '文科'])
  examType!: '物理' | '历史' | '理科' | '文科';

  @ApiPropertyOptional({ description: '分数（与 rank 二选一）', example: 580 })
  @ValidateIf((o) => o.rank == null)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(750)
  @IsOptional()
  score?: number;

  @ApiPropertyOptional({ description: '位次（与 score 二选一）', example: 28500 })
  @ValidateIf((o) => o.score == null)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  rank?: number;
}
```

文件 `apps/server/src/modules/score-segment/dto/equivalent.dto.ts`：

```ts
import { IsInt, IsString, IsIn, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class EquivalentDto {
  @ApiProperty({ example: 2025 })
  @Type(() => Number)
  @IsInt()
  @Min(2022)
  @Max(2030)
  baseYear!: number;

  @ApiProperty({ enum: ['物理', '历史', '理科', '文科'] })
  @IsString()
  @IsIn(['物理', '历史', '理科', '文科'])
  examType!: '物理' | '历史' | '理科' | '文科';

  @ApiProperty({ example: 28500 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  rank!: number;
}
```

- [ ] **Step 2: 写 controller 测试**

文件 `apps/server/src/modules/score-segment/score-segment.controller.spec.ts`：

```ts
import { ScoreSegmentController } from './score-segment.controller';
import { ScoreSegmentService } from './score-segment.service';
import { BadRequestException } from '@nestjs/common';

describe('ScoreSegmentController', () => {
  let controller: ScoreSegmentController;
  let service: any;

  beforeEach(() => {
    service = {
      scoreToRank: jest.fn(),
      rankToScore: jest.fn(),
      equivalent: jest.fn(),
    };
    controller = new ScoreSegmentController(service as ScoreSegmentService);
  });

  describe('lookup', () => {
    it('有 score → 调用 scoreToRank', async () => {
      service.scoreToRank.mockResolvedValue({ rank: 28500 });
      const result = await controller.lookup({ year: 2025, examType: '物理', score: 580 });
      expect(service.scoreToRank).toHaveBeenCalledWith(2025, '物理', 580);
      expect(result.rank).toBe(28500);
    });

    it('有 rank → 调用 rankToScore', async () => {
      service.rankToScore.mockResolvedValue({ score: 580 });
      const result = await controller.lookup({ year: 2025, examType: '物理', rank: 28500 });
      expect(service.rankToScore).toHaveBeenCalledWith(2025, '物理', 28500);
      expect(result.score).toBe(580);
    });

    it('两者都没有 → BadRequestException', async () => {
      await expect(
        controller.lookup({ year: 2025, examType: '物理' } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('equivalent', () => {
    it('委托给 service.equivalent', async () => {
      service.equivalent.mockResolvedValue({ base: {}, equivalents: [] });
      await controller.equivalent({ baseYear: 2025, examType: '物理', rank: 28500 });
      expect(service.equivalent).toHaveBeenCalledWith(2025, '物理', 28500);
    });
  });
});
```

- [ ] **Step 3: 跑测试确认 RED**

```bash
cd apps/server && pnpm jest src/modules/score-segment/score-segment.controller.spec.ts
```

Expected: FAIL — 找不到 `./score-segment.controller`。

- [ ] **Step 4: 实现 controller**

文件 `apps/server/src/modules/score-segment/score-segment.controller.ts`：

```ts
import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ScoreSegmentService } from './score-segment.service';
import { LookupDto } from './dto/lookup.dto';
import { EquivalentDto } from './dto/equivalent.dto';

@ApiTags('一分一段')
@Controller('score-segment')
export class ScoreSegmentController {
  constructor(private readonly service: ScoreSegmentService) {}

  @Post('lookup')
  @ApiOperation({ summary: '分数↔位次互查' })
  async lookup(@Body() dto: LookupDto) {
    if (dto.score != null) {
      return this.service.scoreToRank(dto.year, dto.examType, dto.score);
    }
    if (dto.rank != null) {
      return this.service.rankToScore(dto.year, dto.examType, dto.rank);
    }
    throw new BadRequestException('score 或 rank 至少传一个');
  }

  @Post('equivalent')
  @ApiOperation({ summary: '跨年等位换算' })
  async equivalent(@Body() dto: EquivalentDto) {
    return this.service.equivalent(dto.baseYear, dto.examType, dto.rank);
  }
}
```

- [ ] **Step 5: 写 module**

文件 `apps/server/src/modules/score-segment/score-segment.module.ts`：

```ts
import { Module } from '@nestjs/common';
import { ScoreSegmentController } from './score-segment.controller';
import { ScoreSegmentService } from './score-segment.service';

@Module({
  controllers: [ScoreSegmentController],
  providers: [ScoreSegmentService],
  exports: [ScoreSegmentService],
})
export class ScoreSegmentModule {}
```

- [ ] **Step 6: 跑 controller 测试 GREEN**

```bash
cd apps/server && pnpm jest src/modules/score-segment/
```

Expected: 全部通过（service.spec + helper.spec + controller.spec）。

- [ ] **Step 7: 提交**

```bash
git add apps/server/src/modules/score-segment/dto apps/server/src/modules/score-segment/score-segment.controller.ts apps/server/src/modules/score-segment/score-segment.controller.spec.ts apps/server/src/modules/score-segment/score-segment.module.ts
git commit -m "feat: ScoreSegment Controller + DTO + Module"
```

---

### Task 8: AlgorithmConfigService（用 SystemConfig 表）

**Files:**
- Create: `apps/server/src/modules/algorithm-config/algorithm-config.service.ts`
- Test: `apps/server/src/modules/algorithm-config/algorithm-config.service.spec.ts`

- [ ] **Step 1: 写失败测试**

文件 `apps/server/src/modules/algorithm-config/algorithm-config.service.spec.ts`：

```ts
import { AlgorithmConfigService, RUSH_SAFE_STABLE_KEY, DEFAULT_THRESHOLDS } from './algorithm-config.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('AlgorithmConfigService', () => {
  let service: AlgorithmConfigService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      systemConfig: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
      },
    };
    service = new AlgorithmConfigService(prisma as unknown as PrismaService);
  });

  describe('getRushSafeStableThresholds', () => {
    it('库里有 → 返回库里的值', async () => {
      const value = {
        rush: { min: 0.80, max: 0.92 },
        safe: { min: 0.92, max: 1.08 },
        stable: { min: 1.08, max: 1.25 },
      };
      prisma.systemConfig.findUnique.mockResolvedValue({ key: RUSH_SAFE_STABLE_KEY, value });
      const result = await service.getRushSafeStableThresholds();
      expect(result).toEqual(value);
    });

    it('库里没有 → 返回默认值', async () => {
      prisma.systemConfig.findUnique.mockResolvedValue(null);
      const result = await service.getRushSafeStableThresholds();
      expect(result).toEqual(DEFAULT_THRESHOLDS);
    });
  });

  describe('setRushSafeStableThresholds', () => {
    it('合法值 → upsert', async () => {
      prisma.systemConfig.upsert.mockResolvedValue({});
      const value = {
        rush: { min: 0.85, max: 0.95 },
        safe: { min: 0.95, max: 1.05 },
        stable: { min: 1.05, max: 1.20 },
      };
      await service.setRushSafeStableThresholds(value);
      expect(prisma.systemConfig.upsert).toHaveBeenCalledWith({
        where: { key: RUSH_SAFE_STABLE_KEY },
        create: expect.objectContaining({ key: RUSH_SAFE_STABLE_KEY, value }),
        update: { value },
      });
    });

    it('rush.min >= rush.max → 抛错', async () => {
      const bad = {
        rush: { min: 0.95, max: 0.85 },
        safe: { min: 0.95, max: 1.05 },
        stable: { min: 1.05, max: 1.20 },
      };
      await expect(service.setRushSafeStableThresholds(bad)).rejects.toThrow(/rush\.min.*rush\.max/);
    });

    it('区间不连续（safe.min != rush.max） → 抛错', async () => {
      const bad = {
        rush: { min: 0.85, max: 0.95 },
        safe: { min: 0.96, max: 1.05 },
        stable: { min: 1.05, max: 1.20 },
      };
      await expect(service.setRushSafeStableThresholds(bad)).rejects.toThrow(/连续/);
    });
  });
});
```

- [ ] **Step 2: 跑测试确认 RED**

```bash
cd apps/server && pnpm jest src/modules/algorithm-config/algorithm-config.service.spec.ts
```

Expected: FAIL — 找不到 `./algorithm-config.service`。

- [ ] **Step 3: 实现**

文件 `apps/server/src/modules/algorithm-config/algorithm-config.service.ts`：

```ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RushSafeStableConfig } from '../score-segment/score-segment.service';

export const RUSH_SAFE_STABLE_KEY = 'rush_safe_stable_thresholds';

export const DEFAULT_THRESHOLDS: RushSafeStableConfig = {
  rush: { min: 0.85, max: 0.95 },
  safe: { min: 0.95, max: 1.05 },
  stable: { min: 1.05, max: 1.20 },
};

@Injectable()
export class AlgorithmConfigService {
  constructor(private readonly prisma: PrismaService) {}

  async getRushSafeStableThresholds(): Promise<RushSafeStableConfig> {
    const row = await this.prisma.systemConfig.findUnique({
      where: { key: RUSH_SAFE_STABLE_KEY },
    });
    return (row?.value as RushSafeStableConfig | undefined) ?? DEFAULT_THRESHOLDS;
  }

  async setRushSafeStableThresholds(value: RushSafeStableConfig): Promise<void> {
    this.validateThresholds(value);
    await this.prisma.systemConfig.upsert({
      where: { key: RUSH_SAFE_STABLE_KEY },
      create: {
        key: RUSH_SAFE_STABLE_KEY,
        value: value as any,
        desc: '冲稳保 ratio 区间配置（ratio = 院校历史最低位次 / 学生位次）',
      },
      update: { value: value as any },
    });
  }

  private validateThresholds(v: RushSafeStableConfig) {
    const { rush, safe, stable } = v;
    if (!(rush.min < rush.max)) throw new BadRequestException('rush.min 必须 < rush.max');
    if (!(safe.min < safe.max)) throw new BadRequestException('safe.min 必须 < safe.max');
    if (!(stable.min < stable.max)) throw new BadRequestException('stable.min 必须 < stable.max');
    if (rush.max !== safe.min) throw new BadRequestException('safe.min 必须等于 rush.max（区间需连续）');
    if (safe.max !== stable.min) throw new BadRequestException('stable.min 必须等于 safe.max（区间需连续）');
    if (rush.min < 0 || stable.max > 5) throw new BadRequestException('阈值需在合理范围 [0, 5]');
  }
}
```

- [ ] **Step 4: 跑测试 GREEN**

```bash
cd apps/server && pnpm jest src/modules/algorithm-config/algorithm-config.service.spec.ts
```

Expected: 4 passed。

- [ ] **Step 5: 提交**

```bash
git add apps/server/src/modules/algorithm-config/algorithm-config.service.ts apps/server/src/modules/algorithm-config/algorithm-config.service.spec.ts
git commit -m "feat: AlgorithmConfigService 读写冲稳保阈值（SystemConfig 表）"
```

---

### Task 9: AlgorithmConfig Controller（含 admin 权限）

**Files:**
- Create: `apps/server/src/modules/algorithm-config/dto/thresholds.dto.ts`
- Create: `apps/server/src/modules/algorithm-config/algorithm-config.controller.ts`
- Create: `apps/server/src/modules/algorithm-config/algorithm-config.module.ts`

- [ ] **Step 1: 写 DTO**

文件 `apps/server/src/modules/algorithm-config/dto/thresholds.dto.ts`：

```ts
import { IsNumber, ValidateNested, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

class RangeDto {
  @ApiProperty()
  @IsNumber()
  @Min(0)
  @Max(5)
  min!: number;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  @Max(5)
  max!: number;
}

export class ThresholdsDto {
  @ApiProperty({ type: RangeDto })
  @ValidateNested()
  @Type(() => RangeDto)
  rush!: RangeDto;

  @ApiProperty({ type: RangeDto })
  @ValidateNested()
  @Type(() => RangeDto)
  safe!: RangeDto;

  @ApiProperty({ type: RangeDto })
  @ValidateNested()
  @Type(() => RangeDto)
  stable!: RangeDto;
}
```

- [ ] **Step 2: 写 controller**

文件 `apps/server/src/modules/algorithm-config/algorithm-config.controller.ts`：

```ts
import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PoliciesGuard, CheckPolicies } from '../casl';
import { AlgorithmConfigService } from './algorithm-config.service';
import { ThresholdsDto } from './dto/thresholds.dto';

@ApiTags('算法配置')
@Controller('algorithm-config')
export class AlgorithmConfigController {
  constructor(private readonly service: AlgorithmConfigService) {}

  @Get('rush-safe-stable-thresholds')
  @ApiOperation({ summary: '获取冲稳保阈值配置（公开读）' })
  async get() {
    return this.service.getRushSafeStableThresholds();
  }

  @Put('rush-safe-stable-thresholds')
  @UseGuards(JwtAuthGuard, PoliciesGuard)
  @CheckPolicies((ability) => ability.can('manage', 'SystemConfig'))
  @ApiOperation({ summary: '更新冲稳保阈值配置（仅管理员）' })
  async set(@Body() dto: ThresholdsDto) {
    await this.service.setRushSafeStableThresholds(dto);
    return { success: true };
  }
}
```

- [ ] **Step 3: 写 module**

文件 `apps/server/src/modules/algorithm-config/algorithm-config.module.ts`：

```ts
import { Module } from '@nestjs/common';
import { AlgorithmConfigController } from './algorithm-config.controller';
import { AlgorithmConfigService } from './algorithm-config.service';

@Module({
  controllers: [AlgorithmConfigController],
  providers: [AlgorithmConfigService],
  exports: [AlgorithmConfigService],
})
export class AlgorithmConfigModule {}
```

- [ ] **Step 4: 校验 CASL ability 已含 SystemConfig**

```bash
cd apps/server && grep -rn "SystemConfig" src/modules/casl/
```

Expected: 看到 `SystemConfig` 在 `Subjects` union 中。如果没有，打开找到的 abilities 文件，把 `'SystemConfig'` 加入 Subjects 类型与 admin 的 `can('manage', 'SystemConfig')`。如果 CASL 用 class-based subjects，则把字符串改为对应的 model 名。

- [ ] **Step 5: 提交**

```bash
git add apps/server/src/modules/algorithm-config/
git commit -m "feat: AlgorithmConfig Controller + DTO + Module（admin 写权限）"
```

---

### Task 10: 在 AppModule 注册新模块

**Files:**
- Modify: `apps/server/src/app.module.ts`

- [ ] **Step 1: 编辑 app.module.ts**

在 import 段（约第 28 行 `TimelineModule` 那行下方）追加：

```ts
import { ScoreSegmentModule } from './modules/score-segment/score-segment.module';
import { AlgorithmConfigModule } from './modules/algorithm-config/algorithm-config.module';
```

在 `imports: [...]` 数组末尾（`TimelineModule,` 后）追加：

```ts
    ScoreSegmentModule,
    AlgorithmConfigModule,
```

- [ ] **Step 2: 启动 server 验证编译**

```bash
cd apps/server && pnpm build
```

Expected: 编译无报错。如有 TS 错误（多半是类型 import 路径），修正再编译。

- [ ] **Step 3: 启动 dev server，手测两个端点**

```bash
cd apps/server && pnpm dev &
sleep 5
curl -sS -X POST http://localhost:3001/api/v1/score-segment/lookup \
  -H "Content-Type: application/json" \
  -d '{"year":2025,"examType":"物理","score":580}'
echo ""
curl -sS http://localhost:3001/api/v1/algorithm-config/rush-safe-stable-thresholds
echo ""
```

Expected:
- lookup 返回 `{"year":2025,"examType":"物理","score":580,"rank":...,"percentile":...}`
- thresholds 返回 `{"rush":{"min":0.85,"max":0.95},...}`

注意：API 前缀如不是 `/api/v1`，看 `apps/server/src/main.ts` 里 `setGlobalPrefix` 设置确认。

```bash
kill %1 2>/dev/null
```

- [ ] **Step 4: 跑全部测试做最后确认**

```bash
cd apps/server && pnpm test
```

Expected: 现存测试 + 新增的 score-segment / algorithm-config 测试全部通过。

- [ ] **Step 5: 提交**

```bash
git add apps/server/src/app.module.ts
git commit -m "chore: 注册 ScoreSegmentModule / AlgorithmConfigModule"
```

---

## Frontend

### Task 11: 前端 API 客户端

**Files:**
- Create: `apps/web/src/services/score-segment.ts`
- Create: `apps/web/src/services/algorithm-config.ts`

- [ ] **Step 1: 写 score-segment client**

文件 `apps/web/src/services/score-segment.ts`：

```ts
import api from './api';

export type ExamType = '物理' | '历史' | '理科' | '文科';

export interface LookupResult {
  year: number;
  examType: ExamType;
  score: number;
  rank: number;
  percentile: number;
}

export interface EquivalentResult {
  base: LookupResult;
  equivalents: LookupResult[];
}

export const scoreSegmentApi = {
  lookup(params: { year: number; examType: ExamType; score?: number; rank?: number }) {
    return api.post<LookupResult>('/score-segment/lookup', params).then((r: any) => r as LookupResult);
  },
  equivalent(params: { baseYear: number; examType: ExamType; rank: number }) {
    return api.post<EquivalentResult>('/score-segment/equivalent', params).then((r: any) => r as EquivalentResult);
  },
};
```

注：上面的 `.then((r: any) => r as ...)` 是因为项目内 `api.post` 多半已通过 axios interceptor 解包出 `data` 字段；先按 `timeline-api.ts` 的写法对齐。如果实际 axios 返回未解包，跑联调时再调整为 `r.data`。

- [ ] **Step 2: 写 algorithm-config client**

文件 `apps/web/src/services/algorithm-config.ts`：

```ts
import api from './api';

export interface RushSafeStableThresholds {
  rush: { min: number; max: number };
  safe: { min: number; max: number };
  stable: { min: number; max: number };
}

export const algorithmConfigApi = {
  getRushSafeStableThresholds() {
    return api
      .get<RushSafeStableThresholds>('/algorithm-config/rush-safe-stable-thresholds')
      .then((r: any) => r as RushSafeStableThresholds);
  },
  setRushSafeStableThresholds(v: RushSafeStableThresholds) {
    return api.put('/algorithm-config/rush-safe-stable-thresholds', v);
  },
};
```

- [ ] **Step 3: 校验解包行为**

```bash
cd apps/web && grep -n "interceptors.response" src/services/api.ts | head -5
```

Expected: 若 `api.ts` 有形如 `response.data` 的 interceptor，那么上面 `.then((r) => r as T)` 是对的；否则需要用 `r.data`。看完后回到两个新文件按实际改一次。

- [ ] **Step 4: 提交**

```bash
git add apps/web/src/services/score-segment.ts apps/web/src/services/algorithm-config.ts
git commit -m "feat: 前端 score-segment / algorithm-config API 客户端"
```

---

### Task 12: useStudentRank Zustand Store

**Files:**
- Create: `apps/web/src/stores/studentRankStore.ts`

- [ ] **Step 1: 写 store**

文件 `apps/web/src/stores/studentRankStore.ts`：

```ts
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { ExamType, EquivalentResult } from '@/services/score-segment';

interface StudentRankState {
  /** 当前的成绩输入：分数 */
  score: number | null;
  /** 当前的成绩输入：科类 */
  examType: ExamType;
  /** 经服务端计算后的当年位次 */
  rank: number | null;
  /** 跨年等位换算结果（最近一次查询） */
  equivalents: EquivalentResult | null;
  /** 输入的基准年（默认当前年） */
  baseYear: number;

  /** 设置完整结果（一般在调用 lookup 后） */
  setRankResult(input: {
    score: number;
    examType: ExamType;
    rank: number;
    baseYear: number;
    equivalents: EquivalentResult | null;
  }): void;

  /** 仅切换科类（输入态时） */
  setExamType(examType: ExamType): void;

  /** 清空（登出 / 用户主动清除） */
  clear(): void;
}

const DEFAULT_YEAR = new Date().getFullYear();

export const useStudentRank = create<StudentRankState>()(
  persist(
    (set) => ({
      score: null,
      examType: '物理',
      rank: null,
      equivalents: null,
      baseYear: DEFAULT_YEAR,

      setRankResult: ({ score, examType, rank, baseYear, equivalents }) =>
        set({ score, examType, rank, baseYear, equivalents }),

      setExamType: (examType) => set({ examType }),

      clear: () =>
        set({
          score: null,
          rank: null,
          equivalents: null,
        }),
    }),
    {
      name: 'vh:student-rank',
      storage: createJSONStorage(() => localStorage),
      // 只持久化必要字段
      partialize: (s) => ({
        score: s.score,
        examType: s.examType,
        rank: s.rank,
        equivalents: s.equivalents,
        baseYear: s.baseYear,
      }),
    },
  ),
);
```

- [ ] **Step 2: 编译校验**

```bash
cd apps/web && pnpm tsc --noEmit
```

Expected: 无类型错误。

- [ ] **Step 3: 提交**

```bash
git add apps/web/src/stores/studentRankStore.ts
git commit -m "feat: useStudentRank Zustand 全局位次 store（持久化到 localStorage）"
```

---

### Task 13: 登出时清空学生位次

**Files:**
- Modify: `apps/web/src/stores/authStore.ts`

- [ ] **Step 1: 找到 logout 实现**

```bash
cd apps/web && grep -n "logout" src/stores/authStore.ts
```

记录 logout 函数所在行号。

- [ ] **Step 2: 在 logout 内追加清空学生位次**

打开 `apps/web/src/stores/authStore.ts`，在 logout 函数体内（清 token 之后、`set(...)` 之前）追加：

```ts
        // 清空跟当前用户绑定的学生位次缓存（避免共享设备污染）
        try {
          if (typeof localStorage !== 'undefined') {
            localStorage.removeItem('vh:student-rank');
          }
        } catch {}
```

不直接 import `useStudentRank` 是为了避免 store 间循环依赖；直接清 localStorage 同样有效（store 在下次 hydrate 时会拿空值）。

- [ ] **Step 3: 编译校验**

```bash
cd apps/web && pnpm tsc --noEmit
```

Expected: 无错。

- [ ] **Step 4: 提交**

```bash
git add apps/web/src/stores/authStore.ts
git commit -m "feat: 登出时清空 vh:student-rank 防止共享设备污染"
```

---

### Task 14: RankBadge 组件（冲稳保 chip 共享）

**Files:**
- Create: `apps/web/src/components/score/RankBadge.tsx`

- [ ] **Step 1: 写组件**

文件 `apps/web/src/components/score/RankBadge.tsx`：

```tsx
'use client';

export type Classification = 'rush' | 'safe' | 'stable';

interface RankBadgeProps {
  classification: Classification | null | undefined;
  size?: 'sm' | 'md';
  className?: string;
}

const CONFIG: Record<Classification, { label: string; bg: string; text: string }> = {
  rush:   { label: '冲', bg: 'bg-rush-fixed',   text: 'text-rush' },
  safe:   { label: '稳', bg: 'bg-safe-fixed',   text: 'text-safe' },
  stable: { label: '保', bg: 'bg-stable-fixed', text: 'text-stable' },
};

export function RankBadge({ classification, size = 'sm', className = '' }: RankBadgeProps) {
  if (!classification) return null;
  const c = CONFIG[classification];
  const sizeCls = size === 'sm' ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-1';
  return (
    <span
      className={`inline-flex items-center rounded ${sizeCls} ${c.bg} ${c.text} font-medium ${className}`}
    >
      ● {c.label}
    </span>
  );
}
```

注：Tailwind 颜色 `rush-fixed` / `safe-fixed` / `stable-fixed` 已在项目主题里定义（首页 page.tsx Features Section 用过 `bg-safe-fixed`/`bg-rush-fixed`/`bg-stable-fixed`）。如未定义对应 `text-rush` / `text-safe` / `text-stable`，跑预览时按 tailwind.config 里实际 token 调整。

- [ ] **Step 2: 提交**

```bash
git add apps/web/src/components/score/RankBadge.tsx
git commit -m "feat: RankBadge 冲稳保徽标组件"
```

---

### Task 15: EquivalentScores 子组件

**Files:**
- Create: `apps/web/src/components/score/EquivalentScores.tsx`

- [ ] **Step 1: 写组件**

文件 `apps/web/src/components/score/EquivalentScores.tsx`：

```tsx
'use client';

import type { EquivalentResult } from '@/services/score-segment';

interface Props {
  equivalents: EquivalentResult | null;
}

export function EquivalentScores({ equivalents }: Props) {
  if (!equivalents || equivalents.equivalents.length === 0) return null;
  return (
    <div className="text-[12px] text-text-tertiary">
      <div className="text-[11px] uppercase tracking-[1.5px] text-accent mb-1.5">历年等效分数</div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
        {equivalents.equivalents.map((e) => (
          <div key={e.year} className="flex items-baseline gap-1.5">
            <span className="text-text-tertiary">{e.year} {e.examType}</span>
            <span className="font-serif text-text font-semibold tabular-nums">{e.score}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 提交**

```bash
git add apps/web/src/components/score/EquivalentScores.tsx
git commit -m "feat: EquivalentScores 历年等效分数展示子组件"
```

---

### Task 16: RankInput 主组件

**Files:**
- Create: `apps/web/src/components/score/RankInput.tsx`

- [ ] **Step 1: 写组件**

文件 `apps/web/src/components/score/RankInput.tsx`：

```tsx
'use client';

import { useState } from 'react';
import { useStudentRank } from '@/stores/studentRankStore';
import { scoreSegmentApi, type ExamType } from '@/services/score-segment';
import { EquivalentScores } from './EquivalentScores';

const EXAM_TYPES: ExamType[] = ['物理', '历史', '理科', '文科'];
const CURRENT_YEAR = new Date().getFullYear();
// 2026 一分一段表通常 6 月底才出，前面用 2025 代理
const PROXY_YEAR = CURRENT_YEAR < 2026 || new Date().getMonth() < 5 ? 2025 : CURRENT_YEAR;

interface Props {
  variant?: 'default' | 'compact';
  className?: string;
}

export function RankInput({ variant = 'default', className = '' }: Props) {
  const { score, examType, rank, equivalents, setRankResult, setExamType, clear } = useStudentRank();
  const [inputScore, setInputScore] = useState<string>(score != null ? String(score) : '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const s = parseInt(inputScore, 10);
    if (!Number.isFinite(s) || s < 0 || s > 750) {
      setError('请输入 0-750 的分数');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const lookup = await scoreSegmentApi.lookup({
        year: PROXY_YEAR,
        examType,
        score: s,
      });
      const equiv = await scoreSegmentApi.equivalent({
        baseYear: PROXY_YEAR,
        examType,
        rank: lookup.rank,
      });
      setRankResult({
        score: s,
        examType,
        rank: lookup.rank,
        baseYear: PROXY_YEAR,
        equivalents: equiv,
      });
    } catch (e: any) {
      setError(e?.message ?? '查询失败');
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setInputScore('');
    clear();
  };

  // 已展开态（已查询过）
  if (rank != null && score != null) {
    return (
      <div className={`bg-white/[0.04] backdrop-blur-md border border-white/[0.12] rounded-xl p-4 ${className}`}>
        <div className="flex items-baseline justify-between mb-2">
          <div>
            <span className="text-white/50 text-[11px]">你的位次 ≈</span>
            <span className="font-serif text-white text-[22px] font-bold tabular-nums ml-2">
              {rank.toLocaleString()}
            </span>
          </div>
          <button
            onClick={reset}
            className="text-[11px] text-accent-light hover:text-accent underline"
          >
            修改
          </button>
        </div>
        <div className="text-[11px] text-white/40 mb-3">
          {score}分 · {examType} · 基于 {PROXY_YEAR} 数据
          {PROXY_YEAR !== CURRENT_YEAR && <span className="ml-1">（{CURRENT_YEAR} 真表未发布，用代理）</span>}
        </div>
        <div className="border-t border-white/10 pt-3">
          <EquivalentScores equivalents={equivalents} />
        </div>
      </div>
    );
  }

  // 输入态
  return (
    <div className={`bg-white/[0.04] backdrop-blur-md border border-white/[0.12] rounded-xl p-4 ${className}`}>
      <div className="text-[11px] uppercase tracking-[1.5px] text-accent-light mb-2">输入成绩</div>
      <div className="flex gap-2 mb-2">
        {EXAM_TYPES.map((t) => (
          <button
            key={t}
            onClick={() => setExamType(t)}
            className={`text-[12px] px-2 py-0.5 rounded ${
              examType === t ? 'bg-accent text-white' : 'bg-white/10 text-white/60 hover:bg-white/20'
            }`}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={750}
          placeholder="高考分数"
          value={inputScore}
          onChange={(e) => setInputScore(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          className="flex-1 bg-white/10 border border-white/15 rounded px-3 py-2 text-white text-[14px] tabular-nums placeholder:text-white/30 focus:outline-none focus:border-accent"
        />
        <button
          onClick={submit}
          disabled={loading}
          className="bg-accent hover:bg-accent-light text-white px-4 py-2 rounded text-[13px] font-medium disabled:opacity-50"
        >
          {loading ? '...' : '查位次'}
        </button>
      </div>
      {error && <div className="text-[11px] text-rush mt-1.5">{error}</div>}
      {variant === 'default' && (
        <div className="text-[10px] text-white/30 mt-2">
          仅基于历史数据估算，实际录取以当年情况为准
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 编译校验**

```bash
cd apps/web && pnpm tsc --noEmit
```

Expected: 无错。

- [ ] **Step 3: 提交**

```bash
git add apps/web/src/components/score/RankInput.tsx
git commit -m "feat: RankInput 主组件（输入态/展开态/调用 lookup+equivalent）"
```

---

### Task 17: 挂载到首页

**Files:**
- Modify: `apps/web/src/app/page.tsx`

- [ ] **Step 1: 编辑首页**

打开 `apps/web/src/app/page.tsx`，在文件顶部 import 段追加：

```ts
import { RankInput } from '@/components/score/RankInput';
```

定位到 `<TimelinePanel />` 那行（在 Right Column 内，约 109 行）。在 `<TimelinePanel />` 上方插入：

```tsx
            <div className="hidden md:flex md:flex-col md:gap-4 w-full">
              <RankInput variant="compact" />
              <TimelinePanel />
            </div>
```

并删掉原来的 `<div className="hidden md:flex"><TimelinePanel /></div>` 包裹（避免重复）。

最终 Right Column 应该是单一的 div，先放 RankInput 后放 TimelinePanel。

- [ ] **Step 2: 启动 dev 验证**

```bash
cd apps/web && pnpm dev &
sleep 3
```

打开浏览器 http://localhost:3000，确认首页 Hero 右侧显示 `RankInput` + `TimelinePanel` 两个面板。输入 580、点"查位次"应该出现位次数字 + 历年等效分数。

```bash
kill %1 2>/dev/null
```

- [ ] **Step 3: 提交**

```bash
git add apps/web/src/app/page.tsx
git commit -m "feat: 首页 Hero 右栏挂载 RankInput"
```

---

### Task 18: 挂载到 /universities 与 /majors 列表页

**Files:**
- Modify: `apps/web/src/app/(main)/universities/page.tsx`
- Modify: `apps/web/src/app/(main)/majors/page.tsx`

- [ ] **Step 1: 编辑 universities/page.tsx**

文件顶部 import 追加：

```ts
import { RankInput } from '@/components/score/RankInput';
```

找到左侧筛选区的容器（常见结构是 `<aside>` 或第一个 `<div className="...sidebar...">`）。在该容器内、最顶部插入：

```tsx
        <div className="sticky top-4 mb-4">
          <RankInput variant="compact" className="!bg-surface !border-border" />
        </div>
```

注：`!bg-surface !border-border` 用 important 覆盖白色 hero 内的暗色背景，让组件适配浅色页面。如果项目内没有 `bg-surface` 类，看 RankInput 的 `bg-white/[0.04]` 在浅色页是否可见，否则给 RankInput 加一个 `light` variant；MVP 阶段可以先观察效果再调整。

- [ ] **Step 2: 编辑 majors/page.tsx**

同样：顶部 import RankInput；在左侧 CategoryNav 容器顶部加上同样的 sticky RankInput 块。

- [ ] **Step 3: 浏览器验证**

```bash
cd apps/web && pnpm dev &
sleep 3
```

访问 http://localhost:3000/universities 和 /majors，确认左侧顶部出现 RankInput 且 sticky。

```bash
kill %1 2>/dev/null
```

- [ ] **Step 4: 提交**

```bash
git add apps/web/src/app/(main)/universities/page.tsx apps/web/src/app/(main)/majors/page.tsx
git commit -m "feat: 院校库/专业库列表左栏顶部挂载 RankInput（sticky）"
```

---

### Task 19: 挂载到 /universities/[id] 与 /majors/[id] 详情页

**Files:**
- Modify: `apps/web/src/app/(main)/universities/[id]/page.tsx`
- Modify: `apps/web/src/app/(main)/majors/[id]/page.tsx`

- [ ] **Step 1: 编辑 universities/[id]/page.tsx**

顶部 import RankInput。

定位 Hero 区（通常在文件前 1/3，含院校 logo / 名称 / tags 的 section）。在 Hero 右侧 KPI 区找一个 `<div>` 兄弟节点位置塞入：

```tsx
        <div className="md:w-[300px] md:flex-shrink-0">
          <RankInput variant="compact" />
        </div>
```

如 Hero 当前是单列布局，把 Hero 内容改为 `flex flex-col md:flex-row md:gap-6 md:items-start`，左侧是原内容、右侧是 RankInput。

- [ ] **Step 2: 编辑 majors/[id]/page.tsx**

同样在 Hero 区右侧塞入 RankInput。

- [ ] **Step 3: 浏览器验证**

```bash
cd apps/web && pnpm dev &
sleep 3
```

访问任意 `/universities/<id>` 与 `/majors/<id>`，确认 Hero 右侧出现 RankInput；输入分数后展开态显示位次。

```bash
kill %1 2>/dev/null
```

- [ ] **Step 4: 提交**

```bash
git add "apps/web/src/app/(main)/universities/[id]/page.tsx" "apps/web/src/app/(main)/majors/[id]/page.tsx"
git commit -m "feat: 院校/专业详情 Hero 右栏挂载 RankInput"
```

---

### Task 20: 管理员页 /admin/algorithm-config

**Files:**
- Create: `apps/web/src/app/(admin)/admin/algorithm-config/page.tsx`

- [ ] **Step 1: 写页面**

文件 `apps/web/src/app/(admin)/admin/algorithm-config/page.tsx`：

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, Form, InputNumber, Button, message, Space, Typography } from 'antd';
import { algorithmConfigApi, type RushSafeStableThresholds } from '@/services/algorithm-config';

const { Title, Paragraph } = Typography;

export default function AlgorithmConfigPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['algorithm-config', 'rush-safe-stable'],
    queryFn: () => algorithmConfigApi.getRushSafeStableThresholds(),
  });

  const [form] = Form.useForm();
  const [preview, setPreview] = useState<RushSafeStableThresholds | null>(null);

  useEffect(() => {
    if (data) {
      form.setFieldsValue({
        rushMin: data.rush.min,
        rushMax: data.rush.max,
        safeMax: data.safe.max,
        stableMax: data.stable.max,
      });
      setPreview(data);
    }
  }, [data, form]);

  const mutation = useMutation({
    mutationFn: (v: RushSafeStableThresholds) => algorithmConfigApi.setRushSafeStableThresholds(v),
    onSuccess: () => {
      message.success('保存成功');
      qc.invalidateQueries({ queryKey: ['algorithm-config'] });
    },
    onError: (e: any) => {
      message.error(e?.response?.data?.message ?? '保存失败');
    },
  });

  const onValuesChange = (_: any, all: any) => {
    const v: RushSafeStableThresholds = {
      rush:   { min: all.rushMin,  max: all.rushMax  },
      safe:   { min: all.rushMax,  max: all.safeMax  }, // safe.min = rush.max
      stable: { min: all.safeMax,  max: all.stableMax }, // stable.min = safe.max
    };
    setPreview(v);
  };

  const onFinish = () => {
    if (!preview) return;
    mutation.mutate(preview);
  };

  if (isLoading) return <Card loading />;

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <Title level={3}>冲稳保阈值配置</Title>
      <Paragraph type="secondary">
        ratio = 院校历史最低位次 / 学生位次。低于 rush.min 或高于 stable.max 的院校不显示徽标。
        约束：safe.min 自动等于 rush.max；stable.min 自动等于 safe.max（区间连续）。
      </Paragraph>

      <Card>
        <Form
          form={form}
          layout="vertical"
          onValuesChange={onValuesChange}
          onFinish={onFinish}
        >
          <Form.Item
            label="rush.min（冲的下限）"
            name="rushMin"
            rules={[{ required: true }, { type: 'number', min: 0, max: 5 }]}
          >
            <InputNumber step={0.01} style={{ width: 160 }} />
          </Form.Item>
          <Form.Item
            label="rush.max（冲↔稳分界）"
            name="rushMax"
            rules={[{ required: true }, { type: 'number', min: 0, max: 5 }]}
          >
            <InputNumber step={0.01} style={{ width: 160 }} />
          </Form.Item>
          <Form.Item
            label="safe.max（稳↔保分界）"
            name="safeMax"
            rules={[{ required: true }, { type: 'number', min: 0, max: 5 }]}
          >
            <InputNumber step={0.01} style={{ width: 160 }} />
          </Form.Item>
          <Form.Item
            label="stable.max（保的上限）"
            name="stableMax"
            rules={[{ required: true }, { type: 'number', min: 0, max: 5 }]}
          >
            <InputNumber step={0.01} style={{ width: 160 }} />
          </Form.Item>

          {preview && (
            <Card size="small" title="预览" style={{ marginBottom: 16, background: '#fafafa' }}>
              <Space direction="vertical" size={4}>
                <span>冲（橙）：[{preview.rush.min.toFixed(2)}, {preview.rush.max.toFixed(2)})</span>
                <span>稳（绿）：[{preview.safe.min.toFixed(2)}, {preview.safe.max.toFixed(2)}]</span>
                <span>保（蓝）：({preview.stable.min.toFixed(2)}, {preview.stable.max.toFixed(2)}]</span>
              </Space>
            </Card>
          )}

          <Button type="primary" htmlType="submit" loading={mutation.isPending}>
            保存
          </Button>
        </Form>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: 在 admin 侧栏加入口（如有侧栏）**

```bash
cd apps/web && grep -rn "algorithm-config\|/admin/config\|admin/users" "src/app/(admin)" -l
```

如能找到 admin layout 或 sidebar 文件，把"算法配置"链接（href=`/admin/algorithm-config`）加进菜单数组中。如未找到稳定的菜单注册点，跳过 —— 直接 URL 访问可达即可。

- [ ] **Step 3: 浏览器验证**

```bash
cd apps/web && pnpm dev &
sleep 3
```

以管理员账号登录后访问 http://localhost:3000/admin/algorithm-config：
- 加载后表单填入当前阈值（默认 0.85/0.95/0.95/1.05/1.05/1.20）
- 修改 rush.max 为 0.92 → 预览实时更新
- 点"保存" → 看到"保存成功"
- 刷新页面 → 新值持久化

```bash
kill %1 2>/dev/null
```

- [ ] **Step 4: 提交**

```bash
git add "apps/web/src/app/(admin)/admin/algorithm-config/page.tsx"
git commit -m "feat: /admin/algorithm-config 阈值调整页"
```

---

### Task 21: 端到端冒烟

**Files:** 无新文件

- [ ] **Step 1: 同时启动前后端**

```bash
cd apps/server && pnpm dev &
cd apps/web && pnpm dev &
sleep 8
```

- [ ] **Step 2: 走完一轮主流程**

浏览器操作清单（人工目测）：
1. 首页 Hero → RankInput 输入 580 物理 → 看到 "你的位次 ≈ XXXXX" + 4 个历年等效分数
2. 刷新页面 → 仍然记得位次（localStorage 持久化）
3. 进入 /universities → 左侧顶部 RankInput 已是展开态、显示同样位次
4. 修改科类为 "历史" + 重新输入 530 → 位次更新
5. 登出 → 刷新 → /universities 看到的是空输入态（authStore 登出已清空）
6. 重新登录 → 进入 /admin/algorithm-config → 修改 rush.min=0.80 保存 → 重新加载页面验证持久化
7. 数据库验证：

```bash
cd apps/server && pnpm prisma db execute --stdin <<'SQL'
SELECT key, value FROM system_configs WHERE key = 'rush_safe_stable_thresholds';
SQL
```

Expected: 看到 JSON `{"rush":{"min":0.8,"max":0.95},...}`

- [ ] **Step 3: 关掉 dev**

```bash
kill %1 %2 2>/dev/null
```

- [ ] **Step 4: 跑全部后端测试做收尾**

```bash
cd apps/server && pnpm test
```

Expected: 全部通过。

- [ ] **Step 5: 不需 commit（只做验证）**

---

### Task 22: 收尾 PR

**Files:** 无新文件

- [ ] **Step 1: 看待提交清单**

```bash
git status
git log --oneline master..HEAD
```

Expected: 看到 ~15 个 commit，全是 feat/chore 系列。

- [ ] **Step 2: 推送分支并开 PR（如适用）**

```bash
git push -u origin <current-branch>
```

然后用 `gh pr create` 写 PR 描述（Goal/Architecture 摘自本计划顶部 + Test plan 列出 Task 21 的 7 步）。

---

## Self-Review

**1. Spec coverage（§1 位次预估模块）：**
- §3.1 ETL → Task 1-2 ✓
- §3.2 算法服务 (scoreToRank/rankToScore/equivalent/classify + examType 映射) → Task 3-6 ✓
- §3.3 阈值配置（默认值 + 管理员可调 + RBAC + GET/PUT API） → Task 8-9, 20 ✓
- §3.4 RankInput 组件（输入态/展开态/Zustand/localStorage/登录登出双向同步） → Task 12-16 ✓ ;  StudentProfile 双向同步部分仅做了 logout 清空（Task 13），双向 push 到 StudentProfile.rank 在本计划未覆盖 —— 因为 PR-1 的目标是基础设施，与 StudentProfile 同步可在 PR-2 或后续单独迭代。可接受。
- §3.4 挂载位置（5 个页面） → Task 17, 18, 19 ✓
- §3.5 接口（lookup / equivalent / get / put） → Task 7, 9 ✓
- 边界：分数超出 / 位次超出 / 2026 代理 → Task 4 (scoreToRank/rankToScore boundary tests), Task 16 PROXY_YEAR 文案 ✓
- 风险 §9.1 "基于 2025 数据估算"提示 → Task 16 RankInput 展开态文案 ✓
- 风险 §9.6 "登出清空 localStorage" → Task 13 ✓

**2. Placeholder scan：** 无 TBD/TODO；每段代码都是完整实现；测试用例都给了具体期望值。

**3. Type consistency：**
- `ExamType` 在 backend (`exam-type.helper.ts`) 与 frontend (`services/score-segment.ts`) 字符串字面量一致：'物理' | '历史' | '理科' | '文科' ✓
- `RushSafeStableConfig` 后端 `score-segment.service.ts` 导出，`algorithm-config.service.ts` import；前端独立定义为 `RushSafeStableThresholds`，结构相同 ✓
- store 名 `useStudentRank`、文件名 `studentRankStore.ts`、localStorage key `vh:student-rank` 在 Task 12, 13, 16, 17, 18, 19 引用一致 ✓
- `classify` 返回类型 `'rush' | 'safe' | 'stable' | null` 在 service 与 RankBadge 的 `Classification` 一致 ✓

**4. 已知非阻塞性遗漏（接受为后续工作）：**
- 双向同步 StudentProfile.rank ←→ store：spec §3.4 提到，但跨账号 / profile API 集成属 PR-2 范围
- Admin sidebar 菜单条目：Task 20 Step 2 是 best effort，找不到则跳过
- API 拦截器解包行为校验：Task 11 Step 3 提示开发者按实际调整

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-30-rank-prediction-module.md`. Two execution options:

**1. Subagent-Driven (recommended)** — 我每个 Task 派一个新的子 Agent 来跑，子 Agent 之间互不污染上下文；任务完成后我做两阶段审查，迭代快

**2. Inline Execution** — 在当前会话里跑，按 checkpoint 批量推进

Which approach?
