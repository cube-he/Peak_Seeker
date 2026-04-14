# 智愿家 — 高考志愿填报系统整体规划设计

> 日期：2026-04-14
> 版本：v1.2（完善补充版）
> 目标：2026年6月中旬上线，服务四川高考考生

---

## 一、项目定位

C端产品 + 专家工具兼顾的高考志愿填报系统。

- **管理员**：系统管理、数据导入、权限配置、全局监控
- **老师**：志愿填报顾问，为学生生成/编辑/审核完整志愿方案
- **学生**：查看老师方案、轻量自助推荐、浏览院校专业库

核心价值：将线下专家级志愿填报能力（v4.4系统抽样算法）完整产品化。

---

## 二、系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                      前端 (Next.js 14)                       │
│  ┌────────────┐  ┌────────────────┐  ┌─────────────────┐    │
│  │(student)   │  │ (teacher)      │  │ (admin)         │    │
│  │ 学生端     │  │ 老师工作台      │  │ 管理员后台       │    │
│  │ 移动优先   │  │ 桌面优先        │  │ 桌面only        │    │
│  └────────────┘  └────────────────┘  └─────────────────┘    │
│  middleware.ts (统一路由守卫，角色→重定向)                     │
│  Route Groups 三端 layout 隔离                               │
└──────────────────────┬──────────────────────────────────────┘
                       │ REST API
┌──────────────────────┴──────────────────────────────────────┐
│                     后端 (NestJS 10)                         │
│                                                              │
│  ┌────────┐ ┌──────────────┐ ┌────────────┐ ┌───────────┐  │
│  │ Auth   │ │ RBAC (CASL)  │ │ User       │ │ Plan      │  │
│  │ +JWT   │ │ +PoliciesGrd │ │ +Profile   │ │ +版本+审核 │  │
│  └────────┘ └──────────────┘ └────────────┘ └───────────┘  │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │           推荐引擎 (RecommendEngine)                 │    │
│  │   v4.4完整算法 + 征集分析 + 多批次 + 趋势            │    │
│  │   通过 Bull 队列异步执行，SSE 推送进度和完成通知      │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌────────┐ ┌──────────┐ ┌──────────────┐ ┌────────────┐  │
│  │ Import │ │ Browse   │ │ Export       │ │ AI (后期)  │  │
│  │ +事务  │ │          │ │ +Bull队列生成 │ │            │  │
│  └────────┘ └──────────┘ └──────────────┘ └────────────┘  │
│                                                              │
│  ┌──────────────┐ ┌──────────────┐                          │
│  │ Notification │ │ Bull Queue   │                          │
│  │ +SSE推送     │ │ 方案生成/导出 │                          │
│  └──────────────┘ └──────────────┘                          │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────┴──────────────────────────────────────┐
│  PostgreSQL        Redis                OCR Service          │
│  +复合索引         +备选池缓存           (Python FastAPI)     │
│  +汇总表           +队列存储                                 │
│  +分步迁移         +SSE连接管理                               │
└─────────────────────────────────────────────────────────────┘
```

---

## 三、用户角色与权限

### 3.1 角色体系

- **管理员**：超级角色，拥有全部权限，可为任意老师/学生开启或关闭特定权限
- **老师**：分主管老师和普通老师。主管可审核所有方案、自审直接定版；普通老师需提交审核
- **学生**：查看方案、轻量推荐、信息填写。可由老师直接创建（主要路径）或自行注册

### 3.2 权限模型（CASL）

采用 NestJS 官方推荐的 CASL 库实现细粒度权限控制，替代自研权限表。

```
核心概念：
  Ability = can(action, subject, conditions)

  action:  manage | create | read | update | delete | review | export | ...
  subject: User | Student | Plan | PlanItem | ...
  conditions: { createdBy: userId } | { assignedTeacherId: userId } | ...
```

```typescript
// CaslAbilityFactory — 权限工厂
createForUser(user: User) {
  const { can, cannot, build } = new AbilityBuilder(createMongoAbility);

  // 管理员：全部权限
  if (user.role === 'ADMIN') {
    can('manage', 'all');
  }

  // 老师：管理自己的学生和方案
  if (user.role === 'TEACHER') {
    can('create', 'Student');
    can('manage', 'Student', { assignedTeacherId: user.id });
    can('manage', 'Plan', { createdBy: user.id });
    can('read', 'University');
    can('read', 'Major');
    can('export', 'Plan', { createdBy: user.id });

    if (user.teacherProfile?.isSupervisor) {
      can('review', 'Plan');        // 主管：审核所有方案
      can('publish', 'Plan');       // 主管：直接发布
    } else {
      can('review', 'Plan', { reviewerId: user.id });  // 仅审核指定给自己的
    }
  }

  // 学生：查看自己的方案
  if (user.role === 'STUDENT') {
    can('read', 'Plan', { studentId: user.id });
    can('update', 'StudentProfile', { userId: user.id });
    can('read', 'University');
    can('read', 'Major');
    can('use', 'LightRecommend');
  }

  // 管理员的个人权限覆盖
  for (const override of user.permissionOverrides ?? []) {
    if (override.granted) can(override.action, override.subject);
    else cannot(override.action, override.subject);
  }

  return build();
}
```

**PoliciesGuard 执行机制**：
```
HTTP请求 → JwtAuthGuard(验证身份) → PoliciesGuard(检查CASL能力) → Controller
```

**收益**：
- 支持数据级别权限（"老师只能操作自己名下的学生"）
- 管理员覆盖通过 `permissionOverrides` JSON 字段实现，不需额外表
- NestJS 原生集成度高

### 3.3 学生创建路径

```
路径A（老师主导）：老师登录 → 创建学生 → 填写信息 → 开始服务
  可选：生成邀请码/链接 → 学生激活账号后可查看方案
