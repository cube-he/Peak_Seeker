# 意向专业/院校「层次不匹配」标记 设计

**日期**: 2026-06-14
**关联**: student profile / preference picker / majors 专业库 / batch-line
**触发**: 学生填意向专业、意向院校时，常把和自己分数层次对不上的项加进来（过了本科线却选专科、没过本科线却选本科）。系统应在条目名字后用括号标出它自己的层次作为提醒，引导填报。

## 一、问题与目标

### 当前痛点
- 意向专业（梯队）、意向院校、专业库挑选页，都不区分学生分数能上的层次。
- 过了本科线的学生加了专科专业/院校 → 浪费分，没人提醒。
- 没过本科线的学生加了本科专业/院校 → 够不着，没人提醒。

### 目标
1. 根据学生分数算出他「能上的层次」（本科 / 专科）。
2. 凡是层次对不上的专业 / 院校，在名字后用括号标出**它自己的层次**（如 `计算机科学与技术 (专科)`、`临床医学 (本科)`）。
3. 标记出现在 4 处：意向专业梯队（含意向池）、意向院校、专业库挑选页 /majors、以及上述控件的搜索下拉选项。

### 非目标（YAGNI）
- 不做「够不够得着」的分数带/位次提醒——本期只认本/专科层次这一条界。
- 不纳入提前批、艺体类、特殊类型控制线——只用普通**本科批控制线**作界。
- 不做拦截 / 禁止选择——只标记提示，学生仍可加。
- 不碰括号的最终视觉样式（颜色/弱化/图标）——只渲染文本 + 留 className，样式交 claude-design。

## 二、判定规则

### 2.1 学生侧：三态 `eligibleLevel`

| 条件 | eligibleLevel |
|---|---|
| 总分 ≥ 本科批控制线 | `本科` |
| 有分但 < 本科批控制线 | `专科` |
| 没填分 / 查不到本科线 | `null`（全部不标，不报错） |

- 只用**本科批控制线**这一条界（不用专科线：低于本科线一律按「专科可上」处理，保守）。
- 本科线按「学生高考年份 + 四川 + 科类」查 `BatchLine`；查不到降级到最近一年（复用 `batch-config` 已有的年份降级 + 批次/科类别名逻辑，见 `apps/server/src/modules/batch-config/batch-config.service.ts:125-155`）。
- 科类枚举 → 中文 lane 复用 `apps/server/src/modules/batch-eligibility/batch-eligibility.ts:48-51` 的 `EXAM_TYPE_LABEL`（PHYSICS→物理 / HISTORY→历史）。

### 2.2 条目侧：标记触发

两种粒度，用同一个纯函数判定：

- **具体专业**（/majors 卡片，每张卡是一条确定的专业，`major.level` 明确）：
  `major.level !== eligibleLevel` → 标 `(major.level)`。
- **专业名 / 院校名**（意向池、梯队、下拉选项、已选 chip——存的是名字，可能跨层次）：按「纯单层次才标」——
  - 名字在川**只有专科**招生 且 `eligibleLevel=本科` → 标 `(专科)`
  - 名字在川**只有本科**招生 且 `eligibleLevel=专科` → 标 `(本科)`
  - 本专科都有（`兼有`）→ 不标（学生可走对应层次）

### 2.3 共享纯函数 `levelMismatchTag`

```
levelMismatchTag(
  itemLevel: '本科' | '专科' | '兼有' | null,   // 具体专业只会是 本科/专科
  eligibleLevel: '本科' | '专科' | null,
): '本科' | '专科' | null                        // 返回要显示在括号里的层次，null = 不标
```

逻辑：
```
if (!eligibleLevel || !itemLevel || itemLevel === '兼有') return null;
return itemLevel !== eligibleLevel ? itemLevel : null;
```

放共享层（前端 util），4 处渲染统一调用，口径不重复。

## 三、四个标记位置 & 取数

| 位置 | 条目粒度 | 层次数据来源 |
|---|---|---|
| 专业库挑选页 /majors 卡片 | 具体专业 | 卡片已有 `major.level`（`apps/web/src/app/(main)/majors/page.tsx`，level 已在 tags），**前端现成** |
| 意向专业 搜索下拉 + 已选 chip | 专业名 | 扩展 `GET /majors/picker-options` 返回每个名字的科类层次 |
| 意向院校 搜索下拉 + 已选 tag | 院校名 | 扩展 `GET /universities/picker-options` 返回每所院校的科类层次 |

