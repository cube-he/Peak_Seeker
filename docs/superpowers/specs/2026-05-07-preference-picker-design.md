# 学生偏好字段：自由输入 → 选项化 picker 设计

**Date**: 2026-05-07
**Status**: Approved (brainstorming complete)
**Owner**: VolunteerHelper / 学生档案 / 偏好 section
**Predecessors**: `2026-05-06-student-profile-redesign-design.md`

## 背景与动机

学生档案 `PreferenceSection`（第 6 区"志愿偏好与排除"）当前 11 个偏好字段全部用 `AutoSaveSelect mode="tags"`，本质是自由文本输入：用户可以随便写"川大"、"四川大学"、"sichuan university"，全部都被存进 `String[]`。

后果：
1. 推荐引擎无法对齐——同一所学校 N 种写法
2. 学生体验差——"我也不知道有哪些选项可填"
3. 排除项写错可能误伤——"清华"和"清华大学"对推荐引擎是两个值
4. 老师无法做诊断——脏数据下批判没有意义

需求：**有标准答案的字段必须从已知集合里勾选；不能自由输入；但允许输入关键字快速过滤**。

## 范围

### 改造（10 个字段）

| # | fieldKey | 数据源类型 |
|---|---|---|
| 1 | preferredProvinces | 静态常量 |
| 2 | excludedProvinces | 静态常量 |
| 3 | preferredCities | 静态常量（新增）|
| 4 | excludedCities | 静态常量（新增）|
| 5 | preferredUniversities | API 全量缓存 |
| 6 | excludedUniversities | API 全量缓存 |
| 7 | preferredMajors | API 全量缓存 |
| 8 | excludedMajors | API 全量缓存 |
| 9 | preferredMajorCategories | 静态常量（新增）|
| 10 | preferredBatches | API（含 schema 改动）|

### 不改

- `preferredTags` —— 性质天然开放（"双一流"、"保研率高"、"海归师资"...），无权威清单。先保留 `mode="tags"` 自由输入。

## 关键设计决策

### D1 — 搜索策略：客户端过滤 + 全量缓存

院校 (~2,237) 和专业 (~1,434) 量级中等。两种方案：

| 方案 | 优 | 劣 |
|---|---|---|
| 服务端搜索（typeahead） | DOM 永远轻；首屏快 | 离线/弱网卡；网络延迟感知 |
| **首次 open 拉全量 + 客户端 filter** | 搜索零延迟；离线可用；React Query 跨字段共享 | 首次开下拉 ~200ms；前端持有 ~150KB |

**采用全量缓存**。理由：
- 院校 + 专业数据基本不变，缓存命中率 ≈ 100%
- 同一份院校列表被 4 个字段（preferred + excluded × 各自）共用，省 4× 流量
- 服务端不增 search endpoint，简化后端
- React Query `staleTime: Infinity` + `enabled` 控制按需触发

### D2 — 字段无联动

意向省份 ✕ 意向城市 **不级联过滤**。学生想跨省直选某城市（"我想去深圳"），不应被强制要先选广东。代价是城市 dropdown 列表更长，但 search-as-you-type 快速过滤足以应对。

### D3 — 批次 schema 升级

`preferredBatches` 从 `Batch[]` enum（4 粗类）改为 `String[]`，存 batch_config code（如 `"BENKE_PROVINCIAL_A"`、`"GAOZHI_ZHUANKE"`）。理由：
- 用户已 seed 18 个四川 2026 实际批次到 `batch_config` 表
- 未来加新省份零代码改动，只加 batch_config 行
- 推荐引擎可一一对应到具体批次
- Prisma `Batch` enum 4 粗类与实际填报粒度对不上

生产 `preferredBatches` 当前为空，无脏数据迁移压力。

### D4 — 选项 schema

picker 内部统一 `{ label: string, value: string }`：
- 静态常量直接导出此形状
- API 端点返 `{ id, code, name }`，hook 内 map 成 `{ label: name, value: code }`（院校用 code 而非 id，可读性强）
- 唯一例外：批次需要展示分类（如"本科批"/"专科批"），可用 `<Select.OptGroup>`

## 新组件：`AutoSavePicker`

```tsx
interface Props {
  fieldKey: string;
  defaultValue?: string[];
  optionsHook: () => { data: Option[]; isLoading: boolean };
  placeholder?: string;
}

interface Option { label: string; value: string; }
```

**实现要点**：
```tsx
<Select
  mode="multiple"          // 严禁 "tags"
  showSearch
  optionFilterProp="label"
  options={data}
  loading={isLoading}
  notFoundContent="无匹配"
  maxTagCount="responsive"
  virtual
  value={value}
  onChange={(v) => { setValue(v); commit(v); }}
/>
```

调用方负责注入 `optionsHook`，组件不感知数据来源，符合"组件 = 渲染 + 行为，数据 = hook"的原则。

## 数据源详细方案

### 静态常量（shared package）

| 文件 | 内容 | 大小 |
|---|---|---|
| `packages/shared/src/constants/cities.ts` | 全国 ~340 地级市 `{ name, provinceName, code }` | ~10KB |
| `packages/shared/src/constants/major-sub-categories.ts` | 教育部 2024 版 92 个一级学科/专业类 `{ code, name, categoryCode }` | ~5KB |

