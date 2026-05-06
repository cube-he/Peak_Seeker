# Stage 1 分数驱动选科：UI 体验合并

**Date**: 2026-05-06
**Scope**: `apps/web` 学生端 stage 1 表单，前端单点改动
**Status**: 待审核 → writing-plans

---

## 1. 背景

学生端 `/student/profile/stage/1` 当前要分三块填：

1. 「科类」下拉（PHYSICS / HISTORY） → 自动推导「首选科目」
2. 「再选科目（任选 2 门）」多选下拉（化/生/政/地 选 2）
3. 6 个分数输入框：语文、数学、英语 + 抽象槽位「首选科目分 / 再选 1 分 / 再选 2 分」

体验问题：选科 + 填分是两个语义层（"我选了化学" vs "化学考了 88"）。学生大脑里只有「物理 92、化学 88、生物 85」这种**按真实科目命名**的记忆，被迫先在下拉里勾"再选 = 化学,生物"再去找"再选 1 分""再选 2 分"两个匿名槽位输入，反人类。

## 2. 目标

把"选科"和"填分"合并成单一动作：让学生在 9 个真实科目（语、数、外、物、史、化、生、政、地）的输入框里直接输分。**输了哪 3 门选考分（1 物/史 + 2 选考），就等于选了那 3 门。**

非目标（明确不做）：

- ❌ 修改后端 schema / DTO / field-policy / progress.service / 推荐引擎
- ❌ 启用 schema 中 dead 字段 `subjectScores`
- ❌ 改动 stage 2 / stage 3 / 老师端 / 任何加分政策相关 UI

## 3. 非妥协约束

- **后端零改动**：DTO、field-policy、progress.service、推荐引擎、老师位次推导都依赖现有的 `examType / firstChoice / reChoices / scoreFirstChoice / scoreSub1 / scoreSub2 / scoreChinese / scoreMath / scoreEnglish / totalScore` 字段，全部保持原样。前端做"语义层翻译"。
- **加分政策仍归老师**：学生填的 9 科都是裸分；`totalScore = 6 科累加（裸分总分）`；位次推导时后端读 `bonusItems` 把加分加到 `totalScore` 后再查表。学生 UI 没有任何加分入口。
- **物理/历史互斥（实时锁死）**：任何时刻最多一个有值。
- **保存时严格校验**：6 门必须凑齐（语数外 3 + 物/史 1 + 再选 2），不允许部分草稿态保存。

## 4. 用户体验

### 4.1 视觉布局

stage 1 表单中，原有的「科类」下拉、「首选科目」只读框、「再选科目」多选下拉、「高考总分」手填框、6 个分数输入框 **整体替换为**：

```
─── 高考成绩 ──────────────────────────────────────────────
[语文 0-150]  [数学 0-150]  [英语 0-150]
[物理 0-100]  [历史 0-100]
[化学 0-100]  [生物 0-100]  [政治 0-100]  [地理 0-100]

总分（自动累加）：  XXX  分

提示：填语数外 + 物理或历史 + 任选 2 门（化/生/政/地）
```

栅格：第一行 3 列、第二行 2 列、第三行 4 列。响应式上，移动端可改为 2 列流式。

### 4.2 交互规则

| 状态 | 行为 |
|---|---|
| 物理框输入任意值 | 历史框立即 `disabled` 并清空（反之亦然）|
| 物理 / 历史 都是空 | 两个框都可输入 |
| 化生政地中已有 2 个有值 | 剩下 2 个 `disabled`（清空任一已填值即解锁）|
| 化生政地中有值的格 | 永远可编辑/清空 |
| 6 科任意一格变化 | 「总分」实时重算并刷新只读 display |
| 点保存 | 必填校验：语数外都有值 + 物/史恰好 1 个有值 + 化生政地恰好 2 个有值；不通过则报错 message |

### 4.3 错误信息

- 语数外缺：`"请填写语文/数学/英语成绩"`
- 物/史 0 个：`"请填写物理或历史的成绩（首选科目）"`
- 物/史 2 个：理论不可能（实时锁死兜底），若发生则报 `"物理和历史只能填一门"`
- 再选 < 2：`"请填写 2 门再选科目（化/生/政/地）的成绩"`
- 再选 > 2：理论不可能（实时锁死兜底），若发生则报 `"再选科目只能填 2 门"`

## 5. 数据流

