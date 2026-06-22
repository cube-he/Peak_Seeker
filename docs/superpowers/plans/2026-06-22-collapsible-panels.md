# 教师左栏 + 生成页右栏可折叠 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 教师左栏可折叠成 icon-rail(全局)、生成页右栏「当前方案/方案体检」可完全收起(留边缘把手),各自记住状态,默认展开零回归,给中间候选池腾出横向空间。

**Architecture:** 共用一个持久化 hook `usePersistentCollapse(key)`(state + localStorage,SSR 安全)。左栏在 Tailwind 布局 `layout.tsx` 里按状态切宽度/主区 margin + 图标 only + Tooltip;右栏在 `page.tsx` 按状态切 `.pgv2-workbench` grid + 条件渲染 rail/把手,配套 CSS 加到 `willnest-teacher.css`(自带 `.wn-teacher-scope` 前缀)。

**Tech Stack:** Next.js + React + antd(Tooltip / 图标)、Tailwind、jest + @testing-library/react(renderHook,jsdom per-file pragma)、pnpm workspace。

---

## 文件结构

- **新建** `apps/web/src/hooks/usePersistentCollapse.ts` — 折叠状态 + localStorage 持久化 hook。
- **新建** `apps/web/src/hooks/__tests__/usePersistentCollapse.test.tsx` — hook 单测(jsdom)。
- **改** `apps/web/src/app/(teacher)/teacher/layout.tsx` — 左栏 icon-rail 折叠。
- **改** `apps/web/src/app/(teacher)/teacher/plans/generate/[studentId]/page.tsx` — 右栏收起 + 把手。
- **改** `apps/web/src/styles/willnest-teacher.css` — 右栏折叠/把手 CSS(末尾追加,scoped)。

---

### Task 0: worktree 依赖准备(一次性)

worktree 没跑过完整 `pnpm install`(缺 web node_modules、china-division 等),否则 jest/build 跑不了。

- [ ] **Step 1: 安装工作区依赖**

Run(worktree 根):`pnpm install`
Expected: 成功;`apps/web/node_modules` 存在。若因 `china-division` 等缺失报错,这是 worktree 环境问题——记录后继续(后续 jest 仍可能因缺依赖失败,届时再定位)。

- [ ] **Step 2: 冒烟 — web 能否构建**

Run:`pnpm --filter web build`
Expected: 构建成功(确认基线干净,后续改动出错才好归因)。失败先排环境再动代码。

---

### Task 1: usePersistentCollapse hook(TDD)

**Files:**
- Create: `apps/web/src/hooks/usePersistentCollapse.ts`
- Test: `apps/web/src/hooks/__tests__/usePersistentCollapse.test.tsx`

- [ ] **Step 1: 写失败测试**

`apps/web/src/hooks/__tests__/usePersistentCollapse.test.tsx`:
```tsx
/** @jest-environment jsdom */
import { renderHook, act } from '@testing-library/react';
import { usePersistentCollapse } from '../usePersistentCollapse';

beforeEach(() => localStorage.clear());

describe('usePersistentCollapse', () => {
  it('默认未折叠(defaultCollapsed=false)', () => {
    const { result } = renderHook(() => usePersistentCollapse('k'));
    expect(result.current[0]).toBe(false);
  });

  it('defaultCollapsed=true 且无存储时为 true', () => {
    const { result } = renderHook(() => usePersistentCollapse('k', true));
    expect(result.current[0]).toBe(true);
  });

  it('toggle 翻转并写入 localStorage', () => {
    const { result } = renderHook(() => usePersistentCollapse('k'));
    act(() => result.current[1]());
    expect(result.current[0]).toBe(true);
    expect(localStorage.getItem('k')).toBe('1');
    act(() => result.current[1]());
    expect(result.current[0]).toBe(false);
    expect(localStorage.getItem('k')).toBe('0');
  });

  it('mount 时从 localStorage 回填 (存 1 → collapsed)', () => {
    localStorage.setItem('k', '1');
    const { result } = renderHook(() => usePersistentCollapse('k'));
    expect(result.current[0]).toBe(true);
  });

  it('setCollapsed 直接设值并持久化', () => {
    const { result } = renderHook(() => usePersistentCollapse('k'));
    act(() => result.current[2](true));
    expect(result.current[0]).toBe(true);
    expect(localStorage.getItem('k')).toBe('1');
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run:`cd apps/web && npx jest usePersistentCollapse`
Expected: FAIL — Cannot find module '../usePersistentCollapse'

- [ ] **Step 3: 写实现**

`apps/web/src/hooks/usePersistentCollapse.ts`:
```ts
import { useState, useEffect, useCallback } from 'react';

