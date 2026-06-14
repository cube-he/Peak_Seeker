# 意向专业/院校「层次不匹配」标记 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 根据学生分数算出「能上的层次」(本科/专科)，在意向专业梯队、意向院校、专业库 /majors 卡片及其搜索下拉里，给层次对不上的项加 `(本科)`/`(专科)` 括号备注。

**Architecture:** 后端算两样东西——学生的 `eligibleLevel`(挂到 `GET /students/:id` 响应)，以及每个专业名/院校在川按科类的层次(挂到两个 picker-options)。前端一个纯函数 `levelMismatchTag` 统一判定，4 处渲染调它。只标记不拦截；没分/没线/兼有→不标。

**Tech Stack:** NestJS + Prisma(MySQL) + Redis(后端)；Next.js + React + Ant Design + React Query(前端)；Jest / React Testing Library。

设计依据：`docs/superpowers/specs/2026-06-14-preference-level-mismatch-marking-design.md`

---

## 关键类型约定（全程一致，勿改名）

后端 (`enrollment-levels.ts`)：
- `type MajorLevel = '本科' | '专科' | '兼有'`
- `type OptionLevels = { phy: MajorLevel | null; his: MajorLevel | null }`

前端 (`@/lib/level-mismatch`)：
- `type ItemLevel = '本科' | '专科' | '兼有'`
- `type EligibleLevel = '本科' | '专科' | null`
- `type OptionLevels = { phy: ItemLevel | null; his: ItemLevel | null }`

科类→lane：`PHYSICS→phy`、`HISTORY→his`、其余(含 COMPREHENSIVE_*/null)→`null`(不标)。
批次→层次：`batch LIKE '本科%'`→本科；`batch LIKE '高职%' OR LIKE '%专科%'`→专科。

---

## File Structure

**后端**
- Create: `apps/server/src/modules/enrollment-level/enrollment-levels.ts` — 层次分类 + 按名字/院校的在川层次 map（含 Redis 缓存）。纯工具文件，无 Nest module。
- Create: `apps/server/src/modules/enrollment-level/enrollment-levels.spec.ts`
- Create: `apps/server/src/modules/student/eligible-level.ts` — `eligibleLevelFromScore` 纯函数。
- Create: `apps/server/src/modules/student/eligible-level.spec.ts`
- Modify: `apps/server/src/modules/major/major.service.ts:304-325` — picker-options 附 `levels`。
- Modify: `apps/server/src/modules/major/dto/picker-option.dto.ts` — DTO 加 `levels`。
- Modify: `apps/server/src/modules/university/university.service.ts:529-550` — picker-options 附 `levels`。
- Modify: `apps/server/src/modules/university/dto/picker-option.dto.ts` — DTO 加 `levels`。
- Modify: `apps/server/src/modules/student/student.service.ts:377-443` — `findById` 附 `eligibleLevel`。

**前端**
- Create: `apps/web/src/lib/level-mismatch.ts` — `levelMismatchTag` / `laneOf` / 类型。
- Create: `apps/web/src/lib/__tests__/level-mismatch.test.ts`
- Modify: `apps/web/src/services/picker.ts` — `MajorPickerOption`/`UniversityPickerOption` 加 `levels`。
- Modify: `apps/web/src/components/student/picker/AutoSavePicker.tsx:7-10` — `PickerOption` 加 `levels`。
- Modify: `apps/web/src/components/student/picker/options/useMajorOptions.ts` / `useUniversityOptions.ts` — 透传 `levels`。
- Modify: `apps/web/src/app/(main)/majors/page.tsx` — 卡片标题旁标层次。
- Modify: `apps/web/src/components/student/preferred-majors/PreferredMajorTierEditor.tsx` — chip + 下拉选项标层次。
- Modify: `apps/web/src/components/student/preferred-majors/PreferredMajorTierFormItem.tsx` — 透传 `eligibleLevel`/`examType`。
- Modify: `apps/web/src/app/(teacher)/teacher/students/[id]/page.tsx` — 给 `PreferenceFields` 传 props，意向院校 Select 用标记后的 options。

样式：标记只渲染文本 + className（`pm-chip-level` / `major-level-flag`），最终视觉交 claude-design，本计划不写颜色。

---

## Task 1: 后端层次分类纯函数 `classifyLevel`

**Files:**
- Create: `apps/server/src/modules/enrollment-level/enrollment-levels.ts`
- Test: `apps/server/src/modules/enrollment-level/enrollment-levels.spec.ts`

- [ ] **Step 1: 写失败测试**

`apps/server/src/modules/enrollment-level/enrollment-levels.spec.ts`:
```ts
import { classifyLevel } from './enrollment-levels';

describe('classifyLevel', () => {
  it('本科+专科都有 → 兼有', () => {
    expect(classifyLevel(3, 2)).toBe('兼有');
  });
  it('只有本科 → 本科', () => {
    expect(classifyLevel(5, 0)).toBe('本科');
  });
  it('只有专科 → 专科', () => {
    expect(classifyLevel(0, 4)).toBe('专科');
  });
  it('都没有 → null', () => {
    expect(classifyLevel(0, 0)).toBeNull();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter server test -- enrollment-levels`
