# Plan 1: 地基层实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立数据库 schema、CASL 权限系统、核心基础设施（队列/SSE/审计）和基础 API，解锁后续所有开发。

**Architecture:** 将 god-model User 拆分为 User + TeacherProfile + StudentProfile。用 CASL 细粒度权限替换 RolesGuard，支持角色默认权限 + 管理员覆盖。添加 BullMQ 异步队列、SSE 实时通知、Prisma Client Extensions 审计日志。

**Tech Stack:** NestJS 10, Prisma 7 (MySQL/MariaDB adapter), @casl/ability, @nestjs/bullmq, Redis 7 (ioredis), Jest 29

---

## File Structure

### New Files

```
apps/server/src/
  modules/
    casl/
      casl.module.ts                    — CASL 全局模块
      casl-ability.factory.ts           — 权限构建工厂
      casl-ability.factory.spec.ts      — 工厂单元测试
      policies.guard.ts                 — 策略守卫
      check-policies.decorator.ts       — @CheckPolicies 装饰器
      types.ts                          — Actions/Subjects 类型
    student/
      student.module.ts
      student.controller.ts
      student.service.ts
      student.service.spec.ts
      dto/
        create-student.dto.ts
        update-student-profile.dto.ts
        query-student.dto.ts
    teacher/
      teacher.module.ts
      teacher.controller.ts
      teacher.service.ts
    notification/
      notification.module.ts
      notification.controller.ts
      notification.service.ts
    audit/
      audit.module.ts
      audit.service.ts
      prisma-audit.extension.ts
    queue/
      queue.module.ts
  common/
    decorators/
      current-user.decorator.ts         — @CurrentUser 参数装饰器

.github/
  workflows/
    ci.yml                              — CI 流水线

scripts/
  backup-db.sh                          — MySQL 备份脚本
```

### Modified Files

```
apps/server/prisma/schema.prisma              — Schema 全面重构
apps/server/src/app.module.ts                 — 新模块导入
apps/server/src/modules/auth/auth.service.ts  — 新角色 + JWT payload 扩展
apps/server/src/modules/auth/auth.controller.ts
apps/server/src/modules/auth/dto/register.dto.ts
apps/server/src/modules/auth/strategies/jwt.strategy.ts
apps/server/src/modules/user/user.service.ts  — Admin CRUD 扩展
apps/server/src/modules/user/user.controller.ts
apps/server/package.json                      — 新依赖
packages/shared/src/types/index.ts            — 新共享类型
```

---

## Task 1: Install New Dependencies

**Files:**
- Modify: `apps/server/package.json`

- [ ] **Step 1: Install CASL and BullMQ packages**

```bash
cd apps/server && pnpm add @casl/ability @nestjs/bullmq bullmq
```

- [ ] **Step 2: Verify installation**

Run: `cd apps/server && node -e "require('@casl/ability'); require('@nestjs/bullmq'); console.log('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add apps/server/package.json pnpm-lock.yaml
git commit -m "chore: add @casl/ability, @nestjs/bullmq dependencies"
```

---

## Task 2: Schema — Add All New Enums

**Files:**
- Modify: `apps/server/prisma/schema.prisma`

- [ ] **Step 1: Replace UserRole enum and expand PlanStatus**

Find the existing `UserRole` and `PlanStatus` enums in `schema.prisma` and replace them:

```prisma
// Replace:  enum UserRole { USER  ADMIN  SUPER_ADMIN }
// With:
enum Role {
  ADMIN
  TEACHER
  STUDENT
}

// Replace:  enum PlanStatus { DRAFT  SUBMITTED  ARCHIVED }
// With:
enum PlanStatus {
  DRAFT
  PENDING_REVIEW
  REVIEWING
  APPROVED
  REJECTED
  FINALIZED
  PUBLISHED
  OUTDATED
}
```

- [ ] **Step 2: Add all new enums**

Add the following enum block after the existing enums (before the model definitions):

```prisma
// ==================== 新枚举 ====================

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

enum NewExamType {
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
  UNDECIDED
}

enum AcceptLevel {
  YES
  NO
  UNDECIDED
}

enum TuitionBudget {
  LOW        // <=6000
  MEDIUM     // <=15000
  HIGH       // 不限
  UNDECIDED
}

enum Batch {
  EARLY
  SPECIAL_A
  NORMAL_B
  JUNIOR_COLLEGE
}

enum ExamSource {
  MOCK_ERZHEN
  MOCK_SANZHEN
  MOCK_OTHER
  GAOKAO
}

enum Gradient {
  HIGH_RUSH
  RUSH
  STABLE_RUSH
  STABLE
  SAFE_STABLE
  SAFE
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

> **Note:** 使用 `NewExamType` 而非 `ExamType`，因为 BatchConfig/ScoreSegment 等现有模型用 `String` 存储 examType，避免冲突。后续可在清理迁移中统一。

- [ ] **Step 3: Update User.role field type**

In the `User` model, change `role` field from `UserRole` to `Role`:

```prisma
// Before:
//   role UserRole @default(USER)
// After:
  role Role @default(STUDENT)
```

- [ ] **Step 4: Run prisma generate to verify syntax**

Run: `cd apps/server && npx prisma format && npx prisma generate`
Expected: No errors. If enum rename causes issues with existing data, see Task 6.

- [ ] **Step 5: Commit**

```bash
git add apps/server/prisma/schema.prisma
git commit -m "feat: add 16 new enums, replace UserRole with Role, expand PlanStatus"
```

---

## Task 3: Schema — User Refactor + TeacherProfile + StudentProfile

**Files:**
- Modify: `apps/server/prisma/schema.prisma`

- [ ] **Step 1: Add new fields to User model**

Add these fields to the existing `User` model (keep all existing fields for backward compatibility):

```prisma
model User {
  id        Int      @id @default(autoincrement())
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  // 账号信息（保持不变）
  username     String  @unique @db.VarChar(50)
  email        String? @unique @db.VarChar(100)
  phone        String? @unique @db.VarChar(20)
  passwordHash String  @map("password_hash") @db.VarChar(255)

  // 个人信息（修改 + 新增）
  realName  String?   @map("real_name") @db.VarChar(100)
  gender    String?   @db.VarChar(10)       // 暂保留 String，后续可改 Gender 枚举
  birthDate DateTime? @map("birth_date") @db.Date  // 暂保留
  avatar    String?   @db.VarChar(500)

  // === 新增字段 ===
  role              Role      @default(STUDENT)
  ethnicity         String?   @db.VarChar(50)
  permissionOverrides Json?   @map("permission_overrides")  // [{action, subject, granted}]

  // 考生信息（暂保留，后续迁移到 StudentProfile 后清理）
  province String? @db.VarChar(50)
  city     String? @db.VarChar(100)
  examType String? @map("exam_type") @db.VarChar(50)
  examYear Int?    @map("exam_year") @db.SmallInt
  score    Int?    @db.SmallInt
  rank     Int?
  subjects Json?
  batch    String? @db.VarChar(50)

  // 兴趣偏好（暂保留）
  preferredProvinces       Json?   @map("preferred_provinces")
  preferredCities          Json?   @map("preferred_cities")
  preferredMajors          Json?   @map("preferred_majors")
  preferredUniversityTypes Json?   @map("preferred_university_types")
  careerDirection          String? @map("career_direction") @db.Text

  // 会员信息（暂保留）
  vipLevel    VipLevel  @default(FREE) @map("vip_level")
  vipExpireAt DateTime? @map("vip_expire_at")

  // 登录信息
  lastLoginAt DateTime? @map("last_login_at")
  lastLoginIp String?   @map("last_login_ip") @db.VarChar(50)

  // === 新关联 ===
  teacherProfile  TeacherProfile?
  studentProfile  StudentProfile?
  createdPlans    VolunteerPlan[]   @relation("PlanCreator")
  reviews         PlanReview[]
  notifications   Notification[]

  // 旧关联（暂保留）
  volunteerPlans  VolunteerPlan[]   @relation("LegacyUserPlans")
  searchHistories SearchHistory[]
  favorites       Favorite[]
  comparisons     Comparison[]
  orders          Order[]

  @@index([province])
  @@index([examYear])
  @@index([vipLevel])
  @@index([role])
  @@map("users")
}
```

> **Note:** 保留所有旧字段避免破坏性变更。VolunteerPlan 需要两个关联（旧 userId + 新 createdById），所以给旧关联加 `@relation("LegacyUserPlans")`。

- [ ] **Step 2: Add TeacherProfile model**

在 User 模型之后添加:

```prisma
// ==================== 老师档案 ====================

model TeacherProfile {
  id            Int      @id @default(autoincrement())
  userId        Int      @unique @map("user_id")
  user          User     @relation(fields: [userId], references: [id])
  school        String?  @db.VarChar(200)
  isSupervisor  Boolean  @default(false) @map("is_supervisor")
  createdAt     DateTime @default(now()) @map("created_at")
  updatedAt     DateTime @updatedAt @map("updated_at")

  students      StudentProfile[] @relation("TeacherStudents")

  @@map("teacher_profiles")
}
```

- [ ] **Step 3: Add StudentProfile model**

在 TeacherProfile 之后添加:

```prisma
// ==================== 学生档案 ====================

