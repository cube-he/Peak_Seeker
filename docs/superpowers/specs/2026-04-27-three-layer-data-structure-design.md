# 三层分离数据结构设计

> 2026-04-27 | 状态：已确认，待实现

## 背景

数据整合已经历多轮处理，但百分百精度目标仍未达标。核心问题：

1. 专业招生主表是 48131 行 × 71 列的扁平大表，批次信息为 flat string，无层级关系
2. Prisma `Batch` enum 仅 4 个粗粒度值，无法表达 39 种招生类型
3. 三年批次结构差异巨大（2023 老高考 → 2024 过渡 → 2025 新高考），跨年对齐困难
4. 批次命名以招生考试报为权威来源，但现有数据未严格对齐

## 设计目标

- 批次树与招生考试报目录 100% 对齐
- 三层独立维护、独立校验
- 新年份数据只需更新 yearly 属性
- 批次改名只改一处（batch_tree）
- 支持高频横向查询（按分数/专业/批次筛选）

## 总体架构

```
data_output/
├── batch_tree.json            # Layer 1: 批次骨架（结构）
├── school_registry.json       # Layer 2: 院校注册（元数据）
├── enrollments.json           # Layer 3: 招生数据（事实）
└── indexes/                   # 自动派生的反向索引
    ├── by_batch.json
    ├── by_major.json
    └── by_score_bracket.json
```

主树是权威数据源，索引是缓存可随时重建。

---

## Layer 1: batch_tree.json

### 数据来源

招生考试报·高考指南 目录（物理类 + 历史类 PDF）

### 节点 Schema

```typescript
interface BatchNode {
  id: string;              // 稳定标识符，拼音缩写，如 "bktqp_a_js"
  name: string;            // 招生考试报原文名称
  order?: number;          // 投档顺序（同级内）
  subjects?: string[];     // 适用科类 ["物理","历史"]，仅叶子节点
  enrollmentType?: string; // 对应招生类型原文，仅叶子节点
  volunteer?: {
    mode: string;          // "parallel" | "sequential" | "sequential_1_2" | "sequential_1_1"
    count: number;         // 志愿个数
    desc?: string;         // 原文描述
  };
  dataStatus?: "has_data" | "no_data"; // 仅叶子节点
  children?: BatchNode[];
}
```

### 2025 四川完整树（39 叶子节点）

