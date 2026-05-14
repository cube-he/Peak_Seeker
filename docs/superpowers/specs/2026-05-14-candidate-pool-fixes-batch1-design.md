# 候选池修复 - 第一批（业务正确性）设计规约

- **日期**：2026-05-14
- **作者**：Claude（brainstorming with user）
- **范围**：候选池审查报告中的"严重问题"三项业务正确性修复
- **不在范围内**：spec 文档同步、缓存方案、CASL 接入、批次/学科名规范化、阈值配置化、N+1 性能优化、前端 UX 改造、dist 与 .tmp 残留清理（这些属于第二、三、四批）

---

## 0. 修复目标与不变量

**目标**：消除三个会让老师拿到错误候选池或错误梯度建议的业务正确性 bug，影响范围仅限 `apps/server/src/modules/plan-candidate/` 和前端 plan-api 中已死的调用。

**不变量**：
1. 已上线的 `GET /plans/:planId/candidate-groups` 端点响应结构向后兼容（仅新增字段，不删除/改名既有字段）
2. 数据库 schema 不变（仅修改服务层逻辑）
3. 不引入新依赖
4. 不改前端调用方式（前端展示 hasRecommended/historySource 属下一批）

---

## 1. 修复 1 — 删除 getCandidates 旧端点

### 1.1 背景
- 前端只调 `GET /plans/:planId/candidate-groups`
- `GET /plans/:planId/candidates` 端点仍暴露，对应 `PlanCandidateService.getCandidates`（service.ts:1368–1510）
- 两份代码并存导致硬过滤、软规则、梯度计算逻辑分叉（已观察到 `buildAdmissionRecordWhere` 参数传递不一致）

### 1.2 改动点

**后端**：
- `apps/server/src/modules/plan-candidate/plan-candidate.controller.ts:12-19` — 删除 `@Get(':planId/candidates')` 路由
- `apps/server/src/modules/plan-candidate/plan-candidate.service.ts:1368-1510` — 删除 `getCandidates` 方法
- 删除仅 `getCandidates` 引用的 import：
  - `calcGradient`（candidate-groups 用 `calcDynamicGradient`）
  - 实施前用 grep 二次确认 service 内其他位置没有引用

**前端**：
- `apps/web/src/services/plan-api.ts:84-94` — 删除 `getCandidates` 函数及相关类型 `CandidateListParams`（若仅本函数使用）
- grep 确认无其他文件 import `getCandidates`

**测试**：
- `apps/server/src/modules/plan-candidate/plan-candidate.service.spec.ts` — 删除/迁移仅针对 `getCandidates` 的测试用例；保留 candidate-groups 相关测试

### 1.3 保留
- `dto/get-candidates-query.dto.ts` — candidate-groups 也用它
- 模块 / module.ts / 其他文件 — 不动

### 1.4 验证
- `curl /plans/:id/candidates` 返回 404
- `pnpm --filter @server test` 全绿
- `pnpm --filter @server build` 通过

---

## 2. 修复 2 — 整组全 RISK 不再消失

### 2.1 背景
`plan-candidate.service.ts:1267`：
```ts
if (majorSections.recommended.length === 0) return null;
```
导致一个院校专业组里所有专业被软规则拒（或位次不够进 RISK 段）时，整组从结果消失。老师无法看到"系统判不推荐但人工想破例"的院校。

### 2.2 改动点

**返回结构**（仅新增字段，向后兼容）：

| 字段 | 类型 | 说明 |
|---|---|---|
| `hasRecommended` | `boolean` | `majorSections.recommended.length > 0`；前端可据此默认折叠 |

**逻辑**：
- 删除 `if (majorSections.recommended.length === 0) return null;`
- group 对象上加 `hasRecommended: majorSections.recommended.length > 0`
- `recommendedAnchor` 在 recommended 段为空时回退取 `orderedMajors[0]`（即 backup 或 risk 段首位），保持 `matchScore` / `anchorMajorMinRank` 等下游字段不为 undefined
- `sortCandidateGroups` 引入最高优先级排序键 `hasRecommended`：
  - `hasRecommended === false` 永远排在 `true` 之后
  - 其余排序规则不变（softFailCount → tier → matchScore → rankFit → planCount）

### 2.3 不动
- 前端折叠 UI（属下一批 UX）
- `includeSoftFails` query 参数语义（false 时仍过滤掉 SOFT_FAIL 专业，只是组本身不再因此消失）

### 2.4 测试场景
| Case | 期望 |
|---|---|
| 组内 ≥1 个 RECOMMENDED 专业 | 出现在结果中，`hasRecommended=true` |
| 组内全部 SOFT_FAIL，无 RECOMMENDED | 出现在结果中，`hasRecommended=false`，且排序晚于所有 `hasRecommended=true` 的组 |
| 组内 BACKUP 但无 RECOMMENDED | 同上，`hasRecommended=false` |
| 多个 `hasRecommended=false` 组之间 | 仍按 softFailCount → tier 等次级排序 |

---

## 3. 修复 3 — 专业级 historyMin 三层 fallback

### 3.1 背景
`service.ts:1197`：
```ts
const historyMin = groupScore.groupMinRank ?? currentRecord?.majorMinRank ?? null;
```