model StudentProfile {
  id                  Int            @id @default(autoincrement())
  userId              Int            @unique @map("user_id")
  user                User           @relation(fields: [userId], references: [id])
  status              StudentStatus  @default(PENDING_INFO)
  assignedTeacherId   Int?           @map("assigned_teacher_id")
  assignedTeacher     TeacherProfile? @relation("TeacherStudents", fields: [assignedTeacherId], references: [id])
  assignedAt          DateTime?      @map("assigned_at")
  infoCompleteness    Int            @default(0) @map("info_completeness")

  // ---- 第一组：基本信息 ----
  idNumberEncrypted   String?   @map("id_number_encrypted") @db.VarChar(500)
  parentPhone         String?   @map("parent_phone") @db.VarChar(20)
  highSchool          String?   @map("high_school") @db.VarChar(200)
  classInfo           String?   @map("class_info") @db.VarChar(100)
  province            String    @default("四川") @db.VarChar(50)
  city                String?   @db.VarChar(100)
  isRural             Boolean   @default(false) @map("is_rural")

  // ---- 第二组：考试成绩 ----
  examYear            Int?      @map("exam_year") @db.SmallInt
  examType            NewExamType? @map("exam_type")
  firstChoice         String?   @map("first_choice") @db.VarChar(50)
  reChoices           Json?     @map("re_choices")
  scoreChinese        Int?      @map("score_chinese") @db.SmallInt
  scoreMath           Int?      @map("score_math") @db.SmallInt
  scoreEnglish        Int?      @map("score_english") @db.SmallInt
  scoreFirstChoice    Int?      @map("score_first_choice") @db.SmallInt
  scoreSub1           Int?      @map("score_sub1") @db.SmallInt
  scoreSub2           Int?      @map("score_sub2") @db.SmallInt
  totalScore          Int?      @map("total_score") @db.SmallInt
  provincialRank      Int?      @map("provincial_rank")
  strongSubjects      Json?     @map("strong_subjects")
  weakSubjects        Json?     @map("weak_subjects")

  // ---- 第三组：身体条件 ----
  physicalCondition   Json?     @map("physical_condition")

  // ---- 第四组：升学规划 ----
  priorityMode        PriorityMode? @map("priority_mode")
  careerPlan          CareerPlan?   @map("career_plan")
  careerDirection     String?       @map("career_direction") @db.VarChar(500)
  militaryInterest    Boolean       @default(false) @map("military_interest")
  teacherInterest     Boolean       @default(false) @map("teacher_interest")

  // ---- 第五组：正向偏好 ----
  preferredMajors         Json?   @map("preferred_majors")
  preferredUniversities   Json?   @map("preferred_universities")
  preferredCities         Json?   @map("preferred_cities")
  preferredProvinces      Json?   @map("preferred_provinces")
  stayInProvince          StayPreference? @map("stay_in_province")

  // ---- 第六组：反向排除 ----
  excludedMajors          Json?   @map("excluded_majors")
  excludedUniversities    Json?   @map("excluded_universities")
  excludedCities          Json?   @map("excluded_cities")
  excludedProvinces       Json?   @map("excluded_provinces")

  // ---- 第七组：经济与特殊条件 ----
  tuitionBudget       TuitionBudget  @default(UNDECIDED) @map("tuition_budget")
  acceptPrivate       AcceptLevel    @default(UNDECIDED) @map("accept_private")
  acceptCooperation   AcceptLevel    @default(UNDECIDED) @map("accept_cooperation")
  specialProgram      Json?          @map("special_program")
  otherRequirements   String?        @map("other_requirements") @db.Text

  // ---- 第八组：兴趣性格（选填）----
  interests           Json?
  personalityType     String?        @map("personality_type") @db.VarChar(50)
  selfDescription     String?        @map("self_description") @db.Text

  // ---- 管理字段 ----
  tags                Json?
  serviceYear         Int            @default(2026) @map("service_year")
  dataVersion         Int            @default(0)    @map("data_version")

  createdAt           DateTime       @default(now()) @map("created_at")
  updatedAt           DateTime       @updatedAt @map("updated_at")

  plans               VolunteerPlan[]
  filingRecords       FilingRecord[]
  admissionResults    AdmissionResult[]

  @@index([assignedTeacherId])
  @@index([status])
  @@index([examType, totalScore])
  @@index([serviceYear])
  @@map("student_profiles")
}
```

- [ ] **Step 4: Verify syntax**

Run: `cd apps/server && npx prisma format`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add apps/server/prisma/schema.prisma
git commit -m "feat: add TeacherProfile, StudentProfile models; refactor User model"
```

---

## Task 4: Schema — VolunteerPlan Overhaul + Plan Models

**Files:**
- Modify: `apps/server/prisma/schema.prisma`

- [ ] **Step 1: Refactor VolunteerPlan model**

Replace the existing `VolunteerPlan` model with:

```prisma
// ==================== 志愿方案 ====================

model VolunteerPlan {
  id        Int      @id @default(autoincrement())
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  // 关联
  studentId     Int              @map("student_id")
  student       StudentProfile   @relation(fields: [studentId], references: [id])
  createdById   Int              @map("created_by_id")
  createdBy     User             @relation("PlanCreator", fields: [createdById], references: [id])

  // 旧关联（暂保留以兼容旧数据）
  userId        Int?             @map("user_id")
  legacyUser    User?            @relation("LegacyUserPlans", fields: [userId], references: [id])

  // 批次与来源
  batch             Batch
  examSource        ExamSource    @default(GAOKAO) @map("exam_source")
  examNote          String?       @map("exam_note") @db.VarChar(500)

  // 版本管理
  versionNo         Int           @default(1) @map("version_no")
  parentVersionId   Int?          @map("parent_version_id")
  parentVersion     VolunteerPlan? @relation("PlanVersions", fields: [parentVersionId], references: [id])
  childVersions     VolunteerPlan[] @relation("PlanVersions")
  versionNote       String?       @map("version_note") @db.VarChar(500)

  // 算法参数
  priorityMode      PriorityMode  @map("priority_mode")
  rangeUp           Int?          @map("range_up")
  rangeDown         Int?          @map("range_down")
  binSize           Int?          @map("bin_size")
  totalGroups       Int?          @map("total_groups")
  bonusRules        Json?         @map("bonus_rules")

  // 状态
  status            PlanStatus    @default(DRAFT)
  isFinal           Boolean       @default(false) @map("is_final")
  finalizedAt       DateTime?     @map("finalized_at")
  finalizedBy       Int?          @map("finalized_by")

  // 旧字段（暂保留）
  name              String?       @db.VarChar(200)
  year              Int?          @db.SmallInt
  province          String?       @db.VarChar(50)
  legacyItems       Json?         @map("items")
  strategy          String?       @db.VarChar(50)
  isFavorite        Boolean       @default(false) @map("is_favorite")
  aiScore           Decimal?      @map("ai_score") @db.Decimal(5, 2)
  aiAnalysis        Json?         @map("ai_analysis")
  riskLevel         String?       @map("risk_level") @db.VarChar(20)
  notes             String?       @db.Text

  exportCount       Int           @default(0) @map("export_count")
  dataVersion       Int           @default(0) @map("data_version")

  // 新关联
  planItems         PlanItem[]
  reviews           PlanReview[]
  filingRecords     FilingRecord[]
  evaluations       PlanEvaluation[]
  shareLinks        PlanShareLink[]

  @@unique([studentId, batch, versionNo])
  @@index([studentId, batch])
  @@index([status])
  @@index([createdById])
  @@index([userId])
  @@index([year])
  @@map("volunteer_plans")
}
```

> **Note:** 旧字段（name, year, province, items/legacyItems, strategy, isFavorite, ai*, notes）和旧关联（userId/legacyUser）暂保留。新代码只使用新字段，旧代码在后续迁移中清理。`legacyItems` 用 `@map("items")` 映射到原列名。

- [ ] **Step 2: Add PlanItem model**

```prisma
// ==================== 方案志愿项 ====================

model PlanItem {
  id                  Int           @id @default(autoincrement())
  planId              Int           @map("plan_id")
  plan                VolunteerPlan @relation(fields: [planId], references: [id], onDelete: Cascade)

  sequence            Int
  gradient            Gradient

  universityCode      String        @map("university_code") @db.VarChar(50)
  universityName      String        @map("university_name") @db.VarChar(200)
  groupCode           String        @map("group_code") @db.VarChar(50)
  groupName           String        @map("group_name") @db.VarChar(200)
  anchorMajor         String        @map("anchor_major") @db.VarChar(200)
  groupMajorCount     Int           @map("group_major_count")
  recommendedOrder    String?       @map("recommended_order") @db.VarChar(500)
  fullMajorRanking    Json?         @map("full_major_ranking")
  subjectRequirement  String?       @map("subject_requirement") @db.VarChar(200)

  score25Group        Int?          @map("score_25_group")
  rank25Group         Int?          @map("rank_25_group")
  score25Major        Int?          @map("score_25_major")
  rank25Major         Int?          @map("rank_25_major")
  score24Major        Int?          @map("score_24_major")
  rank24Major         Int?          @map("rank_24_major")

  planCount           Int?          @map("plan_count")
  tuition             String?       @db.VarChar(100)
  schoolNature        String?       @map("school_nature") @db.VarChar(100)
  schoolTags          String?       @map("school_tags") @db.VarChar(500)

  groupCleanliness    Cleanliness?  @map("group_cleanliness")
  selectionReason     String?       @map("selection_reason") @db.Text
  riskWarning         String?       @map("risk_warning") @db.Text
  adjustmentAdvice    String?       @map("adjustment_advice") @db.VarChar(500)

  compositeScore      Float?        @map("composite_score")
  scoreBreakdown      Json?         @map("score_breakdown")
  isManuallyModified  Boolean       @default(false) @map("is_manually_modified")
  originalItemId      Int?          @map("original_item_id")

  @@index([planId, sequence])
  @@index([planId, gradient])
  @@map("plan_items")
}
```

- [ ] **Step 3: Add PlanReview and PlanEvaluation models**

```prisma
// ==================== 方案审核 ====================

model PlanReview {
  id              Int           @id @default(autoincrement())
  planId          Int           @map("plan_id")
  plan            VolunteerPlan @relation(fields: [planId], references: [id])
  reviewerId      Int           @map("reviewer_id")
  reviewer        User          @relation(fields: [reviewerId], references: [id])
  reviewerRole    ReviewerRole  @map("reviewer_role")
  action          ReviewAction
  comment         String?       @db.Text
  itemAnnotations Json?         @map("item_annotations")
  createdAt       DateTime      @default(now()) @map("created_at")

  @@index([planId])
  @@index([reviewerId])
  @@map("plan_reviews")
}

// ==================== 方案评估 ====================

model PlanEvaluation {
  id                    Int             @id @default(autoincrement())
  planId                Int             @map("plan_id")
  plan                  VolunteerPlan   @relation(fields: [planId], references: [id])
  admissionResultId     Int             @map("admission_result_id")
  admissionResult       AdmissionResult @relation(fields: [admissionResultId], references: [id])
  matchedItemSequence   Int?            @map("matched_item_sequence")
  matchedGradient       String?         @map("matched_gradient") @db.VarChar(50)
  isInPlan              Boolean         @map("is_in_plan")
  evaluationScore       Float?          @map("evaluation_score")
  evaluationNote        String?         @map("evaluation_note") @db.Text
  createdAt             DateTime        @default(now()) @map("created_at")

  @@index([planId])
  @@map("plan_evaluations")
}
```

- [ ] **Step 4: Verify syntax**

Run: `cd apps/server && npx prisma format`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add apps/server/prisma/schema.prisma
git commit -m "feat: overhaul VolunteerPlan, add PlanItem/PlanReview/PlanEvaluation models"
```

---

## Task 5: Schema — Supporting + Operational Models + Index Updates

**Files:**
- Modify: `apps/server/prisma/schema.prisma`

- [ ] **Step 1: Add MajorRecommendation and MajorNameMapping**

```prisma
// ==================== 专业推荐清单 ====================

