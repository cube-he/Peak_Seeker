# 学生资料阶段选定批次 + 意向 picker 硬过滤 + 老师按批次出方案 设计

**日期**: 2026-06-02
**关联**: student profile / candidate-pool / volunteer plan
**触发**: 商业化流程需要在学生填资料时确定方案批次,意向 picker 和老师生成方案严格按批次走

## 一、问题与目标

### 当前痛点
1. 批次决策晚:学生填资料时只填"意向批次"(`preferredBatches`,软偏好,多选),真正确定批次发生在**老师生成方案时手选 batchConfigId**。
2. 意向 picker 不分批次:学生填意向专业/院校时,picker 显示**所有院校/专业**,可能填进根本不在意向批次招生的院校。
3. 系统不帮学生判断:学生不清楚自己能填哪些批次(分数线 + 户籍 + 体检等硬资格),全靠老师面谈解释。
4. 老师可随意选批次:可能为学生没选定的批次出方案,服务流程不规范。

### 目标
1. 学生填资料阶段**主动选定**要做方案的批次(多选,每批一个方案)。
2. 系统根据学生资料(总分 + 选科 + 户籍 + 政治面貌 + 体检等)**自动判定**每个批次的可填资格,前端引导。
3. 意向 picker 按选定批次**硬过滤**院校 / 专业(只显示在该批次招生的)。
4. 资料提交后批次**锁定**,老师可解锁。
5. 老师生成方案**严格**只能为学生选定的批次出方案。

## 二、四川 2025 高考批次规则(deep-research 调研)

> 数据来源:四川省教育考试院 `sceea.cn` 2025 年招生工作通知 / 实施方案 / 招生计划合订本。

### 控制线(2025 年实际公布)

| 类型 | 物理类 | 历史类 |
|---|---|---|
| 本科批控制线 | 438 | 467 |
| 特殊类型控制线 | 518 | 533 |
| 专科批控制线 | 150 | 150 |

特殊类型控制线用于:强基计划、高校专项、军队院校军事类专业、本科提前批 A 段等。

### 6 个批次详细规则

#### 1. 本科批 A 段(含国家专项 / 地方专项)

- **分数门槛**: 总分 ≥ 本科批控制线(物理 438 / 历史 467)
- **志愿数**: 平行志愿 20 个院校专业组 × 6 专业
- **选科**: 物理 / 历史均可
- **硬资格** (仅当院校组属于专项计划):
  - **国家专项**: 户籍县 ∈ **119 县实施区域**(附件 2) + 实施区域户籍 ≥3 年 + 当地高中学籍 ≥3 年并实际就读 + 父/母/法定监护人当地户籍; **不限城乡**(实施区域内城镇/农村户籍均可)
  - **地方专项**: 户籍县 ∈ **119 县实施区域**(附件 2) + **必须农村户籍** + 同上学籍要求
- **典型院校**: 综合大学 + 国家/地方专项院校

#### 2. 本科批 B 段(含高校专项)

- **分数门槛**: 总分 ≥ 本科批控制线 (高校专项内部分数原则上 ≥ 特殊类型控制线)
- **志愿数**: 平行志愿 45 个院校专业组 × 6 专业
- **硬资格** (仅高校专项): 户籍县 ∈ **119 县实施区域**(附件 2) + **农村户籍** + 实施区域户籍 / 学籍 ≥3 年
- **典型院校**: 综合大学(含较多省属) + 高校专项院校

#### 3. 本科提前批 A 段

- **分数门槛**: 总分 ≥ 特殊类型控制线 (物理 518 / 历史 533)
- **志愿模式**: **顺序志愿** — 1 个第一志愿 + 2 个平行第二志愿,每组 6 专业
- **硬资格** (按子类不同):
  - **军队院校**: 未婚 + 年龄 16-20 (截至 2025/8/31) + 高中体测及格以上 + 政考 / 面试 / 体检
  - **公安院校**: 年龄 16-22 (2003-09-01 至 2009-08-31) + 6 月 10-15 日到派出所政考 + 体检
  - **司法/航海/消防/综合评价**: 各自体检 + 政考要求
- **典型院校**: 军校、警校、司法院校、综合评价(强基外的)

#### 4. 本科提前批 B 段

