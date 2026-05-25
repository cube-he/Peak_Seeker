# 院校地域排行板块 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `/universities` 页面新增「排行导览」Tab，按地域把在川招生院校分成 7 个软科排行榜，每行同时给出软科排名与四川录取位次。

**Architecture:** 后端新增独立的 `RankingBoardService`（不改 `findAll`），按板块配置查询 `University` 并关联 `AdmissionRecord`，结果走 Redis 缓存；前端把现有列表抽成 `UniversityListTab`，新增 `RankingBoardTab` 及其子组件，`page.tsx` 收敛为 Tab 外壳。

**Tech Stack:** NestJS 10 + Prisma 7 + jest（后端）；Next.js 14 + Ant Design 5 + react-query 5 + zustand + jest/@testing-library（前端）。

设计依据：`docs/superpowers/specs/2026-05-20-university-ranking-boards-design.md`

---

## File Structure

**后端（`apps/server/`）：**
- 新建 `src/modules/university/ranking-board.constants.ts` — 7 个榜单的板块配置（地域/层次/recruitType）
- 新建 `src/modules/university/dto/ranking-board-query.dto.ts` — 接口入参 DTO（examType）
- 新建 `src/modules/university/ranking-board.service.ts` — `RankingBoardService`：查询、位次关联、缓存
- 新建 `src/modules/university/ranking-board.service.spec.ts` — 服务单测
- 改 `src/modules/university/university.controller.ts` — 新增 `GET /universities/ranking-board` 路由
- 改 `src/modules/university/university.module.ts` — 注册 `RankingBoardService`

**前端（`apps/web/`）：**
- 改 `src/services/university.ts` — 新增 `getRankingBoard` 方法与类型
- 新建 `src/services/__tests__/university.test.ts` — service 单测
- 新建 `src/app/(main)/universities/lib/groupBoards.ts` — 7 榜 → 4 板块组的纯函数
- 新建 `src/app/(main)/universities/lib/__tests__/groupBoards.test.ts`
- 新建 `src/app/(main)/universities/components/RankRow.tsx` — 单行院校
- 新建 `src/app/(main)/universities/components/BoardSection.tsx` — 一个板块组
- 新建 `src/app/(main)/universities/components/RankingBoardTab.tsx` — 排行导览 Tab 主体
- 新建 `src/app/(main)/universities/components/UniversityListTab.tsx` — 由 `page.tsx` 抽出的现有列表
- 新建对应 `components/__tests__/RankRow.test.tsx`、`BoardSection.test.tsx`
- 改 `src/app/(main)/universities/page.tsx` — 收敛为 Tab 外壳

命令约定：后端测试在 `apps/server/` 下跑，前端在 `apps/web/` 下跑。

---

## Backend

### Task 1: 板块配置常量与查询 DTO

**Files:**
- Create: `apps/server/src/modules/university/ranking-board.constants.ts`
- Create: `apps/server/src/modules/university/dto/ranking-board-query.dto.ts`

- [ ] **Step 1: 创建板块配置常量**

`apps/server/src/modules/university/ranking-board.constants.ts`:

```ts
export type BoardLevel = '本科' | '专科';

export type BoardRegion =
  | { kind: 'province'; values: string[] }
  | { kind: 'city'; values: string[] }
  | { kind: 'elite' };

export interface BoardConfig {
  key: string;
  title: string;
  groupKey: string;
  groupTitle: string;
  level: BoardLevel;
  region: BoardRegion;
}

// 与四川接壤、择校意义上的「周边」省份
export const NEIGHBOR_PROVINCES = ['重庆', '陕西', '云南', '贵州', '甘肃'];

// 一线 + 发达二线城市（成都/重庆/西安已属川内或周边，不计入）
export const DEVELOPED_CITIES = ['北京', '上海', '广州', '深圳', '杭州', '南京', '苏州', '天津'];

// 榜单层次 -> AdmissionRecord.recruitType（取值见 university.service.ts findById）
export const RECRUIT_TYPE_BY_LEVEL: Record<BoardLevel, string> = {
  本科: '普通类本科',
  专科: '普通类高职(专科)',
};

export const BOARD_CONFIGS: BoardConfig[] = [
  { key: 'sichuan-undergrad', title: '川内本科榜', groupKey: 'sichuan', groupTitle: '川内', level: '本科', region: { kind: 'province', values: ['四川'] } },
  { key: 'sichuan-college', title: '川内专科榜', groupKey: 'sichuan', groupTitle: '川内', level: '专科', region: { kind: 'province', values: ['四川'] } },
  { key: 'neighbor-undergrad', title: '周边本科榜', groupKey: 'neighbor', groupTitle: '四川周边', level: '本科', region: { kind: 'province', values: NEIGHBOR_PROVINCES } },
  { key: 'neighbor-college', title: '周边专科榜', groupKey: 'neighbor', groupTitle: '四川周边', level: '专科', region: { kind: 'province', values: NEIGHBOR_PROVINCES } },
  { key: 'developed-undergrad', title: '发达城市本科榜', groupKey: 'developed', groupTitle: '发达城市', level: '本科', region: { kind: 'city', values: DEVELOPED_CITIES } },
  { key: 'developed-college', title: '发达城市专科榜', groupKey: 'developed', groupTitle: '发达城市', level: '专科', region: { kind: 'city', values: DEVELOPED_CITIES } },
  { key: 'national-elite', title: '全国名校榜', groupKey: 'elite', groupTitle: '全国名校榜', level: '本科', region: { kind: 'elite' } },
];
```

