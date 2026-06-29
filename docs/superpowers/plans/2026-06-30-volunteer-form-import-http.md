# 志愿表导入 · 后端 HTTP 层(Plan B)Implementation Plan

> **For agentic workers:** 本计划由控制者 inline TDD 执行(解析器是细活)。Steps 用 checkbox。

**Goal:** 让「上传志愿表 PDF」自助化的后端:Node 解析 PDF→结构化 → `preview`(认人+认批次+组解析,命中报告)/`commit`(建版)两个 HTTP 端点。

**Architecture:** **解析放 Node**(spike 确认 `unpdf`/pdfjs 提取这类带 ToUnicode 的 PDF 得干净中文,无需 Python vh-ocr、无需跨服务)。`VolunteerFormParserService` = `extractPdfText(buffer)`(unpdf 薄封装)+ `parseFormText(text)`(纯函数,可测)。控制器 `preview`(multipart PDF → parser → matcher → resolver → 预览)/`commit`(→ import service)。复用 Plan A 的 resolver/matcher/import service。

**Tech Stack:** NestJS + `unpdf`(新增依赖)+ `@nestjs/platform-express` FileInterceptor + Jest。

**Scope:** Plan B = 后端 HTTP。不含老师端 UI(Plan C)。

---

## 关键事实:unpdf 提取文本格式(已实测袁嘉 PDF)

`extractText(pdf, {mergePages:true})` 得空格分隔的扁平 token 流,例:
```
本科批次B段 序号 院校 专业组 专业 是否服从 专业调剂 第一志愿01 （平行志愿） 5120 四川师范大学 111 0G 数学与应用数学；0N 化学；13 物理学 是 第一志愿02 …
```
- **批次** = 开头到 ` 序号` 前:`本科批次B段`。
- **每条志愿**:`第一志愿(\d+) （平行志愿） <4位院校码> <院校名(无空格)> <3位组码> <专业串(；分隔)> <是/否>`。
- **翻页噪声**(必须跳过):页脚 `<考生号>-<姓名>-<班级> 2026-6-29`、页头 `本科批次B段 序号 院校 专业组 专业 是否服从 专业调剂`。
- **身份块**(出现一次,在某页脚后):`四川省2026年普通高校招生考生志愿表 考生号：26510108150957 性别：女 考生姓名：袁嘉 证件号：510181****0029 外语语种：英语 报考类别：普通类 选科组合：物理,化学,地理 考试类型：全国统考`。
- **行内换行空格**:专业名可能被切开混入空格(如 `应用化 学`、`水利水 电工程`)→ 专业名取「码后剩余 token 拼接(去所有空白)」。

## 文件结构
```
apps/server/src/modules/plan-import/
  volunteer-form-parser.service.ts        # 解析器(extractPdfText + parseFormText)
  volunteer-form-parser.service.spec.ts   # parseFormText 纯函数单测(合成文本, 不含真实PII)
  dto/volunteer-form-preview.dto.ts        # (可选)commit 入参 DTO
  volunteer-form-import.controller.ts      # preview/commit 端点
  plan-import.module.ts                    # 改: 加 parser/controller, 注入 ParseService
apps/server/package.json                   # 加 unpdf 依赖
```

## 解析器规格(parseFormText)

```ts
parseFormText(text: string): ParsedForm
```
1. `batch` = `text.split(/\s+序号\s+院校/)[0].trim()` 的最后一个「本科…段/批」词;稳妥用正则 `/(本科[^\s]*?[AB]段)/` 或直接取 `text.trim().split(/\s+/)[0]` 起到 `序号` 前。实现取:`text.slice(0, text.indexOf('序号')).trim()` 再去尾空白 → `本科批次B段`。
2. `identity`:
   - `name` = `/考生姓名：(\S+?)\s/` → 袁嘉
   - `examNumber` = `/考生号：(\d+)/`
   - `idMasked` = `/证件号：(\S+?)\s/`
   - `classInfo` = `/-([^-\s]+?)-(\d+班)/` 取组2(从页脚 `考生号-姓名-班级`),或 `/(\d+班)/`
   - `subjectsRaw` = `/选科组合：(\S+?)\s/` → `物理,化学,地理`(用于推 examType:含 `物理`→PHYSICS,`历史`→HISTORY;parser 只透出 raw,examType 推断在 service/调用方)