路径B（学生自助）：学生注册 → 填写信息 → 待分配池 → 管理员分配老师
```

---

## 四、数据模型

### 4.1 核心设计原则

- **User 表拆分**：避免"上帝模型"，User 只存通用字段，角色特定数据拆到 Profile 表
- **备选池不入库**：临时计算结果存 Redis 缓存（TTL 7天），过期静默重算
- **征集汇总用物理表**：导入征集数据时同步刷新汇总表，查询零开销
- **复合索引**：引擎核心查询路径必须有索引覆盖
- **分步迁移**：大改动分多次 migration，每步验证数据完整性

### 4.2 模型定义

#### User（通用，精简）

```prisma
model User {
  id                    Int       @id @default(autoincrement())
  username              String    @unique
  phone                 String    @unique
  email                 String?   @unique
  password              String
  role                  Role      // ADMIN | TEACHER | STUDENT
  realName              String?
  gender                Gender?   // MALE | FEMALE
  avatar                String?
  ethnicity             String?   // 民族
  permissionOverrides   Json?     // CASL覆盖 [{action, subject, granted}]
  lastLoginAt           DateTime?
  createdAt             DateTime  @default(now())
  updatedAt             DateTime  @updatedAt

  teacherProfile        TeacherProfile?
  studentProfile        StudentProfile?
  createdPlans          VolunteerPlan[]   @relation("PlanCreator")
  reviews               PlanReview[]
  notifications         Notification[]

  @@index([role])
}
```

#### TeacherProfile

```prisma
model TeacherProfile {
  id            Int     @id @default(autoincrement())
  userId        Int     @unique
  user          User    @relation(fields: [userId], references: [id])
  school        String? // 所在学校/机构
  isSupervisor  Boolean @default(false)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  students      StudentProfile[] @relation("TeacherStudents")
}
```

#### StudentProfile（8组字段）

```prisma
model StudentProfile {
  id                  Int       @id @default(autoincrement())
  userId              Int       @unique
  user                User      @relation(fields: [userId], references: [id])
  status              StudentStatus // PENDING_INFO | INFO_COMPLETE | ASSIGNED | IN_SERVICE | PLAN_DELIVERED
  assignedTeacherId   Int?
  assignedTeacher     TeacherProfile? @relation("TeacherStudents", fields: [assignedTeacherId], references: [id])
  assignedAt          DateTime?
  infoCompleteness    Int       @default(0) // 信息完整度百分比

  // ---- 第一组：基本信息 ----
  // realName, gender, ethnicity 在 User 上
  idNumberEncrypted   String?   // 身份证号（AES-256-GCM加密存储）
  parentPhone         String?
  highSchool          String?
  classInfo           String?
  province            String    @default("四川")
  city                String?
  isRural             Boolean   @default(false)

  // ---- 第二组：考试成绩 ----
  examYear            Int?
  examType            ExamType?   // PHYSICS | HISTORY
  firstChoice         String?     // 物理 | 历史
  reChoices           Json?       // ["化学", "地理"]
  scoreChinese        Int?
  scoreMath           Int?
  scoreEnglish        Int?
  scoreFirstChoice    Int?
  scoreSub1           Int?
  scoreSub2           Int?
  totalScore          Int?
  provincialRank      Int?        // 系统由一分一段表推导
  strongSubjects      Json?       // 选填，不填系统推断
  weakSubjects        Json?       // 同上

  // ---- 第三组：身体条件 ----
  physicalCondition   Json?       // {height, weight, visionLeft, visionRight, visionCorrectedL, visionCorrectedR, colorVision, healthNote}

  // ---- 第四组：升学规划 ----
  priorityMode        PriorityMode? // A(院校优先) | B(专业优先)
  careerPlan          CareerPlan?   // EMPLOYMENT | POSTGRAD | CIVIL_SERVICE | ABROAD | UNDECIDED
  careerDirection     String?
  militaryInterest    Boolean @default(false)
  teacherInterest     Boolean @default(false)

  // ---- 第五组：正向偏好 ----
  preferredMajors         Json?   // ["计算机类", "人工智能"]
  preferredUniversities   Json?   // ["四川大学", "电子科技大学"]
  preferredCities         Json?   // ["成都", "北京"]
  preferredProvinces      Json?   // ["四川", "北京"]
  stayInProvince          StayPreference? // PREFER_LOCAL | NO_PREFERENCE | PREFER_OUTSIDE

  // ---- 第六组：反向排除（绝对不接受）----
  excludedMajors          Json?   // ["法学", "护理学"]
  excludedUniversities    Json?
  excludedCities          Json?
  excludedProvinces       Json?

  // ---- 第七组：经济与特殊条件 ----
  tuitionBudget       TuitionBudget? // LOW | MEDIUM | HIGH
  acceptPrivate       Boolean @default(false)
  acceptCooperation   Boolean @default(false)
  specialProgram      Json?   // ["NATIONAL", "LOCAL", "UNIVERSITY"]
  otherRequirements   String?

  // ---- 第八组：兴趣性格（选填）----
  interests           Json?   // ["科技", "文学"]
  personalityType     String?
  selfDescription     String? @db.Text

  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  plans               VolunteerPlan[]
  filingRecords       FilingRecord[]
  admissionResults    AdmissionResult[]

  @@index([assignedTeacherId])
  @@index([status])
  @@index([examType, totalScore])
}
```

#### VolunteerPlan（方案，版本化+审核+多批次）

```prisma
model VolunteerPlan {
  id                Int       @id @default(autoincrement())
  studentId         Int
  student           StudentProfile @relation(fields: [studentId], references: [id])
  createdById       Int
  createdBy         User      @relation("PlanCreator", fields: [createdById], references: [id])

  // 批次与考试来源
  batch             Batch     // EARLY | SPECIAL_A | NORMAL_B | JUNIOR_COLLEGE
  examSource        ExamSource @default(GAOKAO)  // 区分模拟/正式
  examNote          String?   // 如"2026成都二诊，总分580"

  // 版本管理
  versionNo         Int       @default(1)
  parentVersionId   Int?
  parentVersion     VolunteerPlan? @relation("PlanVersions", fields: [parentVersionId], references: [id])
  childVersions     VolunteerPlan[] @relation("PlanVersions")
  versionNote       String?

  // 算法参数
  priorityMode      PriorityMode // A | B
  rangeUp           Int?
  rangeDown         Int?
  binSize           Int?
  totalGroups       Int?
  bonusRules        Json?     // [{keyword, bonus}]

  // 审核状态
  status            PlanStatus // DRAFT | PENDING_REVIEW | REVIEWING | APPROVED | REJECTED | FINALIZED | PUBLISHED
  isFinal           Boolean   @default(false)
  finalizedAt       DateTime?
  finalizedBy       Int?

  // 导出
  exportCount       Int       @default(0)

  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt

  items             PlanItem[]
  reviews           PlanReview[]
  filingRecords     FilingRecord[]
  evaluations       PlanEvaluation[]

  @@unique([studentId, batch, versionNo])
  @@index([studentId, batch])
  @@index([status])
  @@index([createdById])
}
```

#### PlanItem（志愿项，结构化24列）

```prisma
model PlanItem {
  id                  Int       @id @default(autoincrement())
  planId              Int
  plan                VolunteerPlan @relation(fields: [planId], references: [id], onDelete: Cascade)

  sequence            Int       // 志愿序号
  gradient            Gradient  // HIGH_RUSH | RUSH | STABLE_RUSH | STABLE | SAFE_STABLE | SAFE

  universityCode      String
  universityName      String
  groupCode           String    // 院校专业组代码
  groupName           String    // 院校专业组全称
  anchorMajor         String    // 锚定专业
  groupMajorCount     Int       // 组内专业数
  recommendedOrder    String?   // 组内推荐排序（前3，逗号分隔）
  subjectRequirement  String?   // 选科要求

  score25Group        Int?      // 25年组最低分
  rank25Group         Int?      // 25年组最低位次
  score25Major        Int?      // 25年专业最低分
  rank25Major         Int?      // 25年专业最低位次
  score24Major        Int?      // 24年专业最低分
  rank24Major         Int?      // 24年专业最低位次

  planCount           Int?      // 计划人数
  tuition             String?   // 学费
  schoolNature        String?   // 办学性质
  schoolTags          String?   // 院校标签

  groupCleanliness    Cleanliness? // CLEAN | MIXED | POOR
  selectionReason     String?   @db.Text
  riskWarning         String?   @db.Text
  adjustmentAdvice    String?   // 调剂建议

  compositeScore      Float?    // 综合评分
  scoreBreakdown      Json?     // 评分分解 {tierScore, tierWeight, tierContrib, ...}
  isManuallyModified  Boolean   @default(false)
  originalItemId      Int?      // 被替换前的原始项

  @@index([planId, sequence])
  @@index([planId, gradient])
}
```

#### PlanReview（审核记录，支持行内审核）

```prisma
model PlanReview {
  id              Int       @id @default(autoincrement())
  planId          Int
  plan            VolunteerPlan @relation(fields: [planId], references: [id])
  reviewerId      Int
  reviewer        User      @relation(fields: [reviewerId], references: [id])

  reviewerRole    ReviewerRole  // SUPERVISOR | PEER
  action          ReviewAction  // APPROVE | REJECT | COMMENT
  comment         String?   @db.Text
  itemAnnotations Json?     // [{itemId, status: "ok"|"question"|"reject", note}]

  createdAt       DateTime  @default(now())

  @@index([planId])
  @@index([reviewerId])
}
```

#### MajorRecommendation（专业推荐/慎选清单）

```prisma
model MajorRecommendation {
  id              Int       @id @default(autoincrement())
  majorName       String
  matchKeywords   Json      // 拆分后的匹配关键词
  type            RecommendType // RECOMMEND | CAUTION
  source          String?
  year            Int

  @@index([type])
  @@index([year])
}
```

#### SupplementaryRecord（征集志愿记录）

```prisma
model SupplementaryRecord {
  id                    Int       @id @default(autoincrement())
  year                  Int
  round                 Int       // 第几次征集
  province              String
  batch                 String
  universityCode        String
  universityName        String
  groupCode             String?
  majorName             String?
  originalPlan          Int       // 原始招生计划数
  remainingPlan         Int       // 征集计划数
  supplementaryRatio    Float     // 征集率 = remaining / original
  minScore              Int?
  minRank               Int?
  examType              String?
  subjectRequirement    String?

  @@index([universityCode, year])
  @@index([year, province, batch])
}
```

#### SupplementarySummary（征集汇总，物理表，导入时同步刷新）

```prisma
model SupplementarySummary {
  id                Int       @id @default(autoincrement())
  universityCode    String
  groupCode         String
  majorName         String
  totalYears        Int
  totalRounds       Int
  avgRatio          Float     // 平均征集率
  trend             String    // INCREASING | STABLE | DECREASING
  consecutiveYears  Int
  latestYear        Int
  updatedAt         DateTime  @updatedAt

  @@unique([universityCode, groupCode, majorName])
}
```

#### FilingRecord（填报截图存档）

```prisma
model FilingRecord {
  id            Int       @id @default(autoincrement())
  studentId     Int
  student       StudentProfile @relation(fields: [studentId], references: [id])
  planId        Int
  plan          VolunteerPlan @relation(fields: [planId], references: [id])
  screenshots   Json      // 文件路径数组
  filingTime    DateTime?
  uploadedBy    Int
  note          String?

  createdAt     DateTime  @default(now())

  @@index([studentId])
}
```

#### AdmissionResult（录取结果）

```prisma
model AdmissionResult {
  id                    Int       @id @default(autoincrement())
  studentId             Int
  student               StudentProfile @relation(fields: [studentId], references: [id])
  planId                Int?
  admittedUniversity    String
  admittedMajorGroup    String?
  admittedMajor         String
  admittedBatch         String?
  isSupplementary       Boolean   @default(false)
  supplementaryRound    Int?
  resultSource          String    // SCREENSHOT | MANUAL
  screenshots           Json?
  confirmedAt           DateTime?

  createdAt             DateTime  @default(now())
  evaluations           PlanEvaluation[]

  @@index([studentId])
}
```

#### PlanEvaluation（方案评估）

```prisma
model PlanEvaluation {
  id                    Int       @id @default(autoincrement())
  planId                Int
  plan                  VolunteerPlan @relation(fields: [planId], references: [id])
  admissionResultId     Int
  admissionResult       AdmissionResult @relation(fields: [admissionResultId], references: [id])
  matchedItemSequence   Int?      // 命中第几个志愿
  matchedGradient       String?   // 命中梯度
  isInPlan              Boolean   // 录取院校是否在方案中
  evaluationScore       Float?
  evaluationNote        String?   @db.Text

  createdAt             DateTime  @default(now())

  @@index([planId])
}
```

#### BatchConfig（批次配置）

```prisma
model BatchConfig {
  id                Int       @id @default(autoincrement())
  batch             String
  year              Int
  province          String
  maxGroupCount     Int       // 该批次最大志愿组数
  volunteerMode     String    // 平行 | 顺序
  filingRatio       Float?    // 投档比例
  eligibilityRules  Json?     // 资格条件（身体、户籍、分数等）
  tiebreakRules     Json?     // 同分排序规则
  algorithmConfig   Json?     // 该批次的算法参数（bin数量、范围缩放等）

  @@unique([batch, year, province])
}
```

#### Notification（站内通知）

```prisma
model Notification {
  id            Int       @id @default(autoincrement())
  userId        Int
  user          User      @relation(fields: [userId], references: [id])
  type          String    // PLAN_GENERATED | REVIEW_REQUESTED | REVIEW_COMPLETED | PLAN_PUBLISHED | STUDENT_QUESTION | DATA_CHANGED | STUDENT_ASSIGNED
  title         String
  content       String?
  relatedId     Int?
  relatedType   String?   // PLAN | REVIEW | STUDENT | SYSTEM
  isRead        Boolean   @default(false)
  createdAt     DateTime  @default(now())

  @@index([userId, isRead])
  @@index([userId, createdAt])
}
```

#### AuditLog（审计日志）

```prisma
model AuditLog {
  id          Int      @id @default(autoincrement())
  userId      Int
  action      String   // CREATE_PLAN | EDIT_PLAN | FINALIZE_PLAN | PUBLISH_PLAN |
                       // REPLACE_ITEM | DELETE_ITEM | APPROVE_REVIEW | EXPORT_PLAN |
                       // EXPORT_STUDENT_DATA | UPDATE_SCORE | BATCH_REGENERATE
  targetType  String   // PLAN | PLAN_ITEM | STUDENT | SYSTEM
  targetId    Int
  details     Json?    // {before: {...}, after: {...}}
  ip          String?
  userAgent   String?
  createdAt   DateTime @default(now())

  @@index([userId, createdAt])
  @@index([targetType, targetId])
}
```

#### MajorNameMapping（专业名称标准化映射表）

```prisma
model MajorNameMapping {
  id              Int     @id @default(autoincrement())
  rawName         String  @unique  // 原始名称
  standardName    String           // 标准名称
  suffix          String?          // 备注后缀（实验班/拔尖计划等）
  majorCode       String?          // 教育部专业代码
  isExperimental  Boolean @default(false)
  isCooperation   Boolean @default(false)

  @@index([standardName])
}
```

#### 枚举定义

```prisma
enum Role {
  ADMIN
  TEACHER
  STUDENT
}

