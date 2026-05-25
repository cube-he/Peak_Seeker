# 首页(Landing)重设计 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把首页 `/` 重构为双形态——登录用户由 middleware 重定向到角色工作台,未登录访客看重新设计的 5 区块 landing。

**Architecture:** 三块改动相对独立——(1) 后端 `timeline.service.ts` 的 `seedYear` 改为逐节点 upsert,并新增 3 个志愿填报截止节点;(2) `middleware.ts` 对 `/` 做登录态重定向;(3) landing 视觉由 claude-design 产出代码后落地 `page.tsx`。前两块走 TDD,第三块是设计驱动落地。

**Tech Stack:** Next.js 14 (app router) / NestJS 10 / Prisma 7 / MySQL / TailwindCSS 3 / React Query 5 / Zustand 4 / Jest 29。

**配套 spec:** `docs/superpowers/specs/2026-05-21-homepage-redesign-design.md`

---

## 关于 Task 4(视觉落地)的特别说明

Task 1–3 是标准 TDD 任务,每步含完整代码。**Task 4 是设计稿转写任务**:claude-design 已产出首页设计稿 `landing.html`(单文件 HTML 原型),Task 4 把它转写落地为 Next.js 的 `page.tsx`。本计划给出转写规则、硬性约束与验收清单;JSX 的具体内容以 `landing.html` 为准,不在计划里重写。

**设计稿路径:** `C:\Users\17697\Documents\VolunteerHelper\WillNest Design System (智愿家) (1)\homepage\landing.html`(设计系统说明见同目录 `README.md`)。

---

## File Structure

**后端**
- Modify `apps/server/src/modules/timeline/timeline.service.ts` — `seedYear()` 改逐节点 upsert + 新增 3 个志愿填报截止节点
- Modify `apps/server/src/modules/timeline/timeline.service.spec.ts` — 更新 `seedYear` 测试与 mock

**前端 — 逻辑**
- Modify `apps/web/src/middleware.ts` — `/` 路由的登录态重定向
- Create `apps/web/src/__tests__/middleware.test.ts` — middleware 重定向测试
- Create `apps/web/src/components/home/heroTimeline.ts` — Hero 时间线卡数据逻辑(选节点 / 倒计时 / fallback)
- Create `apps/web/src/components/home/__tests__/heroTimeline.test.ts` — heroTimeline 测试

**前端 — 视觉(Task 4)**
- Create `apps/web/src/components/home/HomeTimelineCard.tsx` — Hero 右侧志愿填报时间线卡(新组件)
- Create `apps/web/src/app/homepage.css` — landing 区块样式(来自 landing.html 的 `<style>` 块)
- Create `apps/web/public/images/bg-hero-home.png`、`bg-cta-home.png` — Hero / CTA 背景图
- Modify `apps/web/src/app/globals.css` — 补 `--dur` 等 motion 变量(landing.html 用到、globals.css 暂缺)
- Modify `apps/web/src/app/page.tsx` — 重写为 5 区块 landing

---

## Task 1: 后端 — seedYear 改 upsert + 新增 3 个志愿填报截止节点

**Files:**
- Modify: `apps/server/src/modules/timeline/timeline.service.ts`(`seedYear`,当前 L81-185)
- Modify: `apps/server/src/modules/timeline/timeline.service.spec.ts`(`beforeEach` mock 当前 L8-20;`describe('seedYear')` 当前 L75-105)

**背景:** 现有 `seedYear` 是"该年份已有数据就整年 `return` 跳过 + `createMany`"。生产库 2026 已 seed 过 10 个节点,直接改 seed 数组加节点不会生效。改为逐节点 `upsert`:新节点插入、已存在节点只更新日历字段(name/sortOrder/日期),**不更新 status**(status 由爬虫 `updateStatus()` 推进,seed 不应让它回退)。`TimelineEvent` model 不变,无需 prisma migration。

- [ ] **Step 1: 给测试 mock 加 `upsert`**

`timeline.service.spec.ts` 的 `beforeEach`,在 `prisma.timelineEvent` 对象里加一行 `upsert: jest.fn(),`:

```ts
    prisma = {
      timelineEvent: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        count: jest.fn(),
        createMany: jest.fn(),
        upsert: jest.fn(),
      },
    };
```

- [ ] **Step 2: 重写 seedYear 的测试**

把 `timeline.service.spec.ts` 里整个 `describe('seedYear', () => { ... })`(当前 L75-105)替换为:

