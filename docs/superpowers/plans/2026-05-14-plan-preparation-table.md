# 方案详情页 新增"志愿填报预案一览表"实施计划

> **执行者**：codex（用户委托）
> **作者**：Claude（只负责制定方案与撰写计划，不写代码）

**Goal:** 在 `/teacher/plans/[id]` 方案详情页"志愿明细" Card 之后新增一个"志愿填报预案一览表" Card，结构与 `data/09_业务文档/志愿预案模版-.pdf` 一致（每个志愿一行嵌套 6 个专业），右上角"打印预案表"按钮触发 `window.print()` 只输出该 Card。

**Architecture:**
- 新增一个纯展示组件 `PlanPreparationTable.tsx`，渲染原生 `<table>`（不用 antd Table，方便控制嵌套行 + 打印分页 + 边框）
- 配套 CSS Module 处理屏幕样式 + `@media print` 隐藏页面其他内容
- 在 `page.tsx` 加一个 Card 引用组件，包 `data-print-root` 属性供 print CSS 锁定
- 数据复用现有 `getPlanItemMajorSelection(item)` 函数取 6 个专业

**Tech Stack:** React 18 + Next.js App Router + TypeScript + CSS Modules + Ant Design 5（仅 `Card`/`Button`）

**Out of scope:**
- 不动 Prisma schema、不动后端 API、不动 `PlanExportService` 的 PDF 模板
- 不动现有"志愿明细" Table（保留决策视图）
- 不加新依赖（不引入 `react-to-print` 等库）

---

## 字段对照（关键参考）

| 模板列 | 数据源 | 备注 |
|---|---|---|
| 序号上行 | `plan.batchName ?? plan.batch ?? '本科批'` | 动态批次名 |
| 序号中行 | `item.sequence`（数字） | DB 已存 |
| 序号下行 | 固定字符串 `'平行志愿'` | 硬编码 |
| 院校列 | `\`${item.universityCode ?? ''} ${item.universityName}\`.trim()` | 中间空格分隔 |
| 专业组列 | `item.groupCode ?? '-'` | 通常 3 位数字 |
| 专业 i 行 | `selection.selectedMajors[i]` | 来自 `getPlanItemMajorSelection(item)` |
| 专业 i 序号 | `i + 1`（固定 1-6） | 即使数据空也显示 1-6 |
| 专业 i 代码 | `selection.selectedMajors[i]?.majorCode ?? ''` | 空则留空 |
| 专业 i 名称 | `selection.selectedMajors[i]?.majorName ?? ''` | 空则留空 |
| 是否服从专业调剂 | `item.acceptAdjust`（boolean） | "是""否"两行都画，选中加 `<strong><u>` |

### 抬头格式

```
{学生姓名} 志愿填报预案一览表  ｜  {totalScore} 分 / 第 {provincialRank} 位
```

学生分数/位次：
- 当前 `plan` 对象通过 `planApi.getById` 返回，但并不一定带 `student.totalScore / provincialRank`
- **Step 1.5 调研**：先 Read 一下 `apps/server/src/modules/plan/plan.service.ts` 看 `findOne` 返回的 student 嵌套字段。如果没带，需要在 page.tsx 额外用 `studentApi.getById(plan.studentId)` 取一次
- 或者直接渲染 `plan?.student?.totalScore` 这种链式取值，缺失就显示 `-`

---

## File Structure

| 路径 | 操作 | 责任 |
|---|---|---|
| `apps/web/src/app/(teacher)/teacher/plans/components/PlanPreparationTable.tsx` | 新建 | 纯展示组件 + 打印按钮 |
| `apps/web/src/app/(teacher)/teacher/plans/components/PlanPreparationTable.module.css` | 新建 | 屏幕样式 + `@media print` 隐藏其他元素 |
| `apps/web/src/app/(teacher)/teacher/plans/[id]/page.tsx` | 修改 | 引入组件，新增 Card |

---

## Task 1: 新建 `PlanPreparationTable.tsx` 组件

**Files:**
- Create: `apps/web/src/app/(teacher)/teacher/plans/components/PlanPreparationTable.tsx`

- [ ] **Step 1: 创建文件，写完整实现**

