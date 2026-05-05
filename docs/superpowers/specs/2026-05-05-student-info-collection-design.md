# 学生信息采集与管理 V1 设计文档

- 日期：2026-05-05
- 范围：B（补完字段 + W3 渐进采集 + 老师端单页 form 扩字段 + xlsx 接待单导出）
- 状态：已实现 (M1-M7, 2026-05-05)
- 后续：C 阶段（家长独立账号、Excel/OCR 导入、AI 渐进对话采集、老师代填模式）

## 1. 背景与动机

### 1.1 现状

- 后端 `StudentProfile` 已有 60+ 字段（个人/考试/身体/规划/偏好/排除/经济/兴趣），`StudentService` 提供 create / findByTeacher / findById / updateProfile（带乐观锁 + 完整度计算）/ assignTeacher
- 老师端 `/teacher/students/{create, [id], list}` 三页面已就位
- 学生端 `/student/profile` 仅 ~10 字段，远未发挥 schema 能力
- 西典学校 2025 高考志愿咨询接待单（线下纸质表格）覆盖了真实采集场景中的核心字段

### 1.2 问题

1. **学生端体验差**：现有 3 Tab 表单与 60+ schema 字段之间巨大鸿沟；学生面对一坨字段不知从何下手
2. **字段缺漏**：接待单 9 项字段（政治面貌、户籍 vs 高考所在地分离、视力左右+矫正、既往病史、加分政策、意向批次、偏远/冷门接受度细分、填表元信息）schema 未覆盖
3. **权限边界模糊**：总分/位次/加分这类计算关键字段，学生若误填则推荐结果失真，但当前无字段级权限
4. **完整度算法误导**：现 `calculateCompleteness` 把总分位次也算"必填"，但学生根本不能填，导致学生进度永远偏低
5. **离线流程断链**：老师线下接待时无法快速产出与原 Excel 一致的纸质归档

### 1.3 目标

- 学生 5 分钟完成"核心阶段"基本档案，多次回访逐步精细化
- 老师以单页 form 快速录入/审核 60+ 字段，含 ①类独占字段
- 一键导出与现有 Excel 模板一致的 .xlsx 登记表用于线下打印归档
- 双轨完整度让学生与老师各看各的进度，分别催办

### 1.4 不在范围

- 家长独立角色 / 独立登录（C 阶段）
- Excel 接待单批量导入 / OCR（C 阶段）
- AI 渐进对话式采集（C 阶段，memory 已注明优先级最低）
- 老师代填模式（C 阶段）
- 模板管理 UI（C 阶段；本期模板硬编码在仓库）
- 字段级审核状态机（决策已排除，详见 §2 决策表与 §3.3）

---

## 2. 关键决策

| 决策 | 选项 | 选择 | 理由 |
|---|---|---|---|
| 范围 | A 最小 / **B 体验重做** / C 完整 | B | A 不解决学生端体验差；C 含独立子项目应分开 |
| 家长 | **a 共用学生账号** / b 独立角色 / c 推迟 | a | 0 schema 改动，仅加填表人/签字字段；不污染 RBAC 测试矩阵；不阻碍未来升级到 b |
| 权限实现 | **A CASL 字段分层 + 无审核** / B 档案级审核 / C 字段级审核 | A | "老师独占即学生看不到"语义最直白；省一套状态机/UI/通知 |
| 学生端 | W1 单页 Tab / W2 线性 wizard / **W3 三阶段渐进** | W3 | 契合 memory「渐进采集」原则；5 分钟核心阶段降低首次采集压力；老师端筛选「档案完整度 < 70%」可催办 |
| 接待单导出 | **P1 exceljs xlsx** / P2 Puppeteer PDF / P3 pdfkit / P4 双路径 | P1 | xlsx 比 PDF 在学校场景更实用（可二次编辑/加备注列）；服务端无 Chromium/字体依赖 |
| 模板存储 | **a 仓库内置** / b 数据库表 | a | B 范围不做模板管理 UI |
| 视力旧字段 | **a 保留兼容** / b 写迁移脚本 | a | 旧数据估计是空或测试数据 |
| 加分项明细 | **a JSON** / b 关联表 | a | 加分项一般 0-2 项，无统计需求 |
| 意向批次 | **a JSON 数组** / b 关联表 | a | 同上 |