- [ ] **Step 2: 创建查询 DTO**

`apps/server/src/modules/university/dto/ranking-board-query.dto.ts`:

```ts
import { IsOptional, IsIn } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class RankingBoardQueryDto {
  @ApiPropertyOptional({ description: '科类', enum: ['物理', '历史'], default: '物理' })
  @IsOptional()
  @IsIn(['物理', '历史'])
  examType?: string = '物理';
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/modules/university/ranking-board.constants.ts apps/server/src/modules/university/dto/ranking-board-query.dto.ts
git commit -m "feat(university): add ranking board configs and query dto"
```

---

### Task 2: RankingBoardService — 榜单查询与排序

**Files:**
- Create: `apps/server/src/modules/university/ranking-board.service.ts`
- Test: `apps/server/src/modules/university/ranking-board.service.spec.ts`

- [ ] **Step 1: 写失败测试**

`apps/server/src/modules/university/ranking-board.service.spec.ts`:

```ts
import { RankingBoardService } from './ranking-board.service';

const makeService = (universities: any[]) => {
  const prisma = {
    university: { findMany: jest.fn().mockResolvedValue(universities) },
    admissionRecord: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const redis = {
    getCache: jest.fn().mockResolvedValue(null),
    setCache: jest.fn().mockResolvedValue(undefined),
  };
  const svc = new RankingBoardService(prisma as any, redis as any);
  return { svc, prisma, redis };
};

const uni = (over: Partial<any> = {}) => ({
  id: 1, name: '某大学', logoUrl: null, province: '四川', city: '成都',
  type: '综合', runningNature: '公办', is985: false, is211: false,
  isDoubleFirstClass: false, softRanking: 50, ...over,
});

describe('RankingBoardService.getRankingBoard', () => {
  it('returns 7 boards with the configured keys', async () => {
    const { svc } = makeService([uni()]);
    const boards = await svc.getRankingBoard();
    expect(boards.map((b) => b.key)).toEqual([
      'sichuan-undergrad', 'sichuan-college', 'neighbor-undergrad',
      'neighbor-college', 'developed-undergrad', 'developed-college', 'national-elite',
    ]);
  });

  it('numbers items by descending soft ranking strength (rank starts at 1)', async () => {
    const { svc } = makeService([uni({ id: 1, softRanking: 5 }), uni({ id: 2, softRanking: 9 })]);
    const board = (await svc.getRankingBoard())[0];
    expect(board.items.map((i) => ({ id: i.id, rank: i.rank }))).toEqual([
      { id: 1, rank: 1 }, { id: 2, rank: 2 },
    ]);
  });

  it('excludes universities without a soft ranking and sorts ascending', async () => {
    const { svc, prisma } = makeService([uni()]);
    await svc.getRankingBoard();
    const firstCall = prisma.university.findMany.mock.calls[0][0];
    expect(firstCall.where.softRanking).toEqual({ gt: 0 });
    expect(firstCall.where.level).toBe('本科');
    expect(firstCall.where.province).toEqual({ in: ['四川'] });
    expect(firstCall.orderBy).toEqual({ softRanking: 'asc' });
  });

  it('uses an OR of 985/211/双一流 for the national elite board', async () => {
    const { svc, prisma } = makeService([uni()]);
    await svc.getRankingBoard();
    const eliteCall = prisma.university.findMany.mock.calls[6][0];
    expect(eliteCall.where.OR).toEqual([
      { is985: true }, { is211: true }, { isDoubleFirstClass: true },
    ]);
  });
});
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `cd apps/server && npx jest ranking-board.service`
Expected: FAIL — `Cannot find module './ranking-board.service'`

- [ ] **Step 3: 实现 service（不含位次、不含缓存）**

`apps/server/src/modules/university/ranking-board.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { BOARD_CONFIGS, BoardConfig } from './ranking-board.constants';

export interface RankedUniversity {
  rank: number;
  id: number;
  name: string;
  logoUrl: string | null;
  province: string | null;
  city: string | null;
  type: string | null;
  runningNature: string | null;
  is985: boolean;
  is211: boolean;
  isDoubleFirstClass: boolean;
  softRanking: number;
  admissionMinRank: number | null;
  admissionMinScore: number | null;
}

export interface RankingBoard {
  key: string;
  title: string;
  groupKey: string;
  groupTitle: string;
  level: string;
  items: RankedUniversity[];
}

@Injectable()
export class RankingBoardService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  async getRankingBoard(): Promise<RankingBoard[]> {
    return Promise.all(BOARD_CONFIGS.map((cfg) => this.buildBoard(cfg)));
  }

  private buildBoardWhere(cfg: BoardConfig): any {
    const where: any = { level: cfg.level, softRanking: { gt: 0 } };
    if (cfg.region.kind === 'province') {
      where.province = { in: cfg.region.values };
    } else if (cfg.region.kind === 'city') {
      where.city = { in: cfg.region.values };
    } else {
      where.OR = [{ is985: true }, { is211: true }, { isDoubleFirstClass: true }];
    }
    return where;
  }

  private async buildBoard(cfg: BoardConfig): Promise<RankingBoard> {
    const universities = await this.prisma.university.findMany({
      where: this.buildBoardWhere(cfg),
      orderBy: { softRanking: 'asc' },
      select: {
        id: true, name: true, logoUrl: true, province: true, city: true,
        type: true, runningNature: true, is985: true, is211: true,
        isDoubleFirstClass: true, softRanking: true,
      },
    });

    const items: RankedUniversity[] = universities.map((u, idx) => ({
      rank: idx + 1,
      ...u,
      softRanking: u.softRanking as number,
      admissionMinRank: null,
      admissionMinScore: null,
    }));

    return {
      key: cfg.key, title: cfg.title, groupKey: cfg.groupKey,
      groupTitle: cfg.groupTitle, level: cfg.level, items,
    };
  }
}
```

- [ ] **Step 4: 跑测试，确认通过**

Run: `cd apps/server && npx jest ranking-board.service`
Expected: PASS（4 个用例）

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/modules/university/ranking-board.service.ts apps/server/src/modules/university/ranking-board.service.spec.ts
git commit -m "feat(university): add ranking board service with regional queries"
```

