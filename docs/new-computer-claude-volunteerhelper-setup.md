# 新电脑 Claude + VolunteerHelper 开发环境迁移说明

本文用于让新电脑上的大模型快速理解：这台旧电脑上 Claude Code 怎么配置、VolunteerHelper 项目需要装什么、哪些配置需要单独补齐。

## 一句话目标

新电脑解压或 clone 项目后，可以完成这些验证：

```powershell
claude --version
node --version
pnpm --version
python --version
docker --version
pnpm install
pnpm db:generate
pnpm dev
```

预期服务：

- 前端：`http://localhost:3000`
- 后端：`http://localhost:3001`
- OCR 服务：`http://127.0.0.1:8100`
- Redis：`6379`
- MySQL/MariaDB：`3306`

## 旧电脑已确认的工具版本

旧电脑路径：`C:\Users\Administrator\Documents\VolunteerHelper`

全局工具：

| 工具 | 旧电脑版本 / 状态 | 新电脑建议 |
|---|---:|---|
| Node.js | `v22.14.0` | 安装 Node 22 LTS 或至少 `>=20` |
| npm | `10.9.2` | 随 Node 安装 |
| pnpm | `11.0.9` | `npm install -g pnpm` |
| Git | `2.52.0.windows.1` | 安装 Git for Windows |
| Python | `3.11.9` | 安装 Python 3.11 |
| Docker | `29.3.1` | 建议安装 Docker Desktop |
| Docker Compose | `v5.1.1` | 随 Docker Desktop 安装 |
| Claude Code | `2.1.142` | `npm install -g @anthropic-ai/claude-code` |
| Codex CLI | `0.125.0` | 可选：`npm install -g @openai/codex` |
| ccusage | `18.0.10` | 可选：`npm install -g ccusage` |
| psql | 未在 PATH 中发现 | 本项目当前不建议优先装 PostgreSQL |
| redis-server | 未在 PATH 中发现 | 建议用 Docker 跑 Redis |

旧电脑全局 npm 包：

```text
@anthropic-ai/claude-code@2.1.142
@openai/codex@0.125.0
ccusage@18.0.10
pnpm@11.0.9
```

## 新电脑必须安装

### 1. 基础开发工具

```powershell
# 安装完成后验证
node --version
npm --version
git --version
python --version
docker --version
docker compose version
```

建议版本：

- Node.js：22.x；最低满足项目 `package.json` 的 `>=20.0.0`
- Python：3.11.x
- Docker Desktop：用于 MySQL/MariaDB、Redis，避免本机手装数据库
- Git for Windows：用于后续分支和提交

### 2. 全局 npm 工具

```powershell
npm install -g pnpm @anthropic-ai/claude-code

# 可选
npm install -g @openai/codex ccusage
```

验证：

```powershell
pnpm --version
claude --version
```

## Claude Code 配置迁移

### 需要复制或重建的 Claude 文件

旧电脑 Claude 用户目录：

```text
C:\Users\Administrator\.claude
C:\Users\Administrator\.claude.json
```

建议迁移这些内容：

| 路径 | 是否建议复制 | 用途 |
|---|---|---|
| `~\.claude\CLAUDE.md` | 是 | 全局中文沟通、工作流、代码规范 |
| `~\.claude\settings.json` | 谨慎 | Claude API 网关配置，含敏感 token |
| `~\.claude\skills` | 是 | 本机自定义 skills |
| `~\.claude\commands` | 是 | 自定义 slash commands |
| `~\.claude\rules` | 是 | 规则文档 |
| `~\.claude\design-md` | 可选 | 前端设计参考资料 |
| `~\.claude\plugins` | 可选 | 插件缓存和安装状态 |
| `~\.claude.json` | 可选 | Claude 本机状态和 MCP 配置 |

不建议复制：

- `~\.claude\projects`
- `~\.claude\sessions`
- `~\.claude\file-history`
- `~\.claude\shell-snapshots`
- `~\.claude\history.jsonl`
- `~\.claude\stats-cache.json`

这些主要是历史会话、缓存和本机状态，复制价值不高，还可能带旧路径。

### Claude API 配置

旧电脑 `~\.claude\settings.json` 使用了：

```json
{
  "env": {
    "ANTHROPIC_AUTH_TOKEN": "<旧电脑私密 token，不要写进仓库>",
    "ANTHROPIC_BASE_URL": "https://cc.580ai.net"
  },
  "skipDangerousModePermissionPrompt": true
}
```

新电脑有两种做法：

1. 推荐：重新执行 Claude 登录或重新配置自己的 token。
2. 如果必须复用旧配置：只在新电脑本机 `~\.claude\settings.json` 中配置，不要提交到 Git。

安全要求：

- 不要把 `ANTHROPIC_AUTH_TOKEN` 写入项目文档、Git、聊天记录或公共网盘。
- 传输 `settings.json` 时确认只在可信设备之间进行。

### Claude MCP 配置