---

## 3. 数据模型

### 3.1 新增枚举

```prisma
enum PoliticalStatus {
  PARTY_MEMBER     // 党员
  LEAGUE_MEMBER    // 团员
  MASSES           // 群众
}

enum BonusPolicyStatus {
  NONE             // 没有
  HAS_BONUS        // 有
  UNKNOWN          // 不清楚
}

enum RemoteAreaAcceptance {
  ABSOLUTELY_NO    // 绝对不接受
  BACKUP_ONLY      // 仅保底院校可接受
  FAMOUS_OK        // 名校可接受
  GOOD_MAJOR_OK    // 好专业可接受
}

enum ColdMajorAcceptance {
  ABSOLUTELY_NO
  FAMOUS_OK
  DEVELOPED_AREA_OK
  GOOD_PROSPECT_OK
}

enum FormFiller {
  STUDENT          // 学生本人
  PARENT           // 家长
  TOGETHER         // 共同填写
}
```

### 3.2 `StudentProfile` 字段增量

| # | 字段 | 类型 | 归属 | 说明 |
|---|---|---|---|---|
| 1 | `politicalStatus` | `PoliticalStatus?` | ② | 政治面貌 |
| 2a | `examLocationProvince` | `String?(50)` | ① | 高考所在地省 |
| 2b | `examLocationCity` | `String?(100)` | ① | 高考所在地市 |
| 2c | `examLocationCounty` | `String?(100)` | ① | 高考所在地县 |
| 3a | `visionLeft` | `Decimal?(3,1)` | ② | 裸眼视力左 |
| 3b | `visionRight` | `Decimal?(3,1)` | ② | 裸眼视力右 |
| 3c | `visionLeftCorrected` | `Decimal?(3,1)` | ② | 矫正视力左 |
| 3d | `visionRightCorrected` | `Decimal?(3,1)` | ② | 矫正视力右 |
| 4 | `medicalHistory` | `String? @db.Text` | ② | 既往病史/特殊情况 |
| 5a | `bonusPolicyStatus` | `BonusPolicyStatus?` | ① | 加分政策状态 |
| 5b | `bonusItems` | `Json?` | ① | `[{type, value, source}]` |
| 6 | `preferredBatches` | `Json?` | ② | 意向批次（用 `Batch` 枚举值数组） |
| 7 | `remoteAreaAcceptance` | `RemoteAreaAcceptance?` | ② | 偏远地区接受度 |
| 8 | `coldMajorAcceptance` | `ColdMajorAcceptance?` | ② | 冷门专业接受度 |
| 9a | `formFiller` | `FormFiller?` | ③ | 填表人（学生端独有写） |
| 9b | `parentSignedAt` | `DateTime?` | ③ | 家长签字时间，null = 未签字 |
| 9c | `intakeFormVersion` | `String?(10)` | 系统 | 接待单模板版本号（默认 `"2025-v1"`，系统自动写入，前端不可改） |

**索引**：无新增（这些字段非查询热点）。

**保留不动**：
- `province / city / county` 语义为**户籍地**，归 ① 类
- `vision: String` 标注 `@deprecated`，新代码不再写
- `stayPreference / acceptLevel` 与新字段语义不重叠，保留各自含义

### 3.3 排除：审核状态机

不引入 `ProfileReviewStatus` 枚举或 `submittedAt / reviewedAt / reviewerId` 字段。学生改 ② 字段直接生效，老师可随时覆盖。"老师审核"退化为"老师打开档案过一眼"。

---

## 4. 字段权限分层

### 4.1 三类字段集

