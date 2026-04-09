# 智愿家 (Zhiyuanjia) — 前端全站重设计规范

## 1. 概述

### 1.1 项目背景
将现有"巅峰智选 Summit Intelligence"品牌完全替换为"智愿家 (Zhiyuanjia)"。这是一次纯视觉层面的全站重设计，数据层（services/stores/API）零改动。

### 1.2 品牌定义
- **产品名**：智愿家 (Zhiyuanjia)
- **品牌释义**：智慧 · 志愿 · 专家（作为品牌名下方的解释行出现）
- **公司品牌**：立方（以 logo 形式出现在网站底部等位置）
- **英文**：Zhiyuanjia
- **Slogan**：每一个志愿，都值得被认真对待
- **Sub-slogan**：你的升学智囊，温暖相伴每一步抉择

### 1.3 设计方向
以 Claude/Anthropic 的"温暖智识"路线为基底，融合学院蓝的教育权威感。目标调性：**像学院导师——温暖、从容、值得信赖**。

### 1.4 重设计范围
- 全部 11 个页面 + 4 个布局组件
- 设计系统（色彩、字体、组件、间距、阴影）
- 品牌文案（meta 信息、Hero、Footer 等所有面向用户的文字）

---

## 2. 设计系统

### 2.1 色彩体系

#### 品牌色
| Token | 色值 | 用途 |
|-------|------|------|
| `--primary` | `#1e3a5f` | 学院蓝，品牌主色、导航、标题强调 |
| `--primary-light` | `#2c5282` | 链接、交互元素、图表、渐变配对 |
| `--primary-fixed` | `#ebf4ff` | 主色浅底，Tag/Badge 背景 |
| `--accent` | `#b8860b` | 哑光金，CTA 按钮、高光时刻、"精英"标识 |
| `--accent-light` | `#d4a843` | 金色浅版，次要强调 |
| `--accent-fixed` | `#fdf8ec` | 金色浅底，Tag/Badge 背景 |

#### 底色层次（代替边框的分层手法）
| Token | 色值 | 层级 | 用途 |
|-------|------|------|------|
| `--bg` | `#f5f4ed` | Level 0 | 页面底色（羊皮纸暖白） |
| `--surface` | `#faf9f5` | Level 1 | 卡片、内容区 |
| `--surface-high` | `#ffffff` | Level 2 | 浮层、Modal、Dropdown |
| `--surface-dim` | `#f0eee6` | 分区 | 交替区块背景（如功能区） |
| `--border` | `#e8e6dc` | 边界 | 极少数需要显式边界时使用 |
| `--border-subtle` | `#f0eee6` | 轻边界 | 表单 ghost border（20% 透明度） |

#### 语义色
| Token | 色值 | 用途 | 浅底色 |
|-------|------|------|--------|
| `--rush` | `#c53030` | 冲（录取概率 < 40%） | `#fef2f2` |
| `--stable` | `#2c5282` | 稳（录取概率 40-70%） | `#ebf4ff` |
| `--safe` | `#276749` | 保（录取概率 > 70%） | `#f0fff4` |
| `--elite` | `#b8860b` | 精英/顶级推荐 | `#fdf8ec` |
| `--error` | `#c53030` | 表单错误（复用 rush） | `#fef2f2` |
| `--success` | `#276749` | 操作成功（复用 safe） | `#f0fff4` |

#### 暖灰阶梯（全部带黄棕暖调，禁止冷灰）
| Token | 色值 | 用途 |
|-------|------|------|
| `--text` | `#1a1a19` | 暖墨，标题/正文主色 |
| `--text-secondary` | `#4d4c48` | 次要正文 |
| `--text-tertiary` | `#6b6962` | 辅助说明 |
| `--text-muted` | `#87867f` | 标签、注脚 |
| `--text-faint` | `#b0aea5` | 最弱文字、placeholder |
| `--ring` | `#d1cfc5` | 输入框 focus ring |