```ts
  describe('seedYear', () => {
    it('should upsert 13 events including the 3 volunteer-deadline nodes', async () => {
      prisma.timelineEvent.upsert.mockResolvedValue({});

      await service.seedYear(2026);

      expect(prisma.timelineEvent.upsert).toHaveBeenCalledTimes(13);
      const keys = prisma.timelineEvent.upsert.mock.calls.map(
        (c: any[]) => c[0].where.key_year.key,
      );
      expect(keys).toEqual(
        expect.arrayContaining([
          'volunteer_deadline_early',
          'volunteer_deadline_regular',
          'volunteer_deadline_vocational',
        ]),
      );
    });

    it('should not overwrite status on existing events (update payload omits status)', async () => {
      prisma.timelineEvent.upsert.mockResolvedValue({});

      await service.seedYear(2026);

      for (const call of prisma.timelineEvent.upsert.mock.calls) {
        expect(call[0].update).not.toHaveProperty('status');
      }
    });
  });
```

- [ ] **Step 3: 运行测试,确认失败**

Run: `pnpm --filter server test timeline.service`
Expected: FAIL —— 当前 `seedYear` 调 `createMany` 不调 `upsert`,新断言("upsert 调用 13 次")失败。

- [ ] **Step 4: 重写 seedYear**

把 `timeline.service.ts` 里整个 `async seedYear(year: number)` 方法(当前 L81-185)替换为:

```ts
  async seedYear(year: number): Promise<void> {
    // 节点设计参考 2025 年四川录取批次结构表 + sceea.cn 实际通知粒度。
    // 志愿填报截止时间(volunteer_deadline_*)来源:四川省教育考试院 2026 年通知。
    const events = [
      { key: 'gaokao', name: '高考', status: 'countdown', sortOrder: 1,
        startDate: new Date(`${year}-06-07`), endDate: new Date(`${year}-06-09`), year },
      { key: 'score_query', name: '出分/分数线', status: 'estimated', sortOrder: 2,
        startDate: new Date(`${year}-06-22`), endDate: new Date(`${year}-06-25`), year },
      { key: 'volunteer_filling', name: '志愿填报', status: 'estimated', sortOrder: 3,
        startDate: new Date(`${year}-06-24`), endDate: new Date(`${year}-07-02`), year },
      { key: 'volunteer_deadline_early', name: '本科提前批志愿截止', status: 'estimated', sortOrder: 4,
        startDate: new Date(`${year}-06-28T17:00:00+08:00`), endDate: null, year },
      { key: 'volunteer_deadline_regular', name: '本科批志愿截止', status: 'estimated', sortOrder: 5,
        startDate: new Date(`${year}-07-01T17:00:00+08:00`), endDate: null, year },
      { key: 'volunteer_deadline_vocational', name: '专科批志愿截止', status: 'estimated', sortOrder: 6,
        startDate: new Date(`${year}-07-05T17:00:00+08:00`), endDate: null, year },
      { key: 'early_batch_a', name: '本科提前批 A 段', status: 'estimated', sortOrder: 7,
        startDate: new Date(`${year}-07-07`), endDate: new Date(`${year}-07-15`), year },
      { key: 'early_batch_b', name: '本科提前批 B 段', status: 'estimated', sortOrder: 8,
        startDate: new Date(`${year}-07-16`), endDate: new Date(`${year}-07-20`), year },
      { key: 'regular_batch_a', name: '本科批 A 段', status: 'estimated', sortOrder: 9,
        startDate: new Date(`${year}-07-20`), endDate: new Date(`${year}-07-25`), year },
      { key: 'regular_batch_b', name: '本科批 B 段', status: 'estimated', sortOrder: 10,
        startDate: new Date(`${year}-07-26`), endDate: new Date(`${year}-08-05`), year },
      { key: 'vocational_early', name: '高职专科提前批', status: 'estimated', sortOrder: 11,
        startDate: new Date(`${year}-08-06`), endDate: new Date(`${year}-08-09`), year },
      { key: 'vocational_batch', name: '高职专科批', status: 'estimated', sortOrder: 12,
        startDate: new Date(`${year}-08-10`), endDate: new Date(`${year}-08-14`), year },
      { key: 'admission_end', name: '录取结束', status: 'estimated', sortOrder: 13,
        startDate: new Date(`${year}-08-15`), endDate: null, year },
    ];

    // 逐节点 upsert:新节点 create,已存在节点只 update 日历字段(不含 status,
    // 避免覆盖 updateStatus() 已推进的状态)。复合唯一键为 (key, year)。
    for (const event of events) {
      await this.prisma.timelineEvent.upsert({
        where: { key_year: { key: event.key, year } },
        create: event,
        update: {
          name: event.name,
          sortOrder: event.sortOrder,
          startDate: event.startDate,
          endDate: event.endDate,
        },
      });
    }
    this.logger.log(`Seeded/synced timeline for ${year}: ${events.length} events`);
  }
```

