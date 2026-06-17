---
name: updating-batch-policy-references
description: Use when 四川教育考试院(sceea.cn)或同类招生政策公告发布、需据此更新 VolunteerHelper『推荐批次』里某批次/子类的报考判定(hardRules/policyText)或参考文件(下载附件转PDF上传到 attachments/policy)时。关键词:seed-batch-eligibility-rules、eligibilityRules、推荐批次、政考公告、batch_configs、生产无 ts-node。
---

# Updating Batch Policy References

## Overview

把一份招生政策公告(如 sceea.cn 的某批次政考/体检/专项通知)同步进「推荐批次」功能:更新对应**子类(subset)**的报考判定(`hardRules` / `policyText`)和**参考文件**(把附件下成 PDF 传到服务器)。

**核心原则(违反就出事):**
1. **先核口径,再挂文件** —— 公告主体/口径必须和目标子类对得上。军队「政治**考核**」≠ 司法/公安「政治**考察**」≠ 征兵,文书各成体系,挂错让老师/家长用错表。宁可不挂,不可错挂。
2. **服务器文件名用 ASCII,本地归档用中文** —— seed 引用和前端 URL 都靠 ASCII 文件名,改了就 404;本地归档才用中文名给人看,两边不必一致。
3. **附件优先转 PDF** —— `type:'pdf'` 前端直接预览,无需 `.preview.pdf`;留 doc/xlsx 则必须额外传同名 `.preview.pdf`,否则预览坏。
4. **共用 const:分清「子类专属改动」vs「文件本身出新版」** —— `references` 里很多 ref 是多子类共用的 `const`。**为某一个子类增删** → 只动该子类数组、别碰 const 定义(否则误伤别的子类),加该子类专属新文件就新建 const。**但若底层文件本身出了新版、且对所有引用者都适用**(如征集政治考核表 2026,军队院校+定向军士共用)→ **直接更新该共用 const 的 filename/type**,正确传播到所有引用者——这才对(死守「不动定义」反而让其他子类漏掉新版)。
5. **改判定值要两处同步** —— 一个子类的体检数值在 `hardRules.params`(机器判定)和 `policyText`(给人看的散文)里是**两份独立手写副本**,改一个值必须两处都改,否则前端原文与判定打架。

## When to Use

- 收到某招生批次的官方政策公告(政考/体检/专项/艺体类),要把要求或附件同步进系统。
- 某子类参考文件还是上一年占位(标注「待 XXXX 替换」),要换成今年实际文件。
- 已有判定规则需据新公告订正(身高/视力/年龄/户籍区域等)。

不适用:纯前端样式(交 claude-design);非招生政策的文件。

## 关键事实(数据模型 & 路径)

