# 数据上传与信息展示设计

> 日期: 2026-04-29
> 状态: approved
> 优先级: A(数据导入) → C(信息展示) → B(推荐算法)

## 1. 目标

以 `data/03_专家版主表/output/` 下的 xlsx 作为核心数据源，导入生产 MySQL，使现有前端页面能展示真实数据。后续支持增量更新（征集志愿）。

## 2. 数据源

| 文件 | 行数 | 内容 |
|------|------|------|
| 院校信息表.xlsx | ~2238 | 院校维度（排名/保研率/评估/满意度等90列） |
| 专业招生主表.xlsx | ~48K | 专业级录取数据（22-25年分数/位次/计划横向展开71列） |
| 批次结构.xlsx ×3 | ~40行/年 | 23/24/25年批次层级定义 |

## 3. 自然主键

招生记录的唯一标识由 7 字段组成（已多次确认）：

| 字段 | xlsx 列名 | 示例 |
|------|-----------|------|
| 院校代码 | 院校代码 | 1 |
| 科类 | 科目 | 物理 |
| 批次 | 录取批次 | 本科批(高校专项) |
| 类别(招生类型) | 招生类型 | 高校专项计划 |
| 专业组代码 | 专业组代码 | 101 |
| 专业代码 | 专业代码 | 41 |
| 专业名称 | 专业 | 环境科学 |

加上 `year` 构成 `EnrollmentPlan` 和 `AdmissionRecord` 的 unique constraint。

## 4. 数据流架构

```
xlsx (专家版主表)           Python转换器          JSON (现有格式)         import_to_db.ts        MySQL
┌─────────────────┐       xlsx_to_json.py       ┌─────────────────┐       --mode=              ┌──────────┐
│ 院校信息表.xlsx  │──┐                          │universities.json│──┐   replace|upsert       │University│
│                 │  ├─────────────────────────→ │majors.json      │  ├───────────────────────→│Major     │
│ 专业招生主表.xlsx│──┘                          │enrollment_plans │  │                        │Enrollment│
│ (48K行×71列)    │    宽表→归一化拆分           │admission_records│──┘                        │Admission │
│                 │                              │                 │                           │          │
│ 批次结构×3.xlsx │─────────────────────────────→│batch_config.json│──────────────────────────→│BatchConfig│
└─────────────────┘                              └─────────────────┘                           └──────────┘
```

## 5. Prisma Schema 变更

### 5.1 EnrollmentPlan 新增字段

| 字段 | 类型 | 说明 |
|------|------|------|
| recruitType | String (max 100) | 招生类型（高校专项计划、国家专项等） |
| majorCode | String (max 50) | 专业代码 |
| majorName | String (max 200) | 专业名称（冗余存储） |

已有但需加入 unique：`subjects`, `groupCode`

**新 unique constraint:**
```prisma
@@unique([universityId, subjects, batch, recruitType, groupCode, majorCode, majorName, year])
```

删除旧的 `@@unique([universityId, majorId, year, province, batch])`。

### 5.2 AdmissionRecord 同理

新增同样 3 个字段（recruitType, majorCode, majorName），已有 subjects/groupCode 不在 unique 中需加入。

**新 unique constraint:**
```prisma
@@unique([universityId, subjects, batch, recruitType, groupCode, majorCode, majorName, year])
```

### 5.3 Major 表

保留 majorId 外键关联。Major 表仍作为专业元数据查找表（描述、就业方向、课程等）。majorName 冗余存储在 plan/record 中用于主键匹配和展示。

## 6. Python xlsx → JSON 转换器

文件：`scripts/data-processing/xlsx_to_json.py`

### 6.1 输出映射

| 输出文件 | 源 xlsx | 逻辑 |
|---------|---------|------|
| universities_enriched.json | 院校信息表.xlsx | 1行→1条，90列直接映射 |
| majors_enriched.json | 专业招生主表.xlsx | 按`专业`去重，取元数据列 |
| enrollment_plans_enriched.json | 专业招生主表.xlsx | 1行→最多3条（25/24/23） |
| admission_records_filled.json | 专业招生主表.xlsx | 1行→最多4条（25/24/23/22） |
| batch_config.json | 批次结构×3.xlsx | 批次规则 |

### 6.2 宽表拆分规则

