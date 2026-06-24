# sourceYear 解耦 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把方案生成引擎里单一的 `sourceYear` 拆成 `sourceYear`（招生计划年）/ `admissionBaselineYear`（录取线基准年）/ `scoreSegmentYear`（分↔位次换算年），使 2026 招生计划入库后，生成页仍用 2025 历史线与换算，不塌成全组 NO_LINE。

**Architecture:** 在 `resolveEnrollmentPlanSource`（plan-candidate.service.ts:978）一次解析出三个年份并返回；招生计划/计划数/纯净度/预测仍用 `sourceYear`，录取线/历史/梯度/竞争/征集/无史线锚改用 `admissionBaselineYear`，分↔位次换算改用 `scoreSegmentYear`。`score-segment.service.ts` 不改（`scoreToRank` 本就吃 year 参数，只换调用方传值）。

**Tech Stack:** NestJS + Prisma (MySQL/MariaDB) + Jest。测试文件 `plan-candidate.service.spec.ts` 已有 mock 工厂（`mockCandidateGroupRequest` / `makeGroupEnrollmentPlan` / `makeGroupAdmissionRecord`）。

参考设计：`docs/superpowers/specs/2026-06-24-sourceyear-decoupling-design.md`

---

## File Structure

- 修改：`apps/server/src/modules/plan-candidate/plan-candidate.service.ts`
  - `resolveEnrollmentPlanSource`（:978-1002）：解析并返回 `admissionBaselineYear` / `scoreSegmentYear`
  - 结果类型（含 `sourceYear: number` 的 interface，约 :90-94）：加两字段
  - 主路径 `getCandidateGroups`（:1466-2279）：路由各调用点到正确年份 + 响应暴露字段
  - 次要路径 `getCandidates`（:2281-2424）：同口径对齐
  - `pickGroupScore`（:1221-1253）：加就近年回退
- 修改：`apps/server/src/modules/plan-candidate/plan-candidate.service.spec.ts`
  - `beforeEach` mock 加 `admissionRecord.groupBy` / `scoreSegment.groupBy` 默认值
  - 新增解耦相关测试
- 不改：`apps/server/src/modules/score-segment/score-segment.service.ts`、`gradient-calculator.ts`、`filters/hard-filter.ts`

**年份路由总表（实现时对照）：**

| 调用点（行号约） | 用途 | 改为 |
|---|---|---|
| 1527 plan where、1683 previousWhere、1709 prediction targetYear、1757 purity、2062-2063 plan 元数据 | 招生计划/计划数/纯净度/预测 | 不变（`sourceYear` / `planYear`） |
| 1655 录取3年窗口、1833-1838 组记录+pickGroupScore/History、1878-1879 current/previousRecord、1895 sourceAdmissionYear、2162 无史线锚 bandWhere、2329 次要路径录取窗口 | 录取线/历史/梯度/无史线锚 | `admissionBaselineYear` |
| 1808 resolveBatchCompetition、1809 loadSupplementaryByGroup | 竞争/征集历史 | `admissionBaselineYear` |
| 1535 rankWindow、1601/1810 resolveStudentRank、2272 computePredictedScoreRange、2353 次要 resolveStudentRank | 分↔位次换算 | `scoreSegmentYear` |
| 1605-1606 / 2256-2258 / 2412-2415 响应 | 元数据暴露 | 保留 + 新增 `admissionBaselineYear`/`scoreSegmentYear` |

---

## Task 1: resolveEnrollmentPlanSource 解析并暴露三个年份（additive，无行为变化）

**Files:**
- Modify: `apps/server/src/modules/plan-candidate/plan-candidate.service.ts:978-1002`（解析）、`:1602-1608` 与 `:2254-2260`（响应暴露）、结果类型（约 :90-94）
- Test: `apps/server/src/modules/plan-candidate/plan-candidate.service.spec.ts`

- [ ] **Step 1: 给测试 mock 补 groupBy 默认值**

在 `beforeEach` 的 `prisma` 对象里（约 :128, :131），把 `admissionRecord` 和 `scoreSegment` 改为含 `groupBy`：

```ts
admissionRecord: { findMany: jest.fn(), groupBy: jest.fn().mockResolvedValue([{ year: 2025 }]) },
rankPrediction: { findMany: jest.fn().mockResolvedValue([]) },
batchLine: { findFirst: jest.fn().mockResolvedValue(null) },
scoreSegment: { findFirst: jest.fn().mockResolvedValue(null), groupBy: jest.fn().mockResolvedValue([{ year: 2025 }]) },
```