旧电脑 `~\.claude.json` 中发现一个用户级 MCP：

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "type": "stdio",
      "command": "npx",
      "args": ["chrome-devtools-mcp@latest"],
      "env": {}
    }
  }
}
```

新电脑如需浏览器调试能力，需要：

```powershell
node --version
npx chrome-devtools-mcp@latest --help
```

Claude 里确认 MCP 正常后，再让大模型使用浏览器检查页面。

### Claude 插件和 skills

旧电脑安装过这些 Claude 插件：

| 插件 | 版本 / 状态 | 作用 |
|---|---|---|
| `superpowers@superpowers-dev` | `5.0.7` | 开发流程、TDD、debug、计划等 skills |
| `claude-hud@cube-he` | `0.0.12` | Claude HUD |
| `frontend-design@claude-plugins-official` | `latest` | 前端设计 workflow |
| `claude-mem@thedotmack` | `12.4.7` | Claude memory |

旧电脑的主要 skills：

```text
brainstorming
dispatching-parallel-agents
executing-plans
finishing-a-development-branch
frontend-design
frontend-design-enhanced
frontend-design-workflow
knowledge-agent
mem-search
pathfinder
receiving-code-review
requesting-code-review
smart-explore
subagent-driven-development
systematic-debugging
test-driven-development
ui-ux-pro-max
using-git-worktrees
using-superpowers
verification-before-completion
writing-plans
writing-skills
```

迁移建议：

1. 先安装 Claude Code。
2. 复制 `~\.claude\CLAUDE.md`、`skills`、`commands`、`rules`。
3. 如果 Claude 插件系统可用，再重新安装插件；不要强依赖复制缓存。
4. 启动 Claude 后运行 `/help` 或插件相关命令确认是否识别。

## VolunteerHelper 项目依赖

### 项目结构

Monorepo workspace：

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
  - 'scripts'
```

核心目录：

| 目录 | 作用 |
|---|---|
| `apps/web` | Next.js 14 前端 |
| `apps/server` | NestJS 10 后端 |
| `packages/shared` | 共享类型和工具 |
| `services/ocr-service` | Python OCR 微服务 |
| `scripts` | 数据导入脚本 |
| `data` | 项目数据和素材，体积很大 |

### 数据库注意点

项目旧文档里曾写 PostgreSQL，但当前代码实际更偏向 MySQL/MariaDB：

- `apps/server/prisma/schema.prisma`：`provider = "mysql"`
- `apps/server/src/prisma/prisma.service.ts`：使用 `@prisma/adapter-mariadb`
- `apps/server/.env.example`：`DATABASE_URL="mysql://..."`
- `docker-compose.yml`：生产样例使用 `mysql:8.0`

所以新电脑默认按 MySQL/MariaDB 准备，不要直接按 PostgreSQL 配。

残余风险：

- `docker-compose.dev.yml` 里有 PostgreSQL 片段，且当前文件内容疑似格式异常。
- 新电脑上的大模型应优先读取 `apps/server/prisma/schema.prisma` 和实际 `.env`，再决定数据库。

### 推荐服务安装方式

推荐用 Docker 跑数据库和 Redis：

```powershell
docker compose up -d mysql redis
```

如果只需要开发依赖，也可以单独创建 MySQL 和 Redis 容器；关键是 `.env` 里的连接信息要匹配。

### Node 依赖安装

在项目根目录执行：

```powershell
pnpm install
pnpm db:generate
```

不要复制旧电脑的：

- `node_modules`
- `.next`
- `.pnpm-store`
- `apps/server/dist`
- Python `venv` / `.venv`

这些应在新电脑重新生成。

### Python OCR 服务

OCR 目录：

```text
services/ocr-service
```

依赖文件：

```text
services/ocr-service/requirements.txt
```

新电脑安装：

```powershell
cd services\ocr-service
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
```

运行方式需让新电脑上的大模型先查看 `services/ocr-service/main.py`，通常应类似：

```powershell
uvicorn main:app --host 127.0.0.1 --port 8100
```

PaddleOCR 在 requirements 里是可选项，旧文件注释说明本地可不装。先跑通基础 OCR 服务，再决定是否安装：

```powershell
pip install paddlepaddle paddleocr
```

## 必须迁移或重建的项目配置

### 后端 env

旧电脑存在：

```text
apps/server/.env
apps/server/.env.example
```

新电脑可以从 `.env.example` 复制：

```powershell
Copy-Item apps\server\.env.example apps\server\.env
```

然后补齐：

```text
DATABASE_URL=mysql://<user>:<password>@localhost:3306/volunteer_helper
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=<如果 Redis 有密码就填>
REDIS_QUEUE_DB=1
JWT_SECRET=<新电脑本地开发密钥>
CLAUDE_API_KEY=<后端调用 Claude 所需 key，如功能需要>
PORT=3001
CORS_ORIGIN=http://localhost:3000
OCR_SERVICE_URL=http://127.0.0.1:8100
AMAP_SERVICE_KEY=<高德 Web Service key，如地图/地理功能需要>
```

### 前端 env

旧电脑存在：

```text
apps/web/.env.example
apps/web/.env.production.local
```

