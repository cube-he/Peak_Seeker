# 推荐引擎

## 概述

完整复刻 v4.4 系统抽样算法，通过 Bull 队列异步执行，支持多批次、征集分析、多年趋势。

## 数据模型引用

- StudentProfile（输入：分数、选科、偏好、排除、身体条件）
- VolunteerPlan（输出容器）
- PlanItem（输出：55+ 志愿项）
- BatchConfig（批次算法配置）
- AlgorithmConfig（全局评分参数）
- MajorRecommendation / MajorNameMapping（推荐清单 + 标准化）
- SupplementarySummary（征集汇总）
- ScoreSegment（一分一段表）
- AdmissionRecord / EnrollmentPlan（录取数据 + 招生计划）

## 子模块（18个）

| 模块 | 职责 |
|------|------|
| rank-calculator | 分数 → 查一分一段表 → 位次（取悲观值=累计人数） |
| batch-recommender | 学生条件 → 可填批次列表 + 推荐度 |
| range-adapter | P → range_up/range_down（自适应，高分/低分段缩放） |
| candidate-filter | 硬性筛选：选科、批次、排除项、身体条件、学费、中外合作 |
| scoring-engine | 4层动态权重评分（模式A/B），输出 compositeScore + scoreBreakdown |
| supplementary-analyzer | 征集率 + 多年趋势 → 评分修正 + 风险提示 |
| stability-analyzer | 多年位次波动系数 stability = 1-(std/mean) |
| plan-change-analyzer | 招生计划变动率 → 评分微调 + 风险提示 |
| bin-sampler | 系统抽样：等距分bin → 每bin选锚定专业 → 映射院校专业组 |
| dedup-limiter | 三步去重：专业组去重 → 院校限频(max 2) → 局部限频(连续3bin) |
| inner-ranker | 组内专业排序：锚定第1 → 推荐度×3+学科评估×2+偏好×1 降序 |
| cleanliness-assessor | 专业组干净度：CLEAN/MIXED/POOR + 调剂建议 |
| reason-generator | 选择理由 9 段拼接（院校标签/公办/推荐/评级/保研/计划/城市/梯度/偏好） |
| risk-generator | 风险提示：梯度位置 + 数据可靠度 + 调剂风险 + 征集趋势 |
| smart-replacer | 删除某项 → 从该bin备选推荐Top3替补 |
| export-formatter | 导出 Excel(A3完整+A4精简) / PDF(A4打印)，后端 exceljs 生成 |

## 评分公式（v4.4）

```
t = bin_index / total_bins    // 0=冲端, 1=保端
W(t, start, end) = start + (end - start) * t

模式A（院校优先，默认）：
  total = tier×W(t,5.0,3.5) + nature×W(t,3.0,3.5) + major×W(t,2.0,3.0) + other×W(t,1.5,2.5) + bonus

模式B（专业优先）：
  total = major×W(t,5.0,3.5) + nature×W(t,3.0,3.5) + tier×W(t,2.0,3.0) + other×W(t,1.5,2.5) + bonus

各维度原始分：
  tier: 985=5, 211=4, 双一流=3, 省重点=2, 普通=1
  nature: 公办=3, 民办=0
  major = recommend(推荐=3,中性=1,慎选=0) + discipline(A类=4,B类=3,C类=2,软科A无评估=2,无=0)
  other = plan(≥10人=3,≥5人=2,<5=1) + postgrad(≥10%=3,≥5%=2,≥1%=1,无=0) + location(偏好=2,不偏好=0)

修正因子：
  adjustedTotal = rawTotal × stabilityFactor × dataReliabilityFactor
  dataReliability: 25年新高考=1.0, 24年旧高考=0.75, 23年=0.65, 无=0.5
```

## 同分决胜（tie-breaking）

当 compositeScore 相同时，按顺序：
1. 招生计划数更大（更稳定）
2. 历年征集率更低（更热门）
3. 波动系数更小（更可预测）
4. 院校代码字典序（确保确定性）

## 位次推导规则

