# 纯人工志愿方案创建 — 设计规约

- **日期**：2026-05-07
- **作者**：Claude (brainstorming with user)
- **范围**：三种志愿方案模式中的**第一种**（纯人工：老师手动选批次 → 手挑院校专业组 → 与家长沟通迭代 → 主管审核 → 定稿）
- **不在范围内**：半人工（系统推荐+人工筛选）、全自动（系统推荐+AI 筛选）。这两种模式留作后续 spec。

---

## 0. 设计目标与不变量

**目标**：让老师为名下学生在多个真实批次内逐个建立志愿方案、与家长沟通后形成多版本迭代、经主管审核后定稿，全过程留痕，方便复盘。

**不变量**：

1. 一个学生在一个真实批次（`BatchConfig.batch`）内有一条版本链，每个版本是 `VolunteerPlan` 一行。
2. 同一 `(studentId, batchConfigId)` 下最多一个版本 `isFinal=true`。
3. `versionNo` 在同一 `(studentId, batchConfigId)` 下严格递增、连续。
4. 完整方案 = `count(planItems) === BatchConfig.maxGroupCount`；不满则只能保持 DRAFT，不能进入 PENDING_REVIEW。
5. 所有版本一律不删（DRAFT 是唯一例外）—— 复盘信息必须完整。
6. PlanItem 编辑只在 `status === DRAFT` 时允许；其他状态全部锁定。

---

## 1. 数据模型变更（`apps/server/prisma/schema.prisma`）

### 1.1 `VolunteerPlan` 字段调整

| 字段 | 当前 | 改为 | 说明 |
|---|---|---|---|
| `batch` | `Batch?`（旧 4 值 enum） | 保留不动，标 `@deprecated` | 向后兼容 |
| 新增 `batchName` | — | `String? @db.VarChar(100)` | 对齐 `BatchConfig.batch`（如 "本科批A段"） |
| 新增 `batchConfigId` | — | `Int?` 软外键 → `BatchConfig.id` | 便于 join 取 `maxGroupCount` |
| `recommendType` | 不存在 | `RecommendType` 枚举 | 纯人工模式写死 `MANUAL` |
| `currentReviewerId` | 不存在 | `Int?` 软外键 → `User.id` | REVIEWING 阶段记录当前主管，乐观锁用 |
| `gradientSource` | 不存在 | `String? @db.VarChar(20)` | 标记梯度算法版本，复盘用 |

**唯一约束变更**：
- 旧：`@@unique([studentId, batch, versionNo])` → 删除
- 新：`@@unique([studentId, batchConfigId, versionNo])`

### 1.2 迁移脚本（M2）

- `ALTER TABLE volunteer_plans ADD batch_name VARCHAR(100), ADD batch_config_id INT, ADD recommend_type VARCHAR(20), ADD current_reviewer_id INT, ADD gradient_source VARCHAR(20)`
- 数据回填：旧 `batch` enum → `batchName` 文本映射（EARLY_BATCH→"本科提前批"等占位），按学生 `province + examYear + examType` 查 `BatchConfig.id` 写入 `batchConfigId`
- DROP 旧 unique key，ADD 新 unique key
- 旧字段保留，旧代码继续工作

### 1.3 不动的部分

- `PlanItem` 表所有字段（包括 `gradient`/`anchorMajor`/`groupMajorCount`/`score25Group` 等历史快照字段、`isManuallyModified`/`originalItemId` 等追踪字段）
- `PlanReview` 表 + `ReviewerRole`/`ReviewAction` 枚举
- `PlanStatus` 枚举（仅使用 DRAFT/PENDING_REVIEW/REVIEWING/APPROVED/REJECTED/FINALIZED；PUBLISHED/OUTDATED 保留不用）
- `BatchConfig` 表
- `RecommendType` 枚举

---

## 2. 后端 API 端点

所有端点走 CASL 权限校验。命名遵循现有 RESTful 风格。

### 2.1 学生与批次准备

| Method | Path | 用途 |
|---|---|---|
| GET | `/api/v1/teachers/me/students` | 列本老师名下学生（已存在/复用） |
| GET | `/api/v1/students/:studentId/eligible-batches` | 该学生今年可填批次（按 BatchConfig 过滤 year+province+examType） |

`eligible-batches` 返回结构：`[{ batchConfigId, batchName, maxGroupCount, maxMajorPerGroup, volunteerMode, admissionOrder }]`