```typescript
// apps/server/src/modules/student/field-policy.ts

export const TEACHER_ONLY_FIELDS = [
  // 考试分数
  'totalScore', 'provincialRank',
  'scoreChinese', 'scoreMath', 'scoreEnglish',
  'scoreFirstChoice', 'scoreSub1', 'scoreSub2',
  // 加分政策
  'bonusPolicyStatus', 'bonusItems',
  // 户籍 + 农村
  'province', 'city', 'county', 'isRural',
  // 高考所在地
  'examLocationProvince', 'examLocationCity', 'examLocationCounty',
] as const;

export const STUDENT_ONLY_FIELDS = [
  'formFiller', 'parentSignedAt',
] as const;

// 其余字段为 ②类（学生可编辑、老师可覆盖）
```

### 4.2 W3 三阶段字段分组

```typescript
export const STAGE_1_REQUIRED = [
  'realName', 'phone', 'gender', 'examType', 'parentPhone', 'formFiller',
] as const;

export const STAGE_2_FIELDS = [
  // 身体条件
  'height', 'weight',
  'visionLeft', 'visionRight', 'colorBlind', 'colorWeak',
  // 偏好基础
  'preferredProvinces', 'preferredCities', 'preferredMajors',
  'preferredUniversities', 'preferredMajorCategories',
  // 升学规划
  'priorityMode', 'careerPlan', 'careerDirection', 'preferredBatches',
] as const;

export const STAGE_3_FIELDS = [
  // 偏好细分
  'remoteAreaAcceptance', 'coldMajorAcceptance',
  'stayPreference', 'preferredTags',
  'excludedProvinces', 'excludedCities', 'excludedUniversities', 'excludedMajors',
  // 兴趣性格
  'interests', 'personalityType', 'selfDescription',
  'militaryInterest', 'teacherInterest',
  // 经济条件
  'tuitionBudget', 'acceptSinoForeign', 'acceptPrivate', 'acceptCooperation',
  'otherRequirements',
  // 高级身体
  'visionLeftCorrected', 'visionRightCorrected',
  'physicalLimits', 'medicalHistory',
  // 个人补充
  'ethnicity', 'politicalStatus',
] as const;
```

### 4.3 落地：service 层白名单

不依赖 CASL field-level 特性（不成熟），改用 service 层 select 白名单：

```typescript
// student.service.ts 新增方法
async getMyProfile(userId: number) {
  const profile = await this.prisma.studentProfile.findUnique({
    where: { userId },
    select: this.buildStudentSelectMask(),  // 排除 TEACHER_ONLY_FIELDS
  });
  // ...
}

async updateMyProfile(userId: number, dto: UpdateStudentProfileDto) {
  // 在白名单过滤层面拒绝 TEACHER_ONLY_FIELDS
  this.assertNoTeacherOnlyFields(dto);
  // ... 其余复用 updateProfile
}
```

CASL 仍负责粗粒度 read/update 权限；细粒度字段隔离在 service。

### 4.4 新增 Controller 端点（学生端）

```
GET  /students/me           — 学生看自己的档案（自动排除 ① 字段）
PUT  /students/me           — 学生改自己的 ②③ 字段（拒绝 ① 字段）
GET  /students/me/progress  — 返回 stageProgress + studentSelfCompleteness
```

老师端继续走现有 `/students/:id` 系列。

---

## 5. 完整度算法（双轨制）

### 5.1 接口

```typescript
type ProfileProgress = {
  studentSelfCompleteness: number;   // 0-100，仅②③字段
  teacherDataCompleteness: number;   // 0-100，仅①字段
  stageProgress: {
    stage1: { filled: number; total: number; completed: boolean };
    stage2: { filled: number; total: number; completed: boolean };
    stage3: { filled: number; total: number; completed: boolean };
  };
  overallCompleteness: number;       // ①40% + ②60% 加权
  isRecommendable: boolean;          // teacherDataCompleteness === 100 && stage1.completed
  missingFieldsForRecommend: string[]; // 当 isRecommendable=false 时列出缺什么
};
```

### 5.2 计算规则

- 字段"已填"判定：`value !== null && value !== undefined && (Array.isArray(value) ? value.length > 0 : true)`
- `studentSelfCompleteness` = 已填 ②类字段数 / ②类字段总数 × 100
- `teacherDataCompleteness` = 已填 ①类字段数 / ①类字段总数 × 100
- `stageN.completed`：阶段所有字段都已填
- `overallCompleteness` = `teacherDataCompleteness × 0.4 + studentSelfCompleteness × 0.6`
- `isRecommendable = teacherDataCompleteness === 100 && stage1.completed`

