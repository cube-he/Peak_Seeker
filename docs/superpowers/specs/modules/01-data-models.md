# 数据模型（唯一权威定义）

> 所有模型以本文件为准。其他文档通过"引用 01-data-models.md#模型名"引用。
> 数据库：MySQL (Prisma MariaDB 适配器)。现有 schema 使用 `@@map("snake_case")` 映射，新模型保持一致。

## 模型关系总览

```
User (通用)
  ├── TeacherProfile (1:1)
  │     └── StudentProfile.assignedTeacher (1:N)
  └── StudentProfile (1:1)
        ├── VolunteerPlan (1:N)
        │     ├── PlanItem (1:N)
        │     ├── PlanReview (1:N)
        │     ├── PlanEvaluation (1:N)
        │     ├── FilingRecord (1:N)
        │     ├── PlanShareLink (1:N)
        │     └── parentVersion → VolunteerPlan (自引用版本链)
        ├── FilingRecord (1:N)
        └── AdmissionResult (1:N)
              └── PlanEvaluation (1:N)

全局表（无用户关联）：
  MajorRecommendation    专业推荐/慎选清单
  MajorNameMapping       专业名称标准化映射
  SupplementaryRecord    征集志愿原始记录
  SupplementarySummary   征集汇总（物理表，导入时刷新）
  BatchConfig            批次配置
  AlgorithmConfig        算法参数版本
  Notification           站内通知
  AuditLog               审计日志
  FileRecord             文件存储记录
```

## 枚举定义

```prisma
enum Role { ADMIN  TEACHER  STUDENT }
enum Gender { MALE  FEMALE }
enum StudentStatus { PENDING_INFO  INFO_COMPLETE  ASSIGNED  IN_SERVICE  PLAN_DELIVERED }
enum ExamType { PHYSICS  HISTORY }
enum PriorityMode { A  B }                    // A=院校优先, B=专业优先
enum CareerPlan { EMPLOYMENT  POSTGRAD  CIVIL_SERVICE  ABROAD  UNDECIDED }
enum StayPreference { PREFER_LOCAL  NO_PREFERENCE  PREFER_OUTSIDE  UNDECIDED }
enum AcceptLevel { YES  NO  UNDECIDED }
enum TuitionBudget { LOW  MEDIUM  HIGH  UNDECIDED }  // <=6000 / <=15000 / 不限 / 待确认
enum Batch { EARLY  SPECIAL_A  NORMAL_B  JUNIOR_COLLEGE }
enum PlanStatus { DRAFT  PENDING_REVIEW  REVIEWING  APPROVED  REJECTED  FINALIZED  PUBLISHED  OUTDATED }
enum ExamSource { MOCK_ERZHEN  MOCK_SANZHEN  MOCK_OTHER  GAOKAO }
enum Gradient { HIGH_RUSH  RUSH  STABLE_RUSH  STABLE  SAFE_STABLE  SAFE }
enum Cleanliness { CLEAN  MIXED  POOR }
enum ReviewerRole { SUPERVISOR  PEER }
enum ReviewAction { APPROVE  REJECT  COMMENT }
enum RecommendType { RECOMMEND  CAUTION }
```

## 模型定义

### User

