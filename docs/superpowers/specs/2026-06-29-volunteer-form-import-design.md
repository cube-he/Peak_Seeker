# 设计：志愿表 PDF 导入 —— 据真实填报建立新版本方案

- 日期：2026-06-29
- 状态：待实现
- 关联记忆：`plan_multidraft_deployed`、`plan_multisort_deployed`、`major_mode_7_filters`、`prod_policy_files_infra`

## 1. 背景与真实需求

老师拿到学生**真实填报后的志愿表 PDF**（四川省普通高校招生考生志愿表，单批次，平行志愿 N 条），想据此在系统里建一份「实填版」方案，以便和老师当初的**推荐方案**对照、复盘。

要做成**可复用功能**（不是只跑袁嘉这一份）：老师端上传任意一份此类志愿表 PDF → 自动识别学生 + 批次 → 在该批次原始方案上**派生下一版本** → 按 PDF 的「院校代码 + 专业组代码」把对应院校专业组逐条导入新版本（保持填报顺序）。

样例 PDF（`袁嘉_本科批B段_志愿方案_6.29.pdf`）已解析确认：学生 **袁嘉**、考生号 26510108150957、女、10 班、选科物理/化学/地理、批次**本科批次B段**，共 **41 个平行志愿**，每条为「院校代码 + 院校名 + 专业组代码 + 组内专业列表（带 2 位专业代号）+ 是否服从专业调剂（全为"是"）」。同校多组存在（如 5022 出现 507/508、5120 出现 111/115、3611 出现 501/505）→ **匹配键必须是「院校代码 + 专业组代码」联合**。

### 关键判断：底层机器全现成，本次是「解析 + 编排」

核查代码确认，落地所需的底层能力已在生产代码里：

| 能力 | 现状 | 位置 |
|---|---|---|
| 派生新版本（版本号 max+1、父版本 DRAFT→OUTDATED） | ✅ `deriveVersion`（**拷贝**父版本全部 PlanItem） | `plan.service.ts:605` |
| 把一个院校专业组落成一条 PlanItem | ✅ `PlanItemService.add(planId, dto)`：吃单个 `enrollmentPlanId`，自动推出院校/组/梯度/历史线快照、存 `selectedMajors`→`fullMajorRanking` | `plan-item.service.ts:100` |
| 院校代码+组代码 → 候选组解析键 | ✅ 院校代码=`University.code`→`universityId`；组=`(universityId, subjects, batch, recruitType, groupCode, year)` | `schema.prisma:616`（EnrollmentPlan，唯一键 line 673） |
| 版本对比 diff（红删/绿增） | ✅ `diffPlanItems` + `ComparePanel`（复用，看「推荐 vs 实填」） | `[id]/page.tsx` |
| 外部 PDF/OCR 解析微服务 | ✅ vh-ocr（Python FastAPI :8100），server 已有调用层 | `services/ocr-service/main.py`、`data-import.service.ts` |

**本次新增的只有**：① 把这类 PDF 解析成结构化 JSON；② 把 (院校代码,组代码) 解析成锚定 EP + selectedMajors（核心）；③ 认人/认批次；④ 「以实填项建新版本」（注意：**不是**复用会拷贝父项的 `deriveVersion`）；⑤ 老师端上传/预览/确认 UI。

## 2. 设计目标与非目标

**目标**
1. 老师上传一份志愿表 PDF，系统识别学生 + 批次，**经老师确认**后，在该学生该批次的最新版本上派生新版本。
2. 新版本内容 = **PDF 实填的 N 个院校专业组**，按填报顺序（**替换语义**，非合并）；父版本 = 原推荐方案；用现有版本对比看「推荐 vs 实填」。
3. 解析不到的组/专业**不阻断**整份导入：部分导入 + 给老师一份命中/未命中报告。
4. 服从专业调剂、组内专业选择顺序，尽量忠实还原 PDF。

