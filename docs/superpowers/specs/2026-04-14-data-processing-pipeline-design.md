# 数据处理管道设计文档

## 概述

将 `data/` 目录下 331 个文件（174 xlsx, 43 json, 79 pdf）的原始数据处理为系统可用的结构化数据，写入 PostgreSQL 数据库，支撑志愿填报推荐引擎运行。

## 数据源清单与角色

| 源 | 角色 | 记录数 | 关键字段 |
|----|------|--------|---------|
| 01_一分一段表_完整版.json | **一分一段表主源** | 12,245 | year/course/score/sameCount/cumulativeCount |
| 01_批次线_四川.json | **批次线主源** | 187 (3年) | year/batch/course/score/pressureScore |
| 01_专业分数线_2025.json | 2025分数补缺源 | 44,986 (40.9%有分) | collegeCode/professionName/minScore/minRank |
| 01_院校分数线_2022-2025.json | 交叉验证参考 | ~5,600-9,675/年 | collegeCode/uMinScore(旧)/minScore(新) |
| 02_院校库_全国.json | **院校元数据主源** | 3,037 | code/保研率/排名/硕博点/features |
| 02_专业库详情.json | **专业元数据主源** | 1,884 | 专业代码/男女比/就业方向/满意度 |
| 02_学科评估_全国.json | 学科评估源 | 5,023 | xkdm/grade/schCode |
| 02_大学排名_全国.json | 排名源 | 1,895 | 6种排名体系 |
| 02_招生章程结构化.json | 章程规则源 | 2,912 | 调档比例/专业分配/同分规则 |
| 02_院校满意度.json | 满意度源 | 2,911 | overall/life/environ |
| 03_清洗后.xlsx | **主数据表** | 48,132×87 | 2026计划+2022-2025录取+院校专业属性 |
| 04_模拟文理合并.xlsx | **专业组结构源** | 45,237×49 | 专业组代码/选科要求/组计划人数 |
| 07_体检受限对照表.json | 体检受限源 | 1,974 | condition_code/major_code/restriction_type |
| 08_编码映射表.csv | 编码桥梁 | 2,239 | 招生代码→国标代码 |

## 关键数据特征（实测）

### 编码系统
- 03/04 使用四川招生代码 (1-9957)
- 01 API 使用扩展国标代码 (5-6位, 如100011)
- 02 使用标准国标代码 (5位, 如10001)
- 08映射表连接招生代码↔国标代码，99.37%匹配率

### 01 API 分数字段翻转
- 2022-2024: 有效分数在 `uMinScore/uMaxScore/uMinRank` 字段
- 2025: 有效分数在 `minScore/maxScore/minRank` 字段（u*字段全零）

### 交叉验证结果（2024年, 01 vs 03）
- 精确一致(Δ=0): 87.4%
- 近似一致(Δ≤2): 0.2%
- 不一致(Δ>2): 1.8%（主因：批次映射问题）
- 无法匹配: 10.7%（01缺提前批数据）

### 批次名映射
```
03(新高考名)              01(2024旧名)        01(2025新名)
本科批B段                 本一/本二            本科B
专科批                    专科                 专科
本科批A段(国家专项)        —                   本科A(国家专项)
本科提前批A段/B段          —(01无提前批)        —
```

### 新旧高考过渡
- 2022-2024: 文科/理科, 本一/本二/专科
- 2025: 物理/历史, 本科A/B段/专科, 有专业组

## 处理步骤

### Step 1: 一分一段表
- **输入**: `01_一分一段表_四川_2017_2025_完整.json` (12,245条)
- **处理**:
  - 映射 course → examType (文科/理科保留原值, 物理/历史保留原值)
  - 过滤 sameCount=0 且 score=0 的无效记录
  - 验证 cumulativeCount 单调递增
- **输出**: ScoreSegment 表 (~12,000条)
- **不用** 08的CSV（count为小数，格式有问题）

### Step 2: 批次线
- **输入**: `01_批次线_四川.json` (3年, 187条)
- **处理**: 展平嵌套结构 (year.batches[] → 扁平行)
- **输出**: BatchLine 表 (~187条)

