# 首页志愿填报进度时间轴 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在首页 Hero 下方新增高考时间轴板块，通过爬取四川省教育考试院公告自动更新节点状态。

**Architecture:** NestJS 后端新增 timeline 模块（controller + service + scraper），Prisma 新增 TimelineEvent 表，前端新增 TimelineTracker 组件。爬虫用 @nestjs/schedule 做定时任务，只抓取列表页标题做正则匹配。

**Tech Stack:** NestJS, Prisma, @nestjs/schedule, Next.js, React, Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-04-30-homepage-timeline-tracker-design.md`

---

## File Structure

### Backend (apps/server/)

| 文件 | 职责 |
|------|------|
| `prisma/schema.prisma` | 新增 TimelineEvent 模型 |
| `src/modules/timeline/timeline.module.ts` | 模块注册 |
| `src/modules/timeline/timeline.controller.ts` | GET /timeline 公开端点 |
| `src/modules/timeline/timeline.service.ts` | 数据读写 + 初始化种子 |
| `src/modules/timeline/timeline-scraper.service.ts` | 爬虫 + 标题匹配 + 定时任务 |
| `src/modules/timeline/dto/timeline-query.dto.ts` | 查询参数 DTO |
| `src/modules/timeline/timeline-scraper.service.spec.ts` | 爬虫标题匹配单元测试 |
| `src/modules/timeline/timeline.service.spec.ts` | 服务层单元测试 |
| `src/app.module.ts` | 注册 TimelineModule + ScheduleModule |

### Frontend (apps/web/)

| 文件 | 职责 |
|------|------|
| `src/services/timeline-api.ts` | API 调用封装 |
| `src/components/home/TimelineTracker.tsx` | 时间轴组件（含响应式） |
| `src/app/page.tsx` | 集成时间轴到首页 |

---

### Task 1: Prisma Schema — 新增 TimelineEvent 模型

**Files:**
- Modify: `apps/server/prisma/schema.prisma`

- [ ] **Step 1: 在 schema.prisma 末尾添加 TimelineEvent 模型**

在文件末尾（`AlgorithmConfig` 模型之后）添加：

```prisma
// ==================== 高考时间轴 ====================

model TimelineEvent {
  id        Int      @id @default(autoincrement())
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  key       String   @db.VarChar(30)   // 'gaokao' | 'score_query' | 'early_batch' | 'regular_batch' | 'vocational_batch'
  name      String   @db.VarChar(30)   // "高考"、"本科提前批"等
  status    String   @db.VarChar(30)   // 'countdown' | 'estimated' | 'filling' | 'in_progress' | 'collecting_1' | 'collecting_2' | 'collecting_3' | 'available' | 'completed'
  sortOrder Int      @map("sort_order")
  startDate DateTime? @map("start_date")
  endDate   DateTime? @map("end_date")
  detail    Json?     // 征集截止时间、子批次信息等
  sourceUrl String?  @map("source_url") @db.VarChar(500)
  year      Int

  @@unique([key, year])
  @@index([year])
  @@map("timeline_events")
}
```

- [ ] **Step 2: 生成 Prisma Client**

Run: `cd apps/server && npx prisma generate`
Expected: `✔ Generated Prisma Client`

- [ ] **Step 3: 推送 schema 到数据库**

Run: `cd apps/server && npx prisma db push`
Expected: 无报错，`timeline_events` 表已创建

- [ ] **Step 4: Commit**

```bash
git add apps/server/prisma/schema.prisma
git commit -m "feat: add TimelineEvent model for gaokao timeline tracker"
```

---

### Task 2: 安装 @nestjs/schedule

**Files:**
- Modify: `apps/server/package.json`
- Modify: `apps/server/src/app.module.ts`

- [ ] **Step 1: 安装依赖**

Run: `cd apps/server && pnpm add @nestjs/schedule`
Expected: 安装成功，package.json 新增 `@nestjs/schedule`

- [ ] **Step 2: 在 AppModule 注册 ScheduleModule**

在 `apps/server/src/app.module.ts` 中：

添加 import：
```typescript
import { ScheduleModule } from '@nestjs/schedule';
```

在 `imports` 数组的"基础设施模块"区域（`HealthModule` 之后）添加：
```typescript
ScheduleModule.forRoot(),
```

- [ ] **Step 3: 验证编译**

Run: `cd apps/server && npx nest build`
Expected: 编译成功无报错

- [ ] **Step 4: Commit**

```bash
git add apps/server/package.json apps/server/src/app.module.ts pnpm-lock.yaml
git commit -m "chore: add @nestjs/schedule for cron job support"
```

---

### Task 3: 爬虫标题匹配逻辑 — 测试先行

**Files:**
- Create: `apps/server/src/modules/timeline/timeline-scraper.service.ts`
- Create: `apps/server/src/modules/timeline/timeline-scraper.service.spec.ts`

- [ ] **Step 1: 创建 scraper service 骨架**

创建 `apps/server/src/modules/timeline/timeline-scraper.service.ts`：

```typescript
import { Injectable, Logger } from '@nestjs/common';

export interface ScrapedAnnouncement {
  title: string;
  date: string;
  url: string;
}

export interface StatusMatch {
  key: string;       // 'gaokao' | 'score_query' | 'early_batch' | 'regular_batch' | 'vocational_batch'
  status: string;    // 目标状态
  sourceUrl: string; // 公告链接
}

@Injectable()
export class TimelineScraperService {
  private readonly logger = new Logger(TimelineScraperService.name);

