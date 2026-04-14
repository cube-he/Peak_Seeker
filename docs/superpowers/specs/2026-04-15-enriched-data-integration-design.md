# Enriched Data Integration Design

> 利用数据处理管道的闲置丰富数据，全栈增强志愿填报方案质量

**日期**: 2026-04-15
**状态**: Draft
**方案**: A（分层渐进式）— L1 数据层 → L2 引擎层 → L3 API 层 → L4 展示层

---

## 背景

数据处理管道产出 18 个 JSON 文件（~1.8GB），当前只导入了 6 个基础文件。闲置的丰富数据包括：

- **universities_enriched.json** — 排名、满意度、就业率、深造率等 30+ 字段（覆盖率 ~95%）
- **majors_enriched.json** — 职业方向、考研方向、核心课程、满意度等（覆盖率 ~50%）
- **health_restrictions.json** — 700+ 条体检受限规则
- **eligible_regions.json** — 2400+ 条区县级特殊计划资格
- **qiangji_admissions.json** — 15 所学校强基计划 3 年录取数据

推荐引擎已有成熟的 12 步流水线和 4 维评分体系，需要在不破坏现有架构的前提下接入新数据。

## 决策记录

| 决策点 | 选择 | 原因 |
|--------|------|------|
| 实施范围 | 全栈贯通（后端+前端） | 用户直接看到效果 |
| 评分改造 | 新增第 5 维度"发展前景" | 不动现有 4 维，隔离风险 |
| 强基计划 | 仅信息展示，不做推荐 | 数据量小（165 条），选拔方式不同于位次法 |
| 实施方案 | 分层渐进式（L1→L4） | 每层独立可测试，一次 Schema 迁移 |

---

## L1 数据层 — Schema 扩展与数据导入

### L1.1 新增模型

#### HealthRestriction 体检受限表

```prisma
model HealthRestriction {
  id               Int     @id @default(autoincrement())
  conditionCode    String  @map("condition_code") @db.VarChar(50)
  conditionName    String  @map("condition_name") @db.Text
  restrictionType  String  @map("restriction_type") @db.VarChar(50)  // "不予录取" | "专业受限"
  severity         String  @db.VarChar(20)  // "hard" | "soft"
  section          String? @db.VarChar(100)
  restrictionScope String  @map("restriction_scope") @db.VarChar(20) // "类" | "专业"
  majorCategory    String? @map("major_category") @db.VarChar(100)
  majorCode        String? @map("major_code") @db.VarChar(50)
  majorName        String? @map("major_name") @db.VarChar(200)

  @@index([conditionCode])
  @@index([majorCode])
  @@index([majorCategory])
  @@map("health_restrictions")
}
```

#### EligibleRegion 地区资格表

```prisma
model EligibleRegion {
  id           Int     @id @default(autoincrement())
  program      String  @db.VarChar(50)
  programLabel String  @map("program_label") @db.VarChar(100)
  area         String  @db.VarChar(100)
  county       String? @db.VarChar(100)
  detail       String? @db.Text

  @@index([program, area])
  @@index([program, area, county])
  @@map("eligible_regions")
}
```

#### QiangjiAdmission 强基计划录取表（标准化行存储）

```prisma
model QiangjiAdmission {
  id               Int     @id @default(autoincrement())
  school           String  @db.VarChar(200)
  major            String  @db.VarChar(200)
  subject          String? @db.VarChar(100)
  admissionMethod  String? @map("admission_method") @db.VarChar(200)
  year             Int     @db.SmallInt
  entryScore       Int?    @map("entry_score")
  admitScore       Int?    @map("admit_score")
  gaokaoScore      Int?    @map("gaokao_score")
  gaokaoRank       Int?    @map("gaokao_rank")

  @@unique([school, major, year])
  @@index([school])
  @@index([year])
  @@map("qiangji_admissions")
}
```

### L1.2 University 表新增字段

以下字段为**新增**（已排除 Schema 中已有的 masterProgramCount、doctoralProgramCount、ranking、postgradRate、softRating、softRanking 等）：