前端至少需要：

```text
NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1
NEXT_PUBLIC_AMAP_JS_KEY=<高德 JS API key>
NEXT_PUBLIC_AMAP_JS_SECURITY=<高德 JS API security>
```

开发环境可新建：

```powershell
Copy-Item apps\web\.env.example apps\web\.env.local
```

然后补 `NEXT_PUBLIC_API_URL`。

注意：`NEXT_PUBLIC_*` 会进入浏览器 bundle，不要放真正私密的后端密钥。

### 敏感文件

旧电脑项目里有：

```text
cube.pem
apps/server/.env
apps/web/.env.production.local
```

这些只允许可信迁移，不要提交，不要公开上传。

## 压缩包迁移信息

已在旧电脑生成迁移包：

```text
C:\Users\Administrator\Documents\VolunteerHelper_transfer\VolunteerHelper-migration-20260517-212848.zip
```

大小：

```text
8.31GB
```

SHA256：

```text
06718FF33033830DAA0FE7FD9C5C0EA10A3C5633503827336E3032B56AAA8541
```

新电脑拷贝后可验证：

```powershell
Get-FileHash -Algorithm SHA256 .\VolunteerHelper-migration-20260517-212848.zip
```

如果哈希一致，说明压缩包传输完整。

## 新电脑推荐执行顺序

### 1. 安装工具

```powershell
node --version
npm --version
npm install -g pnpm @anthropic-ai/claude-code
pnpm --version
claude --version
git --version
python --version
docker --version
docker compose version
```

### 2. 解压项目

把压缩包解压到类似路径：

```text
C:\Users\<YourUser>\Documents\VolunteerHelper
```

如果换了路径，Claude 的旧项目状态不要照搬；让 Claude 重新 trust 当前项目即可。

### 3. 恢复 Claude 偏好

最小迁移：

```text
复制旧电脑 ~\.claude\CLAUDE.md 到新电脑 ~\.claude\CLAUDE.md
复制旧电脑 ~\.claude\skills 到新电脑 ~\.claude\skills
复制旧电脑 ~\.claude\commands 到新电脑 ~\.claude\commands
复制旧电脑 ~\.claude\rules 到新电脑 ~\.claude\rules
```

然后在新电脑单独配置 Claude 登录或 `~\.claude\settings.json`。

### 4. 启动基础服务

```powershell
cd C:\Users\<YourUser>\Documents\VolunteerHelper
docker compose up -d mysql redis
```

如端口 `3306` 或 `6379` 被占用，先处理冲突，再继续。

### 5. 安装项目依赖

```powershell
pnpm install
pnpm db:generate
```

### 6. 准备 env

确认这些文件存在：

```text
apps/server/.env
apps/web/.env.local
```

如果没有，就从 example 复制并补值。

### 7. 启动服务

终端 1：

```powershell
pnpm dev:server
```

终端 2：

```powershell
pnpm dev:web
```

终端 3：

```powershell
cd services\ocr-service
.\.venv\Scripts\Activate.ps1
uvicorn main:app --host 127.0.0.1 --port 8100
```

### 8. 最小验证

```powershell
Invoke-WebRequest http://localhost:3000
Invoke-WebRequest http://localhost:3001/api/v1/health
Invoke-WebRequest http://127.0.0.1:8100
pnpm test
pnpm lint
```

如果 `pnpm test` 或 `pnpm lint` 原项目本身有既存问题，新电脑上的大模型应记录错误，不要为了“迁移”扩大修改范围。

## Git 状态提醒

旧电脑打包时项目不是干净状态：

```text
D .claude/settings.local.json
M apps/web/src/components/layout/MainLayout.tsx
M deploy_auto.py
M docs/superpowers/plans/2026-04-24-obsidian-main-memory.md
M docs/superpowers/plans/2026-04-26-karpathy-into-superpowers.md
M docs/superpowers/specs/2026-04-24-obsidian-main-memory-design.md
D scripts/debug_page3.py
M 项目实施方案.md
?? docs/superpowers/plans/2026-05-14-plan-preparation-table.md
```

新电脑接手后先执行：

```powershell
git status --short
git remote -v
git branch --show-current
```

旧电脑 remote：

```text
origin  https://gitee.com/he-chengzhi/volunteer-helper.git
github  https://github.com/cube-he/Peak_Seeker.git
```

不要在不理解这些未提交改动的情况下 reset 或 checkout。

## 给新电脑大模型的处理原则

1. 先读 `AGENTS.md` 和本文，再动项目代码。
2. Claude 配置和项目配置分开处理。
3. 不要泄露 `ANTHROPIC_AUTH_TOKEN`、`.env`、`cube.pem`。
4. 数据库以当前 Prisma schema 为准：现在是 `mysql`。
5. 新电脑重建依赖，不复制旧机器的 `node_modules`、`.next`、`dist`、`venv`。
6. 遇到端口冲突，优先改本地服务端口或停止占用进程，不改业务代码。
7. 迁移验证只证明“环境能跑”，不要顺手重构项目。
