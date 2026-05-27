# Plan Review Draft Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给方案审核流程加"草稿持久化"能力——主管在审 30 个志愿的过程中,任何时刻刷新/换设备/中途离开,逐项批注和总体审核意见都不丢失。

**Architecture:** 新增独立表 `PlanReviewDraft`,按 `(planId, reviewerId)` 唯一组合,一人对一个 plan 只有一份草稿。前端 debounce 自动保存(批注/总体意见 onChange 后 800ms 延迟写入)。审核动作 `APPROVE/REJECT/REQUEST_CHANGE` 提交成功后,事务内自动删除对应 draft。

**Tech Stack:** Prisma + NestJS + Jest + React Query + Next.js (App Router) + antd

---

## File Structure

**Backend (NestJS)**
- Create: `apps/server/prisma/migrations/<timestamp>_add_plan_review_draft/migration.sql` — Prisma 自动生成
- Modify: `apps/server/prisma/schema.prisma` — 新增 `PlanReviewDraft` 模型 + 两个反向关系
- Create: `apps/server/src/modules/plan/dto/upsert-review-draft.dto.ts` — 请求体 DTO
- Create: `apps/server/src/modules/plan/plan-review-draft.service.ts` — 三方法 service (getDraft / upsertDraft / clearDraft)
- Create: `apps/server/src/modules/plan/plan-review-draft.service.spec.ts` — service 单测
- Modify: `apps/server/src/modules/plan/plan.controller.ts` — 加 3 个 endpoint
- Modify: `apps/server/src/modules/plan/plan.module.ts` — provider 注册
- Modify: `apps/server/src/modules/plan/plan.service.ts` — `reviewPlan` 事务内清 draft
- Modify: `apps/server/src/modules/plan/plan.service.spec.ts` — 补 draft 清空的单测

**Frontend (Next.js)**
- Modify: `apps/web/src/services/plan-api.ts` — 加 3 个 API 方法
- Modify: `apps/web/src/app/(teacher)/teacher/plans/[id]/page.tsx` — 拉初值 + debounce auto-save + UI 提示

---

## Task 1: Prisma Model + Migration

**Files:**
- Modify: `apps/server/prisma/schema.prisma`

- [ ] **Step 1: 在 schema.prisma 末尾 PlanReview 后插入 PlanReviewDraft 模型**

找到 `apps/server/prisma/schema.prisma` line 992 附近的 `model PlanReview { ... }`,在其下方紧接着插入:

```prisma
// ==================== 方案审核草稿 ====================

model PlanReviewDraft {
  id        Int      @id @default(autoincrement())
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  // 关联方案
  planId Int           @map("plan_id")
  plan   VolunteerPlan @relation(fields: [planId], references: [id], onDelete: Cascade)

  // 审核人(同一审核人对同一方案只能有一份草稿)
  reviewerId Int  @map("reviewer_id")
  reviewer   User @relation(fields: [reviewerId], references: [id])

  // 草稿内容(等同 PlanReview.comment / PlanReview.itemAnnotations,但未提交)
  comment         String? @db.Text
  itemAnnotations Json?   @map("item_annotations")

  @@unique([planId, reviewerId])
  @@index([planId])
  @@map("plan_review_drafts")
}
```

- [ ] **Step 2: 在 User 模型加反向关系**

定位 `apps/server/prisma/schema.prisma` 中 User 模型的关系区块(约 line 609 附近的 `reviews PlanReview[]`),在 `reviews PlanReview[]` 那一行之后添加:

```prisma
  reviewDrafts   PlanReviewDraft[]
```

- [ ] **Step 3: 在 VolunteerPlan 模型加反向关系**

定位 `apps/server/prisma/schema.prisma` line 883 附近 `reviews PlanReview[]`,在那一行之后添加:

```prisma
  reviewDrafts PlanReviewDraft[]
```

- [ ] **Step 4: 生成迁移**

Run:
```bash
cd apps/server && pnpm prisma migrate dev --name add_plan_review_draft
```

Expected: 输出包含 `Applied migration ... add_plan_review_draft` 和 `Your database is now in sync with your schema.`

- [ ] **Step 5: 验证表已创建**

Run:
```bash
cd apps/server && pnpm prisma db execute --stdin <<< "SHOW CREATE TABLE plan_review_drafts;"
```

