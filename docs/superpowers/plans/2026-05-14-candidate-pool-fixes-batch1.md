# 候选池修复第一批 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复候选池服务三个业务正确性 bug：删掉死端点 `getCandidates`、组内全部专业不达标时不再丢弃整组、专业级历史位次按 major→group→filing 三层 fallback。

**Architecture:** 全部在 `apps/server/src/modules/plan-candidate/` 服务层 + 前端 `plan-api.ts` 调用层 + service.spec 测试层完成。三个修复独立成 commit，每个修复内部 TDD RED→GREEN→REFACTOR。仅服务层逻辑变更，schema、controller 模块、DTO 不动（删除一条路由除外）。

**Tech Stack:** NestJS 10 + Prisma ORM + Jest（后端测试）+ TypeScript。

---

## File Structure

| 文件 | 操作 | 责任 |
|---|---|---|
| `apps/server/src/modules/plan-candidate/plan-candidate.controller.ts` | 修改 | 删除 `GET /plans/:planId/candidates` 路由 |
| `apps/server/src/modules/plan-candidate/plan-candidate.service.ts` | 修改 | 删除 `getCandidates` 方法、`calcGradient` import；`getCandidateGroups` 内去掉整组丢弃、加 `hasRecommended`；专业级 `historyMin` 三层 fallback + `historySource` |
| `apps/server/src/modules/plan-candidate/plan-candidate.service.spec.ts` | 修改 | 删除 6 个 `getCandidates` 测试；反转 3 个测整组消失的测试；新增 1 个排序测试 + 4 个 fallback 测试 |
| `apps/web/src/services/plan-api.ts` | 修改 | 删除 `getCandidates` 函数（保留 `CandidateListParams` interface — 被 `CandidateGroupListParams` 继承） |

---

## Task 1: 二次确认 getCandidates 引用范围

**Files:**
- Read-only: 全仓库 grep

- [ ] **Step 1: grep 后端用法**

Run:
```bash
grep -rn "getCandidates\b" apps/server/src 2>&1
```
Expected: 仅在 `plan-candidate.controller.ts` 与 `plan-candidate.service.ts` 与 `plan-candidate.service.spec.ts` 内命中。

- [ ] **Step 2: grep 前端用法**

Run:
```bash
grep -rn "planApi\.getCandidates\|\.getCandidates(" apps/web/src 2>&1
```
Expected: 仅在 `apps/web/src/services/plan-api.ts:84` 命中。如有其他文件命中，停下来汇报给用户。

- [ ] **Step 3: grep calcGradient 用法**

Run:
```bash
grep -rn "calcGradient\b" apps/server/src 2>&1
```
Expected: 仅在 `plan-candidate.service.ts`（import 行 + `getCandidates` 内部）与 `gradient-calculator.ts`（export）命中。如另有调用方，需要在 Task 4 保留 import。

---

## Task 2: 删除 controller 上的旧路由

**Files:**
- Modify: `apps/server/src/modules/plan-candidate/plan-candidate.controller.ts`

- [ ] **Step 1: 删除路由处理器**

将 `plan-candidate.controller.ts` 现有内容：
```ts
// plan-candidate.controller.ts
import { Controller, Get, Param, Query, ParseIntPipe, UseGuards, Req } from '@nestjs/common';
import { PlanCandidateService } from './plan-candidate.service';
import { GetCandidatesQueryDto } from './dto/get-candidates-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('plans')
export class PlanCandidateController {
  constructor(private service: PlanCandidateService) {}

  @Get(':planId/candidates')
  getCandidates(
    @Param('planId', ParseIntPipe) planId: number,
    @Query() q: GetCandidatesQueryDto,
    @Req() req: any,
  ) {
    return this.service.getCandidates(planId, q, req.user.id);
  }

  @Get(':planId/candidate-groups')
  getCandidateGroups(
    @Param('planId', ParseIntPipe) planId: number,
    @Query() q: GetCandidatesQueryDto,
    @Req() req: any,
  ) {
    return this.service.getCandidateGroups(planId, q, req.user.id);
  }
}
```

