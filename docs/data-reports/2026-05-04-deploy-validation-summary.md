# spec-0 部署验证总结 — 2026-05-04

## 部署状态

| 项 | 状态 |
|---|---|
| 代码部署 | ✅ 完成（commit `173ffd9`） |
| Migration `20260504000000_rank_prediction_models` | ✅ 已应用 |
| `province_year_stats` seed | ✅ 27 行 |
| `rank_predictions` ETL（target=2026） | ✅ 7475 行入库 |
| T8 calibration | ❌ **数据条件不满足，无法跑** |

## 关键发现

执行 ETL 时发现的 **数据现实**：

| 年份 | admission_records 含 `groupMinRank` | 含 `majorMinRank` |
|---|---|---|
| 2022 | **0 条** | 大量 |
| 2023 | **0 条** | 大量 |
| 2024 | 42474 条 | 大量 |
| 2025 | 43058 条 | 大量 |

**原因**：四川 2022-2023 是旧高考末期，录取以"专业"为最小单元，没有"专业组"概念。`groupMinRank`/`groupMinScore` 字段在那两年的源数据里就是空。**这不是数据导入 bug，是历史现实。**

## 影响

### 模型实际输出

- target=2026: 7475 条 group 级预测，全部 confidence=`low`
  - `low` 来自：planTarget=null（2026 招生计划尚未公布，正常）
  - 抽样验证合理：四川大学历史专业组 102 → 1620 位次（顶尖）；专科批 → 10w+ 位次（大众）
  - `basisYears = [2025, 2024]` — 模型只用了 2 年新高考数据
- target=2025: 0 条入库（2024 单年不够 history.length >= 2）

### Calibration 不可执行

`validate-rank-predictions.ts` 设计是 "用 2022/2023 预测 2024 holdout"。当前 2022/2023 没有 groupMinRank，holdout 没法做。

## 选项

### A. 接受现状，按当前 7475 条预测推进 spec-1（保守路径）

- spec-1 染色就用现有 `point/conservative/optimistic`
- UI 显示 confidence='low' 标签（用户知道这是粗估）
- 等 6 月 2026 招生计划发布后重跑 ETL，confidence 自动升 medium/high
- 用 2025 实际录取数据 vs 模型对 2025 的预测做事后校准（但 2024 单年作 history 太薄，预测 2025 效果有限）

### B. 改算法：用 majorMinRank 在 group 级数据缺失时作 fallback（中等改动）

- predict.ts 改为：history 项含 `groupMinRank ?? aggregate(majorMinRank by group)` 兜底
- 让 2022/2023 也能贡献历史，扩展可预测年份
- 引入 systematic bias（专业最低 ≠ 组最低，差异通常 5-30 名）
- 回到 spec/plan 层级讨论后再实施

### C. 改 calibration 思路（小改动）

- 把 `HOLDOUT_YEAR` 从 2024 改为 2025
- training data: 2024 单年（虽然只有 1 年，但比无验证好）
- 改 `predictMinRank` 临时允许 `history.length === 1`（confidence=low）
- 至少能拿到 "2024 → 2025" 的 MAE 数字

### D. 等真实数据完整再启动（最稳）

- 等 2022/2023 数据补全（如果可能）
- 或等 2026 季度结束、2024+2025+2026 三年完整后
- 期间 spec-1 不上线染色，仅展示历史数据

## 我的建议

**A（接受现状）+ C（补一个能跑的 calibration）的组合**。

理由：
- 当前 7475 条预测在数据现实约束下已是最佳，结果合理
- Confidence='low' 标签是诚实的产品表达 ——"基于 2 年新高考数据，仅供参考"
- C 给一个 holdout MAE 数字（用 2024 单年 → 2025），即使误差大也比"没数字"强
- B 是改算法，应回到 spec 层面讨论 trade-off
- D 推迟 spec-1 几个月

## 等你回家做的决定

1. A / B / C / D 选哪个？或自定义组合？
2. 是否调 `config/rank-prediction.json` 的 `targetYear` 从 2026 ↦ 2025（如果选 C，需要先修 predict 接受 1 年 history）
3. spec-1（视觉地基：logo + 冲稳保染色）现在能不能开工？

## 当前部署可逆性

- DB migration 是 additive，回滚 = `DROP TABLE rank_predictions, province_year_stats`
- 服务 PM2 已重启，但 API 行为变化仅是响应里多了 `predictedMinRank: null`，前端没消费此字段，不影响现有功能
- 如要回滚代码：`git checkout master`（保留分支）后重新 deploy
