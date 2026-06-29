# 志愿表导入 · 老师端 UI(Plan C)Implementation Plan

> **For agentic workers:** 由控制者用 Workflow 编排执行(UI 是细活 + 集成)。Steps 用 checkbox。

**Goal:** 老师端独立流程页:上传志愿表 PDF → 预览(认人 / 认批次 / 命中表)→ 老师确认 → 派生新版本方案 → 跳详情页。**纯功能骨架,视觉精修按既定流程交 claude-design**(参考记忆 `feedback_frontend_styling`)。

**Architecture:** 新增独立路由 `/teacher/plan-import`(单页流程,状态机驱动:`upload → previewing → confirm → committing → done`)。学生详情页方案动作区加「导入志愿表」按钮,把 `studentId` 通过 query 预选(老师从其他入口进则不预选)。两个 API:`previewVolunteerForm(formData)` + `commitVolunteerForm(payload)`。复用 antd 原语,不造新组件。

**Tech Stack:** Next.js App Router(client component)+ antd v5(`Upload.Dragger`/`Table`/`Radio`/`Card`/`Alert`/`Button`/`message`)+ axios via 现有 `services/api.ts`。

**Scope:** Plan C 仅 UI + API 客户端 + 入口按钮。不部署生产(留下一步用户决定)。

## 关键事实(已核 codebase)

- API 实例:`apps/web/src/services/api.ts` 默认 `Content-Type: application/json`,FormData 上传需在 request config 覆盖 header(或让 axios 自动)。
- 学生详情页方案动作区:`apps/web/src/app/(teacher)/teacher/students/[id]/page.tsx` 第 ~960 行附近,「生成方案」按钮处加同款`btn` 按钮。
- 后端端点(Plan B 已上):
  - `POST /plan-import/volunteer-form/preview`(multipart `file`)→ `{ identity, batch, examTypeHint, batchConfig:{id,batch}|null, candidateStudents:[{id,realName,classInfo}], groups, summary:{total,matched,unmatched} }`
  - `POST /plan-import/volunteer-form/commit`(JSON `{ studentId, batchConfigId, resolvedGroups, versionNote? }`)→ `{ planId, versionNo, importedCount, failures }`
- ResolvedGroup 字段(传回 commit):`seq, schoolCode, schoolName, groupCode, status:'matched'|'unmatched', anchorEnrollmentPlanId?, selectedMajors[], acceptAdjust, unmatchedReason?, note?`(已在 server 类型里,前端复用结构即可)。
- `JwtAuthGuard` 保护两端点 → 走现有 axios 拦截器带 token,无需特殊处理。
- 现有按钮风格:`<button type="button" className="btn primary"><TIcon.x /> 文字</button>`;TIcon 在 `@/components/teacher/icons` 之类位置(沿用同文件已 import 的)。

## 文件结构

```
apps/web/src/services/plan-import-api.ts                          # API 客户端(新建)
apps/web/src/app/(teacher)/teacher/plan-import/page.tsx           # 流程页(新建)
apps/web/src/app/(teacher)/teacher/students/[id]/page.tsx         # 改: 加入口按钮
```

## 流程页状态机

```
idle (上传区)
  └─ 用户选 PDF → uploading
       └─ preview API 成功 → previewing
            ├─ 候选学生 0 → 显示"未找到, 请先建学生"
            ├─ 候选 ≥1 → Radio 选(若仅 1 个默认选中)
            └─ batchConfig null → Alert 警告"该批次未配置"
                            ↓ 用户点「确认导入」
                          committing → done(跳 /teacher/plans/{planId})
       └─ preview 失败 → 回 idle + message.error
  └─ commit 失败 → 回 previewing + message.error
```

## API 客户端