替换为：
```ts
// plan-candidate.controller.ts
import { Controller, Get, Param, Query, ParseIntPipe, UseGuards, Req } from '@nestjs/common';
import { PlanCandidateService } from './plan-candidate.service';
import { GetCandidatesQueryDto } from './dto/get-candidates-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('plans')
export class PlanCandidateController {
  constructor(private service: PlanCandidateService) {}

  @Get(':planId/candidate-groups')
  getCandidateGroups(
    @Param('planId', ParseIntPipe) planId: number,
    @Query() q: GetCandidatesQueryDto,
    @Req() req: any,
  ) {
    return this.service.getCandidateGroups(planId, q, req.user.id);
  }
}
```

- [ ] **Step 2: TypeScript 编译验证（增量）**

Run:
```bash
pnpm --filter @server exec tsc --noEmit
```
Expected: 报错点应该在 service 上（因为 service 还有未清理的 `getCandidates`，但 controller 不再引用）。controller 自身不出错即可。

---

## Task 3: 删除 service 内 getCandidates 方法

**Files:**
- Modify: `apps/server/src/modules/plan-candidate/plan-candidate.service.ts`

- [ ] **Step 1: 删除 getCandidates 方法体**

删除 `plan-candidate.service.ts` 第 1368 行到 1510 行（整个 `getCandidates` 方法），即从：

```ts
  async getCandidates(planId: number, q: GetCandidatesQuery, userId?: number) {
    const plan = await this.prisma.volunteerPlan.findUnique({
```

到该方法结束的：

```ts
      items: visible.slice(start, start + pageSize),
    };
  }
```

包含方法体。保留紧随其后的类结束 `}`。

- [ ] **Step 2: 验证 service 单独编译**

Run:
```bash
pnpm --filter @server exec tsc --noEmit
```
Expected: 关于 `getCandidates` 的错误消失。可能仍有未使用 import (`calcGradient`) 的 warning，下一个 Task 处理。

---

## Task 4: 清理 getCandidates 残留的 imports

**Files:**
- Modify: `apps/server/src/modules/plan-candidate/plan-candidate.service.ts`（第 12 行附近）

- [ ] **Step 1: 修改 gradient-calculator import**

`plan-candidate.service.ts` 第 12 行：

```ts
import { calcDynamicGradient, calcGradient } from './gradient-calculator';
```

改为：

```ts
import { calcDynamicGradient } from './gradient-calculator';
```

- [ ] **Step 2: 验证编译通过**

Run:
```bash
pnpm --filter @server exec tsc --noEmit
```
Expected: 完全通过，无错无警告。

如果有"未使用 import"报错指向其他符号，按报错逐一删除（保持外科手术式精确改动）。

---

## Task 5: 删除前端 plan-api 中的 getCandidates 函数

**Files:**
- Modify: `apps/web/src/services/plan-api.ts`（第 84-94 行）

- [ ] **Step 1: 删除 getCandidates 函数**

删除以下整块（第 84 到第 94 行，包括尾随空行）：

```ts
  getCandidates(planId: string | number, params?: CandidateListParams): Promise<any> {
    return api.get(`/plans/${planId}/candidates`, {
      params: {
        page: params?.page ?? 1,
        pageSize: params?.pageSize ?? 30,
        keyword: params?.keyword?.trim() || undefined,
        includeSoftFails: params?.includeSoftFails,
      },
    }) as any;
  },

```

保留 `CandidateListParams` interface（第 17 行起的定义），因 `CandidateGroupListParams` 继承自它。

- [ ] **Step 2: 前端编译验证**

Run:
```bash
pnpm --filter @web exec tsc --noEmit
```
Expected: 通过。如有任何 `Property 'getCandidates' does not exist` 报错，说明 Task 1 grep 漏了引用，停下来汇报。

---

## Task 6: 删除 service.spec 中 getCandidates 相关测试

**Files:**
- Modify: `apps/server/src/modules/plan-candidate/plan-candidate.service.spec.ts`

- [ ] **Step 1: 删除 6 个 it 块**

按测试标题在文件中定位并删除整个 `it(...)` 块（含 mock 设置）。6 个测试标题：

1. `'方案年份没有招生计划时回退到同批次最新可用年份'`（约第 152 行）
2. `'使用紧凑条件查询历史记录，避免为大量候选生成巨大 OR'`（约第 189 行）
3. `'按页面大小限制招生计划预取量'`（约第 227 行）
4. `'PASS 排在 SOFT_FAIL 前'`（约第 245 行）
5. `'includeSoftFails=false 仅返回 PASS'`（约第 272 行）
6. `'正确合并 AdmissionRecord 历史快照'`（约第 294 行）