```tsx
'use client';

import { Button } from 'antd';
import { PrinterOutlined } from '@ant-design/icons';
import { getPlanItemMajorSelection } from '../generate/[studentId]/plan-workbench-utils';
import styles from './PlanPreparationTable.module.css';

interface PlanPreparationTableProps {
  plan: any; // 与 page.tsx 现有类型一致，本组件只读取以下字段
  items: any[];
}

const PROFESSION_ROWS = 6;

function formatScore(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return `${value} 分`;
  return '- 分';
}

function formatRank(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return `第 ${value.toLocaleString()} 位`;
  }
  return '位次 -';
}

function buildUniversityCell(item: any) {
  const code = item.universityCode ?? '';
  const name = item.universityName ?? '-';
  return code ? `${code} ${name}` : name;
}

export default function PlanPreparationTable({ plan, items }: PlanPreparationTableProps) {
  const studentName =
    plan?.studentName ?? plan?.student?.user?.realName ?? plan?.student?.user?.username ?? '-';
  const totalScore = plan?.student?.totalScore ?? plan?.studentTotalScore;
  const rank = plan?.student?.provincialRank ?? plan?.studentProvincialRank;
  const batchLabel = plan?.batchName ?? plan?.batch ?? '本科批';

  const handlePrint = () => {
    if (typeof window !== 'undefined') window.print();
  };

  return (
    <div data-print-root className={styles.root}>
      <div className={styles.toolbar}>
        <div className={styles.title}>
          <strong>{studentName}</strong>
          <span>志愿填报预案一览表</span>
          <em>{formatScore(totalScore)} / {formatRank(rank)}</em>
        </div>
        <Button
          type="primary"
          icon={<PrinterOutlined />}
          onClick={handlePrint}
          className={styles.printBtn}
        >
          打印预案表
        </Button>
      </div>

      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.colSeq}>序号</th>
            <th className={styles.colSchool}>院校</th>
            <th className={styles.colGroup}>专业组</th>
            <th className={styles.colMajor} colSpan={3}>专业</th>
            <th className={styles.colAdjust}>是否服从专业调剂</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td colSpan={7} className={styles.empty}>暂无志愿项</td>
            </tr>
          ) : null}
          {items.map((item, idx) => {
            const selection = getPlanItemMajorSelection(item);
            const selectedMajors = selection.selectedMajors ?? [];
            const sequence = item.sequence ?? idx + 1;
            return (
              <tbody key={item.id ?? idx} className={styles.itemBlock}>
                {Array.from({ length: PROFESSION_ROWS }).map((_, i) => {
                  const major = selectedMajors[i];
                  const isFirst = i === 0;
                  return (
                    <tr key={i}>
                      {isFirst ? (
                        <td rowSpan={PROFESSION_ROWS} className={styles.seqCell}>
                          <div>{batchLabel}</div>
                          <div className={styles.seqNum}>{sequence}</div>
                          <div>平行志愿</div>
                        </td>
                      ) : null}
                      {isFirst ? (
                        <td rowSpan={PROFESSION_ROWS} className={styles.schoolCell}>
                          {buildUniversityCell(item)}
                        </td>
                      ) : null}
                      {isFirst ? (
                        <td rowSpan={PROFESSION_ROWS} className={styles.groupCell}>
                          {item.groupCode ?? '-'}
                        </td>
                      ) : null}
                      <td className={styles.majorIdx}>{i + 1}</td>
                      <td className={styles.majorCode}>{major?.majorCode ?? ''}</td>
                      <td className={styles.majorName}>{major?.majorName ?? ''}</td>
                      {isFirst ? (
                        <td rowSpan={PROFESSION_ROWS} className={styles.adjustCell}>
                          <div className={item.acceptAdjust ? styles.adjustHit : undefined}>
                            {item.acceptAdjust ? <strong><u>是</u></strong> : '是'}
                          </div>
                          <div className={!item.acceptAdjust ? styles.adjustHit : undefined}>
                            {!item.acceptAdjust ? <strong><u>否</u></strong> : '否'}
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
```

注意：
- 用了 `<tbody>` 包裹每个 plan item（每个志愿一组），更适合 print 的分页（CSS 可以设 `page-break-inside: avoid`）
- HTML 规则上一个 `<table>` 可以有多个 `<tbody>` —— 标准允许
- 外层 `<tbody>`（用来承载 empty 提示）和 itemBlock 是兄弟，没问题
- `getPlanItemMajorSelection` 已存在于 `plan-workbench-utils.ts:363`，直接 import 复用

