# 首页志愿填报进度时间轴

## 概述

在首页 Hero 下方新增"高考时间轴"板块，实时展示高考→成绩查询→各批次录取的流程进度。数据通过爬取四川省教育考试院官网公告自动更新，让学生一眼知道"现在该关注什么"。

## 节点与状态

### 5个主节点

| 序号 | 节点 | 状态流转 |
|------|------|---------|
| 1 | 高考 | 倒计时(天数) → 进行中 → 已完成 |
| 2 | 成绩查询 | 预计 → 可查询 |
| 3 | 本科提前批 | 预计 → 填报中 → 录取中 → 征集(N轮) → 已完成 |
| 4 | 本科批 | 同上 |
| 5 | 专科批 | 同上 |

### 状态视觉映射

| 状态 | 节点样式 | 尺寸 | 连接线 | 文字色 |
|------|---------|------|--------|--------|
| 当前活跃（任意状态） | accent金 + 脉冲动画 | **56px** | accent金实线 | accent金 |
| 已完成 | safe绿 + ✓ | 40px | safe绿实线 | text默认 |
| 倒计时 | accent金渐变 + 天数数字 | **56px** | — | accent金 |
| 预计/待开始 | border灰 + 序号 | 40px | border灰 | text-muted |

关键规则：**当前活跃节点比其余节点大一圈（56px vs 40px）**，无论处于哪个阶段，始终只有一个节点是大的。

### 点击展开详情

点击任意节点展开详情面板（桌面端弹出浮层，移动端内联展开），包含：

- 具体日期区间
- 当前子状态说明（如"征集志愿截止 7/11 12:00"）
- 剩余时间（征集阶段）
- 考试院原文公告链接

## 前端布局

### 位置

首页 Hero section 下方、Trust Bar 上方，作为独立 section。

### 桌面端（≥1024px）

水平时间轴：
- 5个节点从左到右排列，中间用连接线串联
- 连接线颜色根据节点状态：已完成段为绿色，当前活跃段为金色，未来段为灰色
- section 标题：`录取进度` + `2026 四川高考时间轴`
- 底部说明：`数据来源：四川省教育考试院 · 每日自动更新`

### 移动端（<768px）

自动切换为垂直步骤条：
- 每个节点占一行，左侧圆圈 + 连接竖线，右侧文字信息
- 活跃节点详情直接内联展开，不需要弹出浮层

### 样式复用

- 状态色：复用 design token（safe/accent/border）
- StatusChip 样式：复用已有圆角标签组件风格
- 字体：标题用 serif（Crimson Pro），辅助文字用 sans

## 数据架构

### 数据模型

新增 `TimelineEvent` 表：

```
TimelineEvent {
  id            Int       @id @default(autoincrement())
  key           String    // 'gaokao' | 'score_query' | 'early_batch' | 'regular_batch' | 'vocational_batch'
  name          String    // "高考"、"本科提前批"等
  status        String    // 'countdown' | 'in_progress' | 'filling' | 'collecting_1' | 'collecting_2' | 'collecting_3' | 'completed' | 'estimated' | 'available'
  sortOrder     Int       // 1-5
  startDate     DateTime? // 预计/实际开始日期
  endDate       DateTime? // 预计/实际结束日期
  detail        Json?     // 征集截止时间等子信息
  sourceUrl     String?   // 考试院公告链接
  year          Int       // 2026
  updatedAt     DateTime  @updatedAt
  createdAt     DateTime  @default(now())

  @@unique([key, year])
}
```

### 初始数据

每年高考前由系统预填各节点的预计日期（基于上一年时间线），状态全部设为 `estimated`，高考节点设为 `countdown`。

## 爬虫设计

### 数据源

`https://www.sceea.cn/List/NewsList_36_1.html`（高考专区新闻列表，第1页）

### 页面结构

```html
<ul id="list">
  <li>
    <a href="/Html/YYYYMM/Newsdetail_XXXX.html" title="公告标题">公告标题</a>
    <p>YYYY/MM/DD HH:MM:SS</p>
  </li>
</ul>
```

