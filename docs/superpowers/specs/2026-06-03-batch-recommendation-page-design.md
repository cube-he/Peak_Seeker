# 批次推荐器页面设计

**Date**: 2026-06-03
**Status**: Approved (brainstorming)
**Supersedes**: 部分覆盖 [2026-06-02 batch-selection-at-intake-design.md](./2026-06-02-batch-selection-at-intake-design.md) 的「学生 intake 阶段勾批次 + 锁定」流程,改为「学生不勾, 老师在推荐页确认」

---

## 一、为什么

Plan A 已部署的流程：**学生填资料时勾选感兴趣的批次**。但商业现实是：
- 学生不懂批次结构（6 个一级批次 + 35+ 子类别，区分本科批 A/B、提前批 A/B 等需要专业知识）
- 真正的批次决策必须基于政策硬资格判定（户籍县是否在 119 县、年龄是否符合军校要求、视力是否过航海标准等）
- 老师面谈才能跟家长讲清各批次/子类别的录取规则、服务承诺、风险

所以重构为：**学生只填基础信息 → 系统在「批次推荐页」给老师可视化的判定结果 + 政策原文 → 老师跟家长面谈后勾选最终批次**。

---

## 二、端到端工作流

```
[学生 intake]
  填基础信息: 分数 / 选科 / 户籍省市县 / 城乡 / 政考状态 / 体检结论 / 民族 / 出生日期 / 服务期意愿
  不接触批次概念
       ↓ submitMyIntake (无 batches 校验, 不写 batchesConfirmedAt)
[intakeStatus = SUBMITTED]
       ↓ 自动进老师待审列表
[老师待审列表] 该学生卡片 / 列表行
       ↓ 点击 "查看推荐批次"
[批次推荐页] /teacher/students/:id/batch-recommendations
  顶部学生关键信息快照 + [回填资料] 按钮
  6 个批次卡片 + 每张卡片下子类别 verdict + 详情 + 政策文件预览/下载
  老师跟家长面谈 → 勾选 1-6 个批次
       ↓ POST /students/:id/confirm-batches
[student.preferredBatches 写入 + batchesConfirmedAt = now() + intakeStatus = VERIFIED]
       ↓
[做方案] 老师为每个勾选的批次出 plan (沿用现有方案制作流程)
       ↓
[学生详情页] 重打开「批次推荐页」入口  (老师可重看/调整)
  → 老师点击 "重新选批次"
  → POST /students/:id/unlock-batches (已有, 沿用)
  → 状态回到 SUBMITTED, 老师可重新进推荐页
```

---

## 三、Plan A 已部署代码微调清单

| 现有 | 改成 |
|---|---|
| `student.service.submitMyIntake` 校验 `preferredBatches` 非空 | **移除**校验 |
| `student.service.submitMyIntake` 写 `batchesConfirmedAt` | **移除**这步 |
| `student.service.submitMyIntake` 写 `intakeStatus = SUBMITTED` | 保留 |
| `student.service.reviewIntake` (VERIFY → intakeStatus=VERIFIED) | **VERIFY 路径迁移到新 confirmBatches**;REQUEST_CHANGE 路径保留 |
| `student.service.unlockBatches` (老师解锁) | 保留, 语义"重置批次决策, 回到推荐页" |
| `picker-options?batches=` 硬过滤 | 保留 (做方案时仍然有效) |
| `STRICT_BATCH_VALIDATION` flag (plan 创建校验) | 保留 |
| 老的前端 "学生 chip 编辑器" Plan B 草案 | **作废**, 学生不再接触批次 |

---

## 四、数据模型

### Schema 不变（沿用 Plan A）

```prisma
model StudentProfile {
  preferredBatches      Json?      // string[] - 由老师在推荐页勾选写入
  batchesConfirmedAt    DateTime?  // 老师 confirmBatches 时写入
  batchesUnlockedBy     Int?       // 解锁老师的 userId
  batchesUnlockedAt     DateTime?  // 上次解锁时间
  // ...
}

model BatchConfig {
  eligibilityRules      Json?  // 本期 JSON 内部结构升级
}
```

### `batchConfig.eligibilityRules` JSON 结构（升级版）

