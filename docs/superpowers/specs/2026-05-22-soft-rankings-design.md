# 软科院校排名落地 · 设计

- 日期：2026-05-22
- 范围：把软科（ShanghaiRanking）排名数据用到 `/universities` 院校库页面——优化项 #1-4。
- 数据源：`data/院校级数据/学校排名.xlsx`（软科 2026；高职榜为 2025）。

## 一、背景

universities 页面已零散展示软科排名（`RankRow` 的「软科全国 #N」、`UniversityCard` 的「综合排名」），但排名数据靠旧主导入脚本填充、口径不明，且缺「类别排名」维度。本次把软科完整榜单数据规范地落地。

软科数据声明「仅供学习研究使用，禁止公开转载、商业分发」——用户已知悉该风险并确认继续（产品已在用软科数据）。

## 二、本次范围

做（#1-4）：

- #1 类别内排名：院校在所属类别榜（财经/医药/政法…）的名次
- #2 软科排名排序：列表新增「按软科排名」排序
- #3 专科/民办补排名：覆盖高职榜、民办榜
- #4 卡片排名口径正名：卡片排名改为有据、标年份/体系的软科排名

不做（移交/暂缓）：

- #5 口碑榜 Tab（独立新视图）—— 单独立项
- 纯样式（卡片排名排版）—— claude-design
- 软科总分、软科评级 —— 不在本次（总分无展示意义；这份表无评级列）

## 三、数据结构

`University` model 新增 4 个字段（复用已有的 `softRanking`）：

```prisma
softRankList     String? @map("soft_rank_list")     // 主榜体系：本科 / 民办 / 高职
softCategory     String? @map("soft_category")       // 类别榜名：财经类 / 医药类 / ...
softCategoryRank Int?    @map("soft_category_rank")   // 类别榜名次
softRankYear     Int?    @map("soft_rank_year")       // 数据年份
```

`softRanking`（Int?，已有）—— 口径明确为「在 `softRankList` 所指主榜的名次」。

**口径说明**：软科的「中国大学排名（总榜）」「中国民办高校排名」「中国高职院校排名」是三个独立体系，名次不可跨体系比较，故 `softRankList` 必须与 `softRanking` 配对存储、配对展示。`softCategory`/`softCategoryRank` 是院校在其专门类别榜的名次（综合、理工类院校通常无对应类别榜，留空）。

新增 `@@index([softRanking])` 供排序。

## 四、数据导入

新增脚本 `apps/server/scripts/import-soft-rankings.ts`，读 `data/院校级数据/学校排名.xlsx`：

- **主榜**：`中国大学排名（总榜）_10` → `softRankList='本科'`；`中国民办高校排名（总榜）_-15` → `'民办'`；`中国高职院校排名_2025` → `'高职'`。每校写 `softRankList` + `softRanking`，`softRankYear` 取自榜单年份（本科/民办 2026、高职 2025）。
- **类别榜**：财经/医药/中医药/政法/师范/民族/体育/语言 等子榜 → 每校写 `softCategory` + `softCategoryRank`。
- **匹配**：xlsx「学校中文名」与 `University.name` 精确匹配。库内为在川招生约 2237 所、xlsx 为全国院校——匹配不上的（xlsx 有、库里无）跳过；库里有但未上榜的院校排名字段留空（null）。同名院校（生产数据有少量重复）一并更新。
- 复用既有脚本的 `PrismaMariaDb` adapter 初始化模式。

## 五、后端

`QueryUniversityDto` 的 `sortBy` `@IsIn` 增加 `softRank`。`findAll` 的 `orderByField` 映射：`sortBy=softRank` → 按 `softRanking` 升序（Prisma 默认 NULL 排末尾）。其余排序不变。

## 六、前端

`apps/web/src/services/university.ts` 的 `UniversityListItem` 补字段：`softRanking`（运行时本就在 `findAll` 响应里，类型未列，需补）、`softRankList`、`softCategory`、`softCategoryRank`、`softRankYear`。

`UniversityCard`：

- #4：卡片现有的「综合排名 N」（`uni.ranking`，口径不明）改为软科排名——显示形如「软科2026 #N」，按 `softRankList` 标体系（本科/民办/高职）
- #1：当 `softCategory` 与 `softCategoryRank` 存在时，显示类别排名（如「财经类 #5」）
- 排序条新增「软科排名」项（`sortBy=softRank`）

#3 专科/民办补全主要靠导入脚本覆盖高职榜、民办榜，前端展示同上。

## 七、数据流

xlsx → 导入脚本 → `University` 表（5 字段）→ `findAll` 响应（字段在 `...rest` 中带出）→ `UniversityListItem` → `UniversityCard` 展示。

## 八、错误处理与降级

- 院校未上软科榜：相关字段为 null，卡片不渲染软科排名/类别排名行
- 跨体系排序限制：`softRanking` 混含本科/民办/高职三体系，按它排序时若列表混含不同体系院校会跨体系混排——用户通常已先按「办学层次」筛选，同体系内排序正常；本次不额外处理，设计内接受此限制
- 导入匹配不上：跳过，不报错

## 九、测试策略

遵循 TDD。

- 导入脚本：榜单解析、校名匹配逻辑抽纯函数单测
- 后端：`findAll` `sortBy=softRank` 排序的 `university.service.spec.ts` 用例
- 前端：`UniversityCard` 软科排名/类别排名展示、未上榜降级的测试

## 十、部署注意

1. `prisma migrate`：新增 4 字段 + index
2. 跑 `import-soft-rankings` 脚本（需 `DATABASE_URL`）
3. 清 Redis 缓存 `cache:university:*`
4. 按既有 `deploy_auto.py` 部署

## 十一、实施顺序

schema + 迁移 → 导入脚本（数据层）→ 后端 `findAll` 排序 → 前端 service 类型 + 卡片展示 + 排序项。
