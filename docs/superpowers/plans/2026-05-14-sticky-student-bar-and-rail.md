# 生成方案工作台 学生信息双层条 + 右侧 rail 常驻 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 `/teacher/plans/generate/[studentId]` 页面在下滑时保留学生关键信息（顶部双层条）与已选专业组 rail（右侧），方便老师比对学生情况筛选候选。

**Architecture:**
- 第一步定位 sticky 失效根因（`.stickyStudentBar` 与 `.rail` 都已写 `position: sticky` 但实际失效），在浏览器里查祖先链 `overflow / transform / contain / filter / will-change`，最小侵入地修。
- 第二步把现有 `.stickyStudentBar` 一行结构改为「永显第一层 + 可折叠第二层」，展开状态用 `localStorage` 持久化。
- 第三步调整 rail 的 sticky `top` 偏移、加内部独立滚动，处理 rail 高度超出视口的情况。
- 不动 `globals.css` 的全局规则，所有修复局限在本页 `page.tsx` 与 `candidate-pool-polished.module.css`。

**Tech Stack:** React 18 + Next.js (App Router) + TypeScript + CSS Modules + Ant Design 5 + Chrome DevTools MCP（验证）。

**Out of scope:**
- 不动 `globals.css`、`MainLayout.tsx`、`teacher/layout.tsx`。
- 不重写 `compactHeader` 顶部学生信息大区（保留作为入口概览）。
- 不动 `plan-workbench-utils.ts` 及其单元测试。

---

## File Structure

| 路径 | 操作 | 责任 |
|---|---|---|
| `apps/web/src/app/(teacher)/teacher/plans/generate/[studentId]/page.tsx` | 修改 | sticky bar 改造为双层 + 展开 state；rail 容器结构调整 |
| `apps/web/src/app/(teacher)/teacher/plans/generate/[studentId]/candidate-pool-polished.module.css` | 修改 | 修复 sticky 失效根因；新增第二层 + 折叠样式；rail 高度策略 |

只改两个文件，全部局部，方便回滚。

---

## Task 1: 启动 dev server 并定位 sticky 失效根因

**Files:**
- 仅读：`apps/web/src/app/(teacher)/teacher/layout.tsx`
- 仅读：`apps/web/src/app/globals.css`
- 仅读：`apps/web/src/app/(teacher)/teacher/plans/generate/[studentId]/page.tsx`

- [ ] **Step 1: 启动 web dev server（后台）**

Run（在仓库根）:
```bash
cd apps/web && pnpm dev
```

Expected: 控制台输出 `▲ Next.js ... Local: http://localhost:3000`（或 3001）。记下端口号。

如果用户已经把 dev server 跑在生产域名 `http://132.232.245.53:3004`，直接用它，跳过本步。

- [ ] **Step 2: 用 chrome-devtools MCP 打开页面并登录**

调用 `mcp__chrome-devtools__new_page` 打开 `http://132.232.245.53:3004/teacher/plans/generate/1`（或本地 dev url），登录账号后回到这个 URL。

- [ ] **Step 3: 用 evaluate_script 查祖先链的 sticky 杀手**

调用 `mcp__chrome-devtools__evaluate_script`，注入：

```javascript
() => {
  const el = document.querySelector('[class*="stickyStudentBar"]');
  if (!el) return { error: '找不到 stickyStudentBar' };
  const chain = [];
  let node = el.parentElement;
  while (node && node !== document.documentElement) {
    const cs = getComputedStyle(node);
    chain.push({
      tag: node.tagName,
      cls: node.className?.toString().slice(0, 80),
      overflow: cs.overflow,
      overflowX: cs.overflowX,
      overflowY: cs.overflowY,
      transform: cs.transform === 'none' ? '' : cs.transform,
      contain: cs.contain,
      filter: cs.filter === 'none' ? '' : cs.filter,
      willChange: cs.willChange === 'auto' ? '' : cs.willChange,
      height: cs.height,
      minHeight: cs.minHeight,
    });
    node = node.parentElement;
  }
  // html / body
  chain.push({
    tag: 'BODY',
    cls: '',
    overflow: getComputedStyle(document.body).overflow,
    overflowX: getComputedStyle(document.body).overflowX,
    overflowY: getComputedStyle(document.body).overflowY,
  });
  chain.push({
    tag: 'HTML',
    cls: '',
    overflow: getComputedStyle(document.documentElement).overflow,
    overflowX: getComputedStyle(document.documentElement).overflowX,
    overflowY: getComputedStyle(document.documentElement).overflowY,
  });
  return chain;
}
```