```typescript
{
  scoreFloor: {
    type: 'BATCH_LINE' | 'SPECIAL_LINE' | 'ZHUANKE_LINE',
    leniency?: number   // 线下 N 分容错
  },
  examTypes: string[],  // ["物理"] | ["历史"] | ["物理","历史"]
  volunteerMode: 'PARALLEL' | 'SEQUENTIAL',

  // === 本期新增: subsets 数组 ===
  subsets: Array<{
    code: string,        // 内部 key, 如 "guojia_zhuanxiang" "junxiao" "mianfei_yixue"
    name: string,        // 中文名 "国家专项" "军队院校" "免费医学"
    description: string, // 一句话说明 (UI 展示)
    examTypes?: string[], // 若与父批次不同时覆写
    hardRules: HardEligibilityRule[],  // 该子类别专属硬资格
    softHints?: string[],              // "需通过政考"等提示, 不影响 verdict
    references: Array<{
      title: string,                   // "四川省原集中连片特殊困难县 119 县名单"
      filename: string | null,         // "policy_3.xlsx" - null 表示文件待补
      type: 'pdf' | 'xlsx' | 'announcement',
      uploadedToProd: boolean,
      sourceNote?: string              // 缺失文件提示: "需从 sceea.cn Newsdetail_4197 获取"
    }>
  }>,

  // 保留向后兼容
  hardEligibility?: HardEligibilityRule[],   // 旧扁平结构, 升级后留空数组
  softRecommendation?: Array<{rule: string; message: string}>
}

type HardEligibilityRule = {
  scope: 'ALL' | 'SUBSET',
  subset: string | null,
  rule: HardEligibilityRuleCode,
  params?: Record<string, unknown>
}

type HardEligibilityRuleCode =
  | 'RURAL_HOUSEHOLD_IN_REGION'  // 农村户籍 + county ∈ regions
  | 'HOUSEHOLD_IN_REGION'        // 户籍县 ∈ regions
  | 'AGE_RANGE'                  // {min,max,asOf}
  | 'POLITICAL_REVIEW_REQUIRED'  // 政考 → SOFT_HINT
  | 'PHYSICAL_EXAM_REQUIRED'     // 体检 → SOFT_HINT
  | 'GENDER'                     // (新增) {male,female,both}
  | 'VISION_STANDARD'            // (新增) 视力标准, 详细文件
  | 'SCHOOL_RECOMMENDATION'      // (新增) 中学推荐, SOFT_HINT
  | 'SERVICE_COMMITMENT'         // (新增) 服务期承诺, SOFT_HINT 需老师跟家长沟通
```

### 判定算法升级

```typescript
function judgeBatchEligibility(student, batchConfig, batchLine) {
  // 1. 共同检查: examType 不符 / scoreFloor 不过 → 直接 INELIGIBLE 整批
  // 2. 对每个 subset 单独评估:
  for (const subset of rules.subsets) {
    const subsetResult = evalSubset(student, subset, batchLine);
    // verdict: ELIGIBLE | CONDITIONAL | INELIGIBLE
  }
  // 3. 批次整体 verdict 聚合:
  //    - 至少一个 subset = ELIGIBLE → 批次 ELIGIBLE
  //    - 全部 INELIGIBLE 或 DATA_PENDING → 批次 INELIGIBLE
  //    - 否则 CONDITIONAL
  // DATA_PENDING 状态: subset 标记 dataPending=true 时直接 DATA_PENDING, 不参与聚合
  return { batchVerdict, subsetResults }
}
```

### verdict 中文展示映射

| verdict | 中文 | UI 颜色暗示 (claude-design 实施时定具体色) |
|---|---|---|
| ELIGIBLE | 推荐 | 绿 |
| CONDITIONAL | 可冲 | 黄/橙 |
| INELIGIBLE | 不可填 | 红/灰 |
| DATA_PENDING | 详情待补充 | 灰 + 描边 |

---

## 五、批次清单（招生考试报 2025 真实结构）

### 6 个核心一级批次（本期落地，覆盖 ~95% 学生）

| 顺序 | 批次 | volunteerMode | scoreFloor |
|---|---|---|---|
| 1 | 本科提前批 A 段 | SEQUENTIAL | SPECIAL_LINE |
| 2 | 本科提前批 B 段 | PARALLEL | BATCH_LINE (-20) |
| 3 | 本科批 A 段 | PARALLEL | BATCH_LINE |
| 4 | 本科批 B 段 | PARALLEL | BATCH_LINE |
| 5 | 高职提前批 (专科提前批) | SEQUENTIAL | ZHUANKE_LINE |
| 6 | 高职批 (专科批) | PARALLEL | ZHUANKE_LINE |

