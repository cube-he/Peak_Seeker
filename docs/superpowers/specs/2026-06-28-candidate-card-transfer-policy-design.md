# 生成页候选卡片显示转专业政策

> 设计文档 · 2026-06-28 · 已与用户确认

## 目标

生成页院校候选卡片（`CandidateCardV3`）显示该校**转专业政策**，帮老师给学生建议。**有就显示、没有就不显示**。

## 数据现状（线上已核）

转专业数据在 University 表两个字段，互补：
- `transfer_difficulty`（"转专业情况/难度"，≈专家版主表"转专业情况"列）：本科 737/1179 (62%)，**专科 0**；文字长（转专业条件/流程全文）。
- `charter_transfer_limit`（招生章程"转专业限制"）：本科 149、**专科 95**（含重庆医药）；文字短（"不得转入…"）。

两者目前**都没进候选管线**（需新增），纯展示用。

## 取值口径（用户拍板）

`transferPolicy = transfer_difficulty.trim() || charter_transfer_limit.trim() || null`

即：**transfer_difficulty 优先**（本科"好不好转/条件"，对老师更实用），空则**回退 charter**（专科靠它，如重庆医药），两者皆空 → 不显示。

## 实现

### 后端 `plan-candidate.service.ts`
1. `CANDIDATE_ENROLLMENT_PLAN_SELECT` 的 `university.select`（~484-509）加 `transferDifficulty: true, charterTransferLimit: true`。
2. 新增纯函数 `resolveTransferPolicy(u)`（独立文件 `transfer-policy.ts`，可单测，走 TDD）= 上述口径。
3. 组装块（~2267-2288）给 `university` 对象加 `transferPolicy: resolveTransferPolicy(first.university)`。

### 前端 `CandidateCardV3.tsx`
4. `uni = group.university`（`group: any`，无需改类型）。在 `pgv2-card-sub`（选科/历史最低，~430 行）之后加一行：`uni.transferPolicy` 存在才渲染，标签"转专业" + 内容，**单行截断 + `title` 悬停看全文**。
5. CSS：`willnest-teacher.css` 加一个 `.pgv3-transfer` 类（单行 ellipsis），最小改动。

## 范围 / 不做
- 纯展示：**不进候选缓存键、不做筛选/排序**。
- 不碰其它卡片元素、不碰 UniversityCandidateCard（除非同源复用，本期只 V3）。
- 数据已在线上，无需再导入。视觉精修（颜色/间距）留 claude-design。

## 部署
改的是已部署的候选端点 → build server+web + 增量部署。无新迁移、无数据导入。

## 测试
- `resolveTransferPolicy` 单测：td 有→td；td 空+charter 有→charter；都空→null；纯空白→视为空。
- 前端：本地起服务核 plan 79 卡片（重庆医药应显示 charter 那条；本科卡显示 transfer_difficulty）。