- [ ] **Step 2: 写失败测试（响应暴露两个新基线年）**

加到 describe 末尾：

```ts
it('2026 计划入库时解耦三个年份：sourceYear=2026, 录取/段表基线=2025', async () => {
  mockCandidateGroupRequest({
    plans: [makeGroupEnrollmentPlan()],
    records: [makeGroupAdmissionRecord({ year: 2025 })],
  });
  // 计划已有 2026 行；录取/段表仍止于 2025
  prisma.enrollmentPlan.groupBy.mockResolvedValue([{ year: 2026, _count: { _all: 1 } }]);
  prisma.admissionRecord.groupBy.mockResolvedValue([{ year: 2025 }]);
  prisma.scoreSegment.groupBy.mockResolvedValue([{ year: 2025 }]);

  const r: any = await service.getCandidateGroups(1, { page: 1, pageSize: 10, includeSoftFails: true, sort: 'MAJOR_MATCH' });

  expect(r.sourceYear).toBe(2026);
  expect(r.admissionBaselineYear).toBe(2025);
  expect(r.scoreSegmentYear).toBe(2025);
});
```

- [ ] **Step 3: 跑测试确认失败**

Run: `pnpm --filter server test -- plan-candidate.service.spec --t "解耦三个年份"`
Expected: FAIL —— `r.admissionBaselineYear` 为 `undefined`（字段未暴露）。

- [ ] **Step 4: 实现解析**

`resolveEnrollmentPlanSource`（:994-1001）改为：

```ts
    const sourceYear = rows[0]?.year ?? input.planYear;

    const [adBaselineRows, segBaselineRows] = await Promise.all([
      this.prisma.admissionRecord.groupBy({
        by: ['year'],
        where: { province: input.province, year: { lte: input.planYear } },
        orderBy: { year: 'desc' },
        take: 1,
      }),
      this.prisma.scoreSegment.groupBy({
        by: ['year'],
        where: { province: input.province, year: { lte: input.planYear } },
        orderBy: { year: 'desc' },
        take: 1,
      }),
    ]);
    const admissionBaselineYear = adBaselineRows[0]?.year ?? sourceYear;
    const scoreSegmentYear = segBaselineRows[0]?.year ?? sourceYear;

    return {
      planYear: input.planYear,
      sourceYear,
      admissionBaselineYear,
      scoreSegmentYear,
      sourceBatchName: input.batchName,
      isFallbackYear: sourceYear !== input.planYear,
    };
```

- [ ] **Step 5: 结果类型加字段**

在含 `sourceYear: number;` 的结果 interface（约 :90-94，`CandidateGroupFullResult` 同款字段处）紧邻加：

```ts
  sourceYear: number;
  admissionBaselineYear: number;
  scoreSegmentYear: number;
```

- [ ] **Step 6: 两个响应对象暴露字段**

`getCandidateGroups` 空结果（:1604-1608 区域）和完整结果（:2256-2260 区域）的对象里，已存在的 `sourceYear: source.sourceYear,` 行**之后、`previousYear` 行之前**插入这两行（不要动已有的 `previousYear`）：

```ts
      admissionBaselineYear: source.admissionBaselineYear,
      scoreSegmentYear: source.scoreSegmentYear,
```

`getCandidates` 返回（:2413-2415 区域）在 `sourceYear: source.sourceYear,` 之后同样插入这两行。

- [ ] **Step 7: 跑测试确认通过 + 全套不回归**

Run: `pnpm --filter server test -- plan-candidate.service.spec`
Expected: 新测试 PASS；其余既有测试全绿（此步纯 additive，消费方仍用 sourceYear，行为未变）。

- [ ] **Step 8: Commit**

```bash
git add apps/server/src/modules/plan-candidate/plan-candidate.service.ts apps/server/src/modules/plan-candidate/plan-candidate.service.spec.ts
git commit -m "feat(plan): resolve & expose admissionBaselineYear/scoreSegmentYear (sourceYear decouple step 1)"
```

---

## Task 2: 录取线/历史/梯度/无史线锚路由到 admissionBaselineYear（keystone 修复）

**Files:**
- Modify: `plan-candidate.service.ts` :1655、:1833-1838、:1878-1879、:1895、:2162
- Test: `plan-candidate.service.spec.ts`

- [ ] **Step 1: 写失败测试（keystone 回归）**

