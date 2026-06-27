# 设计：多稿（二稿）—— 解锁版本派生 + 初稿锁定 + 复用 diff

- 日期：2026-06-28
- 状态：待实现
- 关联记忆：`plan_multisort_deployed`、`supervisor_review_status`

## 1. 背景与真实需求

老师做完**初稿**给学生看，学生提了修改意见（**主要是"删掉某几个志愿、新增某几个志愿"**）。老师要在初稿基础上做**二稿**，并把**初稿和二稿都保存**下来、能**看清两稿之间删了啥加了啥**。

### 关键判断：功能 90% 已建好，本次只解锁

排查后确认，多稿能力在代码里**早已存在**，只是被锁在"主管审核→驳回"那条流水线里：

| 能力 | 现状 | 位置 |
|---|---|---|
| 复制初稿成新版本（保留初稿） | ✅ `deriveVersion`：拷贝全部 `PlanItem`、`versionNo+1`、`parentVersionId` 指向初稿、状态回 DRAFT | `plan.service.ts:603` |
| 版本链存储 + 列表可见可点 | ✅ `findTeacherPlans` 返回**全部版本**（非 latest-only），每版一行带 v 号 | `plan.service.ts:89` |
| 生成页改"最新那版" | ✅ `listForStudent(..., {latest:true})` | 生成页 |
| **两稿 diff（红删/绿增）** | ✅ `diffPlanItems` + `ComparePanel`：`added/removed/modified/reordered`，红=删除绿=新增 + 汇总计数 | `[id]/page.tsx:158/1487` |

学生意见以"删除/新增"为主 —— **这恰好是 diff 最擅长表达的**。因此**不做**重型的"逐条意见 + 已处理/未处理勾选"追踪（过度设计）。

### 唯一真正的缺口

"派生新版本/另存为二稿"这个动作被锁死：

- **前端按钮只在 `REJECTED` 状态渲染**（`[id]/page.tsx:726-738`）。
- **后端 `canDeriveVersion` 只允许 `APPROVED/PARENT_CONFIRMED/REJECTED/FINALIZED`**，唯独不含 `DRAFT`（`plan-state-machine.service.ts:50`）。

老师的初稿是普通草稿、从没走过主管审核 → 界面上根本找不到这个按钮。这就是"感觉没有二稿功能"的全部根因。

## 2. 设计目标与非目标

**目标**
1. 草稿态(`DRAFT`)的初稿可一键「另存为二稿」：冻结初稿、复制出可编辑的二稿。
2. 派生后**初稿锁成只读**（学生确认时只看一个确定版本，避免两份草稿都能改、搞混在用哪个）。
3. 复用现成的版本对比 diff 看删除/新增。
4. 触发入口在**方案详情页**。

**非目标（明确不做）**
- 不碰学生端（老师代录，学生意见以实际增删体现，本期不做结构化意见录入）。
- 不做"逐条意见 + 已处理/未处理"追踪。
- 不碰主管审核 / 家长确认流程。
- 不改版本对比 / diff / 列表 / 生成页（全部复用）。

## 3. 锁定初稿的实现：复用 `OUTDATED` 状态（零迁移）

`PlanStatus` 枚举里已有 **`OUTDATED`**（schema `enum PlanStatus`），语义即"过时/被取代"，且**当前是空状态**——没有任何流程会把方案置成它，只有徽章("已过期")和列表分组两处纯展示引用。

复用它锁初稿，好处：
- `canEditItems(status)` 只对 `DRAFT` 返回 true（`plan-state-machine.service.ts:54`），所以初稿一旦置 `OUTDATED`，**编辑守卫自动拦截**（`plan.service.ts:264`、`plan-item.service.ts:44`），无需新字段/新逻辑。
- 学生端工作流派生 `deriveWorkflowStatus` 取**最新方案**状态，且 `OUTDATED→GENERATING`、`DRAFT→GENERATING`（`student.service.ts:78`），初稿置 OUTDATED 不影响学生端显示（学生看的是二稿）。
- **零迁移、零新字段。**

> 取舍：相比新增 `supersededByVersionId` 列（需迁移 + 改编辑守卫签名），复用 `OUTDATED` 更外科手术。代价是初稿在方案列表会落到"已交付"分组、徽章显示"已过期"（语义略糙）。对策见 §4 前端第 3 点（详情页用准确 banner 盖过），列表分组本期不动。

## 4. 改动清单

### 后端

1. **`plan-state-machine.service.ts` — `canDeriveVersion`**：增加 `from === 'DRAFT'`。
   - 配套更新 `plan-state-machine.service.spec.ts`：`DRAFT` 由不可派生改为可派生。

2. **`plan.service.ts` — `deriveVersion(planId, userId, versionNote?)`**：
   - 新增可选入参 `versionNote`，写进新版本（默认 `null`）。
   - **下一版本号改为 `max(versionNo) + 1`**（按 `studentId + batchConfigId` 取当前最大版本号再 +1），替代现在的 `parent.versionNo + 1`。根因：`canDeriveVersion` 含 `FINALIZED`，若从同一已定稿版本派生两次，`parent.versionNo+1` 会撞 `@@unique([studentId, batchConfigId, versionNo])`。`max+1` 同时修掉这个既存隐患。
   - **事务内把初稿(parent)状态置 `OUTDATED`**（仅当 parent 当前为 `DRAFT` 时；其它既有可派生态 REJECTED/FINALIZED 等维持原行为不动，避免回归）。
   - 返回新版本（含 id），供前端跳转。