| 项 | 值 |
|---|---|
| seed 脚本 | `apps/server/scripts/seed-batch-eligibility-rules.ts`(`RULES` + `PLACEHOLDER_BATCHES` + `BATCH_ALIASES`;每子类有 `references` / `policyText` / `hardRules`) |
| **官方批次结构(权威参考)** | `data/03_专家版主表/output/2025年批次结构.xlsx`(主仓库):录取批次名 × 投档顺序 × 招生类型(=subset) × 志愿设置,对齐招生考试报。定位/核对批次和子类先看它 |
| **合法 rule 名** | 只能取自 `apps/server/src/modules/batch-eligibility/types.ts` 的 `HardEligibilityRuleCode`;params 形状照该文件注释 |
| ref 三态(`refToItem`) | `externalUrl`→外链(`external:true`);`filename`→`/attachments/policy/<filename>`(`available:true`);都没→「文件待补」 |
| 预览(`previewUrlFor`) | `pdf`/`announcement`→原 URL;`doc`/`xlsx`→同名 `.preview.pdf`(需另传) |
| 生产静态目录 | `/home/ubuntu/apps/volunteer-helper/attachments/policy/`(**仓库根**,nginx:80 经 Next rewrite 伺服;**不在 git、deploy 不带**,只能手动 scp) |
| **SSH key(主仓库绝对路径)** | `C:\Users\17697\Documents\VolunteerHelper\cube.pem` —— `*.pem` 被 gitignore,**worktree 不带**,永远用主仓库绝对路径 |
| **本地归档(主仓库绝对路径)** | `C:\Users\17697\Documents\VolunteerHelper\data\07_政策文件\<批次名>\`(中文名;同样不在 worktree) |
| SSH host | `ubuntu@132.232.245.53`;PM2:vh-web :3004 / vh-api :3003 / nginx :80 |
| 生产 ts-node | **本流程不跑 `deploy_auto.py`,所以不保证现存 ts-node 可用**(一次完整部署会临时 `pnpm add` 回来,增量手动 scp 路径不会)。为稳妥一律本地 tsc 编译成 JS 再 `node` 跑,**不依赖 `pnpm seed:eligibility`** |

> ⚠️ 本流程常在 **worktree** 里改 seed,但 `cube.pem`、`data/07_政策文件`、`data/seed/` 都只在主仓库 `C:\Users\17697\Documents\VolunteerHelper`。所有 scp/ssh/归档一律用主仓库绝对路径(同类坑见记忆 `worktree-env-local`)。

相关:CLAUDE.md「部署后常见补充动作」;记忆 `prod-policy-files-infra`、`deploy-workflow`、`worktree-env-local`。

## 公告主体 → subset code 速查

| 公告主体/关键词 | subset code | 所属 batch(seed/DB 实际名) | 口径 |
|---|---|---|---|
| 军队院校(政治考核) | `junxiao` | 本科提前批A段 | 征兵办、《征集和招录人员政治考核表》 |
| 中央司法警官学院/司法警察 | `sifa` / `sifa_jingyuan` | 本科提前批A段 / 高职提前批 | 该校《招生政治考察表》+户籍地派出所 |
| 公安院校/公安专业 | `gongan` / `gongan_zhuanke` | 本科提前批A段 / 高职提前批 | 公安机关录用政治考察 |
| 消防救援 | `xiaofang_jiuyuan` | 本科提前批A段 | 政审+体检+体能 |
| 定向培养军士 | `dingxiang_junshi` | 高职提前批 | 应征公民体格检查 |
| 国家/地方专项 | `guojia_zhuanxiang` / `difang_zhuanxiang` | 本科批A段(+alias) | 县名单+户籍学籍 |
| 高校专项 | `gaoxiao_zhuanxiang` | 本科提前批高校专项 / 本科批高校专项(placeholder) | 县名单+户籍学籍 |
| 公费师范/优师/农村订单医学 | `guojia_gongfei_shifan` / `*_youshi` / `nongcun_dingxiang_yixue` | 本科提前批B段 | 服务承诺 |

不确定就在 seed 里搜 `name:` 中文名定位 code;口径相近的(司法/公安/军队都涉政审体检)务必逐项核对公告落款单位与依据文号,别认错。

> **权威批次结构**:批次名×招生类型(subset)以 `data/03_专家版主表/output/2025年批次结构.xlsx` 为准(对齐招生考试报)。两个坑:① 官方把「公安类、司法类」并为一行,seed 拆成 `gongan`+`sifa` 两个子类;② **批次名可能与官方/DB 有出入**——seed 用「高职提前批/高职批」,官方作「高职(专科)提前批/高职(专科)批」;改/匹配批次名前先核 `batch_configs` 表实际值与该 xlsx,别照 seed 字面想当然。强基计划在 seed 有、但不在这张官方结构表里(特殊类型招生,非标准录取批次)。
>
> 读这个 xlsx 用 **node + exceljs**(仓库已有依赖:`cd apps/server && node` 里 `require('exceljs')`);**别用 `python3`/`python`** —— 本机会被 Windows store 别名劫持报「Python was not found」(真解释器在 `...\AppData\Local\Programs\Python\Python312\python.exe`)。

## 操作流程

### 1. 抓取并读懂公告
```bash
curl -sL --max-time 40 -A "Mozilla/5.0" "<公告URL>" -o /tmp/ann.html
```
PowerShell 解码(**sceea 多为 UTF-8**,乱码再换 GB18030)去标签提取正文 + 列出所有 `.pdf/.doc/.docx/.xls` 附件链接(相对链接 `../../Upload/...` 补全为绝对地址)。

> ⚠️ **公告没有直链附件时**(只有二维码图 `Upload/image/...png`,或纯正文)——很常见,但**别急着放弃附件,先解二维码**(实测能拿到真文件):
> 1. 下载二维码 PNG,用 `jsqr`+`pngjs`(临时 `npm i`)解出 URL:`const {PNG}=require('pngjs'),jsQR=require('jsqr'),fs=require('fs');const p=PNG.sync.read(fs.readFileSync(F));console.log(jsQR(new Uint8ClampedArray(p.data),p.width,p.height).data)`。F 用**绝对 Windows 路径+正斜杠**(别用 `/tmp`——node 会当 `C:\tmp`)。
> 2. 多为**草料活码**(`qr61.cn`/`clewm.net`):访问 `<解出URL>?format=md` 拿内容,里面常含真实文件直链(`ncstatic.clewm.net/...`)。
> 3. 下载转 PDF(`.wps` 是金山 OLE2,Word COM 一般能直接开转;转完用 `pdf-parse` 抽文字核一下没乱码),按正常附件流程挂。**活码常含多个文件**(计划表/名单式样等),`?format=md` 里列几个就处理几个,**别只拿第一个**;只有口径不符的才排除。
> 4. **确实没文件**(二维码只是微信公众号/纯正文)→ 才退回只更 `policyText`/`hardRules`/`externalUrl`,附件保持占位、`sourceNote` 标注「见官网二维码」。

### 2. 定位目标子类 + 核口径 ⚠️
用上面速查表/搜 `name:` 找到 subset `code`。**逐项确认公告口径与该子类一致**(标题主体、落款单位、依据文号)。口径不符→停,不要挂。

注意 subset 有三个标识符,别混:`code`(如 `'sifa'`,定位用这个)、`name`(中文名)、每条 hardRule 里的 `subset` 字段(显示用短标签,可能≠code≠name,新增规则沿用该子类已有短标签)。

### 3. 评估更新范围(alias 放大)⚠️
`main()` 会把 `RULES` + `BATCH_ALIASES` + `PLACEHOLDER_BATCHES` 合成更新目标:**同一个 subset code 可能被多个 batch 名复用**(如 `guojia_zhuanxiang` 经 alias 挂到「本科批A段」「本科批A段(国家专项)」「本科提前批国家专项」)。改一个子类会写进**多行** batch_configs,且 prod 上每个 batch 名还按 `examType` 物理/历史各一行。先 grep `BATCH_ALIASES`/`PLACEHOLDER_BATCHES` 列出会被一并更新的全部 batch,验证时逐个核。

### 4. 下载附件 → 转 PDF
```bash
curl -sL --max-time 40 -A "Mozilla/5.0" "<附件URL>" -o /tmp/<ascii_name>.docx
```
转 PDF 按类型分:
- **`.doc/.docx/.wps`(Word COM)**:`$doc=$w.Documents.Open(src,$false,$true); $doc.ExportAsFixedFormat($pdf,17)`。`.wps` 是金山 OLE2、Word 也能开。**偶发 RPC 崩(0x800706BE)**:`Get-Process WINWORD|Stop-Process -Force` 后重试;**多文件每个都用全新 Word 实例**最稳(同一实例开第 2 个常崩)。
- **`.xls/.xlsx`(Excel COM)**:`$wb=$excel.Workbooks.Open(src,0,$true); $wb.ExportAsFixedFormat(0,$pdf)`(0=PDF)。**宽表**先对每个 worksheet 设 `PageSetup.Orientation=2`(横向)+`Zoom=$false`+`FitToPagesWide=1`,免得断行难看。
- 转完用 `pdf-parse`(v2 `new PDFParse({data}).getText()`)抽文字核一下没乱码。

### 5. 本地归档(中文名)
存到 `C:\Users\17697\Documents\VolunteerHelper\data\07_政策文件\<批次名>\`,中文标题命名。被资源管理器预览占用(dllhost)改不了名 → 杀 `dllhost,prevhost` 再 `Rename-Item`。

### 6. 改 seed
- **新文件**:新建 `const`(`filename` 用 ASCII、`type:'pdf'`);**不要改共用 const 定义**(会牵连别的子类)。在目标子类 `references` 数组里增/删标识符。
- **policyText**:按需加/改(概括报考条件/标准/时间地点)。**子类原本没有 `policyText`、但公告口径清晰值得展示时,可从零新增**(参照 `sifa` 那条体例:报考条件/体检体能标准/时间地点)。
- **hardRules**:rule 名**只能取自 `types.ts` 的 `HardEligibilityRuleCode`**(如 `HEIGHT_MIN_BY_GENDER={male,female}`、`VISION_NAKED_MIN={value}`、`WEIGHT_MIN_BY_GENDER={male,female}`、`AGE_RANGE={min,max,asOf}`)。
  - ⚠️ **params 严格照公告原文:给几个值写几个,原文没有的就省略**(`AGE_RANGE` 的 `min` 可选,省略=仅判 ≤max、显示「不超过N周岁」)。**两个方向都别犯**:① 别凭常识/旧值补全公告没给的值(冷测里差点把 `min` 16 改 17);② 也别盲目沿用旧值——旧值可能本身就是臆测(实测定向军士 `min:17` 任何年公告都查无依据,已删, 只留 `{max:20,asOf}`)。`max`/`asOf` 这类逐年变的按公告刷新。
  - ⚠️ **若公告需要一个现有枚举没有的新判定**:必须先在 `types.ts` 加枚举 + 在 `batch-eligibility.ts` 的 `switch(rule.rule)` 加 case。否则评估器的 `default` 分支会把未知 rule **静默降级成 SOFT_HINT(不阻止的软提示)**,一个硬门槛悄悄失效,而 DB/curl 验证都查不出来。这步超出「只改 seed」,要告知用户并走正常 TDD。
  - 改了体检数值,记得**同步 policyText 散文里的同一数值**(原则 5)。
- 改完 grep 自检:被删 ref 是否仍被别处引用(防孤儿)、新 ref 定义与使用各对应。

### 7. 上传 + 跑 seed + 重启 + 验证
```bash
# a) 本地编译 seed → JS(PrismaClient 类型报错可忽略,tsconfig 无 noEmitOnError 照常 emit)
cd apps/server && npx tsc scripts/seed-batch-eligibility-rules.ts \
  --outDir _seedbuild --module commonjs --target es2020 --esModuleInterop --moduleResolution node --skipLibCheck