```prisma
// 人口统计
maleRatio              Int?     @map("male_ratio")
femaleRatio            Int?     @map("female_ratio")
createdYear            String?  @map("created_year") @db.VarChar(20)
logoUrl                String?  @map("logo_url") @db.VarChar(500)

// A 类学科
aClassDisciplineCount  Int?     @map("a_class_discipline_count")

// 多维排名（softRanking 已有，不重复）
rankingAlumni          Int?     @map("ranking_alumni")
rankingQS              Int?     @map("ranking_qs")
rankingUSNews          Int?     @map("ranking_us_news")

// 满意度
satisfactionOverall    Float?   @map("satisfaction_overall")
satisfactionLife       Float?   @map("satisfaction_life")
satisfactionEnviron    Float?   @map("satisfaction_environ")
satisfactionCount      Int?     @map("satisfaction_count")

// 就业
employmentRate         String?  @map("employment_rate") @db.VarChar(50)
furtherStudyRate       String?  @map("further_study_rate") @db.VarChar(50)
avgSalary              String?  @map("avg_salary") @db.VarChar(50)
topEmployers           String?  @map("top_employers") @db.Text

// 招生章程（合并为 Json）
charterInfo            Json?    @map("charter_info")
```

共 15 个新列 + 1 个 Json 字段。

### L1.3 Major 表新增字段

已有字段（只需数据填充，不改 Schema）：`employmentRate`、`avgSalary`、`softRating`、`employmentDirection`

新增字段：

```prisma
description              String?  @map("major_description") @db.Text
maleRatio                Int?     @map("male_ratio")
femaleRatio              Int?     @map("female_ratio")
studentScale             String?  @map("student_scale") @db.VarChar(50)
careerDirections         Json?    @map("career_directions")
postgraduateDirections   Json?    @map("postgraduate_directions")
satisfactionScore        Float?   @map("satisfaction_score")
coreCourses              Json?    @map("core_courses")
degree                   String?  @map("degree") @db.VarChar(100)
standardDuration         String?  @map("standard_duration") @db.VarChar(20)
```

共 10 个新字段。

### L1.4 StudentProfile 表新增字段

```prisma
county  String?  @db.VarChar(100)  // 区县，用于地区资格精确匹配
```

同时明确 `physicalLimits Json?` 的标准结构为条件码数组：`["COLOR_WEAK", "HEART_DISEASE"]`，值必须对应 HealthRestriction.conditionCode。

### L1.5 数据导入策略

新建 `scripts/import-data/import-enriched.ts`，三阶段执行：

**Phase 1 — 新表数据插入**：
- HealthRestriction：从 `health_restrictions.json` 插入 ~700 条
- EligibleRegion：从 `eligible_regions.json` 插入 ~2400 条
- QiangjiAdmission：从 `qiangji_admissions.json` 展开年份后插入 ~495 条

**Phase 2 — University 丰富字段填充**：
- 从 `universities_enriched.json` 读取，按 `String(enrollCode)` 匹配 `University.code`（University.code 存的是四川招生代码，与 enriched 的 enrollCode 一致，类型 int→string 转换）
- 对已有字段（ranking、postgradRate、masterProgramCount 等）同步更新
- 对新增字段填充
- 招生章程 7 个 charter* 字段合并为 `charterInfo` Json

**Phase 3 — Major 丰富字段填充**：
- 从 `majors_enriched.json` 读取，按 `code` 匹配 Major
- 已有字段（employmentRate、avgSalary、employmentDirection）做 UPDATE
- 新增字段填充
- 覆盖率约 50%，未匹配的保持 null

所有操作使用 upsert/updateMany，幂等可重跑。

---

## L2 引擎层 — 过滤增强 + 第 5 维评分 + 职业对齐

### L2.1 体检硬过滤（candidate-filter.service.ts）

**替换**现有第 6 步简单文字匹配：

1. 启动时从 DB/Redis 加载全量 HealthRestriction，按 `conditionCode` 建 Map
2. 对每个候选：
   - 读学生 `physicalLimits` 条件码数组（+ colorBlind/colorWeak 向后兼容映射）
   - 对每个条件码查 Map 获取受限规则
   - `restrictionScope="类"` + `majorCategory` 匹配候选专业 category → 过滤
   - `restrictionScope="专业"` + `majorCode` 匹配候选专业 code → 过滤
   - `majorCategory="所有专业"` → 全部过滤（severity=hard 的绝对限制）
   - `severity="hard"` → 直接排除
   - `severity="soft"` → 保留，标记 healthRisks 传递给 risk-generator

缓存：Redis TTL 24h，~700 条约 100KB。

### L2.2 地区资格过滤（candidate-filter.service.ts 新增步骤）

插入位置：批次过滤之后。