enum Gender {
  MALE
  FEMALE
}

enum StudentStatus {
  PENDING_INFO
  INFO_COMPLETE
  ASSIGNED
  IN_SERVICE
  PLAN_DELIVERED
}

enum ExamType {
  PHYSICS
  HISTORY
}

enum PriorityMode {
  A   // 院校优先
  B   // 专业优先
}

enum CareerPlan {
  EMPLOYMENT
  POSTGRAD
  CIVIL_SERVICE
  ABROAD
  UNDECIDED
}

enum StayPreference {
  PREFER_LOCAL
  NO_PREFERENCE
  PREFER_OUTSIDE
}

enum TuitionBudget {
  LOW       // <=6000
  MEDIUM    // <=15000
  HIGH      // 不限
}

enum Batch {
  EARLY           // 提前批
  SPECIAL_A       // 本科A段（专项计划）
  NORMAL_B        // 本科B段（普通本科）
  JUNIOR_COLLEGE  // 专科批
}

enum PlanStatus {
  DRAFT
  PENDING_REVIEW
  REVIEWING
  APPROVED
  REJECTED
  FINALIZED
  PUBLISHED
  OUTDATED          // 数据变更（如出分后）导致方案过时
}

enum ExamSource {
  MOCK_ERZHEN       // 二诊模拟
  MOCK_SANZHEN      // 三诊模拟
  MOCK_OTHER        // 其他模拟考
  GAOKAO            // 高考正式
}