### 5.1 提交（前端 → 后端）

引入纯函数 `from9Subjects(formValues): Partial<UpdateStudentDto>`：

```ts
type Subject9Form = {
  scoreChinese?: number; scoreMath?: number; scoreEnglish?: number;
  scorePhysics?: number; scoreHistory?: number;
  scoreChemistry?: number; scoreBiology?: number;
  scorePolitics?: number; scoreGeography?: number;
};

function from9Subjects(v: Subject9Form): Partial<UpdateStudentDto> {
  const isPhysics = v.scorePhysics != null;
  const reSubjectsOrder = ['化学', '生物', '政治', '地理'] as const;
  const reKeyMap = {
    化学: 'scoreChemistry', 生物: 'scoreBiology',
    政治: 'scorePolitics', 地理: 'scoreGeography',
  } as const;
  const reChoices = reSubjectsOrder.filter(s => v[reKeyMap[s]] != null);
  // 累加 6 科裸分（仅有值的）
  const total =
    (v.scoreChinese ?? 0) + (v.scoreMath ?? 0) + (v.scoreEnglish ?? 0) +
    (v.scorePhysics ?? v.scoreHistory ?? 0) +
    reChoices.reduce((s, k) => s + (v[reKeyMap[k]] ?? 0), 0);
  return {
    examType: isPhysics ? 'PHYSICS' : 'HISTORY',
    firstChoice: isPhysics ? '物理' : '历史',
    scoreFirstChoice: isPhysics ? v.scorePhysics : v.scoreHistory,
    reChoices,
    scoreSub1: v[reKeyMap[reChoices[0]]],
    scoreSub2: v[reKeyMap[reChoices[1]]],
    scoreChinese: v.scoreChinese, scoreMath: v.scoreMath, scoreEnglish: v.scoreEnglish,
    totalScore: total,
  };
}
```

**再选顺序约定**：按 `化 → 生 → 政 → 地` 固定枚举顺序映射到 `scoreSub1 / scoreSub2`。这保证幂等性（同一组选择总是同样的存储结果），跟历史数据语义不冲突。

### 5.2 回填（后端 → 前端）

引入纯函数 `to9Subjects(profile): Subject9Form`：

```ts
function to9Subjects(p: StudentProfile): Subject9Form {
  const result: Subject9Form = {
    scoreChinese: p.scoreChinese ?? undefined,
    scoreMath: p.scoreMath ?? undefined,
    scoreEnglish: p.scoreEnglish ?? undefined,
  };
  if (p.firstChoice === '物理') result.scorePhysics = p.scoreFirstChoice ?? undefined;
  if (p.firstChoice === '历史') result.scoreHistory = p.scoreFirstChoice ?? undefined;
  const reChoices: string[] = Array.isArray(p.reChoices) ? p.reChoices : [];
  const reKeyMap = {
    化学: 'scoreChemistry', 生物: 'scoreBiology',
    政治: 'scorePolitics', 地理: 'scoreGeography',
  } as const;
  if (reChoices[0] && reKeyMap[reChoices[0]]) result[reKeyMap[reChoices[0]]] = p.scoreSub1 ?? undefined;
  if (reChoices[1] && reKeyMap[reChoices[1]]) result[reKeyMap[reChoices[1]]] = p.scoreSub2 ?? undefined;
  return result;
}
```

回填后 9 科表单中：未选科目格留空且可输入；已选科目格有值。

### 5.3 往返一致性

`from9Subjects(to9Subjects(profile)) ≡ profile` 当且仅当 profile 已凑齐合规（6 门有值）。这是单元测试的核心 invariant。

## 6. 模块边界

**单文件改动**：`apps/web/src/app/(student)/student/profile/stage/[stage]/page.tsx`

- 重写 `Stage1Fields()` 组件
- 在该文件顶部（或拆出 `apps/web/src/components/student/stage1-score-mapping.ts`）放置 `from9Subjects` / `to9Subjects` 两个纯函数
- 修改 `useEffect` 回填逻辑：从原来的 `for f of fields: initial[f] = profile[f]` 改为对 stage 1 走 `to9Subjects(profile)` 回填，其他 stage 不变
- 修改 `onSave`：stage 1 提交前先 `from9Subjects(values)` 翻译，再 merge `dataVersion` 和其他非分数字段（`realName / phone / parentPhone / gender / formFiller`）

