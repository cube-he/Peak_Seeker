# 生成页「招生类型」筛选器 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 生成页加「招生类型」多选筛选器，专业优先 / 院校优先两视图通用，选项跟随当前批次动态生成，默认全选零回归。

**Architecture:** recruitType 过滤放在**分页层（post-cache），与 `sinoForeign` 同层**——不进 DB where、不进缓存键。缓存的 `fullResult.groups` 是整批次全量池（每个 group 已带 `recruitType`，见 `plan-candidate.service.ts:2052`），新增纯函数对其收窄；`availableRecruitTypes` 从全量池 distinct，与选择解耦。

**Tech Stack:** NestJS + Prisma（后端 service/纯函数 + jest）、Next.js + React + antd（前端 page.tsx + axios api client）、pnpm workspace。

---

## 文件结构

- **新建** `apps/server/src/modules/plan-candidate/recruit-type-filter.ts` — 纯函数：`filterGroupsByRecruitType` / `filterUniversitiesByRecruitType` / `collectRecruitTypes`。对标已有 `sino-foreign-filter.ts`。
- **新建** `apps/server/src/modules/plan-candidate/recruit-type-filter.spec.ts` — 纯函数单测。
- **改** `apps/server/src/modules/plan-candidate/dto/get-candidates-query.dto.ts` — 加 `recruitType?: string`。
- **改** `apps/server/src/modules/plan-candidate/plan-candidate.service.ts` — interface 加字段；`paginateCandidateGroups` 加参数 + 收窄 + 挂 `availableRecruitTypes`；`paginateAsUniversities` 读 `q.recruitType` 收窄 + 挂 `availableRecruitTypes`；3 处调用传参。
- **改** `apps/server/src/modules/plan-candidate/plan-candidate.service.spec.ts` — service 级集成测试。
- **改** `apps/web/src/services/plan-api.ts` — `CandidateGroupListParams` 加 `recruitType?: string[]` + 序列化。
- **改** `apps/web/src/app/(teacher)/teacher/plans/generate/[studentId]/page.tsx` — 类型、state、query 接线、筛选 chip UI。

---

### Task 1: 后端纯函数 recruit-type-filter（TDD）

**Files:**
- Create: `apps/server/src/modules/plan-candidate/recruit-type-filter.ts`
- Test: `apps/server/src/modules/plan-candidate/recruit-type-filter.spec.ts`

- [ ] **Step 1: 写失败测试**

`apps/server/src/modules/plan-candidate/recruit-type-filter.spec.ts`:
```ts
import {
  parseRecruitTypeCsv,
  filterGroupsByRecruitType,
  filterUniversitiesByRecruitType,
  collectRecruitTypes,
} from './recruit-type-filter';

const g = (recruitType: string) => ({ recruitType });

describe('recruit-type-filter', () => {
  it('parseRecruitTypeCsv: 拆分去空白去空项', () => {
    expect(parseRecruitTypeCsv('普通类本科, 国家专项计划 ,')).toEqual(['普通类本科', '国家专项计划']);
    expect(parseRecruitTypeCsv('')).toEqual([]);
    expect(parseRecruitTypeCsv(undefined)).toEqual([]);
  });

  it('filterGroupsByRecruitType: 单值只留该类', () => {
    const groups = [g('普通类本科'), g('民族班'), g('普通类本科')];
    expect(filterGroupsByRecruitType(groups, '普通类本科')).toEqual([g('普通类本科'), g('普通类本科')]);
  });

  it('filterGroupsByRecruitType: 多值留多类', () => {
    const groups = [g('国家专项计划'), g('地方专项计划'), g('普通类本科')];
    expect(filterGroupsByRecruitType(groups, '国家专项计划,地方专项计划'))
      .toEqual([g('国家专项计划'), g('地方专项计划')]);
  });

  it('filterGroupsByRecruitType: 空 csv 原样返回同引用(不过滤)', () => {
    const groups = [g('普通类本科')];
    expect(filterGroupsByRecruitType(groups, '')).toBe(groups);
    expect(filterGroupsByRecruitType(groups, undefined)).toBe(groups);
  });

  it('filterUniversitiesByRecruitType: 剔除筛后无组的院校', () => {
    const unis = [
      { id: 1, groups: [g('普通类本科'), g('民族班')] },
      { id: 2, groups: [g('民族班')] },
    ];
    const out = filterUniversitiesByRecruitType(unis, '普通类本科');
    expect(out.map((u) => u.id)).toEqual([1]);
    expect(out[0].groups).toEqual([g('普通类本科')]);
  });

  it('filterUniversitiesByRecruitType: 空 csv 原样返回同引用', () => {
    const unis = [{ id: 1, groups: [g('普通类本科')] }];
    expect(filterUniversitiesByRecruitType(unis, '')).toBe(unis);
  });

  it('collectRecruitTypes: distinct + 按组数降序(普通类置顶), 同数 localeCompare', () => {
    const groups = [g('民族班'), g('普通类本科'), g('普通类本科'), g('国家专项计划'), g('普通类本科')];
    // 普通类本科×3, 民族班×1, 国家专项计划×1 → 普通类置顶, 后两同数按名排
    expect(collectRecruitTypes(groups)).toEqual(['普通类本科', '国家专项计划', '民族班']);
  });

  it('collectRecruitTypes: 忽略空 recruitType', () => {
    const groups = [{ recruitType: '' }, { recruitType: null as any }, g('普通类本科')];
    expect(collectRecruitTypes(groups)).toEqual(['普通类本科']);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter server exec jest src/modules/plan-candidate/recruit-type-filter.spec.ts`