### 5.3 兼容现有 `calculateCompleteness`

保留旧方法签名（返回 number），内部委托给新双轨算法的 `overallCompleteness`，避免老调用方破坏。

### 5.4 「档案可推荐」阈值的连锁

- 学生端推荐入口：`isRecommendable=false` 时按钮禁用 + tooltip 提示老师未录入哪些
- 老师端「生成方案」按钮：同上
- 旧 `status === ACTIVE` 不变，与新阈值并行

---

## 6. 学生端 UI（W3）

### 6.1 路由结构

```
/student/profile                          → 阶段卡片 dashboard 入口
/student/profile/stage/[1|2|3]            → 各阶段表单
```

### 6.2 Dashboard 入口设计

- 顶部双进度条：`studentSelfCompleteness` + `overallCompleteness`
- 三张阶段卡片纵向排列：
  - **核心阶段**：6 字段，预计 5 分钟，含徽章 "初步档案"
  - **完善阶段**：约 15 字段，含徽章 "可生成方案"
  - **高级阶段**：约 20 字段，含徽章 "精准推荐"
- 每卡片显示 `已完成 N/M` + 阶段完成度 mini 进度条 + "去填写"按钮
- ①类字段以折叠区域展示（只读）："由老师录入的信息"
- 底部 CTA："查看老师为我生成的方案"（不被阶段进度阻断）

### 6.3 阶段表单设计

- 每阶段独立路由的小 form
- 顶部当前阶段进度条 + 上一阶段/下一阶段切换链接
- 每个字段独立保存（防止丢失）：失焦自动保存 / 顶部"保存"按钮
- 完成阶段所有字段后弹徽章动画 + 提示"已解锁 XXX"
- 不强制按顺序：可跳到任何阶段填

### 6.4 既有 `/student/profile/page.tsx` 改造

- 现有 220 行的 3 Tab 单页废弃，重做为阶段卡片 dashboard
- 前端 `studentApi.getMyProfile` / `updateMyProfile` 函数名保留，绑定到本期新增的 `GET/PUT /students/me` 端点；前端 hook 响应结构对齐到 §5.1 的 `ProfileProgress`
- `HealthCheckboxGroup` / `CountyCascader` 组件迁移到对应阶段表单复用

---

## 7. 老师端 UI

### 7.1 `/teacher/students/create`

不动，保持极简（4 字段）+ 创建后跳详情页。

### 7.2 `/teacher/students/[id]`

- 头部：双进度条 `studentSelfCompleteness` / `teacherDataCompleteness` + `overallCompleteness` 总分 + 「导出登记表」按钮
- 表单：单页 + Collapse 折叠面板（默认全展开）。每分组内字段标 ①/② 角标，①字段在分组标题加"老师独占"图标
  - 基本信息（②类：姓名/性别/民族/政治面貌/电话/家长电话）
  - 户籍 + 高考所在地（①类）
  - 考试成绩（①类：单科分 + 总分 + 位次）
  - 加分政策（①类：状态 + bonusItems 列表）
  - 身体条件（②类：身高/体重/视力/色觉/既往病史）
  - 升学规划（②类：优先模式/职业方向/意向批次）
  - 偏好（②类：正向 + 反向 + 偏远/冷门接受度）
  - 经济与兴趣（②类）
- 复用现有 `Form` + `Collapse`，不引入新组件库
- 保存：单次提交整 form，复用 `PUT /students/:id/profile` + 乐观锁

### 7.3 `/teacher/students`

列表加 2 列：
- `自填进度`：进度条 + 数字
- `录入进度`：进度条 + 数字

筛选：
- `自填进度 < 50%` / `< 80%` / `100%`
- `录入进度 < 100%` / `100%`
- 排序：按各完整度升降序

---

## 8. 接待单导出（exceljs）

