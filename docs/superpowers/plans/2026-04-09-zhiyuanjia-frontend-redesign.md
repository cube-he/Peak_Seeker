# 智愿家 Frontend Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebrand the entire frontend from "Summit Intelligence 巅峰智选" to "智愿家 (Zhiyuanjia)" with a warm academic design system.

**Architecture:** Pure visual redesign — rewrite Tailwind config, CSS variables, Ant Design theme, 3 UI components, 4 layout components, and all 11 pages. Data layer (services/stores/API/hooks/types) is untouched.

**Tech Stack:** Next.js 14, TypeScript, Ant Design 5, Tailwind CSS 3, Google Fonts (Crimson Pro, Inter, Noto Serif SC, Noto Sans SC)

**Design Spec:** `docs/superpowers/specs/2026-04-09-zhiyuanjia-frontend-redesign-design.md`

---

## File Map

### Foundation (Task 1)
- Modify: `apps/web/tailwind.config.js` — color tokens, fonts, shadows
- Modify: `apps/web/src/app/globals.css` — CSS variables, Ant Design overrides
- Modify: `apps/web/src/app/layout.tsx` — fonts, metadata, ConfigProvider theme

### UI Components (Task 2)
- Modify: `apps/web/src/components/ui/GradientButton.tsx`
- Modify: `apps/web/src/components/ui/StatCard.tsx`
- Modify: `apps/web/src/components/ui/StatusChip.tsx`

### Layout Components (Tasks 3-6)
- Modify: `apps/web/src/components/layout/MainLayout.tsx`
- Modify: `apps/web/src/components/layout/FooterSection.tsx`
- Modify: `apps/web/src/components/layout/AuthLayout.tsx`
- Modify: `apps/web/src/components/layout/SideNavLayout.tsx`

### Pages (Tasks 7-16)
- Modify: `apps/web/src/app/(main)/page.tsx`
- Modify: `apps/web/src/app/(auth)/login/page.tsx`
- Modify: `apps/web/src/app/(auth)/register/page.tsx`
- Modify: `apps/web/src/app/(main)/universities/page.tsx`
- Modify: `apps/web/src/app/(main)/universities/[id]/page.tsx`
- Modify: `apps/web/src/app/(main)/majors/page.tsx`
- Modify: `apps/web/src/app/(main)/majors/[id]/page.tsx`
- Modify: `apps/web/src/app/(main)/scores/page.tsx`
- Modify: `apps/web/src/app/(main)/recommend/page.tsx`
- Modify: `apps/web/src/app/(main)/plan/page.tsx`
- Modify: `apps/web/src/app/(user)/profile/page.tsx`
- Modify: `apps/web/src/app/(user)/favorites/page.tsx`
- Modify: `apps/web/src/app/(admin)/ai-config/page.tsx`
- Modify: `apps/web/src/app/(admin)/data-import/page.tsx`

---

## Task 1: Design System Foundation

**Files:**
- Modify: `apps/web/tailwind.config.js`
- Modify: `apps/web/src/app/globals.css`
- Modify: `apps/web/src/app/layout.tsx`

- [ ] **Step 1: Rewrite `tailwind.config.js` with new design tokens**

Replace the entire `theme.extend` section. Keep `content` and `corePlugins` as-is.