**新增文件（推荐）**：`apps/web/src/components/student/stage1-score-mapping.ts` —— 放纯函数和单元测试，便于隔离测试。

**零改动**：

- `apps/web/src/components/student/stage-fields.ts`（STAGE_1_REQUIRED 不变）
- 后端所有文件
- Prisma schema

## 7. 测试

### 7.1 纯函数单元测试（新增）

文件：`apps/web/src/components/student/stage1-score-mapping.test.ts`

测试用例：

1. **物理类典型**：profile `{firstChoice:'物理', scoreFirstChoice:92, reChoices:['化学','生物'], scoreSub1:88, scoreSub2:85, scoreChinese:120, scoreMath:130, scoreEnglish:125}` → 9 科表单应为 `{scoreChinese:120, scoreMath:130, scoreEnglish:125, scorePhysics:92, scoreChemistry:88, scoreBiology:85}`
2. **历史类典型**：firstChoice='历史' + 政治+地理 → 应回填到 scoreHistory / scorePolitics / scoreGeography
3. **空 profile**：返回的 9 科表单全为 undefined
4. **缺再选**：profile 只有 firstChoice 没有 reChoices → 物理/历史有值，化生政地全空
5. **往返一致**：对 4 组合规 profile 跑 `from9Subjects(to9Subjects(p))`，每个字段都应等于原值
6. **再选顺序无关**：profile reChoices 顺序为 `['生物','化学']` 时，回填后对应分各归位；提交时再选顺序按 化→生→政→地 固定（即 scoreSub1=化学, scoreSub2=生物，与原顺序不同——文档化此行为）

### 7.2 组件交互测试（推荐，非阻断）

文件：`apps/web/src/app/(student)/student/profile/stage/[stage]/Stage1Fields.test.tsx`（如果项目已有 RTL 设施）

- 物理框输入值 → 历史框 disabled 且无值
- 化学+生物都填 → 政治/地理 disabled
- 6 科齐全 → 总分 display 等于累加和
- 缺英语 → 点保存出错误 message

如项目尚无组件测试基础设施，本节作为"实施期发现"延后，不阻断主任务。

### 7.3 手动回归

- 已有学生 profile（带 firstChoice/reChoices/槽位分） → 进 stage 1 → 9 科正确回填 → 不修改直接保存 → 数据库值不应变化（除 `dataVersion` +1）
- 新学生 profile（空） → 9 科全空 → 填齐 6 门 → 保存 → 数据库槽位字段正确写入

## 8. 风险与权衡

| 风险 | 评估 | 缓解 |
|---|---|---|
| 已有学生数据兼容 | 低。槽位字段已有数据 → `to9Subjects` 完整覆盖回填路径 | 单元测试覆盖空/部分/完整三种 profile 状态 |
| 再选顺序变化导致 sub1/sub2 翻转 | 低。后端不假设 sub1/sub2 内部顺序，只用 reChoices 数组识别科目；翻转无副作用 | 测试用例 6 显式覆盖此行为并文档化 |
| 学生填错总分 | 不存在。总分自动累加，不接受手填 | A1 决议消除此风险 |
| 加分学生在 stage 1 看到的位次偏低 | 已知问题。等老师补加分后才准确 | UI 不暴露位次给学生（TEACHER_ONLY），无可见副作用 |

## 9. 范围圈

**改**：

- `apps/web/src/app/(student)/student/profile/stage/[stage]/page.tsx` 中的 `Stage1Fields` 组件 + 回填/提交逻辑
- 新增 `apps/web/src/components/student/stage1-score-mapping.ts`
- 新增 `apps/web/src/components/student/stage1-score-mapping.test.ts`

**不改**：

- 任何后端文件
- `apps/web/src/components/student/stage-fields.ts`
- stage 2 / stage 3 表单
- 老师端任何视图

## 10. 完成判定

- [ ] 9 科 UI 渲染 + 互斥锁死交互正确
- [ ] 总分自动累加显示
- [ ] 保存校验 6 门齐全
- [ ] 已有学生数据回填正确（往返一致性测试通过）
- [ ] 新数据保存到数据库的槽位字段值与 9 科 UI 等价
- [ ] 单元测试 6 个用例全绿
- [ ] 旧 UI 元素（科类下拉/再选下拉/3 个抽象槽位输入框/总分手填框）从 stage 1 完全移除