enum Gradient {
  HIGH_RUSH     // 高冲
  RUSH          // 冲刺
  STABLE_RUSH   // 稳偏冲
  STABLE        // 稳妥
  SAFE_STABLE   // 保偏稳
  SAFE          // 保底
}

enum Cleanliness {
  CLEAN
  MIXED
  POOR
}

enum ReviewerRole {
  SUPERVISOR
  PEER
}

enum ReviewAction {
  APPROVE
  REJECT
  COMMENT
}

enum RecommendType {
  RECOMMEND
  CAUTION
}
```

### 4.3 关键复合索引（已内联在模型中）

```
AdmissionRecord（现有表，需补充索引）：
  @@index([universityCode, year, province])
  @@index([year, province, examType, rank])     // 引擎核心查询
  @@index([universityCode, groupCode, year])

EnrollmentPlan（现有表，需补充索引）：
  @@index([year, province, batch, examType])
  @@index([universityCode, year])
```

### 4.4 备选池存储策略

```
备选池不入数据库，使用 Redis 缓存：

  Key:    candidatePool:{planId}
  Value:  JSON序列化的完整备选池（按bin分区）
  TTL:    7天(168小时)

  方案生成时 → 结果表(PlanItem)入库 + 备选池写Redis
  老师查看备选池 → 从Redis读取
  老师打开编辑页 → 后台静默检查缓存，过期则自动重算（不阻塞UI）
  Redis过期 → 按需重算（参数都在Plan里）
  方案定版后 → 清除缓存，不占资源
  导出Excel → 从Redis读取或按需重算后写入
```

### 4.5 迁移策略

```
大改动分步执行：
  Migration 1: 新增 TeacherProfile / StudentProfile 表
  Migration 2: 数据迁移脚本（把 User 中的学生数据搬到 StudentProfile）
  Migration 3: 清理 User 上的旧字段
  Migration 4: 新增方案相关表（PlanItem, PlanReview, etc.）
  Migration 5: 新增征集/录取/评估/通知表
  Migration 6: 新增 AuditLog + MajorNameMapping 表
  Migration 7: 补充复合索引
  每步验证数据完整性后再进行下一步
