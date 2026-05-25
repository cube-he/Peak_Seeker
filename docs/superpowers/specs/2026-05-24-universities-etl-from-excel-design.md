# 院校全量数据 ETL — 从 Excel 补齐 universities 表 — 设计方案

**日期**：2026-05-24
**前置**：[排序改进 spec](./2026-05-24-university-list-sorting-redesign.md) 因数据空被搁置；本 spec 解决数据问题
**状态**：Draft → 待用户 review

---

## 1. 背景

`/universities` 排序改进规划中，发现 universities 表 14+ 个排序候选字段里只有 ~6 个有数据，剩余字段（校友会/QS/USNews 排名、A 类学科数、就业率、薪资、校园面积、建校年份等）全空。

用户提供数据源：`data/03_专家版主表/output/`，包含完整的院校全量数据 Excel 文件，但**只有软科排名被导入过**（通过 `apps/server/scripts/import-soft-rankings.ts`）。

本 spec 解决：把 Excel 数据全量导入 universities 表，补齐所有缺失字段。

---

## 2. 范围

### 在范围内

- 从 `data/03_专家版主表/output/院校全量数据_多Sheet.xlsx` 6 个 sheet 导入数据
- 必要的 prisma schema migration（新增 15-20 个字段）
- 写 6 个 ETL 脚本（按 sheet 拆分），仿 `import-soft-rankings.ts` 模式
- 院校名匹配策略（复用已有的）
- 跑 import + 验证填充率
- 部署 + 清 Redis cache

### 不在范围内

- 后续的"排序 UI 改造"（数据有了之后由 [排序 spec](./2026-05-24-university-list-sorting-redesign.md) 接手）
- 专业层数据导入（`专业全量数据_多Sheet.xlsx`）— 单独任务
- 招生计划/录取数据导入（已通过其他 pipeline 处理）

---

## 3. 数据源调研

### 3.1 文件清单

`data/03_专家版主表/output/`：

| 文件 | 大小 | 用途 |
|---|---|---|
| 院校全量数据_多Sheet.xlsx | 11 MB | **本次主要数据源**（6 sheet） |
| 学校排名.xlsx | 311 KB | 已被 import-soft-rankings 用过，**本次不再用** |
| 院校信息表.xlsx | 2 MB | 跟 01_基础名录 重复，本次不用 |
| 专业全量数据_多Sheet.xlsx | 21 MB | 专业层数据，不在范围 |

### 3.2 Sheet 概览

| Sheet | 行数 | 内容 | 优先级 |
|---|---|---|---|
| 01_基础名录 | 3834 | 院校基础（建校年/面积/通讯/官网） | **必导** |
| 02_详情扩展 | 3834 | 学科/排名/特色专业/热度 | **必导** |
| 03_历年排名 | 4292 | 5 大榜单 × 多年（软科 3217 + 校友会 759 + USNews 172 + 泰晤士 93 + QS 51） | **必导**（除软科） |
| 04_院校满意度 | 3834 | 综合/生活/环境满意度 + 1-5 星分布 | **部分导**（87% 已填） |
| 05_招生章程 | 2912 | 调档比例、专业分配、外语要求等 | **必导** |
| 06_就业流向 | 1051 | 签约地区/单位性质 | **必导** |

---

## 4. Schema 改动（新增字段）

按"YAGNI + 排序需要 + 详情页展示"原则筛选，避免一次性加 30+ 字段。最终新增 18 个字段：

