# VolunteerHelper 项目说明（Claude 工作指令）

## 部署方式

生产服务器 `132.232.245.53`（SSH: ubuntu + 仓库根 `cube.pem`；远端目录 `/home/ubuntu/apps/volunteer-helper`；PM2: vh-server :3003 / vh-web :3004 / vh-ocr :8100）。

**部署一律优先增量模式**（`deploy_auto.py` 默认即增量）。`--full-upload` 是全量重传（rm -rf 远端再传，慢且费流量），仅在远端产物确认损坏时才允许使用。

**标准部署流程：**

```bash
# 1. 本地构建（改了哪端就 build 哪端）
pnpm --filter server build        # 改后端时
pnpm --filter web build           # 改前端时

# 2. 增量部署（不要用 --full-upload，除非远端产物明确损坏）
python deploy_auto.py --skip-build --skip-tests
```

脚本做的事：上传 dist/.next/prisma/scripts 等 → 远端 `pnpm install --prod` + `prisma generate` → `prisma migrate deploy`（无新迁移则空操作）→ PM2 重启三个服务 → curl 预热主要路由。上传期间会先停 vh-web，避免旧进程读到半新半旧文件。

**增量机制**：远端已有**同路径同大小**文件则跳过；`BUILD_ID`、`*-manifest.json`、`*.html`、`*.rsc` 这类"内容变但大小常不变"的文件强制每次重传（防 SSR 引旧 chunk）。正常一次部署实际只传几十~一百多个小文件、几 MB 流量。

**部署后常见补充动作**：
- 改了 university 字段/导入数据 → 清 Redis `cache:university:*`
- 改了/重导招生计划（enrollment_plans）→ 清 Redis `enroll-level:major:四川` 和 `enroll-level:university:四川`，否则 picker 的本/专科标记用旧层次
- 改了批次资格种子 → 服务器跑 `cd apps/server && pnpm seed:eligibility`（幂等）
- `data/seed/batch-region-counties.json` 不随 deploy 上传，改了要手动 SFTP 到远端同路径

## ⚠️ 部署流量坑：.next/cache（2026-06-11 修复，防回归）

**症状**：增量部署却每次消耗 ~1GB 流量。
**根因**：`.next/cache` 是 webpack 本地构建缓存（约 967MB，占 .next 的 98%），每次 build 内容和大小全变 → "同大小跳过"的增量比对永远不命中 → 每次全量重传；而 `next start` 运行时根本不需要它（运行真正需要的 .next 只有 ~19MB）。
**修复**：`deploy_auto.py` 的 UPLOAD_MAP `web_next` 配了 `exclude_dirs: ['cache']`，不要删掉这个配置。
**防回归**：若以后部署流量再次异常大，先看 deploy 输出里各模块的"上传 N / 跳过 M"统计，查是否又有"每次 build 都变的大文件"混进了上传清单（同类嫌疑：缓存目录、日志、sourcemap）。