Expected: 输出包含 `CREATE TABLE ... plan_review_drafts ...` 及字段 `plan_id`, `reviewer_id`, `comment`, `item_annotations`, 以及唯一索引 `(plan_id, reviewer_id)`。

- [ ] **Step 6: Commit**

```bash
git add apps/server/prisma/schema.prisma apps/server/prisma/migrations/
git commit -m "feat(plan): add PlanReviewDraft model for review-in-progress persistence"
```

---

## Task 2: DTO 定义

**Files:**
- Create: `apps/server/src/modules/plan/dto/upsert-review-draft.dto.ts`

- [ ] **Step 1: 创建 DTO 文件**

Create `apps/server/src/modules/plan/dto/upsert-review-draft.dto.ts`:

```typescript
import { IsArray, IsOptional, IsString, ValidateNested, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ItemAnnotationDto {
  @IsInt()
  @Min(1)
  sequence: number;

  @IsString()
  annotation: string;
}

export class UpsertReviewDraftDto {
  @IsOptional()
  @IsString()
  comment?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ItemAnnotationDto)
  itemAnnotations?: ItemAnnotationDto[];
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/server/src/modules/plan/dto/upsert-review-draft.dto.ts
git commit -m "feat(plan): add UpsertReviewDraftDto"
```

---

## Task 3: Service 单测 (TDD - RED)

**Files:**
- Create: `apps/server/src/modules/plan/plan-review-draft.service.spec.ts`

- [ ] **Step 1: 写失败测试**

Create `apps/server/src/modules/plan/plan-review-draft.service.spec.ts`:

```typescript
import { Test } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PlanReviewDraftService } from './plan-review-draft.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('PlanReviewDraftService', () => {
  let service: PlanReviewDraftService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      volunteerPlan: { findUnique: jest.fn() },
      planReviewDraft: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
      },
    };

    const mod = await Test.createTestingModule({
      providers: [
        PlanReviewDraftService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = mod.get(PlanReviewDraftService);
  });

  describe('getDraft', () => {
    it('returns null when no draft exists', async () => {
      prisma.volunteerPlan.findUnique.mockResolvedValue({ id: 1 });
      prisma.planReviewDraft.findUnique.mockResolvedValue(null);

      const result = await service.getDraft(1, 100);

      expect(result).toBeNull();
      expect(prisma.planReviewDraft.findUnique).toHaveBeenCalledWith({
        where: { planId_reviewerId: { planId: 1, reviewerId: 100 } },
      });
    });

    it('returns draft when it exists', async () => {
      prisma.volunteerPlan.findUnique.mockResolvedValue({ id: 1 });
      const draft = {
        id: 99,
        planId: 1,
        reviewerId: 100,
        comment: 'work in progress',
        itemAnnotations: [{ sequence: 3, annotation: 'risky' }],
      };
      prisma.planReviewDraft.findUnique.mockResolvedValue(draft);

      const result = await service.getDraft(1, 100);

      expect(result).toEqual(draft);
    });

    it('throws NotFoundException when plan does not exist', async () => {
      prisma.volunteerPlan.findUnique.mockResolvedValue(null);

      await expect(service.getDraft(999, 100)).rejects.toThrow(NotFoundException);
    });
  });

  describe('upsertDraft', () => {
    it('creates draft when none exists', async () => {
      prisma.volunteerPlan.findUnique.mockResolvedValue({ id: 1 });
      prisma.planReviewDraft.upsert.mockResolvedValue({
        id: 1, planId: 1, reviewerId: 100, comment: 'note', itemAnnotations: null,
      });

      const result = await service.upsertDraft(1, 100, { comment: 'note' });

      expect(prisma.planReviewDraft.upsert).toHaveBeenCalledWith({
        where: { planId_reviewerId: { planId: 1, reviewerId: 100 } },
        create: { planId: 1, reviewerId: 100, comment: 'note', itemAnnotations: undefined },
        update: { comment: 'note', itemAnnotations: undefined },
      });
      expect(result.comment).toBe('note');
    });

    it('updates draft when one exists', async () => {
      prisma.volunteerPlan.findUnique.mockResolvedValue({ id: 1 });
      const annotations = [{ sequence: 1, annotation: 'fix this' }];
      prisma.planReviewDraft.upsert.mockResolvedValue({
        id: 1, planId: 1, reviewerId: 100, comment: null, itemAnnotations: annotations,
      });

      const result = await service.upsertDraft(1, 100, { itemAnnotations: annotations });

      expect(result.itemAnnotations).toEqual(annotations);
    });

    it('throws NotFoundException when plan does not exist', async () => {
      prisma.volunteerPlan.findUnique.mockResolvedValue(null);

      await expect(
        service.upsertDraft(999, 100, { comment: 'x' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('clearDraft', () => {
    it('deletes draft for given (planId, reviewerId) silently if missing', async () => {
      prisma.planReviewDraft.deleteMany.mockResolvedValue({ count: 0 });

      await service.clearDraft(1, 100);

      expect(prisma.planReviewDraft.deleteMany).toHaveBeenCalledWith({
        where: { planId: 1, reviewerId: 100 },
      });
    });
  });
});
```