Expected: FAIL — Cannot find module './recruit-type-filter'

- [ ] **Step 3: 写最小实现**

`apps/server/src/modules/plan-candidate/recruit-type-filter.ts`:
```ts
// 招生类型筛选 (服务端, 分页层). 同批次混多招生类型时让老师按类聚焦; 空选择 = 全部。
// 对标 sino-foreign-filter.ts: 纯函数, 不碰 DB / 缓存键。

/** CSV → 去空白去空项的数组. */
export function parseRecruitTypeCsv(csv?: string | null): string[] {
  return (csv ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** 按招生类型筛选院校专业组; 空 csv → 原样返回同引用(不过滤). */
export function filterGroupsByRecruitType<T extends { recruitType?: string | null }>(
  groups: T[],
  csv?: string | null,
): T[] {
  const selected = parseRecruitTypeCsv(csv);
  if (selected.length === 0) return groups;
  const allow = new Set(selected);
  return groups.filter((grp) => allow.has(String(grp.recruitType ?? '')));
}

/** 上卷视图: 组级先筛, 筛后无组的院校剔除; 空 csv → 原样返回同引用. */
export function filterUniversitiesByRecruitType<
  G extends { recruitType?: string | null },
  T extends { groups?: G[] },
>(universities: T[], csv?: string | null): T[] {
  const selected = parseRecruitTypeCsv(csv);
  if (selected.length === 0) return universities;
  const allow = new Set(selected);
  const out: T[] = [];
  for (const u of universities) {
    const kept = (u.groups ?? []).filter((grp) => allow.has(String(grp.recruitType ?? '')));
    if (kept.length > 0) out.push({ ...u, groups: kept });
  }
  return out;
}

/** 全量池里有哪些招生类型: distinct + 按组数降序(普通类自然置顶), 同数 localeCompare. */
export function collectRecruitTypes(groups: Array<{ recruitType?: string | null }>): string[] {
  const counts = new Map<string, number>();
  for (const g of groups) {
    const rt = String(g.recruitType ?? '').trim();
    if (!rt) continue;
    counts.set(rt, (counts.get(rt) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([rt]) => rt);
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --filter server exec jest src/modules/plan-candidate/recruit-type-filter.spec.ts`
Expected: PASS（8 个用例全绿）

- [ ] **Step 5: 提交**

```bash
git add apps/server/src/modules/plan-candidate/recruit-type-filter.ts apps/server/src/modules/plan-candidate/recruit-type-filter.spec.ts
git commit -m "feat(plan-candidate): 招生类型筛选纯函数 recruit-type-filter"
```

---