```javascript
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: '#1e3a5f', light: '#2c5282', fixed: '#ebf4ff' },
        accent: { DEFAULT: '#b8860b', light: '#d4a843', fixed: '#fdf8ec' },
        surface: {
          DEFAULT: '#faf9f5',
          dim: '#f0eee6',
          high: '#ffffff',
        },
        bg: '#f5f4ed',
        border: { DEFAULT: '#e8e6dc', subtle: '#f0eee6' },
        text: {
          DEFAULT: '#1a1a19',
          secondary: '#4d4c48',
          tertiary: '#6b6962',
          muted: '#87867f',
          faint: '#b0aea5',
        },
        ring: '#d1cfc5',
        rush: { DEFAULT: '#c53030', fixed: '#fef2f2' },
        stable: { DEFAULT: '#2c5282', fixed: '#ebf4ff' },
        safe: { DEFAULT: '#276749', fixed: '#f0fff4' },
        elite: { DEFAULT: '#b8860b', fixed: '#fdf8ec' },
      },
      fontFamily: {
        serif: ['var(--font-serif)', 'Georgia', 'Noto Serif SC', 'SimSun', 'serif'],
        sans: ['var(--font-sans)', 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', 'sans-serif'],
      },
      borderRadius: {
        sm: '6px',
        DEFAULT: '8px',
        lg: '10px',
        xl: '12px',
        full: '999px',
      },
      boxShadow: {
        card: '0 1px 3px rgba(26,26,25,0.04)',
        'card-hover': '0 20px 40px rgba(26,26,25,0.06)',
        'glow-primary': '0 8px 24px rgba(30,58,95,0.18)',
        'glow-primary-lg': '0 12px 32px rgba(30,58,95,0.25)',
        'glow-accent': '0 8px 24px rgba(184,134,11,0.2)',
        nav: '0 1px 0 #e8e6dc',
        ring: '0 0 0 1px #e8e6dc',
      },
    },
  },
  corePlugins: {
    preflight: false,
  },
  plugins: [],
}
```

- [ ] **Step 2: Rewrite `globals.css` with new CSS variables and Ant Design overrides**

Read the current `apps/web/src/app/globals.css` first. Replace entirely with the new design system. Key sections:
1. `:root` CSS variables matching Tailwind tokens
2. Base body styles (background: `#f5f4ed`, color: `#1a1a19`, font-family sans)
3. Ant Design component overrides using new tokens:
   - `.ant-btn-primary`: gradient `#1e3a5f` → `#2c5282`, glow shadow, no border
   - `.ant-card`: bg `#faf9f5`, radius 10px, no border, `shadow-card`, hover `shadow-card-hover` + translateY(-1px)
   - `.ant-table`: header bg `#f0eee6`, row hover `#faf9f5`, warm text colors
   - `.ant-input`, `.ant-select`: bg `#f0eee6`, focus border `#1e3a5f`, no visible border by default
   - `.ant-tag`: radius 999px (pill), no border
   - `.ant-tabs`: ink bar `#1e3a5f`, active tab font-weight 500
   - `.ant-modal`: radius 12px, warm shadow
   - `.ant-dropdown`: bg `#ffffff`, warm shadow
4. Utility classes:
   - `.glass-panel`: `backdrop-filter: blur(24px)`, `background: rgba(250,249,245,0.92)`
   - `@keyframes fadeIn`: opacity 0→1, 400ms ease
   - `.fade-in`: applies fadeIn animation
5. Custom scrollbar: thumb `#d1cfc5`, track transparent
6. `@media (prefers-reduced-motion: reduce)` — disable animations

All shadow values use `rgba(26,26,25, ...)` not `rgba(0,0,0, ...)`.
All grays use warm tones. No cold grays anywhere.

- [ ] **Step 3: Rewrite `layout.tsx` — fonts, metadata, Ant Design theme**

Read the current `apps/web/src/app/layout.tsx` first. Changes:
1. Replace font imports: swap `Manrope` for `Crimson_Pro`, keep `Inter`
2. Update metadata:
   - title: `智愿家 Zhiyuanjia | 你的升学智囊`
   - description: `基于 AI 与大数据的升学决策平台，让每一个志愿都被认真对待。智慧·志愿·专家。`
3. Update Ant Design ConfigProvider `theme.token`:
   ```typescript
   {
     colorPrimary: '#1e3a5f',
     colorSuccess: '#276749',
     colorWarning: '#b8860b',
     colorError: '#c53030',
     colorBgBase: '#f5f4ed',
     colorBgContainer: '#faf9f5',
     colorBgElevated: '#ffffff',
     colorText: '#1a1a19',
     colorTextSecondary: '#4d4c48',
     colorTextTertiary: '#6b6962',
     colorTextQuaternary: '#87867f',
     colorBorder: '#e8e6dc',
     colorBorderSecondary: '#f0eee6',
     borderRadius: 8,
     fontFamily: "Inter, 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', sans-serif",
     fontSize: 14,
     lineHeight: 1.65,
   }
   ```
