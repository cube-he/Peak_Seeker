# 教师工作台「左栏 + 生成页右栏」可折叠 设计

**日期**: 2026-06-22
**关联**: 教师全局布局 (teacher)/layout.tsx / 生成页 plan-candidate page.tsx / willnest-teacher.css
**触发**: 老师反馈生成页挑院校专业时,左侧导航栏和右侧「当前方案/方案体检」面板占了横向空间。希望两块都能折叠/展开,把中间候选池区域腾大;需要时再拉出来。

## 一、问题与目标

### 当前痛点
- 左栏导航固定 260px(`layout.tsx` Tailwind `<aside w-[260px] fixed>` + 主区 `ml-[260px]`),所有老师页常驻。
- 生成页右栏 `.pgv2-rail`(当前方案/方案体检/志愿列表)固定 380px(`.pgv2-workbench` grid `1fr 380px`)。
- 老师在生成页挑院校专业组时,中间候选池被两侧挤窄,横向信息(8 列专业行、近 3 年录取、位次尺)展示局促。

### 目标
1. **左栏**可折叠成「只剩图标的细条」(icon-rail):图标仍可点击跳转,hover 出名称 tooltip;再点展开回完整。全局生效(所有老师页)。
2. **生成页右栏**可**完全收起**:收起后候选池吃满整行;屏幕右边缘留一个「当前方案」把手,点一下拉回。仅生成页。
3. 两个开关**各自独立、记住状态**(localStorage,跨页/跨刷新保持);**默认展开 = 现状,零回归**。

### 非目标(YAGNI)
- 不做移动端折叠:左栏手机端维持现有抽屉(overlay),右栏 ≤1280px 本就堆叠到下方 —— 折叠只在桌面(lg / 宽屏)生效。
- 不做「点+加入时右栏自动弹出」(本期不加,保持简单)。
- 不碰折叠的**纯视觉打磨**(箭头/把手具体造型、动画曲线、tooltip 外观、收起态配色)—— 只做功能骨架 + 合理默认,视觉交 claude-design(见 [[feedback_frontend_styling]])。
- 不复用 WillNest CSS 里那套未接线的 `.app[data-sidebar=collapsed]`(真实左栏是 Tailwind 重写,不走 `.app` grid)。

## 二、设计

### 2.1 共用持久化 Hook(唯一真逻辑,可测)
新建 `apps/web/src/hooks/usePersistentCollapse.ts`:
```ts
// 返回 [collapsed, toggle, setCollapsed]; 状态持久化到 localStorage。
// SSR 安全: 首次渲染恒为 defaultCollapsed(服务端/客户端一致), mount 后再从
// localStorage 同步, 避免 hydration mismatch。
function usePersistentCollapse(storageKey: string, defaultCollapsed = false):
  [boolean, () => void, (v: boolean) => void]
```
- 初始 `useState(defaultCollapsed)`;`useEffect` 内读 `localStorage.getItem(storageKey)`(`'1'`/`'0'`)回填。
- `toggle`/`setCollapsed` 改 state 时写回 localStorage。
- 读写都 `typeof window !== 'undefined'` 兜底。

左栏与右栏都用它,key 不同:
- 左栏:`'vh.teacher.navCollapsed'`
- 右栏:`'vh.teacher.generate.railCollapsed'`

### 2.2 左栏 → icon-rail(`(teacher)/layout.tsx`,Tailwind/React)
- `const [navCollapsed, toggleNav] = usePersistentCollapse('vh.teacher.navCollapsed')`。
- 桌面 aside:`w-[260px]` ↔ `w-[64px]`;主内容 wrapper `lg:ml-[260px]` ↔ `lg:ml-[64px]`(按 `navCollapsed` 切类)。
- 折叠态:nav 每项**只渲染图标**(隐藏 `item.label` 文本)、图标居中;隐藏分组标题(工作台/沟通/浏览)与分隔线;Brand 收成 logo(隐藏文字);底部「帮助支持/退出登录」只剩图标。
- 折叠态每个图标项包 antd `Tooltip`(placement `right`)显示原 label,保证可识别。
- **折叠开关按钮**:侧栏底部加一个 toggle 按钮,图标用 antd `MenuFoldOutlined`/`MenuUnfoldOutlined`(按状态切),点击 `toggleNav`。位置/造型属视觉,claude-design 可调,功能上放底部即可。
- 移动端 overlay(`sidebarOpen`)逻辑不变;`navCollapsed` 只作用于 `lg:` 桌面 aside。

### 2.3 生成页右栏 → 完全收起(`page.tsx` + `willnest-teacher.css`)
- `const [railCollapsed, toggleRail] = usePersistentCollapse('vh.teacher.generate.railCollapsed')`。
- `.pgv2-workbench` 容器按 `railCollapsed` 加类 `is-rail-collapsed`。
- `railCollapsed` 时:**不渲染** `<aside className="pgv2-rail">`(或 CSS 隐藏),改渲染一个右边缘把手 `<button className="pgv2-rail-reopen">`(竖向「当前方案 ‹」),点击 `toggleRail` 展开。
- 展开态:在 `.pgv2-rail-card` 头部(「当前方案」标题行)加一个折叠箭头按钮,点击 `toggleRail` 收起。
- CSS(追加到 `willnest-teacher.css` 末尾,**自带 `.wn-teacher-scope` 前缀**,因 scope 脚本是一次性工具不再跑):
  ```css
  .wn-teacher-scope .pgv2-workbench.is-rail-collapsed { grid-template-columns: 1fr; }
  .wn-teacher-scope .pgv2-rail-reopen { /* fixed 右边缘竖向把手, 功能定位; 视觉交 claude-design */ }
  ```
- ≤1280px 单列态:右栏本就堆叠在下方,折叠按钮可隐藏或无害(主要服务宽屏)。

### 2.4 功能 vs 视觉边界
- **本任务(功能)**:hook + 持久化、两处 state 接线、条件类/条件渲染、grid 收窄、icon-only、reopen 把手的存在与点击、tooltip 接入。
- **claude-design(视觉)**:箭头/把手造型、过渡动画、tooltip 与收起态的精细配色/间距。

## 三、测试
- **Hook 单测**(`usePersistentCollapse.spec.tsx`,唯一真逻辑):默认值、toggle 翻转、写入 localStorage、从 localStorage 回填、无 window 不炸。用 @testing-library/react 的 `renderHook`(计划阶段先确认 web 测试栈是否就绪;不就绪则退化为把 localStorage 读写抽成纯函数 `readCollapsed/writeCollapsed` 测纯函数)。
- **视觉/交互**:折叠后布局回流、icon-rail、把手拉回、状态记住 —— 属布局,**人工在跑起来的 app 里验证**(诚实记录:这部分不写脆弱的 DOM 断言)。

## 四、风险 / 回归点
- **零回归**:默认展开 = 现状;`usePersistentCollapse` 默认 `false`,不传/无 localStorage 时与现在一致。
- **Hydration**:localStorage 必须 mount 后读(首屏恒 default),否则 SSR 与客户端不一致报 hydration error —— hook 设计已规避。
- **左栏主区 margin 同步**:aside 宽度与主区 `ml` 必须成对切,否则留白错位。
- **右栏 sticky**:`.pgv2-rail` 现为 `position: sticky`;收起时整块不渲染,无 sticky 残留。