### 15 个核心子类别（本期完整落地：硬资格 + 文件）

| # | 子类别 | 所属批次 | code | 关键硬资格 |
|---|---|---|---|---|
| 1 | 普通类 | 本科批 A | `puton` | 无 (默认 ELIGIBLE) |
| 2 | 国家专项 | 本科批 A | `guojia_zhuanxiang` | 农村户籍 + 户籍县 ∈ 119 县 + 学籍连续 |
| 3 | 地方专项 | 本科批 A | `difang_zhuanxiang` | 农村户籍 + 户籍县 ∈ 119 县 |
| 4 | 普通类 | 本科批 B | `puton_b` | 无 |
| 5 | 高校专项 | 本科批 B (主) / 本科提前批 (PDF 5_) | `gaoxiao_zhuanxiang` | 农村户籍 + 户籍县 ∈ 119 县 + 中学推荐 |
| 6 | 军队院校 | 本科提前批 A | `junxiao` | 年龄 16-20 + 政考 + 体检 + 体能 |
| 7 | 公安院校 | 本科提前批 A | `gongan` | 年龄 16-22 + 政考 + 体检 + 体能 |
| 8 | 司法警官 | 本科提前批 A | `sifa` | 年龄 + 政考 + 体检 |
| 9 | 航海类 | 本科提前批 A | `hanghai` | 视力 + 色觉 |
| 10 | 免费医学 (农村订单定向) | 本科提前批 B | `mianfei_yixue` | 农村户籍 + 户籍县 ∈ 119 县 + 6 年服务承诺 |
| 11 | 省级公费师范 | 本科提前批 B | `sheng_gongfei_shifan` | 户籍县 ∈ 143 县 + 6 年服务承诺 |
| 12 | 部属师范本研衔接公费 | 本科提前批 B | `bushu_shifan` | 民族地区/扶贫县 + 6 年服务承诺 |
| 13 | 乡村振兴师范 | 本科提前批 B | `xiangcun_zhenxing` | 户籍县 ∈ 88 县 + 6 年服务承诺 |
| 14 | 定向培养军士 | 高职提前批 (= 专科提前批) | `dingxiang_junshi` | 年龄 + 政考 + 体检 + 服务承诺 |
| 15 | 空中乘务 | 高职提前批 | `kongcheng` | 身高 + 视力 + 形象面试 |

**批次命名统一**：四川招生考试报正式称呼为「专科提前批」「专科批」, DB 中 batch_configs 表用「高职提前批」「高职批」 (Plan A 已部署的 seed)。本期 spec 沿用 DB 命名 "高职提前批 / 高职批", 老师端展示时同步标注 "(原专科提前批)"。

### 11 个占位项（本期标记 `dataPending`，数据建模留位，UI 显示"详情待补充"）

```
强基计划 / 高水平运动队 / 中外合作办学 / 留俄定向 / 北电中传等综合评价 /
公安专科 / 司法警院 / 五年制大专 / 区域均衡 / 省属预科 / 涉藏 1+2
```

后续补全数据后激活 UI。

---

## 六、API 端点

### 1. `GET /api/v1/students/:id/batch-recommendations`

**响应**：

```typescript
type BatchRecommendationsResponse = {
  student: {
    id: number;
    totalScore: number | null;
    examType: 'PHYSICS' | 'HISTORY';
    province: string | null;
    county: string | null;
    isRural: boolean;
    birthDate: string | null;
    politicalStatus: string | null;
    ethnicity: string | null;
  };
  batchesConfirmedAt: string | null;        // 已锁定时间, null = 老师可勾选
  batches: BatchRecommendation[];
}

type BatchRecommendation = {
  batchConfigId: number;
  batchName: string;                        // "本科批A段"
  volunteerMode: 'PARALLEL' | 'SEQUENTIAL';
  scoreFloor: { type, score, leniency };
  verdict: 'ELIGIBLE' | 'CONDITIONAL' | 'INELIGIBLE';
  topReason: string;                        // 一句话主因 (UI 卡片头展示)
  subsets: SubsetRecommendation[];
}

type SubsetRecommendation = {
  code: string;
  name: string;
  description: string;
  verdict: 'ELIGIBLE' | 'CONDITIONAL' | 'INELIGIBLE' | 'DATA_PENDING';
  rulesEval: Array<{
    ruleCode: HardEligibilityRuleCode;
    requirement: string;        // 中文描述 "需农村户籍 + 户籍县 ∈ 119 县"
    actual: string;             // 实际值 "农村户籍, 户籍县=叙永县 ✓"
    pass: 'PASS' | 'FAIL' | 'UNCERTAIN' | 'SOFT_HINT';
  }>;
  references: Array<{
    title: string;
    filename: string | null;
    type: 'pdf' | 'xlsx' | 'announcement';
    downloadUrl: string | null;             // /attachments/policy/policy_3.xlsx
    available: boolean;
    sourceNote?: string;
  }>;
}
```