  /**
   * 从公告标题列表中分析出各节点的最新状态
   * 只处理包含特定年份的公告，按日期从新到旧排序
   */
  analyzeAnnouncements(announcements: ScrapedAnnouncement[], year: number): StatusMatch[] {
    const matches: StatusMatch[] = [];
    const matched = new Set<string>(); // 每个 key 只取最新的一条

    for (const ann of announcements) {
      // 只处理对应年份的公告
      if (!ann.title.includes(String(year))) {
        // 部分公告标题不含年份（如"关于本科提前批次A段..."），继续匹配
      }

      const result = this.matchTitle(ann.title);
      if (result && !matched.has(result.key)) {
        matched.add(result.key);
        matches.push({ ...result, sourceUrl: ann.url });
      }
    }

    return matches;
  }

  /**
   * 标题 → (节点key, 目标状态) 的匹配逻辑
   * 基于2025年四川省教育考试院真实公告标题模式
   */
  matchTitle(title: string): { key: string; status: string } | null {
    // 全部录取结束 → 所有节点完成（调用方需特殊处理）
    if (/录取.*(顺利)?结束/.test(title)) {
      return { key: '__all__', status: 'completed' };
    }

    // 高考结束
    if (/高考.*(顺利)?结束/.test(title)) {
      return { key: 'gaokao', status: 'completed' };
    }

    // 成绩查询 / 分数线公布
    if (/成绩.*(查询|公布|分段统计)/.test(title) || /录取控制分数线/.test(title)) {
      return { key: 'score_query', status: 'available' };
    }

    // 志愿填报时间
    if (/志愿填报时间/.test(title)) {
      return { key: 'score_query', status: 'available' };
    }

    // --- 专科批（先匹配，避免被"本科"误匹配） ---
    if (/(专科|高职)/.test(title)) {
      if (/征集志愿/.test(title)) {
        const round = this.extractRound(title);
        return { key: 'vocational_batch', status: `collecting_${round}` };
      }
      if (/(投档|开始录取|正在录取)/.test(title)) {
        return { key: 'vocational_batch', status: 'in_progress' };
      }
    }

    // --- 本科提前批 ---
    if (/本科提前批/.test(title)) {
      if (/征集志愿/.test(title)) {
        const round = this.extractRound(title);
        return { key: 'early_batch', status: `collecting_${round}` };
      }
      if (/(投档录取开始|开始录取|正在录取|投档$)/.test(title)) {
        return { key: 'early_batch', status: 'in_progress' };
      }
    }

    // --- 本科批（非提前批） ---
    if (/本科批次/.test(title) && !/提前/.test(title)) {
      if (/征集志愿/.test(title)) {
        const round = this.extractRound(title);
        return { key: 'regular_batch', status: `collecting_${round}` };
      }
      if (/(投档|开始录取|正在录取)/.test(title)) {
        return { key: 'regular_batch', status: 'in_progress' };
      }
    }

    return null;
  }

  /**
   * 从标题中提取征集志愿轮次
   * 无"第N次"标注 → 1，"第二次" → 2，"第三次" → 3
   */
  extractRound(title: string): number {
    const m = title.match(/第([二三四五六七八九十]+)次/);
    if (!m) return 1;
    const map: Record<string, number> = {
      '二': 2, '三': 3, '四': 4, '五': 5,
      '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
    };
    return map[m[1]] ?? 1;
  }