4. Update `theme.components`:
   ```typescript
   {
     Button: { controlHeight: 40, controlHeightLG: 48, borderRadius: 8 },
     Card: { paddingLG: 24, borderRadiusLG: 10 },
     Table: { headerBg: '#f0eee6', rowHoverBg: '#faf9f5' },
     Input: { activeBg: '#f0eee6', hoverBg: '#f0eee6' },
     Tag: { borderRadiusSM: 999 },
   }
   ```
5. Apply font CSS variables to `<body>` className: `${crimsonPro.variable} ${inter.variable}`

- [ ] **Step 4: Verify build passes**

Run: `cd apps/web && npx next build 2>&1 | tail -20`
Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/tailwind.config.js apps/web/src/app/globals.css apps/web/src/app/layout.tsx
git commit -m "feat: redesign foundation — Zhiyuanjia design tokens, fonts, Ant Design theme"
```

---

## Task 2: UI Components

**Files:**
- Modify: `apps/web/src/components/ui/GradientButton.tsx`
- Modify: `apps/web/src/components/ui/StatCard.tsx`
- Modify: `apps/web/src/components/ui/StatusChip.tsx`

- [ ] **Step 1: Rewrite `GradientButton.tsx`**

Read current file first. Update all color/style classes:
- Primary variant: `bg-gradient-to-br from-primary to-primary-light text-white shadow-glow-primary hover:shadow-glow-primary-lg`
- Secondary variant: `bg-surface text-text-secondary shadow-ring`
- Accent variant (new): `bg-accent text-white shadow-glow-accent`
- Hover: `hover:-translate-y-px transition-all duration-200`
- Border radius: `rounded` (8px)
- Sizes: default `h-10 px-6`, large `h-12 px-7`
- Font: `font-sans text-sm font-medium`

- [ ] **Step 2: Rewrite `StatCard.tsx`**

Read current file first. Update colors:
- Card: `bg-surface rounded-lg shadow-card hover:shadow-card-hover transition-shadow duration-300`
- Left accent bar: `border-l-[3px]` with color based on variant:
  - primary → `border-primary`
  - accent → `border-accent`
  - safe → `border-safe`
  - rush → `border-rush`
- Label: `text-[11px] uppercase tracking-wider text-text-muted font-sans`
- Value: `font-serif text-[28px] font-semibold tabular-nums` + variant color
- Subtitle: `text-xs text-text-faint`

- [ ] **Step 3: Rewrite `StatusChip.tsx`**

Read current file first. Update variants:
- rush: `bg-rush-fixed text-rush`
- stable: `bg-stable-fixed text-stable`
- safe: `bg-safe-fixed text-safe`
- elite: `bg-elite-fixed text-elite`
- neutral (new, replaces default): `bg-surface-dim text-text-secondary`
- Shape: `rounded-full` (pill)
- Size: `px-3.5 py-1 text-[13px] font-medium`
- No border on any variant

- [ ] **Step 4: Verify build passes**

Run: `cd apps/web && npx next build 2>&1 | tail -20`
Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/ui/
git commit -m "feat: redesign UI components — GradientButton, StatCard, StatusChip"
```

---

## Task 3: MainLayout (Navbar)

**Files:**
- Modify: `apps/web/src/components/layout/MainLayout.tsx`

- [ ] **Step 1: Read current `MainLayout.tsx`**

Understand the existing structure: navbar items, user dropdown, responsive behavior, route imports.

- [ ] **Step 2: Rewrite visual layer**

Keep all existing logic (auth checks, route matching, mobile toggle, dropdown). Replace all visual classes:

**Navbar wrapper:**
- `sticky top-0 z-50 h-16 backdrop-blur-xl bg-surface/[0.92] shadow-nav`
- Inner: `max-w-[1200px] mx-auto px-12 flex items-center justify-between`

**Brand:**
- Logo box: `w-[34px] h-[34px] bg-gradient-to-br from-primary to-primary-light rounded-lg flex items-center justify-center text-white font-serif font-bold text-[17px]` → shows "智"
- Brand name: `font-serif text-[19px] font-semibold text-text` → shows "智愿家"

**Nav links:**
- Container: `flex gap-8`
- Default: `text-sm text-text-tertiary hover:text-primary transition-colors duration-200`
- Active: `text-primary font-medium`

**Right section (logged out):**
- Login link: `text-sm text-text-tertiary`
- Register button: `bg-gradient-to-br from-primary to-primary-light text-white text-[13px] font-medium px-5 py-2 rounded`

**Right section (logged in):**
- Notification: `w-8 h-8 bg-surface-dim rounded-full flex items-center justify-center text-text-tertiary`
- Avatar: `w-8 h-8 bg-primary rounded-full flex items-center justify-center text-white text-[13px] font-sans font-medium`

**Content area:**
- `max-w-[1200px] mx-auto px-12 py-8`

**Mobile menu:** Keep same toggle logic, update colors to match.

Replace all brand text:
- "巅峰智选" → "智愿家"
- "Summit Intelligence" → remove

- [ ] **Step 3: Verify build passes**

Run: `cd apps/web && npx next build 2>&1 | tail -20`

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/layout/MainLayout.tsx
git commit -m "feat: redesign MainLayout navbar — Zhiyuanjia branding"
```

---

## Task 4: FooterSection

**Files:**
- Modify: `apps/web/src/components/layout/FooterSection.tsx`

- [ ] **Step 1: Read current `FooterSection.tsx` and rewrite**

Keep existing link structure. Update visuals:

**Footer container:**
- `max-w-[1200px] mx-auto px-12 pt-[60px] pb-10`
- `grid grid-cols-[2fr_1fr_1fr_1fr] gap-12`

**Brand column:**
- Name: `font-serif text-xl font-semibold text-text` → "智愿家"
- Tagline: `text-[13px] text-text-muted tracking-[2px] mt-1.5` → "智慧 · 志愿 · 专家"
- Description: `text-[13px] text-text-tertiary mt-3 leading-relaxed` → "基于 AI 与大数据的升学决策平台，让每一个志愿都被认真对待。"

**Link columns:**
- Heading: `text-xs uppercase tracking-wider text-text-muted font-medium mb-4`
- Links: `text-sm text-text-tertiary hover:text-primary`
- Column titles: "产品", "资源", "支持"

**Bottom bar:**
- `border-t border-border mt-8 pt-5`
- Left: `text-xs text-text-faint` → "© 2026 立方科技. All rights reserved."
- Right: `text-xs text-text-faint` → "智愿家 — 你的升学智囊"

- [ ] **Step 2: Verify build and commit**

```bash
cd apps/web && npx next build 2>&1 | tail -5
git add apps/web/src/components/layout/FooterSection.tsx
git commit -m "feat: redesign FooterSection — Zhiyuanjia branding"
```

---

## Task 5: AuthLayout

**Files:**
- Modify: `apps/web/src/components/layout/AuthLayout.tsx`

- [ ] **Step 1: Read current `AuthLayout.tsx` and rewrite**

Keep split-panel structure. Update visuals:

**Left panel (brand hero):**
- Background: `bg-primary` (solid `#1e3a5f`)
- Logo: same "智" box as navbar but white bg: `w-10 h-10 bg-white/20 rounded-lg` + white "智" text
- Brand name: `font-serif text-3xl font-bold text-white` → "智愿家"
- Tagline: `text-white/70 text-[13px] tracking-[3px]` → "智慧 · 志愿 · 专家"
- Features list: white text with white/60 icons
- Social proof: `text-white/60 text-sm` → "125万+ 家庭的共同选择"
- Remove any grid pattern overlay (keep simple, warm)