- [ ] **Step 2: 跑测试,确认全部失败**

Run:
```bash
cd apps/server && pnpm jest plan-review-draft.service.spec.ts
```

Expected: FAIL with `Cannot find module './plan-review-draft.service'` 或类似找不到 service 的错误。

- [ ] **Step 3: Commit (RED)**

```bash
git add apps/server/src/modules/plan/plan-review-draft.service.spec.ts
git commit -m "test(plan): add PlanReviewDraftService spec (RED)"
```

---

## Task 4: Service 实现 (TDD - GREEN)

**Files:**
- Create: `apps/server/src/modules/plan/plan-review-draft.service.ts`

- [ ] **Step 1: 写最小实现让测试过**

Create `apps/server/src/modules/plan/plan-review-draft.service.ts`:

```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { UpsertReviewDraftDto } from './dto/upsert-review-draft.dto';

@Injectable()
export class PlanReviewDraftService {
  constructor(private prisma: PrismaService) {}

  /**
   * 获取当前用户对该方案的审核草稿。
   * 不存在则返回 null(不是 404)——前端拿到 null 直接走"空草稿"路径。
   */
  async getDraft(planId: number, reviewerId: number) {
    await this.assertPlanExists(planId);
    return this.prisma.planReviewDraft.findUnique({
      where: { planId_reviewerId: { planId, reviewerId } },
    });
  }

  /**
   * Upsert 草稿。前端 debounce 后调用,频率约每 800ms 一次。
   * 只更新 dto 中显式提供的字段(未提供的保留旧值由 Prisma upsert 语义保证)。
   */
  async upsertDraft(planId: number, reviewerId: number, dto: UpsertReviewDraftDto) {
    await this.assertPlanExists(planId);

    const itemAnnotations = dto.itemAnnotations as unknown as Prisma.InputJsonValue | undefined;

    return this.prisma.planReviewDraft.upsert({
      where: { planId_reviewerId: { planId, reviewerId } },
      create: { planId, reviewerId, comment: dto.comment, itemAnnotations },
      update: { comment: dto.comment, itemAnnotations },
    });
  }

  /**
   * 清空草稿。审核动作提交成功后由 PlanService.reviewPlan 事务内调用。
   * 用 deleteMany 而非 delete,缺失时静默通过(idempotent)。
   */
  async clearDraft(planId: number, reviewerId: number) {
    await this.prisma.planReviewDraft.deleteMany({
      where: { planId, reviewerId },
    });
  }

  private async assertPlanExists(planId: number) {
    const plan = await this.prisma.volunteerPlan.findUnique({
      where: { id: planId },
      select: { id: true },
    });
    if (!plan) throw new NotFoundException('方案不存在');
  }
}
```

- [ ] **Step 2: 跑测试,确认全部通过**

Run:
```bash
cd apps/server && pnpm jest plan-review-draft.service.spec.ts
```

Expected: PASS,7 个 it 全绿。

- [ ] **Step 3: Commit (GREEN)**

```bash
git add apps/server/src/modules/plan/plan-review-draft.service.ts
git commit -m "feat(plan): implement PlanReviewDraftService"
```

---

## Task 5: Controller Endpoints

**Files:**
- Modify: `apps/server/src/modules/plan/plan.controller.ts`
- Modify: `apps/server/src/modules/plan/plan.module.ts`

- [ ] **Step 1: 注册 Provider**

Edit `apps/server/src/modules/plan/plan.module.ts`,把整个文件改为:

