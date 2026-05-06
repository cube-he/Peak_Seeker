# Student Profile Redesign Design

**日期**：2026-05-06
**作者**：Claude (with @user)
**状态**：approved, pending implementation

## 背景

当前学生档案页 `/student/profile` 有两个用户体验问题：

1. **3 阶段点击进入**模式：主页只是 3 张 stage 卡片，每张点击跳转到独立的 `stage/[stage]/page.tsx` 表单页填写。学生需要 3 次跳转才能填完档案，体验割裂。
2. **9 个字段强制老师录入**（`TEACHER_ONLY_FIELDS` 中的户籍、加分、考试地系列），学生不能填。但实际上户籍、加分、高考所在地都是学生自己最清楚的信息，让老师录入既低效（老师要手工录全班几十人）也不合理。

## 目标

1. **权限放权**：把 9 个字段（`bonusPolicyStatus`、`bonusItems`、`province`、`city`、`county`、`isRural`、`examLocationProvince`、`examLocationCity`、`examLocationCounty`）从 `TEACHER_ONLY_FIELDS` 移走，改成「学生可填，老师可改/审核」。`provincialRank` 保留自动计算（不变）。
2. **布局重构**：profile 主页从"3 阶段卡片跳转"改成"7 个版块平铺直接编辑"，单页面浏览+编辑。
3. **自动保存**：每个字段编辑后 debounce 1.5 秒自动保存，顶部状态条显示保存进度。
4. **老师修改可见**：老师改过的字段显示 provenance 小标"由老师 X 修改·N 天前"，学生仍可改回去。

**成功标准**（可验证）：

- 学生在新 profile 页编辑户籍、加分、考试地，能成功保存，刷新后值持久化
- 老师在管理页修改某学生的户籍后，该学生再访问 profile 时看到新值 + provenance 小标
- 自动保存：单字段编辑 1.5 秒后 PATCH 请求触发，状态条显示"已保存"
- 7 个版块在主页直接展示，无需跳转
- `provincialRank` 仍由后端自动计算（不变）
- 既有 3 个 stage 表单页保留为兼容性入口（学生从老链接进入仍能工作），但主页不再链接到它们
- 老的 `getMyProfile` 返回的字段过滤策略调整后，9 个字段对学生可见（非过滤）

## 非目标

- **不重做** stage 1/2/3 表单页（`stage/[stage]/page.tsx`）—— 保留作为兼容性入口（旧链接、外部书签可能进入）
- **不修改** 后端 `progress` 计算逻辑（`studentSelfCompleteness` / `overallCompleteness`）—— stage 概念在后端保留用于推荐算法 gating
- **不引入** 字段级 audit log / version history（仅显示最新 provenance，不展示完整历史）
- **不做** 老师"锁定"字段功能（学生始终可改）
- **不做** 学生与老师的实时协作（如同时编辑提示）
- **不做** 字段级评论 / 备注

## 设计

### 1) 7 个版块的字段分组

| # | 版块标题 | 字段 |
|---|---|---|
| 1 | **基础信息** | realName, phone, gender, examType, parentPhone, formFiller, ethnicity, politicalStatus |
| 2 | **分数与选科** | firstChoice, reChoices, totalScore, scoreChinese, scoreMath, scoreEnglish, scoreFirstChoice, scoreSub1, scoreSub2, **provincialRank（只读）** |
| 3 | **户籍与考试地** ⭐ | province, city, county, isRural, examLocationProvince, examLocationCity, examLocationCounty |
| 4 | **加分政策** ⭐ | bonusPolicyStatus, bonusItems |
| 5 | **健康条件** | height, weight, visionLeft, visionRight, visionLeftCorrected, visionRightCorrected, colorBlind, colorWeak, physicalLimits, medicalHistory |
| 6 | **志愿偏好与排除** | preferredProvinces, preferredCities, preferredMajors, preferredUniversities, preferredMajorCategories, preferredBatches, priorityMode, preferredTags, excludedProvinces, excludedCities, excludedUniversities, excludedMajors |
| 7 | **升学规划与个性** | careerPlan, careerDirection, militaryInterest, teacherInterest, interests, personalityType, selfDescription, remoteAreaAcceptance, coldMajorAcceptance, stayPreference, tuitionBudget, acceptSinoForeign, acceptPrivate, acceptCooperation, otherRequirements |

⭐ = 本次新放权的版块。

64 个字段中：
- 63 个学生可编辑
- 1 个只读自动算（`provincialRank`）

### 2) 后端权限改造

**field-policy.ts 修改**：

`TEACHER_ONLY_FIELDS` 从 10 个 → **1 个**（仅 `provincialRank`）。

