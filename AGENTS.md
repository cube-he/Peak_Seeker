# VolunteerHelper - 高考志愿填报助手

## 项目概述
基于 AI 的高考志愿填报系统，Monorepo 架构，包含前端、后端和 OCR 三个服务。

## 技术栈
- 前端：Next.js 14 + TypeScript + Ant Design 5 + Tailwind CSS
- 后端：NestJS 10 + TypeScript + Prisma ORM
- 数据库：PostgreSQL 16 + Redis 7
- OCR 服务：Python（独立微服务，端口 8100）
- 包管理：pnpm workspace
- 部署：Docker + Nginx + PM2

## 常用命令
- `pnpm install` - 安装全部依赖
- `pnpm dev` - 启动所有服务（前端 :3000 + 后端 :3001）
- `pnpm dev:web` - 仅启动前端
- `pnpm dev:server` - 仅启动后端
- `pnpm build` - 全量构建
- `pnpm lint` - 全量 lint
- `pnpm test` - 全量测试
- `pnpm db:migrate` - 运行数据库迁移
- `pnpm db:generate` - 生成 Prisma Client
- `pnpm db:studio` - 打开 Prisma Studio（数据库可视化）
- `pnpm import:data` - 导入数据（scripts/import-data）

## 目录结构
```
apps/web/src/         # Next.js 前端（app/components/hooks/lib/services/stores/types）
apps/server/src/      # NestJS 后端（modules/prisma/redis/common）
packages/shared/      # 共享类型和工具，路径别名 @shared/*
services/ocr-service/ # Python OCR 微服务
scripts/              # 数据导入脚本
```

## 后端模块
admission, ai, ai-config, auth, data-import, favorite, history, major, plan, recommend, university, user

## 重要约定
- 共享类型放 packages/shared/，通过 `@shared/*` 引用
- Prisma schema 在 apps/server/src/prisma/，改完后必须运行 `pnpm db:generate`
- 生产环境端口：后端 3003，前端 3004，OCR 8100
- 环境变量模板：.env.production.example 和 apps/server/.env.example
- 部署脚本：deploy.sh（手动）、deploy_auto.py（自动）、deploy-pm2.sh（PM2）

## 注意事项
- 不要直接修改 pnpm-lock.yaml
- 数据库迁移文件生成后不要手动编辑
- OCR 服务使用 Python venv，与 Node 项目独立
- TypeScript 严格模式开启（noUnusedLocals, noUnusedParameters）


## 2026-05-12 部署事故复盘：前端构建环境变量遗漏

本次事故症状：

- `/universities` 加载不出数据，登录失败。
- 院校详情页地图显示“地图加载失败，请刷新重试”。

根因：

- 部署时使用了本地干净 worktree 构建前端，但 `apps/web/.env.production.local` 被 `.gitignore` 排除，没有进入临时构建目录。
- Next.js 的 `NEXT_PUBLIC_*` 变量是在构建期写入浏览器 bundle 的；构建时变量缺失，线上包就带着错误配置发布。
- API 默认值一度回退到 `http://localhost:3001/api/v1`，用户浏览器会请求自己电脑的 localhost。
- 高德地图缺少 `NEXT_PUBLIC_AMAP_JS_KEY` 和 `NEXT_PUBLIC_AMAP_JS_SECURITY`，地图加载器直接进入失败态。

硬规则：

- 部署和最终验证必须以服务器环境为准。不要再把本地构建、本地临时 worktree、本地验证当作上线依据。
- 涉及部署的 `install`、`build`、`migrate`、`restart`、线上 smoke check 一律通过 SSH 在服务器执行；本地只允许代码编辑和必要的代码阅读，不能作为部署验证证据。
- 发布流程必须在服务器上执行：拉取指定 commit/branch、安装依赖、构建、迁移、重启 PM2、健康检查。
- 前端生产构建前必须在服务器确认这些变量存在：`NEXT_PUBLIC_API_URL=/api/v1`、`NEXT_PUBLIC_AMAP_JS_KEY`、`NEXT_PUBLIC_AMAP_JS_SECURITY`。缺任意一个，停止部署。
- 前端上线后必须在服务器检查真实产物：`.next` 中不能包含 `localhost:3001`；依赖高德地图的页面必须能在真实浏览器或等效线上 smoke check 中加载出 `.amap-container`，且不能出现“地图加载失败”。
- 验证必须覆盖：`pm2 list` 服务 online、`/api/v1/health`、受影响页面 HTTP 200、受影响接口 HTTP 200、浏览器端关键 DOM/错误文案检查。
- `.env.production.local` 不能再被假设为“本地有就等于线上有”。部署脚本或服务器环境必须显式保证生产变量。

<claude-mem-context>
# Memory Context

# claude-mem status

This project has no memory yet. The current session will seed it; subsequent sessions will receive auto-injected context for relevant past work.

Memory injection starts on your second session in a project.

`/learn-codebase` is available if the user wants to front-load the entire repo into memory in a single pass (~5 minutes on a typical repo, optional). Otherwise memory builds passively as work happens.

Live activity: http://localhost:37777
How it works: `/how-it-works`

This message disappears once the first observation lands.
</claude-mem-context>