Expected: FAIL（`classifyLevel` 未定义 / 模块不存在）

- [ ] **Step 3: 写最小实现**

`apps/server/src/modules/enrollment-level/enrollment-levels.ts`:
```ts
export type MajorLevel = '本科' | '专科' | '兼有';
export type OptionLevels = { phy: MajorLevel | null; his: MajorLevel | null };

/** 由本科批次计数 bk、专科批次计数 zk 归约出层次。 */
export function classifyLevel(bk: number, zk: number): MajorLevel | null {
  if (bk > 0 && zk > 0) return '兼有';
  if (bk > 0) return '本科';
  if (zk > 0) return '专科';
  return null;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm --filter server test -- enrollment-levels`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add apps/server/src/modules/enrollment-level/enrollment-levels.ts apps/server/src/modules/enrollment-level/enrollment-levels.spec.ts
git commit -m "feat(level): classifyLevel helper for 本/专科 attribution"
```

---

## Task 2: 在川层次 map（专业名 / 院校）+ Redis 缓存

为 picker 提供「专业名 → 各科类层次」「院校 id → 各科类层次」两张表。一次原始 SQL 扫四川最新计划年。

**Files:**
- Modify: `apps/server/src/modules/enrollment-level/enrollment-levels.ts`

- [ ] **Step 1: 加实现（无单测，靠 Task 3/4 的 service 测试覆盖）**

在 `enrollment-levels.ts` 追加：
```ts
import { Prisma, PrismaClient } from '@prisma/client';

type RedisLike = {
  getCache<T>(key: string): Promise<T | null>;
  setCache(key: string, value: unknown, ttlSeconds: number): Promise<void>;
};

const PROVINCE = '四川';
const TTL = 86400;

type RawRow = { key: string; bk: number; zk: number; lane: string };

// 按 lane(物理/历史) 把 (key, bk, zk) 行折叠成 { phy, his }
function foldRows(rows: RawRow[]): Record<string, OptionLevels> {
  const out: Record<string, OptionLevels> = {};
  for (const r of rows) {
    const lane = r.lane === '物理' ? 'phy' : r.lane === '历史' ? 'his' : null;
    if (!lane) continue;
    const level = classifyLevel(Number(r.bk), Number(r.zk));
    if (!out[r.key]) out[r.key] = { phy: null, his: null };
    out[r.key][lane] = level;
  }
  return out;
}

async function latestScYear(prisma: PrismaClient): Promise<number | null> {
  const agg = await prisma.enrollmentPlan.aggregate({
    _max: { year: true },
    where: { province: PROVINCE },
  });
  return agg._max.year ?? null;
}

/** 专业名 → 在川各科类层次。MySQL 原始聚合，缓存于 Redis。 */
export async function getMajorLevelMap(
  prisma: PrismaClient,
  redis: RedisLike,
): Promise<Record<string, OptionLevels>> {
  const cacheKey = 'enroll-level:major:四川';
  const cached = await redis.getCache<Record<string, OptionLevels>>(cacheKey);
  if (cached) return cached;
  const year = await latestScYear(prisma);
  if (year == null) return {};
  const rows = await prisma.$queryRaw<RawRow[]>(Prisma.sql`
    SELECT ep.major_name AS \`key\`,
           CASE WHEN ep.subjects LIKE '%历史%' THEN '历史' ELSE '物理' END AS lane,
           SUM(ep.batch LIKE '本科%') AS bk,
           SUM(ep.batch LIKE '高职%' OR ep.batch LIKE '%专科%') AS zk
    FROM enrollment_plans ep
    WHERE ep.province = ${PROVINCE} AND ep.year = ${year}
      AND (ep.subjects LIKE '%物理%' OR ep.subjects LIKE '%历史%')
    GROUP BY ep.major_name, lane
  `);
  const map = foldRows(rows);
  await redis.setCache(cacheKey, map, TTL);
  return map;
}