Expected: 看到祖先链每一层的 overflow/transform/contain。**标记任何祖先有以下任一值的层级**：
- `overflow: hidden|auto|scroll`（任一方向）
- `transform: 非 none`
- `contain: paint|layout|content|strict`
- `filter: 非 none`
- `will-change: transform`

任意一个会让该祖先变成 sticky 的"滚动容器"，导致 `top: 56px` 不再相对视口。

- [ ] **Step 4: 同样查 `.rail` 的祖先链**

把脚本里的 `'[class*="stickyStudentBar"]'` 换成 `'[class*="rail"]'`，重跑一次。Expected：两个元素应共享大部分祖先链，问题层级应一致。

- [ ] **Step 5: 实际滚动验证当前行为**

调用 `mcp__chrome-devtools__evaluate_script`：

```javascript
() => {
  window.scrollTo(0, 600);
  const sticky = document.querySelector('[class*="stickyStudentBar"]');
  const rail = document.querySelector('[class*="rail"]');
  return {
    stickyRect: sticky?.getBoundingClientRect(),
    railRect: rail?.getBoundingClientRect(),
    scrollY: window.scrollY,
    innerHeight: window.innerHeight,
  };
}
```

Expected:
- 如果 sticky 工作正常：`stickyRect.top ≈ 56`（teacher header 高度）
- 如果失效：`stickyRect.top` 为负数（被滚出视口）

记下 sticky 失效的具体表现，写入下面 Step 6 的笔记。

- [ ] **Step 6: 记录根因分析**

在终端输出（不要写进代码）一段总结：
```
sticky 失效根因：<具体祖先层 className>: <破坏属性 e.g. overflow: hidden>
影响元素：stickyStudentBar, rail
修复策略：<方案 A 或 B>
```

候选修复策略（按侵入度排序，优先选 A）：
- **A**：如果根因是 `globals.css` 的 `html,body { overflow-x: hidden }`，本页用 `:global(html) { overflow-x: visible; }` 或在 `.page` 加 `isolation: isolate` 都无效——这种情况只能改 globals.css 加 `overflow-x: clip` 替代 `hidden`（`clip` 不创建滚动容器）。
- **B**：如果根因在 teacher layout 的 `<main>` / `<div className="flex-1 ...">`，在 `.page` 上加局部样式无法跨越；改用 `position: fixed` 替代 sticky。
- **C**：如果根因是 `min-h-[calc(100vh-56px)]` + flex 上下文异常，给 sticky 元素加 `top: 0; align-self: start;` 之类微调。

**不提交代码**，本任务只产出诊断结论。

---

## Task 2: 修复 sticky 失效根因

**Files:**
- Modify: `apps/web/src/app/globals.css`（仅当 Task 1 确认根因是 `overflow-x: hidden`；否则不改）
- Modify: `apps/web/src/app/(teacher)/teacher/plans/generate/[studentId]/candidate-pool-polished.module.css`

- [ ] **Step 1: 应用根因修复**

按 Task 1 Step 6 的策略：

**如果策略 A（globals.css 是元凶）**：
打开 `apps/web/src/app/globals.css:8`，把 `overflow-x: hidden;` 改为 `overflow-x: clip;`：

```css
html, body {
  margin: 0;
  overflow-x: clip;  /* 原 hidden 会创建滚动容器破坏 sticky */
  width: 100%;
}
```

`clip` 与 `hidden` 视觉效果一致但不创建滚动容器，sticky 不再被影响。仅 Chrome 90+、Firefox 81+、Safari 16+ 支持，对项目目标浏览器（教师 PC 端 Chrome）足够。

**如果策略 B（fixed 替代）**：
跳过本步骤，去 Task 5 改用 `position: fixed` 实现。

**如果策略 C 或其他**：
按 Task 1 诊断结论实施最小改动。

- [ ] **Step 2: 浏览器实测修复是否生效**

调用 `mcp__chrome-devtools__navigate_page` 类型 `reload`，然后跑 Task 1 Step 5 的 evaluate_script。