- [ ] **Step 5: 运行测试,确认通过**

Run: `pnpm --filter server test timeline.service`
Expected: PASS —— `seedYear` 2 个新测试 + `getTimeline` / `updateStatus` 原有测试全部通过。

- [ ] **Step 6: 提交**

```bash
git add apps/server/src/modules/timeline/timeline.service.ts apps/server/src/modules/timeline/timeline.service.spec.ts
git commit -m "feat(timeline): add volunteer-deadline nodes, seed via upsert"
```

---

## Task 2: 前端 — middleware 首页登录态重定向

**Files:**
- Modify: `apps/web/src/middleware.ts`
- Create: `apps/web/src/__tests__/middleware.test.ts`

**背景:** 现在 `/` 在 `PUBLIC_ROUTES` 里,middleware 对它无条件 `next()`。改为:`/` 上若有合法 token 且能解出 role,则重定向到 `ROLE_DASHBOARDS[role]`;否则 `next()`(未登录访客看 landing)。`getRoleFromToken`、`ROLE_DASHBOARDS` 已存在,直接复用。

- [ ] **Step 1: 写失败测试**

创建 `apps/web/src/__tests__/middleware.test.ts`:

```ts
/** @jest-environment node */
import { middleware } from '../middleware';
import { NextRequest } from 'next/server';

// 构造一个 payload 段含 role 的假 JWT(middleware 只解码不验签)
function tokenWithRole(role: string): string {
  const payload = Buffer.from(JSON.stringify({ role })).toString('base64url');
  return `header.${payload}.sig`;
}

describe('middleware — 首页登录态重定向', () => {
  it('已登录 STUDENT 访问 / 重定向到 /student/dashboard', () => {
    const req = new NextRequest('http://localhost/', {
      headers: { cookie: `access_token=${tokenWithRole('STUDENT')}` },
    });
    const res = middleware(req);
    expect(res.headers.get('location')).toContain('/student/dashboard');
  });

  it('已登录 TEACHER 访问 / 重定向到 /teacher/dashboard', () => {
    const req = new NextRequest('http://localhost/', {
      headers: { cookie: `access_token=${tokenWithRole('TEACHER')}` },
    });
    const res = middleware(req);
    expect(res.headers.get('location')).toContain('/teacher/dashboard');
  });

  it('未登录访客访问 / 放行(看 landing,无重定向)', () => {
    const req = new NextRequest('http://localhost/');
    const res = middleware(req);
    expect(res.headers.get('location')).toBeNull();
  });

  it('token 无法解析出角色时也放行 landing', () => {
    const req = new NextRequest('http://localhost/', {
      headers: { cookie: 'access_token=not-a-valid-jwt' },
    });
    const res = middleware(req);
    expect(res.headers.get('location')).toBeNull();
  });
});
```

- [ ] **Step 2: 运行测试,确认失败**

Run: `pnpm --filter web test middleware`
Expected: FAIL —— 前两个 case 当前 middleware 对 `/` 直接 `next()`,`location` 为 null。

- [ ] **Step 3: 改 middleware**

3a. 把 `PUBLIC_ROUTES` 常量(当前 L5)里的 `'/'` 移除——`/` 改由下方新逻辑处理:

```ts
const PUBLIC_ROUTES = ['/login', '/register'];
```

3b. 在 `middleware()` 函数里,"Skip static assets and API routes" 块之后、`if (isPublicRoute(pathname))` 之前(当前 L60 与 L61 之间),插入:

```ts
  // Home page: logged-in users go to their role dashboard; visitors see the landing.
  if (pathname === '/') {
    const homeToken =
      request.cookies.get('access_token')?.value ||
      request.headers.get('authorization')?.replace('Bearer ', '');
    if (homeToken) {
      const homeRole = getRoleFromToken(homeToken);
      if (homeRole && ROLE_DASHBOARDS[homeRole]) {
        return NextResponse.redirect(new URL(ROLE_DASHBOARDS[homeRole], request.url));
      }
    }
    return NextResponse.next();
  }
```