/** 院校 id → 在川各科类层次。 */
export async function getUniversityLevelMap(
  prisma: PrismaClient,
  redis: RedisLike,
): Promise<Record<number, OptionLevels>> {
  const cacheKey = 'enroll-level:university:四川';
  const cached = await redis.getCache<Record<number, OptionLevels>>(cacheKey);
  if (cached) return cached;
  const year = await latestScYear(prisma);
  if (year == null) return {};
  const rows = await prisma.$queryRaw<RawRow[]>(Prisma.sql`
    SELECT CAST(ep.university_id AS CHAR) AS \`key\`,
           CASE WHEN ep.subjects LIKE '%历史%' THEN '历史' ELSE '物理' END AS lane,
           SUM(ep.batch LIKE '本科%') AS bk,
           SUM(ep.batch LIKE '高职%' OR ep.batch LIKE '%专科%') AS zk
    FROM enrollment_plans ep
    WHERE ep.province = ${PROVINCE} AND ep.year = ${year}
      AND (ep.subjects LIKE '%物理%' OR ep.subjects LIKE '%历史%')
    GROUP BY ep.university_id, lane
  `);
  const folded = foldRows(rows);
  const out: Record<number, OptionLevels> = {};
  for (const [k, v] of Object.entries(folded)) out[Number(k)] = v;
  return await redis.setCache(cacheKey, out, TTL).then(() => out);
}
```

> 说明：`SUM(boolean expr)` 在 MySQL 里把每行的真值当 1/0 累加，等价于「满足条件的行数」。`subjects` 同时含物理与历史的极少数行会被 `CASE` 归到历史 lane——可接受（保守，不误标）。

- [ ] **Step 2: 编译检查**

Run: `pnpm --filter server build`
Expected: 通过（无类型错误）。若 `$queryRaw` 行类型报错，确认 `RawRow` 的 `bk/zk` 用 `number` 且实现里 `Number()` 兜底。

- [ ] **Step 3: 提交**

```bash
git add apps/server/src/modules/enrollment-level/enrollment-levels.ts
git commit -m "feat(level): in-Sichuan level maps for majors/universities with redis cache"
```

---

## Task 3: 专业 picker-options 附 `levels`

**Files:**
- Modify: `apps/server/src/modules/major/dto/picker-option.dto.ts`
- Modify: `apps/server/src/modules/major/major.service.ts:304-325`
- Test: `apps/server/src/modules/major/major.service.spec.ts`（若不存在则 Create）

- [ ] **Step 1: 写失败测试**

在 major 的 service 测试里加（如无测试文件则新建，复用本仓既有 service spec 的 mock 风格）。`apps/server/src/modules/major/major.service.spec.ts`:
```ts
import { MajorService } from './major.service';
import * as levels from '../enrollment-level/enrollment-levels';