每个 `it()` 从 `it('...', async () => {` 到匹配的 `});` 结束。

不要删除别的测试（特别是 `getCandidateGroups` 相关的）。

- [ ] **Step 2: 验证测试编译**

Run:
```bash
pnpm --filter @server exec tsc --noEmit
```
Expected: 通过。

- [ ] **Step 3: 运行剩余测试套件**

Run:
```bash
pnpm --filter @server test plan-candidate
```
Expected: 测试通过，且测试数量减少 6 个（之前 ~21 个，现在 ~15 个 — 数字以本地结果为准）。注意 Task 8 会再反转 3 个 + 新增 1 个，故现在测试数可能还有 3 个旧"整组消失"测试。

---

## Task 7: 提交修复 1

**Files:**
- 涉及前几个 Task 的所有变更

- [ ] **Step 1: 检查 diff 范围**

Run:
```bash
git status && git diff --stat
```
Expected: 4 个文件改动：
- `apps/server/src/modules/plan-candidate/plan-candidate.controller.ts`
- `apps/server/src/modules/plan-candidate/plan-candidate.service.ts`
- `apps/server/src/modules/plan-candidate/plan-candidate.service.spec.ts`
- `apps/web/src/services/plan-api.ts`

如果有其他无关文件（例如 `.claude/settings.local.json`），用 `git add` 精确暂存这 4 个文件，不要 `git add -A`。

- [ ] **Step 2: 提交**

Run:
```bash
git add apps/server/src/modules/plan-candidate/plan-candidate.controller.ts \
        apps/server/src/modules/plan-candidate/plan-candidate.service.ts \
        apps/server/src/modules/plan-candidate/plan-candidate.service.spec.ts \
        apps/web/src/services/plan-api.ts && \
git commit -m "refactor(plan-candidate): drop dead getCandidates endpoint

Frontend only consumes /candidate-groups. The legacy /candidates route
and service method had diverged from the groups variant; deleting it
removes a maintenance hazard and ~140 lines of duplicated logic."
```

Expected: commit 成功。

---

## Task 8: 反转 3 个测试 + 新增 1 个排序测试（RED）

**Files:**
- Modify: `apps/server/src/modules/plan-candidate/plan-candidate.service.spec.ts`

- [ ] **Step 1: 反转 "drops a group when all acceptable majors are clearly unreachable"**

找到约第 697 行的测试。

将原断言：
```ts
    const result: any = await service.getCandidateGroups(1, { page: 1, pageSize: 10, includeSoftFails: true, sort: 'MAJOR_MATCH' });

    expect(result.groups).toHaveLength(0);
    expect(result.total).toBe(0);
  });
```

替换为：
```ts
    const result: any = await service.getCandidateGroups(1, { page: 1, pageSize: 10, includeSoftFails: true, sort: 'MAJOR_MATCH' });

    expect(result.groups).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.groups[0].hasRecommended).toBe(false);
    expect(result.groups[0].majorSections.risk.map((m: any) => m.majorName)).toEqual(['Impossible Major']);
  });
```

同时把测试标题从 `'drops a group when all acceptable majors are clearly unreachable'` 改为 `'keeps an all-risk group but marks hasRecommended=false'`。

- [ ] **Step 2: 反转 "does not let a non-preferred major support a group when the student has strict preferences"**

找到约第 770 行。

将断言：
```ts
    const result: any = await service.getCandidateGroups(1, { page: 1, pageSize: 10, includeSoftFails: true, sort: 'MAJOR_MATCH' });

    expect(result.groups).toHaveLength(0);
  });
```

替换为：
```ts
    const result: any = await service.getCandidateGroups(1, { page: 1, pageSize: 10, includeSoftFails: true, sort: 'MAJOR_MATCH' });

    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].hasRecommended).toBe(false);
    expect(result.groups[0].majorSections.backup.map((m: any) => m.majorName)).toEqual(['Other Major']);
    expect(result.groups[0].majorSections.recommended).toHaveLength(0);
  });
```

把测试标题改为 `'keeps a backup-only group when student has strict preferences, but marks hasRecommended=false'`。

