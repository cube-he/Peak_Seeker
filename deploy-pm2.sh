#!/bin/bash

# 志愿填报助手 - PM2 部署脚本 (无 Docker)
# 使用方法: bash deploy-pm2.sh

set -e

echo "=========================================="
echo "  志愿填报助手 - PM2 部署脚本"
echo "=========================================="

APP_NAME="volunteer-helper"
APP_DIR="$HOME/apps/$APP_NAME"
REPO_URL="https://gitee.com/he-chengzhi/volunteer-helper.git"

# 检查 Node.js
check_node() {
    if ! command -v node &> /dev/null; then
        echo "❌ Node.js 未安装，请先安装 Node.js 20+"
        exit 1
    fi
    echo "✓ Node.js $(node -v)"
}

# 检查 pnpm
check_pnpm() {
    if ! command -v pnpm &> /dev/null; then
        echo "安装 pnpm..."
        npm install -g pnpm
    fi
    echo "✓ pnpm $(pnpm -v)"
}

# 检查 PM2
check_pm2() {
    if ! command -v pm2 &> /dev/null; then
        echo "安装 PM2..."
        npm install -g pm2
    fi
    echo "✓ PM2 $(pm2 -v)"
}

# 克隆或更新代码
setup_code() {
    if [ -d "$APP_DIR" ]; then
        echo "更新代码..."
        cd "$APP_DIR"
        git pull origin master
    else
        echo "克隆代码..."
        mkdir -p "$HOME/apps"
        git clone "$REPO_URL" "$APP_DIR"
        cd "$APP_DIR"
    fi
    echo "✓ 代码已就绪"
}

# 配置环境变量
setup_env() {
    if [ ! -f "$APP_DIR/apps/server/.env" ]; then
        echo "创建后端环境变量..."
        cat > "$APP_DIR/apps/server/.env" << 'ENVEOF'
# 数据库配置 (MySQL)
DATABASE_URL="mysql://root:your_password@localhost:3306/volunteer_helper"

# Redis 配置
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# JWT 配置
JWT_SECRET=your_jwt_secret_key_change_this_2024
JWT_EXPIRES_IN=7d

# 服务端口
PORT=3001
ENVEOF
        echo ""
        echo "⚠️  请编辑 $APP_DIR/apps/server/.env"
        echo "   修改 DATABASE_URL 中的数据库密码"
        echo ""
    fi

    if [ ! -f "$APP_DIR/apps/web/.env.local" ]; then
        echo "创建前端环境变量..."
        cat > "$APP_DIR/apps/web/.env.local" << 'ENVEOF'
NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1
ENVEOF
    fi
    echo "✓ 环境变量已配置"
}

# 创建数据库
setup_database() {
    echo "检查 MySQL 数据库..."
    if command -v mysql &> /dev/null; then
        mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS volunteer_helper CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" 2>/dev/null || echo "请手动创建数据库"
    else
        echo "⚠️  请手动创建 MySQL 数据库: volunteer_helper"
    fi
}

# 安装依赖并构建
build_app() {
    cd "$APP_DIR"

    echo "安装依赖..."
    pnpm install

    echo "生成 Prisma Client..."
    cd apps/server
    npx prisma generate

    echo "运行数据库迁移..."
    npx prisma migrate deploy || npx prisma db push

    echo "构建后端..."
    pnpm build

    cd ../web
    echo "构建前端..."
    pnpm build

    cd ../..
    echo "✓ 构建完成"
}

# 启动服务
start_services() {
    cd "$APP_DIR"

    echo "停止旧服务..."
    pm2 delete vh-server vh-web 2>/dev/null || true

    echo "启动服务..."
    pm2 start ecosystem.config.js

    echo "保存 PM2 配置..."
    pm2 save

    echo "✓ 服务已启动"
}

# 显示状态
show_status() {
    echo ""
    echo "=========================================="
    echo "  部署完成！"
    echo "=========================================="
    echo ""
    pm2 status
    echo ""
    echo "访问地址:"
    echo "  - 前端: http://localhost:3000"
    echo "  - API:  http://localhost:3001/api/v1"
    echo "  - 文档: http://localhost:3001/api/docs"
    echo ""
    echo "常用命令:"
    echo "  - 查看日志: pm2 logs"
    echo "  - 重启服务: pm2 restart all"
    echo "  - 停止服务: pm2 stop all"
    echo ""
}

# 主流程
main() {
    check_node
    check_pnpm
    check_pm2
    setup_code
    setup_env
    setup_database
    build_app
    start_services
    show_status
}

main