- **分数门槛** (按子类区分,调研未给出整批统一门槛):
  - **免费医学(农村订单定向)** ✅ 有出处: 投档线 = **本科批控制线**(物理 438 / 历史 467),线上生源不足时可在本科线**下 20 分内降分投档**(依据 sceea.cn Newsdetail_4325)
  - **国家公费师范 / 国家优师专项 / 省级公费师范 / 地方优师 / 乡村振兴等子类** ⚠ **deep-research 未直接验证统一门槛**,实施时按当年招生计划合订本 / 各项目章程为准。**保守按本科批控制线作 spec 默认值**
- **志愿数**: 平行志愿 30 个院校专业组 × 6 专业 + 是否服从专业调剂(明确依据 Newsdetail_4325)
- **硬资格** (按子类不同):
  - **免费医学(农村订单定向)** ✅: 户籍县 ∈ 119 县实施区域(附件 2) + **农村户籍** + 本人 + 父/母/监护人 + 连续 3 年户籍
  - **省级公费师范** ✅: 户籍县 ∈ **143 县省级公费师范实施范围**(附件 4) + 第一轮限本县考生
  - **乡村振兴计划** ✅: 户籍县 ∈ **88 县乡村振兴实施范围**(附件 5) + 第一轮限本县考生
  - **地方优师**: 限实施区域内本县(市、区)考生(依据 Newsdetail_4261)
  - **国家公费师范 / 国家优师专项**: 报名条件按具体院校章程,核心要求毕业后履约任教(参考附件 3 任教范围分配表)
- **典型院校**: 师范定向、免费医学、地方优师、乡村振兴

#### 5. 高职(专科)提前批

- **分数门槛**: 多数项目 ≥ 专科批控制线 (150),部分(军士、公安专科)更高
- **志愿数** ✅ 招生计划文件附表确认: **顺序志愿 — 1 个第一志愿 + 2 个平行第二志愿,每组 6 专业**(同本科提前批 A 段)
- **硬资格** (按子类不同):
  - **定向培养军士**: 政考 + 体检
  - **公安专科**: 政考 + 体检 + 户籍
  - **司法警院专科 / 空中乘务**: 面试 + 体检
- **典型院校**: 军士培养、公安专科、司法警院、空乘

#### 6. 高职(专科)批

- **分数门槛**: 总分 ≥ 专科批控制线 (150)
- **志愿数** ✅ 招生计划文件附表确认: **平行志愿 45 个院校专业组 × 6 专业**(与本科批 B 段同结构)
- **硬资格**: 无特殊
- **典型院校**: 绝大多数高职高专普通招生

### 录取顺序

强基计划 → 艺术本科提前批 → 本科提前批国家专项 → 本科提前批 A 段 → 本科提前批高校专项 → 艺体本科批 → 本科提前批 B 段 → 本科批 A 段(含国家专项 / 地方专项) → 本科批高校专项 → 高水平运动队 → **本科批 B 段** → 高职提前批 → 高职批

## 三、数据模型

### StudentProfile 字段改动

| 字段 | 现状 | 改动 |
|---|---|---|
| `preferredBatches: Json?` | 意向批次(软偏好,字符串数组,如 `["本科批A段","本科批B段"]`) | **语义升级** 为"已选定要做方案的批次"; 类型不变 |
| `batchesConfirmedAt: DateTime?` | **新增** | 学生提交资料且批次锁定的时间戳; null 表示未锁定可编辑 |
| `batchesUnlockedBy: Int?` + `batchesUnlockedAt: DateTime?` | **新增** | 老师解锁时记录(审计) |

### BatchConfig 字段扩展

`batchConfigs.eligibilityRules` 是已有的 `Json?` 字段(看 schema 已存在),用来存判定规则。**新增**填入数据:

```json
{
  "scoreFloor": {                  // 分数门槛
    "type": "BATCH_LINE" | "SPECIAL_LINE" | "ZHUANKE_LINE",
    "leniency": 0 | 20             // 线下 N 分内允许 (本科提前批B段免费医学场景)
  },
  "examTypes": ["物理", "历史"],     // 允许选科
  "volunteerMode": "PARALLEL" | "SEQUENTIAL",
  "hardEligibility": [              // 硬资格规则
    {
      "scope": "ALL" | "SUBSET",   // ALL 整批所有院校都要满足; SUBSET 仅该批的某子类
      "subset": "国家专项" | "地方专项" | "免费医学" | "军校" | "公安" | null,
      "rule": "RURAL_HOUSEHOLD" | "AGE_RANGE_16_20" | "AGE_RANGE_16_22" | "POLITICAL_REVIEW_REQUIRED" | "PHYSICAL_EXAM_REQUIRED" | ...,
      "params": {}                 // 额外参数(如 ageRange: [16, 20])
    }
  ],
  "softRecommendation": [           // 软建议(不阻止填,但显示)
    {
      "rule": "SUGGEST_TOTAL_GE_BATCH_LINE_PLUS_20",
      "message": "建议总分超本科线 20 分以上"
    }
  ]
}
```