// 折叠状态 + localStorage 持久化. 返回 [collapsed, toggle, setCollapsed].
// SSR 安全: 首次渲染恒为 defaultCollapsed(服务端与客户端一致), mount 后再从
// localStorage 同步, 避免 hydration mismatch。
export function usePersistentCollapse(
  storageKey: string,
  defaultCollapsed = false,
): [boolean, () => void, (v: boolean) => void] {
  const [collapsed, setCollapsedState] = useState(defaultCollapsed);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem(storageKey);
    if (stored === '1') setCollapsedState(true);
    else if (stored === '0') setCollapsedState(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  const persist = useCallback((v: boolean) => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(storageKey, v ? '1' : '0');
    }
  }, [storageKey]);

  const setCollapsed = useCallback((v: boolean) => {
    setCollapsedState(v);
    persist(v);
  }, [persist]);

  const toggle = useCallback(() => {
    setCollapsedState((prev) => {
      const next = !prev;
      persist(next);
      return next;
    });
  }, [persist]);

  return [collapsed, toggle, setCollapsed];
}
```

- [ ] **Step 4: 运行确认通过**

Run:`cd apps/web && npx jest usePersistentCollapse`
Expected: PASS(5 用例全绿)

- [ ] **Step 5: 提交**

```bash
git add apps/web/src/hooks/usePersistentCollapse.ts apps/web/src/hooks/__tests__/usePersistentCollapse.test.tsx
git commit -m "feat(web): usePersistentCollapse 折叠状态持久化 hook"
```

---

### Task 2: 左栏 icon-rail 折叠(layout.tsx)

**Files:**
- Modify: `apps/web/src/app/(teacher)/teacher/layout.tsx`

- [ ] **Step 1: 加 import**

顶部:
- `import { Dropdown } from 'antd';` 改为 `import { Dropdown, Tooltip } from 'antd';`
- 在 `@ant-design/icons` 的 import 里追加 `MenuFoldOutlined, MenuUnfoldOutlined`(已有 `MenuOutlined`,不要重复)。
- 新增:`import { usePersistentCollapse } from '@/hooks/usePersistentCollapse';`

- [ ] **Step 2: 加一个 NavLink 渲染组件(模块级,DRY 现有 4 段重复 className)**

在 `mainNavItems` 等常量之后、`TeacherLayout` 之前加:
```tsx
type NavItem = { href: string; icon: React.ReactNode; label: string };