---

### Task 3: RankingBoardService — 关联四川录取位次

**Files:**
- Modify: `apps/server/src/modules/university/ranking-board.service.ts`
- Test: `apps/server/src/modules/university/ranking-board.service.spec.ts`

- [ ] **Step 1: 追加失败测试**

在 `ranking-board.service.spec.ts` 末尾追加：

```ts
describe('RankingBoardService admission rank enrichment', () => {
  it('merges Sichuan admission rank/score into each item', async () => {
    const prisma = {
      university: { findMany: jest.fn().mockResolvedValue([uni({ id: 7, softRanking: 3 })]) },
      admissionRecord: {
        findMany: jest.fn().mockResolvedValue([
          { universityId: 7, universityMinRank: 8200, universityMinScore: 631 },
        ]),
      },
    };
    const redis = { getCache: jest.fn().mockResolvedValue(null), setCache: jest.fn() };
    const svc = new RankingBoardService(prisma as any, redis as any);

    const board = (await svc.getRankingBoard('物理'))[0];

    expect(board.items[0].admissionMinRank).toBe(8200);
    expect(board.items[0].admissionMinScore).toBe(631);
  });

  it('queries admission records by Sichuan, recruit type and exam type', async () => {
    const prisma = {
      university: { findMany: jest.fn().mockResolvedValue([uni({ id: 7 })]) },
      admissionRecord: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const redis = { getCache: jest.fn().mockResolvedValue(null), setCache: jest.fn() };
    const svc = new RankingBoardService(prisma as any, redis as any);

    await svc.getRankingBoard('历史');

    const call = prisma.admissionRecord.findMany.mock.calls[0][0];
    expect(call.where.province).toBe('四川');
    expect(call.where.recruitType).toBe('普通类本科');
    expect(call.where.subjects).toEqual({ contains: '历史' });
  });

  it('leaves admission fields null when no record matches', async () => {
    const prisma = {
      university: { findMany: jest.fn().mockResolvedValue([uni({ id: 7 })]) },
      admissionRecord: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const redis = { getCache: jest.fn().mockResolvedValue(null), setCache: jest.fn() };
    const svc = new RankingBoardService(prisma as any, redis as any);

    const board = (await svc.getRankingBoard('物理'))[0];
    expect(board.items[0].admissionMinRank).toBeNull();
  });
});
```

把文件里已有的 `svc.getRankingBoard()` 调用统一改为 `svc.getRankingBoard('物理')`。

- [ ] **Step 2: 跑测试，确认失败**

Run: `cd apps/server && npx jest ranking-board.service`
Expected: FAIL — `getRankingBoard` 不接受参数 / `admissionMinRank` 仍为 null

- [ ] **Step 3: 实现位次关联**

修改 `ranking-board.service.ts`：给 `getRankingBoard` 与 `buildBoard` 加 `examType` 参数，新增 `RECRUIT_TYPE_BY_LEVEL` 引入与 `fetchAdmissionRanks`。

把 import 行改为：

```ts
import { BOARD_CONFIGS, BoardConfig, BoardLevel, RECRUIT_TYPE_BY_LEVEL } from './ranking-board.constants';
```

把 `getRankingBoard` 与 `buildBoard` 替换为：

```ts
  async getRankingBoard(examType: string): Promise<RankingBoard[]> {
    return Promise.all(BOARD_CONFIGS.map((cfg) => this.buildBoard(cfg, examType)));
  }

  private async buildBoard(cfg: BoardConfig, examType: string): Promise<RankingBoard> {
    const universities = await this.prisma.university.findMany({
      where: this.buildBoardWhere(cfg),
      orderBy: { softRanking: 'asc' },
      select: {
        id: true, name: true, logoUrl: true, province: true, city: true,
        type: true, runningNature: true, is985: true, is211: true,
        isDoubleFirstClass: true, softRanking: true,
      },
    });

    const admissionMap = await this.fetchAdmissionRanks(
      universities.map((u) => u.id), cfg.level, examType,
    );

    const items: RankedUniversity[] = universities.map((u, idx) => ({
      rank: idx + 1,
      ...u,
      softRanking: u.softRanking as number,
      admissionMinRank: admissionMap.get(u.id)?.rank ?? null,
      admissionMinScore: admissionMap.get(u.id)?.score ?? null,
    }));

    return {
      key: cfg.key, title: cfg.title, groupKey: cfg.groupKey,
      groupTitle: cfg.groupTitle, level: cfg.level, items,
    };
  }

  private async fetchAdmissionRanks(
    universityIds: number[], level: BoardLevel, examType: string,
  ): Promise<Map<number, { rank: number | null; score: number | null }>> {
    const map = new Map<number, { rank: number | null; score: number | null }>();
    if (universityIds.length === 0) return map;

    // 录取数据年份：最近一年（与 university.service.ts findAll 口径一致）。
    // 2025 为四川新高考首年，subjects 即物理/历史，与 examType 直接对应。
    const dataYear = new Date().getFullYear() - 1;

    const records = await this.prisma.admissionRecord.findMany({
      where: {
        universityId: { in: universityIds },
        province: '四川',
        year: dataYear,
        recruitType: RECRUIT_TYPE_BY_LEVEL[level],
        subjects: { contains: examType },
      },
      select: { universityId: true, universityMinRank: true, universityMinScore: true },
      orderBy: { universityMinRank: 'desc' },
    });

    // 同一院校可能有多条批次记录；orderBy desc + 首条写入 = 取最宽松的录取门槛
    for (const r of records) {
      if (!map.has(r.universityId)) {
        map.set(r.universityId, { rank: r.universityMinRank, score: r.universityMinScore });
      }
    }
    return map;
  }
```