3. **`plan.controller.ts` — `POST :id/derive-version`**：`@Body()` 透传可选 `{ versionNote?: string }` 给 service。

### 前端

4. **`plan-api.ts` — `deriveVersion(id, versionNote?)`**：参数透传到 POST body。

5. **`[id]/page.tsx` — 详情页「另存为二稿」按钮**：
   - 在 `DRAFT` 状态的主动作区新增「另存为二稿」按钮（与现有 `REJECTED` 的"派生新版本"并存，二者复用同一 `deriveMutation`）。
   - 点击 → 弹一个备注输入框（antd Modal + TextArea，占位"如：二稿—按学生意见删A加B"，可留空）→ `deriveVersion(planId, note)` → 成功后 `router.push` 到**新版本的生成页**继续改。
   - mutation 成功要 `invalidateQueries(['plan-versions', ...])` 等，保证版本列表/对比刷新。

6. **`[id]/page.tsx` — 只读版本 banner**：
   - 打开 `OUTDATED` 版本时，顶部显示 `Alert`「此版本已被 v{N} 取代 · 只读」+ 跳到取代它的版本的链接。取代版本号从已加载的 `versions` 列表里找 `parentVersionId === 当前id` 的那条。
   - 编辑动作（删项/清空/加项）本就按 `status === 'DRAFT'` 渲染，`OUTDATED` 下自动隐藏，无需额外改。

### 复用不改

版本对比 diff（`diffPlanItems`/`ComparePanel`，红删绿增）、版本列表、版本切换、生成页编辑最新版、方案列表多版本可见 —— **一行不改**。

## 5. 数据流（典型路径）

```
老师在 /teacher/plans/{初稿id}（DRAFT）
  └─ 点「另存为二稿」→ 填备注
       └─ POST /plans/{初稿id}/derive-version { versionNote }
            └─ deriveVersion 事务:
                 ① 新建二稿(VolunteerPlan): versionNo=max+1, parentVersionId=初稿id, status=DRAFT, versionNote
                 ② createMany 拷贝初稿全部 PlanItem 到二稿
                 ③ 初稿 status: DRAFT → OUTDATED  (自动只读)
            └─ 返回二稿
       └─ 前端跳 /teacher/plans/generate/{studentId}?planId={二稿id}
            └─ 老师按学生意见删/加院校（改的是二稿）
  回到详情页 → 版本对比选初稿 → ComparePanel 显示 红=删除 / 绿=新增
```

## 6. 边界与错误处理

- **权限**：`deriveVersion` 已校验 `parent.createdById === userId`（非出方案老师报 403），沿用。
- **空初稿派生**：初稿 0 个志愿项时，`createMany` 跳过，二稿为空草稿 —— 合法（老师可能想留个空壳重做）。
- **版本号并发/重复派生**：`max+1` 保证唯一；且初稿派生后即 `OUTDATED`（不在 `canDeriveVersion` 白名单），无法对同一初稿二次派生，结构上杜绝撞号。
- **备注为空**：`versionNote` 允许 `null`，版本列表回退显示 `v{n} · {status}`（现有逻辑）。
- **既有 REJECTED/FINALIZED 派生路径**：不改其 parent 状态流转（只对 `DRAFT→OUTDATED` 新增置位），零回归。

## 7. 测试计划

**后端单测**
- `plan-state-machine.service.spec.ts`：`canDeriveVersion('DRAFT') === true`；其余断言维持。
- `plan.service.spec.ts`：
  - 从 DRAFT 初稿派生 → 二稿 `versionNo = max+1`、`parentVersionId = 初稿id`、`status='DRAFT'`、带 `versionNote`；初稿被置 `OUTDATED`。
  - 拷贝了初稿的 PlanItem（createMany 入参条数/字段）。
  - 非创建者派生 → 403（沿用既有断言）。

**前端**
- 详情页 `DRAFT` 态渲染「另存为二稿」按钮；点击走 `deriveVersion` 并跳转。
- `OUTDATED` 态渲染只读 banner、隐藏编辑动作。

**真人验证**
- 详情页 → 另存二稿 → 填备注 → 跳生成页删 1 个加 1 个 → 回详情页选初稿对比 → 看到 1 红(删) 1 绿(增)；初稿页只读、有"已被 v2 取代"banner。

## 8. 实现顺序（粒度 2–5 分钟）

1. 后端状态机 `canDeriveVersion` 加 DRAFT + 改单测（RED→GREEN）。
2. 后端 `deriveVersion` 加 `versionNote` + `max+1` + 初稿置 OUTDATED + 单测。
3. controller 透传 `versionNote`。
4. `plan-api.ts` 透传 `versionNote`。
5. 详情页 DRAFT 态「另存为二稿」按钮 + 备注 Modal + 跳转。
6. 详情页 OUTDATED 只读 banner。
7. 验证：两端 build + 单测 + 真人走查。