model MajorRecommendation {
  id              Int           @id @default(autoincrement())
  majorName       String        @map("major_name") @db.VarChar(200)
  matchKeywords   Json          @map("match_keywords")
  type            RecommendType
  source          String?       @db.VarChar(200)
  year            Int           @db.SmallInt

  @@index([type])
  @@index([year])
  @@map("major_recommendations")
}

// ==================== 专业名称标准化映射 ====================

model MajorNameMapping {
  id              Int     @id @default(autoincrement())
  rawName         String  @unique @map("raw_name") @db.VarChar(200)
  standardName    String  @map("standard_name") @db.VarChar(200)
  suffix          String? @db.VarChar(100)
  majorCode       String? @map("major_code") @db.VarChar(50)
  isExperimental  Boolean @default(false) @map("is_experimental")
  isCooperation   Boolean @default(false) @map("is_cooperation")

  @@index([standardName])
  @@map("major_name_mappings")
}
```

- [ ] **Step 2: Add SupplementaryRecord and SupplementarySummary**

```prisma
// ==================== 征集志愿记录 ====================

model SupplementaryRecord {
  id                    Int     @id @default(autoincrement())
  year                  Int     @db.SmallInt
  round                 Int     @db.SmallInt
  province              String  @db.VarChar(50)
  batch                 String  @db.VarChar(100)
  universityCode        String  @map("university_code") @db.VarChar(50)
  universityName        String  @map("university_name") @db.VarChar(200)
  groupCode             String? @map("group_code") @db.VarChar(50)
  majorName             String? @map("major_name") @db.VarChar(200)
  originalPlan          Int     @map("original_plan")
  remainingPlan         Int     @map("remaining_plan")
  supplementaryRatio    Float   @map("supplementary_ratio")
  minScore              Int?    @map("min_score")
  minRank               Int?    @map("min_rank")
  examType              String? @map("exam_type") @db.VarChar(50)
  subjectRequirement    String? @map("subject_requirement") @db.VarChar(200)

  @@index([universityCode, year])
  @@index([year, province, batch])
  @@map("supplementary_records")
}

// ==================== 征集汇总（物理表，导入时 TRUNCATE+INSERT 刷新）====================

model SupplementarySummary {
  id                Int      @id @default(autoincrement())
  universityCode    String   @map("university_code") @db.VarChar(50)
  groupCode         String   @map("group_code") @db.VarChar(50)
  majorName         String   @map("major_name") @db.VarChar(200)
  totalYears        Int      @map("total_years")
  totalRounds       Int      @map("total_rounds")
  avgRatio          Float    @map("avg_ratio")
  trend             String   @db.VarChar(20) // INCREASING | STABLE | DECREASING
  consecutiveYears  Int      @map("consecutive_years")
  latestYear        Int      @map("latest_year") @db.SmallInt
  updatedAt         DateTime @updatedAt @map("updated_at")

  @@unique([universityCode, groupCode, majorName])
  @@map("supplementary_summaries")
}
```

- [ ] **Step 3: Add Notification, AuditLog, FileRecord**

```prisma
// ==================== 通知 ====================

model Notification {
  id            Int      @id @default(autoincrement())
  userId        Int      @map("user_id")
  user          User     @relation(fields: [userId], references: [id])
  type          String   @db.VarChar(50) // PLAN_GENERATED | REVIEW_REQUESTED | etc.
  title         String   @db.VarChar(200)
  content       String?  @db.Text
  relatedId     Int?     @map("related_id")
  relatedType   String?  @map("related_type") @db.VarChar(50) // PLAN | REVIEW | STUDENT | SYSTEM
  isRead        Boolean  @default(false) @map("is_read")
  createdAt     DateTime @default(now()) @map("created_at")

  @@index([userId, isRead])
  @@index([userId, createdAt])
  @@map("notifications")
}

// ==================== 审计日志 ====================

model AuditLog {
  id          Int      @id @default(autoincrement())
  userId      Int      @map("user_id")
  action      String   @db.VarChar(50)
  targetType  String   @map("target_type") @db.VarChar(50)
  targetId    Int      @map("target_id")
  details     Json?
  ip          String?  @db.VarChar(50)
  userAgent   String?  @map("user_agent") @db.VarChar(500)
  createdAt   DateTime @default(now()) @map("created_at")

  @@index([userId, createdAt])
  @@index([targetType, targetId])
  @@map("audit_logs")
}

// ==================== 文件记录 ====================

model FileRecord {
  id            Int      @id @default(autoincrement())
  originalName  String   @map("original_name") @db.VarChar(500)
  storagePath   String   @map("storage_path") @db.VarChar(500)
  mimeType      String   @map("mime_type") @db.VarChar(100)
  size          Int
  uploadedBy    Int      @map("uploaded_by")
  relatedType   String?  @map("related_type") @db.VarChar(50)
  relatedId     Int?     @map("related_id")
  createdAt     DateTime @default(now()) @map("created_at")

  @@index([relatedType, relatedId])
  @@map("file_records")
}
```

- [ ] **Step 4: Add FilingRecord, AdmissionResult, PlanShareLink, AlgorithmConfig**

```prisma
// ==================== 填报记录 ====================

model FilingRecord {
  id            Int            @id @default(autoincrement())
  studentId     Int            @map("student_id")
  student       StudentProfile @relation(fields: [studentId], references: [id])
  planId        Int            @map("plan_id")
  plan          VolunteerPlan  @relation(fields: [planId], references: [id])
  screenshots   Json
  filingTime    DateTime?      @map("filing_time")
  uploadedBy    Int            @map("uploaded_by")
  note          String?        @db.Text
  createdAt     DateTime       @default(now()) @map("created_at")

  @@index([studentId])
  @@map("filing_records")
}

// ==================== 录取结果 ====================

model AdmissionResult {
  id                    Int            @id @default(autoincrement())
  studentId             Int            @map("student_id")
  student               StudentProfile @relation(fields: [studentId], references: [id])
  planId                Int?           @map("plan_id")
  admittedUniversity    String         @map("admitted_university") @db.VarChar(200)
  admittedMajorGroup    String?        @map("admitted_major_group") @db.VarChar(200)
  admittedMajor         String         @map("admitted_major") @db.VarChar(200)
  admittedBatch         String?        @map("admitted_batch") @db.VarChar(100)
  isSupplementary       Boolean        @default(false) @map("is_supplementary")
  supplementaryRound    Int?           @map("supplementary_round")
  resultSource          String         @map("result_source") @db.VarChar(50)
  screenshots           Json?
  confirmedAt           DateTime?      @map("confirmed_at")
  createdAt             DateTime       @default(now()) @map("created_at")
  evaluations           PlanEvaluation[]

  @@index([studentId])
  @@map("admission_results")
}

// ==================== 方案分享链接 ====================

model PlanShareLink {
  id          Int           @id @default(autoincrement())
  planId      Int           @map("plan_id")
  plan        VolunteerPlan @relation(fields: [planId], references: [id])
  token       String        @unique @db.VarChar(36)
  expiresAt   DateTime      @map("expires_at")
  createdBy   Int           @map("created_by")
  viewCount   Int           @default(0) @map("view_count")
  createdAt   DateTime      @default(now()) @map("created_at")

  @@index([token])
  @@map("plan_share_links")
}

// ==================== 算法配置版本 ====================

model AlgorithmConfig {
  id          Int      @id @default(autoincrement())
  name        String   @db.VarChar(200)
  params      Json
  isActive    Boolean  @default(false) @map("is_active")
  createdBy   Int      @map("created_by")
  note        String?  @db.Text
  createdAt   DateTime @default(now()) @map("created_at")

  @@index([isActive])
  @@map("algorithm_configs")
}
```

- [ ] **Step 5: Add new fields to BatchConfig**

In the existing `BatchConfig` model, add two new fields:

```prisma
// Add after tiebreakRules:
  eligibilityRules  Json?   @map("eligibility_rules")  // 资格条件
  algorithmConfig   Json?   @map("algorithm_config")    // {mode:"auto"|"manual"|"semi-auto"}
```

- [ ] **Step 6: Add supplementary indexes to existing models**

Add these composite indexes to `AdmissionRecord`:

```prisma
// Add inside AdmissionRecord model, before @@map:
  @@index([universityId, year, province])
  @@index([year, province, majorMinRank])
```

Add to `EnrollmentPlan`:

```prisma
// Add inside EnrollmentPlan model, before @@map:
  @@index([year, province, batch])
```

- [ ] **Step 7: Verify full schema syntax**

Run: `cd apps/server && npx prisma format && npx prisma validate`
Expected: No errors

- [ ] **Step 8: Commit**

```bash
git add apps/server/prisma/schema.prisma
git commit -m "feat: add all supporting/operational models, update indexes"
```

---

## Task 6: Create and Apply Database Migration

**Files:**
- Modify: `apps/server/prisma/` (migrations directory)

- [ ] **Step 1: Create migration (preview only)**

```bash
cd apps/server && npx prisma migrate dev --create-only --name foundation_layer
```

Expected: Creates a migration SQL file in `prisma/migrations/`. Review the generated SQL.

- [ ] **Step 2: Review generated SQL for issues**

Read the generated migration SQL file. Check for:
- Correct enum changes (UserRole → Role)
- No accidental data drops on important tables (University, Major, EnrollmentPlan, AdmissionRecord, ScoreSegment, BatchLine)
- New tables created correctly

If the migration tries to drop the `role` column and recreate it (common with enum changes), you may need to manually edit the SQL. Add at the top of the migration file:

```sql
-- Handle enum migration: if volunteer_plans has legacy data, clear it
-- (Pre-launch: no production data to preserve)
SET FOREIGN_KEY_CHECKS = 0;
TRUNCATE TABLE `volunteer_plans`;
SET FOREIGN_KEY_CHECKS = 1;
```

- [ ] **Step 3: Apply migration**

```bash
cd apps/server && npx prisma migrate dev
```

Expected: Migration applied successfully. If it fails due to data incompatibility, run:

```bash
cd apps/server && npx prisma migrate reset --force
```

> **Warning:** `migrate reset` drops and recreates the database. Only acceptable pre-launch. Re-import data (universities, majors, etc.) afterwards with `pnpm import:data`.

- [ ] **Step 4: Regenerate Prisma Client**

```bash
cd apps/server && npx prisma generate
```

Expected: Prisma Client generated successfully with all new types.

- [ ] **Step 5: Verify Prisma Client types**

```bash
cd apps/server && node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
console.log('Models:', Object.keys(p).filter(k => !k.startsWith('_') && !k.startsWith('\$')).join(', '));
"
```

Expected: Output includes new models (teacherProfile, studentProfile, planItem, planReview, notification, auditLog, etc.)

- [ ] **Step 6: Commit**

```bash
git add apps/server/prisma/
git commit -m "feat: apply foundation layer database migration"
```

---

## Task 7: CASL Types + Ability Factory + Unit Tests

**Files:**
- Create: `apps/server/src/modules/casl/types.ts`
- Create: `apps/server/src/modules/casl/casl-ability.factory.ts`
- Create: `apps/server/src/modules/casl/casl-ability.factory.spec.ts`

- [ ] **Step 1: Write the CASL types**

Create `apps/server/src/modules/casl/types.ts`:

```typescript
export type Actions =
  | 'manage'
  | 'create'
  | 'read'
  | 'update'
  | 'delete'
  | 'export'
  | 'review'
  | 'publish'
  | 'use';