```
本科提前批次 [bktqp]
├── 国家专项计划 [bktqp_gjzx]           parallel×2    ✅
├── A段 [bktqp_a]                      sequential_1_2×3
│   ├── 军事类 [bktqp_a_js]                           ✅ 物理392+历史12
│   ├── 飞行技术 [bktqp_a_fxjs]                       ⚠️ 仅物理,无数据
│   ├── 公安类、司法类 [bktqp_a_gasf]                  ✅ 物理83+历史54
│   ├── 航海类 [bktqp_a_hh]                           ✅ 物理35+历史2
│   ├── 消防救援 [bktqp_a_xfjy]                       ✅ 物理5+历史2
│   ├── 高校综合评价 [bktqp_a_zhpj]                    ✅ 物理35+历史13
│   └── 其他 [bktqp_a_qt]                             ⚠️ 仅物理,无数据
├── 高校专项计划 [bktqp_gxzx]           sequential×1   ✅
└── B段 [bktqp_b]                      parallel×30
    ├── 国家公费师范生 [bktqp_b_gjgfsf]                ✅
    ├── 国家优师专项 [bktqp_b_gjyszx]                  ✅
    ├── 农村订单定向医学生 [bktqp_b_ncddyx]             ✅
    ├── 省级公费师范生 [bktqp_b_sjgfsf]                ✅
    ├── 地方优师计划 [bktqp_b_dfyszx]                  ✅
    ├── 乡村振兴计划 [bktqp_b_xczx]                    ✅
    └── 其他 [bktqp_b_qt]                             ✅

本科批次 [bkp]
├── A段 [bkp_a]                        parallel×20
│   ├── 国家专项计划 [bkp_a_gjzx]                      ✅ 物理1100+历史253
│   └── 地方专项计划 [bkp_a_dfzx]                      ✅ 物理287+历史85
├── 高校专项计划 [bkp_gxzx]             sequential_1_1×2 ✅
├── 高水平运动队 [bkp_gspyd]            sequential×1    ⚠️ 无数据
├── B段 [bkp_b]                        parallel×45
│   ├── 普通类本科 [bkp_b_pt]                          ✅ 物理18644+历史6668 (主力)
│   ├── 本科层次职业教育改革试点 [bkp_b_bkzyjy]          ✅
│   ├── 民族班 [bkp_b_mzb]                            ✅
│   ├── 非西藏生源定向西藏就业 [bkp_b_fxzyx]             ✅
│   ├── 其他定向招生 [bkp_b_qtdx]                      ⚠️ 仅物理,无数据
│   └── 部委属和外省属高校少数民族预科… [bkp_b_yk]        ✅
├── 原"少数民族语言授课为主" [bkp_smzyy]  parallel×20    ⚠️ 无数据
│   ├── 本科 [bkp_smzyy_bk]
│   └── 预科 [bkp_smzyy_yk]
├── 原"加授少数民族语文" [bkp_jsmzyw]    parallel×6     ⚠️ 无数据
├── 区域教育均衡发展专项计划 [bkp_qyjh]   parallel×20    ✅
└── 省属高校少数民族预科 [bkp_sxyk]       parallel×20    ✅

高职(专科)提前批次 [zktqp]              sequential_1_2×3
├── 定向培养军士 [zktqp_dxpyjs]                        ✅
├── 公安类、司法类 [zktqp_gasf]                        ✅
└── 航海类 [zktqp_hh]                                 ✅

高职(专科)批次 [zkp]
├── 普通类高职(专科) [zkp_pt]            parallel×45    ✅ (第二主力16639条)
├── 原"少数民族语言授课为主" [zkp_smzyy]  parallel×6     ⚠️ 无数据
└── 原"加授少数民族语文" [zkp_jsmzyw]    parallel×6     ⚠️ 无数据
```

### 物理 vs 历史差异

仅 3 个节点为物理独有：`bktqp_a_fxjs`(飞行技术)、`bktqp_a_qt`(提前批A段其他)、`bkp_b_qtdx`(本科批B段其他定向招生)。

### 决策

- 6 个无数据节点保留（结构完整性优先）
- 艺术类、体育类暂不纳入

---

## Layer 2: school_registry.json

### 数据来源

专家版主表·院校信息表（2237 所院校，90 列）

### Schema

