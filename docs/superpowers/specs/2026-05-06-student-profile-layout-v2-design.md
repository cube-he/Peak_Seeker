# Student Profile Layout v2 Design

**日期**：2026-05-06
**作者**：Claude (with @user-延续昨天的 redesign)
**状态**：implemented 2026-05-06 (8 commits, 78/78 tests pass, deployed)

## 背景

Profile 重构 v1 上线后用户反馈"排版不好看，十分浪费空间"。复盘当前页：64 字段单列 × 75px 行高 ≈ 5500px 总高度，桌面 1440px 屏宽只用了 ~400px，约 60% 空间浪费。

根因：
1. **单列**：所有字段无论宽度需求都占满一行
2. **全文本输入**：64 字段全是 antd `<Input>`，布尔填 `'true'/'false'`、地址填省市县字符串等不友好
3. **进度条+SaveStatusBar 各占顶部 1 行**：累计 ~120px 永远占着
4. **7 个 Card 始终展开**：低频字段挤压视野

## 目标

把页面"密度"和"控件契合度"双提升，桌面前 3 版块展开 + 后 4 折叠时总高度 ~1200px（节省 78%）。

**成功标准**（可验证）：
- 桌面 1440px 屏宽下，"基础信息+分数+户籍" 三个版块全展开 ≤ 1300px
- 控件类型契合数据：布尔→Switch、数字→InputNumber、单选→Radio、多选→Select tag、长文本→TextArea
- 自动保存语义不变（debounce 1.5s + zustand store + provenance 写入），仅 UX 包装变化
- 顶部进度条压缩到一行，缺失字段以行动指引方式展示
- 保存提示从顶部 sticky bar 改为右下角 toast（自动 1.5s 消失）
- 所有 v1 测试继续 pass + 新控件每个有单测

## 非目标

- 不做拖拽排序、不做字段级评论、不做实时协同
- 不引入富文本编辑、不引入字段级权限可视化（v1 已有 ProvenanceBadge）
- 不重写后端（数据模型 + API 不变）
- 不删除 stage 兼容入口

## 决策记录

| 决策 | 选择 | 理由 |
|---|---|---|
| 控件升级范围 | **a** 全部 8 类 | 一次到位避免返工；UX 提升最大 |
| Section 折叠 | **A** 前 3 默认展开 | 高频字段直接可见；低频不挤屏 |
| 进度条样式 | **X** 单行紧凑+缺失字段 | 节省垂直空间；缺失字段是行动指引 |
| SaveStatusBar | **Q** 右下角浮动 toast | 不挤页面；Notion/GoogleDocs 同款 |

## 设计

### 1) 字段→控件映射（共 64 字段，约定见下表）

| 类型 | 字段 | 数 | 控件 |
|---|---|:-:|---|
| **bool** | isRural, colorBlind, colorWeak, militaryInterest, teacherInterest, remoteAreaAcceptance, coldMajorAcceptance, acceptSinoForeign, acceptPrivate, acceptCooperation | 10 | `<Switch>` |
| **number(int)** | totalScore, scoreChinese/Math/English/FirstChoice/Sub1/Sub2, height, weight, tuitionBudget, provincialRank(只读) | 11 | `<InputNumber>` |
| **number(decimal)** | visionLeft/Right, visionLeftCorrected/RightCorrected | 4 | `<InputNumber step=0.1>` |
| **single radio** | gender(男/女), examType(物理类/历史类), firstChoice(物理/历史), priorityMode(city/university/major), stayPreference(stay/leave/no_pref), formFiller | 6 | `<Radio.Group>` |
| **multi-select(限定)** | reChoices(再选 2 科:化/生/政/地), preferredBatches | 2 | `<Checkbox.Group>` 或 `<Select mode=multiple maxCount>` |
| **multi-select(开放/标签)** | preferredProvinces, preferredCities, preferredMajors, preferredUniversities, preferredMajorCategories, preferredTags, excludedProvinces, excludedCities, excludedUniversities, excludedMajors | 10 | `<Select mode=tags>` |
| **textarea(长文本)** | careerPlan, careerDirection, interests, selfDescription, physicalLimits, medicalHistory, otherRequirements, bonusItems | 8 | `<Input.TextArea autoSize>` |
| **cascader(地址)** | (province+city+county), (examLocationProvince+City+County) | 2 组 | `<Cascader>`（包既有 `CountyCascader`） |
| **plain text** | realName, phone, parentPhone, ethnicity, politicalStatus, personalityType, bonusPolicyStatus | 7 | `<Input>`（保留 AutoSaveField）|
| **readonly** | provincialRank | 1 | `<Tag>` |