### Task 2: 接入 service + DTO（TDD）

**Files:**
- Modify: `apps/server/src/modules/plan-candidate/dto/get-candidates-query.dto.ts:59`（purity 之后加一行）
- Modify: `apps/server/src/modules/plan-candidate/plan-candidate.service.ts`（interface:56、paginateCandidateGroups:596、paginateAsUniversities:676、3 处调用:1534/1618/2270）
- Test: `apps/server/src/modules/plan-candidate/plan-candidate.service.spec.ts`

- [ ] **Step 1: 写失败测试（service 级，混类池 → 只留选中类 + availableRecruitTypes）**

在 `plan-candidate.service.spec.ts` 末尾（最后一个 `});` 之前）加一个 describe。注意复用文件里已有的 mock 工厂；若没有通用工厂，照下方自带的最小 mock 写：
```ts
describe('getCandidateGroups recruitType 过滤', () => {
  // 复用本文件既有 buildService / mockPrisma 模式; 此处给出关键断言意图。
  // 池里造 3 个不同 recruitType 的组(普通类本科 / 民族班 / 国家专项计划)。

  it('传 recruitType=普通类本科 → groups 只含该类, total=该类组数', async () => {
    const { service } = buildServiceWithGroups([
      mkPlanRow({ universityId: 1, recruitType: '普通类本科' }),
      mkPlanRow({ universityId: 2, recruitType: '民族班' }),
      mkPlanRow({ universityId: 3, recruitType: '国家专项计划' }),
    ]);
    const res: any = await service.getCandidateGroups(1, { page: 1, pageSize: 20, recruitType: '普通类本科' } as any);
    expect(res.groups.every((g: any) => g.recruitType === '普通类本科')).toBe(true);
    expect(res.total).toBe(res.groups.length);
  });

  it('不传 recruitType → 全部类都在(回归)', async () => {
    const { service } = buildServiceWithGroups([
      mkPlanRow({ universityId: 1, recruitType: '普通类本科' }),
      mkPlanRow({ universityId: 2, recruitType: '民族班' }),
    ]);
    const res: any = await service.getCandidateGroups(1, { page: 1, pageSize: 20 } as any);
    const types = new Set(res.groups.map((g: any) => g.recruitType));
    expect(types.has('普通类本科')).toBe(true);
    expect(types.has('民族班')).toBe(true);
  });

  it('响应带 availableRecruitTypes, 为全量池招生类型(不随选择塌缩)', async () => {
    const { service } = buildServiceWithGroups([
      mkPlanRow({ universityId: 1, recruitType: '普通类本科' }),
      mkPlanRow({ universityId: 2, recruitType: '民族班' }),
    ]);
    const res: any = await service.getCandidateGroups(1, { page: 1, pageSize: 20, recruitType: '普通类本科' } as any);
    expect(res.availableRecruitTypes).toEqual(expect.arrayContaining(['普通类本科', '民族班']));
  });

  it('groupBy=UNIVERSITY: 上卷只含选中类', async () => {
    const { service } = buildServiceWithGroups([
      mkPlanRow({ universityId: 1, recruitType: '普通类本科' }),
      mkPlanRow({ universityId: 2, recruitType: '民族班' }),
    ]);
    const res: any = await service.getCandidateGroups(1, { page: 1, pageSize: 20, groupBy: 'UNIVERSITY', recruitType: '普通类本科' } as any);
    const types = new Set((res.universities ?? []).flatMap((u: any) => (u.groups ?? []).map((g: any) => g.recruitType)));
    expect(Array.from(types)).toEqual(['普通类本科']);
    expect(res.availableRecruitTypes).toEqual(expect.arrayContaining(['普通类本科', '民族班']));
  });
});
```
> 实现者注意：`buildServiceWithGroups` / `mkPlanRow` 用文件里**已有**的等价 helper（看 `plan-candidate.service.spec.ts` 顶部既有的 mock 工厂 — 已有 `recruitType: 'General'/'普通类'` 等行 mock，照搬其 prisma mock 结构，让 `enrollmentPlan.findMany` 返回带不同 `recruitType` 的行、`admissionRecord.findMany` 返回 `[]`）。不要新建独立 mock 框架。

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter server exec jest src/modules/plan-candidate/plan-candidate.service.spec.ts -t "recruitType 过滤"`
Expected: FAIL — `availableRecruitTypes` undefined / groups 仍含未选类

- [ ] **Step 3a: DTO 加字段**

`dto/get-candidates-query.dto.ts`，在 `purity` 那行（`@IsOptional() @IsString() purity?: string;`）下方加：
```ts
  // 招生类型过滤: CSV 多选(如 '普通类本科,国家专项计划'); 空/缺省 = 不过滤. 两视图均生效, 分页层应用
  @IsOptional() @IsString() recruitType?: string;