#### 色彩规则
1. **禁止冷灰**：所有灰色均含黄棕暖调，绝不使用 `#888888` 等死灰
2. **禁止纯黑**：最深色为 `#1a1a19`（暖墨），非 `#000000`
3. **阴影暖色**：所有 box-shadow 使用 `rgba(26,26,25, ...)` 而非 `rgba(0,0,0, ...)`
4. **无渐变装饰**：渐变仅用于 Primary 按钮（`#1e3a5f` → `#2c5282`，135deg）

### 2.2 字体体系

#### 字体栈
| 角色 | 字体 | 说明 |
|------|------|------|
| 标题（Display/Headline） | `Crimson Pro`, `Georgia`, `Noto Serif SC`, `SimSun`, serif | 衬线体传递学术权威 |
| 正文（Body/UI） | `Inter`, `Noto Sans SC`, `PingFang SC`, `Microsoft YaHei`, sans-serif | 无衬线保证数据可读性 |
| 数字 | Inter with `font-variant-numeric: tabular-nums` | 等宽对齐 |

#### 字号层级
| 角色 | 字体 | 大小 | 字重 | 行高 | 用途 |
|------|------|------|------|------|------|
| Display | Crimson Pro | 48px (3rem) | 700 | 1.12 | Hero 标题 |
| Headline | Crimson Pro | 36px (2.25rem) | 600 | 1.2 | 页面区块标题 |
| Subheading | Crimson Pro | 20px (1.25rem) | 600 | 1.3 | 卡片标题、模块小标题 |
| Feature Title | Crimson Pro | 18-19px | 600 | 1.3 | 功能卡片标题 |
| Body Large | Inter | 17px | 400 | 1.7 | 简介段落 |
| Body | Inter | 15px | 400 | 1.7 | 标准正文 |
| Body Small | Inter | 14px | 400 | 1.65 | 卡片描述、次要段落 |
| Caption | Inter | 13px | 400 | 1.6 | 辅助说明、时间戳 |
| Label | Inter | 11px | 500 | 1.0 | 数据标注，uppercase + tracking 1px |
| Number Display | Crimson Pro | 28-32px | 600 | 1.0 | 统计数字 |

#### 字体规则
1. 所有标题用衬线体（Crimson Pro / Noto Serif SC），传递学术权威
2. 所有正文和 UI 用无衬线体（Inter / Noto Sans SC），确保可读性
3. 数字始终使用 `tabular-nums` 等宽对齐
4. 中文正文行高不低于 1.7

### 2.3 间距与圆角

#### 间距系统（基于 4px 网格）
| Token | 值 | 典型用途 |
|-------|------|------|
| `spacing-1` | 4px | 图标与文字间距 |
| `spacing-2` | 8px | 紧凑元素内间距 |
| `spacing-3` | 12px | 标签间距、小型列表 |
| `spacing-4` | 16px | 卡片内容间距 |
| `spacing-5` | 20px | 卡片内部 padding |
| `spacing-6` | 24px | 模块内分组间距 |
| `spacing-8` | 32px | 区块内间距 |
| `spacing-10` | 40px | 区块间距 |
| `spacing-12` | 48px | 页面大区块间距 |
| `spacing-16` | 64px | 数据集群间"静谧区" |
| `spacing-20` | 80px | 页面区段间距 |

#### 圆角
| Token | 值 | 用途 |
|-------|------|------|
| `radius-sm` | 6px | 小型元素、Tag |
| `radius-md` | 8px | 按钮、输入框 |
| `radius-lg` | 10px | 卡片 |
| `radius-xl` | 12px | 大卡片、区域容器 |
| `radius-full` | 999px | 状态标签(pill) |

### 2.4 阴影系统