### 新 helper module: `apps/server/src/modules/batch/batch-eligibility.ts`

负责:
1. 算"学生资料 × 批次"的可填状态:`ELIGIBLE` / `CONDITIONAL` / `INELIGIBLE`
2. 给出每个判定项的人话解释(老师 / 学生看)

```typescript
export type BatchEligibilityVerdict = 'ELIGIBLE' | 'CONDITIONAL' | 'INELIGIBLE';

export interface BatchEligibilityResult {
  batchConfigId: number;
  batch: string;
  examType: string;
  verdict: BatchEligibilityVerdict;
  reasons: Array<{
    type: 'SCORE_PASS' | 'SCORE_FAIL' | 'SCORE_DOWN_TOLERANCE' |
          'HARD_FAIL' | 'HARD_PARTIAL' | 'SOFT_HINT';
    message: string;   // 人话解释
    subset?: string;   // 仅适用于某子类时
  }>;
}

export async function judgeBatchEligibility(
  student: StudentProfile,
  batchConfig: BatchConfig,
  batchLine: BatchLine | null,    // 当年最新线
): Promise<BatchEligibilityResult>;
```

判定逻辑(伪代码):

```
1. 选科: student.examType 不在 batchConfig.examTypes → INELIGIBLE (硬过滤)
2. 分数门槛:
   - 看 eligibilityRules.scoreFloor.type → 拿对应 batchLine.score
   - 学生总分 ≥ 线 → SCORE_PASS
   - 总分 ∈ [线-leniency, 线) → SCORE_DOWN_TOLERANCE (CONDITIONAL)
   - 总分 < 线-leniency → SCORE_FAIL → INELIGIBLE
3. 硬资格 (rule scope === 'ALL'):
   - 不满足 → INELIGIBLE
   - 满足 → 继续
4. 硬资格 (rule scope === 'SUBSET'):
   - 不满足 → 仅该子类不可填, 整批仍 CONDITIONAL (附 reason)
   - 满足 → ELIGIBLE 该子类
5. 软建议: 附加 reason 但不影响 verdict
```

### 现有数据迁移

`preferredBatches` 已存在的学生数据(扁平字符串数组)**不变形状**。新增 `batchesConfirmedAt` / `batchesUnlockedBy` / `batchesUnlockedAt` 全部初始 null(向后兼容)。

新增一个**种子脚本** `scripts/seed-batch-eligibility-rules.ts` 一次性把上面 6 个批次的 `eligibilityRules` 填入 `batch_configs` 表。

## 四、Backend 改动

### 1. `StudentService.updateMyProfile` / `updateById`(已有,微改)

- 当 `preferredBatches` 字段被更新且 `intakeStatus` 从 `DRAFT` 切到 `SUBMITTED` 时,自动写 `batchesConfirmedAt = now()`
- 已是 SUBMITTED 状态时不允许直接改 `preferredBatches`(返回 403 / 提示需老师解锁)

### 2. 接口设计 (统一路径)

**改造现有**: `GET /students/:id/eligible-batches` 已存在 (return EligibleBatch[]), 但返回结构是老的"批次 list"。
本期升级返回结构为 `BatchEligibilityResult[]` (含 verdict + reasons), 路径不变避免破坏其他调用方。

**新增**:

```
POST /students/:id/unlock-batches        → 老师解锁批次
                                            权限: 学生所属老师 + 主管 + admin
                                            副作用: batchesConfirmedAt=null, 记 batchesUnlockedBy/At
```

**学生提交锁定** 不需要专用接口 — 沿用现有 intake submit 流程:
- 现有 `PUT /students/me/intake-submit` (或类似命名,核对 student.controller.ts)
- 服务端在 intakeStatus 从 DRAFT 切到 SUBMITTED 时, 副作用写 `batchesConfirmedAt = now()`
- **校验**: intake submit 时如果 `preferredBatches` 为空数组 / null → 抛 400 "请至少选定 1 个批次"

### 3. picker-options 接口 — **新增 batch 过滤参数**

`/universities/picker-options` + `/majors/picker-options` 加 query 参数 `?batches=本科批A段,本科批B段`:

- 若传 batches,过滤为"在该学生 province + 任一 batches 下有 EnrollmentPlan 的院校 / 专业"
- 不传时回退到现有行为(在川招生院校全集)
- 缓存策略:URL key 加 batches → 不同批次组合的 cache 独立