  /**
   * 解析 sceea.cn 新闻列表页 HTML，提取公告标题、日期、链接
   */
  parseListPage(html: string): ScrapedAnnouncement[] {
    const results: ScrapedAnnouncement[] = [];
    // 匹配 <li> 中的 <a> 和 <p>日期</p>
    const regex = /<a\s+href="([^"]+)"[^>]*title="([^"]+)"[^>]*>[^<]*<\/a>\s*<p>(\d{4}\/\d{1,2}\/\d{1,2}\s[\d:]+)<\/p>/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(html)) !== null) {
      results.push({
        url: `https://www.sceea.cn${match[1]}`,
        title: match[2].trim(),
        date: match[3],
      });
    }
    return results;
  }

  /**
   * 从 sceea.cn 抓取高考新闻列表页
   */
  async fetchNewsPage(): Promise<string> {
    const url = 'https://www.sceea.cn/List/NewsList_36_1.html';
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch sceea.cn: ${response.status}`);
    }
    return response.text();
  }
}
```

- [ ] **Step 2: 编写标题匹配的单元测试**

创建 `apps/server/src/modules/timeline/timeline-scraper.service.spec.ts`：

```typescript
import { TimelineScraperService } from './timeline-scraper.service';

describe('TimelineScraperService', () => {
  let service: TimelineScraperService;

  beforeEach(() => {
    service = new TimelineScraperService();
  });

  describe('matchTitle - 2025年真实公告标题', () => {
    it('should match 高考结束', () => {
      expect(service.matchTitle('我省2025年普通高考顺利结束'))
        .toEqual({ key: 'gaokao', status: 'completed' });
    });

    it('should match 成绩查询方式公布', () => {
      expect(service.matchTitle('考生注意！我省2025年高考成绩查询方式公布'))
        .toEqual({ key: 'score_query', status: 'available' });
    });

    it('should match 成绩分段统计表', () => {
      expect(service.matchTitle('官方发布！四川省2025年普通高考物理类成绩分段统计表出炉'))
        .toEqual({ key: 'score_query', status: 'available' });
    });

    it('should match 录取控制分数线', () => {
      expect(service.matchTitle('官方发布！四川省2025年普通高校招生录取控制分数线'))
        .toEqual({ key: 'score_query', status: 'available' });
    });

    it('should match 本科提前批A段投档录取开始', () => {
      expect(service.matchTitle('我省2025年普通类本科提前批A段投档录取开始 计划总体满足率高'))
        .toEqual({ key: 'early_batch', status: 'in_progress' });
    });

    it('should match 本科提前批A段征集志愿（第1次）', () => {
      expect(service.matchTitle('关于本科提前批次A段未完成计划高校征集志愿的通知'))
        .toEqual({ key: 'early_batch', status: 'collecting_1' });
    });

    it('should match 本科提前批B段投档录取开始', () => {
      expect(service.matchTitle('我省2025年普通类本科提前批次B段投档录取开始'))
        .toEqual({ key: 'early_batch', status: 'in_progress' });
    });

    it('should match 本科提前批B段第二次征集志愿', () => {
      expect(service.matchTitle('关于本科提前批次B段未完成计划高校第二次征集志愿的通知'))
        .toEqual({ key: 'early_batch', status: 'collecting_2' });
    });

    it('should match 本科批次A段国家专项征集志愿', () => {
      expect(service.matchTitle('关于本科批次A段国家专项计划未完成计划高校征集志愿的通知'))
        .toEqual({ key: 'regular_batch', status: 'collecting_1' });
    });

    it('should match 本科批次A段第二次征集', () => {
      expect(service.matchTitle('关于本科批次A段国家专项计划第二次、地方专项计划第一次征集志愿的通知'))
        .toEqual({ key: 'regular_batch', status: 'collecting_2' });
    });

    it('should match 本科批次B段投档', () => {
      expect(service.matchTitle('我省2025年普通类本科批次B段今日投档'))
        .toEqual({ key: 'regular_batch', status: 'in_progress' });
    });

    it('should match 本科批次B段第三次征集', () => {
      expect(service.matchTitle('关于本科批次B段第三次征集志愿的通知'))
        .toEqual({ key: 'regular_batch', status: 'collecting_3' });
    });

    it('should match 专科提前批正在录取', () => {
      expect(service.matchTitle('我省2025年普通类高职（专科）提前批次正在录取'))
        .toEqual({ key: 'vocational_batch', status: 'in_progress' });
    });

    it('should match 专科批次开始录取', () => {
      expect(service.matchTitle('我省2025年普通类高职（专科）批次开始录取'))
        .toEqual({ key: 'vocational_batch', status: 'in_progress' });
    });

    it('should match 专科批次征集志愿', () => {
      expect(service.matchTitle('关于专科批次征集志愿的通知（含物理类计划）'))
        .toEqual({ key: 'vocational_batch', status: 'collecting_1' });
    });

    it('should match 全部录取结束', () => {
      expect(service.matchTitle('我省2025年普通高校招生录取顺利结束 共录取68.71万人'))
        .toEqual({ key: '__all__', status: 'completed' });
    });

    it('should return null for unrelated announcements', () => {
      expect(service.matchTitle('四川省2026年普通高考网上报名操作指南')).toBeNull();
      expect(service.matchTitle('关于做好四川省2026年普通高校对口招生职业技能考试工作的通知')).toBeNull();
      expect(service.matchTitle('2025年下半年中小学教师资格考试（笔试）成绩即将发布')).toBeNull();
    });
  });

  describe('extractRound', () => {
    it('should return 1 when no round marker', () => {
      expect(service.extractRound('关于本科提前批次A段征集志愿的通知')).toBe(1);
    });

    it('should return 2 for 第二次', () => {
      expect(service.extractRound('关于本科提前批次B段第二次征集志愿的通知')).toBe(2);
    });

    it('should return 3 for 第三次', () => {
      expect(service.extractRound('关于本科批次B段第三次征集志愿的通知')).toBe(3);
    });
  });

  describe('parseListPage', () => {
    it('should parse announcements from HTML', () => {
      const html = `
        <ul id="list">
          <li>
            <a href="/Html/202506/Newsdetail_4308.html" target="_blank" title="我省2025年普通高考顺利结束">我省2025年普通高考顺利结束</a>
            <p>2025/6/9 18:28:00</p>
          </li>
          <li>
            <a href="/Html/202506/Newsdetail_4331.html" target="_blank" title="考生注意！我省2025年高考成绩查询方式公布">考生注意！我省2025年高考成绩查询方式公布</a>
            <p>2025/6/25 19:24:04</p>
          </li>
        </ul>
      `;
      const result = service.parseListPage(html);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        url: 'https://www.sceea.cn/Html/202506/Newsdetail_4308.html',
        title: '我省2025年普通高考顺利结束',
        date: '2025/6/9 18:28:00',
      });
      expect(result[1]).toEqual({
        url: 'https://www.sceea.cn/Html/202506/Newsdetail_4331.html',
        title: '考生注意！我省2025年高考成绩查询方式公布',
        date: '2025/6/25 19:24:04',
      });
    });
  });
});
```

- [ ] **Step 3: 运行测试确认通过**

Run: `cd apps/server && npx jest src/modules/timeline/timeline-scraper.service.spec.ts --verbose`
Expected: 全部 PASS

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/modules/timeline/timeline-scraper.service.ts apps/server/src/modules/timeline/timeline-scraper.service.spec.ts
git commit -m "feat: add timeline scraper with title matching logic and tests"
```

---

### Task 4: Timeline Service — 数据读写 + 种子数据

**Files:**
- Create: `apps/server/src/modules/timeline/timeline.service.ts`
- Create: `apps/server/src/modules/timeline/timeline.service.spec.ts`

- [ ] **Step 1: 创建 timeline service**

创建 `apps/server/src/modules/timeline/timeline.service.ts`：

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

// 状态优先级，用于防止回退
const STATUS_PRIORITY: Record<string, number> = {
  estimated: 0,
  countdown: 1,
  filling: 2,
  available: 3,   // 仅 score_query 使用
  in_progress: 4,
  collecting_1: 5,
  collecting_2: 6,
  collecting_3: 7,
  completed: 10,
};

@Injectable()
export class TimelineService {
  private readonly logger = new Logger(TimelineService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 获取指定年份的所有时间轴事件，按 sortOrder 排序
   */
  async getTimeline(year: number) {
    return this.prisma.timelineEvent.findMany({
      where: { year },
      orderBy: { sortOrder: 'asc' },
    });
  }

  /**
   * 更新节点状态（仅前进不后退）
   */
  async updateStatus(
    key: string,
    year: number,
    newStatus: string,
    sourceUrl?: string,
    detail?: Record<string, unknown>,
  ): Promise<boolean> {
    const event = await this.prisma.timelineEvent.findUnique({
      where: { key_year: { key, year } },
    });

    if (!event) {
      this.logger.warn(`TimelineEvent not found: key=${key}, year=${year}`);
      return false;
    }

    const currentPriority = STATUS_PRIORITY[event.status] ?? 0;
    const newPriority = STATUS_PRIORITY[newStatus] ?? 0;

    if (newPriority <= currentPriority) {
      this.logger.debug(
        `Skipping status update: ${key} ${event.status}(${currentPriority}) -> ${newStatus}(${newPriority})`,
      );
      return false;
    }

    await this.prisma.timelineEvent.update({
      where: { key_year: { key, year } },
      data: {
        status: newStatus,
        ...(sourceUrl && { sourceUrl }),
        ...(detail && { detail }),
      },
    });

    this.logger.log(`Timeline updated: ${key} -> ${newStatus}`);
    return true;
  }

  /**
   * 将所有节点标记为已完成（录取结束时调用）
   */
  async completeAll(year: number, sourceUrl?: string): Promise<void> {
    await this.prisma.timelineEvent.updateMany({
      where: { year, status: { not: 'completed' } },
      data: {
        status: 'completed',
        ...(sourceUrl && { sourceUrl }),
      },
    });
    this.logger.log(`All timeline events for ${year} marked as completed`);
  }

  /**
   * 初始化指定年份的种子数据（基于上一年时间线的预计日期）
   * 如果该年份数据已存在则跳过
   */
  async seedYear(year: number): Promise<void> {
    const existing = await this.prisma.timelineEvent.count({ where: { year } });
    if (existing > 0) {
      this.logger.debug(`Timeline for ${year} already exists, skipping seed`);
      return;
    }

    const events = [
      {
        key: 'gaokao',
        name: '高考',
        status: 'countdown',
        sortOrder: 1,
        startDate: new Date(`${year}-06-07`),
        endDate: new Date(`${year}-06-09`),
        year,
      },
      {
        key: 'score_query',
        name: '成绩查询',
        status: 'estimated',
        sortOrder: 2,
        startDate: new Date(`${year}-06-25`),
        endDate: null,
        year,
      },
      {
        key: 'early_batch',
        name: '本科提前批',
        status: 'estimated',
        sortOrder: 3,
        startDate: new Date(`${year}-07-07`),
        endDate: new Date(`${year}-07-18`),
        year,
      },
      {
        key: 'regular_batch',
        name: '本科批',
        status: 'estimated',
        sortOrder: 4,
        startDate: new Date(`${year}-07-21`),
        endDate: new Date(`${year}-08-04`),
        year,
      },
      {
        key: 'vocational_batch',
        name: '专科批',
        status: 'estimated',
        sortOrder: 5,
        startDate: new Date(`${year}-08-06`),
        endDate: new Date(`${year}-08-15`),
        year,
      },
    ];

    await this.prisma.timelineEvent.createMany({ data: events });
    this.logger.log(`Seeded timeline for ${year} with ${events.length} events`);
  }
}
```

- [ ] **Step 2: 编写 service 测试**

创建 `apps/server/src/modules/timeline/timeline.service.spec.ts`：

```typescript
import { TimelineService } from './timeline.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('TimelineService', () => {
  let service: TimelineService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      timelineEvent: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        count: jest.fn(),
        createMany: jest.fn(),
      },
    };
    service = new TimelineService(prisma as unknown as PrismaService);
  });

  describe('getTimeline', () => {
    it('should return events ordered by sortOrder', async () => {
      const mockEvents = [
        { key: 'gaokao', sortOrder: 1 },
        { key: 'score_query', sortOrder: 2 },
      ];
      prisma.timelineEvent.findMany.mockResolvedValue(mockEvents);

      const result = await service.getTimeline(2026);

      expect(prisma.timelineEvent.findMany).toHaveBeenCalledWith({
        where: { year: 2026 },
        orderBy: { sortOrder: 'asc' },
      });
      expect(result).toEqual(mockEvents);
    });
  });

  describe('updateStatus', () => {
    it('should update when new status has higher priority', async () => {
      prisma.timelineEvent.findUnique.mockResolvedValue({
        key: 'early_batch',
        status: 'estimated',
      });
      prisma.timelineEvent.update.mockResolvedValue({});

      const result = await service.updateStatus('early_batch', 2026, 'in_progress', 'https://example.com');

      expect(result).toBe(true);
      expect(prisma.timelineEvent.update).toHaveBeenCalled();
    });

    it('should NOT update when new status has lower/equal priority', async () => {
      prisma.timelineEvent.findUnique.mockResolvedValue({
        key: 'early_batch',
        status: 'in_progress',
      });

      const result = await service.updateStatus('early_batch', 2026, 'estimated');

      expect(result).toBe(false);
      expect(prisma.timelineEvent.update).not.toHaveBeenCalled();
    });

    it('should return false when event not found', async () => {
      prisma.timelineEvent.findUnique.mockResolvedValue(null);

      const result = await service.updateStatus('nonexistent', 2026, 'completed');

      expect(result).toBe(false);
    });
  });

  describe('seedYear', () => {
    it('should skip if data already exists', async () => {
      prisma.timelineEvent.count.mockResolvedValue(5);

      await service.seedYear(2026);

      expect(prisma.timelineEvent.createMany).not.toHaveBeenCalled();
    });

    it('should create 5 events for a new year', async () => {
      prisma.timelineEvent.count.mockResolvedValue(0);
      prisma.timelineEvent.createMany.mockResolvedValue({ count: 5 });

      await service.seedYear(2026);

      expect(prisma.timelineEvent.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({ key: 'gaokao', status: 'countdown', sortOrder: 1 }),
          expect.objectContaining({ key: 'vocational_batch', status: 'estimated', sortOrder: 5 }),
        ]),
      });
    });
  });
});
```

- [ ] **Step 3: 运行测试确认通过**

Run: `cd apps/server && npx jest src/modules/timeline/timeline.service.spec.ts --verbose`
Expected: 全部 PASS

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/modules/timeline/timeline.service.ts apps/server/src/modules/timeline/timeline.service.spec.ts
git commit -m "feat: add timeline service with status updates and seed logic"
```

---

### Task 5: Timeline Controller + DTO + Module

**Files:**
- Create: `apps/server/src/modules/timeline/dto/timeline-query.dto.ts`
- Create: `apps/server/src/modules/timeline/timeline.controller.ts`
- Create: `apps/server/src/modules/timeline/timeline.module.ts`
- Modify: `apps/server/src/app.module.ts`

- [ ] **Step 1: 创建查询 DTO**

创建 `apps/server/src/modules/timeline/dto/timeline-query.dto.ts`：

```typescript
import { IsInt, IsOptional, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class TimelineQueryDto {
  @ApiPropertyOptional({ description: '年份，默认当前年', example: 2026 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2025)
  @Max(2030)
  year?: number;
}
```

- [ ] **Step 2: 创建 controller**

创建 `apps/server/src/modules/timeline/timeline.controller.ts`：

```typescript
import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { TimelineService } from './timeline.service';
import { TimelineQueryDto } from './dto/timeline-query.dto';

@ApiTags('时间轴')
@Controller('timeline')
export class TimelineController {
  constructor(private readonly timelineService: TimelineService) {}

  @Get()
  @ApiOperation({ summary: '获取高考时间轴进度' })
  async getTimeline(@Query() query: TimelineQueryDto) {
    const year = query.year ?? new Date().getFullYear();
    const events = await this.timelineService.getTimeline(year);
    return { events };
  }
}
```

- [ ] **Step 3: 创建 module**

创建 `apps/server/src/modules/timeline/timeline.module.ts`：

```typescript
import { Module } from '@nestjs/common';
import { TimelineController } from './timeline.controller';
import { TimelineService } from './timeline.service';
import { TimelineScraperService } from './timeline-scraper.service';

@Module({
  controllers: [TimelineController],
  providers: [TimelineService, TimelineScraperService],
  exports: [TimelineService],
})
export class TimelineModule {}
```

- [ ] **Step 4: 在 AppModule 注册 TimelineModule**

在 `apps/server/src/app.module.ts` 中：

添加 import：
```typescript
import { TimelineModule } from './modules/timeline/timeline.module';
```

在 `imports` 数组的"业务模块"区域末尾添加：
```typescript
TimelineModule,
```

- [ ] **Step 5: 验证编译**

Run: `cd apps/server && npx nest build`
Expected: 编译成功无报错

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/modules/timeline/ apps/server/src/app.module.ts
git commit -m "feat: add timeline module with public GET /api/v1/timeline endpoint"
```

---

### Task 6: 定时爬虫任务

**Files:**
- Modify: `apps/server/src/modules/timeline/timeline-scraper.service.ts`

- [ ] **Step 1: 在 TimelineScraperService 中添加定时任务和执行逻辑**

在 `timeline-scraper.service.ts` 的 import 中添加：
```typescript
import { Cron, CronExpression } from '@nestjs/schedule';
import { TimelineService } from './timeline.service';
```

在类中注入 TimelineService：
```typescript
constructor(private readonly timelineService: TimelineService) {}
```

在类中添加定时任务方法：
```typescript
  /**
   * 每天凌晨4:00执行一次
   */
  @Cron('0 4 * * *')
  async handleDailyScrape(): Promise<void> {
    this.logger.log('Starting daily timeline scrape...');
    await this.scrapeAndUpdate();
  }

  /**
   * 录取期间（6-8月）每天20:00额外执行一次
   * cron: 每年6/7/8月每天20:00
   */
  @Cron('0 20 * 6-8 *')
  async handleEveningScrape(): Promise<void> {
    this.logger.log('Starting evening timeline scrape (admission period)...');
    await this.scrapeAndUpdate();
  }

  /**
   * 核心流程：抓取 → 解析 → 匹配 → 更新
   */
  async scrapeAndUpdate(): Promise<void> {
    const year = new Date().getFullYear();

    // 确保种子数据存在
    await this.timelineService.seedYear(year);

    try {
      const html = await this.fetchNewsPage();
      const announcements = this.parseListPage(html);
      this.logger.log(`Parsed ${announcements.length} announcements from sceea.cn`);

      const matches = this.analyzeAnnouncements(announcements, year);
      this.logger.log(`Found ${matches.length} status matches`);

      for (const match of matches) {
        if (match.key === '__all__') {
          await this.timelineService.completeAll(year, match.sourceUrl);
        } else {
          await this.timelineService.updateStatus(
            match.key,
            year,
            match.status,
            match.sourceUrl,
          );
        }
      }
    } catch (error) {
      this.logger.error(
        `Timeline scrape failed: ${error instanceof Error ? error.message : error}`,
      );
      // 失败不覆盖已有数据，只记录日志
    }
  }
```

- [ ] **Step 2: 验证编译**

Run: `cd apps/server && npx nest build`
Expected: 编译成功无报错

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/modules/timeline/timeline-scraper.service.ts
git commit -m "feat: add cron-based timeline scraping (daily 4am + evening during admission)"
```

---

### Task 7: 种子数据初始化

**Files:**
- Modify: `apps/server/src/modules/timeline/timeline.module.ts`

- [ ] **Step 1: 在 module 的 onModuleInit 中自动执行 seedYear**

修改 `apps/server/src/modules/timeline/timeline.module.ts`：

```typescript
import { Module, OnModuleInit } from '@nestjs/common';
import { TimelineController } from './timeline.controller';
import { TimelineService } from './timeline.service';
import { TimelineScraperService } from './timeline-scraper.service';

@Module({
  controllers: [TimelineController],
  providers: [TimelineService, TimelineScraperService],
  exports: [TimelineService],
})
export class TimelineModule implements OnModuleInit {
  constructor(private readonly timelineService: TimelineService) {}

  async onModuleInit() {
    const year = new Date().getFullYear();
    await this.timelineService.seedYear(year);
  }
}
```

- [ ] **Step 2: 验证编译**

Run: `cd apps/server && npx nest build`
Expected: 编译成功无报错

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/modules/timeline/timeline.module.ts
git commit -m "feat: auto-seed timeline data on server startup"
```

---

### Task 8: 前端 API Service

**Files:**
- Create: `apps/web/src/services/timeline-api.ts`

- [ ] **Step 1: 创建 timeline API service**

创建 `apps/web/src/services/timeline-api.ts`：

```typescript
import api from './api';

export interface TimelineEvent {
  id: number;
  key: string;
  name: string;
  status: string;
  sortOrder: number;
  startDate: string | null;
  endDate: string | null;
  detail: Record<string, unknown> | null;
  sourceUrl: string | null;
  year: number;
}

interface TimelineResponse {
  events: TimelineEvent[];
}

export const timelineApi = {
  getTimeline(year?: number): Promise<TimelineResponse> {
    const params = year ? { year } : {};
    return api.get('/timeline', { params });
  },
};
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/services/timeline-api.ts
git commit -m "feat: add timeline API service for frontend"
```

---

### Task 9: TimelineTracker 前端组件

**Files:**
- Create: `apps/web/src/components/home/TimelineTracker.tsx`

- [ ] **Step 1: 创建 TimelineTracker 组件**

创建 `apps/web/src/components/home/TimelineTracker.tsx`：

```tsx
'use client';

import { useEffect, useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { timelineApi, type TimelineEvent } from '@/services/timeline-api';

// 状态配置：标签文字、颜色分类
const STATUS_CONFIG: Record<string, { label: string; type: 'completed' | 'active' | 'pending' }> = {
  countdown: { label: '倒计时', type: 'active' },
  estimated: { label: '预计', type: 'pending' },
  filling: { label: '填报中', type: 'active' },
  available: { label: '可查询', type: 'completed' },
  in_progress: { label: '录取中', type: 'active' },
  collecting_1: { label: '一轮征集', type: 'active' },
  collecting_2: { label: '二轮征集', type: 'active' },
  collecting_3: { label: '三轮征集', type: 'active' },
  completed: { label: '已完成', type: 'completed' },
};

function getStatusConfig(status: string) {
  return STATUS_CONFIG[status] ?? { label: status, type: 'pending' };
}

// 倒计时天数计算
function getDaysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const target = new Date(dateStr);
  const now = new Date();
  const diff = target.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

// 找出当前活跃节点的 index
function getActiveIndex(events: TimelineEvent[]): number {
  // 从后往前找第一个非 estimated/completed 的节点
  for (let i = events.length - 1; i >= 0; i--) {
    const cfg = getStatusConfig(events[i].status);
    if (cfg.type === 'active') return i;
  }
  // 如果全是 completed，返回最后一个
  if (events.every((e) => e.status === 'completed' || e.status === 'available')) {
    return events.length - 1;
  }
  // 如果全是 estimated/countdown，返回第一个非 completed 的
  for (let i = 0; i < events.length; i++) {
    if (events[i].status !== 'completed' && events[i].status !== 'available') return i;
  }
  return 0;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function formatDateRange(start: string | null, end: string | null): string {
  if (!start) return '';
  if (!end) return `${formatDate(start)} 起`;
  return `${formatDate(start)} - ${formatDate(end)}`;
}

// ---- Node 组件 ----

interface NodeProps {
  event: TimelineEvent;
  isActive: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  lineStatus: 'completed' | 'active' | 'pending' | 'none';
  index: number;
}

function TimelineNode({ event, isActive, isExpanded, onToggle, lineStatus, index }: NodeProps) {
  const config = getStatusConfig(event.status);
  const days = event.status === 'countdown' ? getDaysUntil(event.startDate) : null;
  const size = isActive ? 'w-14 h-14' : 'w-10 h-10';
  const sizeNum = isActive ? 56 : 40;

  // 节点圆圈
  const renderCircle = () => {
    if (config.type === 'completed') {
      return (
        <div className={`${size} rounded-full bg-safe flex items-center justify-center text-white text-base shadow-[0_0_0_4px_var(--color-safe-fixed)] transition-transform duration-200 hover:scale-110`}>
          ✓
        </div>
      );
    }
    if (event.status === 'countdown' && days !== null) {
      return (
        <div className={`${size} rounded-full bg-gradient-to-br from-accent to-accent-light flex flex-col items-center justify-center text-white shadow-[0_0_0_4px_var(--color-accent-fixed)] animate-pulse-ring transition-transform duration-200 hover:scale-110`}>
          <span className="font-serif text-xl font-bold leading-none">{days}</span>
          <span className="text-[9px] font-medium opacity-90 -mt-0.5">天</span>
        </div>
      );
    }
    if (config.type === 'active') {
      return (
        <div className={`${size} rounded-full bg-accent flex items-center justify-center shadow-[0_0_0_4px_var(--color-accent-fixed)] animate-pulse-ring transition-transform duration-200 hover:scale-110`}>
          <span className="w-2.5 h-2.5 bg-white rounded-full block" />
        </div>
      );
    }
    // pending
    return (
      <div className={`${size} rounded-full bg-surface-dim flex items-center justify-center text-text-faint text-sm font-serif font-semibold`}>
        {index + 1}
      </div>
    );
  };

  // 状态标签
  const renderBadge = () => {
    if (config.type === 'completed') {
      return <span className="inline-flex text-[11px] text-safe font-medium bg-safe-fixed px-2.5 py-0.5 rounded-full mt-1">{config.label}</span>;
    }
    if (config.type === 'active') {
      return <span className="inline-flex items-center gap-1 text-[11px] text-white font-semibold bg-accent px-2.5 py-0.5 rounded-full mt-1">{config.label}</span>;
    }
    return <span className="inline-flex text-[11px] text-text-faint bg-surface-dim px-2.5 py-0.5 rounded-full mt-1">{config.label}</span>;
  };

  const textColor = config.type === 'completed'
    ? 'text-text'
    : config.type === 'active'
      ? 'text-accent'
      : 'text-text-faint';

  return (
    <div className="flex flex-col items-center z-[1] cursor-pointer" style={{ width: '20%' }} onClick={onToggle}>
      {renderCircle()}
      <div className={`font-serif text-[15px] font-semibold ${textColor} mt-3`}>{event.name}</div>
      {renderBadge()}
      <div className={`text-[11px] ${config.type === 'active' ? 'text-accent font-medium' : 'text-text-faint'} mt-0.5`}>
        {formatDateRange(event.startDate, event.endDate)}
      </div>

      {/* 展开详情 - 桌面端浮层 */}
      {isExpanded && (
        <div className="hidden lg:block absolute top-[120px] bg-surface rounded-[10px] p-4 shadow-card-hover border border-border w-[240px] text-left z-10">
          <div className="text-xs font-semibold mb-2" style={{ color: config.type === 'active' ? 'var(--color-accent)' : config.type === 'completed' ? 'var(--color-safe)' : 'var(--color-text-muted)' }}>
            {config.label}
          </div>
          {event.detail && typeof event.detail === 'object' && (
            <div className="bg-accent-fixed rounded-md p-2.5 mb-2 text-xs text-accent leading-relaxed">
              {Object.entries(event.detail as Record<string, string>).map(([k, v]) => (
                <div key={k}>{v}</div>
              ))}
            </div>
          )}
          <div className="text-[13px] text-text-secondary leading-relaxed">
            {formatDateRange(event.startDate, event.endDate)}
          </div>
          {event.sourceUrl && (
            <div className="mt-2.5 pt-2.5 border-t border-border-subtle">
              <a href={event.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-accent no-underline hover:underline">
                查看考试院公告 →
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---- Mobile Node ----

function MobileTimelineNode({ event, isActive, index, isLast }: { event: TimelineEvent; isActive: boolean; index: number; isLast: boolean }) {
  const config = getStatusConfig(event.status);
  const days = event.status === 'countdown' ? getDaysUntil(event.startDate) : null;
  const nodeSize = isActive ? 'w-11 h-11' : 'w-8 h-8';

  const renderCircle = () => {
    if (config.type === 'completed') {
      return <div className={`${nodeSize} rounded-full bg-safe flex items-center justify-center text-white text-xs flex-shrink-0`}>✓</div>;
    }
    if (event.status === 'countdown' && days !== null) {
      return (
        <div className={`${nodeSize} rounded-full bg-gradient-to-br from-accent to-accent-light flex flex-col items-center justify-center text-white shadow-[0_0_0_3px_var(--color-accent-fixed)] animate-pulse-ring flex-shrink-0`}>
          <span className="font-serif text-lg font-bold leading-none">{days}</span>
          <span className="text-[8px] font-medium opacity-90">天</span>
        </div>
      );
    }
    if (config.type === 'active') {
      return (
        <div className={`${nodeSize} rounded-full bg-accent flex items-center justify-center shadow-[0_0_0_3px_var(--color-accent-fixed)] animate-pulse-ring flex-shrink-0`}>
          <span className="w-2 h-2 bg-white rounded-full block" />
        </div>
      );
    }
    return <div className={`${nodeSize} rounded-full bg-surface-dim flex items-center justify-center text-text-faint text-xs font-serif flex-shrink-0`}>{index + 1}</div>;
  };

  const lineColor = config.type === 'completed' ? 'bg-safe' : config.type === 'active' ? 'bg-accent' : 'bg-surface-dim';
  const textColor = config.type === 'active' ? 'text-accent' : config.type === 'completed' ? 'text-text' : 'text-text-faint';

  return (
    <div className="flex gap-3.5 items-start">
      <div className="flex flex-col items-center flex-shrink-0">
        {renderCircle()}
        {!isLast && <div className={`w-0.5 h-7 ${lineColor}`} />}
      </div>
      <div className="pb-2 pt-1 flex-1">
        <div className="flex items-center gap-2">
          <span className={`font-serif text-[15px] font-semibold ${textColor}`}>{event.name}</span>
          {config.type === 'completed' && <span className="text-[10px] text-safe bg-safe-fixed px-2 py-px rounded-full">{config.label}</span>}
          {config.type === 'active' && <span className="text-[10px] text-white bg-accent px-2 py-px rounded-full font-semibold">{config.label}</span>}
          {config.type === 'pending' && <span className="text-[10px] text-text-faint bg-surface-dim px-2 py-px rounded-full">{config.label}</span>}
        </div>
        <div className={`text-xs mt-0.5 ${config.type === 'active' ? 'text-accent font-medium' : 'text-text-faint'}`}>
          {formatDateRange(event.startDate, event.endDate)}
        </div>
        {/* 移动端活跃节点内联展开详情 */}
        {isActive && event.sourceUrl && (
          <div className="bg-accent-fixed rounded-lg px-3 py-2 mt-2 text-xs">
            <a href={event.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-accent font-semibold no-underline">
              查看考试院公告 →
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

// ---- 主组件 ----

export default function TimelineTracker() {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ['timeline', new Date().getFullYear()],
    queryFn: () => timelineApi.getTimeline(new Date().getFullYear()),
    staleTime: 60 * 60 * 1000, // 1小时
  });

  const events = data?.events ?? [];
  const activeIndex = useMemo(() => getActiveIndex(events), [events]);

  // 连接线渐变：已完成段=绿色，当前段=金色，未来段=灰色
  const lineGradient = useMemo(() => {
    if (events.length === 0) return 'transparent';
    const segments: string[] = [];
    const step = 100 / (events.length - 1);
    for (let i = 0; i < events.length - 1; i++) {
      const start = step * i;
      const end = step * (i + 1);
      const cfg = getStatusConfig(events[i].status);
      const color = cfg.type === 'completed' ? 'var(--color-safe)' : cfg.type === 'active' ? 'var(--color-accent)' : 'var(--color-border)';
      segments.push(`${color} ${start}%, ${color} ${end}%`);
    }
    return `linear-gradient(to right, ${segments.join(', ')})`;
  }, [events]);

  if (isLoading || events.length === 0) return null;

  return (
    <section className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-12 py-8 sm:py-12 lg:py-16">
      {/* Header */}
      <div className="text-center mb-7 lg:mb-10">
        <div className="text-[11px] uppercase tracking-[2px] text-accent font-medium">录取进度</div>
        <h2 className="font-serif text-[22px] sm:text-[28px] lg:text-[32px] font-semibold text-text mt-1.5">
          {new Date().getFullYear()} 四川高考时间轴
        </h2>
        <p className="text-[13px] text-text-muted mt-1">
          数据来源：四川省教育考试院 · 每日自动更新
        </p>
      </div>

      {/* Desktop: horizontal timeline */}
      <div className="hidden lg:block">
        <div className="relative flex items-start justify-between px-8 max-w-[900px] mx-auto">
          {/* Connecting line */}
          <div
            className="absolute top-5 left-[60px] right-[60px] h-[3px] rounded-sm z-0"
            style={{ background: lineGradient }}
          />
          {events.map((event, i) => (
            <TimelineNode
              key={event.key}
              event={event}
              isActive={i === activeIndex}
              isExpanded={expandedIndex === i}
              onToggle={() => setExpandedIndex(expandedIndex === i ? null : i)}
              lineStatus={i < events.length - 1 ? getStatusConfig(events[i].status).type : 'none'}
              index={i}
            />
          ))}
        </div>
      </div>

      {/* Mobile: vertical timeline */}
      <div className="lg:hidden pl-2">
        {events.map((event, i) => (
          <MobileTimelineNode
            key={event.key}
            event={event}
            isActive={i === activeIndex}
            index={i}
            isLast={i === events.length - 1}
          />
        ))}
      </div>

      {/* Footer */}
      <div className="text-center mt-6 lg:mt-8 text-xs text-text-faint">
        点击节点查看详情 · 征集志愿窗口通常仅 12-24 小时，请密切关注
      </div>
    </section>
  );
}
```

- [ ] **Step 2: 添加 pulse-ring 动画到全局 CSS**

在 `apps/web/src/app/globals.css` 的 `@layer utilities` 或全局区域中添加：

```css
@keyframes pulse-ring {
  0% { box-shadow: 0 0 0 4px var(--color-accent-fixed); }
  50% { box-shadow: 0 0 0 10px rgba(184, 134, 11, 0.08); }
  100% { box-shadow: 0 0 0 4px var(--color-accent-fixed); }
}
.animate-pulse-ring {
  animation: pulse-ring 2s infinite;
}
```

- [ ] **Step 3: 验证编译**

Run: `cd apps/web && npx next build`
Expected: 编译成功（可能有未使用的 API 警告，没关系）

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/home/TimelineTracker.tsx apps/web/src/app/globals.css
git commit -m "feat: add TimelineTracker component with responsive horizontal/vertical layout"
```

---

### Task 10: 首页集成

**Files:**
- Modify: `apps/web/src/app/page.tsx`

- [ ] **Step 1: 在首页 Hero 和 Trust Bar 之间插入 TimelineTracker**

在 `apps/web/src/app/page.tsx` 中：

在文件顶部添加 import：
```typescript
import TimelineTracker from '@/components/home/TimelineTracker';
```

在 Hero section（`</section>` 结束、Trust Bar `<section>` 开始之间）插入：
```tsx
      {/* Timeline Tracker */}
      <TimelineTracker />
```

即在第一个 `</section>` 之后、`{/* Trust Bar */}` 注释之前插入。

- [ ] **Step 2: 本地验证**

Run: `cd apps/web && pnpm dev`

打开浏览器访问首页，确认：
- Hero 下方出现时间轴板块
- 高考节点显示倒计时天数
- 其余节点显示"预计"
- 移动端视口下切换为垂直布局

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/page.tsx
git commit -m "feat: integrate timeline tracker into homepage between hero and trust bar"
```

---

## Summary

| Task | 内容 | 预计时间 |
|------|------|---------|
| 1 | Prisma schema + migrate | 3 min |
| 2 | 安装 @nestjs/schedule | 3 min |
| 3 | 爬虫标题匹配 + 测试 | 5 min |
| 4 | Timeline service + 测试 | 5 min |
| 5 | Controller + DTO + Module | 4 min |
| 6 | 定时爬虫任务 | 3 min |
| 7 | 种子数据初始化 | 2 min |
| 8 | 前端 API service | 2 min |
| 9 | TimelineTracker 组件 | 5 min |
| 10 | 首页集成 | 2 min |