**权限**：老师 (能 update 此 StudentProfile) / 主管 / ADMIN。

---

### 2. `POST /api/v1/students/:id/confirm-batches`

**Body**：

```typescript
{
  preferredBatches: string[];       // 1-6 个批次名 (必须在已知的 6 主批次中)
  reviewComment?: string;           // 老师备注 (可选)
}
```

**副作用**（一个事务）：
- `student.preferredBatches = body.preferredBatches`
- `student.batchesConfirmedAt = now()`
- `student.intakeStatus = 'VERIFIED'`
- `student.intakeReviewedBy = req.user.id`
- `student.intakeReviewedAt = now()`
- `student.intakeReviewComment = body.reviewComment ?? null`

**校验**：
- `preferredBatches` 非空, 数组成员 ∈ 6 主批次列表 (硬白名单)
- 学生 `intakeStatus` 必须在 SUBMITTED / NEEDS_CHANGES (避免重复确认)
- 老师必须是学生 teacher (或主管/ADMIN)

**响应**：返回更新后的 student profile 部分字段。

---

### 3. `POST /api/v1/students/:id/unlock-batches`

**已存在**, 沿用 Plan A 实现。语义不变：清空 confirmedAt + intakeStatus → NEEDS_CHANGES。

---

### 4. `GET /api/v1/policy-attachments/:filename`

**直接 nginx 路由**（无需 NestJS 中间, 复用 phase 3 历史案例附件那套）：

```nginx
location /attachments/policy/ {
  alias /home/ubuntu/apps/volunteer-helper/attachments/policy/;
  add_header Content-Disposition "inline";   # PDF 可在浏览器内预览
  expires 1d;
}
```

文件名固定（与 `subset.references[].filename` 一一对应），加 query `?download=1` 时改 Content-Disposition: attachment。

---

## 七、文件存储

| 文件 | 来源 | 上传到生产 |
|---|---|---|
| `policy_3.xlsx` | data/07_政策文件/3 ... | ✅ 上传 |
| `policy_4.xlsx` | data/07_政策文件/4 ... | ✅ 上传 |
| `policy_5.xlsx` | data/07_政策文件/5 ... | ✅ 上传 |
| `policy_6.xlsx` | data/07_政策文件/6 ... | ✅ 上传 |
| `policy_2_师范.xlsx` | data/07_政策文件/2 ... | ✅ 上传 |
| `招生考试报_物理_前言附件.pdf` | data/招生考试报/物理类/... | ✅ 上传 |
| `招生考试报_历史_前言附件.pdf` | data/招生考试报/历史类/... | ✅ 上传 |
| `军队选拔军官和文职人员体检标准.pdf` | data/07_政策文件/... | ✅ 上传 |
| 各军校招生章程（缺失） | 用户后补 | ⚠ sourceNote 标记 |
| 公安院校体能要求（缺失） | 用户后补 | ⚠ sourceNote 标记 |
| 强基计划白皮书.pdf | data/07_政策文件/... | ✅ 本期已有 |

部署路径：`/home/ubuntu/apps/volunteer-helper/attachments/policy/`

---

## 八、前端信息架构

### 路由

```
/teacher/students/:id/batch-recommendations
  ← 学生详情页"查看推荐批次"按钮
  ← 老师 dashboard 待审列表行点击
  ← 角色 guard: 仅老师 (自己学生) / 主管 / ADMIN
```

### 组件层级