### 2.2 方案 CRUD

| Method | Path | 用途 |
|---|---|---|
| POST | `/api/v1/students/:studentId/plans` | 创建初版方案，body: `{ batchConfigId, name?, notes? }` |
| GET | `/api/v1/students/:studentId/plans?batchConfigId=&latest=true` | 查方案列表，可按批次过滤、可只取每批次最新版 |
| GET | `/api/v1/plans/:planId` | 查方案详情（含 PlanItems） |
| GET | `/api/v1/plans/:planId/version-tree` | 查整条版本链 |
| DELETE | `/api/v1/plans/:planId` | 仅 DRAFT 可删 |

**自动 name**：`{学生姓名}-{批次名}-初版`；派生版改为 `{学生姓名}-{批次名}-v{N}`。

### 2.3 候选院校专业组列表（核心）

| Method | Path | 用途 |
|---|---|---|
| GET | `/api/v1/plans/:planId/candidates?keyword=&page=&pageSize=&rankRange=&includeSoftFails=true` | 取该方案的候选清单 |

详细算法见 §3。

### 2.4 PlanItem 编辑（仅 DRAFT 可用）

| Method | Path | 用途 |
|---|---|---|
| POST | `/api/v1/plans/:planId/items` | 加入院校专业组，body: `{ enrollmentPlanId, sequence?, gradient?, acceptAdjust?, selectionReason? }` |
| PATCH | `/api/v1/plans/:planId/items/:itemId` | 改梯度/调剂/备注/调顺序 |
| DELETE | `/api/v1/plans/:planId/items/:itemId` | 移除 |
| POST | `/api/v1/plans/:planId/items/reorder` | 批量改 sequence，body: `{ itemIds: [3,5,1,...] }` |

**加入时副作用**：
1. 后端从 EnrollmentPlan + AdmissionRecord 抽取所有 PlanItem 快照字段
2. 若 `gradient` 未传，调用 `gradient-calculator` 算建议值
3. `sequence` 缺省 = 当前组数 + 1
4. 校验 `count(items) <= maxGroupCount`，达上限报 409

### 2.5 状态流转

| Method | Path | 用途 | 前置条件 |
|---|---|---|---|
| POST | `/api/v1/plans/:planId/submit-review` | 老师提交主管审核 | `count(items) === maxGroupCount`，状态 = DRAFT |
| POST | `/api/v1/plans/:planId/start-review` | 主管认领（乐观锁） | 状态 = PENDING_REVIEW，调用方 isSupervisor |
| POST | `/api/v1/plans/:planId/review` | 主管批准/驳回/请改/批注，body: `{ action, comment, itemAnnotations? }` | 状态 = REVIEWING，调用方 = currentReviewerId |
| POST | `/api/v1/plans/:planId/derive-version` | 老师派生新版（基于已锁定版本） | 状态 ∈ {APPROVED, REJECTED, FINALIZED}，调用方 = createdBy |
| POST | `/api/v1/plans/:planId/finalize` | 老师定稿 | 状态 = APPROVED，调用方 = createdBy |

**乐观锁实现**（start-review）：
```sql
UPDATE volunteer_plans
SET status='REVIEWING', current_reviewer_id=?
WHERE id=? AND status='PENDING_REVIEW'
```
`affectedRows=0` → 报 409 "已被他人认领"。

**isFinal 互斥处理**（finalize）：
- 同事务内：先把 `(studentId, batchConfigId)` 下其他 isFinal=true 的版本改为 false（status 保留 FINALIZED 用作历史）
- 再设当前版本 isFinal=true、status=FINALIZED、finalizedAt=now、finalizedBy=userId

### 2.6 导出

| Method | Path | 用途 |
|---|---|---|
| GET | `/api/v1/plans/:planId/export.pdf` | 导出 PDF，`exportCount++` |

详见 §5。

---

## 3. 候选院校专业组列表服务

### 3.1 输入输出

**输入**：`planId`（隐含 student/batchConfig）+ 过滤条件（keyword、rankRange、includeSoftFails、page/pageSize）

