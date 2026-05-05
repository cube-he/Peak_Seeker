# 院校详情页重设计 — 基本信息全字段化 + 招录数据横向年份透视

**日期**：2026-05-05
**作者**：与用户协同 brainstorming 产出
**目标页**：`/universities/[id]` （`apps/web/src/app/(main)/universities/[id]/page.tsx`）
**触发**：用户反馈 `http://132.232.245.53:3004/universities/9958` 当前问题——
1. 院校基础信息只展示了 13 个字段，DB 实际有 40+ 字段，大量信息被丢
2. 招生计划与历年录取均按"一行一记录"纵向堆叠，多年份散布在不同行，难以横向对比趋势

---

## 1. 现状盘点

### 1.1 基本信息字段缺漏

`University` 模型实际字段 vs 当前页面展示：

| 类别 | 已展示 | 未展示（缺失） |
|---|---|---|
| 基本 | 院校代码、省/市、类型、层次、办学性质、主管部门、排名 | `runningLevel` 办学层次、`grade` 院校等级、`createdYear` 办学历史、`campusArea` 校园面积、`maleRatio/femaleRatio` 男女比、`militaryTrainingDuration` 军训时长、`tags` 特色标签 |
| 学科 | 学科评估、硕博点数量、考研率、转专业难度、A 类学科数 | `masterPrograms` 硕士点列表、`doctoralPrograms` 博士点列表 |
| 排名 | 软科/校友会/QS/USNews（已用 `RankingCard`） | — |
| 满意度 | 综合/生活/环境/样本数（已用 `SatisfactionCard`） | — |
| 就业 | 就业率/深造率/平均薪资/主要去向（已用 `EmploymentCard`） | — |
| 软科 | — | `softRating`、`softRanking` 与 `RankingCard` 内的 `rankingSoft` 关系待确认（疑似冗余） |
| 其他 | 更名信息、招生章程 | `charterInfo` 章程详细 JSON、`notes` 备注 |

### 1.2 招生计划 / 历年录取的当前布局

- "招生计划"是一行一专业（专业组+专业名+计划数+批次+选科+学费+学科评估…），同一专业跨年份各占一行
- "历年录取"也是一行一记录（专业名+年份+最低分+最低位次+录取人数），多年份纵向堆叠
- DB 层 `AdmissionRecord` 已存有 `majorMinScore/majorMinRank/majorAvgScore/majorAvgRank/majorMaxScore/majorMaxRank/majorAdmissionCount/groupMinScore/groupMinRank/filingMinScore/filingMinRank/universityMinScore` 等丰富字段，前端只用了 3 个

---

## 2. 设计决策

### 2.1 基本信息：分组卡片化（决策 B）

把臃肿的 `<Descriptions>` 拆成多张并列卡片，沿用现有 `RankingCard / SatisfactionCard / EmploymentCard` 的视觉风格（圆角、shadow-card、标题图标）。空字段整组隐藏，整张卡片若全空则不渲染。

**卡片清单**：

| 卡片 | 字段 | 状态 |
|---|---|---|
| `OverviewCard` 概况 | 院校代码、省份/城市、类型、层次、办学层次、办学性质、主管部门、办学历史 (`createdYear`)、校园面积、男女比、特色标签 (`tags`) | **新建** |
| `DisciplineCard` 学科建设 | 学科评估、A 类学科数、硕士点数（点击展开列表 `masterPrograms`）、博士点数（同上 `doctoralPrograms`）、考研率、转专业难度 | **新建** |
| `CampusCard` 校园生活 | 军训时长、其他生活相关字段 | **新建（条件）** |
| `CharterCard` 招生章程 | `renameHistory` + `admissionGuide` + `charterInfo` JSON 渲染，长文本可折叠 | **新建（条件）** |
| `RankingCard` 多维排名 | 软科/校友会/QS/USNews | 已有，保持 |
| `SatisfactionCard` 满意度 | 综合/生活/环境/样本数 | 已有，保持 |
| `EmploymentCard` 就业 | 就业率/深造率/平均薪资/主要去向 | 已有，保持 |

**布局**：xs 单列，md 两列网格 (`grid grid-cols-1 md:grid-cols-2 gap-4`)。`CharterCard` 较长，独立放在网格上方占整行宽。