describe('MajorService.getPickerOptions levels', () => {
  it('给每个专业名附上在川层次', async () => {
    const prisma = {
      major: {
        findMany: jest.fn().mockResolvedValue([
          { id: 1, code: '0809', name: '计算机科学与技术' },
          { id: 2, code: '6301', name: '护理' },
        ]),
      },
    } as any;
    const redis = { getCache: jest.fn(), setCache: jest.fn() } as any;
    jest.spyOn(levels, 'getMajorLevelMap').mockResolvedValue({
      计算机科学与技术: { phy: '本科', his: '本科' },
      护理: { phy: '兼有', his: '专科' },
    });
    // constructor: (prisma, redis, admissionService) — 第三参本用例用不到, 传 {} as any
    const svc = new MajorService(prisma, redis, {} as any);
    const out = await svc.getPickerOptions();
    expect(out.find((o) => o.name === '计算机科学与技术')!.levels).toEqual({ phy: '本科', his: '本科' });
    expect(out.find((o) => o.name === '护理')!.levels).toEqual({ phy: '兼有', his: '专科' });
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter server test -- major.service`
Expected: FAIL（`levels` 字段为 undefined）

- [ ] **Step 3: 改 DTO**

`apps/server/src/modules/major/dto/picker-option.dto.ts` 在 `name` 字段后追加：
```ts
  @ApiProperty({ description: '在川各科类层次 {phy,his}: 本科|专科|兼有|null', required: false, nullable: true })
  levels?: { phy: '本科' | '专科' | '兼有' | null; his: '本科' | '专科' | '兼有' | null } | null;
```

- [ ] **Step 4: 改 service**

`major.service.ts`：顶部 import：
```ts
import { getMajorLevelMap, OptionLevels } from '../enrollment-level/enrollment-levels';
```
把 `getPickerOptions` 的返回类型与结尾改为（替换 304 行签名与 324 行 return）：
```ts
  async getPickerOptions(
    batches?: string[],
  ): Promise<{ id: number; code: string | null; name: string; levels: OptionLevels | null }[]> {
```
```ts
    // alphabetical for picker display + 附在川层次
    const levelMap = await getMajorLevelMap(this.prisma, this.redis);
    return Array.from(seen.values())
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
      .map((r) => ({ ...r, levels: levelMap[r.name] ?? null }));
```

- [ ] **Step 5: 跑测试确认通过**

Run: `pnpm --filter server test -- major.service`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add apps/server/src/modules/major/dto/picker-option.dto.ts apps/server/src/modules/major/major.service.ts apps/server/src/modules/major/major.service.spec.ts
git commit -m "feat(major): attach in-Sichuan levels to picker-options"
```

---

## Task 4: 院校 picker-options 附 `levels`

**Files:**
- Modify: `apps/server/src/modules/university/dto/picker-option.dto.ts`
- Modify: `apps/server/src/modules/university/university.service.ts:529-550`
- Test: `apps/server/src/modules/university/university.service.spec.ts`（若不存在则 Create）

- [ ] **Step 1: 写失败测试**

`apps/server/src/modules/university/university.service.spec.ts`:
```ts
import { UniversityService } from './university.service';
import * as levels from '../enrollment-level/enrollment-levels';

describe('UniversityService.getPickerOptions levels', () => {
  it('按 university_id 附在川层次', async () => {
    const prisma = {
      university: {
        findMany: jest.fn().mockResolvedValue([
          { id: 10, code: '4101', name: '四川大学', renameHistory: null },
          { id: 20, code: '5199', name: '成都职业技术学院', renameHistory: null },
        ]),
      },
    } as any;
    const redis = { getCache: jest.fn(), setCache: jest.fn() } as any;
    jest.spyOn(levels, 'getUniversityLevelMap').mockResolvedValue({
      10: { phy: '本科', his: '本科' },
      20: { phy: '专科', his: '专科' },
    });
    // constructor: (prisma, redis, admissionService) — 第三参本用例用不到, 传 {} as any
    const svc = new UniversityService(prisma, redis, {} as any);
    const out = await svc.getPickerOptions();
    expect(out.find((o) => o.id === 10)!.levels).toEqual({ phy: '本科', his: '本科' });
    expect(out.find((o) => o.id === 20)!.levels).toEqual({ phy: '专科', his: '专科' });
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter server test -- university.service`
Expected: FAIL

- [ ] **Step 3: 改 DTO**

`apps/server/src/modules/university/dto/picker-option.dto.ts` 在 `renameHistory` 后追加：
```ts
  @ApiProperty({ description: '在川各科类层次 {phy,his}: 本科|专科|兼有|null', required: false, nullable: true })
  levels?: { phy: '本科' | '专科' | '兼有' | null; his: '本科' | '专科' | '兼有' | null } | null;
```

- [ ] **Step 4: 改 service**

`university.service.ts`：顶部 import：
```ts
import { getUniversityLevelMap, OptionLevels } from '../enrollment-level/enrollment-levels';
```
改 `getPickerOptions` 返回类型（529 行）与结尾 return（549 行）：
```ts
  async getPickerOptions(
    batches?: string[],
  ): Promise<{ id: number; code: string | null; name: string; renameHistory: string | null; levels: OptionLevels | null }[]> {
```
```ts
    const levelMap = await getUniversityLevelMap(this.prisma, this.redis);
    return Array.from(seen.values())
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
      .map((r) => ({ ...r, levels: levelMap[r.id] ?? null }));
```

- [ ] **Step 5: 跑测试确认通过**

Run: `pnpm --filter server test -- university.service`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add apps/server/src/modules/university/dto/picker-option.dto.ts apps/server/src/modules/university/university.service.ts apps/server/src/modules/university/university.service.spec.ts
git commit -m "feat(university): attach in-Sichuan levels to picker-options"
```

---

## Task 5: 学生 `eligibleLevel` 纯函数

**Files:**
- Create: `apps/server/src/modules/student/eligible-level.ts`
- Test: `apps/server/src/modules/student/eligible-level.spec.ts`

- [ ] **Step 1: 写失败测试**

`apps/server/src/modules/student/eligible-level.spec.ts`:
```ts
import { eligibleLevelFromScore } from './eligible-level';

describe('eligibleLevelFromScore', () => {
  it('过本科线 → 本科', () => {
    expect(eligibleLevelFromScore(560, 541)).toBe('本科');
  });
  it('等于本科线 → 本科', () => {
    expect(eligibleLevelFromScore(541, 541)).toBe('本科');
  });
  it('没过本科线 → 专科', () => {
    expect(eligibleLevelFromScore(400, 541)).toBe('专科');
  });
  it('没填分 → null', () => {
    expect(eligibleLevelFromScore(null, 541)).toBeNull();
  });
  it('查不到本科线 → null', () => {
    expect(eligibleLevelFromScore(560, null)).toBeNull();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter server test -- eligible-level`
Expected: FAIL

- [ ] **Step 3: 写最小实现**

`apps/server/src/modules/student/eligible-level.ts`:
```ts
/** 学生「能上的层次」：过本科线=本科，没过=专科，缺分/缺线=null。 */
export function eligibleLevelFromScore(
  totalScore: number | null | undefined,
  undergradLine: number | null | undefined,
): '本科' | '专科' | null {
  if (totalScore == null || undergradLine == null) return null;
  return totalScore >= undergradLine ? '本科' : '专科';
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm --filter server test -- eligible-level`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add apps/server/src/modules/student/eligible-level.ts apps/server/src/modules/student/eligible-level.spec.ts
git commit -m "feat(student): eligibleLevelFromScore pure helper"
```

---

## Task 6: `findById` 查本科线并附 `eligibleLevel`

**Files:**
- Modify: `apps/server/src/modules/student/student.service.ts:377-443`

- [ ] **Step 1: 加私有方法 + 注入字段（实现，followed by 手测）**

在 `student.service.ts` 顶部 import：
```ts
import { eligibleLevelFromScore } from './eligible-level';
```
在 `findById` 内、`const rankCheck = ...`(429 行) 之后插入：
```ts
    const eligibleLevel = await this.computeEligibleLevel(profile);
```
在 return 对象(433-442)里追加一行：
```ts
      eligibleLevel,
```
在 `findById` 方法之后、`computeProvenanceUpdates` 之前新增私有方法（本科线查询复用 batch-config 的别名 + 年份降级口径）：
```ts
  /** 查该生本科批控制线并判定 eligibleLevel。仅支持物理/历史；其余科类/缺分→null。 */
  private async computeEligibleLevel(profile: {
    totalScore: number | null;
    examType: string | null;
    examYear: number | null;
    province: string | null;
  }): Promise<'本科' | '专科' | null> {
    if (profile.totalScore == null) return null;
    const examTypeAliases =
      profile.examType === 'PHYSICS' ? ['物理', '物理类']
      : profile.examType === 'HISTORY' ? ['历史', '历史类']
      : null;
    if (!examTypeAliases) return null;
    const province = profile.province ?? '四川';
    const examYear = profile.examYear ?? 2026;
    const batchAliases = ['本科批次', '本科批', '本科'];
    const findLine = async (year: number) => {
      const row = await this.prisma.batchLine.findFirst({
        where: { year, province, batch: { in: batchAliases }, examType: { in: examTypeAliases } },
        select: { score: true },
      });
      return row?.score ?? null;
    };
    const line = (await findLine(examYear)) ?? (await findLine(examYear - 1));
    return eligibleLevelFromScore(profile.totalScore, line);
  }
```

- [ ] **Step 2: 编译 + 现有学生测试不回归**

Run: `pnpm --filter server build`
Expected: 通过。
Run: `pnpm --filter server test -- student.service`
Expected: 现有用例 PASS（若有 `findById` 用例因新增 `eligibleLevel` 字段断言失败，按需放宽断言或补 mock `batchLine.findFirst`）。

- [ ] **Step 3: 提交**

```bash
git add apps/server/src/modules/student/student.service.ts
git commit -m "feat(student): expose eligibleLevel on student detail"
```

---

## Task 7: 前端共享判定工具 `level-mismatch`

**Files:**
- Create: `apps/web/src/lib/level-mismatch.ts`
- Test: `apps/web/src/lib/__tests__/level-mismatch.test.ts`

- [ ] **Step 1: 写失败测试**

`apps/web/src/lib/__tests__/level-mismatch.test.ts`:
```ts
import { laneOf, levelMismatchTag } from '../level-mismatch';

describe('laneOf', () => {
  it('PHYSICS→phy, HISTORY→his, 其余→null', () => {
    expect(laneOf('PHYSICS')).toBe('phy');
    expect(laneOf('HISTORY')).toBe('his');
    expect(laneOf('COMPREHENSIVE_SCIENCE')).toBeNull();
    expect(laneOf(null)).toBeNull();
  });
});

describe('levelMismatchTag', () => {
  it('本科生 × 专科项 → 专科', () => {
    expect(levelMismatchTag('专科', '本科')).toBe('专科');
  });
  it('专科生 × 本科项 → 本科', () => {
    expect(levelMismatchTag('本科', '专科')).toBe('本科');
  });
  it('同层 → null', () => {
    expect(levelMismatchTag('本科', '本科')).toBeNull();
  });
  it('兼有 → null', () => {
    expect(levelMismatchTag('兼有', '本科')).toBeNull();
  });
  it('eligibleLevel=null 或 itemLevel 缺失 → null', () => {
    expect(levelMismatchTag('专科', null)).toBeNull();
    expect(levelMismatchTag(null, '本科')).toBeNull();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter web test -- level-mismatch`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 写最小实现**

`apps/web/src/lib/level-mismatch.ts`:
```ts
export type ItemLevel = '本科' | '专科' | '兼有';
export type EligibleLevel = '本科' | '专科' | null;
export type OptionLevels = { phy: ItemLevel | null; his: ItemLevel | null };

/** 科类枚举 → 层次 lane。仅物理/历史可标。 */
export function laneOf(examType: string | null | undefined): 'phy' | 'his' | null {
  if (examType === 'PHYSICS') return 'phy';
  if (examType === 'HISTORY') return 'his';
  return null;
}

/** 条目层次与学生可上层次对不上时，返回要显示在括号里的层次；否则 null。 */
export function levelMismatchTag(
  itemLevel: ItemLevel | null | undefined,
  eligible: EligibleLevel,
): '本科' | '专科' | null {
  if (!eligible || !itemLevel || itemLevel === '兼有') return null;
  return itemLevel !== eligible ? itemLevel : null;
}

/** 从 option.levels + 科类 + eligibleLevel 解析出某名字的标记（给 picker/编辑器用）。 */
export function tagForLevels(
  levels: OptionLevels | null | undefined,
  examType: string | null | undefined,
  eligible: EligibleLevel,
): '本科' | '专科' | null {
  const lane = laneOf(examType);
  if (!lane || !levels) return null;
  return levelMismatchTag(levels[lane], eligible);
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm --filter web test -- level-mismatch`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add apps/web/src/lib/level-mismatch.ts apps/web/src/lib/__tests__/level-mismatch.test.ts
git commit -m "feat(web): level-mismatch util for preference marking"
```

---

## Task 8: picker 类型 + hooks 透传 `levels`

**Files:**
- Modify: `apps/web/src/services/picker.ts:3-4`
- Modify: `apps/web/src/components/student/picker/AutoSavePicker.tsx:7-10`
- Modify: `apps/web/src/components/student/picker/options/useMajorOptions.ts:11-14`
- Modify: `apps/web/src/components/student/picker/options/useUniversityOptions.ts:12-15`

- [ ] **Step 1: 扩展类型 + 透传（实现，followed by 编译验证）**

`picker.ts`：顶部 import 并扩展两个 interface：
```ts
import type { OptionLevels } from '@/lib/level-mismatch';
```
```ts
export interface UniversityPickerOption { id: number; code: string | null; name: string; renameHistory?: string | null; levels?: OptionLevels | null; }
export interface MajorPickerOption { id: number; code: string | null; name: string; levels?: OptionLevels | null; }
```

`AutoSavePicker.tsx`：`PickerOption` 加 `levels`：
```ts
import type { OptionLevels } from '@/lib/level-mismatch';

export interface PickerOption {
  label: string;
  value: string;
  levels?: OptionLevels | null;
}
```

`useMajorOptions.ts`：option map 透传 levels：
```ts
  const options: PickerOption[] = (data ?? []).map((m) => ({
    label: m.name,
    value: m.name,
    levels: m.levels ?? null,
  }));
```

`useUniversityOptions.ts`：同样：
```ts
  const options: PickerOption[] = (data ?? []).map((u) => ({
    label: u.name,
    value: u.name,
    levels: u.levels ?? null,
  }));
```

- [ ] **Step 2: 编译验证**

Run: `pnpm --filter web build`（或 `pnpm --filter web tsc --noEmit`，按仓库脚本）
Expected: 通过。

- [ ] **Step 3: 提交**

```bash
git add apps/web/src/services/picker.ts apps/web/src/components/student/picker/AutoSavePicker.tsx apps/web/src/components/student/picker/options/useMajorOptions.ts apps/web/src/components/student/picker/options/useUniversityOptions.ts
git commit -m "feat(web): carry option levels through picker types and hooks"
```

---

## Task 9: 专业库 /majors 卡片标层次

**Files:**
- Modify: `apps/web/src/app/(main)/majors/page.tsx`（`MajorCard` 标题区 ~290 行；卡片调用处；workStudent eligibleLevel）
- Test: `apps/web/src/app/(main)/majors/__tests__/major-level-flag.test.tsx`（若该目录无测试基建则改为手测，见 Step 4 备注）

- [ ] **Step 1: 写失败测试（组件级，渲染 MajorCard 验证后缀）**

> 若 `MajorCard` 未 export，先在 page.tsx 里 `export function MajorCard(...)`（仅加 export 关键字，不改逻辑）。
`apps/web/src/app/(main)/majors/__tests__/major-level-flag.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import { MajorCard } from '../page';

const baseMajor = { id: 1, name: '护理', code: '6301', category: '医学', level: '专科' };
const noop = () => {};
const props = {
  favorited: false, onToggleFav: noop, inCompare: false, onToggleCompare: noop,
  poolEnabled: false, inPool: false, onAddToPool: noop, signal: null,
};

it('本科生看专科专业 → 显示 (专科)', () => {
  render(<MajorCard major={baseMajor} eligibleLevel="本科" {...props} />);
  expect(screen.getByText('（专科）')).toBeInTheDocument();
});

it('专科生看专科专业 → 不标', () => {
  render(<MajorCard major={baseMajor} eligibleLevel="专科" {...props} />);
  expect(screen.queryByText('（专科）')).toBeNull();
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter web test -- major-level-flag`
Expected: FAIL

- [ ] **Step 3: 实现**

`page.tsx` 顶部 import：
```ts
import { levelMismatchTag, type EligibleLevel } from '@/lib/level-mismatch';
```
`MajorCard` 的 props 解构加 `eligibleLevel`（类型 `EligibleLevel`，调用方未传时默认 `null`）：
```ts
  eligibleLevel = null,
}: {
  major: any;
  eligibleLevel?: EligibleLevel;
  // ...其余不变
```
在标题 `<h3>{major.name}</h3>`(290-292) 之后插入：
```tsx
          {(() => {
            const flag = levelMismatchTag(major.level, eligibleLevel);
            return flag ? <span className="major-level-flag text-[12px] text-text-muted">（{flag}）</span> : null;
          })()}
```
找到渲染 `<MajorCard ... />` 的列表 map（搜索 `<MajorCard`），加 `eligibleLevel={workStudent?.eligibleLevel ?? null}`。

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm --filter web test -- major-level-flag`
Expected: PASS
> 备注：若 `(main)/majors` 缺组件测试基建（无 jsdom/RTL 配置），跳过 Step 1-2、4 的自动化，改为手测：本地起 web，老师选一个过本科线的学生，/majors 搜专科专业，确认标题旁出现「（专科）」。

- [ ] **Step 5: 提交**

```bash
git add "apps/web/src/app/(main)/majors/page.tsx" apps/web/src/app/\(main\)/majors/__tests__/major-level-flag.test.tsx
git commit -m "feat(majors): flag level mismatch on major cards"
```

---

## Task 10: 意向专业梯队编辑器标层次（chip + 下拉）

**Files:**
- Modify: `apps/web/src/components/student/preferred-majors/PreferredMajorTierEditor.tsx`
- Modify: `apps/web/src/components/student/preferred-majors/PreferredMajorTierFormItem.tsx`
- Test: `apps/web/src/components/student/preferred-majors/__tests__/tier-level-flag.test.tsx`

- [ ] **Step 1: 写失败测试**

`apps/web/src/components/student/preferred-majors/__tests__/tier-level-flag.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import PreferredMajorTierEditor from '../PreferredMajorTierEditor';

const options = [
  { label: '护理', value: '护理', levels: { phy: '专科', his: '专科' } },
  { label: '临床医学', value: '临床医学', levels: { phy: '本科', his: '本科' } },
];

it('本科生意向池里的专科专业 chip 标 (专科)', () => {
  render(
    <PreferredMajorTierEditor
      value={[{ tier: 0, majors: ['护理'] }]}
      options={options as any}
      onChange={() => {}}
      eligibleLevel="本科"
      examType="PHYSICS"
    />,
  );
  expect(screen.getByText('（专科）')).toBeInTheDocument();
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter web test -- tier-level-flag`
Expected: FAIL（编辑器还没有 `eligibleLevel`/`examType` props，也没渲染后缀）

- [ ] **Step 3: 实现**

`PreferredMajorTierEditor.tsx`：
顶部 import：
```ts
import { tagForLevels, type EligibleLevel, type OptionLevels } from '@/lib/level-mismatch';
```
`Props` 扩展（33-36 行 options 类型 + 新增两个可选 prop）：
```ts
interface Props {
  value: PreferredMajorTier[];
  options: Array<{ label: string; value: string; levels?: OptionLevels | null }>;
  onChange: (next: PreferredMajorTier[]) => void;
  isLoading?: boolean;
  eligibleLevel?: EligibleLevel;
  examType?: string | null;
}
```
`MajorChip` 加 `tag` prop 并渲染：
```tsx
function MajorChip({
  dragId,
  major,
  onRemove,
  tag,
}: {
  dragId: string;
  major: string;
  onRemove: () => void;
  tag?: string | null;
}) {
```
把 `<span className="pm-chip-handle">{major}</span>` 改为：
```tsx
      <span className="pm-chip-handle">
        {major}
        {tag ? <span className="pm-chip-level">（{tag}）</span> : null}
      </span>
```
组件函数签名解构加 `eligibleLevel = null, examType = null`。在 `selectedSet` useMemo 之后加按名字算 tag 的 map：
```ts
  const tagOf = useMemo(() => {
    const map = new Map<string, '本科' | '专科' | null>();
    for (const o of options) map.set(o.value, tagForLevels(o.levels, examType, eligibleLevel));
    return (name: string) => map.get(name) ?? null;
  }, [options, examType, eligibleLevel]);
```
两处 `<MajorChip ... />`(406-413 池子、443-450 梯队) 各加 `tag={tagOf(m)}`。
下拉选项(372 行 `options.filter(...)`) 改为带后缀 label：
```tsx
        options={options
          .filter((o) => !selectedSet.has(o.value))
          .map((o) => {
            const t = tagOf(o.value);
            return t ? { ...o, label: `${o.label}（${t}）` } : o;
          })}
```

`PreferredMajorTierFormItem.tsx`：`Props` 加两个可选 prop 并透传：
```ts
interface Props {
  value?: PreferredMajorTier[] | string[] | null;
  onChange?: (next: PreferredMajorTier[]) => void;
  options: Array<{ label: string; value: string; levels?: import('@/lib/level-mismatch').OptionLevels | null }>;
  isLoading?: boolean;
  eligibleLevel?: import('@/lib/level-mismatch').EligibleLevel;
  examType?: string | null;
}
```
解构与透传：
```tsx
  function PreferredMajorTierFormItem({ value, onChange, options, isLoading, eligibleLevel, examType }, _ref) {
    const tiers = useMemo(() => coerceTierShape(value), [JSON.stringify(value)]);
    return (
      <PreferredMajorTierEditor
        value={tiers}
        options={options}
        onChange={(next) => onChange?.(next)}
        isLoading={isLoading}
        eligibleLevel={eligibleLevel}
        examType={examType}
      />
    );
  },
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm --filter web test -- tier-level-flag`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add apps/web/src/components/student/preferred-majors/PreferredMajorTierEditor.tsx apps/web/src/components/student/preferred-majors/PreferredMajorTierFormItem.tsx apps/web/src/components/student/preferred-majors/__tests__/tier-level-flag.test.tsx
git commit -m "feat(preferred-majors): flag level mismatch on tier chips and add-dropdown"
```

---

## Task 11: 老师页接线（意向专业编辑器 + 意向院校 Select）

**Files:**
- Modify: `apps/web/src/app/(teacher)/teacher/students/[id]/page.tsx`（`PreferenceFields` 1691-；调用处 1014；意向院校 Select 1768）

- [ ] **Step 1: 实现（接线，followed by 手测）**

`page.tsx` 顶部 import：
```ts
import { tagForLevels, type EligibleLevel } from '@/lib/level-mismatch';
```
`PreferenceFields` 函数签名(1691)改为接 props：
```tsx
function PreferenceFields({
  eligibleLevel = null,
  examType = null,
}: {
  eligibleLevel?: EligibleLevel;
  examType?: string | null;
}) {
```
在 `PreferenceFields` 内、`majorOptions` 之后构造标记后的意向院校 options：
```tsx
  const markedUniversityOptions = useMemo(
    () =>
      (universityOptions ?? []).map((o: any) => {
        const t = tagForLevels(o.levels, examType, eligibleLevel);
        return t ? { ...o, label: `${o.label}（${t}）` } : o;
      }),
    [universityOptions, examType, eligibleLevel],
  );
```
> 确认文件已 import `useMemo`（teacher 页通常已用）；若无则在 React import 里补。
意向专业(1752)传 props：
```tsx
          <PreferredMajorTierFormItem
            options={majorOptions ?? []}
            isLoading={isMajorLoading}
            eligibleLevel={eligibleLevel}
            examType={examType}
          />
```
意向院校(1768)改用标记 options（仅此一处，排除院校 1774 不动）：
```tsx
          <Select {...pickerSelectProps(markedUniversityOptions)} loading={isUniversityLoading} placeholder="搜索院校" />
```
调用处(1014)传入学生分数层次：
```tsx
                      { key: 'preference', label: '偏好与规划', children: <PreferenceFields eligibleLevel={student?.eligibleLevel ?? null} examType={student?.examType ?? null} /> },
```
> `student` 在该作用域可用（同处 557 行已读 `student?.examType`）。

- [ ] **Step 2: 编译 + 手测**

Run: `pnpm --filter web build`
Expected: 通过。
手测：本地起服务，老师打开一个过本科线的学生 → 偏好与规划 tab：
- 意向专业「加专业」下拉里，纯专科专业显示「xxx（专科）」；加入意向池后 chip 也带「（专科）」。
- 意向院校搜一个纯专科院校，显示「xxx（专科）」。
换一个没过本科线的学生，确认本科专业/院校显示「（本科）」。没填分的学生：都不标。

- [ ] **Step 3: 提交**

```bash
git add "apps/web/src/app/(teacher)/teacher/students/[id]/page.tsx"
git commit -m "feat(teacher): wire eligibleLevel into preference major/university pickers"
```

---

## Task 12: 收尾——缓存清理说明 + 全量回归

**Files:**
- Modify: `CLAUDE.md`（部署补充动作清单）

- [ ] **Step 1: 在 CLAUDE.md 部署补充动作里加一条**

`CLAUDE.md` 的「部署后常见补充动作」列表追加：
```markdown
- 改了/重导招生计划(enrollment_plans) → 清 Redis `enroll-level:major:四川` 和 `enroll-level:university:四川`，否则 picker 的本/专科标记用旧层次
```

- [ ] **Step 2: 全量回归**

Run: `pnpm --filter server test`
Run: `pnpm --filter web test`
Expected: 全绿（至少新增用例全过、无既有用例回归）。

- [ ] **Step 3: 提交**

```bash
git add CLAUDE.md
git commit -m "docs: note enroll-level cache clear after plan reimport"
```

---

## 交给 claude-design（功能完成后）

标记目前只渲染括号文本 + className（`major-level-flag` / `pm-chip-level`），无颜色/弱化。功能验收通过后，把这两个 className 的视觉（建议弱化灰 + 轻微警示色）交 claude-design 处理。

---

## Self-Review

**Spec 覆盖核对：**
- 判定规则(eligibleLevel 三态 + 纯单层次) → Task 5/6（学生侧）、Task 1/2（条目侧 map）、Task 7（levelMismatchTag）。✓
- 4 处标记：/majors 卡片 → Task 9；意向专业梯队 chip + 下拉 → Task 10；意向院校 Select(已选 tag 随 option label 自动带后缀 + 下拉) → Task 11；搜索下拉选项 → Task 10/11 的下拉 options 标记。✓
- 科类感知（phy/his 两 lane） → Task 2 SQL 按 subjects 分 lane + Task 7 `laneOf`/`tagForLevels`。✓
- 缓存 + 重导清缓存 → Task 2 Redis + Task 12 文档。✓
- 边界（没分/没线/兼有/非物理历史科类→不标） → Task 5/7 已覆盖。✓
- 样式交 claude-design → 收尾说明。✓

**占位符扫描：** 无 TBD/TODO；每个改码步骤含完整代码。✓

**类型一致性：** 后端 `OptionLevels {phy,his}` 与前端 `OptionLevels {phy,his}` 同形；`eligibleLevel` 全程 `'本科'|'专科'|null`；`levelMismatchTag`/`tagForLevels`/`laneOf` 命名跨 Task 一致；DTO 的 `levels` 与 service 返回、前端 `MajorPickerOption.levels` 同形。✓

**已知执行注意点（非缺陷，执行者照做）：**
- Task 3/4：service constructor 已核实为 `(prisma, redis, admissionService)`，测试传 `{} as any` 作第三参。
- Task 9 需先给 `MajorCard` 加 `export`。前端 RTL/jsdom 基建已确认存在（同级目录已有 `__tests__/*.test.tsx`），自动化测试可行。
- Task 6 若既有 `findById` 测试断言整个返回对象，需补 `batchLine.findFirst` mock 或放宽断言。