# b) scp(用主仓库 cube.pem 绝对路径):PDF→attachments/policy/;.ts + 编译JS→apps/server/scripts/
KEY="C:/Users/17697/Documents/VolunteerHelper/cube.pem"; RB=/home/ubuntu/apps/volunteer-helper
scp -i "$KEY" <pdf...> ubuntu@132.232.245.53:$RB/attachments/policy/
scp -i "$KEY" apps/server/scripts/seed-batch-eligibility-rules.ts ubuntu@132.232.245.53:$RB/apps/server/scripts/seed-batch-eligibility-rules.ts
# 编译产物用临时名 .__compiled.js(区别于 .ts 源、跑完即删、不污染 scripts 目录)
scp -i "$KEY" apps/server/_seedbuild/seed-batch-eligibility-rules.js ubuntu@132.232.245.53:$RB/apps/server/scripts/seed-batch-eligibility-rules.__compiled.js
# c) 跑 seed(读 .env 注入 DATABASE_URL)→ 删临时 JS → 重启
ssh -i "$KEY" ubuntu@132.232.245.53 'cd '$RB'/apps/server && set -a && . ./.env && set +a && node scripts/seed-batch-eligibility-rules.__compiled.js; rm -f scripts/seed-batch-eligibility-rules.__compiled.js; pm2 restart vh-server'
```
> seed 日志里 `⚠ no batchConfig found for batch=...` 是良性的(该 alias 批次在 batch_configs 没建行,跳过,退出码仍 0)。只要目标 batch 那几行有 `✓ updated` 即可。

**验证(两道):**
1. 文件能访问:`curl -sI http://132.232.245.53:3004/attachments/policy/<file>` 得 `200 application/pdf`。(若 vh-web 没起,可在服务器 `curl -sI http://localhost/attachments/policy/<file>` 直打 nginx:80 兜底。)
2. DB 内容(逐个目标 batch 名核对;**`batch_configs.examType` 是中文「物理/历史」,不是英文**)。**下面命令里的 `batch:"本科提前批A段"`、`code:"sifa"` 是示例,务必换成你的目标 batch 名和 subset code**:
```bash
ssh -i "$KEY" ubuntu@132.232.245.53 'cd '$RB'/apps/server && set -a && . ./.env && set +a && node -e "
const {PrismaClient}=require(\"@prisma/client\"), {PrismaMariaDb}=require(\"@prisma/adapter-mariadb\");
const p=new PrismaClient({adapter:new PrismaMariaDb(process.env.DATABASE_URL.replace(/^mysql:/,\"mariadb:\"))});
(async()=>{const c=await p.batchConfig.findFirst({where:{batch:\"本科提前批A段\",province:\"四川\",year:2026,examType:\"物理\"}});
const s=(c.eligibilityRules.subsets||[]).find(x=>x.code===\"sifa\");
console.log(s.references.map(r=>r.filename||r.externalUrl)); await p.\$disconnect();})();
"'
```
清掉本地 `_seedbuild`。