学生 profile 编辑页调用 picker-options 时,从当前 `preferredBatches` 拼 query string 传过去。

### 4. 候选池 — `getCandidateGroups` 校验

`PlanCandidateService.getCandidateGroups` 入口处:

- 拿到 plan 的 batchName,检查是否在学生 `preferredBatches` 列表里
- **不在** → 抛 400 错误:"该 plan 的批次未被学生选定,请要求学生先在资料阶段勾选"
- (老师强制需求时走解锁流程)

### 5. plan 创建 — `createForStudent` 校验

`PlanService.createForStudent(studentId, { batchConfigId })`:

- 取 batchConfigId 对应的 BatchConfig
- 检查 batch (string) 是否在 student.preferredBatches 里
- **不在** → 抛 400:"该批次未被学生选定"

## 五、Frontend 改动

### 1. 学生 profile 编辑页 — 批次选择控件

**位置**:`apps/web/src/components/student/sections/` 新增 `BatchSelectionSection.tsx`(独立 section)

**UI 形态**:

```
┌─────────────────────────────────────────────────────┐
│ 选定要做方案的批次 (多选,每个选定批次老师为你做一个方案) │
├─────────────────────────────────────────────────────┤
│ ☑ 本科批 A 段   [✓ 可填] 本科线 438 ≥ 438 物理        │
│                  含国家/地方专项,部分需农村户籍       │
│                                                     │
│ ☐ 本科批 B 段   [✓ 可填] 本科线 438 ≥ 438            │
│                  含高校专项,高校专项需农村户籍       │
│                                                     │
│ ☐ 本科提前批 A 段 [⚠ 条件可填] 特殊线 518 ≥ 518      │
│                  需要军校 / 警校 政考 + 体检         │
│                                                     │
│ ☑ 本科提前批 B 段 [✓ 可填] 本科线 438 ≥ 438          │
│                  免费医学需农村户籍                  │
│                                                     │
│ ☐ 高职提前批     [✓ 可填] 专科线 150 ≥ 150           │
│                  💡 你的分数已超本科线 200+,通常无需 │
│                                                     │
│ ☐ 高职(专科)批   [✓ 可填] 专科线 150 ≥ 150           │
│                                                     │
│ ───────────────────────────────────────────────────│
│ ⚠ 注意:批次锁定后无法修改,如需调整请联系老师        │
│ [保存草稿]  [提交锁定]                              │
└─────────────────────────────────────────────────────┘
```

- 每个批次 chip 显示 (与 BatchEligibilityVerdict 严格对应):
  - **ELIGIBLE** → ✓ 可填 (chip 可勾选,正常颜色)
  - **CONDITIONAL** → ⚠ 条件可填 (chip 可勾选,黄色边框,勾选时弹窗确认软提示)
  - **INELIGIBLE** → 🚫 不可填 (chip 灰显且**禁用勾选**)
- SOFT_HINT 不改变 verdict, 只在 chip 下方加 💡 提示文案(如"分数远超本科线,通常无需考虑专科批")
- 点击 chip 展开看完整 reasons 列表 (分数差、硬资格列表、软提示)
- 提交锁定后 chip 变成只读 (含勾选状态)
- 已锁定时顶部显示提示:"批次已锁定,如需调整请联系老师解锁"
- **校验**: 提交按钮 disabled 当 prefBatches 长度为 0 (至少必须勾选 1 个批次才能提交)

**数据流**:
- 进页面 GET `/students/me/eligible-batches` (升级版返回 `BatchEligibilityResult[]`), 拿到 6 个判定
- 用户勾选 → 本地 state 暂存(不立刻 commit, 避免每次勾选都发请求)
- 点"保存草稿" → autosave `preferredBatches` (intakeStatus 不变, batchesConfirmedAt 保持 null)
- 点"提交锁定" → 校验非空 → 调 `PUT /students/me/intake-submit` (现有接口) → 后端副作用写 `intakeStatus = SUBMITTED` + `batchesConfirmedAt = now()`

### 2. 学生意向 picker 硬过滤

`PreferredMajorTierEditor` 内部使用 `useMajorOptions`,改成 `useMajorOptions(batches)`:

```typescript
export function useMajorOptions(batches?: string[]) {
  const queryKey = ['picker-options', 'majors', batches?.sort().join(',') ?? ''];
  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => pickerApi.majors({ batches }),
    staleTime: Infinity,
  });
  // ...
}
```

