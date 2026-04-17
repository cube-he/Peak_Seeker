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
