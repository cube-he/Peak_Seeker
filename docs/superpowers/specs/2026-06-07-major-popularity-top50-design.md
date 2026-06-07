# 专业热度 TOP50 整合到专业库 — 设计

日期: 2026-06-07

## 数据

2025 年本科热度 TOP50 专业榜（来源：用户提供的微信文章截图，自动抓取被微信反爬 + 浏览器安全策略双重拦截，改由用户截图提供）。
字段：排名 (1-50)、专业名、学科门类、热度值（万）。
**匹配验证**：50 个专业名在 `data/专业级数据/专业库_全国.xlsx`「名称」列 **50/50 精确匹配**。

## 存储 — Major 表 + migration

新增 3 个可空字段（仅上榜 50 专业有值，其余 NULL）：

| 字段 | 类型 | 说明 |
|---|---|---|
| `popularityRank` | Int? | 全国本科热度排名 1-50 |
| `popularityHeat` | Int? | 热度值（人），如 `82000` → 展示 `8.2万` |
| `popularityYear` | Int? @db.SmallInt | 榜单年份 2025 |

热度 `X.X万` 存为 `X.X*10000`（整数），展示时回显 `(v/10000).toFixed(1)+'万'`，忠实于源数据 1 位小数精度。

## 导入 — `scripts/import-major-popularity.ts`（新）

内嵌 50 行 `(rank, name, heat)`，按 `name` 调 `updateMany`（Major 表存在同名多 code 记录，`updateMany` 全覆盖正确）。跑完报告命中数 + 未命中专业名清单。

## 后端

- `major.service.findAll`：`sortBy === 'popularity'` → `orderBy [{ popularityRank: asc nulls last }, { name: asc }]`（上榜专业排前、按名次；其余按名）。
- `findById`：`findMany`/`findUnique` 无 select 限制，新字段自动返回。
- controller 已透传 `sortBy`，无需改。

## 前端（**仅上榜才显示，榜外不显示**）

- 列表 `MajorCard`：`popularityRank` 有值时显示「🔥 热度 第N · X.X万」徽标。
- 列表排序栏：加「按热度排序」按钮（`sortBy='popularity'`）+ activeFilter 标签。
- 详情页 hero 标题旁：加「🔥 2025 本科热度 全国第N · X.X万」徽标（仅上榜）。

## 改动文件

- `apps/server/prisma/schema.prisma`（+ migration）
- `scripts/import-major-popularity.ts`（新）
- `apps/server/src/modules/major/major.service.ts`（sort）
- `apps/web/src/app/(main)/majors/page.tsx`（card 徽标 + 排序按钮）
- `apps/web/src/app/(main)/majors/[id]/page.tsx`（hero 徽标）

## 验证

- 导入脚本报告命中 50/50（或列出未命中）
- 详情页 / 列表徽标仅 TOP50 显示，榜外不显示
- 「按热度排序」生效（TOP50 排前）
- server build + web build 通过

## 部署（动生产库 schema，部署前确认）

prod DB 加 3 列（migrate）→ 跑 import 写 50 条 → server `prisma generate` + 重新 build + 部署 → 清相关缓存（如有 major 缓存）。
