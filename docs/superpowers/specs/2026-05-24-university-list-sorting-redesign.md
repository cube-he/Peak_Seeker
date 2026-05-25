# 院校列表页排序功能改进 — 可行方案

**日期**：2026-05-24
**作者**：Claude + 用户协同 brainstorming
**状态**：Draft → 待用户 review 决定是否执行
**位置**：方案文档，未拆 plan、未实施

---

## 1. 背景

院校列表页 `/universities` 当前排序能力（按调研结果）：

| UI 控件 | 6 个 segment 按钮，平铺一行 |
| 选项 | 默认 / 位次 / 软科 / 冲稳保 / 省份 / 类型 |
| 默认 | name asc（按拼音 A-Z） |
| 升降序 | 只允许升序，无切换按钮 |
| 后端 sortBy 枚举 | `name / province / type / minRank / tier / softRank` |

主要痛点：
1. **只升序** — "按毕业薪资从高到低" / "按校园面积从大到小" 这类家长高频需求无法满足
2. **大量字段未暴露** — 已入库但 UI 看不到：校友会/QS/USNews 排名、A 类学科数、就业率、平均薪资、考研率、3 项满意度、校园面积、建校年份
3. **默认 name asc 信息量低** — 拼音 A 开头的院校先出来对家长无价值
4. **科类耦合隐式** — `minRank` 默默按物理/历史选字段，UI 不标注

---

## 2. 范围

### 在范围内

- 扩展排序维度从 6 项 → 14+ 项
- 加升降序切换（每个按钮独立）
- 改默认排序为 `isFeatured DESC, softRanking ASC NULLS LAST`
- 重组 UI：热门 6 个按钮常驻 + "更多排序 ↓" popover 浮层展开高级选项
- 后端 DTO 扩展 sortBy 枚举 + service 加新字段映射
- 必要时为新排序字段补数据库索引

### 不在范围内

- 多字段复合排序（如"同时按软科 + 就业率"）— YAGNI，无 UI 需求
- 排序结果的可视化（如"按薪资降序"时在列表卡里高亮薪资数字）— 可作 Phase 2
- 保存用户偏好排序到 localStorage — 可作 Phase 2

---

## 3. 设计

### 3.1 UI

**热门按钮**（6 个，常驻）：

```
[默认]  [位次 ↑]  [软科 ↑]  [冲稳保]  [省份 ↑]  [类型]
```

**"更多排序 ↓" popover**（点击 button 展开浮层，点外面关闭）：

```
┌──────────────────────────────────────────┐
│ 院校排名: [校友会 ↑] [QS ↑] [USNews ↑]    │
│ 学科实力: [A 类学科数 ↓] [硕博点数 ↓]     │
│ 就业表现: [就业率 ↓] [平均薪资 ↓] [考研率 ↓]│
│ 学生评价: [综合满意度 ↓] [生活 ↓] [环境 ↓] │
│ 其他:    [校园面积 ↓] [建校年份]          │
└──────────────────────────────────────────┘
```

### 3.2 升降序行为

每个排序按钮独立切换（3 态循环）：
- **未选** → 第 1 次点 → **选中 + 升序** ↑
- 选中 → 第 2 次点 → **降序** ↓
- 降序 → 第 3 次点 → **未选**（取消，回 default）

**例外**：排名类按钮（软科/校友会/QS/USNews）锁定升序，按钮上不显示 ↓ 图标（因为 "#1 最佳"，降序无意义）。

**视觉**：
- 未选：白底灰字
- 选中：主色背景白字 + 升降序图标
- 鼠标悬停：浅主色背景

### 3.3 默认行为

- **默认排序**：`isFeatured DESC, softRanking ASC NULLS LAST`
  - "推荐院校"先出来（运营运营标记的热门）
  - 同推荐状态下按软科综合排名靠前的优先
  - 没有 softRanking 的院校沉底
- **"默认"按钮**：点击 = 清除所有选中状态 + 回到默认排序
- **进入页面**：等同于点击"默认"

### 3.4 与 examInfo 交互

- `位次` 按钮：根据 `examInfo.subjects[0]` 自动选 `minRankPhysics` 或 `minRankHistory`。如果 examInfo 没填 subjects，按钮 disabled + tooltip "选填科类后启用"
- `冲稳保` 按钮：需要 `examInfo.rank` 才能用。未填则 disabled + tooltip "输入位次后启用"