```

---

## 五、推荐引擎

### 5.1 引擎模块

```
RecommendEngine/
  ├── rank-calculator         位次推导（分数→一分一段表→位次）
  ├── batch-recommender       批次适配推荐（学生条件→可填批次+推荐度）
  ├── range-adapter           自适应范围计算
  ├── candidate-filter        硬性筛选（选科/批次/排除项/身体/学费）
  ├── scoring-engine          综合评分（4层动态权重，模式A/B）
  ├── supplementary-analyzer  征集志愿分析（征集率+趋势）
  ├── stability-analyzer      多年趋势+波动系数
  ├── plan-change-analyzer    招生计划变动影响
  ├── bin-sampler             系统抽样（分bin→锚定专业→院校专业组）
  ├── dedup-limiter           三步去重+限频
  ├── inner-ranker            组内专业推荐排序
  ├── cleanliness-assessor    专业组干净度评估
  ├── reason-generator        选择理由自动生成（9+段拼接）
  ├── risk-generator          风险提示自动生成
  ├── smart-replacer          智能替换推荐（删除某项→推荐Top3替补）
  └── export-formatter        导出格式化（后端 exceljs 生成，Bull队列异步）
```

### 5.2 异步执行架构（Bull 队列）

```
老师点击"生成方案"
  → API 立即返回 { jobId, status: 'processing' }
  → Bull 队列后台执行推荐引擎
  → 分阶段进度推送（SSE）：
      "正在筛选候选池..." → "正在评分排序..." → "正在生成理由..." → "完成"
  → 老师端收到SSE通知，自动加载结果

// NestJS Bull 实现
@InjectQueue('recommend') private recommendQueue: Queue

async generatePlan(studentId: number, params: PlanParams) {
  const job = await this.recommendQueue.add('generate', {
    studentId, params
  });
  return { jobId: job.id, status: 'processing' };
}

// SSE 进度推送
@Sse('notifications')
streamNotifications(@Req() req): Observable<MessageEvent> {
  const userId = req.user.id;
  return this.notificationService.getStream(userId).pipe(
    map(notification => ({ data: notification }))
  );
}
```

**导出也走队列**：Excel/PDF 由后端 exceljs 库在 Bull 队列中异步生成，完成后通知下载。可完整还原 v4.4 的 A3 横版、梯度分色、多 sheet 格式。

### 5.3 算法核心（对齐v4.4）

完整复刻v4.4系统抽样法：
- 自适应范围计算（P → range_up/range_down）
- 等距分bin，每bin选1个最优院校专业组
- 两层选取：外层锚定专业→内层组内排序
- 4层动态权重评分（院校层级/办学性质/专业/其他），权重随bin位置线性滑动
- 三步去重+限频
- 专业组干净度评估+调剂建议
- 选择理由9段拼接+风险提示

### 5.4 增强项

| 增强 | 说明 | 优先级 |
|------|------|--------|
| 征集志愿分析 | 征集率=征集计划/原始计划，多年趋势影响评分和风险 | P1 |
| 多年趋势+波动系数 | stability = 1-(std/mean)，波动大提风险 | P1 |
| 招生计划变动 | planChangeRate影响评分微调+风险提示 | P1 |
| 多批次支持 | 不同批次加载不同BatchConfig和算法参数 | P1 |
| 批次适配推荐 | 根据学生条件推荐可填批次 | P1 |
| 智能替换 | 删除志愿→推荐Top3替补 | P1 |
| What-if对比 | 多套方案并排对比，高亮差异 | P2 |
| 专业组变动检测 | 26年组与25年对比，自动关联或标记新组 | P2 |
| 回测验证 | 用历年数据验证算法准确性 | P3 |

### 5.5 学生端简化版

```
不做系统抽样，不出55个志愿组
只做：输入分数 → 推算位次 → 按位次范围筛选 → 评分排序 → Top30
按冲/稳/保分组展示，引导联系老师获取完整方案
```

---

## 六、老师工作台

### 6.1 页面结构

```
/teacher
  ├── /dashboard              工作台（看板视图：待采集|待生成|待审核|已定版|已填报）
  ├── /students
  │   ├── /list               学生列表
  │   ├── /create             创建学生（代注册）
  │   └── /[id]               学生详情（渐进式信息采集表单）
  ├── /plans
  │   ├── /list               方案列表（按学生/批次/状态筛选）
  │   ├── /generate/[studentId]  方案生成工作台
  │   ├── /[id]               方案详情/编辑（双层展示+就地替换）
  │   ├── /[id]/compare       方案对比（What-if）
  │   ├── /[id]/history       版本时序（diff对比）
  │   └── /[id]/export        导出预览
  ├── /reviews
  │   ├── /pending            待我审核（行内审核模式）
  │   └── /[id]               审核工作台
  └── /browse                 院校/专业浏览
```

### 6.2 方案生成工作台

```
左侧：学生信息卡片（基本信息+成绩+偏好/排除+身体条件，可就地编辑）
中间：
  Step 1: 参数确认（系统自算+老师微调：优先级模式、偏移量、加分规则）
  Step 2: 批次选择（系统推荐可填批次+推荐理由）
  Step 3: 结果展示
    默认视图：精简卡片列表，梯度分色，梯度锚点导航
    展开详情：组内排序+干净度+理由+风险
    就地替换：点击替换→bin备选列表+智能Top3→点击即换+撤销
  Step 4: 审核与发布
```

### 6.3 交叉审核

```
行内审核模式：每个志愿 ✅/❓/❌ 三按钮
❓和❌需一句话说明
审核完成：自动统计通过/疑问/建议替换数量
主管老师只关注标记项
支持多轮：驳回→修改→重新提交
```

### 6.4 方案版本管理

```
同一学生同一批次：v1(初稿) → v2(调整) → ... → 定版(锁定)
时间线展示所有版本
任意两版本diff对比
定版后不可编辑
```

---

## 七、学生端

### 7.1 页面结构

```
/student（移动端优先设计）
  ├── /dashboard            首页（方案进度可视化+最新通知）
  ├── /profile              个人信息（渐进式表单+完整度进度条）
  ├── /plans
  │   ├── /list             按批次分组展示老师发布的方案
  │   └── /[id]             方案详情（通俗解读层+确认/提疑问）
  ├── /recommend            轻量自助推荐
  ├── /filing
  │   ├── /upload           上传填报截图
  │   └── /result           录取结果
  ├── /browse               院校/专业浏览
  └── /favorites            收藏（同步到老师端可见）
```

### 7.2 通俗解读层

```
老师看到："高冲志愿，位次差-12000，征集率0%"
学生看到："这个是冲刺的选择，需要运气，但如果考试发挥好有希望"

