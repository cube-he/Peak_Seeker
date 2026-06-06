# 院校优先模式（University-First View）实施计划

> 状态：进行中
> 日期：2026-06-05
> 页面：`/teacher/plans/generate/[studentId]`（方案生成候选池工作台）

## 背景与本质

当前候选池工作台只有「专业优先」呈现：一张卡 = 一个 `(院校, 专业组)`，排序/筛选偏专业维度。
要新增「院校优先」视图：一张卡 = 一所院校，内含该校所有够得着的专业组（冲/稳/保子行）。

**关键约束**：新高考填报单位永远是「院校专业组」（PlanItem = 院校+专业组+锚定专业）。
院校优先只改**浏览/决策路径**，不改最终存进方案的东西 → 零数据风险。

**关键复用**：
- 后端每个组的位次/梯度/纯净度/匹配度计算逻辑不动，只在分页前加「按院校上卷」层。
- 现有 keyword/tier/纯净度/excludeAdded/includeSoftFails 过滤都在组级、上卷之前执行，院校模式自动生效。
- 前端方案 rail / 学生档案 / 批次 / 加入流程全复用。

**已有基础**：`StudentProfile.priorityMode` 和 `VolunteerPlan.priorityMode`（UNIVERSITY_FIRST/MAJOR_FIRST）
已存在，学生详情页已有单选，recommend 模块已读它。本工作台此前没用 → 这次打通。

## 决策（已确认）
- 路线 A：重组成院校卡（真·院校优先）
- 同页加 toggle 切换（复用整页骨架）

## 后端设计（plan-candidate.service.ts + DTO）

DTO 加 `groupBy?: 'GROUP' | 'UNIVERSITY'`（默认 GROUP，老逻辑不受影响）。

UNIVERSITY 分支：在分页前插入
```
resultGroups (已算好已排序的组)
  → rollupByUniversity()        // 按 universityId 分组
  → CandidateUniversity[]       // { university, groups[], summary }
  → sortCandidateUniversities() // 院校维度排序
  → 按院校分页（10 校/页）
  → 返回 { universities, total, ...原 metadata }
```

CandidateUniversity 契约：
```
{
  universityId, universityName, universityCode,
  university: {...},          // 已有院校字段
  groups: CandidateGroup[],   // 原样复用，已排序
  summary: {
    groupCount,
    gradientSpread: { chong, wen, bao },
    bestMatchScore,
    easiestGroupMinRank, hardestGroupMinRank,
    isPreferred, preferredRank,
    regionMatch,
  }
}
```

院校维度排序（新增）：
- UNIVERSITY_OVERALL 综合（意向→软科排名→匹配）【默认】
- UNIVERSITY_RANK 软科排名
- REGION_FIRST 地域优先
- UNIVERSITY_TIER 层次（985→211→双一流→普通）
- VALUE_PICK 性价比捡漏【P3 可选】

## 前端设计（page.tsx + 新组件）

- viewMode state，默认 plan.priorityMode ?? student.priorityMode
- toggle UI：候选池顶部 [专业优先 | 院校优先]
- 院校模式：groupBy=UNIVERSITY，渲染 UniversityCandidateCard，排序/筛选切院校维度
- UniversityCandidateCard：院校头 + 组子行（展开复用 CandidateMajorSection）
- 加入：子行调现有 addCandidateGroup（group 原样复用）

## 任务分解

### P1 后端
- [ ] B1 DTO 加 groupBy + 院校 sort 枚举
- [ ] B2 rollupByUniversity() + summary（单测）
- [ ] B3 sortCandidateUniversities()（单测）
- [ ] B4 接进 getCandidateGroups（UNIVERSITY 分支上卷+按校分页）
- [ ] B5 整体单测跑通

### P2 前端
- [ ] F1 类型 CandidateUniversity + result + getCandidateUniversities
- [ ] F2 viewMode state + toggle + 默认跟随 priorityMode
- [ ] F3 UniversityCandidateCard 组件
- [ ] F4 排序/筛选 chip 按模式切换
- [ ] F5 加入子行复用 addCandidateGroup

### P3 收尾
- [ ] G1 URL 参数 ?view=university + 切模式 rail 不变
- [ ] G2 部署 + 三角色 e2e

## 风险点
- excludeAdded：只隐藏已加组，全加完则该校卡消失（上卷前过滤天然处理）
- 意向专业梯队 chip 在院校模式隐藏，避免范式混用
- 必须按院校分页，否则一校的组跨页裂开