- [ ] **Step 2: 验证 import 路径**

确认 `import` 路径 `'../generate/[studentId]/plan-workbench-utils'` 在 `components/` 下生效。如果 `tsconfig` 用了 `@/` 别名，也可改成 `'@/app/(teacher)/teacher/plans/generate/[studentId]/plan-workbench-utils'`。先按相对路径，跑 typecheck 验证。

---

## Task 2: 新建 `PlanPreparationTable.module.css`

**Files:**
- Create: `apps/web/src/app/(teacher)/teacher/plans/components/PlanPreparationTable.module.css`

- [ ] **Step 1: 写完整样式文件**

```css
.root {
  background: #fff;
  color: #222;
  font-family: var(--page-font-serif, "Microsoft YaHei"), serif;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  gap: 12px;
  flex-wrap: wrap;
}

.title {
  display: flex;
  align-items: baseline;
  gap: 12px;
  flex-wrap: wrap;
}

.title strong {
  font-size: 18px;
  color: #1f1f1f;
}

.title span {
  font-size: 16px;
  color: #1f1f1f;
}

.title em {
  font-style: normal;
  font-size: 13px;
  color: #666;
}

.printBtn {
  flex: 0 0 auto;
}

.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  table-layout: fixed;
}

.table th,
.table td {
  border: 1px solid #999;
  padding: 6px 8px;
  text-align: left;
  vertical-align: middle;
  word-break: break-all;
}

.table thead th {
  background: #e8e8e8;
  text-align: center;
  font-weight: 600;
}

.colSeq { width: 88px; text-align: center; }
.colSchool { width: 22%; }
.colGroup { width: 76px; text-align: center; }
.colMajor { /* 占用剩余宽度 */ }
.colAdjust { width: 108px; text-align: center; }

.seqCell {
  text-align: center;
  font-size: 12px;
  line-height: 1.4;
}

.seqNum {
  font-size: 18px;
  font-weight: 600;
  margin: 4px 0;
}

.schoolCell {
  font-size: 13px;
}

.groupCell {
  text-align: center;
  font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
}

.majorIdx {
  width: 36px;
  text-align: center;
  color: #888;
}

.majorCode {
  width: 60px;
  text-align: center;
  font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
}

.majorName {
  font-size: 13px;
}

.adjustCell {
  text-align: center;
  line-height: 1.8;
}

.adjustHit {
  font-weight: 700;
}

.empty {
  text-align: center;
  color: #999;
  padding: 36px 0;
}

.itemBlock {
  /* 在打印时尽量避免一个志愿组被分到两页 */
  page-break-inside: avoid;
  break-inside: avoid;
}

/* ===== 打印样式 ===== */
@media print {
  @page {
    size: A4;
    margin: 12mm;
  }

  /* 隐藏页面除 data-print-root 之外的一切 */
  :global(body) * {
    visibility: hidden !important;
  }

  :global([data-print-root]),
  :global([data-print-root]) * {
    visibility: visible !important;
  }

  :global([data-print-root]) {
    position: absolute !important;
    inset: 0 !important;
    padding: 0 !important;
    margin: 0 !important;
    background: #fff !important;
  }

  /* 打印时隐藏按钮 */
  .printBtn {
    display: none !important;
  }

  /* 表格在打印时可以分页 */
  .table {
    page-break-inside: auto;
  }
}
```

注意：
- `:global()` 包住 `body` 和 `[data-print-root]` 选择器是因为 CSS Module 默认会对类名加 hash 前缀，但 `body` 和属性选择器不能被改名。`:global()` 显式跳过 scoping
- `visibility: hidden` 比 `display: none` 在打印更稳定（不会重排，保留 layout）

---

## Task 3: 修改 `page.tsx` 引入新 Card

**Files:**
- Modify: `apps/web/src/app/(teacher)/teacher/plans/[id]/page.tsx`

- [ ] **Step 1: 加 import**

在文件顶部 import 区（约第 12 行后），加：

```tsx
import PlanPreparationTable from '../components/PlanPreparationTable';
```

- [ ] **Step 2: 在"志愿明细" Card 之后插入新 Card**

定位 `page.tsx` 中 `<Card title="志愿明细" ...>...</Card>` 这个块（约第 234-256 行）。在它的**结束标签 `</Card>` 之后**、`<Card title="审核与确认记录" ...>` 之前，插入：