- [ ] **Step 3: 反转 "puts missing-rank majors into risk and does not let them support a group"**

找到约第 818 行。

将断言：
```ts
    const result: any = await service.getCandidateGroups(1, { page: 1, pageSize: 10, includeSoftFails: true, sort: 'MAJOR_MATCH' });

    expect(result.groups).toHaveLength(0);
  });
```

替换为：
```ts
    const result: any = await service.getCandidateGroups(1, { page: 1, pageSize: 10, includeSoftFails: true, sort: 'MAJOR_MATCH' });

    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].hasRecommended).toBe(false);
    expect(result.groups[0].majorSections.risk.map((m: any) => m.majorName)).toEqual(['New Major']);
  });
```

把测试标题改为 `'keeps a missing-rank group but marks hasRecommended=false'`。

- [ ] **Step 4: 新增"hasRecommended 排序"测试**

在 Step 3 测试块的 `});` 后插入新测试：

```ts
  it('sorts hasRecommended=true groups ahead of hasRecommended=false groups', async () => {
    mockCandidateGroupRequest({
      plans: [
        makeGroupEnrollmentPlan({
          id: 950,
          universityId: 50,
          university: { id: 50, name: 'Solid Uni', code: 'S' },
          majorCode: '0050',
          majorName: 'Solid Major',
          groupCode: 'GS',
        }),
        makeGroupEnrollmentPlan({
          id: 951,
          universityId: 51,
          university: { id: 51, name: 'Risky Uni', code: 'R' },
          majorCode: '0051',
          majorName: 'Risky Major',
          groupCode: 'GR',
        }),
      ],
      records: [
        makeGroupAdmissionRecord({
          universityId: 50,
          groupCode: 'GS',
          majorCode: '0050',
          majorName: 'Solid Major',
          majorMinRank: 150000,
        }),
        makeGroupAdmissionRecord({
          universityId: 51,
          groupCode: 'GR',
          majorCode: '0051',
          majorName: 'Risky Major',
          majorMinRank: 88,
        }),
      ],
    });
    rankStrategy.evaluateCandidate.mockImplementation(({ candidateRank }: any) =>
      Promise.resolve(
        candidateRank === 88
          ? makeRankStrategyResult('REJECTED', candidateRank)
          : makeRankStrategyResult('FORMAL', candidateRank),
      ),
    );

    const result: any = await service.getCandidateGroups(1, { page: 1, pageSize: 10, includeSoftFails: true, sort: 'MAJOR_MATCH' });

    expect(result.groups).toHaveLength(2);
    expect(result.groups[0].universityName).toBe('Solid Uni');
    expect(result.groups[0].hasRecommended).toBe(true);
    expect(result.groups[1].universityName).toBe('Risky Uni');
    expect(result.groups[1].hasRecommended).toBe(false);
  });
```

- [ ] **Step 5: 跑测试看红**

Run:
```bash
pnpm --filter @server test plan-candidate
```
Expected: 4 个测试失败，错误信息类似 "expected length 1, received 0"（旧实现仍丢组）和 "hasRecommended is undefined"（字段还没加）。

---

## Task 9: 实现"整组全 RISK 不消失"+ hasRecommended 字段（GREEN）

**Files:**
- Modify: `apps/server/src/modules/plan-candidate/plan-candidate.service.ts`

- [ ] **Step 1: 删除 return null 闸门 + 加 hasRecommended**

定位 `plan-candidate.service.ts` 约第 1267 行：

```ts
      const visibleMajors = q.includeSoftFails === false
        ? majors.filter((major) => major.matchStatus === 'PASS')
        : majors;
      this.sortCandidateMajors(visibleMajors);
      const majorSections = this.splitMajorSections(visibleMajors);
      if (majorSections.recommended.length === 0) return null;

      const orderedMajors = [
        ...majorSections.recommended,
        ...majorSections.backup,
        ...majorSections.risk,
      ];
      if (orderedMajors[0]) orderedMajors[0].isRecommendedAnchor = true;

      const recommendedAnchor = orderedMajors[0];
```

替换为：