```typescript
import { Module } from '@nestjs/common';
import { PlanController } from './plan.controller';
import { PlanService } from './plan.service';
import { PlanStateMachineService } from './plan-state-machine.service';
import { PlanReviewDraftService } from './plan-review-draft.service';
import { StudentPlansController } from './student-plans.controller';
import { PlanItemsController } from './plan-items.controller';
import { PlanItemService } from './plan-item.service';
import { PlanExportService } from './plan-export.service';

@Module({
  controllers: [PlanController, StudentPlansController, PlanItemsController],
  providers: [
    PlanService,
    PlanStateMachineService,
    PlanItemService,
    PlanExportService,
    PlanReviewDraftService,
  ],
  exports: [PlanService, PlanReviewDraftService],
})
export class PlanModule {}
```

- [ ] **Step 2: 在 PlanController 注入 Service**

Edit `apps/server/src/modules/plan/plan.controller.ts` lines 17-33 区域(constructor),加入新 service 注入:

把 import 区(line 17 附近)的:
```typescript
import { PlanService } from './plan.service';
import { PlanExportService } from './plan-export.service';
```

替换为:
```typescript
import { PlanService } from './plan.service';
import { PlanExportService } from './plan-export.service';
import { PlanReviewDraftService } from './plan-review-draft.service';
import { UpsertReviewDraftDto } from './dto/upsert-review-draft.dto';
```

把 constructor:
```typescript
  constructor(
    private planService: PlanService,
    private exportService: PlanExportService,
  ) {}
```

替换为:
```typescript
  constructor(
    private planService: PlanService,
    private exportService: PlanExportService,
    private draftService: PlanReviewDraftService,
  ) {}
```

- [ ] **Step 3: 在 PlanController 文件末尾、class 结尾 `}` 之前插入 3 个新端点**

在 `plan.controller.ts` 文件 class `PlanController` 闭合 `}` 之前插入:

```typescript
  @Get(':id/review-draft')
  @ApiOperation({ summary: '获取我对该方案的审核草稿(不存在返回 null)' })
  @ApiParam({ name: 'id', type: Number })
  async getReviewDraft(
    @Request() req: any,
    @Param('id', ParseIntPipe) planId: number,
  ) {
    return this.draftService.getDraft(planId, req.user.id);
  }

  @Put(':id/review-draft')
  @ApiOperation({ summary: 'Upsert 我对该方案的审核草稿' })
  @ApiParam({ name: 'id', type: Number })
  async upsertReviewDraft(
    @Request() req: any,
    @Param('id', ParseIntPipe) planId: number,
    @Body() dto: UpsertReviewDraftDto,
  ) {
    return this.draftService.upsertDraft(planId, req.user.id, dto);
  }

  @Delete(':id/review-draft')
  @ApiOperation({ summary: '手动清空我对该方案的审核草稿' })
  @ApiParam({ name: 'id', type: Number })
  async deleteReviewDraft(
    @Request() req: any,
    @Param('id', ParseIntPipe) planId: number,
  ) {
    await this.draftService.clearDraft(planId, req.user.id);
    return { ok: true };
  }
```

- [ ] **Step 4: 启动服务确认编译通过**

Run:
```bash
cd apps/server && pnpm build
```

Expected: 编译无报错,输出 `webpack compiled successfully` 或等价信息。

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/modules/plan/plan.controller.ts apps/server/src/modules/plan/plan.module.ts
git commit -m "feat(plan): expose review-draft GET/PUT/DELETE endpoints"
```

---

## Task 6: 集成清空 Draft 到 reviewPlan 流程

**Files:**
- Modify: `apps/server/src/modules/plan/plan.service.ts`
- Modify: `apps/server/src/modules/plan/plan.service.spec.ts`

- [ ] **Step 1: 在 plan.service.spec.ts 加测试 (RED)**

定位 `apps/server/src/modules/plan/plan.service.spec.ts` 顶部 `beforeEach` 块中 prisma mock 部分,把 mock 对象扩展为也包含 `planReviewDraft`:

把:
```typescript
      planReview: { create: jest.fn() },
      $transaction: jest.fn((cb: any) => cb(prisma)),
```

替换为:
```typescript
      planReview: { create: jest.fn() },
      planReviewDraft: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      $transaction: jest.fn((cb: any) => cb(prisma)),