```

- [ ] **Step 3b: service interface 加字段**

`plan-candidate.service.ts` 的 `interface GetCandidatesQuery`，在 `purity?: string;` 下方加：
```ts
  recruitType?: string; // 招生类型 CSV 多选; 空 = 不过滤; 分页层应用(同 sinoForeign)
```

- [ ] **Step 3c: import 纯函数**

`plan-candidate.service.ts` 顶部 import 区，`sino-foreign-filter` 那行之后加：
```ts
import { filterGroupsByRecruitType, filterUniversitiesByRecruitType, collectRecruitTypes } from './recruit-type-filter';
```

- [ ] **Step 3d: paginateCandidateGroups 加参数 + 收窄 + 挂字段**

把签名（约 596 行）改为追加 `recruitType?: string`：
```ts
  private paginateCandidateGroups(
    value: CandidateGroupFullResult,
    page: number,
    pageSize: number,
    gradientBand?: string,
    sinoForeign?: 'only' | 'exclude',
    rankWindow?: RankWindow | null,
    includeRegionMismatch = false,
    recruitType?: string,
  ) {
```
方法体开头（`const validBand = ...` 之前）插入「先按招生类型把全量池收窄成工作集」，并把后续所有 `value.groups` 引用改为 `baseGroups`：
```ts
    // 招生类型过滤(分页层): 先收窄成工作集, 让 band/sino/rank/region/tierCounts 全部基于它,
    // 否则冲/稳/保 chip 计数会大于列表 total(沿用 region 折叠那处已有教训)。空 = 全部。
    const baseGroups = filterGroupsByRecruitType(value.groups, recruitType);
```
具体替换（方法体内）：
- `const banded = validBand ? value.groups.filter(...) : value.groups;` → 用 `baseGroups`
- `value.tierCounts`（includeRegionMismatch 分支）→ `countTiers(baseGroups)`
- `countTiers(value.groups.filter((g: any) => !g?.regionMismatch))` → `countTiers(baseGroups.filter((g: any) => !g?.regionMismatch))`

return 对象里加一行（与 `tierCounts` 同级）：
```ts
      availableRecruitTypes: collectRecruitTypes(value.groups),
```

- [ ] **Step 3e: paginateAsUniversities 收窄 + 挂字段**

`paginateAsUniversities`（约 676 行）已收 `q`，方法体开头：
```ts
    const ctx = this.buildRollupContext(student);
    let universities = rollupByUniversity(value.groups, ctx);
```
改为先收窄 base 再上卷：
```ts
    const ctx = this.buildRollupContext(student);
    const baseGroups = filterGroupsByRecruitType(value.groups, q.recruitType);
    let universities = rollupByUniversity(baseGroups, ctx);
```
return 对象里加一行（与 `total` 同级）：
```ts
      availableRecruitTypes: collectRecruitTypes(value.groups),
```

- [ ] **Step 3f: 3 处 paginateCandidateGroups 调用传参**

把这 3 处调用末尾补 `q.recruitType`：
- 约 1534 行（缓存命中, GROUP）：`...rankWindow, q.includeRegionMismatch === true, q.recruitType)`
- 约 1618 行（空结果）：`...rankWindow, q.includeRegionMismatch === true, q.recruitType)`
- 约 2270 行（新算, GROUP）：`...rankWindow, q.includeRegionMismatch === true, q.recruitType)`
（`paginateAsUniversities` 的两处调用 1532 / 2268 无需改，已读 `q.recruitType`。）

- [ ] **Step 3g: CandidateGroupFullResult 类型加可选字段（可选但推荐，过 TS）**

`interface CandidateGroupFullResult` 里加（避免 strict TS 报未知属性，若该项目 return 用宽松对象则可跳过——以 build 是否报错为准）：
> 注：`availableRecruitTypes` 是加在 paginate 的**返回对象**上，不是 `CandidateGroupFullResult`（那是缓存体）。无需改该 interface。本步骤无操作，仅提醒不要误改缓存体类型。

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --filter server exec jest src/modules/plan-candidate/plan-candidate.service.spec.ts`
Expected: PASS（新 4 例 + 原有用例不回归）