**非目标（明确不做）**
- 不为「考生号」新增字段/迁移（认人靠姓名+班级+老师确认，见 §6 R2）。
- 不做 OCR 图像识别（这类系统导出 PDF 有干净文本层，走文本提取）。
- 不碰主管审核 / 家长确认 / 学生端流程。
- 不改版本对比 / diff / 方案列表 / 生成页（全部复用）。
- 不做「把实填版自动评优/重算推荐」——实填版只是忠实记录。

## 3. 架构：5 个组件（各自可独立测试）

| 编号 | 组件 | 职责 | 位置（建议） |
|---|---|---|---|
| ① | **PDF 解析** | PDF → 结构化 JSON | `services/ocr-service` 加 `POST /parse-volunteer-form` |
| ② | **组解析（核心）** | `(schoolCode, groupCode, year, subjects)` → 锚定 `enrollmentPlanId` + `selectedMajors[]` + 命中状态/原因 | server 新 `VolunteerFormResolverService` |
| ③ | **认人 / 认批次** | PDF 身份 → `studentId`（候选+确认）；批次名+选科 → `batchConfigId` | server |
| ④ | **导入建版** | 已解析项 → 派生新版本（空）+ 批量写 PlanItem | server 新 `VolunteerFormImportService` |
| ⑤ | **老师端 UI** | 上传 → 预览（认人确认 + 命中表）→ 确认执行 | web 新页面（视觉交 claude-design） |

建议新建 server 模块 `modules/plan-import/`，含 resolver / import service / controller / vh-ocr 调用 client。

## 4. 组件细节

### ① PDF 解析（vh-ocr 新端点）

- `POST /parse-volunteer-form`（multipart pdf）→ JSON：
  ```
  {
    identity: { name, examNumber, gender, classInfo, idMasked, foreignLang, examType, subjects },
    batch: "本科批次B段",
    volunteers: [
      { seq: 1, schoolCode: "5120", schoolName: "四川师范大学", groupCode: "111",
        majors: [ {code:"0G", name:"数学与应用数学"}, ... ], acceptAdjust: true },
      ...
    ]
  }
  ```
- 实现：pymupdf 提取文本（GBK 解码——已验证逐字节重组 `gbk` 可还原），按固定版式正则切分（"第一志愿NN"/"院校代码 院校名"/"组代码"/"专业列表（；分隔，2 位代号+名）"/"是否服从"）。底部页脚区取身份字段。
- server 侧加 `VolunteerFormParseClient`（仿 `data-import.service.ts` 调 OCR 的姿势）。

### ② 组解析（核心，最高风险，先做）

`VolunteerFormResolverService.resolveGroups(volunteers, { year, subjects })` →
对每条 volunteer：
1. `University.code === schoolCode` → `universityId`；查不到 → `unmatched(reason: '院校代码不在库')`。
2. 查 `EnrollmentPlan where (universityId, groupCode, batch=本科批B段, year)`（再按 `subjects` 匹配学生选科收敛）→ 该组所有专业行；0 行 → `unmatched(reason: '该批次无此专业组')`。
3. 组内专业：对 PDF 每个 `{code,name}`，在该组 EP 行里匹配——**先按 majorName（归一化）匹配，majorCode 作辅助**；命中的产出 `SelectedPlanMajorDto { order, enrollmentPlanId, majorId, majorName, majorCode }`。
4. **锚定 `enrollmentPlanId`** = 第一个命中专业的 EP 行；若无专业命中（专业名全对不上）→ 取该组任一 EP 行兜底，`selectedMajors` 为空（组仍算 matched，仅记 `note: '专业未对齐'`）。
5. 产出 `{ seq, status, anchorEnrollmentPlanId?, selectedMajors[], unmatchedReason?, note? }` + 汇总 `{ matched, unmatched, total }`。

> 纯解析、无副作用，**用袁嘉 41 条做 fixture 即可单测**，同时充当 R1 真实数据 go/no-go。

### ③ 认人 / 认批次