```

然后在 `describe('PlanService workflow gates', ...)` 块内现有任何 `it` 之后,添加新测试:

```typescript
  it('reviewPlan clears reviewer draft within the same transaction', async () => {
    // 设置当前用户为主管,且 plan 在 REVIEWING 状态
    prisma.teacherProfile.findUnique.mockResolvedValue({ id: 5, userId: 20, isSupervisor: true });
    prisma.volunteerPlan.findUnique.mockResolvedValue({
      id: 50,
      status: 'REVIEWING',
      currentReviewerId: 20,
      versionNo: 1,
    });
    prisma.volunteerPlan.update.mockResolvedValue({ id: 50, status: 'APPROVED' });
    prisma.planReview.create.mockResolvedValue({ id: 999 });

    await service.reviewPlan(20, 50, {
      action: 'APPROVE',
      comment: 'looks good',
      itemAnnotations: [{ sequence: 1, annotation: 'ok' }],
    });

    expect(prisma.planReviewDraft.deleteMany).toHaveBeenCalledWith({
      where: { planId: 50, reviewerId: 20 },
    });
  });
```

- [ ] **Step 2: 跑测试,确认新测试失败**

Run:
```bash
cd apps/server && pnpm jest plan.service.spec.ts -t "clears reviewer draft"
```

Expected: FAIL with `expect(jest.fn()).toHaveBeenCalledWith(...) Number of calls: 0`。

- [ ] **Step 3: 修改 plan.service.ts 在 reviewPlan 末尾清空 draft (GREEN)**

定位 `apps/server/src/modules/plan/plan.service.ts` 里的 `async reviewPlan(...)` 方法。该方法目前用 `this.prisma.$transaction(async (tx) => { ... })` 包裹写入逻辑。

在 transaction callback **结尾、return 之前**(也就是 `planReview.create` 之后)插入:

```typescript
      // 审核动作成功后清空该审核人对该方案的草稿
      // 用 tx 而非 this.prisma 确保原子性:如果 planReview.create 失败,事务回滚,draft 仍保留
      await tx.planReviewDraft.deleteMany({
        where: { planId, reviewerId: userId },
      });
```

具体定位:在 `reviewPlan` 方法内,搜索 `planReview.create`,在该调用之后、`return` 之前插入上述代码。如果找不到精确位置,用 `Grep` 工具搜索 `planReview.create` 在 plan.service.ts 中的位置后定位。

- [ ] **Step 4: 跑测试,确认新测试通过且其它测试未坏**

Run:
```bash
cd apps/server && pnpm jest plan.service.spec.ts
```

Expected: PASS,所有原有测试 + 新增的 1 个 test 全绿。

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/modules/plan/plan.service.ts apps/server/src/modules/plan/plan.service.spec.ts
git commit -m "feat(plan): clear review draft when review action is submitted"
```

---

## Task 7: 前端 API Client

**Files:**
- Modify: `apps/web/src/services/plan-api.ts`

- [ ] **Step 1: 定位 plan-api.ts 现有 reviewPlan 方法**

Run:
```bash
grep -n "reviewPlan\|async review\|export const planApi" "apps/web/src/services/plan-api.ts"
```

记下 `planApi` 对象/类的结构,准备在它的 review 相关方法附近添加 3 个新方法。

- [ ] **Step 2: 在 plan-api.ts 加 3 个方法**

在 `plan-api.ts` 中 `planApi` 对象内(或对应的 service class 中,跟随当前文件风格),添加:

```typescript
  /**
   * 获取当前用户对该方案的审核草稿。
   * 返回 null 表示未保存过草稿。
   */
  async getReviewDraft(planId: number | string) {
    const res = await httpClient.get(`/plans/${planId}/review-draft`);
    // 后端不存在时返回 null,axios 会把 null 包到 res.data
    return res.data as null | {
      id: number;
      planId: number;
      reviewerId: number;
      comment: string | null;
      itemAnnotations: { sequence: number; annotation: string }[] | null;
      updatedAt: string;
    };
  },

  async upsertReviewDraft(
    planId: number | string,
    payload: {
      comment?: string;
      itemAnnotations?: { sequence: number; annotation: string }[];
    },
  ) {
    const res = await httpClient.put(`/plans/${planId}/review-draft`, payload);
    return res.data;
  },

  async deleteReviewDraft(planId: number | string) {
    const res = await httpClient.delete(`/plans/${planId}/review-draft`);
    return res.data as { ok: true };
  },
```