```prisma
model User {
  id                    Int       @id @default(autoincrement())
  username              String    @unique
  phone                 String    @unique
  email                 String?   @unique
  password              String    // bcrypt 12轮
  role                  Role
  realName              String?
  gender                Gender?
  ethnicity             String?   // 民族
  avatar                String?
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

### TeacherProfile

```prisma
model TeacherProfile {
  id            Int      @id @default(autoincrement())
  userId        Int      @unique
  user          User     @relation(fields: [userId], references: [id])
  school        String?
  isSupervisor  Boolean  @default(false)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  students      StudentProfile[] @relation("TeacherStudents")
}
```

### StudentProfile

8组字段。设计原则：成绩和核心筛选字段为独立列（需索引/查询），偏好/身体条件等用 JSON（减少列膨胀）。

```prisma
model StudentProfile {
  id                  Int            @id @default(autoincrement())
  userId              Int            @unique
  user                User           @relation(fields: [userId], references: [id])
  status              StudentStatus  @default(PENDING_INFO)
  assignedTeacherId   Int?
  assignedTeacher     TeacherProfile? @relation("TeacherStudents", fields: [assignedTeacherId], references: [id])
  assignedAt          DateTime?
  infoCompleteness    Int            @default(0) // 百分比

  // ---- 第一组：基本信息 ----
  idNumberEncrypted   String?   // 身份证号 AES-256-GCM 加密
  parentPhone         String?
  highSchool          String?
  classInfo           String?
  province            String    @default("四川")
  city                String?
  isRural             Boolean   @default(false)

  // ---- 第二组：考试成绩 ----
  examYear            Int?
  examType            ExamType?
  firstChoice         String?        // "物理" | "历史"
  reChoices           Json?          // ["化学", "地理"]
  scoreChinese        Int?
  scoreMath           Int?
  scoreEnglish        Int?
  scoreFirstChoice    Int?
  scoreSub1           Int?
  scoreSub2           Int?
  totalScore          Int?
  provincialRank      Int?           // 系统由一分一段表推导，不需填写
  strongSubjects      Json?          // 选填，不填系统取最高分2科推断
  weakSubjects        Json?

  // ---- 第三组：身体条件 ----
  physicalCondition   Json?          // {height, weight, visionLeft, visionRight, visionCorrectedL, visionCorrectedR, colorVision(NORMAL|WEAK|BLIND), healthNote}

  // ---- 第四组：升学规划 ----
  priorityMode        PriorityMode?
  careerPlan          CareerPlan?
  careerDirection     String?
  militaryInterest    Boolean  @default(false)
  teacherInterest     Boolean  @default(false)

  // ---- 第五组：正向偏好 ----
  preferredMajors         Json?   // ["计算机类", "人工智能"]
  preferredUniversities   Json?
  preferredCities         Json?
  preferredProvinces      Json?
  stayInProvince          StayPreference?

  // ---- 第六组：反向排除（绝对不接受）----
  excludedMajors          Json?
  excludedUniversities    Json?
  excludedCities          Json?
  excludedProvinces       Json?

  // ---- 第七组：经济与特殊条件 ----
  tuitionBudget       TuitionBudget  @default(UNDECIDED)
  acceptPrivate       AcceptLevel    @default(UNDECIDED)
  acceptCooperation   AcceptLevel    @default(UNDECIDED)
  specialProgram      Json?          // ["NATIONAL", "LOCAL", "UNIVERSITY"]
  otherRequirements   String?

  // ---- 第八组：兴趣性格（选填）----
  interests           Json?
  personalityType     String?
  selfDescription     String? @db.Text

  // ---- 管理字段 ----
  tags                Json?          // ["高三5班", "580+组"]
  serviceYear         Int     @default(2026)
  dataVersion         Int     @default(0) // 乐观锁

  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  plans               VolunteerPlan[]
  filingRecords       FilingRecord[]
  admissionResults    AdmissionResult[]

  @@index([assignedTeacherId])
  @@index([status])
  @@index([examType, totalScore])
  @@index([serviceYear])
}
```

### VolunteerPlan

```prisma
model VolunteerPlan {
  id                Int        @id @default(autoincrement())
  studentId         Int
  student           StudentProfile @relation(fields: [studentId], references: [id])
  createdById       Int
  createdBy         User       @relation("PlanCreator", fields: [createdById], references: [id])

  batch             Batch
  examSource        ExamSource @default(GAOKAO)
  examNote          String?    // "2026成都二诊，总分580"

  // 版本管理
  versionNo         Int        @default(1)
  parentVersionId   Int?
  parentVersion     VolunteerPlan? @relation("PlanVersions", fields: [parentVersionId], references: [id])
  childVersions     VolunteerPlan[] @relation("PlanVersions")
  versionNote       String?

  // 算法参数
  priorityMode      PriorityMode
  rangeUp           Int?
  rangeDown         Int?
  binSize           Int?
  totalGroups       Int?
  bonusRules        Json?      // [{keyword, bonus}]

  // 审核状态
  status            PlanStatus @default(DRAFT)
  isFinal           Boolean    @default(false)
  finalizedAt       DateTime?
  finalizedBy       Int?

  exportCount       Int        @default(0)
  dataVersion       Int        @default(0) // 乐观锁

  createdAt         DateTime   @default(now())
  updatedAt         DateTime   @updatedAt

  items             PlanItem[]
  reviews           PlanReview[]
  filingRecords     FilingRecord[]
  evaluations       PlanEvaluation[]
  shareLinks        PlanShareLink[]

  @@unique([studentId, batch, versionNo])
  @@index([studentId, batch])
  @@index([status])
  @@index([createdById])
}
```

### PlanItem（结构化 24 列 + 扩展）

```prisma
model PlanItem {
  id                  Int         @id @default(autoincrement())
  planId              Int
  plan                VolunteerPlan @relation(fields: [planId], references: [id], onDelete: Cascade)

  sequence            Int         // 志愿序号（= 投档顺序）
  gradient            Gradient

  universityCode      String
  universityName      String
  groupCode           String      // 院校专业组代码
  groupName           String      // 院校专业组全称
  anchorMajor         String      // 锚定专业
  groupMajorCount     Int         // 组内专业数
  recommendedOrder    String?     // 前3专业名逗号分隔（卡片简要展示）
  fullMajorRanking    Json?       // 完整组内排序 [{majorName, isAnchor, recommendScore, disciplineScore, rankScore, isExcluded, note}]
  subjectRequirement  String?

  score25Group        Int?
  rank25Group         Int?
  score25Major        Int?
  rank25Major         Int?
  score24Major        Int?
  rank24Major         Int?

  planCount           Int?
  tuition             String?
  schoolNature        String?
  schoolTags          String?

  groupCleanliness    Cleanliness?
  selectionReason     String?     @db.Text
  riskWarning         String?     @db.Text
  adjustmentAdvice    String?

  compositeScore      Float?
  scoreBreakdown      Json?       // 评分分解 {tierScore, tierWeight, tierContrib, ...adjustedTotal}
  isManuallyModified  Boolean     @default(false)
  originalItemId      Int?

  @@index([planId, sequence])
  @@index([planId, gradient])
}
```

### PlanReview

```prisma
model PlanReview {
  id              Int          @id @default(autoincrement())
  planId          Int
  plan            VolunteerPlan @relation(fields: [planId], references: [id])
  reviewerId      Int
  reviewer        User         @relation(fields: [reviewerId], references: [id])
  reviewerRole    ReviewerRole
  action          ReviewAction
  comment         String?      @db.Text
  itemAnnotations Json?        // [{itemId, status:"ok"|"question"|"reject", note}]
  createdAt       DateTime     @default(now())

  @@index([planId])
  @@index([reviewerId])
}
```

### MajorRecommendation

```prisma
model MajorRecommendation {
  id              Int           @id @default(autoincrement())
  majorName       String
  matchKeywords   Json          // 拆分后的匹配关键词
  type            RecommendType
  source          String?
  year            Int

  @@index([type])
  @@index([year])
}
```

### MajorNameMapping

```prisma
model MajorNameMapping {
  id              Int     @id @default(autoincrement())
  rawName         String  @unique
  standardName    String
  suffix          String?       // 实验班/拔尖计划等
  majorCode       String?       // 教育部专业代码
  isExperimental  Boolean @default(false)
  isCooperation   Boolean @default(false)

  @@index([standardName])
}
```

### SupplementaryRecord

```prisma
model SupplementaryRecord {
  id                    Int    @id @default(autoincrement())
  year                  Int
  round                 Int    // 第几次征集
  province              String
  batch                 String
  universityCode        String
  universityName        String
  groupCode             String?
  majorName             String?
  originalPlan          Int    // 原始招生计划数
  remainingPlan         Int    // 征集计划数
  supplementaryRatio    Float  // 征集率 = remaining / original
  minScore              Int?
  minRank               Int?
  examType              String?
  subjectRequirement    String?

  @@index([universityCode, year])
  @@index([year, province, batch])
}
```

### SupplementarySummary（物理表，导入征集数据时 TRUNCATE+INSERT 刷新）

```prisma
model SupplementarySummary {
  id                Int      @id @default(autoincrement())
  universityCode    String
  groupCode         String
  majorName         String
  totalYears        Int
  totalRounds       Int
  avgRatio          Float    // 平均征集率
  trend             String   // INCREASING | STABLE | DECREASING
  consecutiveYears  Int
  latestYear        Int
  updatedAt         DateTime @updatedAt

  @@unique([universityCode, groupCode, majorName])
}
```

### BatchConfig

```prisma
model BatchConfig {
  id                Int      @id @default(autoincrement())
  batch             String
  year              Int
  province          String
  maxGroupCount     Int
  volunteerMode     String   // "parallel" | "sequential"
  filingRatio       Float?
  eligibilityRules  Json?    // 资格条件（身体、户籍、分数等）
  tiebreakRules     Json?
  algorithmConfig   Json?    // {mode:"auto"|"manual"|"semi-auto", ...}
  createdAt         DateTime @default(now())

  @@unique([batch, year, province])
}
```

### AlgorithmConfig

```prisma
model AlgorithmConfig {
  id          Int      @id @default(autoincrement())
  name        String
  params      Json     // {W1Range, W2Range, W3Range, W4Range, ...}
  isActive    Boolean  @default(false)
  createdBy   Int
  note        String?
  createdAt   DateTime @default(now())

  @@index([isActive])
}
```

### Notification

```prisma
model Notification {
  id            Int      @id @default(autoincrement())
  userId        Int
  user          User     @relation(fields: [userId], references: [id])
  type          String   // PLAN_GENERATED | REVIEW_REQUESTED | REVIEW_COMPLETED | PLAN_PUBLISHED | STUDENT_QUESTION | DATA_CHANGED | STUDENT_ASSIGNED | PLAN_GENERATION_FAILED | SYSTEM_ERROR
  title         String
  content       String?
  relatedId     Int?
  relatedType   String?  // PLAN | REVIEW | STUDENT | SYSTEM
  isRead        Boolean  @default(false)
  createdAt     DateTime @default(now())

  @@index([userId, isRead])
  @@index([userId, createdAt])
}
```

### AuditLog

```prisma
model AuditLog {
  id          Int      @id @default(autoincrement())
  userId      Int
  action      String   // CREATE_PLAN | EDIT_PLAN | FINALIZE_PLAN | PUBLISH_PLAN | REVOKE_PLAN | REPLACE_ITEM | DELETE_ITEM | APPROVE_REVIEW | EXPORT_PLAN | EXPORT_STUDENT_DATA | UPDATE_SCORE | BATCH_REGENERATE | TRANSFER_STUDENT | DATA_IMPORT
  targetType  String   // PLAN | PLAN_ITEM | STUDENT | SYSTEM
  targetId    Int
  details     Json?    // {before, after} 或其他上下文
  ip          String?
  userAgent   String?
  createdAt   DateTime @default(now())

  @@index([userId, createdAt])
  @@index([targetType, targetId])
}
```

### FilingRecord

```prisma
model FilingRecord {
  id            Int      @id @default(autoincrement())
  studentId     Int
  student       StudentProfile @relation(fields: [studentId], references: [id])
  planId        Int
  plan          VolunteerPlan @relation(fields: [planId], references: [id])
  screenshots   Json     // FileRecord ID 数组
  filingTime    DateTime?
  uploadedBy    Int
  note          String?
  createdAt     DateTime @default(now())

  @@index([studentId])
}
```

### AdmissionResult

```prisma
model AdmissionResult {
  id                    Int      @id @default(autoincrement())
  studentId             Int
  student               StudentProfile @relation(fields: [studentId], references: [id])
  planId                Int?
  admittedUniversity    String
  admittedMajorGroup    String?
  admittedMajor         String
  admittedBatch         String?
  isSupplementary       Boolean  @default(false)
  supplementaryRound    Int?
  resultSource          String   // SCREENSHOT | MANUAL
  screenshots           Json?
  confirmedAt           DateTime?
  createdAt             DateTime @default(now())
  evaluations           PlanEvaluation[]

  @@index([studentId])
}
```

### PlanEvaluation

```prisma
model PlanEvaluation {
  id                    Int      @id @default(autoincrement())
  planId                Int
  plan                  VolunteerPlan @relation(fields: [planId], references: [id])
  admissionResultId     Int
  admissionResult       AdmissionResult @relation(fields: [admissionResultId], references: [id])
  matchedItemSequence   Int?
  matchedGradient       String?
  isInPlan              Boolean
  evaluationScore       Float?
  evaluationNote        String?  @db.Text
  createdAt             DateTime @default(now())

  @@index([planId])
}
```

### FileRecord

```prisma
model FileRecord {
  id            Int      @id @default(autoincrement())
  originalName  String
  storagePath   String
  mimeType      String
  size          Int      // 字节
  uploadedBy    Int
  relatedType   String?  // FILING | ADMISSION | IMPORT | AVATAR
  relatedId     Int?
  createdAt     DateTime @default(now())

  @@index([relatedType, relatedId])
}
```

### PlanShareLink

```prisma
model PlanShareLink {
  id          Int       @id @default(autoincrement())
  planId      Int
  plan        VolunteerPlan @relation(fields: [planId], references: [id])
  token       String    @unique // UUID v4
  expiresAt   DateTime          // 7天有效
  createdBy   Int
  viewCount   Int       @default(0)
  createdAt   DateTime  @default(now())

  @@index([token])
}
```

## 现有表补充索引

```prisma
// AdmissionRecord（已有模型，需补充）
@@index([universityCode, year, province])
@@index([year, province, examType, rank])     // 引擎核心查询
@@index([universityCode, groupCode, year])

// EnrollmentPlan（已有模型，需补充）
@@index([year, province, batch, examType])
@@index([universityCode, year])
```

## 备选池存储（不入数据库）

```
Redis Key:  candidatePool:{planId}
Value:      完整备选池 JSON（按 bin 分区）
TTL:        7天
写入:       方案生成时
读取:       老师编辑/导出时（过期则静默重算）
清除:       方案定版后
```

## 迁移策略

```
Migration 1: 新增 TeacherProfile / StudentProfile
Migration 2: 数据迁移（User 旧字段 → Profile）
Migration 3: 清理 User 旧字段
Migration 4: 新增方案相关表（PlanItem, PlanReview 等）
Migration 5: 新增征集/录取/评估/通知表
Migration 6: 新增 AuditLog + MajorNameMapping + FileRecord + PlanShareLink + AlgorithmConfig
Migration 7: 补充复合索引
每步验证数据完整性后再进行下一步
```