```prisma
// 加到 model University {} 内（紧跟现有字段后）

// 院校基础补充（来自 01_基础名录）
firstClassCategory       String? @map("first_class_category") @db.VarChar(50)   // 一流大学类别
hasGradSchool            Boolean @default(false) @map("has_grad_school")        // 有研究生院
hasRecommendQualification Boolean @default(false) @map("has_recommend_qualification") // 有保研资格
is101Plan                Boolean @default(false) @map("is_101_plan")            // 是否 101 计划
isQiangji                Boolean @default(false) @map("is_qiangji")              // 是否强基计划
website                  String? @db.VarChar(500)                                // 学校官网
admissionWebsite         String? @map("admission_website") @db.VarChar(500)
admissionPhone           String? @map("admission_phone") @db.VarChar(200)
admissionEmail           String? @map("admission_email") @db.VarChar(200)
cityTier                 String? @map("city_tier") @db.VarChar(20)              // 城市等级
universityTier           String? @map("university_tier") @db.VarChar(50)        // 院校档次
universityBackground     String? @map("university_background") @db.VarChar(50)  // 院校背景

// 学科建设补充（来自 02_详情扩展）
firstClassDisciplineCount     Int?    @map("first_class_discipline_count")
nationalFeatureMajorCount     Int?    @map("national_feature_major_count")
nationalKeyDisciplineCount    Int?    @map("national_key_discipline_count")
description                   String? @db.Text   // 学校简介
heatScore                     Int?    @map("heat_score")           // 热度（用于"热门"排序）
bannerUrl                     String? @map("banner_url") @db.VarChar(500)

// 多维排名补充（来自 03_历年排名）
rankingTimes              Int?    @map("ranking_times")   // 泰晤士排名（已有 alumni/qs/usnews）

// 索引（支持新增的排序场景）
@@index([heatScore])
@@index([rankingAlumni])
@@index([rankingQS])
@@index([rankingUSNews])
@@index([rankingTimes])
@@index([aClassDisciplineCount])
@@index([firstClassDisciplineCount])
```

**生成 migration**：
```bash
cd apps/server && npx prisma migrate dev --name add_university_etl_fields
```

**未新增字段**（已经判断价值低 / 已有等价字段 / 单独任务）：
- 满意度 1-5 星分布（15 个字段）— 信息密度低，YAGNI
- 学校领导 / 周边环境 / 校区地址原始结构 — 文本字段，可后续按需加
- 招生章程子字段（调档比例/同分规则等）— 用现有 `charterInfo Json` 整体存
- 就业流向子字段 — 用现有 `topEmployers Text` 整体存

---

## 5. ETL 脚本组织

按 sheet 拆 6 个独立脚本，仿 `import-soft-rankings.ts` 模式。每个脚本独立可跑、有 `--dry-run` 选项。

```
apps/server/scripts/
├── import-soft-rankings.ts            [已有，不改]
├── import-university-basic.ts         [新] sheet 01_基础名录
├── import-university-details.ts       [新] sheet 02_详情扩展
├── import-university-rankings.ts      [新] sheet 03_历年排名（除软科）
├── import-university-satisfaction.ts  [新] sheet 04_院校满意度（增量补全）
├── import-university-charters.ts      [新] sheet 05_招生章程
├── import-university-employment.ts    [新] sheet 06_就业流向
└── lib/
    ├── cli-utils.ts                    [已有]
    └── university-matcher.ts           [新] 院校名匹配（被所有 import 共用）
```

### 5.1 院校匹配策略（`university-matcher.ts`）

抽取共用逻辑。匹配优先级：

1. **优先用代码** — Excel 的 `教育部代码` / `国标代码` / `阳光高考ID` → DB `universities.code`
2. **fallback 用规范化名** — Excel 的 `规范化名` → DB `universities.name`，先严格相等，再去掉常见后缀对比
3. **未匹配的院校** — 写到 `_unmatched.tsv` 文件，import 完打印 summary

接口：

```typescript
export type MatchResult = { universityId: number; matchedBy: 'code'|'name'|'fuzzy' } | { universityId: null; reason: string };

export interface UniversityMatcher {
  findByCode(code: string): Promise<number | null>;
  findByName(name: string): Promise<MatchResult>;
}
```

### 5.2 每个脚本统一格式

```typescript
// 1. parseArgs --file=... --dry-run --overwrite
// 2. 读 sheet 行（exceljs streaming）
// 3. matcher 找 universityId
// 4. mapping Excel 列 → DB 字段
// 5. 转换值（trim、空字符串→null、数字解析、是/否→Boolean）
// 6. dry-run 时打印前 5 行 + 统计，--overwrite 时 update
// 7. 最后打印：N 行处理 / X 行更新 / Y 行未匹配
```

### 5.3 关键决策：覆盖策略

**默认行为：跳过已有值**（NULL safe override）。
- 比如 `satisfactionOverall` 已经 87% 填充，导入新数据时只更新 NULL 字段
- 防止误覆盖人工修正过的值

**`--overwrite` 选项**：强制覆盖所有字段（用于确认数据源更可靠时）。

### 5.4 关键决策：跨年排名

`03_历年排名` 每个院校在每个榜单可能有多年数据（QS 2021/2022/2023）。