专业招生主表每行包含 22-25 年数据横向展开：

| 年份 | enrollment_plan 字段 | admission_record 字段 |
|------|---------------------|----------------------|
| 2025 | 专业组计划、计划人数、学制、学费、投档顺序、志愿设置、选科要求 | 投档最低分/位次、专业组最低分/位次/录取人数、录取人数/最低/平均/最高分及位次 |
| 2024 | 计划人数 | 专业组最低分/位次/录取人数、录取人数/最低/平均/最高分及位次 |
| 2023 | 计划人数 | 录取人数/最低/平均/最高分及位次 |
| 2022 | 无 | 录取人数/最低/平均/最高分及位次 |

**共用字段**（每条记录都带）：院校代码、院校名称、专业组代码、专业代码、录取批次、科目、招生类型、专业、专业全称、专业类、门类、专业备注、院校备注、选科要求

### 6.3 空值策略

- 某年份所有分数/计划字段全为 null → 不生成该年记录
- 部分字段有值 → 正常生成，缺失字段为 null

## 7. import_to_db.ts 改造

### 7.1 新增 --mode 参数

```bash
# 全量替换（7月初灌入完整数据）
npx tsx import_to_db.ts --data=./output --mode=replace

# 增量更新（征集志愿、数据修补）
npx tsx import_to_db.ts --data=./output --mode=upsert
```

默认 `--mode=replace`，兼容现有用法。

### 7.2 模式行为差异

| 步骤 | replace | upsert |
|------|---------|--------|
| University | deleteMany → createMany | upsert by code |
| Major | deleteMany → createMany | upsert by name |
| EnrollmentPlan | deleteMany → createMany | upsert by 7字段主键+year |
| AdmissionRecord | deleteMany → createMany | upsert by 7字段主键+year |
| 其他表 | 现有行为不变 | 同 replace |

### 7.3 upsert 匹配键

```typescript
{
  universityId_subjects_batch_recruitType_groupCode_majorCode_majorName_year: {
    universityId, subjects, batch, recruitType,
    groupCode, majorCode, majorName, year
  }
}
```

## 8. 信息展示（前端联调）

现有前端页面已基本完整，需要确保对接真实数据后正常工作：

### 8.1 需验证的核心页面

| 页面 | 关键数据 | 状态 |
|------|---------|------|
| 院校列表 /universities | 筛选、搜索、分页 | 已实现，需联调 |
| 院校详情 /universities/[id] | 基本信息、招生计划表、历史录取 | 已实现，需联调 |
| 专业列表 /majors | 分类导航、搜索 | 已实现，需联调 |
| 专业详情 /majors/[id] | 开设院校、历史录取 | 已实现，需联调 |
| 分数查询 /scores | 按分数/位次查可报专业 | 已实现，需联调 |
| 推荐 /recommend | 冲/稳/保梯度 | 已实现，需联调 |

### 8.2 API 层聚合

数据库归一化存储（每年一行），API 返回时聚合为多年对比格式：

```json
{
  "universityName": "北京大学",
  "majorName": "计算机科学",
  "batch": "本科批",
  "years": {
    "2025": { "planCount": 3, "minScore": 680, "minRank": 120 },
    "2024": { "planCount": 2, "minScore": 670, "minRank": 150 },
    "2023": { "planCount": 2, "minScore": 665, "minRank": 180 }
  }
}
```

### 8.3 缺失的可视化增强（可选）

- 分数趋势图（ECharts） — 目前前端没用 ECharts
- 同专业多校对比

## 9. 数据更新节奏

| 时间 | 操作 | 模式 |
|------|------|------|
| 7月初 | 全量灌入当年招生计划 | --mode=replace |
| 填报期间 | 征集志愿数据追加 | --mode=upsert |
| 年度 | 新一年完整主表替换 | --mode=replace |

## 10. 实现范围（本次）

### 必做

1. Prisma schema 变更（补字段、改 unique constraint）+ migration
2. Python xlsx → JSON 转换器
3. import_to_db.ts 支持 --mode=replace|upsert + 新增字段写入
4. 执行数据导入到生产 MySQL
5. 前端联调验证（确保真实数据正确展示）

### 不做（后续）

- 推荐算法（B 优先级）
- ECharts 可视化增强
- 前端新增页面