export type Subjects =
  | 'all'
  | 'User'
  | 'StudentProfile'
  | 'TeacherProfile'
  | 'VolunteerPlan'
  | 'PlanItem'
  | 'University'
  | 'Major'
  | 'DataImport'
  | 'SystemConfig'
  | 'AlgorithmConfig'
  | 'LightRecommend'
  | 'FullRecommend'
  | 'Notification'
  | 'AuditLog';

export interface JwtPayloadUser {
  id: number;
  username: string;
  role: string;
  teacherProfileId?: number;
  studentProfileId?: number;
  isSupervisor?: boolean;
  permissionOverrides?: PermissionOverride[];
}

export interface PermissionOverride {
  action: string;
  subject: string;
  granted: boolean;
}
```

- [ ] **Step 2: Write the failing tests**

Create `apps/server/src/modules/casl/casl-ability.factory.spec.ts`:

```typescript
import { CaslAbilityFactory } from './casl-ability.factory';
import { JwtPayloadUser } from './types';

describe('CaslAbilityFactory', () => {
  let factory: CaslAbilityFactory;

  beforeEach(() => {
    factory = new CaslAbilityFactory();
  });

  describe('Admin', () => {
    const admin: JwtPayloadUser = { id: 1, username: 'admin', role: 'ADMIN' };

    it('should grant manage:all', () => {
      const ability = factory.createForUser(admin);
      expect(ability.can('manage', 'all')).toBe(true);
      expect(ability.can('delete', 'User')).toBe(true);
      expect(ability.can('export', 'VolunteerPlan')).toBe(true);
    });
  });

  describe('Teacher', () => {
    const teacher: JwtPayloadUser = {
      id: 2, username: 'teacher1', role: 'TEACHER',
      teacherProfileId: 10,
    };

    it('should read universities and majors', () => {
      const ability = factory.createForUser(teacher);
      expect(ability.can('read', 'University')).toBe(true);
      expect(ability.can('read', 'Major')).toBe(true);
    });

    it('should create students', () => {
      const ability = factory.createForUser(teacher);
      expect(ability.can('create', 'StudentProfile')).toBe(true);
    });

    it('should manage own students only', () => {
      const ability = factory.createForUser(teacher);
      expect(ability.can('update', 'StudentProfile')).toBe(true); // general check passes
    });

    it('should manage own plans only', () => {
      const ability = factory.createForUser(teacher);
      expect(ability.can('manage', 'VolunteerPlan')).toBe(true);
      expect(ability.can('export', 'VolunteerPlan')).toBe(true);
    });

    it('should NOT review/publish by default', () => {
      const ability = factory.createForUser(teacher);
      expect(ability.can('review', 'VolunteerPlan')).toBe(false);
      expect(ability.can('publish', 'VolunteerPlan')).toBe(false);
    });
  });

  describe('Supervisor Teacher', () => {
    const supervisor: JwtPayloadUser = {
      id: 3, username: 'supervisor', role: 'TEACHER',
      teacherProfileId: 20, isSupervisor: true,
    };

    it('should review and publish all plans', () => {
      const ability = factory.createForUser(supervisor);
      expect(ability.can('review', 'VolunteerPlan')).toBe(true);
      expect(ability.can('publish', 'VolunteerPlan')).toBe(true);
    });
  });

  describe('Student', () => {
    const student: JwtPayloadUser = {
      id: 4, username: 'student1', role: 'STUDENT',
      studentProfileId: 5,
    };

    it('should read universities and majors', () => {
      const ability = factory.createForUser(student);
      expect(ability.can('read', 'University')).toBe(true);
      expect(ability.can('read', 'Major')).toBe(true);
    });

    it('should read own plans', () => {
      const ability = factory.createForUser(student);
      expect(ability.can('read', 'VolunteerPlan')).toBe(true);
    });

    it('should NOT create or delete plans', () => {
      const ability = factory.createForUser(student);
      expect(ability.can('create', 'VolunteerPlan')).toBe(false);
      expect(ability.can('delete', 'VolunteerPlan')).toBe(false);
    });

    it('should use LightRecommend', () => {
      const ability = factory.createForUser(student);
      expect(ability.can('use', 'LightRecommend')).toBe(true);
      expect(ability.can('use', 'FullRecommend')).toBe(false);
    });
  });

  describe('Permission Overrides', () => {
    it('should grant additional permissions', () => {
      const student: JwtPayloadUser = {
        id: 5, username: 'special', role: 'STUDENT',
        studentProfileId: 6,
        permissionOverrides: [
          { action: 'use', subject: 'FullRecommend', granted: true },
        ],
      };
      const ability = factory.createForUser(student);
      expect(ability.can('use', 'FullRecommend')).toBe(true);
    });

    it('should revoke permissions', () => {
      const teacher: JwtPayloadUser = {
        id: 6, username: 'limited', role: 'TEACHER',
        teacherProfileId: 30,
        permissionOverrides: [
          { action: 'export', subject: 'VolunteerPlan', granted: false },
        ],
      };
      const ability = factory.createForUser(teacher);
      expect(ability.can('export', 'VolunteerPlan')).toBe(false);
    });
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd apps/server && npx jest --testPathPattern=casl-ability.factory.spec.ts`
Expected: FAIL — `Cannot find module './casl-ability.factory'`

- [ ] **Step 4: Implement CaslAbilityFactory**

Create `apps/server/src/modules/casl/casl-ability.factory.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import {
  AbilityBuilder,
  createMongoAbility,
  MongoAbility,
} from '@casl/ability';
import { Actions, Subjects, JwtPayloadUser } from './types';

export type AppAbility = MongoAbility<[Actions, Subjects]>;

@Injectable()
export class CaslAbilityFactory {
  createForUser(user: JwtPayloadUser): AppAbility {
    const { can, cannot, build } = new AbilityBuilder<AppAbility>(
      createMongoAbility,
    );

    switch (user.role) {
      case 'ADMIN':
        can('manage', 'all');
        break;

      case 'TEACHER':
        can('read', 'University');
        can('read', 'Major');
        can('create', 'StudentProfile');
        can('read', 'Notification');

        if (user.teacherProfileId) {
          can('manage', 'StudentProfile', {
            assignedTeacherId: user.teacherProfileId,
          } as any);
          can('manage', 'VolunteerPlan', {
            createdById: user.id,
          } as any);
          can('export', 'VolunteerPlan', {
            createdById: user.id,
          } as any);
        }

        if (user.isSupervisor) {
          can('review', 'VolunteerPlan');
          can('publish', 'VolunteerPlan');
        }
        break;

      case 'STUDENT':
        can('read', 'University');
        can('read', 'Major');
        can('read', 'Notification');
        can('use', 'LightRecommend');

        if (user.studentProfileId) {
          can('read', 'VolunteerPlan', {
            studentId: user.studentProfileId,
          } as any);
          can('update', 'StudentProfile', {
            userId: user.id,
          } as any);
        }
        break;
    }

    // 应用管理员设置的权限覆盖
    if (user.permissionOverrides) {
      for (const override of user.permissionOverrides) {
        if (override.granted) {
          can(override.action as Actions, override.subject as Subjects);
        } else {
          cannot(override.action as Actions, override.subject as Subjects);
        }
      }
    }

    return build();
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/server && npx jest --testPathPattern=casl-ability.factory.spec.ts`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/modules/casl/
git commit -m "feat: implement CASL ability factory with role-based permissions"
```

---

## Task 8: CASL PoliciesGuard + Decorator + Module

**Files:**
- Create: `apps/server/src/modules/casl/check-policies.decorator.ts`
- Create: `apps/server/src/modules/casl/policies.guard.ts`
- Create: `apps/server/src/modules/casl/casl.module.ts`
- Modify: `apps/server/src/app.module.ts`

- [ ] **Step 1: Create CheckPolicies decorator**

Create `apps/server/src/modules/casl/check-policies.decorator.ts`:

```typescript
import { SetMetadata } from '@nestjs/common';
import { AppAbility } from './casl-ability.factory';

export type PolicyHandler = (ability: AppAbility) => boolean;

export const CHECK_POLICIES_KEY = 'check_policies';

export const CheckPolicies = (...handlers: PolicyHandler[]) =>
  SetMetadata(CHECK_POLICIES_KEY, handlers);
```

- [ ] **Step 2: Create PoliciesGuard**

Create `apps/server/src/modules/casl/policies.guard.ts`:

```typescript
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CaslAbilityFactory } from './casl-ability.factory';
import { CHECK_POLICIES_KEY, PolicyHandler } from './check-policies.decorator';

@Injectable()
export class PoliciesGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private caslAbilityFactory: CaslAbilityFactory,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const policyHandlers =
      this.reflector.getAllAndOverride<PolicyHandler[]>(CHECK_POLICIES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) || [];

    // 无策略要求 → 放行（仅需 JWT 认证）
    if (policyHandlers.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user) {
      throw new ForbiddenException('User not found in request');
    }

    const ability = this.caslAbilityFactory.createForUser(user);
    const allowed = policyHandlers.every((handler) => handler(ability));

    if (!allowed) {
      throw new ForbiddenException('Insufficient permissions');
    }

    return true;
  }
}
```

- [ ] **Step 3: Create CaslModule**

Create `apps/server/src/modules/casl/casl.module.ts`:

```typescript
import { Module, Global } from '@nestjs/common';
import { CaslAbilityFactory } from './casl-ability.factory';
import { PoliciesGuard } from './policies.guard';

@Global()
@Module({
  providers: [CaslAbilityFactory, PoliciesGuard],
  exports: [CaslAbilityFactory, PoliciesGuard],
})
export class CaslModule {}
```

- [ ] **Step 4: Create barrel export**

Create `apps/server/src/modules/casl/index.ts`:

```typescript
export { CaslModule } from './casl.module';
export { CaslAbilityFactory, AppAbility } from './casl-ability.factory';
export { PoliciesGuard } from './policies.guard';
export { CheckPolicies, PolicyHandler } from './check-policies.decorator';
export * from './types';
```

- [ ] **Step 5: Register CaslModule in AppModule**

In `apps/server/src/app.module.ts`, add to imports:

```typescript
import { CaslModule } from './modules/casl';

@Module({
  imports: [
    // ... existing imports ...
    CaslModule,   // <-- add after RedisModule
    // ...
  ],
})
```

- [ ] **Step 6: Create @CurrentUser decorator**

Create `apps/server/src/common/decorators/current-user.decorator.ts`:

```typescript
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { JwtPayloadUser } from '@modules/casl/types';

export const CurrentUser = createParamDecorator(
  (data: keyof JwtPayloadUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as JwtPayloadUser;
    return data ? user?.[data] : user;
  },
);
```

- [ ] **Step 7: Verify module loads**

Run: `cd apps/server && npx nest build`
Expected: Build successful with no errors

- [ ] **Step 8: Commit**

```bash
git add apps/server/src/modules/casl/ apps/server/src/common/decorators/ apps/server/src/app.module.ts
git commit -m "feat: add PoliciesGuard, CheckPolicies decorator, CaslModule"
```

---

## Task 9: Auth Refactor for New Role System

**Files:**
- Modify: `apps/server/src/modules/auth/dto/register.dto.ts`
- Modify: `apps/server/src/modules/auth/auth.service.ts`
- Modify: `apps/server/src/modules/auth/strategies/jwt.strategy.ts`

- [ ] **Step 1: Update RegisterDto to accept role**

In `apps/server/src/modules/auth/dto/register.dto.ts`, add role field:

```typescript
import { IsEnum, IsOptional } from 'class-validator';

// Add to RegisterDto class:
  @IsOptional()
  @IsEnum(['ADMIN', 'TEACHER', 'STUDENT'])
  role?: string;  // defaults to STUDENT if not provided
```

- [ ] **Step 2: Update AuthService.register to handle new roles**

In `apps/server/src/modules/auth/auth.service.ts`, update the `register` method:

```typescript
async register(dto: RegisterDto) {
  // Check duplicates (existing logic)
  const existing = await this.userService.findByUsername(dto.username);
  if (existing) {
    throw new ConflictException('Username already exists');
  }

  const passwordHash = await bcrypt.hash(dto.password, 12);
  const role = dto.role || 'STUDENT';

  const user = await this.prisma.user.create({
    data: {
      username: dto.username,
      passwordHash,
      phone: dto.phone,
      email: dto.email,
      realName: dto.realName,
      role: role as any,
      // 按角色创建对应 Profile
      ...(role === 'TEACHER' && {
        teacherProfile: { create: {} },
      }),
      ...(role === 'STUDENT' && {
        studentProfile: { create: { province: dto.province || '四川' } },
      }),
    },
    include: {
      teacherProfile: true,
      studentProfile: true,
    },
  });

  return this.generateTokens(user);
}
```

> **Note:** 需要注入 PrismaService（如果 AuthService 当前只通过 UserService 访问数据库，则改为同时注入 PrismaService）。

- [ ] **Step 3: Update generateTokens to include profile IDs**

In `auth.service.ts`, update `generateTokens`:

```typescript
private async generateTokens(user: any) {
  const payload = {
    sub: user.id,
    username: user.username,
    role: user.role,
    teacherProfileId: user.teacherProfile?.id,
    studentProfileId: user.studentProfile?.id,
    isSupervisor: user.teacherProfile?.isSupervisor || false,
  };

  const accessToken = this.jwtService.sign(payload, { expiresIn: '30m' });
  const refreshToken = this.jwtService.sign(
    { sub: user.id, type: 'refresh' },
    { expiresIn: '7d' },
  );

  return {
    accessToken,
    refreshToken,
    user: this.sanitizeUser(user),
  };
}
```

- [ ] **Step 4: Update login to include profiles**

In `auth.service.ts`, update `login` to load profiles:

```typescript
async login(dto: LoginDto, ip?: string) {
  const user = await this.prisma.user.findUnique({
    where: { username: dto.username },
    include: {
      teacherProfile: true,
      studentProfile: true,
    },
  });

  if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
    throw new UnauthorizedException('Invalid credentials');
  }

  await this.prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date(), lastLoginIp: ip },
  });

  return this.generateTokens(user);
}
```

- [ ] **Step 5: Update JwtStrategy to pass permissionOverrides**

In `apps/server/src/modules/auth/strategies/jwt.strategy.ts`, update `validate`:

```typescript
async validate(req: Request, payload: any) {
  const token = req.headers.authorization?.split(' ')[1];
  if (await this.redisService.isBlacklisted(token)) {
    throw new UnauthorizedException('Token blacklisted');
  }

  // 每次请求加载最新 permissionOverrides（保证覆盖实时生效）
  const user = await this.prisma.user.findUnique({
    where: { id: payload.sub },
    select: { permissionOverrides: true },
  });

  return {
    id: payload.sub,
    username: payload.username,
    role: payload.role,
    teacherProfileId: payload.teacherProfileId,
    studentProfileId: payload.studentProfileId,
    isSupervisor: payload.isSupervisor,
    permissionOverrides: user?.permissionOverrides as any[],
  };
}
```

> **Note:** JwtStrategy 需要注入 PrismaService。在构造函数中添加 `private prisma: PrismaService`，并在 AuthModule imports 中确保 PrismaModule 可用（已通过 @Global 注册）。

- [ ] **Step 6: Update refreshToken to include profile IDs**

In `auth.service.ts`, update `refreshToken`:

```typescript
async refreshToken(refreshToken: string) {
  try {
    const payload = this.jwtService.verify(refreshToken);
    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Invalid token type');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { teacherProfile: true, studentProfile: true },
    });

    if (!user) throw new UnauthorizedException('User not found');

    return this.generateTokens(user);
  } catch {
    throw new UnauthorizedException('Invalid refresh token');
  }
}
```

- [ ] **Step 7: Verify auth flow compiles**

Run: `cd apps/server && npx nest build`
Expected: Build successful. Fix any type errors.

- [ ] **Step 8: Commit**

```bash
git add apps/server/src/modules/auth/
git commit -m "feat: refactor auth for new role system with profile-aware JWT"
```

---

## Task 10: Prisma Audit Extension

**Files:**
- Create: `apps/server/src/modules/audit/prisma-audit.extension.ts`
- Create: `apps/server/src/modules/audit/audit.service.ts`
- Create: `apps/server/src/modules/audit/audit.module.ts`
- Modify: `apps/server/src/prisma/prisma.service.ts` (or equivalent)

- [ ] **Step 1: Create AuditService**

Create `apps/server/src/modules/audit/audit.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { PrismaService } from '@prisma/prisma.service';

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  async log(params: {
    userId: number;
    action: string;
    targetType: string;
    targetId: number;
    details?: any;
    ip?: string;
    userAgent?: string;
  }) {
    return this.prisma.auditLog.create({ data: params });
  }

  async findByTarget(targetType: string, targetId: number) {
    return this.prisma.auditLog.findMany({
      where: { targetType, targetId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findByUser(userId: number, limit = 50) {
    return this.prisma.auditLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
```

- [ ] **Step 2: Create Prisma Audit Extension**

Create `apps/server/src/modules/audit/prisma-audit.extension.ts`:

```typescript
import { Prisma } from '@prisma/client';

// Prisma Client Extension: 自动记录方案相关操作的审计日志
// 在每次对 VolunteerPlan / PlanItem 的写操作后自动写入 AuditLog
export function auditExtension() {
  return Prisma.defineExtension({
    query: {
      volunteerPlan: {
        async create({ args, query }) {
          const result = await query(args);
          // 审计日志通过 AuditService 手动记录（避免循环依赖）
          // Extension 只做标记，业务层负责实际记录
          return result;
        },
        async update({ args, query }) {
          const result = await query(args);
          return result;
        },
        async delete({ args, query }) {
          const result = await query(args);
          return result;
        },
      },
    },
  });
}
```

> **Note:** Prisma Client Extensions 在 $extends 中无法直接注入 NestJS 服务。审计日志的主要方式是在 Service 层调用 AuditService.log()，Extension 仅作为兜底补充。实际业务中优先使用 Service 层显式记录。

- [ ] **Step 3: Create AuditModule**

Create `apps/server/src/modules/audit/audit.module.ts`:

```typescript
import { Module, Global } from '@nestjs/common';
import { AuditService } from './audit.service';

@Global()
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
```

- [ ] **Step 4: Register in AppModule**

In `apps/server/src/app.module.ts`, add:

```typescript
import { AuditModule } from './modules/audit/audit.module';

// Add to imports array:
AuditModule,
```

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/modules/audit/ apps/server/src/app.module.ts
git commit -m "feat: add AuditService and AuditModule for operation logging"
```

---

## Task 11: BullMQ Queue Module

**Files:**
- Create: `apps/server/src/modules/queue/queue.module.ts`
- Modify: `apps/server/src/app.module.ts`

- [ ] **Step 1: Create QueueModule**

Create `apps/server/src/modules/queue/queue.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
          password: config.get('REDIS_PASSWORD'),
          db: config.get<number>('REDIS_QUEUE_DB', 1), // 队列用单独的 DB
        },
        defaultJobOptions: {
          removeOnComplete: 100,   // 保留最近100个完成任务
          removeOnFail: 200,       // 保留最近200个失败任务
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
        },
      }),
    }),
    // 注册队列（按需在此添加）
    BullModule.registerQueue(
      { name: 'plan-generation' },
      { name: 'data-export' },
      { name: 'data-import' },
    ),
  ],
  exports: [BullModule],
})
export class QueueModule {}
```

- [ ] **Step 2: Register in AppModule**

In `apps/server/src/app.module.ts`, add:

```typescript
import { QueueModule } from './modules/queue/queue.module';