老师看到："专业组干净度🟡混编(3个慎选专业)"
学生看到："这个专业组有8个专业，其中5个就业前景不错，建议服从调剂"
```

### 7.3 参与机制

```
方案确认/提疑问 → 不能改方案，但能反馈给老师
收藏院校/专业 → 同步到老师端，老师可参考
进度追踪 → 可视化：采集中→方案生成中→审核中→已定版→待填报
```

---

## 八、管理员后台

```
/admin
  ├── /dashboard            总控台（关键指标）
  ├── /users
  │   ├── /teachers         老师管理
  │   ├── /students         学生管理（分配/转移）
  │   └── /permissions      权限管理（CASL覆盖配置UI）
  ├── /data
  │   ├── /import           数据导入（事务+批量，上传清洗后数据集）
  │   ├── /records          导入记录
  │   ├── /quality          数据质量监控
  │   └── /update           增量更新
  ├── /plans
  │   ├── /overview         全局方案总览
  │   ├── /reviews          审核总览
  │   └── /evaluations      方案评估汇总
  ├── /config
  │   ├── /ai               AI配置
  │   ├── /batch            批次配置
  │   ├── /algorithm        算法默认参数
  │   └── /system           系统设置
  └── /statistics
      ├── /workload         老师工作量
      ├── /admission        录取统计
      └── /trends           数据趋势
```

### 数据导入技术方案

```typescript
// 事务 + 批量操作，保证一致性
await prisma.$transaction(async (tx) => {
  // 分批 upsert，每批500条
  for (const batch of chunk(universities, 500)) {
    await tx.university.createMany({ data: batch, skipDuplicates: true });
  }
  // 同理处理 Major, EnrollmentPlan, AdmissionRecord 等
}, { timeout: 300000 }); // 5分钟超时，失败整体回滚
```

---

## 九、UX 设计原则

1. **渐进式信息采集**：分步表单+完整度进度条，Step1(核心)2分钟填完即可跑推荐
2. **看板式学生管理**：按进度分列(待采集/待生成/待审核/已定版/已填报)
3. **方案双层展示**：默认精简卡片+点击展开+可切换表格+梯度锚点导航
4. **就地替换志愿**：点替换→弹出bin备选+智能Top3→点击即换+撤销
5. **行内审核**：✅/❓/❌三按钮，自动统计，主管只看标记项
6. **学生通俗解读**：术语翻译为通俗文字
7. **学生参与感**：确认/提疑问+收藏同步+进度可视化
8. **移动端适配**：学生端移动优先，老师查看/审核支持移动，管理员桌面only
9. **通知机制**：SSE 实时推送站内通知（后期对接微信/短信）

---

## 十、通知系统

### 技术方案：SSE（Server-Sent Events）

```
选择SSE而非WebSocket：
  - 通知是单向推送（服务器→客户端），不需要双向通信
  - SSE基于HTTP，自动重连，穿透代理/CDN更好
  - NestJS内置 @Sse() 装饰器，零额外依赖
  - WebSocket留给后期AI对话功能
```

### 通知事件

| 事件 | 接收者 | 内容 |
|------|--------|------|
| 学生信息填写完成 | 老师 | "张三已完成信息填写" |
| 方案生成完成 | 老师 | "张三的本科B段方案已生成" |
| 方案提交审核 | 主管老师 | "李老师提交了张三的方案待审核" |
| 审核通过/驳回 | 方案老师 | "张三的方案已通过审核"/"已驳回" |
| 方案发布 | 学生 | "你的本科B段方案已出，点击查看" |
| 学生提出疑问 | 老师 | "张三对第15号志愿有疑问" |
| 招生计划变更 | 受影响老师 | "XX大学XX专业组招生计划有变更" |
| 学生被分配 | 老师 | "管理员将张三分配给你" |

---

## 十一、数据策略

- **省份**：当前仅四川，架构预留多省扩展
- **数据清洗**：本地独立完成，Web端接收清洗后的完整数据集
- **导入方式**：批量脚本（全量，事务保证一致性）+ Web端上传（增量）+ OCR（继续完善）
- **更新频率**：年度全量更新 + 填报期间增量更新（招生计划变更）

---

## 十二、AI 功能（后期）

全部要做，但优先级最低，先跑通规则算法：

1. **辅助分析**：方案生成后AI做个性化解读/风险报告
2. **智能问答**：学生/家长与AI对话咨询（此时用WebSocket双向通信）
3. **AI参与推荐**：LLM评估专业前景、院校匹配度
4. **AI对话采集**：通过对话方式采集学生信息
5. **拍照导入**：线下信息拍照快速导入

---

## 十三、开发阶段排期

```
阶段1 (4月14日 ~ 5月4日) — 3周 — 地基层
  Week 1: 数据库Schema升级（User拆分+Profile+分步迁移） + CASL权限体系
  Week 2: 数据导入管线（事务+批量） + Bull队列基础设施 + SSE通知
  Week 3: 基础API（用户CRUD、学生管理、批次配置） + 前端路由架构（Route Groups）

阶段2 (5月5日 ~ 5月25日) — 3周 — 核心引擎+老师端
  Week 4: 推荐引擎核心（筛选→评分→系统抽样→去重）+ Bull异步执行
  Week 5: 推荐引擎完善（干净度+理由+风险+征集+趋势+多批次）+ 备选池Redis缓存
  Week 6: 老师工作台前端（方案生成→编辑→审核→导出）

阶段3 (5月26日 ~ 6月8日) — 2周 — 学生端+管理端+收尾
  Week 7: 学生端 + 管理员后台
  Week 8: 填报截图/录取追踪/方案评估 + 导出（后端exceljs）+ 测试 + 部署

阶段4 (6月9日 ~ 上线) — 增强
  AI模块（辅助分析+智能问答+推荐优化）
  性能优化 + bug修复
```

---

## 十四、功能优先级

```
P0（必须上线）：
  ✦ 三角色权限体系（CASL + PoliciesGuard）
  ✦ 数据导入（事务+批量，接收清洗后数据）+ 专业名称标准化
  ✦ v4.4推荐引擎（完整算法，Bull队列异步执行）
  ✦ 位次推导规则明确化（悲观值 + 不确定范围展示）
  ✦ 同分决胜规则（4级 tie-breaking）
  ✦ 出分后批量更新分数 + 一键/批量重新生成方案
  ✦ 老师：创建学生 + 方案生成/编辑/定版 + 导出
  ✦ 学生：查看方案 + 院校专业浏览
  ✦ 管理员：用户管理 + 数据管理 + 权限配置