```tsx
      <Card
        title="志愿填报预案一览表"
        className="rounded-2xl shadow-card"
      >
        <PlanPreparationTable plan={plan} items={items} />
      </Card>
```

注意：
- `data-print-root` 属性在 `PlanPreparationTable` 组件内部的根 div 已经加了，外层 `<Card>` 不需要加
- 不传额外 props，组件内部自己取数据
- 不动现有"志愿明细" Card

---

## Task 4: TypeScript + 单元测试验证

- [ ] **Step 1: TypeScript 类型检查**

```bash
cd apps/web && pnpm exec tsc --noEmit
```

预期：无 error。

可能的 error：
- 如果 `PlanItem` 类型严格，`item: any` 会触发 implicit any warning。组件 props 已显式标 `any`，应该不会触发严格检查
- 如果 `getPlanItemMajorSelection` 期望的入参类型与 `item: any` 不兼容，可能要在组件里 cast：`getPlanItemMajorSelection(item as PlanItemMajorSelectionLike)`，并 import `PlanItemMajorSelectionLike` 类型

如果有 error，按 error 信息修正后重跑。

- [ ] **Step 2: 跑 plan-workbench-utils 单元测试（确保未破坏复用函数）**

```bash
cd apps/web && pnpm test plan-workbench-utils
```

预期：21/21 pass。

- [ ] **Step 3: 跑 lint（可选）**

```bash
cd apps/web && pnpm lint 2>&1 | tail -30
```

如果有针对新文件的 ESLint error，修正。可以容忍 warning。

---

## Task 5: 提交三个改动

- [ ] **Step 1: git status 确认**

```bash
git status --short
```

预期看到 3 个改动（2 新建 + 1 修改）：
- `?? apps/web/src/app/(teacher)/teacher/plans/components/PlanPreparationTable.tsx`
- `?? apps/web/src/app/(teacher)/teacher/plans/components/PlanPreparationTable.module.css`
- ` M apps/web/src/app/(teacher)/teacher/plans/[id]/page.tsx`

如果有其他无关 modified 文件，**不要 add 它们**。

- [ ] **Step 2: commit**

```bash
git add "apps/web/src/app/(teacher)/teacher/plans/components/PlanPreparationTable.tsx" "apps/web/src/app/(teacher)/teacher/plans/components/PlanPreparationTable.module.css" "apps/web/src/app/(teacher)/teacher/plans/[id]/page.tsx"
git commit -m "feat(plan-detail): add preparation table for printing"
```

不 push。

---

## Task 6: 部署 + 浏览器实测

- [ ] **Step 1: 部署**

```bash
cd C:/Users/Administrator/Documents/VolunteerHelper && python deploy_auto.py
```

预期：exit code 0，pm2 vh-web 重启。耗时 3-5 分钟。

- [ ] **Step 2: 实测渲染**

用 chrome-devtools MCP 打开 `http://132.232.245.53:3004/teacher/plans/12`（用户已登录态）。

验证清单：
- [ ] "志愿明细" Card 仍然存在且功能完好（点行展开还在）
- [ ] 下方出现"志愿填报预案一览表" Card
- [ ] 表头：序号 / 院校 / 专业组 / 专业 / 是否服从专业调剂
- [ ] 每个志愿一组（一个 plan item），序号列 3 行（批次名 / 数字 / "平行志愿"）
- [ ] 院校列：`院校代码 + 空格 + 院校名`
- [ ] 专业列：6 行，按 `selectedMajors[]` 渲染 `序号 / 代码 / 名称`，不足留空
- [ ] 是否服从调剂：两行"是 / 否"，选中那个加粗下划线
- [ ] 右上角"打印预案表"按钮存在
- [ ] 抬头："{学生姓名} 志愿填报预案一览表 ｜ {分} 分 / 第 {位次} 位"

- [ ] **Step 3: 测试打印**

点"打印预案表"按钮，浏览器弹出打印预览（或调用 chrome-devtools 的 `evaluate_script` 触发 `window.print()` 然后用 take_screenshot 看预览效果——实际上 puppeteer 的 page.pdf 可以模拟）。

更稳的验证：用 chrome-devtools MCP 的 `emulate` 或 `evaluate_script` 模拟 print media：