```ts
it('keystone: 2026 计划入库、录取止于 2025 时，组仍拿到 2025 线与梯度（非 NO_LINE）', async () => {
  mockCandidateGroupRequest({
    plans: [makeGroupEnrollmentPlan()],
    records: [makeGroupAdmissionRecord({ year: 2025, groupMinRank: 120000, groupMinScore: 530 })],
  });
  prisma.enrollmentPlan.groupBy.mockResolvedValue([{ year: 2026, _count: { _all: 1 } }]);
  prisma.admissionRecord.groupBy.mockResolvedValue([{ year: 2025 }]);

  const r: any = await service.getCandidateGroups(1, { page: 1, pageSize: 10, includeSoftFails: true, sort: 'MAJOR_MATCH' });
  const g = r.groups[0];

  // 解耦前：sourceYear=2026 严格取 2026 录取 → 空 → baseMinRank=null → NO_LINE
  // 解耦后：录取线读 2025 → 有 baseMinRank
  expect(g).toBeDefined();
  expect(g.dynamicGradient.baseMinRank).not.toBeNull();
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter server test -- plan-candidate.service.spec --t "keystone"`
Expected: FAIL —— `g.dynamicGradient.baseMinRank` 为 `null`（当前严格取 2026 录取得空）。

- [ ] **Step 3: 路由录取取数窗口（:1655）**

```ts
    // 3 年历史：admissionBaselineYear / -1 / -2（录取线基准年，可早于计划年）
    const years = [source.admissionBaselineYear, source.admissionBaselineYear - 1, source.admissionBaselineYear - 2];
```

- [ ] **Step 4: 路由组记录聚合与打分（:1833-1838）**

```ts
      const groupRecords = [
        ...(adByGroupYear.get(`${groupKey}|${source.admissionBaselineYear}`) ?? []),
        ...(adByGroupYear.get(`${groupKey}|${source.admissionBaselineYear - 1}`) ?? []),
        ...(adByGroupYear.get(`${groupKey}|${source.admissionBaselineYear - 2}`) ?? []),
      ];
      const groupScore = this.pickGroupScore(groupRecords, source.admissionBaselineYear);
      const groupHistory = this.pickGroupHistory(groupRecords, source.admissionBaselineYear);
```

- [ ] **Step 5: 路由 current/previousRecord 与 sourceAdmissionYear（:1878-1879, :1895）**

```ts
        const currentRecord = adIndex.get(recordKeyOf({ ...ep, year: source.admissionBaselineYear }));
        const previousRecord = adIndex.get(recordKeyOf({ ...ep, year: source.admissionBaselineYear - 1 }));
```

```ts
          sourceAdmissionYear: source.admissionBaselineYear,
```

（注意：同段 `studentExamYear: plan.year`（:1891）保持不变 —— 那是学生应试年，本就该是计划年。）

- [ ] **Step 6: 路由无史线锚 bandWhere（:2162）**

```ts
      const bandWhere: Record<string, unknown> = {
        province,
        year: source.admissionBaselineYear,
        groupMinScore: { not: null },
      };
```

- [ ] **Step 7: 跑测试确认通过 + 全套不回归**

Run: `pnpm --filter server test -- plan-candidate.service.spec`
Expected: keystone PASS；既有测试全绿（既有测试 sourceYear=2025 时 admissionBaselineYear 默认也是 2025，窗口与原 `[2025,2024,2023]` 一致，无变化）。

- [ ] **Step 8: Commit**

```bash
git add apps/server/src/modules/plan-candidate/plan-candidate.service.ts apps/server/src/modules/plan-candidate/plan-candidate.service.spec.ts
git commit -m "fix(plan): route admission lines/history/gradient to admissionBaselineYear (keystone)"
```

---

## Task 3: 竞争与征集历史路由到 admissionBaselineYear

**Files:**
- Modify: `plan-candidate.service.ts` :1808-1809
- Test: `plan-candidate.service.spec.ts`

- [ ] **Step 1: 写失败测试（断言传入基线年）**