Expected: `stickyRect.top ≈ 56`，`railRect.top ≈ 82`（rail 比 sticky bar 再低）。

- [ ] **Step 3: 验证未破坏其他页面**

reload 几个其他页面，目测无横向滚动条出现：
- `/teacher/dashboard`
- `/teacher/students`
- `/`（首页）

调用 `mcp__chrome-devtools__evaluate_script`：
```javascript
() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth })
```
Expected: `scrollWidth === clientWidth`（无横向溢出）。

- [ ] **Step 4: 提交**

```bash
git add apps/web/src/app/globals.css apps/web/src/app/(teacher)/teacher/plans/generate/[studentId]/candidate-pool-polished.module.css
git commit -m "fix(web): 用 overflow-x: clip 替代 hidden 让页面内 sticky 元素生效"
```

提交信息按实际改动调整：如果没改 globals 改了 module.css，描述要对应；如果两个都没改（策略 B），跳过本提交。

---

## Task 3: 改造 sticky bar 为双层结构（第一层永显）

**Files:**
- Modify: `apps/web/src/app/(teacher)/teacher/plans/generate/[studentId]/page.tsx`（第 1195-1209 行）
- Modify: `apps/web/src/app/(teacher)/teacher/plans/generate/[studentId]/candidate-pool-polished.module.css`（第 241-302 行附近）

- [ ] **Step 1: 在 `GeneratePlanPage` 函数顶部添加展开 state + localStorage**

打开 `page.tsx`，找到 `useState` 集中区（第 683-690 行附近），在 `const [activeDetail, ...]` 之后插入：

```tsx
const STICKY_BAR_STORAGE_KEY = 'plan-workbench:student-bar-expanded';
const [stickyBarExpanded, setStickyBarExpanded] = useState<boolean>(() => {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(STICKY_BAR_STORAGE_KEY) === '1';
});

useEffect(() => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STICKY_BAR_STORAGE_KEY, stickyBarExpanded ? '1' : '0');
}, [stickyBarExpanded]);
```

注意：`STICKY_BAR_STORAGE_KEY` 常量应放在文件顶层（与其他 const 同级，第 248 行附近 `const GRADIENT_LABEL` 之前），不放在函数内。改写为：

文件顶层（第 247 行 `type RankRiskEligibility` 后）插入：
```tsx
const STICKY_BAR_STORAGE_KEY = 'plan-workbench:student-bar-expanded';
```

函数内（`useState` 区域第 690 行 `const candidatePageSize = 12;` 之前）插入：
```tsx
const [stickyBarExpanded, setStickyBarExpanded] = useState<boolean>(() => {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(STICKY_BAR_STORAGE_KEY) === '1';
});
```

useEffect 区域（第 802 行 `setCandidatePage(1);` 那个 useEffect 之后）插入：
```tsx
useEffect(() => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STICKY_BAR_STORAGE_KEY, stickyBarExpanded ? '1' : '0');
}, [stickyBarExpanded]);
```

- [ ] **Step 2: 重写 sticky bar JSX 结构**

定位 `page.tsx` 第 1195-1209 行的 `<div className={styles.stickyStudentBar} ...>`，整段替换为：

```tsx
<div className={styles.stickyStudentBar} aria-label="学生关键信息常驻摘要">
  <div className={styles.stickyBarPrimary}>
    <div className={styles.stickyStudentIdentity}>
      <strong>{getStudentName(student)}</strong>
      <span>{selectedBatchName} · {plan ? `方案 ${plan.versionNo ? `V${plan.versionNo}` : ''} ${plan.status ?? '-'}` : '未打开方案'}</span>
    </div>
    <div className={styles.stickyStudentFacts}>
      <span><b>总分</b>{formatScoreValue(student?.totalScore)}</span>
      <span><b>位次</b>{formatRankValue(studentRankForDecision)}</span>
      <span><b>选科</b>{subjectCombination}</span>
    </div>
    <button
      type="button"
      className={styles.stickyBarToggle}
      aria-expanded={stickyBarExpanded}
      aria-controls="sticky-bar-secondary"
      onClick={() => setStickyBarExpanded((prev) => !prev)}
    >
      {stickyBarExpanded ? '收起' : '展开'}
      <DownOutlined rotate={stickyBarExpanded ? 180 : 0} />
    </button>
  </div>
  {stickyBarExpanded ? (
    <div className={styles.stickyBarSecondary} id="sticky-bar-secondary">
      <span><b>优势</b>{stickyStrengthSummary}</span>
      <span><b>短板</b>{stickyWeaknessSummary}</span>
      <span><b>意向</b>{preferredLocationSummary} / {preferredMajorSummary}</span>
      <span><b>排除</b>{excludedSummary}</span>
      <span><b>接受边界</b>{riskPreferenceTags.length ? riskPreferenceTags.join('、') : '未填写'}</span>
    </div>
  ) : null}
</div>
```