P1（应该上线）：
  ✧ 多批次推荐 + 批次适配分析 + 提前批manual模式
  ✧ 方案版本时序 + diff对比 + examSource区分模拟/正式
  ✧ 交叉审核 + 主管审核（行内模式）
  ✧ 征集志愿分析（征集率+趋势）
  ✧ 多年趋势 + 波动系数
  ✧ 2024旧高考数据可比性处理（折扣+警告）
  ✧ 评分可解释性（scoreBreakdown）
  ✧ 法律免责（定版确认+学生端声明+审计日志）
  ✧ 敏感数据保护（加密+脱敏+导出审计）
  ✧ SSE站内通知（含重连补发）
  ✧ 数据变更影响分析
  ✧ 学生轻量自助推荐
  ✧ 方案导出（后端exceljs异步生成Excel/PDF）

P2（尽量上线）：
  ✩ 填报截图存档
  ✩ 录取结果追踪 + 方案评估
  ✩ What-if对比
  ✩ 智能替换推荐
  ✩ 管理员统计面板
  ✩ 学生通俗解读层
  ✩ 老师快捷操作（快捷入口+键盘快捷键+最近操作）
  ✩ 征集汇总表刷新优化

P3（后续迭代）：
  ○ AI辅助分析 + 智能问答（WebSocket）+ AI参与推荐
  ○ 回测验证系统
  ○ AI对话采集 + 拍照导入
  ○ 专业组变动检测
  ○ 微信/短信通知
```

---

## 十五、技术选型总结

| 层 | 技术 | 说明 |
|---|------|------|
| 前端框架 | Next.js 14 App Router | Route Groups 三端隔离，middleware 统一路由守卫 |
| UI | Ant Design 5 + Tailwind CSS | 现有方案保持 |
| 状态 | Zustand + TanStack Query | 现有方案保持 |
| 后端框架 | NestJS 10 | 现有方案保持 |
| 权限 | CASL + PoliciesGuard | 替代自研权限表，支持数据级权限 |
| ORM | Prisma 7 | Client Extensions审计 + 复合索引 + 分步迁移 |
| 数据库 | PostgreSQL 16 | 现有方案保持 |
| 缓存 | Redis 7 | 备选池缓存 + Bull队列存储 + SSE连接管理 |
| 队列 | Bull (Redis-backed) | 方案生成 + Excel导出 异步执行 |
| 实时通知 | SSE (@Sse 装饰器) | 轻量单向推送，后期AI对话改WebSocket |
| 导出 | exceljs (后端) | 后端队列生成，还原v4.4完整格式 |
| OCR | Python FastAPI | 继续完善 |

---

## 十六、与现有代码的关系

### 保留并扩展
- Auth模块：扩展JWT支持三角色
- University/Major/Admission模块：保留查询API，补充复合索引
- AI-Config模块：保留，后期AI接入复用
- OCR Service：继续完善
- 前端组件库：GradientButton、StatCard等复用
- 院校/专业浏览页面：保留，三端共享

### 重构
- User模块：拆分为 User + TeacherProfile + StudentProfile
- Recommend模块：替换为v4.4完整引擎 + Bull异步
- Plan模块：重构为版本化+审核+多批次
- Favorite模块：扩展收藏同步到老师端
- 前端路由：重构为 Route Groups 三端隔离

### 新增
- CASL权限模块（替代自研RBAC）
- Bull队列基础设施
- SSE通知模块（含重连补发）
- 审计日志模块（Prisma Client Extension）
- 专业名称标准化模块
- 老师工作台全部前端页面
- 学生端全部前端页面
- 管理员后台扩展页面
- 导出模块（后端exceljs）
- 征集志愿/录取追踪/方案评估模块
- 数据变更影响分析模块

---

## 十七、补充设计（15项深度审视）

### 17.1 出分后批量重新生成 [P0]

高考出分后（约6月23日），全部学生的方案需基于真实分数重新生成。

```
一、成绩批量导入
  API: POST /students/batch-update-scores
  上传出分成绩单 → 按姓名+手机号匹配学生 → 更新 totalScore
  → 系统自动推导新 provincialRank
  → 该学生所有 examSource=GAOKAO 的方案标记为 OUTDATED
  → 通知老师

二、一键重新生成
  保留原方案的参数配置（偏好、排除项、加分规则等）
  用新分数+原参数提交到 Bull 队列
  自动创建新版本 (versionNo+1, versionNote="高考出分后重新生成")

三、批量重新生成
  老师 Dashboard 显示"N个学生的方案需要重新生成"
  一键全部提交 Bull 队列，priority: 1（最高优先级）
  进度面板实时显示完成数

四、模拟方案不受影响
  examSource=MOCK_* 的方案不标记 OUTDATED（本来就是预案）
```

### 17.2 提前批算法双模式 [P1]

提前批（军校/公费师范等）通常只有1-3个顺序志愿，不适用v4.4系统抽样法。

```
BatchConfig.algorithmConfig.mode:
  "auto"      — 完整v4.4引擎（本科B段等大量平行志愿）
  "manual"    — 资格筛选+排序展示+老师手动挑选（提前批）
  "semi-auto" — 受限候选池+简化版抽样（国家专项等）

manual 模式 UI：
  不显示"生成方案"按钮
  显示"符合条件的院校列表"（已按评分排序）
  老师手动勾选1-3个，拖拽排序，保存为方案
```

### 17.3 法律免责与审计日志 [P1]

```
一、方案定版确认
  老师点击"定版" → 弹出确认对话框，三个复选框必须全部勾选：
  ☑ 我已逐条审核所有志愿项的选科要求
  ☑ 我已确认所有志愿项的数据准确性
  ☑ 我已了解本方案为参考建议，不构成录取承诺

二、学生端声明
  方案详情页顶部固定：
  "本方案由老师基于历年数据和算法模型生成，仅供参考。
   最终填报请以官方招生章程和考试院公布的招生计划为准。"
  方案底部显示：生成时间、审核老师、定版时间

三、审计日志
  通过 Prisma Client Extension 自动记录所有方案相关的增删改操作
  记录：操作者、操作类型、变更前后值、时间、IP
  AuditLog 模型已在第四章定义
```

### 17.4 位次推导规则明确化 [P0]

```
规则：provincialRank = 该分数段累计人数（取悲观值，更安全）