注意:`httpClient` 是 plan-api.ts 中已有的 axios 实例引用名。如果当前文件用的是别名(如 `apiClient`, `http`, `axios`),用同名替换。

- [ ] **Step 3: 跑前端构建确认无 TS 错误**

Run:
```bash
cd apps/web && pnpm tsc --noEmit
```

Expected: 无 error,只可能有已存在的 warning。

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/services/plan-api.ts
git commit -m "feat(plan): add review-draft client methods"
```

---

## Task 8: 前端 page.tsx 整合 — 加载初始 Draft

**Files:**
- Modify: `apps/web/src/app/(teacher)/teacher/plans/[id]/page.tsx`

- [ ] **Step 1: 在 page.tsx 引入 draft 查询**

定位 `apps/web/src/app/(teacher)/teacher/plans/[id]/page.tsx` line 124 附近的 `const { data, isLoading } = useQuery(...)`。

在该 query 之后,加入新的 draft query。整段插入:

```typescript
  // 拉取当前审核人对此方案的草稿:用于在审核中断后恢复未提交的批注/总体意见
  const { data: draftData } = useQuery({
    queryKey: ['plan-review-draft', planId],
    queryFn: () => planApi.getReviewDraft(planId),
    // 只在能审核的状态拉取,避免 DRAFT 状态(老师做方案中)误拉
    enabled: !!plan && (plan.status === 'PENDING_REVIEW' || plan.status === 'REVIEWING'),
  });
```

注意 `plan` 变量必须在 query 之前已经定义,所以这段代码应当紧跟在 `const plan = unwrap<Record<string, any>>(data);` 那一行(约 line 128)的**之后**。

- [ ] **Step 2: 在 draftData 加载完成时填入 useState**

定位 line 114 附近的:
```typescript
  const [annotations, setAnnotations] = useState<Record<number, string>>({});
```

紧接着这行,加入:
```typescript
  // 标记是否已从 draft 恢复初值,避免后续 draftData 重新拉取(如 React Query refetch)时
  // 覆盖用户已经输入的内容
  const [draftLoaded, setDraftLoaded] = useState(false);
```

然后在 `useEffect(() => { setNow(new Date()); }, []);` 之后(约 line 122)插入新的 effect:

```typescript
  // 从服务端 draft 恢复:仅首次加载时填入,之后用户编辑不被覆盖
  useEffect(() => {
    if (draftLoaded) return;
    if (!draftData) return;
    if (draftData.comment) setReviewComment(draftData.comment);
    if (Array.isArray(draftData.itemAnnotations)) {
      const restored: Record<number, string> = {};
      for (const a of draftData.itemAnnotations) {
        restored[a.sequence] = a.annotation;
      }
      setAnnotations(restored);
    }
    setDraftLoaded(true);
  }, [draftData, draftLoaded]);
```

- [ ] **Step 3: 启动开发服务器手动验证**

Run (in two terminals):
```bash
# Terminal 1
cd apps/server && pnpm dev

# Terminal 2
cd apps/web && pnpm dev
```

打开浏览器 http://localhost:3000/teacher/plans/<某个 PENDING_REVIEW 状态的 planId>,确认页面正常加载,F12 Network 看到对 `/plans/<id>/review-draft` 的 GET 请求返回 null 或 draft 对象(取决于数据库现状)。

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/(teacher)/teacher/plans/[id]/page.tsx
git commit -m "feat(plan): load review draft on detail page mount"
```

---

## Task 9: 前端 — Debounce 自动保存

**Files:**
- Modify: `apps/web/src/app/(teacher)/teacher/plans/[id]/page.tsx`

- [ ] **Step 1: 在 page.tsx 顶部加 debounce 工具**

定位 `apps/web/src/app/(teacher)/teacher/plans/[id]/page.tsx` 顶部 import 区,加入:

```typescript
import { useDebouncedCallback } from 'use-debounce';
```

如果 package.json 中没有 `use-debounce`,先安装:

```bash
cd apps/web && pnpm add use-debounce
```

然后再加 import。

- [ ] **Step 2: 在 useMutation 区域加 saveDraftMutation**

定位 line 143 附近 `const submitMutation = useMutation(...)` 之前,加入:

```typescript
  // 草稿保存:由 debounce 触发,失败不打扰用户(返回 toast 即可)
  const [draftSavedAt, setDraftSavedAt] = useState<Date | null>(null);
  const saveDraftMutation = useMutation({
    mutationFn: (payload: {
      comment?: string;
      itemAnnotations?: { sequence: number; annotation: string }[];
    }) => planApi.upsertReviewDraft(planId, payload),
    onSuccess: () => setDraftSavedAt(new Date()),
    // 草稿保存失败不弹错;静默(下次还会重试)
    onError: () => {},
  });
```

- [ ] **Step 3: 创建 debounce 函数包装 save**

在 `saveDraftMutation` 定义之后(同区域)添加:

```typescript
  // 800ms 内连续输入只触发一次保存;避免每次按键都发请求
  const debouncedSave = useDebouncedCallback(
    (comment: string, annotations: Record<number, string>) => {
      const itemAnnotations = Object.entries(annotations)
        .filter(([, anno]) => anno && anno.trim())
        .map(([seq, annotation]) => ({ sequence: Number(seq), annotation: annotation.trim() }));
      saveDraftMutation.mutate({
        comment: comment || undefined,
        itemAnnotations: itemAnnotations.length ? itemAnnotations : undefined,
      });
    },
    800,
  );
```

- [ ] **Step 4: 在 annotation/comment 变化时触发 debouncedSave**

定位 page.tsx 中 annotation 的修改入口:line 656 附近的 `<ItemExpansion ... onAnnotationChange={(val) => setAnnotations(...)} />`。

把现有的 `onAnnotationChange={(val) => ...}` 回调改造为:同时调用 debouncedSave。

具体:搜索 `onAnnotationChange=` 的位置,把回调:
```typescript
                onAnnotationChange={(val) =>
                  setAnnotations((prev) => ({ ...prev, [item.sequence]: val }))
                }
```

替换为:
```typescript
                onAnnotationChange={(val) => {
                  setAnnotations((prev) => {
                    const next = { ...prev, [item.sequence]: val };
                    // 同步触发草稿保存(取最新的 reviewComment 和 next annotations)
                    debouncedSave(reviewComment, next);
                    return next;
                  });
                }}
```

然后定位 `reviewComment` 的写入位置(约 line 249 `onChange={(e) => setReviewComment(e.target.value)}`)。把那一行替换为:

```typescript
                    onChange={(e) => {
                      const val = e.target.value;
                      setReviewComment(val);
                      debouncedSave(val, annotations);
                    }}
```

- [ ] **Step 5: 在审核相关 UI 上显示"草稿已保存"提示**

定位 line 251 附近的:
```typescript
          {annotationCount > 0 ? (
            <p className="text-xs text-text-muted">
              已对 {annotationCount} 个志愿填写逐项批注，将随本次审核一起提交。
            </p>
          ) : null}
```

紧接其后,加入:
```typescript
          {draftSavedAt ? (
            <p className="text-xs text-text-muted">
              草稿已保存于 {draftSavedAt.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
            </p>
          ) : null}
```

- [ ] **Step 6: 同步显示在主页面(非 Modal)**

逐项批注的"展开行"目前在 Modal 之外,所以需要在主页面也有一个反馈点。

定位 page.tsx 中主区域(`<Card>` 或主容器)合适位置——具体在哪由你执行时根据现状判断,目标是放在批注表附近一个不抢戏的位置(比如表头右上角)。

在该位置插入:
```typescript
          {draftSavedAt ? (
            <span className="ml-2 text-xs text-text-muted">
              · 草稿已保存 {draftSavedAt.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
            </span>
          ) : null}
```

- [ ] **Step 7: 提交审核成功后清前端状态**

定位 line 172-179 附近的 `reviewMutation` 的 onSuccess:
```typescript
    onSuccess: () => {
      setReviewComment('');
      setAnnotations({});
      void message.success('审核已提交');
      refresh();
    },
```

替换为:
```typescript
    onSuccess: () => {
      setReviewComment('');
      setAnnotations({});
      setDraftSavedAt(null);
      // 后端事务已删 draft,此处刷新 draft query 让 cache 一致(返回 null)
      void queryClient.invalidateQueries({ queryKey: ['plan-review-draft', planId] });
      void message.success('审核已提交');
      refresh();
    },
```

- [ ] **Step 8: 手动 E2E 验证**