注意：`DownOutlined` 已经在文件顶部 import（第 27 行），不需要新增 import。

- [ ] **Step 3: 添加配套 CSS 样式**

打开 `candidate-pool-polished.module.css`，定位 `.stickyStudentBar` 块（第 241 行）。**整段替换** 第 241-302 行（`.stickyStudentBar` + `.stickyStudentIdentity` + `.stickyStudentFacts` 那一组）为：

```css
.stickyStudentBar {
  position: sticky;
  top: 56px;
  z-index: 35;
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
  border: 1px solid rgba(232, 230, 220, 0.9);
  border-radius: 10px;
  background: rgba(250, 249, 245, 0.94);
  box-shadow: 0 10px 26px rgba(26, 26, 25, 0.08);
  padding: 9px 12px;
  backdrop-filter: blur(14px);
}

.stickyBarPrimary {
  display: grid;
  grid-template-columns: minmax(180px, auto) minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
}

.stickyStudentIdentity {
  min-width: 0;
}

.stickyStudentIdentity strong {
  display: block;
  overflow: hidden;
  color: var(--text);
  font-family: var(--page-font-serif);
  font-size: 16px;
  line-height: 1.15;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stickyStudentIdentity span {
  display: block;
  margin-top: 3px;
  overflow: hidden;
  color: var(--t3);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stickyStudentFacts {
  display: flex;
  align-items: stretch;
  gap: 6px;
  min-width: 0;
  overflow-x: auto;
  padding-bottom: 1px;
}

.stickyStudentFacts span {
  min-width: max-content;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  background: #fff;
  padding: 6px 9px;
  color: var(--text);
  font-size: 12px;
  line-height: 1.25;
  white-space: nowrap;
}

.stickyStudentFacts b {
  display: block;
  color: var(--t4);
  font-size: 10px;
  letter-spacing: 0.8px;
  text-transform: uppercase;
  margin-bottom: 2px;
}

.stickyBarToggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  background: #fff;
  padding: 6px 10px;
  color: var(--text);
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s ease, color 0.15s ease;
}

.stickyBarToggle:hover {
  background: var(--surface-dim);
  color: var(--primary);
}

.stickyBarSecondary {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding-top: 6px;
  border-top: 1px dashed var(--border-subtle);
}

.stickyBarSecondary span {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  background: #fff;
  padding: 6px 9px;
  color: var(--text);
  font-size: 12px;
  line-height: 1.25;
}

.stickyBarSecondary b {
  color: var(--t4);
  font-size: 10px;
  letter-spacing: 0.8px;
  text-transform: uppercase;
}
```

**保留** `.stickyStudentBar` 内原有的 `.stickyStudentBar b { display: block; ... }` 已经迁移到 `.stickyStudentFacts b`，不需要重复。

- [ ] **Step 4: 同步移动端响应式**

定位文件末尾 `@media` 区块（第 1144 行附近）有：
```css
.stickyStudentBar {
  grid-template-columns: 1fr;
}
```

把它替换为：
```css
.stickyBarPrimary {
  grid-template-columns: 1fr auto;
}

.stickyStudentFacts {
  grid-column: 1 / -1;
}
```

- [ ] **Step 5: 浏览器实测**

reload 页面，确认：
- 第一层显示：姓名/批次行 + 总分/位次/选科 + "展开" 按钮
- 点击"展开"按钮：第二层出现 优势/短板/意向/排除/接受边界
- 文字内容: 优势内容 = 原 `stickyStrengthSummary`、短板 = `stickyWeaknessSummary` 等
- 刷新页面：展开状态保持（localStorage 持久化生效）

