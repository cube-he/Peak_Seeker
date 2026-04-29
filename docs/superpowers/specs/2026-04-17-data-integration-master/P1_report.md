# P1 报告：基线与 03 主表自洽

- **生成时间**：2026-04-17T10:35:17.518928+00:00
- **产物**：`data/_pipeline/P1/主表_修复_2025.xlsx` (rows=48131)
- **日志**：`data/_pipeline/P1/修复日志.csv` (entries=2)
- **未解决**：`data/_pipeline/P1/无法修复项.csv` (entries=2)

## 修复动作汇总

| Action | Count |
|---|---|
| `flag_missing_major_code` | 2 |

## 抽样检查（供用户验收）

| Action | RowIdx | Kept | Detail |
|---|---|---|---|
| flag_missing_major_code | 27817 | 27817 | 专业代码缺失，待 P2 用 01 反查 |
| flag_missing_major_code | 2111 | 2111 | 专业代码缺失，待 P2 用 01 反查 |

## 待处置事项

- 2 条未解决（类型分布见 `无法修复项.csv`），将在 P2 阶段用 01 反查修复

## 验收 Checklist

- [ ] 重复记录去除数量与审计报告一致（34 条）
- [ ] 分数异常标记数量与审计报告一致（约 161+71=232 条）
- [ ] 抽样 20 条修正记录，人工核对合理
- [ ] `主表_修复_2025.xlsx` 行数 = 48131 - 去重数