### 8.1 模板

- 路径：`apps/server/templates/intake-form-2025-v1.xlsx`
- 内容：与原始西典 2025 接待单完全一致的格式（含签字栏 + 注释）
- 启动时通过 `ConfigService` 注入路径

### 8.2 服务

```typescript
// apps/server/src/modules/student/intake-export.service.ts

@Injectable()
export class IntakeExportService {
  async export(studentId: number): Promise<Buffer> {
    const profile = await this.studentService.findById(studentId);
    const workbook = await this.loadTemplate();
    this.fillCells(workbook, profile);
    return await workbook.xlsx.writeBuffer();
  }

  private fillCells(wb: ExcelJS.Workbook, profile: StudentProfile) {
    const ws = wb.getWorksheet('Sheet1');
    ws.getCell('B2').value = profile.user.realName;
    ws.getCell('B3').value = this.genderLabel(profile.user.gender);
    // ... 按 §F 表格映射约 35 个单元格
  }
}
```

### 8.3 端点

```
GET /students/:id/export-intake
  Headers: Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
  Body: <xlsx binary stream>
  Filename: 接待单_<realName>_<YYYYMMDD>.xlsx
```

CASL：仅老师/管理员可调用。

### 8.4 字段映射表（精简示例）

| Excel 单元格 | 字段 | 转换 |
|---|---|---|
| B2 | `user.realName` | 直接 |
| B3 | `user.gender` | MALE→男, FEMALE→女 |
| B4 | `user.ethnicity` | 直接 |
| B5 | `politicalStatus` | 党员/团员/群众 标记勾选框 |
| D2 | `province + city + county` | 拼接户籍地 |
| D3 | `examLocationProvince + ...` | 拼接高考地 |
| D4 | `user.phone` | 直接 |
| B6 | `height` | 数值 |
| D6 | `weight` | 数值 |
| B7 / E7 | `visionLeft/Right`, `visionLeftCorrected/RightCorrected` | 左/右 数值 |
| C9 | `colorBlind / colorWeak` | 单选标记 |
| ... | ... | ... |
| B22 | `preferredMajors` | 数组逗号拼接 |
| C23 | `acceptLevel` 或新映射 | 三选一标记 |
| C24 | `remoteAreaAcceptance` | 四选一标记 |
| C25 | `coldMajorAcceptance` | 四选一标记 |
| 签字栏 | `parentSignedAt` | 已签 → 显示日期；未签 → 留空 |

完整映射见后续 plan 文档；模板存仓库后单元测试守住映射不破。

---

## 9. 测试策略

### 9.1 后端单元测试

| 测试套件 | 目标 |
|---|---|
| `field-policy.spec.ts` | TEACHER_ONLY_FIELDS / STUDENT_ONLY_FIELDS / 三阶段字段分组无重叠且并集等于 schema 字段全集 |
| `student.service.spec.ts`（扩） | `getMyProfile` 返回不含 ① 字段；`updateMyProfile` 收到 ① 字段时抛 ForbiddenException |
| `progress.service.spec.ts` | 双轨完整度 + stageProgress + isRecommendable 5+ 用例：空档案 / 仅 stage1 完整 / 仅 ① 字段填齐 / 全填 / 边界值 |
| `intake-export.service.spec.ts` | 用 exceljs 解析生成的 Buffer，校验关键单元格值；模板缺失时报清晰错误 |

### 9.2 后端集成测试

- `PUT /students/me` 学生身份提交含 `totalScore` → 403 + 错误消息明确
- `GET /students/me` 响应中无 ① 字段
- `GET /students/:id/export-intake` 老师身份返回正确 Content-Type + 文件名

### 9.3 前端 E2E（可选，B 范围内仅做关键路径）

- 学生登录 → dashboard 显示 3 阶段卡片 → 完成 stage1 → 徽章弹出 → `studentSelfCompleteness` 更新
- 老师登录 → 学生详情页改总分 → 保存成功 → 学生侧 `getMyProfile` 不返回该字段但 `isRecommendable` 变 true

### 9.4 TDD 顺序