合计：10 + 11 + 4 + 6 + 2 + 10 + 8 + 2组(=6字段) + 7 + 1 = **65 个控件位**（reChoices 也在 multi-select 限定内已计；2 个 cascader 各覆盖 3-4 字段）。

### 2) 抽取共享 hook

新建 `apps/web/src/hooks/useAutoSave.ts`，提取 AutoSaveField 中的 debounce + store 派遣逻辑：

```ts
export function useAutoSave(fieldKey: string) {
  // 返回一个 debounced(1.5s) commit 函数
  // 内部封装：setSaving → patchMyProfile → setSaved/setError
  // 暴露 cancel() 用于卸载清理
  return { commit: (value: unknown) => void, cancel: () => void };
}
```

### 3) 8 个 AutoSave* 控件

每个控件：
- 内部 useState 管 value（受控）
- 用 `useAutoSave(fieldKey)` 拿 commit
- onChange → setValue + commit(value)
- 接受 `defaultValue`、`fieldKey`、各控件特有 props

文件清单：
```
apps/web/src/components/student/auto-save/
├── useAutoSave.ts (hook)
├── AutoSaveField.tsx       (现有；改用 useAutoSave)
├── AutoSaveNumber.tsx      (新)
├── AutoSaveSwitch.tsx      (新)
├── AutoSaveRadio.tsx       (新)
├── AutoSaveCheckbox.tsx    (新)
├── AutoSaveSelect.tsx      (新；mode 'tags'|'multiple'|undefined)
├── AutoSaveTextArea.tsx    (新)
├── AutoSaveCascader.tsx    (新；适配既有 CountyCascader)
└── __tests__/...
```

> 备注：现有路径 `apps/web/src/components/student/AutoSaveField.tsx` 移动到 `auto-save/` 子目录；老 import 路径全部更新（grep 一次性 sed 替换）。

### 4) Section 改造

每个 section 改成：
- 用 `<Row gutter={[16, 8]}>` + `<Col>` 多列
- 字段宽度按类型分配：超短 4/24，普通 8/24，长文本 24/24
- Form `layout="horizontal"`（label 在左，控件在右），`labelCol={span:8}` `wrapperCol={span:16}` 让标签紧凑
- 控件用对应 `AutoSave*`

例如 ScoreSection 桌面布局：
```
Row1: [总分][语][数][英][首][再1][再2]  ← 7 个 InputNumber 各占 ~14%
Row2: [首选 Radio (物/历)] [再选 Checkbox (化/生/政/地)]
Row3: [全省位次 Tag]
```

### 5) 紧凑进度条

替换现有 ProgressBar 双轨为单行组件 `<CompactProgress>`：

```tsx
<div className="flex items-center gap-2 text-xs">
  <Progress percent={overall} size="small" className="flex-1" />
  <span className="text-text-faint">{filledCount}/{totalCount}</span>
  {missing.length > 0 && (
    <span className="text-text-faint">· 缺：{missing.slice(0,3).join('、')}{missing.length>3?` 等${missing.length}项`:''}</span>
  )}
</div>
```

去掉"自填进度+总进度"双轨，只保留 overall。

### 6) Toast SaveStatusBar

改写 `SaveStatusBar.tsx`：
- 用 antd `<message>` API 或自己写 fixed bottom-right
- state 变化触发：saving→显示 spinner toast、saved→显示 ✓ toast 1.5s 自动消失、error→显示 ✗ toast 不自动消失，点击重试

