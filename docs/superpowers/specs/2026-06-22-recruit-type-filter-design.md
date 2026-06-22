# 生成页「招生类型」筛选器 设计

**日期**: 2026-06-22
**关联**: 生成页 plan-candidate 管线 / get-candidates-query.dto / hard-filter / batch-alias / generate page.tsx
**触发**: 同一个批次下混着多种招生类型（如本科提前批B段里公费师范/定向医/优师/乡村振兴…），部分老师需要按招生类型聚焦候选。生成页目前没有让老师按招生类型筛选的入口。

## 一、问题与目标

### 当前痛点
- 生成页是「按单个批次」工作的（老师选一个批次 → 看该批次全部候选）。
- 库里 `enrollment_plans.recruit_type` 有 24 种取值，但**绝大部分招生类型已经被批次名分开**（如 `本科批(高校专项)`、`本科提前批(国家专项)` 一个批次 = 一个招生类型，再筛多余）。
- **真正"同批次混多招生类型"集中在 4 个批次**（生产数据 2026-06-22 实测，按行数）：

  | 批次 | 混了哪些招生类型 |
  |---|---|
  | 本科提前批B段 | 公费师范 / 定向医 / 地方优师 / 国家优师 / 乡村振兴 / 国家公费师范 / 其他（7类）|
  | 本科提前批A段 | 军事 / 公安司法 / 高校综合评价 / 航海 / 消防（5类）|
  | 本科批B段 | 普通类本科 + 民族班 + 民族预科 + 非西藏定向西藏 + 本科层次职教（普通类混4个小特殊类）|
  | 本科批A段 | 国家专项 + 地方专项（2类）|

- 老师在这几个批次里无法只看某几类招生计划。

### 目标
1. 生成页加「招生类型」多选筛选器，让老师只看选中的招生类型。
2. 筛选器选项**跟随当前批次动态生成**——只列当前批次候选池里真实存在的招生类型；批次内只有 1 种时筛选器整体隐藏。
3. **专业优先 / 院校优先两视图通用**（过滤作用在取数层、上卷之前，院校优先天然正确）。
4. 默认全选（= 现状，零回归）。

### 非目标（YAGNI）
- 不归并那 24 个碎值成「大类」——动态按批次列真实值，单批次内值少（2~7）且可读，不需要归并。
- 不改默认结果——默认不传参 = 全部，老师想聚焦才主动勾。
- 不碰筛选器最终视觉样式（颜色/布局/控件皮）——只做功能 + 控件接线，样式交 claude-design。
- 不做跨批次的招生类型偏好记忆 / 持久化。

## 二、数据现状

- 字段：`EnrollmentPlan.recruitType`（VARCHAR），值如 `普通类本科`、`国家专项计划`、`地方专项计划`、`省级公费师范生`、`军事类` 等共 24 种。
- 现有 batch-alias 机制（`apps/server/src/modules/plan-candidate/batch-alias.ts`）：部分配置批次名已用 `recruitTypeContains` 做 `contains` 收窄（如配置「本科批A段（国家专项）」→ 数据 batch=`本科批A段` + recruitType contains `国家专项`）。**新筛选器必须与它叠加成 AND，不能互相覆盖。**
- service 取候选时本来就有 `distinct: ['universityId','groupCode','batch','recruitType','subjects']` 调用——`availableRecruitTypes` 可复用这次 distinct 的结果聚合，不额外打库。

## 三、设计

> **落点决策（2026-06-22 写计划时优化，取代早期"DB where + batch-alias AND"草案）**：recruitType 过滤放在**分页层（post-cache），与 `sinoForeign` 完全同层**，不进 DB where、不进缓存键。理由：① 缓存的 `fullResult.groups` 本就是整批次全量池（含所有招生类型），`availableRecruitTypes` 直接 distinct 即可，无需额外查库；② 选项变化只在分页层重过滤，秒切、不重建池（若进 DB where 则要进缓存键、每次切都重建）；③ 彻底绕开 batch-alias 的 `contains` 与 `in` 叠加冲突。group 对象已带 `recruitType`（`plan-candidate.service.ts:2052`），分页层过滤天然可行。