**输出**：分页清单，每行：
```ts
{
  enrollmentPlanId, universityName, universityCode,
  groupCode, groupName, majorsInGroup: Major[],
  history: { score25Group, rank25Group, score25Major, rank25Major, score24Major, rank24Major },
  rankDiffRatio: number, // (学生位次 - 历史最低位次) / 历史最低位次
  suggestedGradient: 'CHONG' | 'WEN' | 'BAO',
  matchStatus: 'PASS' | 'SOFT_FAIL',
  failReasons: Array<{ rule, expected, actual, severity, note }>,
  planCount, tuition,
}
```

### 3.2 处理流水线

```
EnrollmentPlan 全表
  ① 硬过滤：year + province + batch + subjects + subjectRequirements
  ② 关键词搜索（LIKE 院校名/专业名/组名）
  ③ JOIN AdmissionRecord（按自然主键 7 字段：universityId+subjects+batch+recruitType+groupCode+majorCode+majorName）
  ④ 算建议梯度 + rankDiffRatio
  ⑤ 跑软规则（6 个独立规则函数）
  ⑥ 排序：matchStatus ASC（PASS 优先）→ |rankDiffRatio| ASC → fail 数量 ASC
  ⑦ 分页
```

### 3.3 软规则清单（首期）

**必做（M）**：
- `health-restriction.rule.ts`：基于 `HealthRestriction` 表，按学生视力/色盲色弱/身高等校验
- `gender.rule.ts`：从 `Major.notes` / `EnrollmentPlan.planNotes` 文本抽"仅限男/女"关键字
- `household.rule.ts`：户籍专项（农村专项、地方专项），基于 `EligibleRegion` + `EnrollmentPlan.recruitType` 含"国家专项""地方专项"等关键字
- `ethnicity.rule.ts`：民族（民语类/加授民文），基于 `User.ethnicity` + `recruitType`/`BatchConfig.bonusEligible`

**可选默认开（O）**：
- `tuition.rule.ts`：学费上限，`StudentProfile.tuitionBudget` vs `EnrollmentPlan.tuition`
- `nature.rule.ts`：办学性质（中外合作/民办），`StudentProfile.acceptSinoForeign/acceptPrivate/acceptCooperation` vs `EnrollmentPlan.isSinoForeign` + `University.runningNature`

**后期（L，本期不做）**：
- 政治面貌（党员/团员限制）
- 单科成绩限制

### 3.4 梯度计算器（pure function）

```ts
function calcGradient(studentRank: number, historyMinRank: number, threshold = { chong: 0.9, bao: 1.1 }): 'CHONG' | 'WEN' | 'BAO'
```

- `studentRank < historyMinRank * 0.9` → CHONG（冲）
- `0.9 ≤ ratio ≤ 1.1` → WEN（稳）
- `ratio > 1.1` → BAO（保）
- `historyMinRank` 缺失 → 返回 BAO + log warning

阈值存 `AlgorithmConfig.thresholds`，管理员可改。

### 3.5 性能

- 候选集 SQL 一次拉清（Prisma `findMany + include`）
- 短缓存：步骤 ①②③ 结果按 `examType + batchConfigId + keyword` 缓存到 Redis 60 秒
- 软规则不缓存（学生数据可变）
- 慢于 500ms 才考虑物化视图，**首期不做**

---

## 4. 状态机详细规约

### 4.1 状态表

| 状态 | 含义 | 可编辑 PlanItems | 状态转移触发者 |
|---|---|---|---|
| DRAFT | 草稿/暂存/被请改 | ✅ 创建老师 | 创建老师 |
| PENDING_REVIEW | 等主管认领 | ❌ | 任意主管 |
| REVIEWING | 主管审核中 | ❌ | 当前主管 |
| APPROVED | 主管已批准 | ❌ | 创建老师 |
| REJECTED | 主管已驳回（终态，留档） | ❌ | 创建老师（仅可派生） |
| FINALIZED | 已定稿（终态） | ❌ | 无 |

### 4.2 转移规则