调用 `mcp__chrome-devtools__take_snapshot` 检查 DOM 结构。

- [ ] **Step 6: 提交**

```bash
git add apps/web/src/app/(teacher)/teacher/plans/generate/[studentId]/page.tsx apps/web/src/app/(teacher)/teacher/plans/generate/[studentId]/candidate-pool-polished.module.css
git commit -m "feat(plan-workbench): sticky 学生条改为可折叠双层结构"
```

---

## Task 4: 调整 rail sticky 偏移与内部独立滚动

**Files:**
- Modify: `apps/web/src/app/(teacher)/teacher/plans/generate/[studentId]/candidate-pool-polished.module.css`

- [ ] **Step 1: 计算 rail 顶部 sticky 偏移**

当前 `.rail { top: 82px; }`（CSS 第 769 行）。新偏移 = teacher header (56) + sticky bar 第一层 (≈48) + 间距 (12) = **116px**。

展开第二层时 sticky bar 总高度增加 ≈50px，rail 仍按收起态对齐第一层，留出展开余地。

- [ ] **Step 2: 改造 `.rail` 与 `.railCard`**

定位 CSS 第 767-776 行（`.rail` + `.railCard`），整段替换为：

```css
.rail {
  position: sticky;
  top: 116px;
  align-self: start;
  display: grid;
  gap: 12px;
  max-height: calc(100vh - 132px);
  overflow-y: auto;
  padding-right: 2px;
}

.rail::-webkit-scrollbar {
  width: 6px;
}

.rail::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.12);
  border-radius: 3px;
}

.rail::-webkit-scrollbar-track {
  background: transparent;
}

.railCard {
  padding: 16px 18px;
}
```

新增点说明：
- `align-self: start`：避免 grid 默认 stretch 把 rail 拉到与左侧 panel 等高，那会让 sticky 永远没有"滚出"触发点
- `max-height: calc(100vh - 132px)`：留出 teacher header(56) + sticky bar(~48) + 上下间距(28) = 132px
- `overflow-y: auto`：rail 内容超过最大高度时内部独立滚动
- 自定义 scrollbar 美化：避免默认丑陋的滚动条破坏视觉

- [ ] **Step 3: 调整 `.selectedList` 内嵌 max-height**

`.selectedList { max-height: 360px; overflow: auto; }`（第 859 行）目前限制已选列表高度，与外层 `.rail` 独立滚动会出现"双滚动条"。把它改为：

```css
.selectedList {
  display: grid;
  gap: 8px;
  padding-right: 2px;
}
```

去掉 `max-height` 和 `overflow`，让 rail 整体作为单一滚动区域。

- [ ] **Step 4: 浏览器实测**

reload 页面，确认：
- 滚动主页面：rail 跟随到 `top: 116px` 后保持位置不动
- rail 内容（已选 + 健康度 + 下一步建议）超过视口时：rail 内部出现垂直滚动条
- 已选列表无内嵌滚动条

调用 `mcp__chrome-devtools__evaluate_script`：
```javascript
() => {
  window.scrollTo(0, 1200);
  const rail = document.querySelector('[class*="rail"]');
  return {
    rect: rail?.getBoundingClientRect(),
    scrollHeight: rail?.scrollHeight,
    clientHeight: rail?.clientHeight,
  };
}
```
Expected: `rect.top ≈ 116`，`scrollHeight >= clientHeight`（如有滚动则 >）。

- [ ] **Step 5: 提交**

```bash
git add apps/web/src/app/(teacher)/teacher/plans/generate/[studentId]/candidate-pool-polished.module.css
git commit -m "feat(plan-workbench): 右侧 rail sticky 偏移修正与内部独立滚动"
```

---

## Task 5: 多视口实测验证

**Files:** 无修改，纯验证。

- [ ] **Step 1: 1920×1080 视口测**

调用 `mcp__chrome-devtools__resize_page` width=1920, height=1080。
reload `http://132.232.245.53:3004/teacher/plans/generate/1`。