**改造范围** (需要 batches 过滤的 picker 入口):
- `useMajorOptions(batches?: string[])` — 给 `PreferredMajorTierEditor`、`PreferenceSection` 意向专业
- `useUniversityOptions(batches?: string[])` — 给意向院校 `AutoSavePicker`
- 其他 picker (省份 / 城市 / 批次自身 / 标签) 不改

**调用方修改**:
- `PreferenceSection.tsx`:意向专业 `<PreferredMajorTierEditor>` 内部的 `useMajorOptions()` 调用,接受 `student.preferredBatches` 传过去
- `PreferenceSection.tsx`:意向院校 / 排除院校 的 `<AutoSavePicker>` 调用,把 `useUniversityOptions` 改为 `() => useUniversityOptions(profile.preferredBatches)`

**老师端学生详情页** `students/[id]/page.tsx` 的 `PreferenceFields` 同步改 (复用 `PreferredMajorTierFormItem` 已接 batches 即可)

### 3. 老师端 — 解锁批次按钮

`apps/web/src/app/(teacher)/teacher/students/[id]/page.tsx` profile tab,在「批次选择」展示区(只读)旁边加一个「解锁」按钮(仅 `batchesConfirmedAt != null` 时显示):

- 点击 → 二次确认弹窗:"解锁后学生可重新调整批次, 已生成的方案不变"
- 确认 → POST `/students/:id/unlock-batches`

### 4. 老师生成方案页 — 严格按学生选定批次

`apps/web/src/app/(teacher)/teacher/plans/generate/[studentId]/page.tsx` 现有的 batch picker:

- 选项仅列学生 `preferredBatches`(从 student 拉)
- 学生未选任何批次时 → 整页 placeholder:"学生还未确定批次, 请提醒学生在资料阶段勾选"
- 已锁定时 batch picker 默认选中学生勾的批次

### 5. 候选池现有 plan 加入校验

候选池现有 query 已经带 planId,后端会校验 plan.batchName ∈ student.preferredBatches。前端遇到 400 错误时显示 banner 引导。

## 六、批次判定算法的具体规则

### 分数门槛(全 6 个批次)

| 批次 | 规则 |
|---|---|
| 本科批 A 段 | `totalScore >= batchLine[year][province][batch=本科批次][examType]`(历史 467 / 物理 438) |
| 本科批 B 段 | 同上 |
| 本科提前批 A 段 | `totalScore >= batchLine[特殊类型招生控制线][examType]`(历史 533 / 物理 518) |
| 本科提前批 B 段 | **本期保守**: `totalScore >= 本科批控制线[examType]`(物理 438 / 历史 467)。免费医学子类额外:`>= 本科线-20 → 条件可填(降分)`,`>= 本科线 → 可填`。其他子类(公费师范等)的具体门槛 deep-research 未深入,实施时 CONDITIONAL + SOFT_HINT 提示老师面谈核实 |
| 高职提前批 | `totalScore >= batchLine[高职(专科)批次]`(150) |
| 高职批 | 同上 |

### 硬资格(scope=ALL)— 整批硬卡

| 批次 | 硬资格 |
|---|---|
| 本科批 A 段(主体) | 无(对所有院校都填的话) |
| 本科批 B 段(主体) | 无 |
| 本科提前批 A 段 | 多数院校需要政考 / 体检 → 加 SOFT_HINT 提示老师面谈 |
| 本科提前批 B 段 | 无 |
| 高职提前批 | 多数需要面试 / 体检 → 加 SOFT_HINT |
| 高职批 | 无 |

### 硬资格(scope=SUBSET)— 子类 chip 阻止

| 子类 | 所属批次 | 资格规则 | 实施区域 |
|---|---|---|---|
| 国家专项 | 本科批 A 段 | 户籍县 ∈ 名单 + 连续 3 年户籍 / 学籍(不限城乡) | 附件 2 (119 县) |
| 地方专项 | 本科批 A 段 | 户籍县 ∈ 名单 + 农村户籍 (`isRural === true`) + 连续 3 年户籍 / 学籍 | 附件 2 (119 县) |
| 高校专项 | 本科批 B 段 | 户籍县 ∈ 名单 + 农村户籍 + 连续 3 年户籍 / 学籍 | 附件 2 (119 县) |
| 免费医学 | 本科提前批 B 段 | 户籍县 ∈ 名单 + 农村户籍 + 连续 3 年户籍 | 附件 2 (119 县) |
| 省级公费师范 | 本科提前批 B 段 | 户籍县 ∈ 名单 + 第一轮限本县考生 | 附件 4 (143 县) |
| 乡村振兴 | 本科提前批 B 段 | 户籍县 ∈ 名单 + 第一轮限本县考生 | 附件 5 (88 县) |
| 军队院校 | 本科提前批 A 段 | 年龄 16-20 + 未婚(从 examYear 推算) | — |
| 公安院校 | 本科提前批 A 段 | 年龄 16-22 | — |