1. 加载 EligibleRegion 全量，按 program 建索引
2. 从候选的 batch/planNotes 提取特殊计划关键词映射：
   - "公费师范" → PROVINCIAL_FREE_TEACHER / NATIONAL_FREE_TEACHER
   - "国家专项" → NATIONAL_SPECIAL_PLAN
   - "地方专项" → RURAL_REVITALIZATION
   - "深度贫困专项" → DEEP_POVERTY
3. 候选属于特殊计划时：
   - 检查学生 province + city + county 是否在资格名单
   - 不在 → 过滤；在 → 保留并标记 specialProgram
4. 学生未填 county → 退化为城市级匹配（宁可多推不漏推），生成提示
5. `isRural=false` 的学生 → 过滤农村专项

### L2.3 第 5 维评分 — "发展前景"（scoring-engine.service.ts）

与现有 4 维并列，新增 `prospectRaw`：

| 子因子 | 数据来源 | 评分规则 | 满分 |
|--------|----------|----------|------|
| employmentScore | University.employmentRate | ≥90%→3, ≥80%→2, ≥70%→1, 无数据→1.5 | 3 |
| salaryScore | University.avgSalary | 按四分位 Q4→3, Q3→2, Q2→1, Q1→0.5, 无→1.5 | 3 |
| satisfactionScore | Uni.satisfactionOverall×0.4 + Major.satisfactionScore×0.6 | ≥4.0→3, ≥3.5→2, ≥3.0→1, 无→1.5 | 3 |
| conditionalScore | 根据 careerPlan 切换（见下） | 动态 | 3 |
| rankingScore | min(QS, USNews, Alumni, Soft) 取最优 | Top50→3, Top100→2, Top200→1, 其他→0, 无→0 | 3 |

**conditionalScore 动态切换**：
- `careerPlan=POSTGRADUATE` → furtherStudyScore（≥50%→3, ≥30%→2, ≥15%→1, 无→1.5）
- `careerPlan=EMPLOYMENT` → employmentScore 权重翻倍（替代 conditionalScore 位置）
- `careerPlan=ABROAD` → rankingScore 权重翻倍
- 其他 → furtherStudyScore × 0.5

**缺失数据原则**：无数据给 1.5（中性值），不惩罚覆盖率不足的专业。

**动态权重（UNIVERSITY_FIRST 模式）**：

```
tierRaw     × W(t, 5.0→3.5)   // 不变
natureRaw   × W(t, 3.0→3.5)   // 不变
majorRaw    × W(t, 2.0→3.0)   // 不变
otherRaw    × W(t, 1.5→2.5)   // 不变
prospectRaw × W(t, 1.0→2.5)   // 新增：冲刺不看前景，保底重看前景
```

MAJOR_FIRST 模式下 prospectRaw 权重为 W(t, 1.5→2.5)，CITY_FIRST/BALANCED 为 W(t, 1.0→2.0)。

### L2.4 职业对齐加分（scoring-engine.service.ts bonus 扩展）

在现有 bonus 计算后追加：

```
careerAlignmentBonus = 0

// 职业方向匹配
if (学生.careerDirection 非空 && 专业.careerDirections 非空):
  matchCount = intersect(tokenize(student.careerDirection), major.careerDirections)
  if matchCount ≥ 3: bonus += 3.0  // 强匹配
  else if matchCount ≥ 1: bonus += 1.5  // 弱匹配

// 考研方向加分
if (careerPlan=POSTGRADUATE && 专业.postgraduateDirections 非空):
  bonus += 1.0

// 师范兴趣
if (teacherInterest && 专业 category 包含"教育"):
  bonus += 1.5

// 军事兴趣
if (militaryInterest && batch 属于军事类):
  bonus += 1.5
```

分词：中文逗号/顿号分词 + 去停用词，与 careerDirections 数组做子串匹配。

### L2.5 risk-generator 增强

新增体检风险段：
```
if (candidate.healthRisks?.length > 0):
  "体检提醒：该专业对{conditions}有限制要求，建议确认体检标准后填报"
```

### L2.6 reason-generator 增强

在现有 9 段后追加 5 段：
- 就业率标签（≥85%）
- 深造率标签（≥40% 且 careerPlan=POSTGRADUATE）
- 满意度标签（≥4.0）
- 职业匹配标签（careerAlignmentBonus > 0）
- 特殊资格标签（specialProgram=true）

---

## L3 API 层 — 接口返回丰富字段

### L3.1 University 详情接口增强

