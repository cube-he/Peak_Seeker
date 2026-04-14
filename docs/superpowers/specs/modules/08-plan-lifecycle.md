# 方案生命周期

## 概述

方案从生成到录取评估的完整生命周期管理，含版本、审核、多批次、导出、评估。

## 数据模型引用

- VolunteerPlan, PlanItem, PlanReview, PlanShareLink
- FilingRecord, AdmissionResult, PlanEvaluation

## 状态流转

```
DRAFT → PENDING_REVIEW → REVIEWING → APPROVED → FINALIZED → PUBLISHED
                                   ↘ REJECTED → 修改 → PENDING_REVIEW
FINALIZED → DRAFT (撤回，需管理员/主管+无FilingRecord+填写原因)
PUBLISHED → DRAFT (撤回，同上)
任何状态 → OUTDATED (出分后分数变更触发，仅examSource=GAOKAO)
```

## 版本管理

同一学生同一批次：v1(初稿) → v2(调整) → v3(审核修改) → v4(定版)
- parentVersionId 链式追溯
- isFinal=true 定版后锁定不可编辑
- 任意两版本 diff 对比

## 多批次

同一学生可做多个批次方案（提前批/本科A/本科B/专科），各自独立走状态流转。
批次推荐引擎：根据学生条件自动推荐适合的批次 + 推荐度。

## 审核体系

- 主管老师(isSupervisor)：可审核所有方案，可自审直接定版
- 普通老师：必须提交审核
- 行内审核：✅/❓/❌ + itemAnnotations JSON
- 支持多轮

## 定版确认

老师点"定版" → 弹出对话框，三个复选框必须全勾：
☑ 已逐条审核选科要求
☑ 已确认数据准确性
☑ 已了解本方案为参考建议

## 定版撤回

条件：管理员或主管 + 无 FilingRecord + 填写原因
处理：status→DRAFT, isFinal=false, 通知老师+学生, AuditLog

## 方案区分模拟/正式

examSource: MOCK_ERZHEN | MOCK_SANZHEN | MOCK_OTHER | GAOKAO
- 模拟 → 灰色标签
- 正式 → 绿色标签
- 出分后：只有 GAOKAO+分数变更 才标 OUTDATED

## 跨模拟考对比

GET /plans/cross-exam-compare?studentId=123
展示：稳定选择（一直在方案里的院校）/ 新增/删除 / 梯度迁移
老师端：方案演进 tab + 横向对比表
学生端：简化版时间线

## 导出

三种格式（Bull 队列后端生成）：
- Excel 完整版 A3
- Excel 精简版 A4
- PDF 打印版 A4

## 填报截图 → 录取结果 → 方案评估

```
方案定版 → 学生查看 → 正式填报 → 上传截图(FilingRecord)
→ 录取结果回录(AdmissionResult)
→ 方案评估(PlanEvaluation): 命中位置/梯度准确性/分数利用率
→ 评估数据反哺算法优化
```

## 测试要点

- 状态流转权限：普通老师不能跳审核直接定版
- 撤回条件：有FilingRecord时不可撤回
- 版本链完整性：parentVersionId 正确
- 乐观锁：并发编辑冲突检测