把以下 9 个字段移到 `STUDENT_OPTIONAL_FIELDS`（新增分组）或合并进现有 stage 列表：
```
bonusPolicyStatus, bonusItems,
province, city, county, isRural,
examLocationProvince, examLocationCity, examLocationCounty
```

实际放法（推荐）：保持 `STAGE_1/2/3_*` 不变（向后兼容 progress 计算），新增：

```ts
export const STUDENT_NEWLY_WRITABLE = [
  'bonusPolicyStatus', 'bonusItems',
  'province', 'city', 'county', 'isRural',
  'examLocationProvince', 'examLocationCity', 'examLocationCounty',
] as const;

// TEACHER_ONLY_FIELDS 缩减为：
export const TEACHER_ONLY_FIELDS = ['provincialRank'] as const;
```

**CASL 规则修改**：

学生对 `STUDENT_NEWLY_WRITABLE` 的字段加 `update` 权限。老师对所有学生字段（含这 9 个）的 update 权限保持。

**API 修改**：

`GET /api/v1/students/me/profile`：返回 9 个字段（之前会被 field-policy 过滤掉）。

`PATCH /api/v1/students/me/profile`：接受 9 个字段的更新。

### 3) Provenance 字段

新增 9 个字段，每个对应"X by Y at Z"三元组：

```prisma
model StudentProfile {
  // ...existing fields...

  bonusPolicyUpdatedBy String? @map("bonus_policy_updated_by") @db.VarChar(20)  // 'student' | 'teacher'
  bonusPolicyUpdatedAt DateTime? @map("bonus_policy_updated_at")

  // ... 同样为下面 8 个字段加 updatedBy + updatedAt：
  // hukouUpdatedBy/At (覆盖 province/city/county/isRural 一组)
  // examLocationUpdatedBy/At (覆盖 examLocationProvince/City/County 一组)
}
```

简化方案：**不为每个字段独立加 provenance**，而是按 3 个字段分组（户籍、加分、考试地）各加一对 `updatedBy/UpdatedAt`，共 6 个新列：

| 列 | 类型 | 含义 |
|---|---|---|
| `hukouUpdatedBy` | string? | 'student' \| 'teacher' |
| `hukouUpdatedAt` | DateTime? | 最后更新时间 |
| `bonusUpdatedBy` | string? | 同上 |
| `bonusUpdatedAt` | DateTime? | |
| `examLocationUpdatedBy` | string? | |
| `examLocationUpdatedAt` | DateTime? | |

后端 PATCH 时根据请求来源（student / teacher）填这 2 列。前端读到 `updatedBy='teacher'` 且 `updatedAt` 比"上次学生看到"新时显示 provenance 小标。

简化的"上次学生看到"判定：直接显示 "由老师修改 · N 天前"，学生再编辑后 `updatedBy` 变 'student'，小标自动消失。不需要单独的"已读"状态表。

**provenance 文案不显示具体老师名**——只显示"由老师修改"，因为系统中可能多位老师有权修改同一学生（班主任、辅导员），且对学生而言"哪位老师改的"不重要（关键是"被修改了"这个信号）。

### 4) 前端布局结构

**新 `/student/profile/page.tsx`**：

```
┌─────────────────────────────────────────┐
│ 我的档案                                 │
├─────────────────────────────────────────┤
│ [自填进度 ▓▓▓▓▓░░░ 60%]                 │
│ [档案总进度 ▓▓▓▓▓▓▓░ 75%]                │
│ [可推荐：✓]  ← 或缺哪些字段提示           │
├─────────────────────────────────────────┤
│ 顶部固定保存状态条：                      │
│   [✓ 已保存]   ← 编辑后 1.5s 后浮现       │
├─────────────────────────────────────────┤
│ ▼ 1. 基础信息  [8 字段，已填 7]          │
│   姓名: [____]  电话: [____] ...          │
├─────────────────────────────────────────┤
│ ▼ 2. 分数与选科  [10 字段，已填 10]       │
│   ... 字段 ...                           │
│   全省位次: 12345（自动计算）             │
├─────────────────────────────────────────┤
│ ▼ 3. 户籍与考试地  [7 字段，已填 4]       │
│   省: [____]  市: [____] 县: [____]       │
│      [由老师 X 修改 · 3 天前] ← provenance│
│   ...                                    │
├─────────────────────────────────────────┤
│ ▼ 4-7. 各版块同上                        │
├─────────────────────────────────────────┤
│ [查看老师为我生成的方案] ← 推荐入口        │
└─────────────────────────────────────────┘
```

每个版块默认展开（折叠状态可选，先全展开），用 antd `Collapse` 或自己写。

**自动保存机制**：

每个字段 onChange 后用 lodash `debounce(1500)` 触发 `studentApi.patchMyProfile({ [fieldKey]: value })`。