// Add to imports array (after RedisModule):
QueueModule,
```

- [ ] **Step 3: Verify build**

Run: `cd apps/server && npx nest build`
Expected: Build successful

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/modules/queue/ apps/server/src/app.module.ts
git commit -m "feat: add BullMQ queue module with plan-generation/export/import queues"
```

---

## Task 12: SSE Notification Module

**Files:**
- Create: `apps/server/src/modules/notification/notification.service.ts`
- Create: `apps/server/src/modules/notification/notification.controller.ts`
- Create: `apps/server/src/modules/notification/notification.module.ts`
- Modify: `apps/server/src/app.module.ts`

- [ ] **Step 1: Create NotificationService**

Create `apps/server/src/modules/notification/notification.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { Subject, Observable, filter, map } from 'rxjs';
import { PrismaService } from '@prisma/prisma.service';

export interface NotificationEvent {
  userId: number;
  type: string;
  title: string;
  content?: string;
  relatedId?: number;
  relatedType?: string;
}

@Injectable()
export class NotificationService {
  private events$ = new Subject<NotificationEvent>();

  constructor(private prisma: PrismaService) {}

  // 发送通知：写入 DB + 推送 SSE
  async send(event: NotificationEvent): Promise<void> {
    await this.prisma.notification.create({
      data: {
        userId: event.userId,
        type: event.type,
        title: event.title,
        content: event.content,
        relatedId: event.relatedId,
        relatedType: event.relatedType,
      },
    });
    this.events$.next(event);
  }

  // SSE 流：按用户过滤
  getStream(userId: number): Observable<MessageEvent> {
    return this.events$.pipe(
      filter((event) => event.userId === userId),
      map((event) => ({
        data: JSON.stringify(event),
        type: event.type,
      } as MessageEvent)),
    );
  }

  // 重连后补发未读通知
  async getUnread(userId: number) {
    return this.prisma.notification.findMany({
      where: { userId, isRead: false },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  // 标记已读
  async markAsRead(userId: number, ids: number[]) {
    return this.prisma.notification.updateMany({
      where: { id: { in: ids }, userId },
      data: { isRead: true },
    });
  }

  async markAllAsRead(userId: number) {
    return this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
  }
}
```