```ts
      const visibleMajors = q.includeSoftFails === false
        ? majors.filter((major) => major.matchStatus === 'PASS')
        : majors;
      this.sortCandidateMajors(visibleMajors);
      const majorSections = this.splitMajorSections(visibleMajors);
      const hasRecommended = majorSections.recommended.length > 0;
      if (visibleMajors.length === 0) return null;

      const orderedMajors = [
        ...majorSections.recommended,
        ...majorSections.backup,
        ...majorSections.risk,
      ];
      if (orderedMajors[0]) orderedMajors[0].isRecommendedAnchor = true;

      const recommendedAnchor = orderedMajors[0];
```

> `if (visibleMajors.length === 0) return null;` 保留 — 当 `includeSoftFails=false` 且组内**全部专业都是 SOFT_FAIL**（被过滤光）时，组确实空，应丢弃。这与"专业都还在但没有 RECOMMENDED"是两种情况。

- [ ] **Step 2: 在 return 对象里加 hasRecommended 字段**

定位同一函数后续 return 对象（约第 1291 行起 `return { groupKey, universityId, ...`）。

在 `softFailCount: ...` 这一行前后任意位置插入：

```ts
        hasRecommended,
```

更具体地，找到：
```ts
        selectableMajorCount: majorSections.recommended.length + majorSections.backup.length,
        softFailCount: majorSections.risk.filter((major) => major.matchStatus === 'SOFT_FAIL').length,
```

改为：
```ts
        selectableMajorCount: majorSections.recommended.length + majorSections.backup.length,
        softFailCount: majorSections.risk.filter((major) => major.matchStatus === 'SOFT_FAIL').length,
        hasRecommended,
```

- [ ] **Step 3: 在 sortCandidateGroups 中加入 hasRecommended 优先级**

定位 `sortCandidateGroups` 方法（约第 757 行）的排序回调：

```ts
  private sortCandidateGroups(groups: any[], sort: CandidateGroupSort = 'MAJOR_MATCH', studentRank: number) {
    groups.sort((a, b) => {
      const soft = (a.softFailCount ?? 0) - (b.softFailCount ?? 0);
      if (soft !== 0) return soft;
```

在 `groups.sort((a, b) => {` 之后、`const soft = ...` 之前插入最高优先级排序键：

```ts
  private sortCandidateGroups(groups: any[], sort: CandidateGroupSort = 'MAJOR_MATCH', studentRank: number) {
    groups.sort((a, b) => {
      if ((a.hasRecommended === false) !== (b.hasRecommended === false)) {
        return a.hasRecommended === false ? 1 : -1;
      }
      const soft = (a.softFailCount ?? 0) - (b.softFailCount ?? 0);
      if (soft !== 0) return soft;
```

- [ ] **Step 4: 跑测试看绿**

Run:
```bash
pnpm --filter @server test plan-candidate
```
Expected: 全部测试通过，特别是 Task 8 反转的 3 个测试 + 新增的排序测试 4 个全绿。

如有失败：仔细比对 Step 1-3 的修改是否完全按 diff 来；常见错误是误把 `if (visibleMajors.length === 0)` 删掉，导致 `includeSoftFails=false` 时空组也返回。

---

## Task 10: 提交修复 2

- [ ] **Step 1: 提交**

Run:
```bash
git add apps/server/src/modules/plan-candidate/plan-candidate.service.ts \
        apps/server/src/modules/plan-candidate/plan-candidate.service.spec.ts && \
git commit -m "fix(plan-candidate): keep all-risk groups but mark hasRecommended=false

Previously a candidate group with no RECOMMENDED majors was dropped
entirely, hiding it from teachers who might want to override the
software's judgement. The group now stays in the result, ranked after
all hasRecommended=true groups, and the frontend can fold/highlight
it via the new hasRecommended boolean."
```

Expected: 成功。

---

## Task 11: 写 4 个 historyMin fallback 测试（RED）

**Files:**
- Modify: `apps/server/src/modules/plan-candidate/plan-candidate.service.spec.ts`

- [ ] **Step 1: 在 describe 块的最后一个 it() 之后插入 4 个新测试**

定位 `describe('PlanCandidateService', () => { ... })` 内部最后一个 `it()` 块的结束 `});`，在它之后、`describe` 的闭合 `});` 之前插入：