**全局保存状态 store**（zustand 或 Context）：
```ts
type SaveState = 'idle' | 'saving' | 'saved' | 'error';
```

顶部固定状态条订阅 store 显示。

**字段组件**：每个字段类型（input、select、cascader、checkbox-group 等）封装为 `<AutoSaveField fieldKey={...} />`，内部处理 debounce + 状态更新。

### 5) 涉及文件

**后端**：
- `apps/server/src/modules/student/field-policy.ts` — 缩减 `TEACHER_ONLY_FIELDS`，新增 `STUDENT_NEWLY_WRITABLE`
- `apps/server/src/modules/student/student.service.ts` — `getMyProfile` 不再过滤 9 个字段；`patchMyProfile` 在写这 9 个字段时设置对应 `*UpdatedBy/At`
- `apps/server/src/modules/student/student.controller.ts` — DTO 加 9 个可选字段
- `apps/server/src/modules/auth/casl.factory.ts` — student 对 `STUDENT_NEWLY_WRITABLE` 加 `update` 权限
- `apps/server/prisma/schema.prisma` — `StudentProfile` 加 6 个 provenance 列 + migration

**前端**：
- `apps/web/src/app/(student)/student/profile/page.tsx` — 完全重写
- `apps/web/src/components/student/sections/` — 7 个新版块组件（拆文件）
- `apps/web/src/components/student/AutoSaveField.tsx` — 字段封装
- `apps/web/src/components/student/SaveStatusBar.tsx` — 顶部状态条
- `apps/web/src/components/student/ProvenanceBadge.tsx` — provenance 小标
- `apps/web/src/stores/student-save-state.ts` — zustand store
- `apps/web/src/components/student/stage-fields.ts` — 同步缩减 `TEACHER_ONLY_FIELDS`
- `apps/web/src/services/student-api.ts` — `patchMyProfile` 接受 9 个新字段

**保留不动**：
- `apps/web/src/app/(student)/student/profile/stage/[stage]/page.tsx` — 旧 stage 表单页保留为兼容入口
- 后端 `progress` 计算逻辑

### 6) 测试

**后端**：
- `field-policy.spec.ts` 加 case：`getStudentReadable` 包含 9 个字段；`getTeacherWritable` 包含 9 个字段
- `student.service.spec.ts` 加 case：student PATCH 户籍 → DB 写入 + `hukouUpdatedBy='student'`；teacher PATCH → `hukouUpdatedBy='teacher'`
- `casl.factory.spec.ts` 加 case：student 对 `province` 字段有 update ability
- e2e：`PATCH /students/me/profile` 加户籍字段 → 200 + 持久化

**前端**：
- `AutoSaveField.test.tsx`：onChange 1500ms 后触发 PATCH；连续多次输入只触发 1 次
- `SaveStatusBar.test.tsx`：state machine 转换正确（idle → saving → saved → idle）
- `ProvenanceBadge.test.tsx`：updatedBy='teacher' 时显示，updatedBy='student' 时不显示
- `profile/page.test.tsx`：7 个版块都渲染；provincialRank 显示为只读

**生产验证**：
- 用真账号在 `/student/profile` 编辑户籍字段，看 1.5s 后是否有 saving → saved 提示
- 切到老师账号修改该学生户籍，回学生账号看 provenance 小标显示
- 刷新页面，确认值持久化

## 失败模式与回滚

| 风险 | 概率 | 影响 | 应对 |
|---|---|---|---|
| 自动保存太快导致 race condition（并发 PATCH 同字段）| 低 | 字段值短暂错乱 | debounce 1.5s + 单字段 PATCH 即足；如果出现可加 optimistic concurrency token |
| 老师 + 学生同时编辑同一字段 | 极低 | last-write-wins | 接受；本 spec 不做协同 |
| Migration 失败 | 低 | 部署阻塞 | 本地 migrate dev 验证；prod 用 migrate deploy |
| stage-form 兼容性入口失效 | 中 | 老链接 404 | 保留 `stage/[stage]/page.tsx` 路由 |

回滚：
- 代码：`git revert <commit-range>`
- DB：6 个 provenance 列保留无害（即使代码回滚，列存在不影响）

## 调用预算

不涉及 AMap，无外部 API 成本。

## 实施顺序（粗）

1. 后端：field-policy 缩减 + CASL + Prisma migration
2. 后端：service 层 PATCH 时设置 provenance 字段
3. 后端：getMyProfile 不再过滤 + 测试
4. 前端：AutoSaveField + SaveStatusBar + zustand store + 测试
5. 前端：ProvenanceBadge
6. 前端：7 个版块组件 + 测试
7. 前端：重写 profile/page.tsx 编排
8. 部署 + 生产验证

详细 task 拆分由 writing-plans skill 产出。