```javascript
() => {
  // 模拟 print media，看打印样式是否生效
  const sheet = [...document.styleSheets].find(s => {
    try { return s.cssRules; } catch { return false; }
  });
  // 直接看 data-print-root 是否能正确 isolate
  return {
    rootExists: !!document.querySelector('[data-print-root]'),
    rootClass: document.querySelector('[data-print-root]')?.className,
  };
}
```

或直接调用 `mcp__chrome-devtools__emulate` 设置 `media: 'print'`（如果该工具支持），然后 take_screenshot。

如果 emulate 不支持 media，**让用户手动 Ctrl+P 验证**——这是 happy path 检查项，留给用户人工测。

- [ ] **Step 4: 边界情况**

- 找一个 `selectedMajors` 不足 6 个的志愿项（或 0 个），确认空行留位、布局不塌
- 找一个 `acceptAdjust = false` 的志愿（如果有），确认"否"被加粗
- 找一个 `groupCode` 为空的志愿，确认显示 `-`

---

## Task 7: 推送 + 收尾

- [ ] **Step 1: 推送 master**

```bash
git push origin master
```

- [ ] **Step 2: 总结产出报告**

提供：
- commit hash + 文件列表
- typecheck/test 结果
- 浏览器验证 PASS/FAIL 清单
- 已知边界情况（如学生分数/位次字段缺失时的 fallback 表现）

---

## 自检核对

**1. Spec 覆盖**
- [x] "另加一个预案表 Card"（保留现有志愿明细） → Task 3
- [x] "空行占位 6 行" → 组件 `Array.from({ length: 6 }).map(...)`
- [x] "可直接打印" → @media print + 打印按钮
- [x] "序号列批次名动态" → `plan.batchName ?? '本科批'`
- [x] "仅展示，不可编辑" → 纯展示组件，无 onChange
- [x] "只打印预案表" → `body * { visibility: hidden }` + `[data-print-root] *` visible
- [x] "抬头：表名 + 学生姓名 + 分/位次" → toolbar.title 渲染
- [x] "打印按钮 Card 右上角" → toolbar 内 flex 右对齐
- [x] "先用现有 universityCode 字段" → `item.universityCode ?? ''`

**2. 不破坏现有功能**
- 不动 PlanExportService 与 plan-export.html
- 不动现有"志愿明细" antd Table（包括 expandedRowRender）
- 不动 plan-workbench-utils.ts（只 import 不修改）

**3. 类型一致性**
- `PlanPreparationTableProps` 用 `any` 是务实选择，因为 page.tsx 内 `plan` 也是 `Record<string, any>`
- 如果 codex 想精确类型，可以引入 `PlanItemMajorSelectionLike`，但不强求

---

## 风险与降级

| 风险 | 概率 | 降级 |
|---|---|---|
| `getPlanItemMajorSelection` 返回的 `selectedMajors` 为空（旧方案没保存完整专业排序） | 中 | 组件已经处理：6 行专业一律渲染，缺失留空 |
| `universityCode` 字段在数据库里为 null | 低 | `buildUniversityCell` 函数已 fallback 到只显示名称 |
| `plan.student.totalScore` 等字段后端没返回 | 中 | 抬头显示 `- 分 / 位次 -`，可后续在 page.tsx 多发一个 `studentApi.getById` 请求补全 |
| @media print 在某些浏览器不打印 `<table>` 边框 | 低 | 已用 `border: 1px solid #999` 显式定义 |
| 打印时表格分页割开一个志愿组 | 中 | `.itemBlock { page-break-inside: avoid; }` 已加 |
| CSS Module 的 `:global()` 写法在项目 webpack 配置下不被支持 | 低 | 备用方案：把 `@media print` 这段 CSS 抽出来写到 `apps/web/src/app/(teacher)/teacher/plans/[id]/print.css`（普通 CSS 文件），在 page.tsx 用 `import './print.css'` 引入 |

---

## 交付给 codex 的执行口令模板

如果 codex 是单轮接收任务，给它：

```
请按 docs/superpowers/plans/2026-05-14-plan-preparation-table.md 的 Task 1-7 顺序执行。
- Task 1-3 是代码改动
- Task 4 类型检查 + 测试
- Task 5 commit
- Task 6 部署（要跑 python deploy_auto.py，耗时几分钟）+ chrome-devtools 实测
- Task 7 push + 收尾

每个 Task 完成后简短报告，不需要等我确认。但如果 Task 4 的 typecheck 失败、Task 6 的浏览器实测失败，停下来等我决定。
```