**Right panel (form):**
- Background: `bg-surface` (#faf9f5)
- Content centered with max-width constraint

**Responsive:** Left panel hidden below `lg` breakpoint.

- [ ] **Step 2: Verify build and commit**

```bash
cd apps/web && npx next build 2>&1 | tail -5
git add apps/web/src/components/layout/AuthLayout.tsx
git commit -m "feat: redesign AuthLayout — academic blue hero panel"
```

---

## Task 6: SideNavLayout

**Files:**
- Modify: `apps/web/src/components/layout/SideNavLayout.tsx`

- [ ] **Step 1: Read current `SideNavLayout.tsx` and rewrite**

Keep existing nav items, mobile toggle, routing logic. Update visuals:

**Sidebar:**
- Width: 280px desktop, overlay mobile
- Background: `bg-surface`
- Brand: "智愿家" (font-serif 19px) + "智慧·志愿·专家" (text-xs text-text-muted)
- Nav items default: `text-sm text-text-tertiary px-3 py-2.5 rounded-lg`
- Nav items active: `bg-primary-fixed text-primary font-medium`
- Replace "录取指挥部" → "智愿家控制台"

**Top header:**
- `sticky top-0 h-16 bg-surface/[0.92] backdrop-blur-xl shadow-nav`
- Page title: `font-serif text-lg font-semibold text-text`

**Content:** `p-8 bg-bg`

- [ ] **Step 2: Verify build and commit**

```bash
cd apps/web && npx next build 2>&1 | tail -5
git add apps/web/src/components/layout/SideNavLayout.tsx
git commit -m "feat: redesign SideNavLayout — warm sidebar with academic styling"
```

---

## Task 7: Homepage

**Files:**
- Modify: `apps/web/src/app/(main)/page.tsx`

- [ ] **Step 1: Read current homepage and rewrite**

Read `apps/web/src/app/(main)/page.tsx`. This is the largest visual change. Keep all data-fetching logic if any. Rewrite the JSX:

**Hero section:**
- Two-column grid: left text + right floating cards
- Badge: `inline-flex items-center gap-1.5 bg-surface border border-border rounded-full px-4 py-1.5 text-xs text-text-muted` + green dot + "2026 高考数据已更新"
- H1: `font-serif text-[48px] font-bold leading-[1.12] tracking-tight text-text` → "每一个志愿，都值得被<em class='not-italic text-primary'>认真对待</em>。"
- Subtitle: `text-[17px] text-text-tertiary leading-relaxed mt-5 max-w-[480px]`
- Buttons: Primary gradient "开始智能推荐" + Ghost "浏览全国院校"
- Right side: 3 floating cards with absolute positioning — matches data + AI accuracy + families served

**Trust bar:**
- 4 items centered: `font-serif text-[28px] font-semibold text-primary tabular-nums` + label below

**Features section:**
- `bg-surface-dim` background
- Section label: `text-[11px] uppercase tracking-[2px] text-accent font-medium`
- Title: `font-serif text-[36px] font-semibold`
- 3×2 card grid on `bg-surface`, hover shadow lift
- 6 features: 院校全景, 专业洞察, AI 智能推荐, 趋势分析, 方案管理, 隐私优先

**How it works:**
- 3 steps with large numbers: `font-serif text-[64px] font-bold text-border`
- Step titles + descriptions

**CTA section:**
- `bg-primary` full-width
- White heading + accent gold button

- [ ] **Step 2: Verify build and commit**

```bash
cd apps/web && npx next build 2>&1 | tail -5
git add apps/web/src/app/(main)/page.tsx
git commit -m "feat: redesign homepage — Zhiyuanjia hero, features, CTA"
```

---

## Task 8: Login & Register Pages

**Files:**
- Modify: `apps/web/src/app/(auth)/login/page.tsx`
- Modify: `apps/web/src/app/(auth)/register/page.tsx`

- [ ] **Step 1: Rewrite login page**

Read `apps/web/src/app/(auth)/login/page.tsx`. Keep form logic (onFinish handler, auth service calls, router navigation). Rewrite visuals:

- Heading: `font-serif text-[28px] font-semibold text-text` → "欢迎回来"
- Subheading: `text-text-tertiary text-[15px]` → "登录你的智愿家账号"
- Input fields: use Ant Design Input with warm styling (globals.css handles this)
- Submit button: full-width Primary gradient
- Bottom link: "还没有账号？" + `text-primary-light` link "立即注册"

- [ ] **Step 2: Rewrite register page**

Read `apps/web/src/app/(auth)/register/page.tsx`. Same pattern:

- Heading: "加入智愿家"
- Subheading: "创建账号，开始你的升学规划"
- Fields: username + password + confirm password
- Submit: full-width Primary gradient "创建账号"
- Bottom: "已有账号？去登录"

- [ ] **Step 3: Verify build and commit**

```bash
cd apps/web && npx next build 2>&1 | tail -5
git add apps/web/src/app/(auth)/
git commit -m "feat: redesign login & register pages — Zhiyuanjia branding"
```

---

## Task 9: Universities Pages

**Files:**
- Modify: `apps/web/src/app/(main)/universities/page.tsx`
- Modify: `apps/web/src/app/(main)/universities/[id]/page.tsx`

- [ ] **Step 1: Rewrite universities list page**

Read current file. Keep all data fetching (useQuery), filter state, pagination. Rewrite visual classes:

- Page title: `font-serif text-[28px] font-semibold text-text`
- Filter bar: `bg-surface rounded-xl p-4` with Select/Input using warm colors
- Feature tags (985/211/双一流): use neutral StatusChip style (`bg-surface-dim text-text-secondary rounded-full`)
- University cards: `bg-surface rounded-lg shadow-card hover:shadow-card-hover transition-all duration-300`
  - Name: `font-serif text-lg font-semibold text-text hover:text-primary`
  - Location/type badges: neutral chips
  - Score/rank: `text-sm tabular-nums`
  - Favorite star: `text-accent hover:text-accent-light`
- Right sidebar "热门院校": `bg-surface rounded-xl p-5`
  - Title: `font-serif text-base font-semibold`
  - List items: sequential numbering with `text-text-muted` numbers

- [ ] **Step 2: Rewrite university detail page**

Read current file. Keep data fetching and tab logic. Rewrite:

- Hero: university name `font-serif text-[36px]`, tags as neutral chips, favorite button
- Info cards: StatCard pattern with primary/accent/safe accents
- Tabs: Ant Design Tabs with warm ink bar (handled by globals.css)
- Score chart: ECharts colors → `primary: '#1e3a5f'`, `primaryLight: '#2c5282'`, `accent: '#b8860b'`

- [ ] **Step 3: Verify build and commit**

```bash
cd apps/web && npx next build 2>&1 | tail -5
git add apps/web/src/app/(main)/universities/
git commit -m "feat: redesign universities pages — warm academic cards"
```

---

## Task 10: Majors Pages

**Files:**
- Modify: `apps/web/src/app/(main)/majors/page.tsx`
- Modify: `apps/web/src/app/(main)/majors/[id]/page.tsx`

- [ ] **Step 1: Rewrite majors list page**

Read current file. Keep data fetching, category nav state, search. Rewrite:

- Left category nav: `bg-surface rounded-xl` sticky
  - Items: `text-sm text-text-tertiary`, active: `text-primary font-medium bg-primary-fixed rounded-lg`
  - Color dots before each category
- Major cards: `bg-surface rounded-lg shadow-card hover:shadow-card-hover`
  - Name: `font-serif font-semibold`
  - Level badge: neutral StatusChip
  - Employment rate progress bar: `bg-safe` on `bg-border` track
  - Salary: `font-serif text-lg font-semibold text-accent tabular-nums`
- Right sidebar "热门专业": same pattern as universities

- [ ] **Step 2: Rewrite major detail page**

Same approach as university detail. Hero + info cards + tabs.

- [ ] **Step 3: Verify build and commit**

```bash
cd apps/web && npx next build 2>&1 | tail -5
git add apps/web/src/app/(main)/majors/
git commit -m "feat: redesign majors pages — warm academic styling"
```

---

## Task 11: Scores Page

**Files:**
- Modify: `apps/web/src/app/(main)/scores/page.tsx`

- [ ] **Step 1: Rewrite scores page**

Read current file. Keep form + table data logic. Rewrite:

- Title: `font-serif text-[28px] font-semibold`
- Form: warm-bg inputs, Primary gradient submit
- Table: Ant Design Table (warm header via globals.css)
- Highlight row (user's position): `bg-primary-fixed` (#ebf4ff)
- Score/rank numbers: `tabular-nums`

- [ ] **Step 2: Verify build and commit**

```bash
cd apps/web && npx next build 2>&1 | tail -5
git add apps/web/src/app/(main)/scores/page.tsx
git commit -m "feat: redesign scores page — warm table with highlight row"
```

---

## Task 12: AI Recommendation Page

**Files:**
- Modify: `apps/web/src/app/(main)/recommend/page.tsx`

- [ ] **Step 1: Read current recommendation page**

This is the most complex page. Read `apps/web/src/app/(main)/recommend/page.tsx` carefully. Identify all state management, form handlers, API calls, result rendering logic.

- [ ] **Step 2: Rewrite visual layer**

Keep ALL logic untouched. Rewrite classes only:

**Left sidebar (form panel, 380px):**
- `bg-surface rounded-xl p-6 sticky top-24`
- Title: `font-serif text-xl font-semibold text-text` → "智能推荐"
- Form inputs: warm background, warm focus
- Strategy presets: card-style radio buttons with `bg-surface-dim` default, `bg-primary-fixed border-primary` selected
- Submit: Primary gradient button full-width

**Right results area:**
- Top stat cards: 4× StatCard (total/rush/stable/safe) using component from Task 2
- Distribution bar: `flex h-1.5 rounded-full overflow-hidden bg-border`
  - Rush segment: `bg-rush`
  - Stable segment: `bg-stable`
  - Safe segment: `bg-safe`
- Recommendation cards: per design spec section 3.4
  - `bg-surface rounded-lg shadow-card p-5`
  - Order number: `text-xs text-text-faint font-medium`
  - Status chip: use StatusChip component
  - University name: `font-serif text-lg font-semibold`
  - Major: `text-[13px] text-text-tertiary`
  - Probability: `font-serif text-[28px] font-semibold` + semantic color
  - Progress bar: 4px, semantic color on `bg-border` track
  - Historical data: `text-xs text-text-faint` with `tabular-nums` values
- Action bar: "保存方案" (Accent button) + "导出 CSV" (Ghost button)

- [ ] **Step 3: Verify build and commit**

```bash
cd apps/web && npx next build 2>&1 | tail -5
git add apps/web/src/app/(main)/recommend/page.tsx
git commit -m "feat: redesign AI recommendation page — warm data cards"
```

---

## Task 13: Plan Management Page

**Files:**
- Modify: `apps/web/src/app/(main)/plan/page.tsx`

- [ ] **Step 1: Rewrite plan page**

Read current file. Keep plan CRUD logic. Rewrite:

- Top stat cards: 3× StatCard
- Plan cards: `bg-surface rounded-lg shadow-card hover:shadow-card-hover p-5`
  - Name: `font-serif text-base font-semibold`
  - Status: StatusChip
  - Metadata: `text-xs text-text-muted`
  - Distribution bar: 3-color (rush/stable/safe) on `bg-border`
  - Actions: Ghost buttons "查看详情" + "下载"
- Empty state: `text-center py-16`
  - Heading: `font-serif text-xl text-text-muted`
  - CTA: Primary gradient "创建第一个方案"
- Grid: `grid grid-cols-1 lg:grid-cols-2 gap-5`

- [ ] **Step 2: Verify build and commit**

```bash
cd apps/web && npx next build 2>&1 | tail -5
git add apps/web/src/app/(main)/plan/page.tsx
git commit -m "feat: redesign plan management page"
```

---

## Task 14: Profile Page

**Files:**
- Modify: `apps/web/src/app/(user)/profile/page.tsx`

- [ ] **Step 1: Rewrite profile page**

Read current file. Keep form logic and tab state. Rewrite:

- User summary card: `bg-surface rounded-xl p-6`
  - Avatar: `w-16 h-16 bg-primary rounded-full text-white font-serif text-2xl`
  - Name: `font-serif text-xl font-semibold`
  - Info: `text-sm text-text-tertiary`
- Tabs: Ant Design Tabs (warm styling via globals.css)
- Form sections: warm-bg inputs with `bg-surface-dim` background
- Save button: Accent button (`bg-accent text-white`)
- Section headings: `font-serif text-base font-semibold`

- [ ] **Step 2: Verify build and commit**

```bash
cd apps/web && npx next build 2>&1 | tail -5
git add apps/web/src/app/(user)/profile/page.tsx
git commit -m "feat: redesign profile page — warm form styling"
```

---

## Task 15: Favorites Page

**Files:**
- Modify: `apps/web/src/app/(user)/favorites/page.tsx`

- [ ] **Step 1: Rewrite favorites page**

Read current file. Keep favorite list logic, tab switching. Rewrite:

- Tabs: "收藏的院校" | "收藏的专业"
- Reuse same card patterns from universities/majors pages
- Remove-favorite button: `text-rush text-sm hover:text-rush/80`
- Empty state: warm, encouraging message + CTA

- [ ] **Step 2: Verify build and commit**

```bash
cd apps/web && npx next build 2>&1 | tail -5
git add apps/web/src/app/(user)/favorites/page.tsx
git commit -m "feat: redesign favorites page"
```

---

## Task 16: Admin Pages (AI Config + Data Import)

**Files:**
- Modify: `apps/web/src/app/(admin)/ai-config/page.tsx`
- Modify: `apps/web/src/app/(admin)/data-import/page.tsx`

- [ ] **Step 1: Rewrite AI config page**

Read current file. Keep all config CRUD logic. Rewrite:
- Cards: `bg-surface rounded-lg shadow-card`
- Headings: `font-serif`
- Form elements: warm styling (globals.css handles most)
- Replace any brand references

- [ ] **Step 2: Rewrite data import page**

Read current file. Keep import logic. Rewrite:
- Upload area: `bg-surface-dim rounded-xl border-2 border-dashed border-border`
- Task list: warm card styling
- Replace any brand references

- [ ] **Step 3: Verify full build**

Run: `cd apps/web && npx next build 2>&1 | tail -20`
Expected: Clean build, zero TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/(admin)/
git commit -m "feat: redesign admin pages — AI config and data import"
```

---

## Task 17: Final Verification & Cleanup

- [ ] **Step 1: Full text search for old brand references**

```bash
grep -r "巅峰智选\|Summit Intelligence\|录取指挥部\|summit" apps/web/src/ --include="*.tsx" --include="*.ts" -l
```

Expected: No results. If any files found, update them to use "智愿家" branding.

- [ ] **Step 2: Full text search for old color tokens**

```bash
grep -r "#003fb1\|#006973\|#723b00\|#1a56db" apps/web/src/ --include="*.tsx" --include="*.ts" --include="*.css" --include="*.js" -l
```

Expected: No results. If any files found, replace with new tokens.

- [ ] **Step 3: Full build verification**

```bash
cd apps/web && npx next build
```

Expected: Clean build, no errors.

- [ ] **Step 4: Final commit if any cleanup was needed**

```bash
git add -A apps/web/src/
git commit -m "chore: cleanup old brand references and color tokens"
```