---

## 4. 数据层改动

### 4.1 后端 DTO 扩展

`apps/server/src/modules/university/dto/query-university.dto.ts`

`sortBy` 枚举值从 6 个扩展到 17 个：

```typescript
@IsIn([
  // 现有
  'name', 'province', 'type', 'minRank', 'tier', 'softRank',
  // 新增 - 排名类
  'rankingAlumni', 'rankingQS', 'rankingUSNews',
  // 新增 - 学科类
  'aClassDisciplineCount', 'masterProgramCount',
  // 新增 - 就业类
  'employmentRate', 'avgSalary', 'furtherStudyRate',
  // 新增 - 满意度类
  'satisfactionOverall', 'satisfactionLife', 'satisfactionEnviron',
  // 新增 - 其他
  'campusArea', 'createdYear', 'isFeatured',
])
sortBy?: string = 'isFeatured';  // 默认改成 isFeatured（service 会复合 softRanking）

@IsIn(['asc', 'desc'])
sortOrder?: 'asc' | 'desc' = 'desc';  // isFeatured 默认 desc
```

### 4.2 后端 service 改造

`apps/server/src/modules/university/university.service.ts`

**字段映射表**（替换当前 L78-82 的 if/else）：

```typescript
// 将 sortBy 映射到 prisma orderBy 的实际字段名
function mapSortBy(sortBy: string, examType?: '物理'|'历史'): { field: string; isNullable: boolean } {
  if (sortBy === 'minRank') {
    return { field: examType === '历史' ? 'minRankHistory' : 'minRankPhysics', isNullable: true };
  }
  if (sortBy === 'tier') {
    return { field: examType === '历史' ? 'predRankHistory' : 'predRankPhysics', isNullable: true };
  }
  const map: Record<string, { field: string; isNullable: boolean }> = {
    softRank: { field: 'softRanking', isNullable: true },
    rankingAlumni: { field: 'rankingAlumni', isNullable: true },
    rankingQS: { field: 'rankingQS', isNullable: true },
    rankingUSNews: { field: 'rankingUSNews', isNullable: true },
    aClassDisciplineCount: { field: 'aClassDisciplineCount', isNullable: true },
    masterProgramCount: { field: 'masterProgramCount', isNullable: true },
    employmentRate: { field: 'employmentRate', isNullable: true },
    avgSalary: { field: 'avgSalary', isNullable: true },
    furtherStudyRate: { field: 'furtherStudyRate', isNullable: true },
    satisfactionOverall: { field: 'satisfactionOverall', isNullable: true },
    satisfactionLife: { field: 'satisfactionLife', isNullable: true },
    satisfactionEnviron: { field: 'satisfactionEnviron', isNullable: true },
    campusArea: { field: 'campusArea', isNullable: true },
    createdYear: { field: 'createdYear', isNullable: false },
    isFeatured: { field: 'isFeatured', isNullable: false },
    name: { field: 'name', isNullable: false },
    province: { field: 'province', isNullable: false },
    type: { field: 'type', isNullable: false },
  };
  return map[sortBy] ?? { field: 'name', isNullable: false };
}
```

**默认复合排序**（特例）：

```typescript
if (sortBy === 'isFeatured' && noUserOverride) {
  // 默认排序 = isFeatured DESC + softRanking ASC NULLS LAST
  return prisma.university.findMany({
    where,
    orderBy: [
      { isFeatured: 'desc' },
      { softRanking: 'asc' },  // Prisma: nulls last by default for asc
    ],
    skip, take,
  });
}
```

**Nullable 字段排序**：复用现有的内存 `sortRows` 函数（L107-126）规避 MariaDB NULL 排首坑。但**性能考虑**：内存排序 + 后分页对大表慢，应优先尝试 Prisma 7 的 `nulls: 'last'` 选项（如支持）— 实施时验证。

### 4.3 数据库索引

为新排序字段在 `apps/server/prisma/schema.prisma` `University` model 上加 `@@index`：

```prisma
@@index([rankingAlumni])
@@index([rankingQS])
@@index([rankingUSNews])
@@index([aClassDisciplineCount])
@@index([employmentRate])
@@index([avgSalary])
@@index([satisfactionOverall])
@@index([campusArea])
@@index([createdYear])
@@index([isFeatured, softRanking])  // 复合索引支持默认排序
```

