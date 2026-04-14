# 管理员后台

## 概述

系统管理中心。桌面 only。管理员拥有全部权限，可配置其他角色权限。

## 数据模型引用

- User, TeacherProfile, StudentProfile, AlgorithmConfig, BatchConfig, AuditLog

## 页面结构

```
/admin
  /dashboard            总控台（关键指标+冻结状态提示）
  /users
    /teachers           老师管理（创建/编辑/设为主管）
    /students           学生管理（查看/分配/转移）
    /permissions        权限管理（CASL覆盖配置UI）
  /data
    /import             数据导入（上传→预览→校验→确认）
    /records            导入记录+验证报告
    /quality            数据质量监控（各表完整度/异常值）
    /update             增量更新（填报期间招生计划变更→影响分析）
  /plans
    /overview           全局方案总览（按老师/学生/状态筛选）
    /reviews            审核总览（各老师审核进度）
    /evaluations        方案评估汇总
  /config
    /ai                 AI服务配置
    /batch              批次配置（各批次参数、志愿数量、投档规则）
    /algorithm          算法参数调优工作台
    /system             系统设置（冻结模式开关等）
  /statistics
    /workload           老师工作量（服务学生数/方案数/审核数）
    /admission          录取统计（录取率/批次分布/梯度命中率）
    /trends             数据趋势
  /queues               Bull Queue Dashboard（队列状态监控）
```

## 学生分配与转移

分配：学生 INFO_COMPLETE → 管理员分配给老师 → 通知老师
转移规则：
- 已定版/已发布方案 → 保留，新老师可查看
- 草稿方案 → createdBy 改为新老师
- 审核中方案 → 取消审核回草稿，转给新老师
- 通知三方（原老师、新老师、学生）

## 算法参数调优工作台

AlgorithmConfig 版本化管理：
1. 修改参数 → 选测试样本学生 → 新旧参数方案对比预览
2. 预览展示：志愿变化、梯度分布、985/211占比、平均征集率
3. 确认后"应用参数"（isActive 切换）
4. 旧配置保留，可一键回滚

## 高考填报冻结期

管理员手动开启 freezeMode（6月20日~7月5日）
- ✅ 允许：方案生成/编辑/审核/导出/增量更新
- ❌ 禁止：全量重导入/数据库迁移/算法参数变更(除双重确认)
- 代码部署：仅hotfix
- Dashboard 显示冻结横幅

## 数据变更影响分析

增量更新招生计划时触发：
1. 查找受影响的已定版方案
2. 评估严重度：HIGH(计划缩减>50%/选科变更/取消) / MEDIUM(缩减20-50%) / LOW
3. 按老师分组通知
4. Dashboard 红色提醒条 + 影响分析面板

## 测试要点

- 权限覆盖生效/撤销
- 学生转移后方案归属正确
- 冻结模式下禁止操作正确拦截
- 数据导入事务回滚