(变量用 `homeToken` / `homeRole`,避免与函数后段已有的 `const token` / `const role` 重名。)

- [ ] **Step 4: 运行测试,确认通过**

Run: `pnpm --filter web test middleware`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add apps/web/src/middleware.ts apps/web/src/__tests__/middleware.test.ts
git commit -m "feat(web): redirect logged-in users from / to role dashboard"
```

---

## Task 3: 前端 — Hero 时间线卡数据逻辑

**Files:**
- Create: `apps/web/src/components/home/heroTimeline.ts`
- Create: `apps/web/src/components/home/__tests__/heroTimeline.test.ts`

**背景:** Hero 时间线卡固定展示 5 个节点(高考 / 出分 / 3 个批次志愿截止)。这些节点优先取后端 `timelineApi` 数据;后端尚未补齐时(Task 1 未部署前)用前端 fallback 兜底。本任务只做纯数据逻辑,不含 UI。

- [ ] **Step 1: 写失败测试**

创建 `apps/web/src/components/home/__tests__/heroTimeline.test.ts`:

```ts
import { buildHeroTimeline, daysUntilGaokao, HERO_NODES } from '../heroTimeline';
import type { TimelineEvent } from '@/services/timeline-api';

function ev(key: string, name: string, startDate: string | null): TimelineEvent {
  return {
    id: 1, key, name, status: 'estimated', sortOrder: 1,
    startDate, endDate: null, detail: null, sourceUrl: null, year: 2026,
  };
}

describe('buildHeroTimeline', () => {
  it('返回固定 5 个节点,key 顺序与展示名固定', () => {
    const result = buildHeroTimeline([]);
    expect(result.map((n) => n.key)).toEqual([
      'gaokao', 'score_query', 'volunteer_deadline_early',
      'volunteer_deadline_regular', 'volunteer_deadline_vocational',
    ]);
    expect(result[2].label).toBe('本科提前批志愿截止');
  });

  it('后端有该节点时,iso 取后端 startDate', () => {
    const events = [
      ev('volunteer_deadline_early', '本科提前批志愿截止', '2026-06-30T17:00:00+08:00'),
    ];
    const node = buildHeroTimeline(events).find((n) => n.key === 'volunteer_deadline_early')!;
    expect(node.iso).toBe('2026-06-30T17:00:00+08:00');
  });

  it('后端缺该节点时,iso 用兜底日期', () => {
    const node = buildHeroTimeline([]).find((n) => n.key === 'volunteer_deadline_early')!;
    const def = HERO_NODES.find((d) => d.key === 'volunteer_deadline_early')!;
    expect(node.iso).toBe(def.fallbackIso);
  });
});

describe('daysUntilGaokao', () => {
  it('用后端 gaokao 节点算剩余天数', () => {
    const events = [ev('gaokao', '高考', '2026-06-07')];
    expect(daysUntilGaokao(events, new Date('2026-05-21T00:00:00+08:00'))).toBe(17);
  });

  it('无 gaokao 节点时回退到兜底日期', () => {
    expect(daysUntilGaokao([], new Date('2026-05-21T00:00:00+08:00'))).toBe(17);
  });

  it('高考已过返回 null', () => {
    expect(daysUntilGaokao([], new Date('2026-07-01T00:00:00+08:00'))).toBeNull();
  });
});
```

- [ ] **Step 2: 运行测试,确认失败**

Run: `pnpm --filter web test heroTimeline`
Expected: FAIL —— `heroTimeline.ts` 还不存在,模块解析失败。

- [ ] **Step 3: 实现 heroTimeline.ts**

创建 `apps/web/src/components/home/heroTimeline.ts`:

```ts
import type { TimelineEvent } from '@/services/timeline-api';

export interface HeroTimelineNode {
  key: string;
  label: string;
  iso: string; // ISO 日期;显示格式由 UI 组件决定
}

/**
 * Hero 时间线卡的 5 个节点定义,数组顺序即展示顺序。
 * label 为卡片展示名(固定由前端定);fallbackIso 为后端 timeline 缺该节点时的兜底日期。
 * 兜底日期来源:四川省教育考试院 2026 年通知(sceea.cn)。
 */