`GET /universities/:id` 新增返回：排名矩阵（4 种排名 + A 类学科数）、满意度（3 项 + 评价人数）、就业（率/深造率/薪资/雇主）、基本丰富（男女比/建校年/校徽/招生章程）、强基计划关联查询。

### L3.2 Major 详情接口增强

`GET /majors/:id` 新增返回：description、男女比、毕业生规模、careerDirections、postgraduateDirections、satisfactionScore、coreCourses、degree、standardDuration。

### L3.3 PlanItem scoreBreakdown 扩展

scoreBreakdown Json 新增字段（不加新列）：

```typescript
{
  // 现有字段不变
  ...existing,
  // 第 5 维
  prospect: number,
  prospectRaw: number,
  prospectEmployment: number,
  prospectSalary: number,
  prospectSatisfaction: number,
  prospectConditional: number,
  prospectRanking: number,
  // 职业对齐
  careerAlignmentBonus: number,
  // 体检风险
  healthRisks: string[],
}
```

### L3.4 新增接口

- `GET /health-restrictions` — 全量体检条件列表（供前端选择题渲染）
- `GET /eligible-regions?program=xxx` — 按计划类型返回资格地区

### L3.5 StudentProfile 更新接口增强

- `physicalLimits` 校验：值必须在 conditionCode 枚举内
- `county` 新字段可选提交
- 向后兼容：`colorBlind: true` 自动追加 `"COLOR_BLIND"` 到 physicalLimits

### L3.6 缓存策略

| 数据 | TTL | 说明 |
|------|-----|------|
| HealthRestriction 全量 | Redis 24h | 静态数据 |
| EligibleRegion 全量 | Redis 24h | 静态数据 |
| QiangjiAdmission | Redis 24h | 15 所学校 |
| University/Major 丰富字段 | 现有缓存不变 | 已覆盖新字段 |

---

## L4 展示层 — 前端增强

### L4.1 院校详情页（`/universities/[id]/page.tsx`）

基本信息 Tab 新增 3 个 Card：
- **排名矩阵** — 软科/校友会/QS/USNews + A 类学科数，Statistic 组件
- **满意度** — 综合/生活/环境，Progress 组件 + 评价人数
- **就业概况** — 就业率/深造率/薪资/主要雇主

Header 扩展：logoUrl 作为 Avatar、建校年份、男女比例。

新增 **强基计划 Tab**（仅有数据时显示）：Table 展示 school+major+年份分数矩阵。

### L4.2 专业详情页（`/majors/[id]/page.tsx`）

Header 扩展：学制、学位、满意度、毕业生规模、男女比。

Tab 上方新增专业简介区块（折叠展示）。

新增 **就业与发展 Tab**：职业方向 Tags + 考研方向 Tags + 核心课程 Tags。

### L4.3 方案卡片（PlanItemCard 组件）

展开详情新增区块：
- **发展前景行** — 就业率/深造率/满意度/排名（从 scoreBreakdown 读取）
- **职业匹配行** — 匹配强度标签（从 careerAlignmentBonus 读取）
- **体检提醒行** — 黄色警告（从 healthRisks 读取）

### L4.4 学生档案页（`/student/profile/page.tsx`）

健康状况改为 Checkbox.Group 标准化选择，选项从 API 动态加载。

新增区县级联选择器（省→市→县），县级信息用于特殊计划资格匹配。

### L4.5 推荐结果页（`/recommend/page.tsx`）

结果卡片新增指标徽章行：就业率/深造率/满意度/排名/职业匹配（Tag 组件，仅突出指标显示）。

---

## 不在范围内

- 推荐输入表单不变
- 教师方案管理页不变
- 录取追踪（PlanEvaluation）不在此次迭代
- AI 智能问答不在此次迭代
- `admission_records_filled.json` 插值数据暂不替换原始数据（需独立评估精度）

## 风险与缓解

| 风险 | 缓解 |
|------|------|
| 专业丰富数据覆盖率仅 50% | 缺失数据给中性分（1.5），不惩罚 |
| 第 5 维权重影响评分分布 | 权重起步低（1.0），保底端才升高（2.5） |
| 体检过滤误杀（规则匹配过严） | severity=soft 只警告不过滤 |
| 学生未填 county 影响资格筛选 | 退化为城市级匹配，生成补全提示 |
| Schema 迁移一次性列较多 | 全部为可选字段（nullable），不影响现有数据 |