```ts
  it('major historyMin fallback - uses majorMinRank when available (L1=MAJOR)', async () => {
    mockCandidateGroupRequest({
      plans: [
        makeGroupEnrollmentPlan({
          id: 970,
          universityId: 70,
          university: { id: 70, name: 'L1 Uni', code: 'L1' },
          majorCode: '0070',
          majorName: 'L1 Major',
          groupCode: 'GL1',
        }),
      ],
      records: [
        makeGroupAdmissionRecord({
          universityId: 70,
          groupCode: 'GL1',
          majorCode: '0070',
          majorName: 'L1 Major',
          majorMinRank: 5000,
          groupMinRank: 8000,
          filingMinRank: 9000,
        }),
      ],
    });
    rankStrategy.evaluateCandidate.mockResolvedValue(makeRankStrategyResult('FORMAL', 5000));

    const result: any = await service.getCandidateGroups(1, { page: 1, pageSize: 10, includeSoftFails: true, sort: 'MAJOR_MATCH' });

    const major = result.groups[0].majors[0];
    expect(major.historySource).toBe('MAJOR');
    expect(major.rankDiffRatio).not.toBeNull();
  });

  it('major historyMin fallback - falls back to groupMinRank when majorMinRank missing (L2=GROUP)', async () => {
    mockCandidateGroupRequest({
      plans: [
        makeGroupEnrollmentPlan({
          id: 971,
          universityId: 71,
          university: { id: 71, name: 'L2 Uni', code: 'L2' },
          majorCode: '0071',
          majorName: 'L2 Major',
          groupCode: 'GL2',
        }),
      ],
      records: [
        makeGroupAdmissionRecord({
          universityId: 71,
          groupCode: 'GL2',
          majorCode: '0071',
          majorName: 'L2 Major',
          majorMinRank: null,
          groupMinRank: 8000,
          filingMinRank: 9000,
        }),
      ],
    });
    rankStrategy.evaluateCandidate.mockResolvedValue(makeRankStrategyResult('INSUFFICIENT_DATA', null));

    const result: any = await service.getCandidateGroups(1, { page: 1, pageSize: 10, includeSoftFails: true, sort: 'MAJOR_MATCH' });

    const major = result.groups[0].majors[0];
    expect(major.historySource).toBe('GROUP');
  });

  it('major historyMin fallback - falls back to filingMinRank when major and group missing (L3=FILING)', async () => {
    mockCandidateGroupRequest({
      plans: [
        makeGroupEnrollmentPlan({
          id: 972,
          universityId: 72,
          university: { id: 72, name: 'L3 Uni', code: 'L3' },
          majorCode: '0072',
          majorName: 'L3 Major',
          groupCode: 'GL3',
        }),
      ],
      records: [
        makeGroupAdmissionRecord({
          universityId: 72,
          groupCode: 'GL3',
          majorCode: '0072',
          majorName: 'L3 Major',
          majorMinRank: null,
          groupMinRank: null,
          filingMinRank: 9000,
        }),
      ],
    });
    rankStrategy.evaluateCandidate.mockResolvedValue(makeRankStrategyResult('INSUFFICIENT_DATA', null));

    const result: any = await service.getCandidateGroups(1, { page: 1, pageSize: 10, includeSoftFails: true, sort: 'MAJOR_MATCH' });

    const major = result.groups[0].majors[0];
    expect(major.historySource).toBe('FILING');
  });

  it('major historyMin fallback - returns NONE when all three are missing', async () => {
    mockCandidateGroupRequest({
      plans: [
        makeGroupEnrollmentPlan({
          id: 973,
          universityId: 73,
          university: { id: 73, name: 'L0 Uni', code: 'L0' },
          majorCode: '0073',
          majorName: 'L0 Major',
          groupCode: 'GL0',
        }),
      ],
      records: [
        makeGroupAdmissionRecord({
          universityId: 73,
          groupCode: 'GL0',
          majorCode: '0073',
          majorName: 'L0 Major',
          majorMinRank: null,
          groupMinRank: null,
          filingMinRank: null,
        }),
      ],
    });
    rankStrategy.evaluateCandidate.mockResolvedValue(makeRankStrategyResult('INSUFFICIENT_DATA', null));

    const result: any = await service.getCandidateGroups(1, { page: 1, pageSize: 10, includeSoftFails: true, sort: 'MAJOR_MATCH' });

    const major = result.groups[0].majors[0];
    expect(major.historySource).toBe('NONE');
    expect(major.rankDiffRatio).toBeNull();
  });
```