- [ ] **Step 5: 提交**

```bash
git add apps/server/src/modules/plan-candidate/dto/get-candidates-query.dto.ts apps/server/src/modules/plan-candidate/plan-candidate.service.ts apps/server/src/modules/plan-candidate/plan-candidate.service.spec.ts
git commit -m "feat(plan-candidate): 招生类型分页层过滤 + availableRecruitTypes 透出"
```

---

### Task 3: 前端 api client + 筛选 UI

**Files:**
- Modify: `apps/web/src/services/plan-api.ts:57`（params 类型）、`:144`（序列化）
- Modify: `apps/web/src/app/(teacher)/teacher/plans/generate/[studentId]/page.tsx`（类型 315、state 1038、query 1139/1160、UI 2445 后）

- [ ] **Step 1: api client 类型 + 序列化**

`plan-api.ts` 的 `CandidateGroupListParams`，在 `purity?: string[];`（57 行）下方加：
```ts
  // 招生类型过滤. 空数组/undefined = 不过滤; ['普通类本科'] = 仅该类
  recruitType?: string[];
```
`getCandidateGroups` 的 params 对象里，`purity:` 序列化那段之后加：
```ts
        recruitType: params?.recruitType && params.recruitType.length > 0
          ? params.recruitType.join(',')
          : undefined,
```

- [ ] **Step 2: page.tsx 类型 + state**

`CandidateGroupListResult` 接口（约 315 行）里加一行可选字段：
```ts
  availableRecruitTypes?: string[];
```
在 `purityFilter` state（约 1038 行）之后加：
```ts
  // 招生类型过滤. 空数组 = 全部; 多选 (同批次混多招生类型时聚焦)
  const [recruitTypeFilter, setRecruitTypeFilter] = useState<string[]>([]);
  const toggleRecruitType = (rt: string) =>
    setRecruitTypeFilter((prev) => (prev.includes(rt) ? prev.filter((x) => x !== rt) : [...prev, rt]));
```

- [ ] **Step 3: query 接线（queryKey + queryFn）**

queryKey（约 1139 行）数组末尾追加 `recruitTypeFilter.join(',')`：
```ts
    queryKey: [..., sinoForeignFilter, hasSearch ? null : (scoreRange ? `${scoreRange[0]}-${scoreRange[1]}` : null), recruitTypeFilter.join(',')],
```
queryFn 的 `planApi.getCandidateGroups(...)` 参数对象里，`sinoForeign:` 那行之后加：
```ts
      recruitType: recruitTypeFilter,
```

- [ ] **Step 4: 筛选 chip UI（对标纯净度 chip）**