- [ ] **Step 2: Create NotificationController**

Create `apps/server/src/modules/notification/notification.controller.ts`:

```typescript
import {
  Controller,
  Get,
  Post,
  Body,
  Sse,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Observable } from 'rxjs';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { NotificationService } from './notification.service';

@ApiTags('通知')
@Controller('notifications')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class NotificationController {
  constructor(private notificationService: NotificationService) {}

  @Sse('stream')
  stream(@Req() req): Observable<MessageEvent> {
    return this.notificationService.getStream(req.user.id);
  }

  @Get('unread')
  getUnread(@Req() req) {
    return this.notificationService.getUnread(req.user.id);
  }

  @Post('read')
  markAsRead(@Req() req, @Body() body: { ids: number[] }) {
    return this.notificationService.markAsRead(req.user.id, body.ids);
  }

  @Post('read-all')
  markAllAsRead(@Req() req) {
    return this.notificationService.markAllAsRead(req.user.id);
  }
}
```

- [ ] **Step 3: Create NotificationModule**

Create `apps/server/src/modules/notification/notification.module.ts`:

```typescript
import { Module, Global } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { NotificationController } from './notification.controller';

@Global()
@Module({
  controllers: [NotificationController],
  providers: [NotificationService],
  exports: [NotificationService],
})
export class NotificationModule {}
```

- [ ] **Step 4: Register in AppModule**

In `apps/server/src/app.module.ts`, add:

```typescript
import { NotificationModule } from './modules/notification/notification.module';

// Add to imports array:
NotificationModule,
```

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/modules/notification/ apps/server/src/app.module.ts
git commit -m "feat: add SSE notification module with unread backfill"
```

---

## Task 13: Student Module — Service + Tests

**Files:**
- Create: `apps/server/src/modules/student/dto/create-student.dto.ts`
- Create: `apps/server/src/modules/student/dto/update-student-profile.dto.ts`
- Create: `apps/server/src/modules/student/dto/query-student.dto.ts`
- Create: `apps/server/src/modules/student/student.service.ts`
- Create: `apps/server/src/modules/student/student.service.spec.ts`

- [ ] **Step 1: Create DTOs**

Create `apps/server/src/modules/student/dto/create-student.dto.ts`:

```typescript
import {
  IsString,
  IsOptional,
  IsEnum,
  MinLength,
  MaxLength,
  IsInt,
  Matches,
} from 'class-validator';

export class CreateStudentDto {
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  username: string;

  @IsString()
  @MinLength(6)
  @Matches(/^(?=.*[a-zA-Z])(?=.*\d)/)
  password: string;

  @IsString()
  @MaxLength(100)
  realName: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  gender?: string;

  @IsOptional()
  @IsString()
  ethnicity?: string;

  @IsOptional()
  @IsString()
  highSchool?: string;

  @IsOptional()
  @IsString()
  classInfo?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsInt()
  examYear?: number;
}
```

Create `apps/server/src/modules/student/dto/update-student-profile.dto.ts`:

```typescript
import { IsOptional, IsString, IsInt, IsEnum, IsBoolean, IsObject, Min, Max } from 'class-validator';

export class UpdateStudentProfileDto {
  // 基本信息
  @IsOptional() @IsString() parentPhone?: string;
  @IsOptional() @IsString() highSchool?: string;
  @IsOptional() @IsString() classInfo?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsBoolean() isRural?: boolean;

  // 考试成绩
  @IsOptional() @IsInt() examYear?: number;
  @IsOptional() @IsString() examType?: string;
  @IsOptional() @IsString() firstChoice?: string;
  @IsOptional() reChoices?: string[];
  @IsOptional() @IsInt() @Min(0) @Max(150) scoreChinese?: number;
  @IsOptional() @IsInt() @Min(0) @Max(150) scoreMath?: number;
  @IsOptional() @IsInt() @Min(0) @Max(150) scoreEnglish?: number;
  @IsOptional() @IsInt() @Min(0) @Max(300) scoreFirstChoice?: number;
  @IsOptional() @IsInt() @Min(0) @Max(100) scoreSub1?: number;
  @IsOptional() @IsInt() @Min(0) @Max(100) scoreSub2?: number;
  @IsOptional() @IsInt() @Min(0) @Max(750) totalScore?: number;

  // 身体条件
  @IsOptional() @IsObject() physicalCondition?: Record<string, any>;

  // 升学规划
  @IsOptional() @IsString() priorityMode?: string;
  @IsOptional() @IsString() careerPlan?: string;
  @IsOptional() @IsString() careerDirection?: string;
  @IsOptional() @IsBoolean() militaryInterest?: boolean;
  @IsOptional() @IsBoolean() teacherInterest?: boolean;

  // 偏好
  @IsOptional() preferredMajors?: string[];
  @IsOptional() preferredUniversities?: string[];
  @IsOptional() preferredCities?: string[];
  @IsOptional() preferredProvinces?: string[];
  @IsOptional() @IsString() stayInProvince?: string;

  // 排除
  @IsOptional() excludedMajors?: string[];
  @IsOptional() excludedUniversities?: string[];
  @IsOptional() excludedCities?: string[];
  @IsOptional() excludedProvinces?: string[];

  // 经济
  @IsOptional() @IsString() tuitionBudget?: string;
  @IsOptional() @IsString() acceptPrivate?: string;
  @IsOptional() @IsString() acceptCooperation?: string;

  // 乐观锁
  @IsInt()
  dataVersion: number;
}
```

Create `apps/server/src/modules/student/dto/query-student.dto.ts`:

```typescript
import { IsOptional, IsString, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class QueryStudentDto {
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() keyword?: string; // 搜索 realName / username
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) pageSize?: number = 20;
}
```

- [ ] **Step 2: Write the failing tests**

Create `apps/server/src/modules/student/student.service.spec.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { StudentService } from './student.service';
import { PrismaService } from '@prisma/prisma.service';
import { ConflictException, NotFoundException } from '@nestjs/common';

// Mock PrismaService
const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
  },
  studentProfile: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  $transaction: jest.fn((fn) => fn(mockPrisma)),
};