- **认批次**：批次名归一化（`本科批次B段` ↔ `本科批B段`，去/补"次"），`examType` 取自**学生档案**（`StudentProfile.examType`，物理/历史），查 `BatchConfig (year, province=四川, batch, examType)`（`schema.prisma:1658`）。查不到 → 中止并报「该批次未配置」。
- **认人**：在**当前老师名下学生**里，按 `User.realName === name`（+ `StudentProfile.classInfo` 含班号 + 掩码身份证前后缀比对）筛候选：
  - 唯一 → 预选（仍需老师在预览里确认）。
  - 多个/为零 → 返回候选列表，老师手选或去新建学生。
- **取原方案**：`listForStudent(studentId, { batchConfigId, latestOnly })`（`plan.service.ts`）取该批次最新版本作 parent；无则建 v1（parent 空）。

### ④ 导入建版（替换语义，**不复用 deriveVersion**）

新方法 `VolunteerFormImportService.commit({ studentId, batchConfigId, resolvedItems, versionNote })`，事务内：
1. 取 parent = 该 (student, batchConfig) 最新版本；`nextVersionNo = max(versionNo)+1`（无 parent 则 1）。
2. 建新 `VolunteerPlan`（status `DRAFT`、`parentVersionId=parent?.id`、`recommendType='MANUAL'`、`versionNote='从志愿表导入（实填）'`、name `${base}-v${n}`）。
3. **按 PDF 顺序写入命中项的 PlanItem**：复用 `PlanItemService.add` 的字段映射逻辑（院校/组/梯度/历史线快照/`fullMajorRanking`/`acceptAdjust`），`sequence` 用 PDF 顺位，`acceptAdjust` 取 PDF「是否服从」。为效率可抽出 `buildPlanItemData(ep, selectedMajors, seq, acceptAdjust, student)` 共享纯逻辑，循环 41 次（可接受），风险重算收尾跑一次。
4. parent 若为 `DRAFT` → 置 `OUTDATED`（沿用多稿锁初稿语义，自动只读）。
5. 返回新 planId，前端跳详情页。

> 为何不复用 `deriveVersion`：它会**拷贝父版本全部 PlanItem**（合并语义），与本次「替换为实填」相反。两者共享「版本号 max+1 / 父锁 OUTDATED」记账逻辑，可抽公共 helper，但**写入项的来源不同**，需独立方法。

### ⑤ 老师端 UI

- 入口：学生方案区「上传志愿表 PDF 导入」按钮。
- 流程页：上传 → 调 `preview` → 展示【认人确认（候选学生单选）+ 识别批次 + 命中表（41 行：顺位/院校/组/命中或未命中原因/专业对齐情况）+ 汇总「命中 N / 未命中 M」】→ 老师确认 → 调 `commit` → 跳新版本详情页。
- 视觉精修交 claude-design；本期只保功能骨架（antd 表格 + 上传 + 确认）。

### 端点

- `POST /plan-import/volunteer-form/preview`（multipart pdf）→ `{ importId, identity, batch, batchConfigId?, candidateStudents[], groups[], summary }`。
- `POST /plan-import/volunteer-form/commit` → `{ importId, studentId }` → `{ planId, versionNo }`。
  - `preview` 把解析后的结构化 JSON 暂存（按 `importId`，进程内缓存或临时表）；`commit` 据 importId + 选定 student **服务端重新解析落库**（解析对我方 DB 确定性，无需信任前端回传）。

## 5. 数据流（典型路径）

```
老师上传 PDF
  → ① vh-ocr 解析 → { 身份, 批次, 41×志愿 }
  → ③ 认批次(本科批B段+学生选科→batchConfigId) + 认人(姓名+班级→候选学生)
  → ② 逐条解析 (院校码→universityId→该组EP行→锚定EP + 专业按名匹配→selectedMajors)
  → preview 返回: 命中 N/41 + 未命中清单 + 候选学生   ← 老师在 UI 确认学生
  → commit:
       事务 ① 取 parent(原推荐方案最新版) → nextVersionNo=max+1
            ② 建新版本(DRAFT, parentVersionId=parent.id, versionNote=从志愿表导入)
            ③ 按顺位写入命中项 PlanItem(acceptAdjust=是, 梯度走现有算法)
            ④ parent(DRAFT) → OUTDATED
  → 跳 /teacher/plans/{新版本id} → 版本对比选原方案 → 看「推荐 vs 实填」红绿 diff
```