### 3.1 后端 DTO
`apps/server/src/modules/plan-candidate/dto/get-candidates-query.dto.ts` 加：
```
@IsOptional() @IsString() recruitType?: string;  // CSV 多选, 沿用 purity 风格; 空/缺省 = 不过滤
```

### 3.2 后端过滤（分页层，纯函数）
- 新增纯函数模块 `plan-candidate/recruit-type-filter.ts`，对标 `sino-foreign-filter.ts`：
  - `filterGroupsByRecruitType(groups, csv)`：空 csv → 原样返回；否则 `groups.filter(g => selected.includes(g.recruitType))`。
  - `filterUniversitiesByRecruitType(universities, csv)`：上卷视图，组级先筛、空组院校剔除（在 rollup 前对 `value.groups` 收窄，更简单）。
  - `collectRecruitTypes(groups): string[]`：distinct + 按组数降序（普通类自然置顶）、同数 localeCompare，供 `availableRecruitTypes`。
- 接入点：`paginateCandidateGroups` 加 `recruitType?` 参数，在 band 过滤前先把 `value.groups` 收窄成工作集，后续 band/sino/rank/region/tierCounts 全部基于工作集（避免 chip 计数 > total）。`paginateAsUniversities` 已收 `q`，直接读 `q.recruitType`，在 `rollupByUniversity` 前收窄。

### 3.3 候选响应附带可选项
- 候选响应里新增 `availableRecruitTypes: string[]` = `collectRecruitTypes(value.groups)`（**从缓存的全量池算，与当前 recruitType 选择无关**，故勾掉某类后选项不塌缩）。两个 paginate 函数各自挂到返回对象。

### 3.4 前端 UI
`apps/web/src/app/(teacher)/teacher/plans/generate/[studentId]/page.tsx`：
- 筛选区加一个多选控件，选项 = 响应里的 `availableRecruitTypes`。
- 默认不传 `recruitType` 参数（= 全部，现状）。
- `availableRecruitTypes.length <= 1` 时整体隐藏控件。
- 两视图共挂同一控件（同一个 query 参数）。
- 选中值拼成 CSV 传给后端。
- 视觉样式留 className 交 claude-design。

## 四、测试（TDD）
纯函数单测（`recruit-type-filter.spec.ts`）：
1. `filterGroupsByRecruitType(groups, '国家专项计划')` → 只留该类组。
2. 多值 `'国家专项计划,地方专项计划'` → 留两类。
3. 空 / undefined csv → 原样返回（同引用，回归保护）。
4. `filterUniversitiesByRecruitType`：剔除筛后无组的院校。
5. `collectRecruitTypes` → distinct + 按组数降序（普通类置顶）。

service 单测（`plan-candidate.service.spec.ts` 同套路）：
6. 传 `recruitType='普通类'`（构造混类池）→ GROUP 视图 total/groups 只含该类。
7. 空 / 缺省 → 结果与现状一致（回归保护）。
8. 响应含 `availableRecruitTypes`，且为全量池的招生类型（不随 `recruitType` 选择塌缩）。
9. 院校优先视图（groupBy=UNIVERSITY）：上卷前收窄，universities 只含选中类。

## 五、风险 / 回归点
- **默认零回归**：不传参 = 不过滤，纯函数原样返回，所有现有调用行为不变。
- **不进缓存键**：recruitType 是分页层过滤，**绝不能进 `candidateGroupCacheKey`**（否则每次切都重建池，且会复刻 purity 那种"未进键"的陷阱反向版）——它本就不该进，保持现状即可。
- **tierCounts/total 一致性**：必须在 band 过滤前把 `value.groups` 收窄成工作集，否则冲/稳/保 chip 计数会大于列表 total（沿用 region 折叠那处已有教训）。
- **availableRecruitTypes 时序**：从 `value.groups`（全量池）算，与 recruitType 选择解耦，故勾选不塌缩选项。