```typescript
interface SchoolRegistry {
  meta: { count: number; source: string; year: number };
  schools: Record<string, School>; // key = 院校代码（4位字符串）
}

interface School {
  name: string;
  location: {
    province: string;        // Col02
    provinceCode: string;    // Col55
    city: string;            // Col03
    cityTier: string;        // Col04
    address: string;         // Col62
  };
  basic: {
    type: string;            // Col05 综合/理工/...
    nature: string;          // Col06 公办/民办
    authority: string;       // Col07 教育部/...
    level: string;           // Col11 本科/专科
    founded: number;         // Col41
    maleRatio: number;       // Col42
    femaleRatio: number;     // Col43
  };
  tags: {
    tier: string;            // Col08
    background: string;      // Col09
    labels: string;          // Col10
    isDoubleFirstClass: boolean; // Col12
  };
  history: {
    evolution: string;       // Col13
    mergers: string;         // Col24
  };
  ids: {
    yangguangId: string;     // Col36
    nationalCode: string;    // Col49
    schoolIdentifier: string; // Col50
    matchMethod: string;     // Col51
    matchNote: string | null; // Col52
  };
  rankings: {
    composite: number;       // Col14
    overallRank: number;     // Col57
    overallScore: number;    // Col58
    qs: number;              // Col44
    usNews: number;          // Col45
    alumni: number;          // Col46
    wushulian: number;       // Col59
    arwu: number;            // Col60
    moe: number;             // Col61
    popularity: number;      // Col56
  };
  academics: {
    masterPrograms: number;  // Col15
    doctoralPrograms: number; // Col16
    masterSubjects: string;  // Col17
    doctoralSubjects: string; // Col18
    localMaster: string;     // Col19
    localDoctoral: string;   // Col20
    postgraduateRate: number; // Col21
    postgraduateRateAlt: number; // Col47
    furtherStudyRate: number; // Col40
    assessmentGrade: string; // Col25
    assessmentSummary: string; // Col48
    doubleFirstClassCount: number; // Col63
    aClassCount: number;     // Col64
    nationalFeaturedCount: number; // Col65
    provincialFeaturedCount: number; // Col66
    doubleFirstClassSubjects: string; // Col67
    featuredMajors: string;  // Col68
  };
  admissionRules: {
    filingRatio: string | null;    // Col26
    majorAllocation: string | null; // Col27
    tiebreakRule: string | null;   // Col28
    healthRestrictions: string | null; // Col29
    adjustmentPolicy: string | null; // Col30
    foreignLanguageReq: string | null; // Col31
    subjectScoreReq: string | null; // Col32
    bonusPolicy: string | null;    // Col33
    tuition: string | null;        // Col34
    majorTransfer: string | null;  // Col22
    majorTransferRestrictions: string | null; // Col35
  };
  links: {
    admissionGuide: string;  // Col23
    officialSite: string;    // Col37
    admissionSite: string;   // Col38
    phone: string;           // Col39
    logo: string;            // Col53
    banner: string;          // Col54
  };
  satisfaction: {
    overall: { score: number; count: number; stars: number[] };     // Col69-75
    living: { score: number; count: number; stars: number[] };      // Col76-82
    environment: { score: number; count: number; stars: number[] }; // Col83-89
  };
}
```

全部 90 列零遗漏。

---

## Layer 3: enrollments.json

### 数据来源

专家版主表·专业招生主表（48131 条，71 列）

### Schema

```typescript
interface EnrollmentsFile {
  meta: {
    source: string;
    batchTreeRef: string;
    schoolRegistryRef: string;
    totalRecords: number;
    schools: number;
  };
  data: Record<string, SubjectEnrollments>; // key = 院校代码
}

type SubjectEnrollments = Record<string, Enrollment[]>; // key = "物理" | "历史"

interface Enrollment {
  batchNodeId: string;       // 引用 batch_tree 节点 ID
  batchName: string;         // 冗余可读：完整批次路径
  enrollmentType: string;    // Col09 招生类型原文
  groups: MajorGroup[];
}

interface MajorGroup {
  groupCode: string;         // Col03 专业组代码
  subjectReq: string;        // Col19 选科要求
  note: string | null;       // Col17 院校/专业组备注
  groupYearly: {
    "2025"?: {
      groupPlan: number;     // Col20
      filingMin: number;     // Col24
      filingMinRank: number; // Col25
      groupEnrolled: number; // Col26
      groupMin: number;      // Col27
      groupMinRank: number;  // Col28
    };
    "2024"?: {
      batchEnrolled: number; // Col38 (2024无专业组,此为院校批次级)
      batchMin: number;      // Col36
      batchMinRank: number;  // Col37
    };
  };
  majors: Major[];
}

interface Major {
  code: string;              // Col04
  name: string;              // Col12
  fullName: string;          // Col13
  category: string;          // Col14 专业类
  discipline: string;        // Col15 门类
  majorNote: string | null;  // Col16
  isNew: boolean;            // Col18
  duration: number;          // Col22
  tuition: number;           // Col23
  oldBatch: string;          // Col07 2024年批次名（逐专业可能不同）
  oldBatch2: string;         // Col08 2023年批次名（逐专业可能不同）
  quality: MajorQuality;
  yearly: Record<string, YearlyData>; // key = "2025" | "2024" | "2023" | "2022"
}

interface MajorQuality {
  rating: string | null;     // Col62 软科评级
  rank: number | null;       // Col63 软科排名
  assessment: string | null; // Col64 学科评估
  level: string | null;      // Col65 专业水平
  isNationalFeatured: boolean; // Col66
  majorRank: number | null;  // Col67
  honor: string | null;      // Col68
  masterPoint: string | null; // Col69
  doctoralPoint: string | null; // Col70
}

interface YearlyData {
  plan?: number;             // 计划人数
  enrolled?: number;         // 录取人数
  min?: number;              // 最低分
  minRank?: number;          // 最低位次
  avg?: number;              // 平均分
  avgRank?: number;          // 平均位次
  max?: number;              // 最高分
  maxRank?: number;          // 最高位次
  supplementary?: SupplementaryRound[]; // 征集志愿（可选）
}

interface SupplementaryRound {
  round: number;             // 实际轮次号（可不连续，如只有round 2）
  plan: number;              // 该轮计划数（含可能的新增计划，不假设递减）
  enrolled?: number;
  min?: number;
  minRank?: number;
  avg?: number;
  avgRank?: number;
  max?: number;
  maxRank?: number;
}
```