需要 `npx prisma migrate dev --name add_sort_indexes` 生成迁移。

**影响评估**：
- 院校表约 3000 行，加这些索引磁盘开销 < 5MB
- 写入慢一点（每次 UPDATE 要维护索引），但院校数据基本是离线 ETL 灌入，业务上写入频率极低
- 查询从 O(N log N) 全表排序降到 O(log N)

---

## 5. 前端组件改动

### 5.1 文件结构

```
apps/web/src/app/(main)/universities/components/
├── UniversityListTab.tsx              [改]  排序按钮区域重写
├── sort/                              [新]  排序相关子组件
│   ├── SortButton.tsx                       单个排序按钮（含升降序循环）
│   ├── SortMorePopover.tsx                  "更多排序"浮层
│   ├── sort-options.ts                      排序选项定义（label / sortBy 映射 / 是否锁升序）
│   └── __tests__/...
```

### 5.2 数据结构

`sort-options.ts`：

```typescript
export type SortDirection = 'asc' | 'desc' | null;  // null = 未选

export interface SortOption {
  key: string;           // sortBy 值
  label: string;         // UI 显示
  group: SortGroup;      // 分组（hot / ranking / discipline / employment / satisfaction / other）
  lockedAsc?: boolean;   // 排名类锁升序（不允许降序）
  defaultDir?: 'asc' | 'desc';  // 第一次点击的方向
  requiresExamType?: boolean;
  requiresUserRank?: boolean;
}

export const SORT_OPTIONS: SortOption[] = [
  // 热门组
  { key: 'default', label: '默认', group: 'hot' },
  { key: 'minRank', label: '位次', group: 'hot', defaultDir: 'asc', lockedAsc: true, requiresExamType: true },
  { key: 'softRank', label: '软科', group: 'hot', defaultDir: 'asc', lockedAsc: true },
  { key: 'tier', label: '冲稳保', group: 'hot', defaultDir: 'asc', requiresUserRank: true },
  { key: 'province', label: '省份', group: 'hot', defaultDir: 'asc' },
  { key: 'type', label: '类型', group: 'hot', defaultDir: 'asc' },

  // 排名类（弹层）
  { key: 'rankingAlumni', label: '校友会', group: 'ranking', defaultDir: 'asc', lockedAsc: true },
  { key: 'rankingQS', label: 'QS', group: 'ranking', defaultDir: 'asc', lockedAsc: true },
  { key: 'rankingUSNews', label: 'USNews', group: 'ranking', defaultDir: 'asc', lockedAsc: true },

  // 学科类
  { key: 'aClassDisciplineCount', label: 'A 类学科数', group: 'discipline', defaultDir: 'desc' },
  { key: 'masterProgramCount', label: '硕博点数', group: 'discipline', defaultDir: 'desc' },

  // 就业类
  { key: 'employmentRate', label: '就业率', group: 'employment', defaultDir: 'desc' },
  { key: 'avgSalary', label: '平均薪资', group: 'employment', defaultDir: 'desc' },
  { key: 'furtherStudyRate', label: '考研率', group: 'employment', defaultDir: 'desc' },

  // 满意度
  { key: 'satisfactionOverall', label: '综合满意度', group: 'satisfaction', defaultDir: 'desc' },
  { key: 'satisfactionLife', label: '生活满意度', group: 'satisfaction', defaultDir: 'desc' },
  { key: 'satisfactionEnviron', label: '环境满意度', group: 'satisfaction', defaultDir: 'desc' },

  // 其他
  { key: 'campusArea', label: '校园面积', group: 'other', defaultDir: 'desc' },
  { key: 'createdYear', label: '建校年份', group: 'other', defaultDir: 'asc' },
];
```

### 5.3 SortButton 组件

```typescript
interface Props {
  option: SortOption;
  current: { key: string; direction: SortDirection } | null;
  disabled?: boolean;
  onChange: (key: string, direction: SortDirection) => void;
}
```

行为：
1. 点击未选按钮 → emit `(key, option.defaultDir ?? 'asc')`
2. 点击已选升序按钮 → 如果 `lockedAsc` 则切回未选，否则切到降序
3. 点击已选降序按钮 → 切回未选
4. 点击其他选中按钮的影响：先 emit 当前清除，再 emit 新按钮选中

### 5.4 UniversityListTab 改造