- [ ] **Step 2: 检查 makeGroupAdmissionRecord 是否支持 filingMinRank**

Run:
```bash
grep -n "filingMinRank\|filingMinScore" apps/server/src/modules/plan-candidate/plan-candidate.service.spec.ts | head -10
```

若 helper `makeGroupAdmissionRecord` 默认对象没有 `filingMinRank` 字段，仍然 OK — 4 个新测试都通过 `overrides` 显式设置，不依赖默认值。

- [ ] **Step 3: 跑测试看红**

Run:
```bash
pnpm --filter @server test plan-candidate
```
Expected: 4 个新测试失败，错误信息类似 "expected 'MAJOR', received undefined"（historySource 字段还没加）。

---

## Task 12: 实现 historyMin 三层 fallback（GREEN）

**Files:**
- Modify: `apps/server/src/modules/plan-candidate/plan-candidate.service.ts`

- [ ] **Step 1: 修改专业级 historyMin 计算**

定位 `getCandidateGroups` 内专业行循环（约第 1182-1199 行）：

```ts
      const majors = await Promise.all(rows.map(async (ep) => {
        const currentRecord = adIndex.get(recordKeyOf({ ...ep, year: source.sourceYear }));
        const previousRecord = adIndex.get(recordKeyOf({ ...ep, year: source.sourceYear - 1 }));
        const failReasons = this.checkSoftFails(student, ep, rules);
        const match = this.scoreMajorMatch(student, ep);
        const rankStrategy = await this.evaluateRankStrategy({
          studentRank,
          candidateRank: currentRecord?.majorMinRank ?? null,
          studentExamYear: plan.year,
          province,
          examType: student.examType,
          batch: plan.batchName,
          sourceAdmissionYear: source.sourceYear,
        });
        const display = this.classifyMajorDisplay(student, ep, failReasons, rankStrategy);
        const historyMin = groupScore.groupMinRank ?? currentRecord?.majorMinRank ?? null;
        const rankDiffRatio = historyMin ? studentRank / historyMin : null;
```

把这一段替换为：

```ts
      const currentGroupRecords = adByGroupYear.get(`${groupKey}|${source.sourceYear}`) ?? [];
      const fallbackGroupMin = bestNumber(currentGroupRecords.map((r: any) => r.groupMinRank), 'max');
      const fallbackFilingMin = bestNumber(currentGroupRecords.map((r: any) => r.filingMinRank), 'max');

      const majors = await Promise.all(rows.map(async (ep) => {
        const currentRecord = adIndex.get(recordKeyOf({ ...ep, year: source.sourceYear }));
        const previousRecord = adIndex.get(recordKeyOf({ ...ep, year: source.sourceYear - 1 }));
        const failReasons = this.checkSoftFails(student, ep, rules);
        const match = this.scoreMajorMatch(student, ep);
        const rankStrategy = await this.evaluateRankStrategy({
          studentRank,
          candidateRank: currentRecord?.majorMinRank ?? null,
          studentExamYear: plan.year,
          province,
          examType: student.examType,
          batch: plan.batchName,
          sourceAdmissionYear: source.sourceYear,
        });
        const display = this.classifyMajorDisplay(student, ep, failReasons, rankStrategy);
        const historyMin =
          currentRecord?.majorMinRank
          ?? fallbackGroupMin
          ?? fallbackFilingMin
          ?? null;
        const historySource: 'MAJOR' | 'GROUP' | 'FILING' | 'NONE' =
          currentRecord?.majorMinRank ? 'MAJOR'
          : fallbackGroupMin ? 'GROUP'
          : fallbackFilingMin ? 'FILING'
          : 'NONE';
        const rankDiffRatio = historyMin ? studentRank / historyMin : null;
```

注意：`currentGroupRecords` / `fallbackGroupMin` / `fallbackFilingMin` 这三行放在 `Promise.all(rows.map(...))` **之外**，避免每个专业行重复计算。

- [ ] **Step 2: 在 major 返回对象中新增 historySource 字段**

定位同一循环内 return 对象（约第 1211 行起）：