### 8. git 收尾
commit → master 常被别的 session 推进,用 `git rebase master`(本流程只改 seed/.ts,零冲突)→ 主仓库 `merge --ff-only` → `push github master` → 校验 remote==local。

## Common Mistakes

- **口径错挂**:公告附件无脑挂到名字相近子类(军队「政治考核」挂到司法「政治考察」=误导)。先核口径(步骤2)。
- **加了 types.ts 没有的 rule 名**:评估器 `default` 静默把它降成软提示,硬门槛失效且 DB/curl 查不出。新 rule 必须改 types.ts + 评估器 case。
- **params 不照原文(两个方向)**:公告给几个值写几个、没给的省略(`AGE_RANGE` 的 `min` 可选);既别瞎补(冷测差点 16→17),也别盲目沿用臆测旧值(定向军士 `min:17` 查无依据已删)。
- **见二维码就放弃附件**:二维码常能解码(jsQR)→ 草料活码 `?format=md` → 真文件直链(实测取回 2026 计划表)。先解再说,真没文件才退回只更文本/链接。
- **以为只改一行 batch**:alias/placeholder 让一个 subset 落多行(×examType),验证要逐个 batch 名核(步骤3)。
- **改了 hardRules 数值忘了 policyText**:两份独立手写副本,前端原文与判定会打架。
- **为单个子类的需求改了共用 const 定义**:`ref_zhaosheng_wuli` 等被多子类共用,为某一个子类改定义会误伤别的——子类专属改动只动该子类数组。(反过来:底层文件出新版、对所有引用者都适用时,直接更新共用 const 定义才对,如 zhengshen_* 刷 2026。)
- **留 docx 不转 PDF**:预览找不存在的 `.preview.pdf` → 坏。转 PDF 或补传 preview。
- **以为 `pnpm seed:eligibility` 在生产能跑**:本流程不跑 deploy,不保证有 ts-node。一律编译 JS 用 node 跑。
- **编译 JS 放错目录**:必须 `apps/server/scripts/`,否则 `__dirname` 相对 `../../../data/seed/...` 解析错,region 断言读不到县名单。
- **用 worktree 相对路径找 cube.pem/data**:它们只在主仓库,worktree 不带 → No such file。一律主仓库绝对路径。
- **服务器文件名用中文**:URL/seed 引用全断。服务器一律 ASCII,中文只用于本地归档。
- **跑全量 `deploy_auto.py` 发这改动**:会从 worktree 重建前端、可能漏 `.env.production.local` secrets(记忆 `worktree-env-local`)。本流程只需手动 scp + seed,**不要**全量部署。
- **忘记 git 落地**:生产 .ts 手动更新了没合 master,将来全量部署会回退。必须 commit + merge + push。

## 验收清单

- [ ] 公告口径与目标子类一致(逐项核对落款/文号)
- [ ] 已 grep alias/placeholder,列全会被更新的 batch 名
- [ ] 有附件:转 PDF + 服务器 ASCII 名 + 本地中文归档(主仓库绝对路径);**无直链附件(二维码/纯正文):只更 policyText/hardRules/externalUrl,附件保持占位**
- [ ] seed 只改目标子类数组/新建 const,共用 const 定义未动,无孤儿
- [ ] 若动 hardRules:rule 名来自 types.ts;新 rule 已加枚举+评估器 case;数值与 policyText 同步;**公告没给的 param 沿用旧值未瞎改**
- [ ] 每个目标 batch 名 `curl` 200 + DB `eligibilityRules` JSON 核对(examType 用中文)
- [ ] `_seedbuild` 已清;commit + merge master + push github,remote==local