> ✅ **StudentProfile 字段已齐全(确认 schema)**:
> - `birthDate: DateTime?` — 出生日期, 用于精确算年龄(军校 16-20 / 公安 16-22)
> - `county: String?` — 户籍县, 用于实施区域判定 (国家专项 / 地方专项 / 高校专项 / 免费医学 / 省级公费师范 / 乡村振兴)
> - `examLocationCounty: String?` — 高考所在地县(辅助参考, 专项计划主要看户籍县)
> - `isRural: Boolean` — 农村户籍标记
> - `politicalStatus: PoliticalStatus?` — 政治面貌
> - `physicalLimits: Json?` — 身体限制
>
> 仍未有:户籍连续年限(可通过户籍变更记录补,但本期作为 SOFT_HINT)、政考通过状态(由老师人工核实)。
>
> "户籍县 ∈ 名单" 判定时, 用 `student.county` 跟 `BatchConfig.eligibilityRules.params.regions` 比对。本期 seed 4 个核心名单(附件 2 / 4 / 5 / 6)。
> county 缺失(`null`) / 不在名单 → SOFT_HINT,不阻止勾选,提醒老师面谈核实。
> 年龄超出范围(如 ≥21 报军校): HARD_FAIL,该子类 chip 禁用勾选 + reason "年龄不符合军队院校 16-20 周岁要求"。

### 软建议

- 总分 ≥ 本科线 + 50 时:专科批显示"分数较高, 通常不建议"
- 物理类填历史专业组 / 反之:硬过滤(已有逻辑)
- 学费预算 / 民办接受度:不在批次判定范围(已在候选池处理)

## 七、API 变更摘要

### 新增

- `POST /students/:id/unlock-batches` — 老师解锁 (path 与 student detail 一致)

### 修改

- `GET /students/:id/eligible-batches` — 返回结构升级为 `BatchEligibilityResult[]` (路径不变)
- `PUT /students/me/intake-submit` (现有 submit 接口) — 副作用写 `batchesConfirmedAt = now()`; 校验 `preferredBatches` 非空, 否则 400
- `GET /universities/picker-options` + `GET /majors/picker-options` — 加 `?batches=xxx,yyy` 过滤
- `POST /plans/student/:id` 创建 plan — 校验 batchConfigId 在学生选定批次里
- `GET /plans/:id/candidate-groups` — 校验 plan.batchName 在学生选定批次里(防越权)

## 八、测试

### Backend

`batch-eligibility.spec.ts` 覆盖每种规则:
- 分数 ≥ 线 → ELIGIBLE
- 分数 ∈ [线-20, 线) → CONDITIONAL with leniency
- 分数 < 线-leniency → INELIGIBLE
- 选科不匹配 → INELIGIBLE
- 子类硬资格不满足 → CONDITIONAL with subset 标记
- 多个 reason 合并

`plan-candidate.service.spec.ts` 增量:
- plan.batchName 不在 student.preferredBatches → 抛 400
- 学生没选任何批次 + plan 已存在 → 兜底(向后兼容老 plan)

`picker-options.spec.ts`:
- 不传 batches → 现有行为
- 传 `batches=本科批A段` → 只返回该批次有 EP 的院校 / 专业
- 传 `batches=本科批A段,本科批B段` → 两个批次并集

### Frontend

`BatchSelectionSection.test.tsx`:
- 渲染 6 批次 + 判定状态
- 勾选触发 onChange
- 提交锁定状态变只读
- 已锁定时显示老师解锁引导

`PreferredMajorTierEditor` 在 batches 不同时 options 变化测试

## 九、上线 checklist

整体规模较大 (估计 15-18 task), 建议**拆 2 个 implementation plan**:

**Plan A: Backend 基础设施 + 数据** (10-11 task)
1. ✅ 调研完成(deep-research 6 批次规则)
2. ✅ 招生计划合订本验证(物理类附表 + 附录 6 县名单)
3. Prisma migration:加 `batchesConfirmedAt` / `batchesUnlockedBy` / `batchesUnlockedAt` 字段
4. **OCR/提取 4 个高优先级附件(2/4/5/6)的县名单** → `data/seed/batch-region-counties.json` (历史类合订本同期补)
5. Seed 脚本 `seed-batch-eligibility-rules.ts`:把 6 批次的 eligibilityRules + 县名单写入 `batch_configs`
6. `batch-eligibility.ts` helper + spec (TDD) — 含 `RURAL_HOUSEHOLD_IN_REGION` rule
7. `GET /students/:id/eligible-batches` 升级返回结构
8. `PUT /students/me/intake-submit` 副作用 + 校验
9. `POST /students/:id/unlock-batches` 新接口
10. picker-options 加 batches 过滤 (uni + major)
11. 候选池 / plan 创建 加入校验 (含 feature flag 兼容)
12. Backend build + 部署 + 抽样验证

**Plan B: Frontend 接入** (7-8 task)
1. 学生 profile `BatchSelectionSection` 组件 + test
2. 接到学生 profile 编辑页 (替换 / 隐藏旧 preferredBatches AutoSavePicker)
3. 提交锁定流程 + 校验
4. 意向 picker 硬过滤 (useUniversityOptions / useMajorOptions 加 batches 参数)
5. 老师端学生详情页:批次显示区 + 解锁按钮
6. 老师端生成方案页:batch picker 限定为学生选定批次
7. 现有 plan 不匹配的 banner 引导
8. Web build + 部署 + 三角色 e2e

## 十、风险与回滚

- **现有 plan 兼容** (现有方案 vs 学生选定批次不匹配):
  - 学生 `preferredBatches` 为 null / [] (未升级状态) → 候选池 / 加入校验**全跳过**(老数据兼容,沿用旧行为)
  - 学生 `preferredBatches` 非空且 `batchesConfirmedAt` 非 null (已锁定) → 候选池查询会校验 plan.batchName ∈ preferredBatches; **不在则抛 400**, 引导老师"该方案的批次未被学生选定,请要求学生先在资料阶段勾选或联系主管解锁"
  - **老 plan 兼容期** (第一波部署后 1-2 周): 加 feature flag `STRICT_BATCH_VALIDATION` 默认关闭, 仅 log 警告不抛错; 数据团队推动学生补全 preferredBatches; 全部学生补全后开启 flag
- **picker 缓存膨胀**:同一学生选不同批次组合的 picker URL 不同, cache 多份。但 batches 集合有限(2^6 = 64 种), 缓存大小可控。
- **资格判定不准**:age / 户籍连续年限等字段 StudentProfile 暂没有 → 这些规则降级为 SOFT_HINT, 提醒老师面谈, 不阻止勾选。
- **解锁后已生成的方案怎么办**:不动(保留),但可能跟新批次不一致 → UI 上加红 banner 提示"该方案的批次已不在学生当前选定列表里"。
- **本科提前批 B 段 公费师范类子类分数门槛精度不足**:deep-research 未直接验证非免费医学子类(公费师范、地方优师、乡村振兴等)的统一分数门槛。本期实施时按"本科批控制线"作保守默认值,verdict 给 CONDITIONAL + SOFT_HINT,提醒老师按当年各项目章程核实。后续可补查针对性章程精化。
- **高职提前批分数门槛低 confidence**:调研 confidence=medium,实施时同样 CONDITIONAL + SOFT_HINT,引导老师核实。

## 十一、不在本次范围

- 强基计划 / 艺术 / 体育 / 民语 / 加授民文 / 高水平运动队 等特殊批次(后续补)
- 学生**修改**批次的工作流改进(只先实现"老师解锁"机制)
- 学生看到候选池(目前候选池是老师专属页面,不涉及)
- 多省份适配(本期只覆盖四川,代码层面留 province 参数,实际只 seed 四川规则)
- ~~StudentProfile 补字段:出生日期 / 户籍连续年限 / 政考状态 / 体检结论~~
  - ✅ 已确认 schema 现有: `birthDate` / `county` / `examLocationCounty` / `isRural` / `politicalStatus` / `physicalLimits`
  - 仍缺(后续可补): 户籍连续年限 / 政考通过状态 / 体检结论(由老师人工核实)

## 十三、附录数据(2025 招生计划合订本)

数据源:`data/招生考试报/物理类/物理2025招生计划.pdf` 第 3 页附件列表(同期历史类合订本应有对应附录,本期先以物理类为准 seed)。