测试清单（每条都通过才算 PASS）：
- [ ] 初始加载：sticky 学生条第一层在 teacher header 下方，rail 在右侧
- [ ] 下滑 600px：第一层 `rect.top ≈ 56`，rail `rect.top ≈ 116`
- [ ] 下滑 1200px：第一层和 rail 仍可见
- [ ] 点击"展开"：第二层出现，第一层保持位置不变
- [ ] 滚动时第二层和 rail 一起常驻
- [ ] 刷新页面：展开状态恢复
- [ ] rail 内部滚动条工作（如果 rail 高度超出）

每条用 `mcp__chrome-devtools__take_screenshot` 留证。

- [ ] **Step 2: 1366×768 视口测（中学机房屏）**

调用 `mcp__chrome-devtools__resize_page` width=1366, height=768。
reload 同一页面。

同样测试清单，重点关注：
- [ ] 候选池主区是否还有足够滚动空间（teacher header 56 + sticky 收起 ≈48 + 间距 12 = ~116 occupied，剩 ~652 给主区，够用）
- [ ] 展开第二层后候选池剩余高度（再减 ≈58 = ~594，仍可用）
- [ ] rail 内部滚动是否触发（已选 4+ 项时应触发）

- [ ] **Step 3: 跑现有单元测试确认未破坏**

```bash
cd apps/web && pnpm test plan-workbench-utils
```

Expected: 全部通过。如果失败，回到对应 Task 排查。

- [ ] **Step 4: TypeScript 类型检查**

```bash
cd apps/web && pnpm typecheck
```

Expected: 无 error。

- [ ] **Step 5: 提交验证报告（如有截图）**

如果做了截图，归档到 `docs/superpowers/specs/` 不是计划目标，直接口头报告即可。本步骤不提交。

---

## Task 6: 收尾

- [ ] **Step 1: 检查 git status 干净**

```bash
git status
```

Expected: `working tree clean`（除了用户已有的、与本次任务无关的 modified 文件）。

- [ ] **Step 2: 用 superpowers:finishing-a-development-branch skill 决定后续动作**

调用 `Skill` 工具，skill name 为 `superpowers:finishing-a-development-branch`，由它引导决定是否合并/PR/留分支。

---

## 自检核对

**1. Spec 覆盖：**
- [x] sticky 失效排查 → Task 1
- [x] sticky 修复（不动 globals 全局，必要时局部改） → Task 2
- [x] sticky bar 第一层（5 字段：姓名、总分、位次、选科、批次/方案 + 展开按钮） → Task 3 Step 2
- [x] sticky bar 第二层（优势、短板、意向、排除、接受边界） → Task 3 Step 2
- [x] localStorage 持久化 → Task 3 Step 1
- [x] rail sticky 偏移修正 → Task 4 Step 2
- [x] rail 内部独立滚动 → Task 4 Step 2-3
- [x] 保留 compactHeader 入口区（未触碰） → 隐含
- [x] rail 宽度 336px 不变 → workbench grid-template-columns 未改动
- [x] 1366×768 + 1920×1080 视口验证 → Task 5
- [x] 不破坏 plan-workbench-utils 测试 → Task 5 Step 3

**2. 占位符扫描：** 无 TBD / TODO / "fill in details"。所有代码块都包含完整实现。

**3. 类型一致性：** `stickyBarExpanded` / `setStickyBarExpanded` / `STICKY_BAR_STORAGE_KEY` 命名在 Task 3 各 Step 一致；CSS 类名 `.stickyBarPrimary` / `.stickyBarSecondary` / `.stickyBarToggle` 与 JSX `className={styles.stickyBarPrimary}` 等对应一致。

---

## 风险与降级

| 风险 | 概率 | 影响 | 降级 |
|---|---|---|---|
| Task 1 诊断后发现根因在 teacher layout，无法局部修 | 中 | sticky bar 完全失效，task 流程受阻 | 改用 `position: fixed` + 手动算偏移（Task 2 策略 B） |
| `overflow-x: clip` 在某些旧版 Edge 表现异常 | 低 | 个别浏览器横向溢出 | fallback：保留 `hidden` 但在 `.page` 上加 `overflow-clip-margin` |
| rail 内容 + max-height 撑不开时滚动条闪烁 | 低 | 视觉抖动 | `scrollbar-gutter: stable` 兜底 |
| localStorage 写入失败（隐私模式） | 极低 | 展开状态不持久 | try/catch 包裹 setItem，失败时静默 |