| Token | 值 | 用途 |
|-------|------|------|
| `shadow-card` | `0 1px 3px rgba(26,26,25,0.04)` | 卡片默认 |
| `shadow-card-hover` | `0 20px 40px rgba(26,26,25,0.06)` | 卡片 hover |
| `shadow-glow-primary` | `0 8px 24px rgba(30,58,95,0.18)` | Primary 按钮 |
| `shadow-glow-primary-lg` | `0 12px 32px rgba(30,58,95,0.25)` | Primary 按钮 hover |
| `shadow-glow-accent` | `0 8px 24px rgba(184,134,11,0.2)` | Accent 按钮 |
| `shadow-nav` | `0 1px 0 var(--border)` | 导航栏底部 |
| `shadow-ring` | `0 0 0 1px var(--border)` | Ghost 按钮/卡片 ring |

#### 阴影规则
1. 所有阴影使用暖色透明值（`rgba(26,26,25, ...)`），非纯黑
2. 卡片默认无明显阴影，hover 时升起
3. 按钮使用 glow 效果（主色透明阴影），不改变背景色
4. 导航栏使用 1px border 替代阴影

### 2.5 动效规则

| 效果 | 属性 | 时长 | 缓动 |
|------|------|------|------|
| 颜色过渡 | `transition: color` | 200ms | `ease` |
| 阴影过渡 | `transition: box-shadow` | 300ms | `ease` |
| 卡片 hover 升起 | `transform: translateY(-1px)` | 200ms | `ease-out` |
| 按钮 hover 升起 | `transform: translateY(-1px)` | 200ms | `ease-out` |
| 页面进入 | `@keyframes fadeIn` opacity 0→1 | 400ms | `ease` |

#### 动效规则
1. 禁止连续循环动画（仅 loading 指示器例外）
2. 必须遵守 `prefers-reduced-motion` 媒体查询
3. 缓动函数：进入用 `ease-out`，退出用 `ease-in`，禁止 `linear`
4. 卡片 hover 不使用 scale（避免布局偏移），只用 shadow + translateY

---

## 3. 组件规范

### 3.1 按钮

| 类型 | 背景 | 文字色 | 阴影 | 用途 |
|------|------|--------|------|------|
| Primary | `linear-gradient(135deg, #1e3a5f, #2c5282)` | white | `shadow-glow-primary` | 主要 CTA |
| Accent | `#b8860b` | white | `shadow-glow-accent` | 次要 CTA、保存操作 |
| Ghost | `var(--surface)` | `var(--text-secondary)` | `shadow-ring` | 浏览、取消等 |
| Text | transparent | `var(--primary-light)` | none | 链接式操作，带下划线 |

- 尺寸：默认 `h-10 px-6`，大号 `h-12 px-7`
- 圆角：`radius-md` (8px)
- Hover：glow 阴影增强 + `translateY(-1px)`，不改变背景色
- Disabled：opacity 0.5, cursor not-allowed

### 3.2 状态标签 (StatusChip)

| 变体 | 背景 | 文字色 | 场景 |
|------|------|--------|------|
| rush | `#fef2f2` | `#c53030` | 冲，录取概率 < 40% |
| stable | `#ebf4ff` | `#2c5282` | 稳，录取概率 40-70% |
| safe | `#f0fff4` | `#276749` | 保，录取概率 > 70% |
| elite | `#fdf8ec` | `#b8860b` | 精英/顶级 |
| neutral | `#f0eee6` | `#4d4c48` | 985/211/双一流等标签 |

- 形状：pill (`radius-full`)
- 尺寸：`px-3.5 py-1`，字号 13px / font-weight 500
- 无边框

### 3.3 数据卡片 (StatCard)