- /majors 页已拉取工作台学生（`page.tsx:569-596` 取 examType），补 `eligibleLevel` 即可。
- 意向专业编辑器 `PreferredMajorTierEditor`、意向院校 `AutoSavePicker` 当前**未接收**学生分数/层次，需新增 prop 透传。

## 四、改动清单

### 后端（3 件）

1. **算 `eligibleLevel`**：新增 helper（查本科线 + 比分 → 本科/专科/null），结果挂到学生 profile / getById 响应上。前端拿现成枚举，不在前端重写分数线语义。复用 batch-config 的线查询。
2. **`/majors/picker-options` 补 `levels`**：每个专业名按「名字 + 科类 lane」聚合 `EnrollmentPlan`，由 batch 推层次（`本科%`→本科、`高职% / %专科%`→专科），归约为 `本科/专科/兼有`。`major.service.ts:304-325`。
3. **`/universities/picker-options` 补 `levels`**：同上，按院校聚合。`university.service.ts:529-550`。

聚合结果进 Redis 缓存（picker 列表基本不变）；招生计划重导入后需清该缓存（类比 `cache:university:*`，部署补充动作里加一条）。

### 前端

1. **透传 `eligibleLevel`**：页面层 → `PreferenceSection`（`sections/PreferenceSection.tsx:69,70`）→ 意向专业编辑器 / 意向院校 picker，新增 prop。
2. **共享 util `levelMismatchTag`** + 渲染层次后缀。
3. **4 处接入**：
   - `PreferredMajorTierEditor` 的 `MajorChip` 与下拉 option label
   - 意向院校 `AutoSavePicker` 的已选 tag 与 option label
   - /majors 卡片标题区

### 数据/接口形状

picker-options 单项（**新增 `levels` 为可选字段，向后兼容**）：
```jsonc
{
  "value": "学前教育",
  "label": "学前教育",
  "levels": { "phy": "兼有", "his": "专科" }   // 本科 | 专科 | 兼有 | null（该 lane 在川无招生）
}
```
前端按学生 examType 选 lane：PHYSICS→`phy`，HISTORY→`his`，再 `levelMismatchTag(levels[lane], eligibleLevel)`。

## 五、科类粒度

采用**科类感知**：物理类 / 历史类分开算名字层次（picker-options 的 `levels` 拆 `phy` / `his` 两份）。
- 比科类无关更准；代价是 payload 略大、聚合多一个维度，都很小、可缓存。
- 科类无关的话会在「同名专业不同科类层次不同」少数情况下**漏标**（永不误标）——本期不取。
- `COMPREHENSIVE_LIBERAL / COMPREHENSIVE_SCIENCE` 等非物理/历史科类：本科线与 lane 暂按物理/历史就近映射；映射不到则 `eligibleLevel`/`levels` 取 null（不标），不报错。

## 六、边界与不做的事
- 没填分 / 查不到本科线 → `eligibleLevel=null`，4 处全不标。
- 某名字在川该 lane 无任何招生 → 该 lane `levels=null` → 不标。
- 提前批 / 特殊类型线 / 专科线不参与判定。
- 纯视觉样式交 claude-design。

## 七、测试要点
- `levelMismatchTag` 真值表：本科生×专科项→`专科`；专科生×本科项→`本科`；同层→null；兼有→null；eligibleLevel=null→null。
- `eligibleLevel`：过线→本科 / 没过→专科 / 没分→null / 没线→null。
- picker-options：构造一个「纯本科名」「纯专科名」「本专科兼有名」，断言 `levels.phy/his` 正确。
- 前端渲染：层次对不上的 chip / option / 卡片显示括号后缀，对得上不显示。

## 八、风险与回归
- picker-options payload 增大：只加 `levels` 小对象，可接受；务必保持 `levels` 可选，老消费方不受影响。
- 缓存口径：招生计划重导入后必须清 picker-options 缓存，否则层次过期；写进部署补充动作。
- 不得改动现有 picker 过滤 / 排序行为——`levels` 仅为附加展示数据。