export const HERO_NODES: { key: string; label: string; fallbackIso: string }[] = [
  { key: 'gaokao', label: '高考', fallbackIso: '2026-06-07' },
  { key: 'score_query', label: '出分 · 一分一段表', fallbackIso: '2026-06-23' },
  { key: 'volunteer_deadline_early', label: '本科提前批志愿截止', fallbackIso: '2026-06-28T17:00:00+08:00' },
  { key: 'volunteer_deadline_regular', label: '本科批志愿截止', fallbackIso: '2026-07-01T17:00:00+08:00' },
  { key: 'volunteer_deadline_vocational', label: '专科批志愿截止', fallbackIso: '2026-07-05T17:00:00+08:00' },
];

/**
 * 构造 Hero 时间线卡的 5 个节点。label 固定用前端定义;
 * 日期优先取后端 timeline 对应节点的 startDate,缺失则用兜底日期。
 */
export function buildHeroTimeline(events: TimelineEvent[]): HeroTimelineNode[] {
  return HERO_NODES.map((def) => {
    const event = events.find((e) => e.key === def.key);
    return {
      key: def.key,
      label: def.label,
      iso: event?.startDate ?? def.fallbackIso,
    };
  });
}

/**
 * 距高考剩余天数。优先用后端 gaokao 节点,缺失则用兜底日期。
 * 高考已开始返回 null。
 */
export function daysUntilGaokao(
  events: TimelineEvent[],
  now: Date = new Date(),
): number | null {
  const gaokaoDef = HERO_NODES.find((d) => d.key === 'gaokao')!;
  const event = events.find((e) => e.key === 'gaokao');
  const iso = event?.startDate ?? gaokaoDef.fallbackIso;
  const diff = new Date(iso).getTime() - now.getTime();
  if (diff <= 0) return null;
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}
```

- [ ] **Step 4: 运行测试,确认通过**

Run: `pnpm --filter web test heroTimeline`
Expected: PASS(6 个用例全过)

- [ ] **Step 5: 提交**

```bash
git add apps/web/src/components/home/heroTimeline.ts apps/web/src/components/home/__tests__/heroTimeline.test.ts
git commit -m "feat(web): add hero timeline data logic with fallback"
```

---

## Task 4: 前端 — landing 视觉落地(landing.html 转写)

**Files:**
- Create: `apps/web/src/components/home/HomeTimelineCard.tsx`
- Modify: `apps/web/src/app/page.tsx`

**性质:** 设计稿转写任务(见文档开头说明)。claude-design 已产出 `landing.html`,本任务把它转写落地为 `page.tsx`。

- [ ] **Step 1: 转写准备 — 提取样式与资源**

claude-design 的产出是单文件 HTML 原型 `landing.html`(路径见文档开头)。落地前先做 3 件准备:
1. 把 `landing.html` 的整个 `<style>` 块复制到新文件 `apps/web/src/app/homepage.css`;`page.tsx` 顶部 `import './homepage.css'`。CSS 里的 `var(--*)` 变量项目 `globals.css` 已具备(下一条补齐缺失的)。
2. 把设计系统目录的 `assets/bg-hero-home.png`、`assets/bg-cta-home.png` 复制到 `apps/web/public/images/`。
3. 在 `globals.css` 的 `:root` 补 landing.html 用到、当前缺失的 motion 变量:`--dur-fast: 150ms;` `--dur: 200ms;` `--dur-slow: 300ms;`

- [ ] **Step 2: 落地 HomeTimelineCard 组件**

创建 `apps/web/src/components/home/HomeTimelineCard.tsx` —— Hero 右侧"志愿填报时间线卡":
- 入参:`events: TimelineEvent[]`(由 `page.tsx` 已有的 `timelineApi.getTimeline` 查询传入)。
- 用 `buildHeroTimeline(events)`(Task 3)得到 5 个节点,用 `daysUntilGaokao(events)` 得到倒计时天数。
- 展示:大倒计时"距高考 XX 天" + 5 个节点(label + 日期);进行中 / 最近节点高亮。
- **移动端必须可见**——不得用 `md:block` 之类在小屏隐藏(可用精简形态)。
- 视觉样式由 claude-design 产出。

- [ ] **Step 3: 重写 page.tsx 为 5 区块 landing**

照 `landing.html` 的 `<body>` 转写 `apps/web/src/app/page.tsx`:`class`→`className`、inline `style` 转 JSX 对象、SVG 属性转驼峰、inline `<svg>` 图标直接保留、`<a href>`→`next/link` 的 `<Link>`、Hero 右侧 `.countdown-card` 换成 `<HomeTimelineCard>`。landing.html 自带的顶部 nav 与底部 legal band **不移植**——`page.tsx` 用 `<MainLayout>` 包裹 5 区块(导航 / 页脚由 MainLayout 提供)。同时**删除当前 page.tsx 的以下假数据 / 冗余**(行号基于当前 page.tsx):
- `import { CountdownBadge }`(L7)及其使用(L178)——去掉 Hero 左上小徽章
- `sampleRows` 假志愿数组(L68-75)
- `fallbackTimeline` 数组(L77-120)——独立时间线 section 删除
- Hero 右侧假位次卡(L212-251)——替换为 `<HomeTimelineCard events={events} />`
- `features` 数组里的"数据安全"项(L58-65)——产品能力区只保留 5 个功能卡
- "数据底座" StatCard section(L349-359)——含假"92% 匹配度",整段删除
- 独立"填报流程时间线" section(L361-384)
- CTA 区右侧假用户量"12,408 名考生 / 21 个市州 / 832 所中学"(L408-412)
- 不再被引用的 helper(`StatCard` / `TimelineNode` / `TimelineNodeMobile` / `PlanBar` 等)随之删除

**必须满足的硬性约束:**
1. 区块顺序:Hero → 产品能力区 → 方案示例区 → 结尾 CTA → 数据来源条(最底部)
2. Hero 主标题 = 藏头联「智者明察 洞见四方 / 愿展宏图 扶摇直上 / 家有良师 伴你远航」,首字"智 / 愿 / 家"金色 + 着重号(以 landing.html 为准)
3. Hero 左侧保留 4 个统计(2,237 / 14.4 万 / 1,434 / 4 年)——真实数据,常量
4. 产品能力区 = 三步流程 + 5 个功能卡(院校库 / 专业库 / 查分系统 / AI 推荐 / 方案编辑器),无"数据安全"卡
5. 方案示例区:标题不出现"真实案例"字样,顶部标注"以下为示例演示,注册后将基于你的真实分数和偏好生成"
6. 数据来源条移到 landing 最底部;四川省教育考试院加链接 `https://www.sceea.cn`、阳光高考信息平台加教育部阳光高考平台官网链接,"各高校招生办"/"录取年报"保持纯文本