```
<BatchRecommendationsPage>
  <StudentSnapshot />              // 顶部学生关键指标 + [回填资料] 链接跳 /teacher/students/:id (老师端学生详情页)
  <ConfirmedBanner />              // 若已锁定: 展示锁定时间 + 重新打开按钮
  <BatchCardList>
    <BatchCard>
      <BatchHeader>                // verdict 标签 + 选中复选框
        <BatchName />              // "本科批A段"
        <VerdictBadge />           // ELIGIBLE / CONDITIONAL / INELIGIBLE
        <SelectCheckbox />         // 老师勾选
      </BatchHeader>
      <SubsetList>
        <SubsetItem>
          <SubsetSummary>          // 折叠态
            <SubsetName />
            <VerdictBadge />
            <ReasonOneLine />
            <ExpandToggle />
          </SubsetSummary>
          <SubsetDetail>           // 展开态
            <RulesEvalList />      // 逐条硬资格判定
            <ReferencesList>
              <ReferenceItem>
                <FileThumbnail />  // PDF 缩略图 / xlsx 图标
                <FileTitle />
                [预览] [下载]      // 缺失文件: 灰 + sourceNote 链接
              </ReferenceItem>
            </ReferencesList>
          </SubsetDetail>
        </SubsetItem>
      </SubsetList>
    </BatchCard>
  </BatchCardList>
  <SubmitBar>                      // 固定底部
    <SelectedCount />              // "已选 N 个批次"
    <ReviewCommentInput />         // 可选老师备注
    <SubmitButton />               // POST confirm-batches
  </SubmitBar>
</BatchRecommendationsPage>
```

### 视觉样式

留给 `claude-design`。本 spec 仅定义信息层级和交互流。

---

## 九、数据迁移路径

1. seed 脚本 `seed-batch-eligibility-rules.ts` 重写，按新 JSON 结构（subsets 数组）覆盖 6 主批次。
2. 生产 DB 已有 `eligibility_rules` JSON 字段填的旧结构（hardEligibility 扁平数组）；新结构兼容存在 → 一次 seed 覆盖即可，无需手动 SQL 迁移。
3. 文件全量上传到生产 `/attachments/policy/` 一次。
4. nginx 配置增 location 块 + reload (复用历史案例那套套路)。

---

## 十、边界 / 风险

- **数据准确性**：本期手工整理 15 子类别的硬资格 + 文件映射。后续若发现规则错误（如年龄/服务期/视力数值），用户在 spec 上提 issue，更新 seed 重跑。判定逻辑代码层面通用，不需要改算法。
- **占位项数据缺失**：11 个 `dataPending` 子类别在 UI 显示"详情待补充, 老师需手动核实政策"。不阻塞本期上线。
- **学生缺字段**：判定算法已有 SOFT_HINT 容错（如未填出生日期则 AGE_RANGE 给 UNCERTAIN）。老师在推荐页能看到"该字段未填", 可点击"回填资料"按钮跳学生详情页补填后回来。
- **判定与现实差异**：政策每年微调（如 119/143/88 县名单可能变, 军校年龄要求可能调）。spec 数据按招生考试报 2025 版定, 每年高考前由用户给 seed 提 PR 更新。
- **本科批 A 段子分类规则缺失** (Plan A Task 12 后遗症)：DB 中 batch_configs 表有"本科批A段（国家专项）"等细分行, 本期 seed 重写时**只用顶层"本科批A段"作为权威表项**, 细分行的 eligibility_rules 留 null。逻辑层判定时所有"本科批A段"子分类都按统一 subsets[] 拉取（subset 名匹配, 不依赖 batch 名）。

---

## 十一、本期不做（明确 YAGNI）

- 自动推送/通知老师（待审列表展示足够）
- 推荐页加入分数线变化预警 (现有 dashboard 已有功能)
- 学生端预览推荐页（明确老师工具）
- 11 占位子类别的数据填充（数据来源待补）
- 自动文件 OCR 校验（user 主动跟进缺失）
- 多年份批次切换（仅当年 examYear）

---

## 十二、Plan B 草案作废说明

之前在 `2026-06-02-batch-selection-at-intake-design.md` § 五 提到的"学生 chip 编辑器"组件需求作废, 不再实现。preferredBatches 字段语义从"学生选定"改为"老师确认", 不再有学生端编辑入口。
