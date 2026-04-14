# 权限体系

## 概述

基于 CASL 库实现细粒度权限控制，支持角色默认权限 + 管理员个人覆盖。

## 数据模型引用

- User.role (ADMIN | TEACHER | STUDENT)
- User.permissionOverrides (Json)
- TeacherProfile.isSupervisor

## 三角色默认权限

### 管理员

can('manage', 'all') — 全部权限，包括：
- 所有老师端功能
- 用户增删改查 + 权限覆盖配置
- 数据导入/导出/质量监控
- 系统配置（AI/批次/算法参数）
- 全局方案总览 + 审核总览 + 统计

### 老师

- can('create', 'Student') — 直接创建学生
- can('manage', 'Student', { assignedTeacherId: user.id }) — 管理名下学生
- can('manage', 'Plan', { createdBy: user.id }) — 管理自己的方案
- can('export', 'Plan', { createdBy: user.id })
- can('read', 'University') / can('read', 'Major')
- **主管老师额外**：can('review', 'Plan') — 审核所有方案；can('publish', 'Plan') — 直接发布
- **普通老师**：can('review', 'Plan', { reviewerId: user.id }) — 仅审核指定给自己的

### 学生

- can('read', 'Plan', { studentId: user.id }) — 查看自己的方案
- can('update', 'StudentProfile', { userId: user.id }) — 编辑自己的信息
- can('read', 'University') / can('read', 'Major')
- can('use', 'LightRecommend')

## 管理员权限覆盖

User.permissionOverrides: [{action, subject, granted: boolean}]

最终权限 = 角色默认 ∪ 额外授予(granted=true) - 额外禁止(granted=false)

示例：
- 资深老师被授权 PUBLISH_WITHOUT_REVIEW → granted=true
- 某学生被授权 GENERATE_FULL_PLAN → granted=true

## 实现架构

```
HTTP请求 → JwtAuthGuard(身份验证) → PoliciesGuard(CASL检查) → Controller
```

CaslAbilityFactory.createForUser(user) 在每次请求时构建 Ability 实例。

## API 端点

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | /admin/permissions | ADMIN | 查询所有权限枚举 |
| GET | /admin/users/:id/permissions | ADMIN | 查询用户有效权限 |
| PUT | /admin/users/:id/permissions | ADMIN | 设置用户权限覆盖 |

## 业务规则

1. 老师只能操作名下学生，CASL conditions + 接口层双重检查
2. 权限覆盖立即生效（不需要重新登录，每次请求重新构建 Ability）
3. 管理员不能降低自己的权限（防止自锁）
4. 权限变更记录 AuditLog

## 测试要点

- 三角色默认权限矩阵穷举
- 权限覆盖的授予和禁止
- 跨用户数据隔离（老师A不能看老师B的学生）
- 主管 vs 普通老师审核权限差异