**规则**：每个榜单对每所院校**只存最新年的排名**到 universities 表对应字段。
- 校友会 → rankingAlumni（最新年）
- QS → rankingQS（最新年）
- USNews → rankingUSNews（最新年）
- 泰晤士 → rankingTimes（最新年）

未来如需"历年趋势"展示，单独建 `university_rank_history` 表（不在本 spec）。

---

## 6. 实施任务（6 步）

按依赖顺序：

1. **Schema migration** — 加 18 个新字段 + 7 个索引，跑 prisma migrate dev
2. **`university-matcher.ts`** — 共用院校匹配 util + 单元测试（code 优先、name fallback、未匹配 log）
3. **6 个 import 脚本**（按 sheet 拆 6 个 task）：
   - 3a. import-university-basic
   - 3b. import-university-details
   - 3c. import-university-rankings
   - 3d. import-university-satisfaction
   - 3e. import-university-charters
   - 3f. import-university-employment
4. **跑所有 import**（dev 库 + 远程库） + 验证字段填充率（再跑一次之前的采样脚本）
5. **部署 + 清 Redis cache**
6. **回过头继续排序方案** — 数据有了，排序 spec 的 14 维度真实可用

**估时**：8-12 小时（schema 1h + matcher 2h + 6 个脚本 ~1h 每个 + 验证 2h + 部署 1h）。

---

## 7. 风险与缓解

| 风险 | 缓解 |
|---|---|
| Excel 院校名跟 DB 不严格匹配（如"中国传媒大学" vs "中国传媒大学（北京）"） | 加 fuzzy match + 输出未匹配清单人工 review |
| 跨年排名数据冲突（同一榜单两年都给同一院校排名） | 取最新年；同年多次 import 也幂等 |
| 新加的 Boolean 字段（如 is101Plan）当前默认 false，但院校实际可能 true（数据未导入前后台显示假阴性） | 仅在 import 完后部署；部署前后保持一致 |
| schema 加字段对现有代码影响 | 字段都是可空或 Boolean default false，新增不破坏旧 query |
| import 时大表写入慢 | 用 prisma transaction + batch update，避免单行更新；监控完成时间 |
| Redis cache 跟 universities 数据强相关 | import 完跑 `redis-cli KEYS "*university*" \| xargs -r DEL` |

---

## 8. 验收标准

import 完毕后再跑一次采样脚本（之前的 check_ranking_remote.py），验证：

```
universities 总数 2237 行 + Excel 院校 3834（中 ~2237 应能 match）
  ranking_alumni:          目标 > 500 (校友会有 759 行)
  ranking_qs:              目标 > 30  (QS 有 51 行)
  ranking_us_news:         目标 > 100 (USNews 有 172 行)
  ranking_times:           目标 > 50  (泰晤士有 93 行)
  a_class_discipline_count: 目标 > 100 (985/211 校大多有)
  campus_area:             目标 > 1500 (基础名录 3834 行多数应有)
  created_year:            目标 > 2000
  is_featured:             业务运营单独标，不在 ETL 范围
```

UI 端 spot-check：
- 进 /universities/10001（北大）— 看详情页是否能展示新字段（QS / USNews / A 类学科数等）
- 进 /universities — 看现有排序仍正常（不破坏）

---

## 9. 待决定

**3 个未拍板的问题**留你定：

1. **覆盖策略**：默认"只填 NULL" 还是"全量覆盖"？
   - 我推荐 NULL safe（默认），加 `--overwrite` flag

2. **fuzzy match 阈值**：未匹配院校怎么处理？
   - 选项 A：完全 skip + 输出 unmatched.tsv 人工 review
   - 选项 B：自动用 Levenshtein 距离 ≤ 2 的 fuzzy match
   - 我推荐 A（精确度更高，人工兜底）

3. **schema 字段筛选范围**：上面列了 18 个新字段（精简版）。要不要再加？
   - 比如满意度 1-5 星分布（15 个字段）— 我建议先不加，等真需要可视化时再说
   - 学校简介 description — **是否需要？**（详情页会展示吗？）
   - 招办电话/邮箱 — **是否需要？**（详情页会展示吗？）

---

## 10. 后续

本 spec 完成后：
1. 排序 spec 的 14 维度真实可用，可启动"排序 UI 改造"
2. 详情页可考虑加新字段展示（建校年份、占地面积、热度、QS/USNews 排名 chip 等）— 单独 spec
3. 专业层数据导入（`专业全量数据_多Sheet.xlsx`）— 单独 spec