### 列映射汇总

| 层级 | 有效字段 | 来源列 |
|---|---|---|
| root key | 1 | Col01 院校代码 |
| 科目 key | 1 | Col06 |
| enrollment | 3 | Col05→batchNodeId + batchName(冗余) + Col09 |
| group | 2+8 | Col03/19 + Col17 + Col20/24-28/36-38 |
| major·基本 | 11 | Col04/07/08/12-16/18/22-23 |
| major·quality | 9 | Col62-70 |
| major·yearly | 30 | Col21/29-35 + Col39-46 + Col47-54 + Col55-61 |
| **丢弃** | **2** | Col00(恒2025), Col02(在registry) |
| 合计 | **69 有效** | |

---

## 反向索引

### by_batch.json

按 batchNodeId 聚合所有院校概要，支持"该批次有哪些学校"查询。

### by_major.json

按专业类(Col14)聚合所有院校及分数，支持"哪些学校开了计算机类"查询。

### by_score_bracket.json

按位次分段（如 0-1000, 1000-5000, 5000-10000...），每段列出对应专业，支持"我这个分能上什么"查询。

### 生成原则

- 索引从主树自动派生，脚本一键重建
- 索引不存独有数据，删除后可重建
- 主树更新后必须重建索引

---

## 设计审查修正记录

| # | 问题 | 原设计 | 修正 | 依据 |
|---|---|---|---|---|
| 1 | oldBatch 层级 | enrollment级 | major级 | 226/5246 enrollment 内不一致 |
| 2 | schoolNote 层级 | enrollment级 | group级(note) | 仅1/11626 group 内不一致 |
| 3 | 选科要求不一致 | — | 管道中按选科拆分groupCode | 41个高校专项组内不一致 |
| 4 | 2024 groupYearly | groupMin | batchMin | 2024无专业组概念 |
| 5 | 投档顺序A段分歧 | — | 无需修正 | batch_tree叶子已区分 |
| 6 | 征集志愿 | 无 | major.yearly.supplementary[] | 支持多轮、不连续、不递减 |

---

## 数据验证基线

| 维度 | 数量 |
|---|---|
| 院校 | 2237 |
| 科类 | 2（物理 32260 / 历史 15871） |
| 录取批次 | 11 |
| 招生类型 | 24 |
| 批次树叶子 | 39（33有数据 + 6保留） |
| 专业招生主表记录 | 48131 |
| 院校信息表列 | 90（全映射） |
| 专业招生主表列 | 71（69有效 + 2丢弃） |
