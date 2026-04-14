# VolunteerHelper - 智愿家 高考志愿填报助手

## 项目概述
基于 AI 的高考志愿填报系统（四川省），Monorepo 架构，包含前端、后端和 OCR 三个服务。
品牌名：智愿家（立方公司产品）

## 技术栈
- 前端：Next.js 14 + TypeScript + Ant Design 5 + Tailwind CSS
- 后端：NestJS 10 + TypeScript + Prisma ORM (v7.4.0)
- 数据库：**MySQL 8.0** + Redis 7（注意：不是 PostgreSQL）
- OCR 服务：Python（独立微服务，端口 8100）
- 包管理：pnpm workspace
- 部署：SSH + PM2（生产）/ Docker Compose（可选）

## 服务器环境
- **生产服务器**: 132.232.245.53 (Ubuntu)
- **SSH**: 用户 `ubuntu`，密钥 `cube.pem`（项目根目录）
- **远程路径**: /home/ubuntu/apps/volunteer-helper
- **进程管理**: PM2 (ecosystem.config.js)
  - vh-server: NestJS 后端 (port 3003)
  - vh-web: Next.js 前端 (port 3004)
  - vh-ocr: Python OCR (port 8100)
- **反向代理**: Nginx
- **部署脚本**: `deploy_auto.py`（自动构建+SSH上传+迁移+重启）

## 数据库
- **引擎**: MySQL 8.0 (charset: utf8mb4)
- **本地连接**: `mysql://root:password@localhost:3306/volunteer_helper`
- **生产连接**: 通过 `.env.production` 中的 `DATABASE_URL` 配置
- **Prisma schema**: `apps/server/prisma/schema.prisma` (provider = "mysql")
- **现有迁移**: `20260414160425_foundation_layer` (基础表结构)
- **Docker Compose**: 提供 MySQL 8.0 + Redis 7 容器化方案

## 常用命令
```bash
pnpm install          # 安装全部依赖
pnpm dev              # 启动所有服务（前端 :3000 + 后端 :3001）
pnpm dev:web          # 仅启动前端
pnpm dev:server       # 仅启动后端
pnpm build            # 全量构建
pnpm lint             # 全量 lint
pnpm test             # 全量测试
pnpm db:migrate       # 运行数据库迁移 (dev)
pnpm db:deploy        # 运行数据库迁移 (production)
pnpm db:generate      # 生成 Prisma Client
pnpm db:studio        # 打开 Prisma Studio
pnpm db:push          # 推送 schema 到数据库（无迁移文件）
pnpm import:data      # 导入数据（scripts/import-data）
```

## 数据处理管道
原始数据在 `data/` 目录（331个文件，不入 git），处理脚本在 `scripts/data-processing/`。

```bash
# 一键执行全部处理步骤
python scripts/data-processing/run_pipeline.py

# 单步执行
python scripts/data-processing/run_pipeline.py --step=3

# 只跑验证
python scripts/data-processing/run_pipeline.py --validate
```

**处理流程（9步）**:
1. 一分一段表 (01 JSON → 12,241条, 2017-2025)
2. 批次线 (01 JSON + 07扩展 → 223条, 2020-2025)
3. 03主表处理 (院校2,238所 + 专业1,434个 + 计划48,132条 + 录取135,291条)
4. 01 API补齐2025空缺 (+5,552条专业级分数)
5. 04专业组结构补全
6. 02国家库元数据丰富 (排名/评估/满意度/章程)
7. 体检受限 (1,974条)
8. 数据验证 (42 PASS / 8 WARN / 0 FAIL)
9. 政策文件 (录取顺序/地区资格/强基计划/就业/课程)

**配置**: `scripts/data-processing/config.json`（年份/文件路径/列映射/批次映射集中管理）
**产出**: `scripts/data-processing/output/` 下的 JSON 文件（329MB）
**年度更新**: 只需修改 config.json 中的文件路径，重跑 pipeline

### 数据源与编码系统
- 03专家版主表: 四川招生代码 (1-9957)
- 01 API: 扩展国标代码 (5-6位, 如100011)
- 02国家库: 标准国标代码 (5位, 如10001)
- 08编码映射表: 招生代码 ↔ 国标代码 (2,239条, 99.4%匹配)

### 01 API 分数字段翻转（重要）
- 2022-2024: 有效分数在 `uMinScore/uMaxScore` 字段，非u字段全零
- 2025: 有效分数在 `minScore/maxScore` 字段，u*字段全零

## 目录结构
```
apps/web/src/              # Next.js 前端
apps/server/src/           # NestJS 后端
apps/server/prisma/        # Prisma schema + migrations
packages/shared/           # 共享类型，路径别名 @shared/*
services/ocr-service/      # Python OCR 微服务
scripts/import-data/       # 原始数据导入脚本 (TypeScript, Prisma)
scripts/data-processing/   # 数据处理管道 (Python, 配置驱动)
data/                      # 原始数据文件 (不入git, 331文件)
  01_核心录取数据/           # API采集: 分数线/一分一段/招生计划
  02_全国基础库/             # 阳光高考: 院校库/专业库/评估/排名
  03_专家版主表/             # 供应商交付: 87列合并主表 (48,132行)
  04_新高考专业组/           # 2025专业组结构数据
  05_招生考试报_高考指南/     # 官方PDF (需OCR)
  06_单招数据/              # 高职单招
  07_政策文件/              # 体检受限/强基/地区资格/录取规则
  08_数据治理记录/           # 清洗日志/编码映射/质量报告
```

## 后端模块
admission, ai, ai-config, auth, data-import, favorite, history, major, plan, recommend, university, user

## 重要约定
- 共享类型放 packages/shared/，通过 `@shared/*` 引用
- Prisma schema 在 apps/server/prisma/，改完后必须运行 `pnpm db:generate`
- 生产环境端口：后端 3003，前端 3004，OCR 8100
- 环境变量模板：.env.production.example 和 apps/server/.env.example
- 部署脚本：deploy_auto.py（主力，SSH+构建+上传+迁移+重启）

## 注意事项
- 不要直接修改 pnpm-lock.yaml
- 数据库迁移文件生成后不要手动编辑
- OCR 服务使用 Python venv，与 Node 项目独立
- TypeScript 严格模式开启（noUnusedLocals, noUnusedParameters）
- scripts/import-data/index.ts 的 COL 列号映射已按03实际列名修正（原版从col23起全部错位）
- 数据处理脚本基于**列名**读取Excel，不依赖列号，避免列偏移问题