替换 L23-34 的 SORTS 常量 + L513-567 的排序按钮渲染逻辑：

```tsx
const [activeSort, setActiveSort] = useState<{ key: string; direction: SortDirection } | null>(null);

const hotOptions = SORT_OPTIONS.filter(o => o.group === 'hot');
const moreOptions = SORT_OPTIONS.filter(o => o.group !== 'hot');

// 提交查询时
const queryParams = {
  ...,
  sortBy: activeSort?.key ?? 'isFeatured',  // 默认
  sortOrder: activeSort?.direction ?? 'desc',
};

return (
  <div className="flex flex-wrap gap-2 items-center">
    {hotOptions.map(o => (
      <SortButton key={o.key} option={o} current={activeSort} onChange={setActiveSort} />
    ))}
    <SortMorePopover options={moreOptions} current={activeSort} onChange={setActiveSort} />
  </div>
);
```

---

## 6. 实施任务（如果决定做）

按依赖顺序：

1. **后端 DTO + service 改造** — 扩展 sortBy 枚举、加 mapSortBy 映射、默认复合排序
2. **数据库迁移** — schema 加 `@@index`、`prisma migrate dev`、验证查询 plan
3. **后端单元测试** — 14 个新 sortBy 值的 prisma orderBy 映射、默认复合排序、nullable 字段处理
4. **前端 sort-options.ts** — 数据定义
5. **前端 SortButton 组件** + 测试（升降序循环、locked、disabled）
6. **前端 SortMorePopover 组件** + 测试（点击外面关闭、分组渲染）
7. **UniversityListTab 集成** + 删除老 SORTS 常量 + 删除老排序按钮渲染
8. **手动验证** — 14 个排序选项 + 升降序切换 + popover 行为 + 不同 examInfo 状态
9. **部署 + 清 Redis cache**

预估工作量：**6-8 小时** 实施 + 1 小时调试 + 30 分钟部署。

---

## 7. 风险

| 风险 | 缓解 |
|---|---|
| 大表排序性能（即使加索引） | 加索引 + 验证 EXPLAIN；如果仍慢，考虑 Elasticsearch 接管列表查询（Phase 2） |
| Prisma 7 的 `nulls: 'last'` 支持情况 | 实施时优先验证；如不支持，回退到现有内存 `sortRows` |
| 用户对"3 态循环"按钮的学习成本 | 第一次进入时按钮上有 ↑ 暗示；hover tooltip 说明"再点切换降序" |
| 排名类锁升序的设计可能让用户困惑 | label 加暗示"软科 (#1 最佳)"或保留 ↑ 图标但置灰禁用 |
| 数据稀疏的字段排序后大量院校沉底（如 QS 排名只有 ~50 所院校有数据） | 在 UI 上加提示"仅显示 N 所有 QS 排名的院校"或 chip 显示总数变化 |

---

## 8. 验收标准

- `/universities` 进入：看到 6 个热门按钮 + "更多排序 ↓"
- 点击"更多排序" → popover 浮层展开 5 个分组共 11+ 选项
- 点击任一按钮 → 选中 + 升降序图标 + 列表重排
- 再点 → 切到降序（除排名类）→ 数据顺序反转
- 再点 → 取消，回默认（isFeatured + softRanking）
- 点击"默认"按钮 → 清除所有选中，回默认排序
- "位次"按钮在未填科类时 disabled + tooltip
- "冲稳保"按钮在未填位次时 disabled + tooltip
- 切换排序 → 网络请求 sortBy/sortOrder 参数正确

---

## 9. 待用户决定

这只是**方案**，不是 implementation。要不要做、什么时候做、要不要拆分（先做 backend 后做 frontend）— 你说了算。

**几个细节我没拍板，留你决定**：

1. **排名类锁升序的视觉**：
   - 选项 A：按钮上完全不显示 ↓ 图标
   - 选项 B：显示 ↓ 但禁用（hover 时灰色 + tooltip "排名类只支持升序"）
2. **"更多排序"按钮的暗示**：是否在按钮上显示"(8)"代表里面有 8 个未暴露的选项？
3. **首屏默认排序 isFeatured DESC 的覆盖率**：数据库里多少院校 isFeatured = true？如果 < 50 个，前几页都是推荐院校用户可能觉得"为什么这些学校都很奇怪"。是否需要更细的默认（如 isFeatured + softRanking + 985/211 兜底）？