- [ ] **Step 4: 跑测试，确认通过**

Run: `cd apps/server && npx jest ranking-board.service`
Expected: PASS（7 个用例）

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/modules/university/ranking-board.service.ts apps/server/src/modules/university/ranking-board.service.spec.ts
git commit -m "feat(university): join Sichuan admission rank into ranking boards"
```

---

### Task 4: RankingBoardService — Redis 缓存

**Files:**
- Modify: `apps/server/src/modules/university/ranking-board.service.ts`
- Test: `apps/server/src/modules/university/ranking-board.service.spec.ts`

- [ ] **Step 1: 追加失败测试**

在 `ranking-board.service.spec.ts` 末尾追加：

```ts
describe('RankingBoardService caching', () => {
  it('returns cached boards without querying the database', async () => {
    const prisma = {
      university: { findMany: jest.fn() },
      admissionRecord: { findMany: jest.fn() },
    };
    const redis = {
      getCache: jest.fn().mockResolvedValue([{ key: 'cached' }]),
      setCache: jest.fn(),
    };
    const svc = new RankingBoardService(prisma as any, redis as any);

    const boards = await svc.getRankingBoard('物理');

    expect(boards).toEqual([{ key: 'cached' }]);
    expect(prisma.university.findMany).not.toHaveBeenCalled();
    expect(redis.getCache).toHaveBeenCalledWith('ranking-board:物理');
  });

  it('caches freshly built boards keyed by exam type', async () => {
    const { svc, redis } = makeService([uni()]);
    await svc.getRankingBoard('历史');
    expect(redis.setCache).toHaveBeenCalledWith('ranking-board:历史', expect.any(Array), 3600);
  });
});
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `cd apps/server && npx jest ranking-board.service`
Expected: FAIL — 缓存命中用例失败（仍调用了 `university.findMany`）

- [ ] **Step 3: 加入缓存逻辑**

把 `getRankingBoard` 替换为：

```ts
  async getRankingBoard(examType: string): Promise<RankingBoard[]> {
    const cacheKey = `ranking-board:${examType}`;
    const cached = await this.redis.getCache<RankingBoard[]>(cacheKey);
    if (cached) return cached;

    const boards = await Promise.all(
      BOARD_CONFIGS.map((cfg) => this.buildBoard(cfg, examType)),
    );

    await this.redis.setCache(cacheKey, boards, 3600);
    return boards;
  }
```

- [ ] **Step 4: 跑测试，确认通过**

Run: `cd apps/server && npx jest ranking-board.service`
Expected: PASS（9 个用例）

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/modules/university/ranking-board.service.ts apps/server/src/modules/university/ranking-board.service.spec.ts
git commit -m "feat(university): cache ranking boards in redis per exam type"
```

---

### Task 5: 控制器路由与模块装配

**Files:**
- Modify: `apps/server/src/modules/university/university.controller.ts`
- Modify: `apps/server/src/modules/university/university.module.ts`
- Test: `apps/server/src/modules/university/ranking-board.controller.spec.ts`（新建）

- [ ] **Step 1: 写失败测试**

`apps/server/src/modules/university/ranking-board.controller.spec.ts`:

```ts
import { UniversityController } from './university.controller';

describe('UniversityController.getRankingBoard', () => {
  it('delegates to RankingBoardService with the requested exam type', async () => {
    const rankingBoardService = { getRankingBoard: jest.fn().mockResolvedValue([]) };
    const controller = new UniversityController(
      {} as any, rankingBoardService as any,
    );

    await controller.getRankingBoard({ examType: '历史' });

    expect(rankingBoardService.getRankingBoard).toHaveBeenCalledWith('历史');
  });

  it('defaults exam type to 物理 when omitted', async () => {
    const rankingBoardService = { getRankingBoard: jest.fn().mockResolvedValue([]) };
    const controller = new UniversityController({} as any, rankingBoardService as any);

    await controller.getRankingBoard({});

    expect(rankingBoardService.getRankingBoard).toHaveBeenCalledWith('物理');
  });
});
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `cd apps/server && npx jest ranking-board.controller`
Expected: FAIL — `UniversityController` 构造函数参数不符 / `getRankingBoard` 不存在

- [ ] **Step 3: 改控制器**

在 `university.controller.ts`：

import 区追加：

```ts
import { RankingBoardService } from './ranking-board.service';
import { RankingBoardQueryDto } from './dto/ranking-board-query.dto';
```

构造函数改为：

```ts
  constructor(
    private universityService: UniversityService,
    private rankingBoardService: RankingBoardService,
  ) {}
```