- [ ] **Step 4: 跑起来核对验收清单**

Run: `pnpm --filter web dev`,逐项核对:
- [ ] 5 个区块顺序与内容符合 spec 第 5 节
- [ ] Hero 主标题为指定文案,左上无 CountdownBadge
- [ ] Hero 右侧时间线卡:倒计时 + 5 节点,**手机视口下可见**
- [ ] 假数据全部消失:无假位次卡 / 假案例 / 92% 匹配度 / 假用户量
- [ ] 产品能力区 5 个功能卡,无"数据安全"
- [ ] 方案示例区有"示例演示"标注
- [ ] 数据来源条在最底部,链接可点击跳转

- [ ] **Step 5: 提交**

```bash
git add apps/web/src/app/page.tsx apps/web/src/components/home/HomeTimelineCard.tsx
git commit -m "feat(web): redesign homepage landing into 5 sections"
```

---

## Task 5: 整体验证与收尾

**Files:** 无(验证为主)

- [ ] **Step 1: 跑全部受影响测试**

Run: `pnpm --filter server test timeline` 与 `pnpm --filter web test`
Expected: 全部 PASS

- [ ] **Step 2: 构建检查**

Run: `pnpm --filter web build` 与 `pnpm --filter server build`
Expected: 两端构建成功,无类型错误

- [ ] **Step 3: 手动验证矩阵(dev 环境)**

- [ ] 未登录访问 `/` → 显示 landing
- [ ] STUDENT 登录后访问 `/` → 跳 `/student/dashboard`
- [ ] TEACHER 登录后访问 `/` → 跳 `/teacher/dashboard`
- [ ] ADMIN 登录后访问 `/` → 跳 `/admin/dashboard`
- [ ] Hero 时间线卡桌面端 / 移动端均正常

- [ ] **Step 4: 部署注意事项**

后端上线后 `TimelineModule.onModuleInit()` 会调 `seedYear(2026)`,逐节点 upsert 自动补 3 个志愿截止节点。部署后验证 `GET /timeline?year=2026` 返回 13 个 event(含 `volunteer_deadline_early/regular/vocational`)。timeline 接口无 Redis 缓存,无需清缓存。

- [ ] **Step 5: 如验证中有小修,提交**

```bash
git add -A
git commit -m "fix(web): homepage redesign verification fixes"
```