```
rank = cumulativeCount           // 悲观值（安全）
bestRank = upperSegment.cumCount + 1
uncertaintyRange = rank - bestRank
当 sameScoreCount > 300 时 → range_down 自动 +10%
UI展示："总分580 | 预估位次约45,000（区间44,681~45,000）"
```

## 志愿排序规则（结果表 sequence）

```
梯度间：冲→保
同梯度内：compositeScore 降序
同分：位次小的排前面
老师可拖拽调序 → isManuallyModified=true
```

## 多批次支持

BatchConfig.algorithmConfig.mode:
- "auto"：完整 v4.4（本科B段等）
- "manual"：资格筛选 + 老师手选 1-3 个（提前批）
- "semi-auto"：受限候选池 + 简化抽样（国家专项等）

## 极端分数段降级

有效picks < 40 且 bin跨度已达下限 → 降级模式：
- 不强制凑55个，展示实际可选数量
- 提示老师："可选志愿有限(N个)，建议关注其他批次"

## 异步执行（Bull 队列）

```
老师点"生成方案"
  → API 返回 { jobId, status: 'processing' }
  → Bull worker 执行（concurrency: 4）
  → SSE 分阶段推送："筛选中..." → "评分中..." → "完成"
  → 失败分类处理：TRANSIENT(重试3次) | DATA_ERROR(通知) | ALGORITHM_ERROR(建议) | SYSTEM_ERROR(通知管理员)

priority: 1=出分批量, 2=手动单个, 3=备选池重算, 5=导出
```

## 批量重新生成（出分后）

```
POST /students/batch-update-scores → 更新分数 → provincialRank 重算
  → examSource=GAOKAO 的方案标记 OUTDATED
  → 老师一键"全部重新生成" → Bull addBulk(priority:1)
  → 保留原参数，新版本 versionNote="高考出分后重新生成"
  → 进度面板：已完成N/M，失败项列出原因+操作
```

## 三层数据缓存

| 层 | 数据 | 存储 | 刷新时机 |
|----|------|------|---------|
| 冷 | 一分一段表、推荐清单、批次配置、专业映射 | 应用内存 | 启动时 + 数据导入后 |
| 温 | 征集汇总 | Redis(24h TTL) | 征集数据导入时 |
| 热 | 学生信息 | 数据库(每次读) | 实时 |
| — | 候选池 | 数据库(有复合索引) | 实时查询 |

## 评分可解释性

PlanItem.scoreBreakdown JSON 结构：
```json
{
  "tierScore": 5, "tierWeight": 4.2, "tierContrib": 21.0,
  "natureScore": 3, "natureWeight": 3.1, "natureContrib": 9.3,
  "majorRecScore": 3, "majorDiscScore": 3, "majorWeight": 2.3, "majorContrib": 13.8,
  "planScore": 3, "postGradScore": 2, "locationScore": 2,
  "otherWeight": 1.8, "otherContrib": 12.6,
  "bonus": 5.0, "bonusDetail": "师范+5",
  "stabilityFactor": 0.95, "dataReliability": 1.0,
  "rawTotal": 61.7, "adjustedTotal": 58.6
}
```
老师端展开详情时：水平条形图显示各维度占比。

## 征集志愿分析

征集率 = 征集计划数 / 原始计划数
- 保底段(t>0.7)：多年平均征集率>50%→+3，20-50%→+2，>0→+1
- 冲段(t<0.3)：征集率高 → 降分/标记"冲刺价值有限"
- 趋势：征集率逐年增加→专业热度下降；逐年减少→安全垫可能消失

## 测试要点

- **选科匹配**：12种选科组合 × 所有选科要求类型 = 60+ 用例，100% 覆盖
- **评分计算**：模式A/B 在 t=0 和 t=1 的极端权重验证
- **同分决胜**：确保同输入同输出（确定性）
- **去重**：同院校限频、连续bin限频正确性
- **降级模式**：极高/极低分数段触发降级
- **位次推导**：边界分数(0/750)、同分段、缺失段
- **2024数据折扣**：dataReliabilityFactor 正确应用