```ts
        return {
          enrollmentPlanId: ep.id,
          universityId: ep.universityId,
          majorId: ep.majorId,
          ...
          rankDiffRatio,
          dynamicGradient,
          suggestedGradient: dynamicGradient.gradient,
          matchStatus: failReasons.length === 0 ? 'PASS' : 'SOFT_FAIL',
          failReasons,
```

在 `rankDiffRatio,` 之后插入 `historySource,`：

```ts
          rankDiffRatio,
          historySource,
          dynamicGradient,
          suggestedGradient: dynamicGradient.gradient,
          matchStatus: failReasons.length === 0 ? 'PASS' : 'SOFT_FAIL',
          failReasons,
```

- [ ] **Step 3: 跑测试看绿**

Run:
```bash
pnpm --filter @server test plan-candidate
```
Expected: 4 个 fallback 测试通过，且所有既有测试不退化。

如果 L2/L3 测试失败显示 `historySource: 'MAJOR'` —— 说明 mock 的 `makeGroupAdmissionRecord` 默认 helper 里 `majorMinRank` 没设 null，回头检查 helper 默认值或在测试 override 里显式赋 null（Task 11 已显式 override，问题应不会出现）。

- [ ] **Step 4: 全量测试**

Run:
```bash
pnpm --filter @server test
```
Expected: 服务端全部测试通过。

- [ ] **Step 5: 构建验证**

Run:
```bash
pnpm --filter @server build && pnpm --filter @web build
```
Expected: 两侧构建均通过。

---

## Task 13: 提交修复 3

- [ ] **Step 1: 提交**

Run:
```bash
git add apps/server/src/modules/plan-candidate/plan-candidate.service.ts \
        apps/server/src/modules/plan-candidate/plan-candidate.service.spec.ts && \
git commit -m "fix(plan-candidate): three-tier fallback for major-level historyMin

For each major row, historyMin now falls back majorMinRank
-> groupMinRank -> filingMinRank, with a historySource discriminator
on the response. The previous order preferred groupMinRank, which
underestimated the difficulty of cold majors in a group and could
mislead teachers into placing students at risk of slide."
```

Expected: 成功。

---

## Task 14: 最终 smoke check

**Files:**
- N/A — 验证型任务

- [ ] **Step 1: 路由 404 验证**

Run（需要本地后端已启动；若未启动，跳过此步并在执行结束时手工补做）：
```bash
curl -i -X GET 'http://localhost:3001/api/v1/plans/1/candidates' -H 'Authorization: Bearer dummy' 2>&1 | head -5
```
Expected: HTTP 状态 404（"Cannot GET /api/v1/plans/1/candidates"）。

- [ ] **Step 2: candidate-groups 响应结构 spot check**

如果后端在跑且有真实学生数据，可：
```bash
curl -s 'http://localhost:3001/api/v1/plans/<real-plan-id>/candidate-groups?page=1&pageSize=2' -H 'Authorization: Bearer <token>' | jq '.groups[0] | {hasRecommended, firstMajor: (.majors[0] | {majorName, historySource, rankDiffRatio})}'
```
Expected: 输出含 `hasRecommended: true|false` 与 `historySource: "MAJOR"|"GROUP"|"FILING"|"NONE"`。

没有本地环境则跳过 — 验收以单测 + 构建为准。

- [ ] **Step 3: 汇报完成**

向用户报告：3 个修复已 commit，commit 哈希列表，service 测试 + build 状态。

---

## 验收清单（实施完成对照表）

- [x] **修复 1**：`GET /plans/:id/candidates` 返回 404（Task 2, 7, 14.1）
- [x] **修复 1**：前端 `plan-api.ts` 无 `getCandidates` 函数（Task 5）
- [x] **修复 2**：组内全 SOFT_FAIL/RISK 时仍返回，`hasRecommended=false`（Task 8.1-8.3, 9）
- [x] **修复 2**：`hasRecommended=true` 排在 `false` 之前（Task 8.4, 9.3）
- [x] **修复 3**：专业行 `historySource` 按 MAJOR > GROUP > FILING > NONE 优先（Task 11-12）
- [x] **测试**：service 测试套件全绿，新增 5 个测试用例（Task 12.4, 12.5）
- [x] **构建**：server 与 web 构建均通过（Task 12.5）
- [x] **不变量**：candidate-groups 接口仅新增字段，未删除既有字段
- [x] **不变量**：Prisma schema 未改动