3. `volunteers`:用 `text.split(/第一志愿\d+\s*（平行志愿）/)` 切块(首块是表头丢弃);对每块:
   - `tokens = chunk.trim().split(/\s+/)`
   - `schoolCode = tokens[0]`(校验 `/^\d{4}$/`,否则跳过该块)
   - `schoolName = tokens[1]`
   - `groupCode = tokens[2]`(校验 `/^\d{3}$/`)
   - 找首个 `tokens[i]∈{是,否}`(i≥3)→ `acceptAdjust = tokens[i]==='是'`;`majorsStr = tokens.slice(3,i).join(' ')`;i 之后是噪声丢弃
   - `majors = majorsStr.split('；').map(s=>s.trim()).filter(Boolean).map(e=>{const p=e.split(/\s+/); return {code:p[0], name:p.slice(1).join('')}})`
   - seq 用块前的 `第一志愿(\d+)` 捕获(split 时改用 matchAll 拿 seq 更稳)
4. 返回 `{ identity, batch, volunteers }`(类型见 `volunteer-form.types.ts`,已存在)。

> seq 获取:用 `[...text.matchAll(/第一志愿(\d+)\s*（平行志愿）([\s\S]*?)(?=第一志愿\d+\s*（平行志愿）|$)/g)]`,每个 match[1]=seq、match[2]=块体,比 split 更稳(保 seq 对齐)。

## 端点规格

- `POST /plan-import/volunteer-form/preview`(multipart `file`)→
  1. `buffer` → `parser.extractPdfText` → `parser.parseFormText` → ParsedForm
  2. examType 推断(选科组合含物理→PHYSICS/历史→HISTORY)
  3. `matcher.findCandidateStudents(identity, 当前老师userId)` + `matcher.matchBatchConfig(batch, examType, year, '四川')`
  4. `resolver.resolveGroups(volunteers, {year, subjects, batch})`(subjects 由 examType 映射;batch 用 matchBatchConfig 命中的 canonical batch,未命中则用 parsed batch 去「次」)
  5. 返回 `{ identity, batch, batchConfig:{id,batch}|null, candidateStudents:[{id,realName,classInfo}], groups, summary }`
- `POST /plan-import/volunteer-form/commit`(JSON `{ studentId, batchConfigId, resolvedGroups, versionNote? }`)→ `import.commit(...)` → `{ planId, versionNo }`
  - **重解析信任**:v1 简化为 commit 直接吃前端回传的 resolvedGroups(解析对我方 DB 确定性);权限在 controller 校验该 student 属当前老师。

> 鉴权:沿用现有 teacher 守卫(AuthGuard + 取 req.user.userId)。preview/commit 都要老师身份;commit 还要校验 `studentId` 属该老师(`student.teacher.userId === actorUserId`)。

## TDD 任务(inline)
1. 加 `unpdf` 依赖(`pnpm --filter server add unpdf`)。
2. 写 `parseFormText` 失败测试(合成 2 条志愿 + 身份文本,断言 batch/identity/volunteers/majors/换行空格清理/否服从)。
3. 实现 parser(extractPdfText 用 unpdf;parseFormText 纯函数)→ 测试过。
4. 用真实袁嘉 PDF 手验:`extractPdfText`+`parseFormText` 出 41 条,与 fixture 比对(本地脚本,不进仓库)。
5. 写 controller(preview/commit)+ 改 module(注入 parser、加 controller、装 Multer FileInterceptor)。
6. server build 过 + 全 plan-import 单测过 + 提交。
7. (可选)对生产隧道跑 preview(上传真实 PDF)复核 41/41。

## 边界
- 非此类 PDF / 解析不出志愿(volunteers 为空)→ preview 返回 `{ error:'无法识别为志愿表' }` 或 400。
- 认人 0/多个 → candidateStudents 给前端选;不自动 commit。
- 未命中组 → 沿用 Plan A resolver 的 unmatched 报告。

## Self-Review 提示
parser 是唯一新逻辑;端点是装配。重点测 parser 的:翻页噪声跳过、行内换行空格清理、是/否 终止、seq 对齐、majors 拆分。