| 附件号 | 名称 | 县数 | spec 用途 | seed 优先级 |
|---|---|---|---|---|
| 附件 1 | 原集中连片特困地区 + 原国家级扶贫开发重点县 | 68 | 历史政策参考 | 低 |
| **附件 2** | 民族地区 + 集中连片特困地区 + 革命老区 + 藏羌边远地区 | **119** | **国家专项 / 地方专项 / 高校专项 / 免费医学 的实施区域** | 🔥 高 |
| 附件 3 | 部属师范本研衔接公费教育分专业履约任教范围分配表 | — | 国家公费师范履约任教提示 | 中 |
| **附件 4** | 省级公费师范生实施范围 | **143** | **省级公费师范子类硬资格** | 🔥 高 |
| **附件 5** | 乡村振兴实施范围 | **88** | **乡村振兴子类硬资格** | 🔥 高 |
| 附件 6 | 原深度贫困县 | 45 | 历史政策参考 | 低 |

### Seed 数据

✅ **初稿已生成**: `data/seed/batch-region-counties.json`

- **附件 2 (119 县)**: 18 地市完整结构提取, 共 118 县(差 1, 需老师人工核对 1 县遗漏)
- **附件 4 (143 县)**: 12 地市部分县,**PARTIAL** 需补全
- **附件 5 (88 县)**: 12 地市部分县,**PARTIAL** 需补全
- **附件 6 (45 县)**: ✅ **完整提取,数量与公告一致**(4 地市:乐山 3 + 阿坝 13 + 甘孜 18 + 凉山 11)

### Seed 实施流程

1. 数据已在 `data/seed/batch-region-counties.json` (初稿,标 `verificationStatus: INITIAL_DRAFT`)
2. 实施 Plan A 时新增 task: **人工核对附件 2/4/5 的剩余县名**(可用 `data/招生考试报/物理类/物理2025招生计划.pdf` 第 3 页 6x 渲染图核对)
3. seed-batch-eligibility-rules.ts 读取 JSON 把对应县名单填入 `batch_configs.eligibilityRules.hardEligibility[].params.regions`:

```json
{
  "scope": "SUBSET",
  "subset": "地方专项",
  "rule": "RURAL_HOUSEHOLD_IN_REGION",
  "params": {
    "regions": ["叙永县", "古蔺县", ...]    // 直接展开附件 2 的 119 县
  }
}
```

### 判定算法补充

`batch-eligibility.ts` helper 加新 rule type:

```typescript
'RURAL_HOUSEHOLD_IN_REGION' →
  satisfied = student.isRural === true
           && student.county != null
           && rule.params.regions.includes(student.county);
unsatisfiedReason =
  !student.county ? 'STUDENT_NO_COUNTY (SOFT_HINT)'
  : !rule.params.regions.includes(student.county) ? 'COUNTY_NOT_IN_REGION'
  : !student.isRural ? 'NOT_RURAL'
  : 'PASS';
```

**特别注意:**
- 学生 county 字段缺失时 → SOFT_HINT(不阻止),让老师面谈核实
- 县名比对要做标准化(去"自治县"等后缀差异、繁简体、空格)
- 区分"户籍县"(`county`)与"高考所在地县"(`examLocationCounty`) — 专项计划要求**户籍县**而非考试地

## 十二、调研引用

- 四川省教育考试院《2025年普通高校招生考试和录取工作实施方案》sceea.cn Newsdetail_4130
- 四川省2025年高校招生录取批次设置(sceea.cn Newsdetail_4261)
- 2025年四川控制线公布(sceea.cn Newsdetail_4332,2025-06-25)
- 2025年重点高校招生专项计划工作通知(sceea.cn Newsdetail_4197)
- 2025年农村订单定向医学生免费培养项目实施方案(sceea.cn Newsdetail_4325)
- 2025年军队院校在川招收普通高中毕业生公告(sceea.cn Newsdetail_4319)
- 2025年公安普通高等院校公安专业招生工作通知(sceea.cn Newsdetail_4309)
- **四川省 2025 年普通高校招生计划合订本(物理类)** — `data/招生考试报/物理类/物理2025招生计划.pdf` p.1-3 前言 + 附录(6 个县名单 + 录取批次及志愿设置附表)
  - 附表验证 6 批次志愿设置(本科批 A/B、本科提前批 A/B、高职提前批、高职批)
  - 附件 2/4/5/6 县名单(119/143/88/45)作为 SUBSET 硬资格的实施区域 seed 数据
  - 待办: 历史类合订本同期文件 (待用户提供 `data/招生考试报/历史类/历史2025招生计划.pdf`)