在 `@Get('picker-options')` 方法之后、`@Get(':id')` 方法**之前**插入（必须在 `:id` 之前，否则会被动态路由捕获）：

```ts
  @Get('ranking-board')
  @ApiOperation({ summary: '院校地域排行榜' })
  @ApiQuery({ name: 'examType', required: false, enum: ['物理', '历史'] })
  async getRankingBoard(@Query() query: RankingBoardQueryDto) {
    return this.rankingBoardService.getRankingBoard(query.examType ?? '物理');
  }
```

- [ ] **Step 4: 改模块**

`university.module.ts` 替换为：

```ts
import { Module } from '@nestjs/common';
import { UniversityController } from './university.controller';
import { UniversityService } from './university.service';
import { RankingBoardService } from './ranking-board.service';
import { AdmissionModule } from '../admission/admission.module';

@Module({
  imports: [AdmissionModule],
  controllers: [UniversityController],
  providers: [UniversityService, RankingBoardService],
  exports: [UniversityService],
})
export class UniversityModule {}
```

- [ ] **Step 5: 跑测试，确认通过**

Run: `cd apps/server && npx jest ranking-board`
Expected: PASS（service 9 + controller 2 共 11 个用例）

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/modules/university/university.controller.ts apps/server/src/modules/university/university.module.ts apps/server/src/modules/university/ranking-board.controller.spec.ts
git commit -m "feat(university): expose GET /universities/ranking-board"
```

---

## Frontend

### Task 6: 前端 service —— getRankingBoard

**Files:**
- Modify: `apps/web/src/services/university.ts`
- Test: `apps/web/src/services/__tests__/university.test.ts`（新建）

- [ ] **Step 1: 写失败测试**

`apps/web/src/services/__tests__/university.test.ts`:

```ts
const mockGet = jest.fn();

jest.mock('../api', () => ({
  __esModule: true,
  default: { get: mockGet },
}));

import { universityService } from '../university';

describe('universityService.getRankingBoard', () => {
  beforeEach(() => mockGet.mockClear());

  it('requests the ranking board route with the exam type', () => {
    universityService.getRankingBoard('物理');
    expect(mockGet).toHaveBeenCalledWith('/universities/ranking-board', {
      params: { examType: '物理' },
    });
  });
});
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `cd apps/web && npx jest services/__tests__/university`
Expected: FAIL — `getRankingBoard` 不是函数

- [ ] **Step 3: 给 service 加方法与类型**

在 `apps/web/src/services/university.ts` 顶部 import 之后追加类型：

```ts
import type { ExamType } from './score-segment';

export interface RankedUniversity {
  rank: number;
  id: number;
  name: string;
  logoUrl: string | null;
  province: string | null;
  city: string | null;
  type: string | null;
  runningNature: string | null;
  is985: boolean;
  is211: boolean;
  isDoubleFirstClass: boolean;
  softRanking: number;
  admissionMinRank: number | null;
  admissionMinScore: number | null;
}

export interface RankingBoard {
  key: string;
  title: string;
  groupKey: string;
  groupTitle: string;
  level: string;
  items: RankedUniversity[];
}
```

在 `universityService` 对象里追加方法（放在 `getFilters` 之后）：

```ts
  getRankingBoard: (examType: ExamType): Promise<RankingBoard[]> =>
    api.get('/universities/ranking-board', { params: { examType } }) as any,
```

- [ ] **Step 4: 跑测试，确认通过**

Run: `cd apps/web && npx jest services/__tests__/university`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/services/university.ts apps/web/src/services/__tests__/university.test.ts
git commit -m "feat(universities): add getRankingBoard service method"
```

---

### Task 7: groupBoards 工具函数

**Files:**
- Create: `apps/web/src/app/(main)/universities/lib/groupBoards.ts`
- Test: `apps/web/src/app/(main)/universities/lib/__tests__/groupBoards.test.ts`

- [ ] **Step 1: 写失败测试**

`apps/web/src/app/(main)/universities/lib/__tests__/groupBoards.test.ts`:

```ts
import { groupBoards } from '../groupBoards';
import type { RankingBoard } from '@/services/university';

const board = (key: string, groupKey: string, groupTitle: string): RankingBoard => ({
  key, groupKey, groupTitle, title: key, level: '本科', items: [],
});

describe('groupBoards', () => {
  it('groups boards by groupKey, preserving order', () => {
    const result = groupBoards([
      board('sichuan-undergrad', 'sichuan', '川内'),
      board('sichuan-college', 'sichuan', '川内'),
      board('national-elite', 'elite', '全国名校榜'),
    ]);
    expect(result).toHaveLength(2);
    expect(result[0].groupTitle).toBe('川内');
    expect(result[0].boards).toHaveLength(2);
    expect(result[1].boards).toHaveLength(1);
  });

  it('returns an empty array for no boards', () => {
    expect(groupBoards([])).toEqual([]);
  });
});
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `cd apps/web && npx jest groupBoards`
Expected: FAIL — `Cannot find module '../groupBoards'`

- [ ] **Step 3: 实现工具函数**

`apps/web/src/app/(main)/universities/lib/groupBoards.ts`:

```ts
import type { RankingBoard } from '@/services/university';

export interface BoardGroup {
  groupKey: string;
  groupTitle: string;
  boards: RankingBoard[];
}

export function groupBoards(boards: RankingBoard[]): BoardGroup[] {
  const groups: BoardGroup[] = [];
  for (const board of boards) {
    let group = groups.find((g) => g.groupKey === board.groupKey);
    if (!group) {
      group = { groupKey: board.groupKey, groupTitle: board.groupTitle, boards: [] };
      groups.push(group);
    }
    group.boards.push(board);
  }
  return groups;
}
```