```ts
it('2026 场景下竞争/征集历史按 admissionBaselineYear=2025 取数', async () => {
  mockCandidateGroupRequest({
    plans: [makeGroupEnrollmentPlan()],
    records: [makeGroupAdmissionRecord({ year: 2025 })],
  });
  prisma.enrollmentPlan.groupBy.mockResolvedValue([{ year: 2026, _count: { _all: 1 } }]);
  prisma.admissionRecord.groupBy.mockResolvedValue([{ year: 2025 }]);
  const supplSpy = jest.spyOn(service as any, 'loadSupplementaryByGroup');

  await service.getCandidateGroups(1, { page: 1, pageSize: 10, includeSoftFails: true, sort: 'MAJOR_MATCH' });

  // 第 4 个参数才是 subjects；第 3 个是年份
  expect(supplSpy).toHaveBeenCalledWith(expect.anything(), expect.anything(), 2025, expect.anything());
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter server test -- plan-candidate.service.spec --t "竞争/征集历史"`
Expected: FAIL —— 实际传入 2026。

- [ ] **Step 3: 实现（:1808-1809）**

```ts
      this.resolveBatchCompetition(province, subjects, plan.batchName, source.admissionBaselineYear),
      this.loadSupplementaryByGroup(groups, province, source.admissionBaselineYear, subjects),
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm --filter server test -- plan-candidate.service.spec`
Expected: PASS，全套绿。

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/modules/plan-candidate/plan-candidate.service.ts apps/server/src/modules/plan-candidate/plan-candidate.service.spec.ts
git commit -m "fix(plan): route batch competition & supplementary to admissionBaselineYear"
```

---

## Task 4: 分↔位次换算路由到 scoreSegmentYear

**Files:**
- Modify: `plan-candidate.service.ts` :1535、:1601、:1810、:2272
- Test: `plan-candidate.service.spec.ts`

- [ ] **Step 1: 写失败测试（scoreToRank 用 2025 不用 2026）**

```ts
it('2026 场景下 score↔rank 换算用 scoreSegmentYear=2025', async () => {
  mockCandidateGroupRequest({
    plans: [makeGroupEnrollmentPlan()],
    records: [makeGroupAdmissionRecord({ year: 2025 })],
  });
  prisma.enrollmentPlan.groupBy.mockResolvedValue([{ year: 2026, _count: { _all: 1 } }]);
  prisma.admissionRecord.groupBy.mockResolvedValue([{ year: 2025 }]);
  prisma.scoreSegment.groupBy.mockResolvedValue([{ year: 2025 }]);
  scoreSegment.scoreToRank.mockResolvedValue({ rank: 50000, score: 600 });

  await service.getCandidateGroups(1, { page: 1, pageSize: 10, includeSoftFails: true, sort: 'MAJOR_MATCH', minScore: 580, maxScore: 620 });

  // resolveRankWindow 触发 scoreToRank，首参必须是 2025（scoreSegmentYear），不是 2026
  expect(scoreSegment.scoreToRank).toHaveBeenCalled();
  for (const call of scoreSegment.scoreToRank.mock.calls) {
    expect(call[0]).toBe(2025);
  }
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter server test -- plan-candidate.service.spec --t "score↔rank 换算"`
Expected: FAIL —— 首参为 2026。

- [ ] **Step 3: 实现（:1535, :1601, :1810, :2272）**

```ts
    const rankWindow = await this.resolveRankWindow(q.minScore, q.maxScore, source.scoreSegmentYear, subjects);
```

```ts
        const studentRankInfo = await this.resolveStudentRank(student, source.scoreSegmentYear);
```

```ts
      this.resolveStudentRank(student, source.scoreSegmentYear),
```

```ts
      predictedScoreRange: await this.computePredictedScoreRange(resultGroups, source.scoreSegmentYear, subjects),
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm --filter server test -- plan-candidate.service.spec`
Expected: PASS，全套绿。

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/modules/plan-candidate/plan-candidate.service.ts apps/server/src/modules/plan-candidate/plan-candidate.service.spec.ts
git commit -m "fix(plan): route score<->rank conversion to scoreSegmentYear"
```

---

## Task 5: pickGroupScore 就近年回退

**Files:**
- Modify: `plan-candidate.service.ts:1221-1253`
- Test: `plan-candidate.service.spec.ts`

- [ ] **Step 1: 写失败测试**

```ts
it('pickGroupScore: 基线年无记录时回退到 ≤基线年的最近有线年份', async () => {
  // 组只有 2024 录取，基线年 2025 无记录 → 应回退取 2024 线
  const recordsByYear = [makeGroupAdmissionRecord({ year: 2024, groupMinRank: 99000, groupMinScore: 540 })];
  const res = (service as any).pickGroupScore(recordsByYear, 2025);
  expect(res.groupMinRank).toBe(99000);
  expect(res.scoreSource).toBe('GROUP');
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter server test -- plan-candidate.service.spec --t "就近有线年份"`
Expected: FAIL —— 当前严格 `record.year === 2025`，得 NONE。

- [ ] **Step 3: 实现就近年回退**

`pickGroupScore`（:1221-1222）把"只取 sourceYear"改为"取 ≤baselineYear 的最近一个有记录的年"：

```ts
  private pickGroupScore(records: any[], baselineYear: number) {
    // 就近年回退：基线年无记录时，落到 ≤基线年的最近有记录年（避免个别组无谓塌成 NO_LINE）
    const years = Array.from(
      new Set(records.map((r) => r.year).filter((y) => typeof y === 'number' && y <= baselineYear)),
    ).sort((a, b) => b - a);
    let current: any[] = [];
    for (const y of years) {
      current = records.filter((record) => record.year === y);
      const hasLine =
        bestNumber(current.map((r) => r.groupMinScore)) !== null ||
        bestNumber(current.map((r) => r.groupMinRank), 'max') !== null ||
        bestNumber(current.map((r) => r.filingMinScore)) !== null ||
        bestNumber(current.map((r) => r.filingMinRank), 'max') !== null ||
        bestNumber(current.map((r) => r.majorMinScore)) !== null ||
        bestNumber(current.map((r) => r.majorMinRank), 'max') !== null;
      if (hasLine) break;
    }
    const groupScore = bestNumber(current.map((record) => record.groupMinScore));
    const groupRank = bestNumber(current.map((record) => record.groupMinRank), 'max');
    if (groupScore !== null || groupRank !== null) {
      return {
        groupMinScore: groupScore,
        groupMinRank: groupRank,
        groupAdmissionCount: bestNumber(current.map((record) => record.groupAdmissionCount), 'max'),
        scoreSource: 'GROUP' as CandidateGroupScoreSource,
      };
    }
    const filingScore = bestNumber(current.map((record) => record.filingMinScore));
    const filingRank = bestNumber(current.map((record) => record.filingMinRank), 'max');
    if (filingScore !== null || filingRank !== null) {
      return {
        groupMinScore: filingScore,
        groupMinRank: filingRank,
        groupAdmissionCount: null,
        scoreSource: 'FILING' as CandidateGroupScoreSource,
      };
    }
    const majorScore = bestNumber(current.map((record) => record.majorMinScore));
    const majorRank = bestNumber(current.map((record) => record.majorMinRank), 'max');
    return {
      groupMinScore: majorScore,
      groupMinRank: majorRank,
      groupAdmissionCount: null,
      scoreSource: majorScore !== null || majorRank !== null ? 'MAJOR' as CandidateGroupScoreSource : 'NONE' as CandidateGroupScoreSource,
    };
  }
```

- [ ] **Step 4: 跑测试确认通过 + 全套不回归**

Run: `pnpm --filter server test -- plan-candidate.service.spec`
Expected: PASS。注意复核：基线年有记录的组行为不变（years 降序，基线年是第一个，有线即 break）。

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/modules/plan-candidate/plan-candidate.service.ts apps/server/src/modules/plan-candidate/plan-candidate.service.spec.ts
git commit -m "feat(plan): pickGroupScore falls back to nearest year with a line"
```

---

## Task 6: 次要路径 getCandidates 对齐

**Files:**
- Modify: `plan-candidate.service.ts` :2329（录取窗口）、:2338-2351（getHist 年份）、:2353（resolveStudentRank）
- Test: `plan-candidate.service.spec.ts`

- [ ] **Step 1: 写失败测试**

```ts
it('getCandidates(次要路径) 2026 场景: 录取按 admissionBaselineYear=2025 取数、换算用 scoreSegmentYear=2025', async () => {
  prisma.volunteerPlan.findUnique.mockResolvedValue({ id: 1, studentId: 10, batchName: 'Batch A', batchConfigId: 5, year: 2026 });
  prisma.studentProfile.findUnique.mockResolvedValue({
    id: 10, province: 'Sichuan', examType: 'PHYSICS', provincialRank: 30000,
    colorBlind: false, colorWeak: false, visionLeft: 5, visionRight: 5,
    isRural: false, tuitionBudget: 'UNLIMITED', acceptSinoForeign: true,
    acceptPrivate: 'RELAXED', user: { gender: '男', ethnicity: '汉族' },
  });
  prisma.enrollmentPlan.groupBy.mockResolvedValue([{ year: 2026, _count: { _all: 1 } }]);
  prisma.admissionRecord.groupBy.mockResolvedValue([{ year: 2025 }]);
  prisma.scoreSegment.groupBy.mockResolvedValue([{ year: 2025 }]);
  prisma.enrollmentPlan.findMany.mockResolvedValue([
    { id: 300, universityId: 3, majorId: 3, university: { name: 'C' }, major: { name: 'M3', code: '0806', notes: '' },
      recruitType: '普通类', isSinoForeign: false, planNotes: '', tuition: 5000,
      majorCode: '0806', subjects: '物理', batch: 'Batch A', groupCode: 'G3', majorName: 'M3' },
  ]);
  prisma.admissionRecord.findMany.mockResolvedValue([]);
  scoreSegment.scoreToRank.mockResolvedValue({ rank: 50000, score: 600 });

  const r: any = await service.getCandidates(1, { page: 1, pageSize: 10, includeSoftFails: true });

  expect(r.admissionBaselineYear).toBe(2025);
  expect(r.scoreSegmentYear).toBe(2025);
  for (const call of scoreSegment.scoreToRank.mock.calls) {
    expect(call[0]).toBe(2025);
  }
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter server test -- plan-candidate.service.spec --t "次要路径"`
Expected: FAIL —— `admissionBaselineYear` 未暴露 / scoreToRank 用 2026 / getHist 硬编码 2025-2024 与基线脱钩。

- [ ] **Step 3: 录取窗口传基线年（:2329）**

`buildAdmissionRecordWhere` 第三参传基线 3 年窗口：

```ts
          where: this.buildAdmissionRecordWhere(eps, province, [
            source.admissionBaselineYear,
            source.admissionBaselineYear - 1,
          ]),
```

- [ ] **Step 4: getHist 用基线年（:2338-2351）**

把硬编码的 `|2025` / `|2024` 改为基线年与其上一年：

```ts
    const yCur = source.admissionBaselineYear;
    const yPrev = source.admissionBaselineYear - 1;
    const getHist = (ep: any) => {
      const kCur = `${ep.universityId}|${ep.subjects}|${ep.batch}|${ep.recruitType}|${ep.groupCode}|${ep.majorCode}|${ep.majorName}|${yCur}`;
      const kPrev = `${ep.universityId}|${ep.subjects}|${ep.batch}|${ep.recruitType}|${ep.groupCode}|${ep.majorCode}|${ep.majorName}|${yPrev}`;
      const rCur = adIndex.get(kCur);
      const rPrev = adIndex.get(kPrev);
      return {
        score25Group: rCur?.groupMinScore ?? null,
        rank25Group: rCur?.groupMinRank ?? null,
        score25Major: rCur?.majorMinScore ?? null,
        rank25Major: rCur?.majorMinRank ?? null,
        score24Major: rPrev?.majorMinScore ?? null,
        rank24Major: rPrev?.majorMinRank ?? null,
      };
    };
```

（保留 `score25*/score24*` 字段名不动 —— 那是前端契约的历史命名，语义已由基线年驱动，改名属另一子项目。）

- [ ] **Step 5: resolveStudentRank 用 scoreSegmentYear（:2353）**

```ts
    const studentRankInfo = await this.resolveStudentRank(student, source.scoreSegmentYear);
```

- [ ] **Step 6: 跑测试确认通过 + 全套不回归**

Run: `pnpm --filter server test -- plan-candidate.service.spec`
Expected: PASS，全套绿（含既有 `getCandidates` 系列测试，因 2025 场景下基线年=2025 行为不变）。

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/modules/plan-candidate/plan-candidate.service.ts apps/server/src/modules/plan-candidate/plan-candidate.service.spec.ts
git commit -m "fix(plan): align secondary getCandidates path to baseline years"
```

---

## 完成后验证

- [ ] 全套服务端测试：`pnpm --filter server test -- plan-candidate.service.spec`，全绿。
- [ ] 类型检查/构建：`pnpm --filter server build`，无 TS 错误。
- [ ] 不变量复核：在纯 2025 数据（plan groupBy=2025）下，三年份均 = 2025，所有取数与解耦前完全一致（既有测试即此不变量的守门）。
- [ ] 交付物为 sub-project A；上线顺序：A 部署后方可导入 2026 enrollment_plans（见 spec 顺序约束）。子项目 E（前端读 `admissionBaselineYear` 标注"基于 2025 历史线预测"）单独排期。