权威来源：教育部"普通高校本科专业目录（2024 年版）"公开 PDF/Excel；人工整理或脚本抓取。

### API 端点（新增）

| 端点 | 返回 | 缓存 |
|---|---|---|
| `GET /universities/picker-options` | `[{id, code, name}]` × 2,237（仅在川招生） | `staleTime: Infinity`（前端） + `Cache-Control: public, max-age=86400`（后端）|
| `GET /majors/picker-options` | `[{id, code, name}]` × 1,434 | 同上 |
| `GET /batch-config/picker-options?serviceYear=2026` | `[{code, name, category, displayOrder}]` × 18 | 同上 |

所有端点：`@UseGuards(JwtAuthGuard)` + 无角色限制（学生/老师都能拉）。

### 前端 hooks（与 AutoSavePicker 同目录 `apps/web/src/components/student/picker/`，沿用项目"hook 与消费组件就近"惯例）

```tsx
// 静态：直接导出 const
useProvinceOptions(): { data: Option[], isLoading: false }
useCityOptions(): { data: Option[], isLoading: false }
useMajorCategoryOptions(): { data: Option[], isLoading: false }

// API：React Query
useUniversityOptions(): { data: Option[], isLoading: boolean }
useMajorOptions(): { data: Option[], isLoading: boolean }
useBatchOptions(): { data: Option[], isLoading: boolean }
```

API hooks 共用一个 React Query key prefix `['picker-options', ...]`，`staleTime: Infinity`，`enabled` 由调用方传入（默认 false，dropdown 首次 open 触发 fetch）。

## 落地顺序（5 阶段）

| 阶段 | 内容 | 依赖 | 可独立部署 |
|---|---|---|---|
| **P1 数据准备** | shared 加 CITIES + MAJOR_SUB_CATEGORIES；Prisma migration: `preferredBatches Batch[] → String[]`；`UpdateStudentProfileDto.preferredBatches` 改 `String[]`；service 同步 | — | ✅ 不破前端 |
| **P2 后端端点** | 3 个 picker-options 端点（universities/majors/batch-config）；JwtAuth；返精简字段；加 Cache-Control | P1（仅批次端点） | ✅ 接口闲置无害 |
| **P3 前端基建** | `AutoSavePicker` 组件 + 单测；6 个 `useXxxOptions` hooks | P1 + P2 | ✅ 不破现状 |
| **P4 字段迁移** | `PreferenceSection` 10 个 `AutoSaveSelect` → `AutoSavePicker`；浏览器逐字段验 | P3 | ✅ 一次部署 |
| **P5 端到端验证** | chrome-devtools 真浏览器：选省/市/校/专业/类别/批次 → 持久化 → 刷新 → 推荐引擎读得到 | P4 | — |

每阶段一个 commit，5 个独立 commit，任一阶段失败可单独回退。

## 风险与缓解

| 风险 | 缓解 |
|---|---|
| 教育部 92 一级学科清单整理出错 | 实施 P1 时附 `__tests__/major-sub-categories.spec.ts`：断言"计算机类"、"临床医学"、"金融学类"等核心类目存在 |
| 院校全量响应 ~150KB 在弱网慢 | P2 加 `Cache-Control: public, max-age=86400`，浏览器只首次拉；后续切字段全走 304 |
| `preferredBatches` schema 改动需要数据迁移 | 生产现状 0 行有数据，迁移即 `ALTER COLUMN`，无 backfill |
| `AutoSavePicker` 与现有 `AutoSaveSelect` 共存期间样式不一致 | P3 实现时复用 `AutoSaveSelect` 的 onChange/store 模式，仅替换 mode 配置；视觉零差异 |
| MAJOR_CATEGORIES 14 门类常量已有，新增 92 一级学科可能造成误用 | 文件命名差异化：`major.ts`（14 门类）vs `major-sub-categories.ts`（92 一级学科）；JSDoc 写明用途 |

## 验收标准

P5 完成后，在生产 132.232.245.53:3004 用 bonustest01 账号验证：

1. 意向省份 dropdown 列出 34 省，输入"四"高亮"四川省"
2. 意向城市 dropdown 列出 ~340 市，输入"成"高亮"成都市"，可勾选
3. 意向院校 dropdown 首次 open 拉全量，输入"电子"过滤出"电子科技大学"等，可勾选
4. 意向专业 dropdown 同 3，输入"计算机"过滤出"计算机科学与技术"等
5. 意向专业类别 dropdown 列出 92 类，输入"计算"高亮"计算机类"
6. 意向批次 dropdown 列出 18 个 Sichuan 2026 批次，按 displayOrder 排序，可分组（OptGroup）
7. 任一字段不能输入选项之外的值（验证 `mode="multiple"` 而非 `"tags"`）
8. 刷新后所有选择持久化
9. server tests 全过；前端 build 无报错

## 不在范围

- preferredTags 自由输入字段保留
- 兴趣爱好/自我描述/性格类型 等 PlanningSection 自由文本字段保留
- 不修改老师端学生编辑视图（这次只动学生自填档案）
- 不引入移动端 modal picker（先用 ant Design Select 默认下拉，移动端体验由 antd 兜底）