```
[None] ──创建──→ DRAFT (versionNo=1)

DRAFT ──submit-review──→ PENDING_REVIEW
   前置：count(items) === maxGroupCount

PENDING_REVIEW ──start-review──→ REVIEWING
   副作用：currentReviewerId = self.userId，写 PlanReview(action=COMMENT, comment="开始审核")

REVIEWING ──review(APPROVE)──→ APPROVED
REVIEWING ──review(REJECT)──→ REJECTED
REVIEWING ──review(REQUEST_CHANGE)──→ DRAFT  (同 versionNo，currentReviewerId 清空)
REVIEWING ──review(COMMENT)──→ REVIEWING    (不改状态，追加批注)

APPROVED ──finalize──→ FINALIZED
   副作用：同 (studentId, batchConfigId) 其他版本 isFinal=false；当前版 isFinal=true

APPROVED/REJECTED/FINALIZED ──derive-version──→ 新版 DRAFT (versionNo+1, parentVersionId=自己)
   副作用：复制全部 PlanItems 到新行（含 isManuallyModified 重置为 false、originalItemId 指向旧 item）

DRAFT ──delete──→ [None]   (仅 DRAFT 可删)
```

### 4.3 不变量校验

1. 同一 `(studentId, batchConfigId)` 下最多一个 isFinal=true（应用层事务内保证）
2. `versionNo` 在同一 `(studentId, batchConfigId)` 下严格递增、连续
3. `parentVersionId` 不能指向同一或更高 versionNo 的方案
4. `count(planItems) <= maxGroupCount` 永远成立
5. PlanItem 编辑闸门：`status === DRAFT`，否则 409

---

## 5. PDF 导出方案

### 5.1 实现选择

**采用 Puppeteer + HTML/CSS 模板**。

理由：
- 项目前端已用 Tailwind，模板复用品牌风格无成本
- 中文/表格/分页/水印用 CSS 直接搞定
- 维护成本低（前端 dev 即可改样式）

**不选**：
- PDFKit（手画坐标，表格分页地狱）
- wkhtmltopdf（已停止维护）
- LaTeX（重型，不现实）

### 5.2 内容

**封面页**：学生姓名 / 学校 / 班级 / 高考成绩+位次 / 科目 / 方案版本号 / 批次名 / 老师姓名 / 生成时间

**正文页**（志愿表）：序号 / 梯度色块 / 院校名+代码 / 专业组名+代码 / 组内专业（最多列 6 个） / 24/25 年录取最低分/位次 / 招生计划数 / 学费 / 是否服从调剂

**备注页**：versionNote + 聚合 PlanReview 的 comment

**法律提示**：方案仅供参考、最终以官方公告为准、生成时间戳

**水印**：每页右下角"本方案为内部参考资料 / 老师xxx / 生成时间 / 版本号 vN"

### 5.3 调用模式

- **首期**：同步生成，HTTP stream 响应
- **后期**：量大时转 Bull 队列异步 + Notification 通知

### 5.4 模板位置

`apps/server/src/modules/plan/templates/plan-export.html`

---

## 6. 权限模型（CASL）

### 6.1 角色能力矩阵

| 操作 | TEACHER | TEACHER(主管) | ADMIN |
|---|---|---|---|
| 看自己 createdBy 的方案 | ✅ | ✅ | ✅ |
| 看名下学生（teacherId=self）的方案 | ✅ | ✅ | ✅ |
| 看任意 PENDING_REVIEW/REVIEWING 方案 | ❌ | ✅ | ✅ |
| 看任意方案 | ❌ | ❌ | ✅ |
| 创建/编辑/删除 DRAFT 方案 | ✅（自己学生） | ✅（自己学生） | ✅ |
| 提交主管审核 | ✅ | ✅ | ✅ |
| 审核操作（批准/驳回/请改/批注） | ❌ | ✅ | ✅ |
| 派生新版本 | ✅（创建本人） | ✅（创建本人） | ✅ |
| 定稿 | ✅（创建本人） | ✅（创建本人） | ✅ |
| 导出 PDF | ✅（有看权限即可） | ✅ | ✅ |

### 6.2 STUDENT 角色

首期不开放任何方案权限。学生看方案的需求归到后续 spec。

### 6.3 主管认领并发控制

乐观锁：`UPDATE ... WHERE id=? AND status='PENDING_REVIEW'`，`affectedRows=0` 报 409。

---

## 7. 测试策略 + 模块拆分

### 7.1 模块拆分