算法：
  rank = cumulativeCount               // 最悲观位次
  bestRank = upperSegment.cumCount + 1  // 最乐观位次
  sameScoreCount = segment.count        // 同分人数
  uncertaintyRange = rank - bestRank    // 不确定范围

UI展示：
  "总分 580 | 预估位次 约45,000（580分段共320人，位次区间44,681~45,000）"

自适应保底：
  当 sameScoreCount > 300 时，range_down 自动增加10%（多留保底空间）
```

### 17.5 2024旧高考数据可比性处理 [P1]

```
数据标记：
  AdmissionRecord 新增 examSystem: OLD_GAOKAO | NEW_GAOKAO
  year <= 2024 → OLD_GAOKAO, year >= 2025 → NEW_GAOKAO

评分折扣（dataReliabilityFactor）：
  2025新高考数据 → 1.0（完全可信）
  2024旧高考fallback → 0.75（大幅折扣）
  2023旧高考 → 0.65
  无数据 → 0.5

风险提示：
  仅24年数据 → "⚠️ 仅参考2024年旧高考数据，新高考位次可比性有限"
  老师工作台：该志愿项加橙色边框 + "24参考"标签
```

### 17.6 专业名称标准化 [P1]

```
导入管线新增标准化步骤：
  1. 提取括号内容：拆分 baseName + suffix
  2. 常见变体统一：别名映射表
  3. 后缀分类：实验班/拔尖计划/中外合作 等自动标记
  4. 结果写入 MajorNameMapping 表

推荐清单匹配时使用标准名（standardName）而非原始名（rawName）
MajorNameMapping 模型已在第四章定义
```

### 17.7 备选池缓存策略优化 [低]

```
TTL 从 72小时 调整为 7天（覆盖一个工作周）
老师打开方案编辑页时：
  后台静默检查 Redis 是否有备选池
  如果过期 → 自动触发 Bull 队列重算（不阻塞 UI）
  重算完成 → SSE 通知前端刷新备选面板
方案定版后 → 主动清除缓存
```

### 17.8 SSE 消息补发 [P1]

```
前端：
  EventSource.onopen 时调用 GET /notifications/unread 补发断线期间的消息
  SSE 原生支持 Last-Event-Id 头，重连时自动发送

后端：
  SSE 每条消息携带 notification.id 作为 event id
  /notifications/unread API 返回所有 isRead=false 的消息
  /notifications/:id/read API 标记已读
```

### 17.9 征集汇总表性能方案 [P2]

```
SupplementarySummary 改为物理表（非 View / 非物化视图）
导入征集数据后，用 $executeRaw 一次性 TRUNCATE + INSERT 重算汇总
优势：查询零开销、不依赖 PostgreSQL 物化视图特性、Prisma 完整支持
```

### 17.10 敏感数据保护 [P1]

```
一、字段加密
  身份证号：AES-256-GCM 加密存储（复用 ai-config 加密方案）
  StudentProfile.idNumberEncrypted

二、API返回脱敏
  通过 Prisma Client Extension 的 result 组件：
  身份证 → 前3后4位
  手机号 → 前3后4位
  只有管理员+特定权限才能获取原始值

三、导出审计
  管理员导出学生数据时记录 AuditLog（操作者、导出范围、时间）

四、CASL + 接口层双重检查
  CASL 控制逻辑层权限，接口层再次验证数据所属关系
```

### 17.11 评分可解释性 [P1]

```
PlanItem.scoreBreakdown 存储评分分解 JSON：
{
  tierScore, tierWeight, tierContrib,       // 院校层级
  natureScore, natureWeight, natureContrib, // 办学性质
  majorRecScore, majorDiscScore,            // 专业推荐度+学科评估
  majorWeight, majorContrib,
  planScore, postGradScore, locationScore,  // 其他因素
  otherWeight, otherContrib,
  bonus, bonusDetail,                       // 偏好加分
  stabilityFactor, dataReliability,         // 修正因子
  rawTotal, adjustedTotal                   // 总分
}

老师端展开详情时：
  可视化显示各维度贡献占比（水平条形图）
  审核时可据此判断算法选择是否合理
```

### 17.12 同分决胜规则 [P0]

```
当同一 bin 内两个候选综合评分相同时，按以下顺序决胜：
  1. 招生计划数更大（更稳定）
  2. 历年征集率更低（更热门/更有价值）
  3. 波动系数更小（更可预测）
  4. 院校代码字典序（最终兜底，确保确定性）

确保：相同输入永远产生相同输出
```

### 17.13 方案区分模拟/正式 [P1]

```
VolunteerPlan.examSource 字段：
  MOCK_ERZHEN / MOCK_SANZHEN / MOCK_OTHER / GAOKAO

UI标签：
  模拟方案 → 灰色/蓝色标签 "[二诊预案]"
  正式方案 → 绿色/金色标签 "[高考正式]"

逻辑：
  高考出分后，只有 examSource=GAOKAO 且分数变更的方案才标 OUTDATED
  模拟方案不受影响
```

### 17.14 老师快捷操作 [P2]

```
一、快捷入口
  学生列表每行：直达"生成方案（选批次）"
  Dashboard 看板：卡片直接显示下一步操作按钮

二、键盘快捷键（方案编辑页）
  Ctrl+S 保存 | Ctrl+E 导出 | Ctrl+Shift+R 提交审核
  ←/→ 志愿导航 | Enter 展开/收起 | R 替换 | Delete 删除
  页面右下角 "? 快捷键" 提示

三、最近操作历史
  顶部导航"最近"下拉：最近5个学生 + 最近5个方案
  localStorage 存储，前端渲染
```

### 17.15 数据变更影响分析 [P1]

```
管理员增量更新招生计划时触发 analyzeDataChangeImpact：
  1. 查找所有使用了变更院校+专业组的未过期方案
  2. 评估影响程度：
     计划缩减>50% → HIGH（必须处理）
     计划缩减20-50% → MEDIUM（建议关注）
     选科要求变更 → HIGH
     专业组取消 → HIGH（必须替换）
     其他变动 → LOW
  3. 按老师分组发送通知，附带具体影响和建议操作
  4. 老师 Dashboard 红色提醒条："N份方案受影响 [查看详情]"
     影响分析面板：列出每个受影响志愿 + 变更详情 + 建议 + 直达链接
```