打开 http://localhost:3000/teacher/plans/<某 REVIEWING 状态 planId>:
1. 在某行展开后填批注 "test annotation"
2. 等 1 秒(debounce 800ms 后保存)
3. 看到 "草稿已保存 xx:xx" 提示
4. F5 刷新页面
5. **确认批注仍然存在**
6. 点"通过"提交审核
7. 再刷新,确认批注消失(草稿已清)

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/app/(teacher)/teacher/plans/[id]/page.tsx apps/web/package.json apps/web/pnpm-lock.yaml
git commit -m "feat(plan): debounce auto-save for review draft annotations"
```

---

## Task 10: 自我审查 + 收尾

- [ ] **Step 1: 跑全量后端测试**

Run:
```bash
cd apps/server && pnpm test
```

Expected: 所有测试通过。如果有失败,先修复再继续。

- [ ] **Step 2: 跑全量前端类型检查**

Run:
```bash
cd apps/web && pnpm tsc --noEmit
```

Expected: 无 TS error。

- [ ] **Step 3: Lint**

Run:
```bash
cd apps/server && pnpm lint
cd apps/web && pnpm lint
```

Expected: 无 error。如有 warning 但不阻塞构建可暂时忽略。

- [ ] **Step 4: 手动跑一遍完整场景**

场景一:**审核中断恢复**
1. 创建/进入 PENDING_REVIEW 方案
2. 主管角色登录
3. 点"开始审核"进入 REVIEWING 状态
4. 在 5 条志愿上写批注
5. F5 刷新
6. 确认 5 条批注全部恢复

场景二:**提交后清空**
1. 接场景一,点"通过"
2. 刷新
3. 确认 draft 已清(批注不显示)

场景三:**多设备同步**(如果有第二台设备)
1. 设备 A 写到 #3
2. 设备 B 同账号打开同一方案,等 5 秒
3. 确认设备 B 看到 #1-#3 批注

如果场景一或二失败,回到对应 Task 检查。场景三是 nice-to-have,失败可记为已知限制。

- [ ] **Step 5: 最终 commit (如果还有 untracked 文件)**

```bash
git status
# 若还有未提交的相关变更:
git add <relevant files>
git commit -m "chore(plan): finalize review-draft feature"
```

---

## Self-Review Checklist

After all tasks complete, verify:

1. **Spec coverage**
   - ✅ 草稿持久化:Task 1-6 实现服务端 + 前端 debounce auto save
   - ✅ 多设备同步:同账号同 planId 共享同一 draft(由 `@@unique([planId, reviewerId])` 保证)
   - ✅ 提交后自动清:Task 6 在 reviewPlan 事务内清 + Task 9 invalidateQueries 同步前端 cache
   - ✅ 不破坏现有审核流:reviewMutation 流程未变,只是它的 setAnnotations({}) 之外多了一步 draft 失效

2. **Placeholder scan**
   - ✅ 所有 step 都给了完整代码
   - ✅ Run / Expected 都具体
   - ✅ 没有 "fill in details" / "similar to xxx" / "implement later"

3. **Type consistency**
   - DTO 字段 `comment?: string`、`itemAnnotations?: ItemAnnotationDto[]` —— Task 2 定义
   - Service 方法签名 `(planId, reviewerId, dto)` —— Task 3/4 一致
   - Controller endpoint shape —— Task 5 与 Service 一致
   - 前端 API client 参数与 Controller 端点一致 —— Task 7
   - useState 的 `annotations: Record<number, string>` 与 dto 的 `{ sequence: number, annotation: string }[]` —— Task 8/9 通过转换函数桥接,无冲突

---

## Notes & Known Limits

- **批注的"最终持久化"仍然是审核动作触发**:这版改动只是让"未提交前"也不丢。当老师提交 APPROVE/REJECT 时,批注从 `PlanReviewDraft` 转写到 `PlanReview.itemAnnotations`(由原有逻辑负责),然后清 draft。
- **不同审核动作的草稿不区分**:草稿是按 `(planId, reviewerId)` 组合存,不按 action 区分。如果主管先写了 APPROVE 草稿,后来改主意走 REJECT,这些批注仍然带过去——这是合理的,因为批注内容跟动作无关。
- **草稿过期清理**:目前不做。如果未来发现长期未提交的 draft 堆积,可加 cron 任务清 30 天未更新的。