静态 HTML，无需 JS 渲染。只抓列表页标题和日期，不进入内文。

### 标题匹配规则（基于2025年真实公告）

| 标题模式 | 匹配正则 | 目标节点 | 状态 |
|---------|---------|---------|------|
| "高考顺利结束" | `/高考.*(顺利)?结束/` | gaokao | completed |
| "成绩查询方式公布" / "成绩分段统计表" | `/成绩.*(查询\|公布\|分段统计)/` | score_query | available |
| "录取控制分数线" | `/录取控制分数线/` | score_query | available（辅助确认） |
| "本科提前批.*投档录取开始" / "开始录取" / "正在录取" | `/本科提前批.*(投档录取开始\|开始录取\|正在录取)/` | early_batch | in_progress |
| "本科提前批.*征集志愿" | `/本科提前批.*征集志愿/` | early_batch | collecting_N（按"第N次"判断轮次，无标注为第1次） |
| "本科批次.*投档" / "开始录取" | `/本科批次.*(投档\|开始录取\|正在录取)/` | regular_batch | in_progress |
| "本科批次.*征集志愿" | `/本科批次.*征集志愿/` | regular_batch | collecting_N |
| "专科.*开始录取" / "正在录取" | `/(专科\|高职).*(开始录取\|正在录取)/` | vocational_batch | in_progress |
| "专科批次征集志愿" | `/(专科\|高职).*征集志愿/` | vocational_batch | collecting_N |
| "录取顺利结束" / "录取工作结束" | `/录取.*(顺利)?结束/` | 全部 | completed |
| "志愿填报时间" | `/志愿填报时间/` | （提取填报窗口信息存入 detail） | — |

### 征集轮次识别

- 标题无"第N次" → 第1轮征集 → `collecting_1`
- 标题含"第二次" → `collecting_2`
- 标题含"第三次" → `collecting_3`

### 频率与合法性

- **常规期**（考前/考后非录取期）：每天凌晨 4:00 一次
- **录取期**（6/25 - 8/15）：每天 4:00 + 20:00 两次
- **单次请求**：仅抓第1页（~15条），1个 HTTP 请求
- **请求间隔**：若需翻页，间隔 ≥2秒
- **User-Agent**：真实浏览器 UA，不伪装爬虫/搜索引擎
- **容错**：抓取失败不覆盖已有数据，记录日志，连续3次失败告警
- **robots.txt**：仅禁止 `/PreView`，新闻列表路径允许

### 更新逻辑

1. 抓取列表页，提取所有标题 + 日期
2. 按日期倒序，只处理上次抓取之后的新公告
3. 逐条匹配正则规则
4. 命中时更新对应 `TimelineEvent` 的 status、detail、sourceUrl
5. 状态只能前进不能后退（如 `in_progress` 不会回退到 `estimated`）

## 前端组件

### `TimelineTracker` 组件

- 位置：`apps/web/src/components/home/TimelineTracker.tsx`
- 数据获取：API `GET /api/timeline?year=2026` 返回5个节点数据
- 倒计时天数：前端根据 `new Date()` vs `startDate` 实时计算，无需后端
- 响应式：`lg:flex-row flex-col` 切换横竖布局
- 点击展开：桌面端 absolute 浮层，移动端 inline 展开

### API

```
GET /api/timeline?year=2026

Response: {
  events: [
    {
      key: "gaokao",
      name: "高考",
      status: "countdown",
      sortOrder: 1,
      startDate: "2026-06-07",
      endDate: "2026-06-09",
      detail: null,
      sourceUrl: "https://www.sceea.cn/...",
    },
    ...
  ]
}
```

## Mockup 参考

可视化 mockup 保存在 `.superpowers/brainstorm/1912-1777510342/content/`：
- `timeline-approaches.html` — 3种布局方案对比
- `timeline-detail.html` — 录取阶段完整交互（桌面+移动端）
- `timeline-countdown.html` — 高考前倒计时阶段效果