## 6. 边界与错误处理（均不静默）

- **R1 组未命中**（院校不在库 / 该批次无此组 / 批次对不上）→ 跳过 + 计入 `unmatched` 报告，其余照导。省外校（浙/湘/鄂/赣/滇/陕/鲁）只要库里有四川口径 2026 招生计划行即命中。
- **R2 认人只能靠姓名**：系统**无考生号字段**、PDF 证件号为掩码（`510181****0029`）→ 无法用考生号/完整身份证唯一反查。靠 姓名(+班级+掩码前后缀) 候选 + **老师确认这道关**。同名 → 候选多选；零命中 → 提示去新建学生。
- **R3 batchConfig 缺失** → 中止并明确报「该批次未配置，先配批次」（建不了方案）。
- **R4 专业代号未必=EP.majorCode** → 专业匹配**以专业名为主、代号为辅**；专业全不对齐时组仍导入（锚定取该组任一 EP，`selectedMajors` 空），记 `note`。
- **同组重复**：`PlanItemService.add` 本就按 (planId, universityId, groupCode) 去重；PDF 理论上无重复组，若有则后者跳过 + 记报告。
- **权限**：仅出方案老师可在自己学生上导入；commit 校验 `parent.createdById === userId`（无 parent 时校验该 student 属于该老师）。
- **无原方案** → 直接建 v1（parentVersionId 空，versionNo=1）。
- **解析失败 / 非此类 PDF**（无法提取出志愿条目）→ preview 报「无法识别为志愿表」，不进入后续。

## 7. 测试计划

**后端单测（TDD，先 ② 后其余）**
- `volunteer-form-resolver.service.spec.ts`（核心）：用袁嘉 41 条 fixture（mock EnrollmentPlan/University 查询）断言——命中数、锚定 EP 选取、selectedMajors 顺序与剔除、四类未命中归类、同校多组分别解析。
- `volunteer-form-import.service.spec.ts`：断言新版本 `versionNo=max+1`、`parentVersionId`、`status=DRAFT`、`versionNote`；按顺位写入条数 = 命中数；parent(DRAFT)→OUTDATED；`acceptAdjust` 透传。
- PDF 解析（①）：对样例 PDF 断言提取出 41 条志愿 + 身份字段（可在 Python 侧或 server 调用层加 fixture 测试）。

**真实数据验证（R1 go/no-go，实现第 1 步）**
- 拿袁嘉 41 个 (院校码,组码) 跑真实 2026 库，出命中率 + 未命中清单。命中率过低 → 先查数据完整性 / 调匹配，再继续。

**真人验证**
- 上传袁嘉 PDF → 确认认到袁嘉 + 本科批B段 → 看命中表 → 确认 → 跳新版本 → 版本对比原方案看红绿 diff；原方案(若 DRAFT)变只读。

## 8. 实现顺序（风险优先，粒度 2–5 分钟）

1. **②组解析 service + 单测（fixture）** → 接真实 2026 库跑袁嘉 41 码出命中率（**go/no-go**）。
2. ①vh-ocr `/parse-volunteer-form` 端点 + server 调用 client（对样例 PDF 出 41 条）。
3. ③认人/认批次（批次名归一化 + 学生候选）。
4. ④`VolunteerFormImportService.commit` + 单测（建版/写项/锁父）。
5. controller 两端点（preview/commit）+ importId 暂存。
6. **后端闭环可跑**：用脚本驱动把袁嘉这份导进去（满足最初诉求），再做 ⑤。
7. ⑤老师端上传/预览/确认 UI（骨架；视觉交 claude-design）。
8. 收尾：两端 build + 单测 + 真人走查。

> 第 6 步即可交付「把袁嘉这份导入」的最初诉求；其后向「可复用功能」收口。