- [ ] **Step 4: 跑测试，确认通过**

Run: `cd apps/web && npx jest groupBoards`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/(main)/universities/lib/groupBoards.ts" "apps/web/src/app/(main)/universities/lib/__tests__/groupBoards.test.ts"
git commit -m "feat(universities): add groupBoards helper"
```

---

### Task 8: RankRow 组件

**Files:**
- Create: `apps/web/src/app/(main)/universities/components/RankRow.tsx`
- Test: `apps/web/src/app/(main)/universities/components/__tests__/RankRow.test.tsx`

- [ ] **Step 1: 写失败测试**

`apps/web/src/app/(main)/universities/components/__tests__/RankRow.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { RankRow } from '../RankRow';
import type { RankedUniversity } from '@/services/university';

jest.mock('@/components/university/UniversityLogo', () => ({
  __esModule: true,
  default: () => null,
}));

const item: RankedUniversity = {
  rank: 1, id: 5, name: '四川大学', logoUrl: null, province: '四川', city: '成都',
  type: '综合', runningNature: '公办', is985: true, is211: true,
  isDoubleFirstClass: true, softRanking: 14, admissionMinRank: 7200, admissionMinScore: 631,
};

describe('RankRow', () => {
  it('renders rank, name and Sichuan admission rank', () => {
    render(<RankRow item={item} />);
    expect(screen.getByText('四川大学')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('7200')).toBeInTheDocument();
  });

  it('shows an em dash when admission rank is missing', () => {
    render(<RankRow item={{ ...item, admissionMinRank: null }} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `cd apps/web && npx jest RankRow`
Expected: FAIL — `Cannot find module '../RankRow'`

- [ ] **Step 3: 实现组件**

`apps/web/src/app/(main)/universities/components/RankRow.tsx`:

```tsx
import Link from 'next/link';
import UniversityLogo from '@/components/university/UniversityLogo';
import type { RankedUniversity } from '@/services/university';

const RANK_TONE: Record<number, string> = {
  1: 'bg-[#f3c64a] text-[#7a5600]',
  2: 'bg-[#ccd3da] text-[#46505a]',
  3: 'bg-[#e0a878] text-[#6a3a14]',
};

export function RankRow({ item }: { item: RankedUniversity }) {
  const tags: string[] = [];
  if (item.is985) tags.push('985');
  if (item.is211) tags.push('211');
  if (item.isDoubleFirstClass) tags.push('双一流');

  const rankTone = RANK_TONE[item.rank] ?? 'bg-surface-dim text-text-tertiary';
  const meta = [item.city || item.province, item.type, item.runningNature]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="flex items-center gap-3 border-b border-border-subtle py-3 last:border-b-0">
      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[13px] font-bold ${rankTone}`}>
        {item.rank}
      </span>
      <Link href={`/universities/${item.id}`} className="shrink-0 no-underline">
        <UniversityLogo name={item.name} logoUrl={item.logoUrl} size={40} />
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/universities/${item.id}`}
            className="truncate font-serif text-[15px] font-semibold text-text no-underline hover:text-primary"
          >
            {item.name}
          </Link>
          {tags.map((tag) => (
            <span key={tag} className="rounded bg-accent-fixed px-1.5 py-0.5 text-[10px] font-medium text-accent">
              {tag}
            </span>
          ))}
        </div>
        <div className="mt-1 text-[11px] text-text-muted">
          {meta}
          {item.softRanking ? ` · 软科全国 #${item.softRanking}` : ''}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className="font-serif text-[16px] font-semibold text-text tabular-nums">
          {item.admissionMinRank ?? '—'}
        </div>
        <div className="text-[10px] text-text-muted">四川最低位次</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: 跑测试，确认通过**

Run: `cd apps/web && npx jest RankRow`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/(main)/universities/components/RankRow.tsx" "apps/web/src/app/(main)/universities/components/__tests__/RankRow.test.tsx"
git commit -m "feat(universities): add RankRow component"
```

---

### Task 9: BoardSection 组件

**Files:**
- Create: `apps/web/src/app/(main)/universities/components/BoardSection.tsx`
- Test: `apps/web/src/app/(main)/universities/components/__tests__/BoardSection.test.tsx`

- [ ] **Step 1: 写失败测试**

`apps/web/src/app/(main)/universities/components/__tests__/BoardSection.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BoardSection } from '../BoardSection';
import type { BoardGroup } from '../../lib/groupBoards';
import type { RankedUniversity } from '@/services/university';

jest.mock('@/components/university/UniversityLogo', () => ({
  __esModule: true,
  default: () => null,
}));

const item = (id: number, name: string): RankedUniversity => ({
  rank: id, id, name, logoUrl: null, province: '四川', city: '成都',
  type: '综合', runningNature: '公办', is985: false, is211: false,
  isDoubleFirstClass: false, softRanking: id, admissionMinRank: 1000 + id, admissionMinScore: 600,
});

const group: BoardGroup = {
  groupKey: 'sichuan', groupTitle: '川内',
  boards: [
    { key: 'sichuan-undergrad', title: '川内本科榜', groupKey: 'sichuan', groupTitle: '川内', level: '本科', items: [item(1, '本科甲')] },
    { key: 'sichuan-college', title: '川内专科榜', groupKey: 'sichuan', groupTitle: '川内', level: '专科', items: [item(2, '专科甲')] },
  ],
};

describe('BoardSection', () => {
  it('shows the group title and the first board by default', () => {
    render(<BoardSection group={group} />);
    expect(screen.getByText('川内')).toBeInTheDocument();
    expect(screen.getByText('本科甲')).toBeInTheDocument();
  });

  it('switches board when the 专科榜 toggle is clicked', async () => {
    render(<BoardSection group={group} />);
    await userEvent.click(screen.getByText('专科榜'));
    expect(screen.getByText('专科甲')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `cd apps/web && npx jest BoardSection`
Expected: FAIL — `Cannot find module '../BoardSection'`

- [ ] **Step 3: 实现组件**

`apps/web/src/app/(main)/universities/components/BoardSection.tsx`:

```tsx
'use client';

import { useState } from 'react';
import type { BoardGroup } from '../lib/groupBoards';
import { RankRow } from './RankRow';

const PREVIEW_COUNT = 10;

export function BoardSection({ group }: { group: BoardGroup }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [expanded, setExpanded] = useState(false);

  const board = group.boards[activeIndex] ?? group.boards[0];
  const visible = expanded ? board.items : board.items.slice(0, PREVIEW_COUNT);

  return (
    <section className="rounded-xl bg-surface p-5 shadow-card">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="m-0 font-serif text-lg font-semibold text-text">{group.groupTitle}</h3>
        {group.boards.length > 1 && (
          <div className="flex overflow-hidden rounded-md border border-border">
            {group.boards.map((b, idx) => (
              <button
                key={b.key}
                type="button"
                onClick={() => {
                  setActiveIndex(idx);
                  setExpanded(false);
                }}
                className={`border-0 px-3 py-1 text-[12px] transition-colors ${
                  idx === activeIndex
                    ? 'bg-primary-fixed font-medium text-primary'
                    : 'bg-surface text-text-tertiary hover:text-primary'
                }`}
              >
                {b.level === '本科' ? '本科榜' : '专科榜'}
              </button>
            ))}
          </div>
        )}
      </div>

      {visible.length > 0 ? (
        <div>
          {visible.map((item) => (
            <RankRow key={item.id} item={item} />
          ))}
        </div>
      ) : (
        <div className="py-8 text-center text-sm text-text-muted">该榜暂无数据</div>
      )}

      {board.items.length > PREVIEW_COUNT && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-3 w-full rounded-md border-0 bg-bg py-2 text-[13px] text-primary transition-colors hover:bg-surface-dim"
        >
          {expanded ? '收起' : `查看完整榜单（共 ${board.items.length} 所）`}
        </button>
      )}
    </section>
  );
}
```

- [ ] **Step 4: 跑测试，确认通过**

Run: `cd apps/web && npx jest BoardSection`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/(main)/universities/components/BoardSection.tsx" "apps/web/src/app/(main)/universities/components/__tests__/BoardSection.test.tsx"
git commit -m "feat(universities): add BoardSection component"
```

---

### Task 10: RankingBoardTab 组件

**Files:**
- Create: `apps/web/src/app/(main)/universities/components/RankingBoardTab.tsx`

说明：本组件是数据获取外壳，逻辑均在已测过的 `groupBoards` / service / 子组件中；其本身由 Task 12 手动验收覆盖，不另写单测。

- [ ] **Step 1: 实现组件**

`apps/web/src/app/(main)/universities/components/RankingBoardTab.tsx`:

```tsx
'use client';

import { useQuery } from '@tanstack/react-query';
import { Alert, Empty, Spin } from 'antd';
import type { ExamType } from '@/services/score-segment';
import { universityService } from '@/services/university';
import { useStudentRank } from '@/stores/studentRankStore';
import { groupBoards } from '../lib/groupBoards';
import { BoardSection } from './BoardSection';

const EXAM_TYPES: ExamType[] = ['物理', '历史'];

export function RankingBoardTab() {
  const examType = useStudentRank((s) => s.examType);
  const setExamType = useStudentRank((s) => s.setExamType);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['ranking-board', examType],
    queryFn: () => universityService.getRankingBoard(examType),
  });

  const groups = data ? groupBoards(data) : [];

  return (
    <div className="pb-12">
      <div className="mb-5 flex items-center gap-2">
        <span className="text-sm text-text-muted">科类</span>
        {EXAM_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setExamType(t)}
            className={`rounded-full border px-3.5 py-1 text-[13px] transition-colors ${
              examType === t
                ? 'border-primary bg-primary-fixed font-medium text-primary'
                : 'border-border bg-surface text-text-tertiary hover:text-primary'
            }`}
          >
            {t}类
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center rounded-xl bg-surface py-20 shadow-card">
          <Spin size="large" />
        </div>
      ) : isError ? (
        <div className="rounded-xl bg-surface p-6 shadow-card">
          <Alert type="error" showIcon message="排行榜加载失败" description="请稍后刷新重试。" />
        </div>
      ) : groups.length > 0 ? (
        <div className="space-y-6">
          {groups.map((g) => (
            <BoardSection key={g.groupKey} group={g} />
          ))}
        </div>
      ) : (
        <div className="rounded-xl bg-surface p-8 shadow-card">
          <Empty description="暂无排行数据" />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 类型检查**

Run: `cd apps/web && npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 3: Commit**

```bash
git add "apps/web/src/app/(main)/universities/components/RankingBoardTab.tsx"
git commit -m "feat(universities): add RankingBoardTab component"
```

---

### Task 11: 抽取 UniversityListTab 并把 page.tsx 改为 Tab 外壳

**Files:**
- Create: `apps/web/src/app/(main)/universities/components/UniversityListTab.tsx`
- Modify: `apps/web/src/app/(main)/universities/page.tsx`

- [ ] **Step 1: 创建 UniversityListTab.tsx**

把 `apps/web/src/app/(main)/universities/page.tsx` 的**全部内容**复制到新文件 `apps/web/src/app/(main)/universities/components/UniversityListTab.tsx`，然后做以下 4 处修改：

1. 保留首行 `'use client';`。
2. 删除 `import MainLayout from '@/components/layout/MainLayout';` 这一行。
3. 服务/store 等 `@/` 开头的 import 路径无需改动（绝对别名不受目录位置影响）。
4. 把 `export default function UniversitiesPage() {` 改为 `export function UniversityListTab() {`；把函数体最外层的 `<MainLayout>` 与 `</MainLayout>` 标签删掉，直接返回原本被它包裹的 `<div className="pb-12"> ... </div>`。

其余内容（`FilterGroup`、`FeatureFilters`、`FilterPanel`、`AppliedFilterChips`、`UniversityCard`、`HotUniversitiesSidebar`、`parseNumber`、`estimateChance`、常量）原样保留在该文件内。

- [ ] **Step 2: 重写 page.tsx 为 Tab 外壳**

`apps/web/src/app/(main)/universities/page.tsx` 全文替换为：

```tsx
'use client';

import { Tabs } from 'antd';
import MainLayout from '@/components/layout/MainLayout';
import { RankingBoardTab } from './components/RankingBoardTab';
import { UniversityListTab } from './components/UniversityListTab';

export default function UniversitiesPage() {
  return (
    <MainLayout>
      <div className="pb-12">
        <Tabs
          defaultActiveKey="ranking"
          items={[
            { key: 'ranking', label: '排行导览', children: <RankingBoardTab /> },
            { key: 'all', label: '全部院校', children: <UniversityListTab /> },
          ]}
        />
      </div>
    </MainLayout>
  );
}
```

- [ ] **Step 3: 类型检查与 lint**

Run: `cd apps/web && npx tsc --noEmit`
Expected: 无错误

Run: `cd apps/web && npx jest universities`
Expected: PASS（RankRow、BoardSection 等用例不回归）

- [ ] **Step 4: Commit**

```bash
git add "apps/web/src/app/(main)/universities/components/UniversityListTab.tsx" "apps/web/src/app/(main)/universities/page.tsx"
git commit -m "feat(universities): split page into ranking and list tabs"
```

---

### Task 12: 手动验收

**Files:** 无（验收 + 修复）

- [ ] **Step 1: 启动后端与前端**

Run: `cd apps/server && pnpm dev`（另开终端）`cd apps/web && pnpm dev`
Expected: 两端正常启动，无编译错误

- [ ] **Step 2: 浏览器走查 `/universities`**

逐项确认：
- 页面出现「排行导览」「全部院校」两个 Tab，默认停在「排行导览」。
- 「排行导览」显示 4 个板块组：川内、四川周边、发达城市、全国名校榜。
- 川内 / 四川周边 / 发达城市 各有「本科榜 / 专科榜」切换；全国名校榜无切换。
- 每行显示：名次、院校名与标签、省市与类型、软科全国排名、四川最低位次。
- **发达城市板块非空**——若为空，说明 `city` 字段对北京/上海/天津等存的不是裸城市名（如「北京市」），需按实际值调整 `ranking-board.constants.ts` 的 `DEVELOPED_CITIES`。
- 点「物理类 / 历史类」切换，录取位次随之变化。
- 「查看完整榜单」可展开/收起。
- 切到「全部院校」Tab，原筛选列表、分页、对比、热门侧栏功能与改动前一致。

- [ ] **Step 3: 校验科类匹配**

确认录取位次有值（不是整列 `—`）。若整列为 `—`，检查 `AdmissionRecord.subjects` 在 2025 四川数据里的实际取值是否包含「物理」「历史」子串；不包含则调整 `ranking-board.service.ts` 中 `subjects` 的匹配方式。

- [ ] **Step 4: 提交验收期间的修复（若有）**

```bash
git add -A
git commit -m "fix(universities): adjust ranking board after manual verification"
```

若无需修复则跳过本步。

---

## Self-Review

- **Spec 覆盖：** 4 板块组/7 榜单（Task 1 配置 + Task 2/3 查询）、Tab 入口（Task 11）、softRanking 排序与 0/null 排除（Task 2）、本/专科分榜（配置层次 + Task 9 切换）、四川录取位次（Task 3）、科类复用全局 store（Task 10）、Redis 缓存（Task 4）、查看完整榜单（Task 9）——均有对应任务。
- **占位符：** 无 TBD/TODO；所有 step 含完整代码或精确指令。
- **类型一致：** 后端 `RankingBoard`/`RankedUniversity` 与前端 `university.ts` 中同名接口字段一致；`groupBoards` 的 `BoardGroup` 在 Task 7 定义、Task 9/10 引用一致；`getRankingBoard` 参数（examType）在后端 Task 3 引入、Task 5 控制器传入、前端 Task 6/10 一致。
- **已知实现期校验点：** `DEVELOPED_CITIES` 与 `city` 字段实际取值（Task 12 Step 2）、`subjects` 与 examType 的子串匹配（Task 12 Step 3）。