describe('StudentService', () => {
  let service: StudentService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StudentService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<StudentService>(StudentService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create user + student profile', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({
        id: 1,
        username: 'student1',
        role: 'STUDENT',
        studentProfile: { id: 1, status: 'PENDING_INFO' },
      });

      const result = await service.create(10, {
        username: 'student1',
        password: 'Pass123',
        realName: '张三',
      });

      expect(result).toBeDefined();
      expect(mockPrisma.user.create).toHaveBeenCalled();
    });

    it('should throw on duplicate username', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 99 });

      await expect(
        service.create(10, { username: 'existing', password: 'Pass123', realName: '李四' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('findByTeacher', () => {
    it('should return paginated students', async () => {
      mockPrisma.studentProfile.findMany.mockResolvedValue([
        { id: 1, userId: 1, status: 'PENDING_INFO' },
      ]);
      mockPrisma.studentProfile.count.mockResolvedValue(1);

      const result = await service.findByTeacher(10, { page: 1, pageSize: 20 });
      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
    });
  });

  describe('updateProfile', () => {
    it('should update with optimistic lock', async () => {
      mockPrisma.studentProfile.findUnique.mockResolvedValue({
        id: 1, dataVersion: 0,
      });
      mockPrisma.studentProfile.update.mockResolvedValue({
        id: 1, dataVersion: 1, totalScore: 580,
      });

      const result = await service.updateProfile(1, {
        totalScore: 580,
        dataVersion: 0,
      });
      expect(result.dataVersion).toBe(1);
    });

    it('should throw on version conflict', async () => {
      mockPrisma.studentProfile.findUnique.mockResolvedValue({
        id: 1, dataVersion: 2,
      });

      await expect(
        service.updateProfile(1, { totalScore: 580, dataVersion: 0 }),
      ).rejects.toThrow(ConflictException);
    });
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd apps/server && npx jest --testPathPattern=student.service.spec.ts`
Expected: FAIL — `Cannot find module './student.service'`

- [ ] **Step 4: Implement StudentService**

Create `apps/server/src/modules/student/student.service.ts`:

```typescript
import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentProfileDto } from './dto/update-student-profile.dto';
import { QueryStudentDto } from './dto/query-student.dto';

@Injectable()
export class StudentService {
  constructor(private prisma: PrismaService) {}

  async create(teacherProfileId: number, dto: CreateStudentDto) {
    const existing = await this.prisma.user.findUnique({
      where: { username: dto.username },
    });
    if (existing) {
      throw new ConflictException('Username already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    return this.prisma.user.create({
      data: {
        username: dto.username,
        passwordHash,
        phone: dto.phone,
        realName: dto.realName,
        gender: dto.gender,
        ethnicity: dto.ethnicity,
        role: 'STUDENT' as any,
        studentProfile: {
          create: {
            assignedTeacherId: teacherProfileId,
            assignedAt: new Date(),
            status: 'ASSIGNED' as any,
            highSchool: dto.highSchool,
            classInfo: dto.classInfo,
            city: dto.city,
            examYear: dto.examYear,
          },
        },
      },
      include: { studentProfile: true },
    });
  }

  async findByTeacher(teacherProfileId: number, query: QueryStudentDto) {
    const { status, keyword, page = 1, pageSize = 20 } = query;
    const where: any = { assignedTeacherId: teacherProfileId };

    if (status) where.status = status;
    if (keyword) {
      where.user = {
        OR: [
          { realName: { contains: keyword } },
          { username: { contains: keyword } },
        ],
      };
    }

    const [data, total] = await Promise.all([
      this.prisma.studentProfile.findMany({
        where,
        include: { user: { select: { id: true, username: true, realName: true, phone: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.studentProfile.count({ where }),
    ]);

    return { data, total, page, pageSize };
  }

  async findById(id: number) {
    const profile = await this.prisma.studentProfile.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, username: true, realName: true, phone: true, gender: true, ethnicity: true } },
        assignedTeacher: { include: { user: { select: { realName: true } } } },
      },
    });
    if (!profile) throw new NotFoundException('Student not found');
    return profile;
  }

  async updateProfile(id: number, dto: UpdateStudentProfileDto) {
    const current = await this.prisma.studentProfile.findUnique({
      where: { id },
    });
    if (!current) throw new NotFoundException('Student not found');

    // 乐观锁检查
    if (current.dataVersion !== dto.dataVersion) {
      throw new ConflictException(
        'Data has been modified by another user. Please refresh and try again.',
      );
    }

    const { dataVersion, ...updateData } = dto;

    // 计算信息完整度
    const completeness = this.calculateCompleteness({ ...current, ...updateData });

    return this.prisma.studentProfile.update({
      where: { id },
      data: {
        ...updateData,
        infoCompleteness: completeness,
        dataVersion: { increment: 1 },
        // 自动更新状态
        ...(completeness >= 80 && current.status === 'PENDING_INFO'
          ? { status: 'INFO_COMPLETE' as any }
          : {}),
      },
    });
  }

  async assignTeacher(studentId: number, teacherProfileId: number) {
    return this.prisma.studentProfile.update({
      where: { id: studentId },
      data: {
        assignedTeacherId: teacherProfileId,
        assignedAt: new Date(),
        status: 'ASSIGNED' as any,
      },
    });
  }

  private calculateCompleteness(profile: any): number {
    const requiredFields = [
      'highSchool', 'examYear', 'examType', 'firstChoice',
      'totalScore', 'priorityMode', 'careerPlan',
    ];
    const optionalFields = [
      'scoreChinese', 'scoreMath', 'scoreEnglish',
      'preferredMajors', 'preferredProvinces', 'physicalCondition',
      'tuitionBudget', 'city', 'classInfo',
    ];

    let filled = 0;
    const total = requiredFields.length + optionalFields.length;

    for (const field of [...requiredFields, ...optionalFields]) {
      const value = profile[field];
      if (value !== null && value !== undefined && value !== '') filled++;
    }

    return Math.round((filled / total) * 100);
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/server && npx jest --testPathPattern=student.service.spec.ts`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/modules/student/
git commit -m "feat: add StudentService with create, query, update, and optimistic locking"
```

---

## Task 14: Student Controller + Teacher Module + Admin User Management

**Files:**
- Create: `apps/server/src/modules/student/student.controller.ts`
- Create: `apps/server/src/modules/student/student.module.ts`
- Create: `apps/server/src/modules/teacher/teacher.service.ts`
- Create: `apps/server/src/modules/teacher/teacher.controller.ts`
- Create: `apps/server/src/modules/teacher/teacher.module.ts`
- Modify: `apps/server/src/modules/user/user.controller.ts`
- Modify: `apps/server/src/modules/user/user.service.ts`
- Modify: `apps/server/src/app.module.ts`

- [ ] **Step 1: Create StudentController**

Create `apps/server/src/modules/student/student.controller.ts`:

```typescript
import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  Query,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { CheckPolicies } from '@modules/casl/check-policies.decorator';
import { PoliciesGuard } from '@modules/casl/policies.guard';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { JwtPayloadUser } from '@modules/casl/types';
import { StudentService } from './student.service';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentProfileDto } from './dto/update-student-profile.dto';
import { QueryStudentDto } from './dto/query-student.dto';

@ApiTags('学生管理')
@Controller('students')
@UseGuards(JwtAuthGuard, PoliciesGuard)
@ApiBearerAuth()
export class StudentController {
  constructor(private studentService: StudentService) {}

  @Post()
  @CheckPolicies((ability) => ability.can('create', 'StudentProfile'))
  create(
    @CurrentUser() user: JwtPayloadUser,
    @Body() dto: CreateStudentDto,
  ) {
    return this.studentService.create(user.teacherProfileId!, dto);
  }

  @Get()
  @CheckPolicies((ability) => ability.can('read', 'StudentProfile'))
  findAll(
    @CurrentUser() user: JwtPayloadUser,
    @Query() query: QueryStudentDto,
  ) {
    // Admin 看所有，Teacher 看自己名下
    if (user.role === 'ADMIN') {
      return this.studentService.findByTeacher(0, query); // 0 = no filter
    }
    return this.studentService.findByTeacher(user.teacherProfileId!, query);
  }

  @Get(':id')
  @CheckPolicies((ability) => ability.can('read', 'StudentProfile'))
  findById(@Param('id', ParseIntPipe) id: number) {
    return this.studentService.findById(id);
  }

  @Put(':id/profile')
  @CheckPolicies((ability) => ability.can('update', 'StudentProfile'))
  updateProfile(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateStudentProfileDto,
  ) {
    return this.studentService.updateProfile(id, dto);
  }

  @Put(':id/assign')
  @CheckPolicies((ability) => ability.can('manage', 'StudentProfile'))
  assignTeacher(
    @Param('id', ParseIntPipe) id: number,
    @Body('teacherProfileId', ParseIntPipe) teacherProfileId: number,
  ) {
    return this.studentService.assignTeacher(id, teacherProfileId);
  }
}
```

- [ ] **Step 2: Create StudentModule**

Create `apps/server/src/modules/student/student.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { StudentController } from './student.controller';
import { StudentService } from './student.service';

@Module({
  controllers: [StudentController],
  providers: [StudentService],
  exports: [StudentService],
})
export class StudentModule {}
```

- [ ] **Step 3: Create TeacherService**

Create `apps/server/src/modules/teacher/teacher.service.ts`:

```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@prisma/prisma.service';

@Injectable()
export class TeacherService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.teacherProfile.findMany({
      include: {
        user: { select: { id: true, username: true, realName: true, phone: true } },
        _count: { select: { students: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: number) {
    const profile = await this.prisma.teacherProfile.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, username: true, realName: true, phone: true, email: true } },
        _count: { select: { students: true } },
      },
    });
    if (!profile) throw new NotFoundException('Teacher not found');
    return profile;
  }

  async updateProfile(id: number, data: { school?: string; isSupervisor?: boolean }) {
    return this.prisma.teacherProfile.update({
      where: { id },
      data,
    });
  }

  async getStudentStats(teacherProfileId: number) {
    const stats = await this.prisma.studentProfile.groupBy({
      by: ['status'],
      where: { assignedTeacherId: teacherProfileId },
      _count: true,
    });
    return stats;
  }
}
```

- [ ] **Step 4: Create TeacherController**

Create `apps/server/src/modules/teacher/teacher.controller.ts`:

```typescript
import { Controller, Get, Put, Param, Body, UseGuards, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { CheckPolicies } from '@modules/casl/check-policies.decorator';
import { PoliciesGuard } from '@modules/casl/policies.guard';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { JwtPayloadUser } from '@modules/casl/types';
import { TeacherService } from './teacher.service';

@ApiTags('老师管理')
@Controller('teachers')
@UseGuards(JwtAuthGuard, PoliciesGuard)
@ApiBearerAuth()
export class TeacherController {
  constructor(private teacherService: TeacherService) {}

  @Get()
  @CheckPolicies((ability) => ability.can('read', 'TeacherProfile'))
  findAll() {
    return this.teacherService.findAll();
  }

  @Get('me/stats')
  getMyStats(@CurrentUser() user: JwtPayloadUser) {
    return this.teacherService.getStudentStats(user.teacherProfileId!);
  }

  @Get(':id')
  @CheckPolicies((ability) => ability.can('read', 'TeacherProfile'))
  findById(@Param('id', ParseIntPipe) id: number) {
    return this.teacherService.findById(id);
  }

  @Put(':id')
  @CheckPolicies((ability) => ability.can('manage', 'TeacherProfile'))
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: { school?: string; isSupervisor?: boolean },
  ) {
    return this.teacherService.updateProfile(id, data);
  }
}
```

- [ ] **Step 5: Create TeacherModule**

Create `apps/server/src/modules/teacher/teacher.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { TeacherController } from './teacher.controller';
import { TeacherService } from './teacher.service';

@Module({
  controllers: [TeacherController],
  providers: [TeacherService],
  exports: [TeacherService],
})
export class TeacherModule {}
```

- [ ] **Step 6: Add admin user management endpoints to UserController**

In `apps/server/src/modules/user/user.controller.ts`, add these endpoints:

```typescript
import { CheckPolicies } from '@modules/casl/check-policies.decorator';
import { PoliciesGuard } from '@modules/casl/policies.guard';

// Add PoliciesGuard to @UseGuards:
@UseGuards(JwtAuthGuard, PoliciesGuard)

// Add these endpoints:

  @Get('admin/all')
  @CheckPolicies((ability) => ability.can('manage', 'User'))
  async findAllUsers(
    @Query('page') page = 1,
    @Query('pageSize') pageSize = 20,
    @Query('role') role?: string,
    @Query('keyword') keyword?: string,
  ) {
    const where: any = {};
    if (role) where.role = role;
    if (keyword) {
      where.OR = [
        { username: { contains: keyword } },
        { realName: { contains: keyword } },
        { phone: { contains: keyword } },
      ];
    }

    const [data, total] = await Promise.all([
      this.userService.findMany(where, +page, +pageSize),
      this.userService.count(where),
    ]);

    return { data, total, page: +page, pageSize: +pageSize };
  }

  @Put('admin/:id/permissions')
  @CheckPolicies((ability) => ability.can('manage', 'User'))
  async updatePermissions(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { permissionOverrides: Array<{ action: string; subject: string; granted: boolean }> },
  ) {
    return this.userService.updatePermissionOverrides(id, body.permissionOverrides);
  }

  @Get('admin/:id/permissions')
  @CheckPolicies((ability) => ability.can('manage', 'User'))
  async getPermissions(@Param('id', ParseIntPipe) id: number) {
    return this.userService.getEffectivePermissions(id);
  }
```

- [ ] **Step 7: Add corresponding methods to UserService**

In `apps/server/src/modules/user/user.service.ts`, add:

```typescript
  async findMany(where: any, page: number, pageSize: number) {
    return this.prisma.user.findMany({
      where,
      select: {
        id: true, username: true, realName: true, phone: true, email: true,
        role: true, gender: true, lastLoginAt: true, createdAt: true,
        teacherProfile: { select: { id: true, isSupervisor: true, school: true } },
        studentProfile: { select: { id: true, status: true, serviceYear: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
  }

  async count(where: any) {
    return this.prisma.user.count({ where });
  }

  async updatePermissionOverrides(userId: number, overrides: any[]) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { permissionOverrides: overrides },
      select: { id: true, username: true, permissionOverrides: true },
    });
  }

  async getEffectivePermissions(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, permissionOverrides: true },
    });
    return {
      role: user?.role,
      defaultPermissions: this.getDefaultPermissions(user?.role as string),
      overrides: user?.permissionOverrides || [],
    };
  }

  private getDefaultPermissions(role: string) {
    const permissions: Record<string, string[]> = {
      ADMIN: ['manage:all'],
      TEACHER: [
        'read:University', 'read:Major', 'create:StudentProfile',
        'manage:StudentProfile(own)', 'manage:VolunteerPlan(own)', 'export:VolunteerPlan(own)',
      ],
      STUDENT: [
        'read:University', 'read:Major', 'read:VolunteerPlan(own)',
        'update:StudentProfile(own)', 'use:LightRecommend',
      ],
    };
    return permissions[role] || [];
  }
```

- [ ] **Step 8: Register new modules in AppModule**

In `apps/server/src/app.module.ts`, add:

```typescript
import { StudentModule } from './modules/student/student.module';
import { TeacherModule } from './modules/teacher/teacher.module';

// Add to imports array:
StudentModule,
TeacherModule,
```

- [ ] **Step 9: Verify build**

Run: `cd apps/server && npx nest build`
Expected: Build successful

- [ ] **Step 10: Commit**

```bash
git add apps/server/src/modules/student/ apps/server/src/modules/teacher/ apps/server/src/modules/user/ apps/server/src/app.module.ts
git commit -m "feat: add Student/Teacher modules, admin user management with CASL"
```

---

## Task 15: Health Check Enhancement

**Files:**
- Modify: `apps/server/src/app.module.ts` or create health controller

- [ ] **Step 1: Create health check endpoint**

If no health controller exists, add to `app.controller.ts` or create one:

```typescript
import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '@prisma/prisma.service';
import { RedisService } from './redis/redis.service';

@Controller('health')
export class HealthController {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  @Get()
  async check() {
    const checks: Record<string, string> = {};

    // DB check
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.database = 'ok';
    } catch {
      checks.database = 'error';
    }

    // Redis check
    try {
      await this.redis.getClient().ping();
      checks.redis = 'ok';
    } catch {
      checks.redis = 'error';
    }

    const healthy = Object.values(checks).every((v) => v === 'ok');
    return {
      status: healthy ? 'healthy' : 'degraded',
      checks,
      timestamp: new Date().toISOString(),
    };
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/server/src/
git commit -m "feat: add health check endpoint with DB + Redis status"
```

---

## Task 16: CI/CD Pipeline

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `scripts/backup-db.sh`

- [ ] **Step 1: Create GitHub Actions CI workflow**

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [master, develop]
  pull_request:
    branches: [master]

jobs:
  lint-test-build:
    runs-on: ubuntu-latest

    services:
      mysql:
        image: mysql:8.0
        env:
          MYSQL_ROOT_PASSWORD: testpass
          MYSQL_DATABASE: volunteer_test
        ports:
          - 3306:3306
        options: >-
          --health-cmd="mysqladmin ping -h localhost"
          --health-interval=10s
          --health-timeout=5s
          --health-retries=5

      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379
        options: >-
          --health-cmd="redis-cli ping"
          --health-interval=10s
          --health-timeout=5s
          --health-retries=5

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Setup pnpm
        uses: pnpm/action-setup@v2
        with:
          version: 8

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Lint
        run: pnpm lint

      - name: Generate Prisma Client
        run: cd apps/server && npx prisma generate

      - name: Run unit tests
        run: pnpm test
        env:
          DATABASE_URL: mysql://root:testpass@localhost:3306/volunteer_test
          REDIS_HOST: localhost
          REDIS_PORT: 6379
          JWT_SECRET: test-secret-key

      - name: Build
        run: pnpm build
```

- [ ] **Step 2: Create database backup script**

Create `scripts/backup-db.sh`:

```bash
#!/bin/bash
# MySQL 数据库备份脚本
# 用法: ./scripts/backup-db.sh [production|staging]

set -euo pipefail

ENV="${1:-production}"
BACKUP_DIR="/data/backups/mysql"
DATE=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=30

# 从 .env 文件读取数据库连接信息
if [ "$ENV" = "production" ]; then
  source /app/.env.production
else
  source /app/.env.staging
fi

# 解析 DATABASE_URL: mysql://user:pass@host:port/dbname
DB_USER=$(echo "$DATABASE_URL" | sed -n 's|.*://\([^:]*\):.*|\1|p')
DB_PASS=$(echo "$DATABASE_URL" | sed -n 's|.*://[^:]*:\([^@]*\)@.*|\1|p')
DB_HOST=$(echo "$DATABASE_URL" | sed -n 's|.*@\([^:]*\):.*|\1|p')
DB_PORT=$(echo "$DATABASE_URL" | sed -n 's|.*:\([0-9]*\)/.*|\1|p')
DB_NAME=$(echo "$DATABASE_URL" | sed -n 's|.*/\([^?]*\).*|\1|p')

mkdir -p "$BACKUP_DIR"

FILENAME="${BACKUP_DIR}/${DB_NAME}_${ENV}_${DATE}.sql.gz"

echo "[$(date)] Starting backup: $DB_NAME ($ENV)"
mysqldump \
  -h "$DB_HOST" \
  -P "$DB_PORT" \
  -u "$DB_USER" \
  -p"$DB_PASS" \
  --single-transaction \
  --routines \
  --triggers \
  "$DB_NAME" | gzip > "$FILENAME"

echo "[$(date)] Backup saved: $FILENAME ($(du -h "$FILENAME" | cut -f1))"

# 清理旧备份
find "$BACKUP_DIR" -name "*.sql.gz" -mtime +$RETENTION_DAYS -delete
echo "[$(date)] Cleaned backups older than $RETENTION_DAYS days"
```

- [ ] **Step 3: Make backup script executable**

```bash
chmod +x scripts/backup-db.sh
```

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml scripts/backup-db.sh
git commit -m "ci: add GitHub Actions pipeline and MySQL backup script"
```

---

## Task 17: Update Shared Types

**Files:**
- Modify: `packages/shared/src/types/index.ts`

- [ ] **Step 1: Add new shared types**

Add to `packages/shared/src/types/index.ts`:

```typescript
// ==================== 新角色和状态类型 ====================

export type Role = 'ADMIN' | 'TEACHER' | 'STUDENT';

export type StudentStatus =
  | 'PENDING_INFO'
  | 'INFO_COMPLETE'
  | 'ASSIGNED'
  | 'IN_SERVICE'
  | 'PLAN_DELIVERED';

export type PlanStatusNew =
  | 'DRAFT'
  | 'PENDING_REVIEW'
  | 'REVIEWING'
  | 'APPROVED'
  | 'REJECTED'
  | 'FINALIZED'
  | 'PUBLISHED'
  | 'OUTDATED';

export type ExamSource = 'MOCK_ERZHEN' | 'MOCK_SANZHEN' | 'MOCK_OTHER' | 'GAOKAO';

export type Gradient =
  | 'HIGH_RUSH'
  | 'RUSH'
  | 'STABLE_RUSH'
  | 'STABLE'
  | 'SAFE_STABLE'
  | 'SAFE';

export type Batch = 'EARLY' | 'SPECIAL_A' | 'NORMAL_B' | 'JUNIOR_COLLEGE';

// ==================== Profile 类型 ====================

export interface TeacherProfile {
  id: number;
  userId: number;
  school?: string;
  isSupervisor: boolean;
  studentCount?: number;
}

export interface StudentProfileSummary {
  id: number;
  userId: number;
  status: StudentStatus;
  realName?: string;
  totalScore?: number;
  provincialRank?: number;
  infoCompleteness: number;
  serviceYear: number;
}

// ==================== 通知类型 ====================

export interface NotificationItem {
  id: number;
  type: string;
  title: string;
  content?: string;
  relatedId?: number;
  relatedType?: string;
  isRead: boolean;
  createdAt: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/shared/src/types/
git commit -m "feat: add new shared types for roles, profiles, notifications"
```

---

## Completion Checklist

After all tasks are complete, verify:

1. [ ] `cd apps/server && npx prisma generate` — no errors
2. [ ] `cd apps/server && npx nest build` — no errors
3. [ ] `cd apps/server && npx jest` — all tests pass
4. [ ] Database has all new tables: `npx prisma studio` to visually verify
5. [ ] CASL permissions: Admin can manage all, Teacher can manage own students, Student can read own plans
6. [ ] Auth: register with role creates corresponding profile, JWT includes profileIds
7. [ ] SSE: `/api/v1/notifications/stream` endpoint exists
8. [ ] Health: `/api/v1/health` returns DB + Redis status
9. [ ] CI: `.github/workflows/ci.yml` exists with lint → test → build pipeline

## Dependencies for Next Plans

This plan provides the foundation for:
- **Plan 2 (Data Pipeline):** Uses QueueModule, AuditService, schema (MajorNameMapping, SupplementaryRecord)
- **Plan 3 (Recommend Engine):** Uses StudentProfile, VolunteerPlan/PlanItem schema, QueueModule, Redis cache
- **Plan 4 (Frontend):** Uses new API endpoints, shared types, notification SSE
- **Plan 5 (Launch):** Uses CI/CD pipeline, backup script, health check
