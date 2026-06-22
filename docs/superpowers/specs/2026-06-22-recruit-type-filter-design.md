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

### 3.1 后端 DTO
`apps/server/src/modules/plan-candidate/dto/get-candidates-query.dto.ts` 加：
```
@IsOptional() @IsString() recruitType?: string;  // CSV 多选, 沿用 purity 风格; 空/缺省 = 不过滤
```

### 3.2 后端过滤（取数 where）
- 把 CSV 解析成数组，非空时在 eps 查询 where 加 `recruitType: { in: [...] }`（**精确 in**，因为值来自库 distinct 出的真实值）。
- ⚠️ 与 batch-alias 的 `recruitTypeContains` 叠加：若该批次已被 alias 收窄，则两条件 AND 共存（已收窄批次里通常只剩 1 个值 → 筛选器隐藏，不会冲突）。落点跟随现有 where 构造（`filters/hard-filter.ts` 里 `where.recruitType = { contains: ... }` 的同一处，确保 contains 与 in 不互相覆盖）。

### 3.3 候选响应附带可选项
- 候选响应里新增 `availableRecruitTypes: string[]`——当前批次候选池 distinct `recruitType` 的集合（**在 recruitType 过滤之前、batch-alias 收窄之后**算，否则勾掉某类后选项也跟着消失）。
- 复用 service 已有 distinct 调用聚合，不额外查库。

### 3.4 前端 UI
`apps/web/src/app/(teacher)/teacher/plans/generate/[studentId]/page.tsx`：
- 筛选区加一个多选控件，选项 = 响应里的 `availableRecruitTypes`。
- 默认不传 `recruitType` 参数（= 全部，现状）。
- `availableRecruitTypes.length <= 1` 时整体隐藏控件。
- 两视图共挂同一控件（同一个 query 参数）。
- 选中值拼成 CSV 传给后端。
- 视觉样式留 className 交 claude-design。

## 四、测试（TDD）
service 单测（`plan-candidate.service.spec.ts` 同套路）：
1. 传 `recruitType='国家专项计划'` → where 命中 `recruitType.in`，只返回该类候选。
2. 传多值 `recruitType='国家专项计划,地方专项计划'` → in 含两值。
3. 与 batch-alias 收窄叠加：alias 已设 `recruitTypeContains` 的批次下，contains 与 in 同时存在、互不覆盖。
4. 空 / 缺省参数 → where 不含 recruitType（回归保护，结果与现状一致）。
5. `availableRecruitTypes` 聚合正确（在过滤前算，勾掉某类不丢选项）。
6. 院校优先视图（groupBy=UNIVERSITY）：过滤在 rollup 前生效，上卷结果只含选中类。

## 五、风险 / 回归点
- **默认零回归**：不传参 = 不过滤，所有现有调用行为不变。
- **batch-alias 覆盖**：最大坑是 in 把 contains 覆盖掉（或反之）导致已收窄批次出错——单测 #3 专门守。
- **availableRecruitTypes 时序**：必须在 recruitType 过滤之前算，否则选项会随勾选塌缩。