### 2.2 招生计划 + 历年录取：均改为横向年份透视（决策 B）

#### 2.2.1 行键（rowKey）

`majorName + groupCode + recruitType + subjects` 四字段组合（取自 7 字段自然主键中"专业身份"相关的最小子集）。

**理由**：
- 同名跨组（如同一专业 2022 在组 01、2024 改到组 03）合并会撒谎，必须拆开
- 新高考下"物化生 vs 物化政"是不同录取单元，必须按 `subjects` 区分
- `recruitType` 区分"普通类/中外合作/民族班"等

#### 2.2.2 年份范围

从原始数据 `[...admissions, ...plans].map(r => r.year)` 取 distinct，按降序取前 **3 年**（决策：3 年）。若 DB 中只有 1-2 年也只展示 1-2 年。

#### 2.2.3 透视后行结构

```ts
type PivotRow = {
  rowKey: string;          // majorName + groupCode + recruitType + subjects
  majorName: string;
  groupCode: string;
  recruitType: string;
  subjects: string;
  majorId: number;          // 任取一年的 majorId（用于跳转专业详情）
  byYear: {
    [year: number]: {
      planCount?: number;
      majorMinScore?: number;
      majorMinRank?: number;
      majorAdmissionCount?: number;
    }
  }
}
```

#### 2.2.4 排序

默认按"最新年份的 `majorMinRank` 升序"（位次低=分数高=好专业排前）。当行没有最新年份位次时，回退看更早年份；都没有就排最后。

#### 2.2.5 空值处理

某专业在某年没数据，对应单元格显示 `—`（不空着）；整行所有年份都空的过滤掉。

### 2.3 表格列设计（决策：招生计划 A + 历年录取 a）

#### 2.3.1 招生计划 Tab

```
| 专业组 | 专业名称 | 招生类型 | 选科 | 2024 | 2023 | 2022 |
|        |          |          |      | 计划 | 计划 | 计划 |
```

- **左侧固定 4 列**：专业组 (`groupCode`，灰色小字)、专业名称（链接到 `/majors/${majorId}`）、招生类型 (`recruitType`，徽章；普通本科省略不显示节省空间)、选科 (`subjects`，省略号截断，hover 显示全文)
- **右侧 N 列年份**：每列只显示「计划数」整数 + trend chip
- 首列 `fixed: 'left'`，年份列横向滚动

#### 2.3.2 历年录取 Tab

```
| 专业组 | 专业名称 | 选科 | 2024              | 2023              | 2022              |
|        |          |      | 最低分/位次/人数  | 最低分/位次/人数  | 最低分/位次/人数  |
```

- **左侧固定 3 列**：专业组、专业名称、选科（招生类型并入行键，必要时 hover 行查看）
- **每个年份 3 子列**：用 Ant Design Table 多级表头 (`children`) 实现：
  - `children: [ {title:'最低分'}, {title:'位次'}, {title:'人数'} ]`
- 最低分粗体黑色；位次千分位；人数灰色

#### 2.3.3 趋势可视化（trend chip）

每年关键数字旁加微型 chip：

- **招生计划**：`计划 60 ↑5`（绿色）/ `计划 60 ↓3`（红色）/ `计划 60 ─`（灰色，无变化）
- **历年录取最低分**：分数升 = 红色（更难考）/ 分数降 = 绿色（更易考）
- **历年录取位次**：位次升（数字变小）= 红色 / 位次降（数字变大）= 绿色

**红绿语义对学生友好**：绿色 = 对你有利。

最旧那年（最左/最右取决于排列方向）没有"上一年"参照，不显示 chip。

#### 2.3.4 响应式

- 表格统一 `scroll={{ x: 'max-content' }}`
- 移动端首列依然固定，用户左右刷年份不丢专业名

---

## 3. 组件拆分与文件落点

```
apps/web/src/components/university/
├── OverviewCard.tsx          # 概况卡片
├── DisciplineCard.tsx        # 学科建设卡片
├── CampusCard.tsx            # 校园生活卡片（可选/有数据才渲染）
├── CharterCard.tsx           # 招生章程卡片
├── PlanPivotTable.tsx        # 招生计划横向透视表
├── AdmissionPivotTable.tsx   # 历年录取横向透视表
└── lib/
    └── pivotByYear.ts        # 透视工具函数 + 类型定义（行键、排序、年份抽取）
```