按 superpowers TDD skill 严格 RED→GREEN→REFACTOR：
1. 先写 `field-policy.spec.ts`（红） → 实现常量（绿）
2. 写 `progress.service.spec.ts`（红） → 实现算法（绿）
3. 写 `student.service.spec.ts` 学生白名单（红） → 改 service（绿）
4. 写 `intake-export.service.spec.ts`（红） → 实现导出（绿）
5. 前端按页面顺序，每页先写 mock + happy-path 后实装

---

## 10. 实施顺序与里程碑

按"数据 → 后端 → 前端"线性推进，每段独立可测可合并；后续 plan 文档拆分原子任务：

1. **M1：schema + migration + 枚举**
   - 加枚举、字段、生成 Prisma migration
   - 跑现有测试套件，确保无破坏

2. **M2：字段权限白名单 + ProfileProgress 服务**
   - `field-policy.ts` 常量 + 单元测试（断言三类无重叠且并集等于 schema 全字段集）
   - `progress.service.ts` 双轨算法 + 单元测试
   - 修补 `calculateCompleteness` 兼容层

3. **M3：学生端 API + 老师端 API 扩字段**
   - 新增 `GET/PUT /students/me`、`GET /students/me/progress` + 集成测试
   - `UpdateStudentProfileDto` 添加新字段
   - `student.service` 增加新枚举支持

4. **M4：xlsx 导出**
   - 仓库放模板文件
   - `IntakeExportService` + 单元测试 + 端点

5. **M5：学生端 UI 改造**
   - `/student/profile` 改 dashboard 入口
   - 三个阶段表单页
   - 徽章/进度条交互

6. **M6：老师端 UI 改造**
   - 详情页 Collapse 扩字段 + 导出按钮
   - 列表页双进度列 + 筛选

7. **M7：联调 + PR review**

每段完成后跑全套测试 + 通过 PR 后再开下一段；M5/M6 可并行（前端两个角色互不阻塞）。

---

## 11. 风险与缓解

| 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|
| Excel 模板单元格位移导致映射错乱 | 中 | 高 | 模板版本号字段 + `intake-export.service.spec.ts` 守住关键单元格 |
| 字段权限白名单遗漏 → 学生看到敏感字段 | 中 | 高 | `field-policy.spec.ts` 强制断言"两类无重叠且并集等于全字段集" |
| 现有 `calculateCompleteness` 调用方被破坏 | 低 | 中 | 保留兼容签名，内部委托新算法 |
| W3 dashboard 状态计算成本高（每次进入都算双轨完整度） | 低 | 低 | 服务端单次计算返回，前端不二次计算；后续可缓存到 `data_version` 关联 |
| 老师端列表筛选导致性能问题 | 低 | 中 | 完整度计算字段不入数据库（运行时计算）；列表分页 + 索引现有 `serviceYear/teacherId/status` |
| `bonusItems` JSON 缺校验 | 中 | 中 | DTO 用 `class-validator` 嵌套校验 + 服务层 schema 守门 |

---

## 12. 后续工作（C 阶段预告）

- 家长独立角色 + `parentOfStudentId` 自关联
- Excel 接待单 OCR 批量导入
- AI 渐进对话采集（替代 W3 表单）
- 老师代填模式（一对多接待时直接录入）
- 接待单模板管理 UI
- 字段级审核工作流（如有需要）

---

## 13. 参考

- 数据来源样本：`data/03_专家版主表/output/2025西典志愿填报接待单.xlsx`
- 角色文档：`E:/Soft/Cube/10-Projects/VolunteerHelper/roles/{overview,student,teacher}.md`
- RBAC 决策：`E:/Soft/Cube/10-Projects/VolunteerHelper/decisions/casl-rbac.md`
- 现有代码：
  - `apps/server/prisma/schema.prisma`（StudentProfile 行 548-651）
  - `apps/server/src/modules/student/{student.service.ts, student.controller.ts, dto/}`
  - `apps/web/src/app/(student)/student/profile/page.tsx`
  - `apps/web/src/app/(teacher)/teacher/students/{create,[id],list}/page.tsx`
