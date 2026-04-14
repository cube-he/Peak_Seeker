# 数据导入管线

## 概述

接收本地清洗完成的数据集，通过事务+批量操作导入数据库，含自动验证和专业名称标准化。

## 数据模型引用

- University, Major, EnrollmentPlan, AdmissionRecord（现有表，导入目标）
- MajorRecommendation, MajorNameMapping, SupplementaryRecord, SupplementarySummary
- ScoreSegment, BatchLine, BatchConfig
- AuditLog, FileRecord

## 导入方式

| 方式 | 场景 | 说明 |
|------|------|------|
| 批量脚本 | 年度全量更新 | scripts/import-data/ 扩展 |
| Web端上传 | 增量更新 | 管理员 /admin/data/import |
| OCR | 征集数据采集 | services/ocr-service/ 继续完善 |

## 全量导入流程

```
上传Excel/CSV → 字段映射确认 → 专业名称标准化
  → 导入前备份(pg_dump)
  → 事务内批量写入(每批500条, createMany+skipDuplicates)
  → 超时5分钟, 失败整体回滚
  → 验证报告(6项自动检查)
  → 管理员确认后生效
  → 刷新缓存(内存冷数据 + Redis温数据 + SupplementarySummary)
  → AuditLog记录
```

## 专业名称标准化

导入管线中自动执行：
1. 提取括号内容：baseName + suffix
2. 常见变体统一（别名映射）
3. 后缀分类：实验班/拔尖/中外合作 自动标记
4. 写入 MajorNameMapping 表
5. 推荐清单匹配使用 standardName

## 征集汇总刷新

导入征集数据后，用 $executeRaw：
TRUNCATE + INSERT 重算 SupplementarySummary（物理表，非 View）

## 验证报告（6项）

| # | 检查项 | PASS条件 |
|---|--------|---------|
| 1 | 院校总数 | 2000~3000范围 |
| 2 | 各年份数据量 | 每年>10000条 |
| 3 | 随机抽样10条 | 人工核对 |
| 4 | 异常位次 | 无<0或>300000 |
| 5 | 编码唯一性 | 无重复 |
| 6 | 与上次差异 | 删除>100条则WARN |

FAIL → 阻止生效 | WARN → 管理员勾选确认 | 全PASS → 直接生效

## 增量更新（填报期间）

招生计划变更 → 触发 analyzeDataChangeImpact
→ 标出受影响方案 + 严重度评估 + 按老师通知

## API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /admin/data/import | 全量导入（含验证） |
| GET | /admin/data/records | 导入历史 |
| POST | /admin/data/update | 增量更新（含影响分析） |
| GET | /admin/data/quality | 数据质量面板 |

## 测试要点

- 事务回滚：导入失败不留脏数据
- 重复数据：skipDuplicates 正确去重
- 验证报告：各检查项触发条件
- 缓存刷新：导入后冷/温数据确实更新
