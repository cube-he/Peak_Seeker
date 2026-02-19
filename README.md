# 志愿填报助手 (VolunteerHelper)

高考志愿填报智能助手，基于 AI 技术帮助考生科学填报志愿。

## 技术栈

- **前端**: Next.js 14 + TypeScript + Ant Design 5 + Tailwind CSS
- **后端**: NestJS 10 + TypeScript + Prisma ORM
- **数据库**: PostgreSQL 16 + Redis 7
- **部署**: Docker + Nginx

## 快速开始

### 环境要求

- Node.js >= 20
- pnpm >= 8
- Docker & Docker Compose

### 本地开发

```bash
# 1. 安装依赖
pnpm install

# 2. 启动数据库服务
docker-compose -f docker-compose.dev.yml up -d

# 3. 配置环境变量
cp apps/server/.env.example apps/server/.env

# 4. 初始化数据库
pnpm db:migrate

# 5. 启动开发服务器
pnpm dev
```

访问:
- 前端: http://localhost:3000
- 后端 API: http://localhost:3001
- API 文档: http://localhost:3001/api/docs

### 生产部署

```bash
# 1. 配置环境变量
cp .env.production.example .env

# 2. 构建并启动
docker-compose up -d --build

# 3. 初始化数据库
docker-compose exec server npx prisma migrate deploy
```

## 项目结构

```
VolunteerHelper/
├── apps/
│   ├── web/          # Next.js 前端
│   └── server/       # NestJS 后端
├── packages/
│   └── shared/       # 共享类型和工具
├── docker/           # Docker 配置
└── docker-compose.yml
```

## 主要功能

- 院校查询：多维度筛选院校信息
- 专业查询：专业分类和就业数据
- 分数线查询：历年录取分数和位次
- 智能推荐：基于分数位次的冲稳保方案
- 志愿方案：方案编辑、保存和导出
- AI 助手：智能对话解答疑问

## License

MIT
