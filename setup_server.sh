#!/bin/bash

# 服务器首次初始化脚本 - 在服务器上运行
# 用法: ssh hcz@47.109.156.104 'bash -s' < setup_server.sh

set -e

echo "=========================================="
echo "  VolunteerHelper - 服务器初始化"
echo "=========================================="

APP_DIR="$HOME/apps/volunteer-helper"

# 创建目录结构
echo "[1/5] Creating directories..."
mkdir -p $APP_DIR/apps/server/dist
mkdir -p $APP_DIR/apps/server/prisma
mkdir -p $APP_DIR/apps/web/.next
mkdir -p $APP_DIR/apps/web/public
mkdir -p $APP_DIR/packages/shared
mkdir -p /var/log/pm2

# 检查 MySQL
echo "[2/5] Checking MySQL..."
if command -v mysql &> /dev/null; then
    echo "  MySQL found"
    mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS volunteer_helper CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" 2>/dev/null || echo "  Please create database manually"
else
    echo "  WARNING: MySQL not found, please install MySQL 8"
fi

# 检查 Redis
echo "[3/5] Checking Redis..."
if command -v redis-cli &> /dev/null; then
    echo "  Redis found: $(redis-cli ping 2>/dev/null || echo 'not running')"
else
    echo "  WARNING: Redis not found, please install Redis 7"
fi

# 创建后端环境变量
echo "[4/5] Setting up environment..."
if [ ! -f "$APP_DIR/apps/server/.env" ]; then
    cat > "$APP_DIR/apps/server/.env" << 'ENVEOF'
# 数据库配置 (MySQL)
DATABASE_URL="mysql://root:your_password@localhost:3306/volunteer_helper"

# Redis 配置
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# JWT 配置
JWT_SECRET=your_jwt_secret_key_change_this_2024
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# Claude API (可选)
CLAUDE_API_KEY=

# 服务端口
PORT=3001

# OCR 微服务
OCR_SERVICE_URL=http://127.0.0.1:8100
ENVEOF
    echo "  Created $APP_DIR/apps/server/.env"
    echo "  >>> IMPORTANT: Edit this file and set your database password <<<"
else
    echo "  .env already exists"
fi

# 前端环境变量
if [ ! -f "$APP_DIR/apps/web/.env.local" ]; then
    cat > "$APP_DIR/apps/web/.env.local" << 'ENVEOF'
NEXT_PUBLIC_API_URL=http://volunteer.teach-helper.cn/api/v1
ENVEOF
    echo "  Created $APP_DIR/apps/web/.env.local"
fi

# 配置 Nginx
echo "[5/5] Nginx configuration..."
echo "  Please copy nginx.conf to server:"
echo "  scp nginx.conf hcz@47.109.156.104:/etc/nginx/sites-available/volunteer-helper"
echo "  Then run on server:"
echo "    sudo ln -sf /etc/nginx/sites-available/volunteer-helper /etc/nginx/sites-enabled/"
echo "    sudo nginx -t && sudo systemctl reload nginx"

echo ""
echo "=========================================="
echo "  Server setup complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "  1. Edit $APP_DIR/apps/server/.env (set database password)"
echo "  2. Configure Nginx (see above)"
echo "  3. Run: python deploy_auto.py --setup  (from local machine)"
echo "  4. Run: python deploy_auto.py           (full build + deploy)"
echo ""