- 背景：`var(--surface)` (#faf9f5)
- 圆角：`radius-lg` (10px)
- 阴影：`shadow-card`，hover 时 `shadow-card-hover`
- 左侧强调条：3px，颜色对应语义色（primary/accent/safe/rush）
- 内部结构：Label (11px uppercase) → Value (Crimson Pro 28-32px) → Subtitle (12px muted)
- 数字使用 `tabular-nums`

### 3.4 推荐卡片 (RecommendationCard)

- 背景：`var(--surface)`
- 圆角：`radius-lg`
- 结构：
  - 顶部行：序号(12px muted) + 状态标签(冲/稳/保)
  - 院校名（Crimson Pro 18px semibold）
  - 专业名（Inter 13px tertiary）
  - 右侧：录取概率（Crimson Pro 28px + 语义色）
  - 底部：概率进度条 (4px, radius-sm) + 历史分数/位次

### 3.5 导航栏 (Navbar)

- 高度：64px
- 背景：`rgba(250,249,245,0.92)` + `backdrop-filter: blur(16px)`
- 底部：`box-shadow: 0 1px 0 var(--border)`
- Logo：34×34 圆角方块，`linear-gradient(135deg, primary, primary-light)` + 白色"智"字
- 品牌名：Crimson Pro 19px semibold
- 导航项：Inter 14px，默认 `--text-tertiary`，active `--primary` + font-weight 500
- 右侧：登录链接 + 注册按钮 / 通知铃铛 + 头像
- Sticky + 毛玻璃效果

### 3.6 Footer

- 4 列布局：品牌(2fr) + 产品(1fr) + 资源(1fr) + 支持(1fr)
- 品牌列：品牌名(Crimson Pro 20px) + "智慧·志愿·专家"(13px letter-spacing 2px) + 描述
- 底栏：上方 1px border，"© 2026 立方科技" 左对齐 + slogan 右对齐
- 链接：14px, `--text-tertiary`，hover `--primary`

### 3.7 表单输入

- 背景：`var(--surface-dim)` (#f0eee6)
- 圆角：`radius-md`
- 边框：默认无可见边框（ghost border `outline-variant` at 20% opacity）
- Focus：底部 2px `--primary` 色条 + `shadow-ring`
- Label：Inter 13px `--text-muted`
- Placeholder：Inter 14px `--text-faint`

### 3.8 Ant Design 主题覆盖

ConfigProvider token 映射：
```typescript
{
  token: {
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
  },
  components: {
    Button: { controlHeight: 40, controlHeightLG: 48 },
    Card: { paddingLG: 24, borderRadiusLG: 10 },
    Table: { headerBg: '#f0eee6', rowHoverBg: '#faf9f5' },
    Input: { activeBg: '#f0eee6', hoverBg: '#f0eee6' },
    Tag: { borderRadiusSM: 999 },
  }
}
```

---

## 4. 布局组件

### 4.1 MainLayout（公开页布局）

```
┌─ Navbar (64px, sticky, 毛玻璃) ──────────────────────────┐
│ [智 Logo] 智愿家  |  首页  院校库  专业库  查分  AI推荐  方案  |  登录  [注册] │
└──────────────────────────────────────────────────────────┘
    Content (max-width: 1200px, margin: 0 auto, px-12)
┌─ Footer ─────────────────────────────────────────────────┐
│ 4列: 品牌 | 产品 | 资源 | 支持                            │
│ ─────────────────────────────────────────────────────── │
│ © 2026 立方科技                    智愿家 — 你的升学智囊   │
└──────────────────────────────────────────────────────────┘
```

- 最大宽度：1200px
- 内容区 padding：`px-12` (48px)
- 页面背景：`var(--bg)` (#f5f4ed)

### 4.2 AuthLayout（登录/注册布局）

```
┌──────────────────────┬──────────────────────┐
│                      │                      │
│   品牌 Hero 面板      │     表单面板          │
│   (学院蓝底)          │     (暖白底)          │
│                      │                      │
│   智愿家              │     欢迎回来          │
│   智慧·志愿·专家      │     [用户名输入]       │
│                      │     [密码输入]         │
│   ✓ 特性列表          │     [登录按钮]         │
│   ✓ 社会证明          │     没有账号？注册      │
│                      │                      │
└──────────────────────┴──────────────────────┘
```

- 左面板：`var(--primary)` 背景 + 白色文字
- 右面板：`var(--surface)` 背景
- 移动端：左面板隐藏

### 4.3 SideNavLayout（用户中心/管理后台布局）

```
┌─ Sidebar (280px) ──┬─ Sticky Header (64px) ──────────┐
│ 智愿家              │ 页面标题    [通知] [头像]         │
│ ─────────────────  │──────────────────────────────── │
│ 导航项 (active:    │                                 │
│   primary bg tint) │   Content (p-8)                 │
│ ─────────────────  │                                 │
│ 帮助 | 退出         │                                 │
└───────────────────┴──────────────────────────────────┘
```

- Sidebar 宽度：280px（桌面），移动端折叠为 overlay
- Active 导航项：`var(--primary-fixed)` 背景 + `var(--primary)` 文字
- Sidebar 背景：`var(--surface)`

---

## 5. 页面设计

### 5.1 首页 (`/`)

**Hero 区**
- 左侧：Badge("2026 高考数据已更新") + 主标题("每一个志愿，都值得被认真对待。") + 副标题 + 双按钮(Primary + Ghost)
- 右侧：3 张浮动数据卡片（匹配院校数 + AI精准度 + 已服务家庭）
- 标题中"认真对待"使用 `--primary` 色强调

**信任数据条**
- 4 个数据点横排居中：2,800+ 院校 | 1,200+ 专业 | 15年数据 | 1,250万方案
- 数字用 Crimson Pro 28px semibold `--primary`

**核心能力区**
- `--surface-dim` 背景分区
- Section Label(11px uppercase `--accent`) + Title(Crimson Pro 36px) + Description
- 6 张功能卡片 3×2 网格：院校全景、专业洞察、AI 智能推荐、趋势分析、方案管理、隐私优先
- 卡片：`var(--surface)` 背景，hover shadow 升起

**使用流程区**
- 3 步：01 输入成绩 → 02 AI 生成方案 → 03 优化并导出
- 大号序号（Crimson Pro 64px `--border` 色）+ 标题 + 描述

**CTA 区**
- `--primary` 全宽背景
- 白色标题 + 哑光金按钮
- "你的未来，值得一份好方案"

### 5.2 AI 推荐页 (`/recommend`)

**布局**：左侧表单面板(380px) + 右侧结果区

**左侧面板**
- 背景：`var(--surface)`，sticky top-24
- 标题：Crimson Pro "智能推荐"
- 表单项：分数、位次、省份、科类（Select/Input，暖色底）
- 策略预设：平衡/激进/保守（Radio 卡片选择）
- 冲/稳/保比例：3 个 Slider
- 提交按钮：Primary gradient

**右侧结果区**
- 顶部：4 个 StatCard 横排（总推荐数/冲/稳/保）
- 分布进度条：冲(红)+稳(蓝)+保(绿) 三段式
- 推荐列表：每项为 RecommendationCard
  - 序号 + StatusChip + 院校名(Crimson Pro serif) + 专业名
  - 右侧录取概率（大号数字 + 语义色 + 进度条）
  - 底部：历史最低分 + 最低位次
- 操作栏：保存方案(Accent) + 导出 CSV(Ghost)

### 5.3 院校库 (`/universities`)

**布局**：顶部筛选栏 + 内容区 + 右侧热门栏(256px)

**筛选栏**
- 水平排列：省份(Select) + 类型(Select) + 特征(985/211/双一流 多选) + 性质 + 层次
- 筛选项使用 neutral StatusChip 风格

**院校卡片**
- `var(--surface)` 背景，hover shadow
- 院校名（Crimson Pro 18px semibold，链接到详情页）
- 地区 + 类型 + 性质（neutral chips）
- 标签行：985/211/双一流 chips
- 底部：最低分 + 位次（tabular-nums）
- 右侧：收藏星标

**右侧热门栏**
- "热门院校" 标题
- 排名列表：序号 + 院校名 + 地区

### 5.4 院校详情页 (`/universities/[id]`)

- Hero 区：院校名(Crimson Pro 36px) + 地区/类型/标签 + 收藏按钮
- 信息卡片网格：排名、录取分数线、招生计划等
- Tab 切换：概况 | 专业列表 | 录取数据 | 招生计划
- 历年分数线图表（ECharts，使用品牌色系）

### 5.5 专业库 (`/majors`)

**布局**：左侧分类导航(208px) + 中间内容 + 右侧热门(224px)

**左侧分类导航**
- 学科门类列表，每项前带色点
- Active 项：`--primary` 色 + 背景 tint

**专业卡片**
- 专业名（Crimson Pro semibold）+ 层次 badge
- 代码、学科门类、所属类别
- 就业率进度条 + 平均薪资
- 全部使用暖色底 + 语义色

### 5.6 专业详情页 (`/majors/[id]`)

- Hero 区：专业名 + 层次 badge + 学科分类
- 信息卡片：就业率、薪资、开设院校数
- Tab 切换：概况 | 开设院校 | 就业前景
- 开设院校列表（复用院校卡片样式）

### 5.7 查分系统 (`/scores`)

- 标题区：Crimson Pro "查分系统"
- 表单：省份 + 年份 + 科类 + 分数/位次
- 结果：一分一段表（Table 组件，暖色 header，hover 行高亮）
- 你的位置行：`--primary-fixed` 背景高亮

### 5.8 方案管理 (`/plan`)

- 顶部：3 个 StatCard（总方案数 + 匹配院校 + AI 精准度）
- 方案列表：2 列网格
- 方案卡片：
  - 方案名 + 状态 badge
  - 创建日期、省份、志愿数、年份
  - 冲/稳/保分布进度条（三色）
  - 操作：查看详情(Ghost) + 下载(Ghost)
- 空状态：鼓励文案 + CTA "创建第一个方案"

### 5.9 登录页 (`/login`)

- AuthLayout 分屏
- 左面板（`--primary` 蓝底）：
  - Logo + "智愿家" + "智慧·志愿·专家"
  - 特性列表（白色图标 + 文字）
  - 社会证明："125万+ 家庭的共同选择"
- 右面板：
  - "欢迎回来"（Crimson Pro 28px）
  - 用户名 + 密码输入框
  - 登录按钮（Primary gradient 全宽）
  - 底部："还没有账号？立即注册"

### 5.10 注册页 (`/register`)

- 同 AuthLayout
- 右面板：
  - "加入智愿家"（Crimson Pro 28px）
  - 用户名 + 密码 + 确认密码
  - 注册按钮
  - 底部："已有账号？去登录"

### 5.11 个人中心 (`/profile`)

- SideNavLayout
- 用户信息摘要卡片（头像 + 姓名 + 基本信息）
- Tab 切换：个人信息 | 考试信息 | 偏好设置
- 表单使用暖色底输入框 + 保存按钮(Accent)

### 5.12 收藏夹 (`/favorites`)

- SideNavLayout
- Tab：收藏的院校 | 收藏的专业
- 复用院校卡片/专业卡片样式
- 取消收藏：红色 text button

### 5.13 AI 配置 (`/ai-config`)

- SideNavLayout
- AI 引擎列表（卡片式）
- 配置表单
- 保持当前功能，仅换肤

### 5.14 数据导入 (`/data-import`)

- SideNavLayout
- 导入任务列表
- 上传区域
- 保持当前功能，仅换肤

---

## 6. 设计原则

### 6.1 无边框原则
- **禁止 1px 分隔线用于内容分区**
- 通过背景色阶梯（`surface` → `surface-dim`）分隔区域
- 唯一允许的显式边界：表单 ghost border（20% 透明度）、导航底部 1px、Footer 顶部 1px

### 6.2 呼吸式数据
- 数据密集区留足水平呼吸空间
- 数据集群间使用 `spacing-12`(48px) 到 `spacing-16`(64px) 创造"静谧区"
- 留白就是奢侈品

### 6.3 暖调灰阶
- 所有灰色含黄棕暖调
- 阴影使用暖色透明黑
- 像自然光打在优质纸张上的感觉

### 6.4 衬线权威
- 所有标题和数字展示使用衬线体
- 正文和 UI 控件使用无衬线体
- 衬线体是"学院导师"气质的核心载体

### 6.5 色彩克制
- 品牌色（学院蓝 + 哑光金）只出现在关键位置
- 大面积使用暖白/暖灰
- 语义色（冲/稳/保）仅用于状态指示，不做装饰

---

## 7. 技术实现要点

### 7.1 改动范围
- `apps/web/src/app/layout.tsx` — Ant Design ConfigProvider 主题 + 字体 + meta 信息
- `apps/web/src/app/globals.css` — CSS 变量 + 全局样式 + Ant Design 覆盖
- `apps/web/tailwind.config.js` — 色彩 token + 字体 + 阴影 + 间距
- `apps/web/src/components/layout/*` — 4 个布局组件全部重写视觉
- `apps/web/src/components/ui/*` — 3 个 UI 组件（GradientButton, StatCard, StatusChip）重写
- `apps/web/src/app/(auth)/*` — 登录/注册页
- `apps/web/src/app/(main)/*` — 7 个主页面
- `apps/web/src/app/(user)/*` — 2 个用户页面
- `apps/web/src/app/(admin)/*` — 2 个管理页面

### 7.2 不改动范围
- `apps/web/src/services/*` — API 服务层
- `apps/web/src/stores/*` — 状态管理
- `apps/web/src/hooks/*` — 自定义 hooks
- `apps/web/src/types/*` — 类型定义
- `apps/server/*` — 后端代码
- `services/ocr-service/*` — OCR 服务

### 7.3 字体引入
```typescript
// app/layout.tsx
import { Crimson_Pro, Inter, Noto_Sans_SC, Noto_Serif_SC } from 'next/font/google'

const crimsonPro = Crimson_Pro({ subsets: ['latin'], variable: '--font-serif', display: 'swap' })
const inter = Inter({ subsets: ['latin'], variable: '--font-sans', display: 'swap' })
```

### 7.4 品牌文案替换清单
| 原文 | 新文 |
|------|------|
| 巅峰智选 Summit Intelligence | 智愿家 |
| AI 驱动的升学志愿填报专家 | 智慧 · 志愿 · 专家 |
| 全球顶尖升学情报系统... | 基于 AI 与大数据的升学决策平台，让每一个志愿都被认真对待。 |
| 睿智抉择，定鼎未来。 | 每一个志愿，都值得被认真对待。 |
| 1000万+ 家庭的共同选择 | 125万+ 家庭的共同选择 |
| 录取指挥部 | 智愿家控制台 |
| Summit Intelligence | Zhiyuanjia |
| © 巅峰智选 | © 2026 立方科技 |

---

## 8. 附录

### 8.1 参考设计来源
- **Claude/Anthropic** — 暖色调体系、衬线标题、羊皮纸底色、无渐变哲学
- **Stripe** — 数据精密感、tabular-nums、蓝色调阴影层次
- **Notion** — 暖灰阶梯、超薄边框、内容优先布局

### 8.2 工具引用
- **awesome-design-md** (VoltAgent) — 品牌设计规范参考库
- **UI/UX Pro Max** — 配色搜索、字体搭配、UX 最佳实践数据库
- **frontend-design** (Claude Official Plugin) — 避免 AI 模板感的设计指导

### 8.3 mockup 文件
- 设计系统总览：`.superpowers/brainstorm/2328-*/content/design-system-overview.html`
- 配色方案：`.superpowers/brainstorm/2328-*/content/color-palette.html`
- 首页 mockup：`.superpowers/brainstorm/2328-*/content/mockup-homepage.html`