```tsx
useEffect(() => {
  if (state === 'saving') message.loading({ content: '保存中…', key: 'save', duration: 0 });
  if (state === 'saved') message.success({ content: '已保存', key: 'save', duration: 1.5 });
  if (state === 'error') message.error({ content: errorMessage ?? '保存失败', key: 'save', duration: 0 });
}, [state, errorMessage]);
return null;
```

`key: 'save'` 让连续状态变化复用同一个 toast 不堆叠。

### 7) ProvenanceBadge 移到 Card extra

```tsx
<Card title="3. 户籍与考试地" extra={<ProvenanceBadge ... />} ...>
```

利用 antd Card 既有 `extra` 槽（右上角），不挤标题文字。

### 8) Collapse 替代 Card

新 `profile/page.tsx` 用 `<Collapse defaultActiveKey={['1','2','3']}>` 包 7 个 section（每个用 `<Collapse.Panel>` 包裹原 section 组件，去掉组件内 Card）。

## 涉及文件

**新建（11 个文件 + 测试）**：
- `apps/web/src/components/student/auto-save/useAutoSave.ts`
- `apps/web/src/components/student/auto-save/AutoSaveNumber.tsx` + spec
- `apps/web/src/components/student/auto-save/AutoSaveSwitch.tsx` + spec
- `apps/web/src/components/student/auto-save/AutoSaveRadio.tsx` + spec
- `apps/web/src/components/student/auto-save/AutoSaveCheckbox.tsx` + spec
- `apps/web/src/components/student/auto-save/AutoSaveSelect.tsx` + spec
- `apps/web/src/components/student/auto-save/AutoSaveTextArea.tsx` + spec
- `apps/web/src/components/student/auto-save/AutoSaveCascader.tsx` + spec
- `apps/web/src/components/student/CompactProgress.tsx` + spec

**移动+改写**：
- `AutoSaveField.tsx` → `auto-save/AutoSaveField.tsx`（改用 hook）

**改写**：
- `SaveStatusBar.tsx` 改 toast
- `ProvenanceBadge.tsx` 不变（已经是 inline span）
- 7 个 section 全换控件 + Row/Col 布局
- `profile/page.tsx` 用 Collapse + CompactProgress

**保留**：
- 后端不动
- `stage/[stage]/page.tsx` 兼容入口不动
- `CountyCascader` 包进 AutoSaveCascader 复用

## 测试

每个新控件单测覆盖：
- 受控 value 显示正确
- onChange 触发 useAutoSave commit（mock hook）
- defaultValue 解析（如 Switch 的 boolean、Cascader 的 array）

集成测试：现有 AutoSaveField 测试迁移到新路径不丢。

布局回归：暂不做视觉回归测试（PNG diff 工具未集成），靠手动验收。

## 失败模式与回滚

| 风险 | 概率 | 应对 |
|---|---|---|
| 字段类型映射错（如 height 应是 decimal 不是 int） | 中 | spec 表已列；实施时再核对 schema.prisma |
| antd message 在 Next.js App Router 需 `App` provider 包裹 | 中 | 检查既有 layout.tsx，必要时加 `<App>` |
| Cascader 需要省市县数据源 | 高 | 复用既有 `CountyCascader`（v1 已有） |
| Collapse 内字段值更新不重渲染 | 低 | 默认渲染所有 panel；用 `forceRender` 兜底 |

回滚：`git revert <commit-range>`（前端纯 UI，无 schema 变更）。

## 实施顺序

1. 抽 useAutoSave hook + 测试
2. AutoSaveField 迁移到新目录 + 改用 hook
3. 8 个新控件（NumberSwitchRadioCheckboxSelectTextAreaCascader）逐个 RED→GREEN
4. CompactProgress
5. SaveStatusBar 改 toast
6. 7 个 section 全部改写
7. profile/page.tsx 改 Collapse
8. 部署 + 验证

详细 task 拆分见 plan 文档。