四川 2025 改革后是"院校专业组"平行志愿：投档看专业组投档线，进档后能否报上某个具体专业看专业自己的位次。当前实现的优先级反了——把组级最低（最容易进的那个专业拉的）当成所有专业的参考，会严重低估冷门专业难度。

### 3.2 修正规则

专业级 `historyMin` 的 fallback 链：

| 层级 | 数据源 | 含义 |
|---|---|---|
| L1 | `currentRecord.majorMinRank` | 这个具体专业的当年最低录取位次（最准） |
| L2 | `currentGroupRecords` 中 `groupMinRank` 的最小值 | 这个专业组的最低录取位次（次准） |
| L3 | `currentGroupRecords` 中 `filingMinRank` 的最小值 | 这个专业组的投档线位次（兜底） |
| 全空 | `null` | 标 `historySource='NONE'`，下游进 RISK 段 |

`currentGroupRecords` 已在 `adByGroupYear.get(`${groupKey}|${source.sourceYear}`)` 中现成，**不增加额外 query**。

### 3.3 改动点

**service.ts:1197 附近的专业行循环**：
```ts
// before
const historyMin = groupScore.groupMinRank ?? currentRecord?.majorMinRank ?? null;

// after
const currentGroupRecords = adByGroupYear.get(`${groupKey}|${source.sourceYear}`) ?? [];
const fallbackGroupMin = bestNumber(currentGroupRecords.map(r => r.groupMinRank), 'max');
const fallbackFilingMin = bestNumber(currentGroupRecords.map(r => r.filingMinRank), 'max');
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
```

> `bestNumber(..., 'max')` 在该 service 中的语义已是"取数值中代表最低位次的那个"（位次数字越大越靠后），与 `pickGroupScore` 中 groupMinRank 的取值方式一致。

**返回字段新增**：
- 在专业行结果对象上新增 `historySource: 'MAJOR' | 'GROUP' | 'FILING' | 'NONE'`，便于前端提示"本位次参考来自 XX"

### 3.4 不动
- 组级 `recommendedAnchor` 的 `dynamicGradient`（用 `groupScore.groupMinRank`，业务语义是"能否进档"判断 — 业务上是对的，本批不动）
- `calcDynamicGradient` 内部对 `historyMin === null` 的处理（已存在 BAO + INSUFFICIENT_DATA 分支）
- `classifyMajorDisplay` 对 `rankStrategy.eligibility === 'INSUFFICIENT_DATA'` 的处理（已会归 RISK 段）

### 3.5 测试场景

> 位次数字越大代表排名越靠后；正常数据关系是 `majorMinRank ≤ groupMinRank ≤ filingMinRank`（具体专业录取分 ≥ 组内最低录取分 ≥ 投档线）。

| Case | majorMinRank | groupMinRank | filingMinRank | 期望 historyMin / historySource |
|---|---|---|---|---|
| 三层都有 | 5000 | 8000 | 9000 | 5000 / MAJOR |
| 缺 major，有 group | null | 8000 | 9000 | 8000 / GROUP |
| 只有 filing | null | null | 9000 | 9000 / FILING |
| 全无 | null | null | null | null / NONE，进 RISK 段 |

---

## 4. 测试策略

### 4.1 TDD 顺序
每个修复独立完成一轮 RED → GREEN → REFACTOR：

1. **修复 1** — 先删测试再删代码再补 404 集成测试（删除型修复无 RED）
2. **修复 2** — 先写"全 SOFT_FAIL 组仍返回 + hasRecommended=false 排末"的失败测试 → 改实现 → 重构
3. **修复 3** — 先写四个 fallback case 的失败测试 → 改实现 → 重构

### 4.2 测试位置
- 既有 `apps/server/src/modules/plan-candidate/plan-candidate.service.spec.ts` 内新增
- 不新增独立文件，避免 fixtures 复制

### 4.3 验收命令
```bash
pnpm --filter @server test plan-candidate   # 全绿
pnpm --filter @server build                  # 通过
```

---

## 5. 风险与回滚

### 5.1 风险
- **R1**：candidate-groups 返回新增字段 `hasRecommended` / `historySource`，若前端类型严格校验可能告警（实际查看 plan-api.ts 用 `Promise<any>`，无类型约束 — 风险低）
- **R2**：删除 `getCandidates` 后若有未发现的外部调用方（生产/E2E 脚本）会 404（已确认前端仅一处，外部脚本未发现 — 风险低）
- **R3**：修复 2 让全 SOFT_FAIL 组出现在末尾，原本依赖"丢掉"行为的前端逻辑会看到额外数据（前端目前未做特殊处理 — 风险低）

### 5.2 回滚
单 commit / 单 PR，git revert 即可。删除型修复保留在 commit 历史，需要时可挑出还原。

---

## 6. 验收标准

1. `curl -i http://localhost:3001/api/v1/plans/1/candidates` 返回 404
2. `pnpm --filter @server test plan-candidate` 全部通过，包含新增 8 个测试 case（修复 2 共 4 个 + 修复 3 共 4 个）
3. `pnpm --filter @server build` 通过
4. 既有 candidate-groups 集成测试不退化
5. 前端 `pnpm --filter @web build` 通过（确认 plan-api.ts 删除后无残留引用）
6. 手工调一次 `/plans/:id/candidate-groups`：返回结构含 `hasRecommended`，每行专业含 `historySource`