在「纯净度过滤」那块 `</div>`（约 2445 行，紧接 `purityFilter.length > 0 ? ... 清除 ... </div>` 的外层 div 关闭）之后插入。选项来自后端 `availableRecruitTypes`，**长度 ≤ 1 时整体不渲染**：
```tsx
              {/* —— 招生类型过滤 chip (多选; 空 = 全部; 同批次混多招生类型时才出现) —— */}
              {(((candidateGroups as any)?.availableRecruitTypes ?? []) as string[]).length > 1 ? (
                <div className="pgv2-tier-bar" style={{ marginTop: 4 }}>
                  <span style={{ color: '#666', fontSize: 12, marginRight: 6 }}>招生类型</span>
                  {(((candidateGroups as any).availableRecruitTypes) as string[]).map((rt) => {
                    const active = recruitTypeFilter.includes(rt);
                    return (
                      <button
                        key={rt}
                        type="button"
                        className={`pgv2-tier-chip ${active ? 'is-active' : ''}`}
                        onClick={() => { toggleRecruitType(rt); setCandidatePage(1); }}
                        title={`仅显示「${rt}」(再点取消, 全不选 = 全部)`}
                      >
                        {rt}
                      </button>
                    );
                  })}
                  {recruitTypeFilter.length > 0 ? (
                    <button
                      type="button"
                      className="pgv2-tier-chip"
                      onClick={() => { setRecruitTypeFilter([]); setCandidatePage(1); }}
                      style={{ opacity: 0.7 }}
                    >
                      清除
                    </button>
                  ) : null}
                </div>
              ) : null}
```
> 切批次后选项变化：当 `recruitTypeFilter` 里有值但新批次的 `availableRecruitTypes` 不含它时，后端会把它当不存在的类→筛出空。为避免切批次后空列表，加一个 effect 在 `availableRecruitTypes` 变化时清掉失效选择：
```ts
  // 切批次/池变化 → 清掉当前已不在可选项里的招生类型选择, 避免空列表
  useEffect(() => {
    const avail = ((candidateGroups as any)?.availableRecruitTypes ?? []) as string[];
    if (recruitTypeFilter.length === 0) return;
    const kept = recruitTypeFilter.filter((rt) => avail.includes(rt));
    if (kept.length !== recruitTypeFilter.length) setRecruitTypeFilter(kept);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [(candidateGroups as any)?.availableRecruitTypes]);
```
（放在已有 effect 群附近，约 1380 行后。）

- [ ] **Step 5: 前端构建验证**

Run: `pnpm --filter web build`
Expected: 构建成功，无 TS 报错。

- [ ] **Step 6: 提交**

```bash
git add apps/web/src/services/plan-api.ts "apps/web/src/app/(teacher)/teacher/plans/generate/[studentId]/page.tsx"
git commit -m "feat(plan-generate): 生成页招生类型多选筛选器(动态选项+两视图通用)"
```

---

### Task 4: 整体验证

- [ ] **Step 1: 后端全量 plan-candidate 测试**

Run: `pnpm --filter server exec jest src/modules/plan-candidate`
Expected: 新增用例 PASS；既有 plan-candidate 套件不新增红（对照 baseline，见 [[test_suite_baseline_failures]]）。

- [ ] **Step 2: 后端构建**

Run: `pnpm --filter server build`
Expected: 成功，无 TS 报错。

- [ ] **Step 3: 人工冒烟（可选，本地起服务）**

进 `本科提前批B段` 批次的生成页 → 应出现「招生类型」chip（公费师范/定向医/优师…）；勾选某类列表只剩该类；进 `本科批(高校专项)` 这类单一招生类型批次 → chip 不出现。两视图(专业优先/院校优先)都生效。

---

## 自检（Self-Review）

- **Spec coverage**：① 多选筛选器 → Task 3 Step 4；② 选项动态跟批次 + 单类隐藏 → Task 2(availableRecruitTypes) + Task 3 Step 4(`length > 1`)；③ 两视图通用 → Task 2 paginateCandidateGroups + paginateAsUniversities；④ 默认全选零回归 → 纯函数空 csv 原样返回 + 不进缓存键 + 回归测试 Task 2 Step1 用例2。全覆盖。
- **类型一致**：`recruitType`（DTO/interface/params 全为 string CSV）；`availableRecruitTypes`（后端 string[]、前端 `CandidateGroupListResult.availableRecruitTypes?`）；纯函数名 `filterGroupsByRecruitType`/`filterUniversitiesByRecruitType`/`collectRecruitTypes`/`parseRecruitTypeCsv` 全程一致。
- **无占位符**：所有步骤含真实代码 + 真实命令 + 预期输出。
- **样式边界**：chip 复用既有 `pgv2-tier-chip`/`pgv2-tier-bar` class，无新样式；纯视觉打磨交 claude-design（见 [[feedback_frontend_styling]]）。