**为什么把 pivot 逻辑抽出来**：两个表共用 GROUP BY + 取年份 + 排序的逻辑，只是聚合的字段不同。`pivotByYear<T>(records, options)` 写成泛型纯函数，单元测试容易。

**主页面 `[id]/page.tsx` 的改动**：

- 删除 `planColumns / admissionColumns` 内联定义和两个 `<Table>`
- 删除内联的大块 `<Descriptions>`
- Tab `info` children 改为：
  ```tsx
  <CharterCard u={u} />
  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
    <OverviewCard u={u} />
    <DisciplineCard u={u} />
    <CampusCard u={u} />
    <RankingCard ... />
    <SatisfactionCard ... />
    <EmploymentCard ... />
  </div>
  ```
- Tab `plans` children 改为 `<PlanPivotTable data={majors} />`
- Tab `admissions` children 改为 `<AdmissionPivotTable data={admissions} />`

主页面行数预计从 302 降到 ~120。

**测试**：
- `pivotByYear.test.ts`（apps/web 已配置 Jest）：覆盖正常透视、单年数据、跨年专业组变更不被合并、空数据
- 组件层不强制测试，开发预览验证

---

## 4. 实施顺序（5 个独立 commit）

| # | 任务 | 验收点 |
|---|---|---|
| 1 | 实现 `pivotByYear` 工具 + 类型 + 单测 | `pnpm --filter web test pivotByYear` 全绿；空数据/单年/跨组不合并 3 用例覆盖 |
| 2 | 实现 `PlanPivotTable` + `AdmissionPivotTable` 组件，接入主页 Tab | 浏览器打开 `/universities/9958`，"招生计划" 和 "历年录取" Tab 看到横向年份布局；首列固定；趋势 chip 方向正确 |
| 3 | 拆分基本信息 4 张新卡片，主页 Tab `info` 重组成 2 列卡片网格 | 基本信息 Tab 看到 6 张卡片（数据全的院校）；空字段组卡片整体不渲染；现有 3 张卡不动 |
| 4 | 主页文件清理：删除内联 `Descriptions`、`planColumns`、`admissionColumns` | 文件行数从 ~302 降到 ~120；视觉与第 3 步等价 |
| 5 | 视觉细节打磨：trend chip 红绿语义、首列固定、年份列头样式、移动端横向滚 | 手机视口首列不丢；超过 3 年（如有）滚动行为正常 |

---

## 5. 非破坏性约束 & 风险

### 5.1 不动的部分

- 后端 `university.controller.ts` / `service.ts` 不动
- 现有 `RankingCard / SatisfactionCard / EmploymentCard / QiangjiTable / HeroBanner / UniversityLogo` 不动
- `apps/web/src/services/university.ts` 服务层 API 不动
- 数据库 schema 不动

### 5.2 风险

- **真实数据填充率**：DB 中是否所有字段都有值需运行验证。空字段卡片隐藏策略已覆盖。
- **趋势 chip 红绿方向**：位次升=红/分数降=绿这一对感性映射，开发第 5 步要盯两眼，避免方向反了误导学生。
- **`softRating/softRanking` 与 `RankingCard.rankingSoft` 关系**：未确认是否冗余。本设计不处理；若发现重复，作为后续清理项单独提单。

---

## 6. 验收标准（用户视角）

打开 `http://132.232.245.53:3004/universities/9958`：

1. "基本信息" Tab：看到 ≥5 张并列卡片（取决于该校数据填充情况），显著比当前的 13 字段 Descriptions 信息密度高
2. "招生计划" Tab：每个专业（按行键聚合）一行，最近 3 年的计划数横向并排，比当前易看出"该专业招生规模逐年趋势"
3. "历年录取" Tab：每个专业一行，最近 3 年的最低分/位次/人数横向并排，每年 3 子列，比当前易看出"该专业分数线逐年趋势"
4. 横向滚动只滚年份列，专业名/选科/专业组始终可见