```ts
// apps/web/src/services/plan-import-api.ts
import api from './api';

export interface PreviewIdentity { name?: string; examNumber?: string; idMasked?: string; classInfo?: string; }
export interface PreviewCandidateStudent { id: number; realName?: string; classInfo?: string | null; }
export interface PreviewSelectedMajor { order: number; enrollmentPlanId: number; majorId: number; majorName: string; majorCode: string | null; }
export interface PreviewGroup {
  seq: number; schoolCode: string; schoolName: string; groupCode: string;
  status: 'matched' | 'unmatched';
  anchorEnrollmentPlanId?: number;
  selectedMajors: PreviewSelectedMajor[];
  acceptAdjust: boolean;
  unmatchedReason?: string;
  note?: string;
}
export interface PreviewResponse {
  identity: PreviewIdentity;
  batch: string;
  examTypeHint: 'PHYSICS' | 'HISTORY';
  batchConfig: { id: number; batch: string } | null;
  candidateStudents: PreviewCandidateStudent[];
  groups: PreviewGroup[];
  summary: { total: number; matched: number; unmatched: number };
}
export interface CommitResponse { planId: number; versionNo: number; importedCount: number; failures: Array<{ seq: number; reason: string }>; }

export const planImportApi = {
  preview(file: File): Promise<PreviewResponse> {
    const fd = new FormData();
    fd.append('file', file);
    return api.post('/plan-import/volunteer-form/preview', fd, { headers: { 'Content-Type': 'multipart/form-data' } }).then(r => r.data);
  },
  commit(payload: { studentId: number; batchConfigId: number; resolvedGroups: PreviewGroup[]; versionNote?: string }): Promise<CommitResponse> {
    return api.post('/plan-import/volunteer-form/commit', payload).then(r => r.data);
  },
};
```

## 流程页(简化骨架)

页面用 `'use client'`,React `useState`/`useMutation`(沿用现有 `@tanstack/react-query`,看 students/[id] 是怎么用的)。功能项:

1. 顶部 `<Card>` 显示上传区(`Upload.Dragger` accept=`.pdf` maxCount=1,onChange/customRequest 触发 preview)。
2. preview 成功后,上传区折叠成"已解析:文件名 [重新选择]";展开识别详情:
   - **识别身份**:`<Descriptions>` 列出 name/examNumber/idMasked/classInfo + batch + examTypeHint(中文)
   - **认人**:`<Radio.Group>` 列 candidateStudents(每项「<realName>(#id) - <classInfo>」);为空时 `<Alert type='error'>` "未在你名下找到对应学生,请先新建学生"。query 里若有 `studentId` 则用它预选(且校验在候选列表中)。
   - **批次**:batchConfig null → `<Alert type='error'>` "该批次未配置";否则展示 `本科批B段 (#22)`。
   - **命中表**:`<Table>` 列 (seq, schoolCode, schoolName, groupCode, status[✓/✗], reason, majors预览)。匹配行用 `tag` 显示"命中",未匹配 `tag color=red`。汇总用 `<Alert>` 显示"共 N 条,命中 M / 未命中 K"。
3. 底部行动:`[取消] [确认导入]`。确认禁用条件:无 studentId 选中 / batchConfig null / matched===0。
4. commit 成功 → `message.success` + `router.push('/teacher/plans/<planId>')`。
5. commit 失败 → `message.error(error.message)`。

## TDD 测试策略

- API 客户端是纯透传,不单测。
- 页面交互测试**不写**(项目里已有的页面也都没测,坚持外科手术不引新规)。
- **验证靠 build + 真人走查**:web build 无 TS 错;启 dev 跑一次完整流程(上传袁嘉 PDF → 命中表 → 确认 → 跳详情页);若**已存在**的 v4 还在,可以再上传一次看是否建 v5。

## Workflow 任务

| Phase | Agent | 任务 |
|---|---|---|
| API | sonnet | 写 plan-import-api.ts + 提交 |
| Page | sonnet | 写 /teacher/plan-import/page.tsx + 提交 |
| Entry | sonnet | 学生详情页加「导入志愿表」按钮 + 提交 |
| Gate | sonnet | 跑 `pnpm --filter web build`,报真实结果 |

每个 implementer agent 拿到完整代码块 + 严格诚信要求(真跑真提交,sha 来自 `git rev-parse HEAD`)。

## 收尾后用户决定

- 部署 A+B+C 到生产(老师可上传 PDF 真实导入);
- 合并到 master;
- 真人验证(用袁嘉 PDF 在 staging/prod 走一遍)。

控制者(我)真人验证完才标记 Plan C 完成。