function SidebarNavLink({
  item, collapsed, active, onClick,
}: { item: NavItem; collapsed: boolean; active: boolean; onClick: () => void }) {
  const link = (
    <Link
      href={item.href}
      onClick={onClick}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg mb-1 no-underline text-sm transition-colors duration-200 ${collapsed ? 'justify-center' : ''} ${
        active ? 'bg-primary-fixed text-primary font-medium' : 'text-text-tertiary hover:bg-surface-dim'
      }`}
    >
      <span className="text-base">{item.icon}</span>
      {!collapsed && <span>{item.label}</span>}
    </Link>
  );
  return collapsed ? (
    <Tooltip title={item.label} placement="right">{link}</Tooltip>
  ) : link;
}
```

- [ ] **Step 3: 组件内加状态**

`TeacherLayout` 体内,`const [sidebarOpen, setSidebarOpen] = useState(false);` 下面加:
```tsx
  const [navCollapsed, toggleNav] = usePersistentCollapse('vh.teacher.navCollapsed');
```

- [ ] **Step 4: 把 sidebarContent 常量改成 renderSidebar(collapsed) 函数**

把现有 `const sidebarContent = ( ... );` 整体替换为下面的函数(逐项支持折叠;三组 nav 用 SidebarNavLink;标题/品牌副标题/底部文字按 collapsed 隐藏;底部加折叠开关):
```tsx
  const renderSidebar = (collapsed: boolean) => (
    <>
      {/* Brand */}
      <div className={`${collapsed ? 'px-3 py-6' : 'p-6'} mb-2 overflow-hidden`}>
        <BrandLogo href="/teacher/dashboard" />
        {!collapsed && (
          <p className="ml-12 mt-1 text-[9px] uppercase tracking-[1.5px] text-text-muted">
            Teacher Workspace
          </p>
        )}
      </div>

      {/* Main Nav */}
      <nav className="flex-1 px-3">
        {!collapsed && (
          <div className="text-[10px] uppercase tracking-wider text-text-faint font-medium px-3 mb-2">工作台</div>
        )}
        {mainNavItems.map((item) => (
          <SidebarNavLink key={item.href} item={item} collapsed={collapsed} active={isActive(item.href)} onClick={() => setSidebarOpen(false)} />
        ))}

        <div className="border-t border-border-subtle my-3" />
        {!collapsed && (
          <div className="text-[10px] uppercase tracking-wider text-text-faint font-medium px-3 mb-2">沟通</div>
        )}
        {visibleCommNavItems.map((item) => (
          <SidebarNavLink key={item.href} item={item} collapsed={collapsed} active={isActive(item.href)} onClick={() => setSidebarOpen(false)} />
        ))}

        <div className="border-t border-border-subtle my-3" />
        {!collapsed && (
          <div className="text-[10px] uppercase tracking-wider text-text-faint font-medium px-3 mb-2">浏览</div>
        )}
        {browseNavItems.map((item) => (
          <SidebarNavLink key={item.href} item={item} collapsed={collapsed} active={isActive(item.href)} onClick={() => setSidebarOpen(false)} />
        ))}
      </nav>

      {/* Bottom */}
      <div className="px-3 pb-6 space-y-1">
        {/* 折叠开关(仅桌面) */}
        <button
          onClick={toggleNav}
          title={navCollapsed ? '展开导航' : '收起导航'}
          className={`hidden lg:flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-text-muted hover:text-text-secondary border-0 bg-transparent cursor-pointer transition-colors ${collapsed ? 'justify-center' : ''}`}
        >
          {navCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
          {!collapsed && <span>收起</span>}
        </button>
        {collapsed ? (
          <>
            <Tooltip title="帮助支持" placement="right">
              <button className="flex items-center justify-center w-full px-3 py-2 rounded-lg text-sm text-text-muted hover:text-text-secondary border-0 bg-transparent cursor-pointer transition-colors">
                <QuestionCircleOutlined />
              </button>
            </Tooltip>
            <Tooltip title="退出登录" placement="right">
              <button onClick={handleLogout} className="flex items-center justify-center w-full px-3 py-2 rounded-lg text-sm text-text-muted hover:text-text-secondary border-0 bg-transparent cursor-pointer transition-colors">
                <LogoutOutlined />
              </button>
            </Tooltip>
          </>
        ) : (
          <>
            <button className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-text-muted hover:text-text-secondary border-0 bg-transparent cursor-pointer transition-colors">
              <QuestionCircleOutlined /> 帮助支持
            </button>
            <button onClick={handleLogout} className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-text-muted hover:text-text-secondary border-0 bg-transparent cursor-pointer transition-colors">
              <LogoutOutlined /> 退出登录
            </button>
          </>
        )}
      </div>
    </>
  );
```
> 注:原 bottomNavItems 是空数组、原代码里那段空 map 一并删掉(本就渲染不出东西)。

- [ ] **Step 5: 桌面 aside + 主区 margin 按 navCollapsed 切;两处 sidebarContent 引用替换**

桌面 aside(原 `<aside className="hidden lg:flex w-[260px] ...">{sidebarContent}</aside>`)改为:
```tsx
      <aside className={`hidden lg:flex ${navCollapsed ? 'w-[64px]' : 'w-[260px]'} flex-col fixed inset-y-0 left-0 bg-surface border-r border-border z-40 transition-[width] duration-200`}>
        {renderSidebar(navCollapsed)}
      </aside>
```
移动 overlay 里的 `{sidebarContent}` 改为 `{renderSidebar(false)}`(手机端始终完整)。
主内容 wrapper(原 `<div className="flex-1 min-w-0 lg:ml-[260px]">`)改为:
```tsx
      <div className={`flex-1 min-w-0 ${navCollapsed ? 'lg:ml-[64px]' : 'lg:ml-[260px]'} transition-[margin] duration-200`}>
```

- [ ] **Step 6: 构建验证**

Run:`pnpm --filter web build`
Expected: 成功,无 TS 报错。

- [ ] **Step 7: 提交**

```bash
git add "apps/web/src/app/(teacher)/teacher/layout.tsx"
git commit -m "feat(teacher): 左栏可折叠成 icon-rail(全局, 持久化)"
```

---

### Task 3: 生成页右栏收起 + 把手(page.tsx + willnest-teacher.css)

**Files:**
- Modify: `apps/web/src/app/(teacher)/teacher/plans/generate/[studentId]/page.tsx`
- Modify: `apps/web/src/styles/willnest-teacher.css`

- [ ] **Step 1: 加 import + 状态**

page.tsx:
- 在 `@ant-design/icons` import 里追加 `DoubleLeftOutlined, DoubleRightOutlined`(若已有勿重复)。
- 新增 `import { usePersistentCollapse } from '@/hooks/usePersistentCollapse';`
- 组件体内(其它 useState 群附近)加:
```tsx
  const [railCollapsed, toggleRail] = usePersistentCollapse('vh.teacher.generate.railCollapsed');
```

- [ ] **Step 2: workbench 容器加状态类**

找到 `<div className="pgv2-workbench">`(约 2159),改为:
```tsx
          <div className={`pgv2-workbench ${railCollapsed ? 'is-rail-collapsed' : ''}`}>
```

- [ ] **Step 3: 右栏条件渲染(收起→把手)**

找到 `<aside className="pgv2-rail">`(约 2901)。把整个 `<aside className="pgv2-rail"> ... </aside>` 块用三元包起来:收起时渲染把手按钮,展开时渲染原 aside。即在 `<aside className="pgv2-rail">` 前插入 `{railCollapsed ? (` + 把手,在该 aside 闭合 `</aside>` 后补 `) }` 收尾:
```tsx
            {railCollapsed ? (
              <button type="button" className="pgv2-rail-reopen" onClick={toggleRail} title="展开当前方案">
                <DoubleLeftOutlined />
                <span className="pgv2-rail-reopen-txt">当前方案</span>
              </button>
            ) : (
            <aside className="pgv2-rail">
              ...原内容不动...
            </aside>
            )}
```

- [ ] **Step 4: 卡片头加折叠箭头**

在 `<aside className="pgv2-rail">` → `<div className="pgv2-rail-card">` → `<h3>` 内(约 2903-2910):
- 把那行 `{planFetching ? <Spin size="small" style={{ marginLeft: 'auto' }} /> : null}` 的 `marginLeft: 'auto'` 改为 `marginLeft: 8`(让折叠按钮成为唯一靠右推的元素)。
- 在 `</h3>` 之前(Spin 之后)追加折叠按钮:
```tsx
                  <button type="button" className="pgv2-rail-collapse" onClick={toggleRail} title="收起当前方案">
                    <DoubleRightOutlined />
                  </button>
```

- [ ] **Step 5: 追加 CSS(willnest-teacher.css 末尾,自带 scope 前缀)**

文件末尾追加:
```css
/* —— 当前方案右栏折叠 (功能层; 把手/箭头精修交 claude-design) —— */
.wn-teacher-scope .pgv2-workbench.is-rail-collapsed { grid-template-columns: 1fr; }
.wn-teacher-scope .pgv2-rail-collapse {
  margin-left: auto;
  display: inline-flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; border: 0; border-radius: 8px;
  background: transparent; color: var(--text-tertiary); cursor: pointer;
  transition: background .2s, color .2s;
}
.wn-teacher-scope .pgv2-rail-collapse:hover { background: var(--surface-dim); color: var(--primary); }
.wn-teacher-scope .pgv2-rail-reopen {
  position: fixed; right: 0; top: 42%; z-index: 30;
  display: inline-flex; flex-direction: column; align-items: center; gap: 8px;
  padding: 14px 8px;
  border: 0; border-top-left-radius: 12px; border-bottom-left-radius: 12px;
  background: var(--surface); box-shadow: var(--shadow-card);
  color: var(--primary); cursor: pointer; transition: background .2s;
}
.wn-teacher-scope .pgv2-rail-reopen:hover { background: var(--surface-dim); }
.wn-teacher-scope .pgv2-rail-reopen-txt { writing-mode: vertical-rl; letter-spacing: 3px; font-size: 13px; }
```

- [ ] **Step 6: 构建验证**

Run:`pnpm --filter web build`
Expected: 成功,无 TS 报错。

- [ ] **Step 7: 提交**

```bash
git add "apps/web/src/app/(teacher)/teacher/plans/generate/[studentId]/page.tsx" apps/web/src/styles/willnest-teacher.css
git commit -m "feat(plan-generate): 右栏当前方案可完全收起 + 边缘把手"
```

---

### Task 4: 整体验证

- [ ] **Step 1: hook 单测**

Run:`cd apps/web && npx jest usePersistentCollapse`
Expected: 5/5 PASS。

- [ ] **Step 2: web 构建**

Run:`pnpm --filter web build`
Expected: 成功。

- [ ] **Step 3: 人工/浏览器验证(布局回流,纯视觉不写脆弱 DOM 断言)**

起本地 web(或部署后),登录老师号:
- 左栏:点底部折叠按钮 → 收成图标细条、文字消失、hover 图标出 tooltip、主区变宽;刷新后保持;再点展开恢复。
- 生成页右栏:点卡片头箭头 → 右栏消失、候选池吃满整行、右边缘出现「当前方案」把手;点把手 → 拉回;刷新后保持。
- 默认(从未点过)= 两块都展开(零回归)。

---

## 自检(Self-Review)

- **Spec coverage**:① 左栏 icon-rail → Task 2;② 右栏完全收起 + 把手 → Task 3;③ 各自独立持久化 + 默认展开零回归 → Task 1 hook + 两处不同 key;④ 仅桌面/移动不动 → Task 2(`hidden lg:flex` 折叠钮 + overlay 用 `renderSidebar(false)`)、Task 3(grid ≤1280 单列原样)。全覆盖。
- **类型一致**:hook 签名 `[boolean, () => void, (v:boolean)=>void]` 全程一致;`NavItem` 类型在 layout 内定义并被 SidebarNavLink 用;key 字符串 `vh.teacher.navCollapsed` / `vh.teacher.generate.railCollapsed`。
- **无占位符**:每步含真实代码 + 命令 + 预期。CSS 把手/箭头给了功能性默认值(claude-design 后续精修),非占位。
- **环境**:Task 0 先 `pnpm install` 解决 worktree 缺 web 依赖,jest/build 才能跑。
- **样式边界**:折叠的视觉精修(动画/把手造型/tooltip)交 claude-design;本计划只做功能骨架 + 合理默认(见 [[feedback_frontend_styling]])。
