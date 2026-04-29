# 子 Agent 输出 Contract

所有被主 agent 派遣执行数据整合任务的子 agent，**最后一条消息必须是一个 JSON 对象**（可在 markdown code block 内），符合以下 schema：

```json
{
  "task_id": "P1.2",
  "status": "success | partial | failed",
  "counts": {
    "input": 48131,
    "changed": 34,
    "flagged": 0,
    "unresolvable": 0
  },
  "artifacts": [
    "data/_pipeline/P1/主表_修复_2025.xlsx",
    "data/_pipeline/P1/修复日志.csv"
  ],
  "issues": [
    {"severity": "warn", "message": "5 条记录无法通过 01 修复，标记为 needs_review"}
  ],
  "decisions_needed": [
    {"id": "TBD-p1-1", "question": "分数逻辑 5 条无法修复，是删除还是保留带 flag？"}
  ]
}
```

## 字段说明

- `task_id`：plan 中的 task 编号，如 `P1.2` 或 `P1.Task 8`
- `status`：
  - `success`：任务全部完成，无待处置
  - `partial`：主体完成但有需人工决策的条目
  - `failed`：任务卡壳，无法继续
- `counts`：任务涉及的记录数统计（key 由任务决定，至少含 `input`）
- `artifacts`：产出文件的**相对仓库根路径**
- `issues`：执行中发现的问题（不阻塞完成的告警）
  - `severity`: `info | warn | error`
- `decisions_needed`：需要主 agent 裁定或升级给用户的决策点

## 文字叙述

JSON 之外可以有自然语言描述，但不得在 JSON 内夹杂注释。