```
apps/server/src/modules/
├── plan/                              （扩展）
│   ├── plan.controller.ts             ← 新增状态转移端点
│   ├── plan.service.ts                ← 扩展派生、定稿、isFinal 互斥
│   ├── plan-state-machine.service.ts  ← 新增：纯函数状态转移校验
│   ├── plan-item.service.ts           ← 新增：拆出 PlanItem CRUD
│   ├── plan-export.service.ts         ← 新增：PDF 渲染
│   ├── templates/plan-export.html
│   └── dto/...
├── plan-candidate/                    （新建）
│   ├── plan-candidate.controller.ts
│   ├── plan-candidate.service.ts
│   ├── filters/
│   │   ├── hard-filter.ts
│   │   ├── soft-rules/
│   │   │   ├── health-restriction.rule.ts
│   │   │   ├── gender.rule.ts
│   │   │   ├── household.rule.ts
│   │   │   ├── ethnicity.rule.ts
│   │   │   ├── tuition.rule.ts
│   │   │   └── nature.rule.ts
│   │   └── soft-rule.interface.ts
│   └── gradient-calculator.ts
├── teacher/                           （扩展）
│   └── 增加 GET /me/students 端点（如未实现）
└── batch-config/                      （扩展）
    └── 增加 GET /eligible-batches?studentId=
```

### 7.2 测试矩阵

| 层级 | 测试目标 | 必做 |
|---|---|---|
| 单元 - 状态机 | 每条状态转移：合法成功 / 非法抛错 | ✅ |
| 单元 - 软规则 | 6 个软规则各 ≥3 PASS/FAIL 用例 | ✅ |
| 单元 - 梯度计算器 | 三种梯度边界（0.9/1.1）+ 历史缺失 | ✅ |
| 单元 - 候选清单排序 | PASS 优先、二级位次接近度 | ✅ |
| 集成 - 方案 CRUD | 创建/查询/编辑/删除 + 权限 | ✅ |
| 集成 - 完整流程 | DRAFT → 加满 → submit → start → approve → finalize | ✅ |
| 集成 - 派生版本 | APPROVED 派生 v2，PlanItems 复制，parentVersionId 正确 | ✅ |
| 集成 - 不变量 | isFinal 互斥 / versionNo 连续 | ✅ |
| 集成 - 主管乐观锁 | 两主管并发认领，一胜一败 | ✅ |
| 集成 - 候选清单 | 硬过滤生效 / 软不符合置底 / 关键词 | ✅ |
| E2E - 真实浏览器 | Chrome MCP 走完整 happy path | ✅ |
| E2E - PDF 导出 | pdf-parse 校验姓名/版本号/组数 | ✅ |
| 性能 - 候选清单 | 万条数据下 < 500ms | ⚠️ 建议 |

### 7.3 测试数据（fixtures）

`prisma/seed.ts` 准备：3 学生 × 2 老师 × 1 主管 × 4 批次 × 50 院校专业组，覆盖各种软不符合场景。

### 7.4 TDD 实施顺序

1. 状态机纯函数（最先）
2. 候选清单服务（含软规则）
3. PlanItem CRUD
4. 状态转移端点
5. PDF 导出
6. E2E 串通

每步严格 RED → GREEN → REFACTOR。

---

## 8. 不在本期范围

显式列出，避免日后误以为漏做：

- 半人工模式（系统推荐 + 人工筛选）
- 全自动模式（系统推荐 + AI 筛选）
- 学生/家长账号查看方案
- PlanShareLink 在线分享
- 沟通记录持久化（versionNote 文本足够）
- PUBLISHED / OUTDATED 状态使用
- 政治面貌、单科成绩等结构化软规则（M5/M6 数据治理后）
- 主管审核工作量统计、SLA 看板
- 批量操作（一次给班级 N 个学生开 N 份方案）

---

## 9. 验收标准（spec 通过的判定）

1. 老师能在 UI 上为名下学生创建一个本科批方案
2. 候选清单按 §3.2 流水线展示，软不符合置底+灰色+原因
3. 加满 maxGroupCount 个组才能提交主管审核（不满拒绝）
4. 主管能批准/驳回/请改，状态机按 §4.2 流转
5. 老师能基于已审核版本派生 v2，PlanItems 完整复制，parentVersionId 链路正确
6. 同 (studentId, batchConfigId) 下定稿时其他版本的 isFinal 自动置 false
7. 导出 PDF 包含封面+正文+备注+水印，pdf-parse 能验证关键字段
8. CASL 权限矩阵实测通过：跨学生访问 403、非主管审核 403、并发认领冲突 409
9. 单测覆盖率 ≥ 80%（核心模块），集成测试 happy path + 关键异常路径全覆盖
10. E2E 走完一条 DRAFT → ... → FINALIZED → PDF 全链路无错