### Step 3: 03主表导入
- **前置**: 校验03的87列名与import脚本列号的映射关系
- **输入**: `03_清洗后.xlsx` (48,132行×87列)
- **处理**:
  - 院校代码通过08映射表转为国标代码
  - 提取去重后的University (~2,238所)
  - 提取去重后的Major
  - 每行生成1条EnrollmentPlan (2026年)
  - 每行生成最多4条AdmissionRecord (2025/2024/2023/2022)
  - 2025分数列有值才写入（72.7%为空）
- **输出**: University + Major + EnrollmentPlan + AdmissionRecord

### Step 4: 01补齐2025空缺
- **输入**: `01_专业分数线_四川_2025.json` (18,417条有分)
- **处理**:
  - 通过 collegeEnrollCode 匹配03的院校代码
  - 注意使用 minScore 而非 uMinScore（2025年字段翻转）
  - 批次名映射: 本科B→本科批B段
  - 匹配到的记录 UPDATE 对应的 AdmissionRecord
- **预期**: 补齐数千条2025专业级分数

### Step 5: 04专业组补全
- **输入**: `04_模拟文理合并.xlsx` (45,237行×49列)
- **处理**:
  - 通过院校代码+专业代码匹配EnrollmentPlan
  - 写入: groupCode, groupName, subjects, subjectRequirements, groupPlanCount
- **输出**: EnrollmentPlan UPDATE

### Step 6: 02元数据丰富
- **院校库** (3,037所) → UPDATE University:
  - rateOfBaoYan → postgradRate (统一为百分比数值)
  - ranking → ranking
  - pointsOfShuo[0].number → masterProgramCount
  - pointsOfBo[0].number → doctoralProgramCount
- **学科评估** (5,023条) → 按schCode聚合取最高等级 → UPDATE University.disciplineEvaluationLevel
- **排名** (1,895所) → ranking=0 视为无排名
- **专业库详情** (1,884个) → UPDATE Major (男女比/就业方向)
- **满意度** (2,911所) → 需新增字段或JSON存储
- **招生章程** (2,912所) → 调档比例/专业分配规则

### Step 7: 增值数据
- **体检受限** (1,974条) → 新建 Prisma 模型 HealthRestriction
- 推荐时前置过滤: 学生体检条件 × 受限专业 → 排除

### Step 8: 验证
1. ScoreSegment: cumulativeCount 单调递增
2. AdmissionRecord: minScore ≤ avgScore ≤ maxScore
3. EnrollmentPlan: 同一专业组内选科要求一致
4. 抽样10条与01原始JSON比对
5. 推荐引擎回测: 用2025已知录取结果验证

## 技术实现

### 脚本位置
所有数据处理脚本放在 `scripts/data-processing/` 目录下，与现有 `scripts/import-data/` 并列。

### 脚本清单
```
scripts/data-processing/
  step1-score-segments.ts      # 一分一段表
  step2-batch-lines.ts         # 批次线
  step3-main-import.ts         # 03主表（适配现有import逻辑或重写）
  step4-fill-2025-gaps.ts      # 01补缺
  step5-enrollment-groups.ts   # 04专业组
  step6-enrich-metadata.ts     # 02元数据
  step7-supplementary.ts       # 增值数据
  step8-validate.ts            # 验证
  utils/
    code-mapping.ts            # 编码映射工具
    batch-name-mapping.ts      # 批次名映射
    field-selector.ts          # 按年份选择01的正确分数字段
```

### 执行顺序与依赖
```
Step 1 (一分一段) ──┐
Step 2 (批次线)   ──┤── 无依赖，可并行
                    │
Step 3 (主表导入) ──┘── 依赖Step 1/2完成后的DB状态
                    │
Step 4 (补2025) ────┤── 依赖Step 3
Step 5 (专业组) ────┤── 依赖Step 3
                    │
Step 6 (元数据) ────┤── 依赖Step 3
Step 7 (增值)   ────┤── 独立
                    │
Step 8 (验证)   ────┘── 依赖全部完成
```
