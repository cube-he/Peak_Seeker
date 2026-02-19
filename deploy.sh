#!/bin/bash

# 志愿填报助手 - 服务器部署脚本
# 使用方法: bash deploy.sh

set -e

echo "=========================================="
echo "  志愿填报助手 - 自动部署脚本"
echo "=========================================="

# 配置变量
APP_DIR="/opt/volunteer-helper"
REPO_URL="https://gitee.com/he-chengzhi/volunteer-helper.git"

# 检查 Docker 是否安装
check_docker() {
    if ! command -v docker &> /dev/null; then
        echo "Docker 未安装，正在安装..."
        curl -fsSL https://get.docker.com | sh
        systemctl start docker
        systemctl enable docker
    fi

    if ! command -v docker-compose &> /dev/null; then
        echo "Docker Compose 未安装，正在安装..."
        curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
        chmod +x /usr/local/bin/docker-compose
    fi

    echo "✓ Docker 已就绪"
}

# 检查 Git 是否安装
check_git() {
    if ! command -v git &> /dev/null; then
        echo "Git 未安装，正在安装..."
        if command -v apt-get &> /dev/null; then
            apt-get update && apt-get install -y git
        elif command -v yum &> /dev/null; then
            yum install -y git
        fi
    fi
    echo "✓ Git 已就绪"
}

# 克隆或更新代码
setup_code() {
    if [ -d "$APP_DIR" ]; then
        echo "更新代码..."
        cd "$APP_DIR"
        git pull origin master
    else
        echo "克隆代码..."
        git clone "$REPO_URL" "$APP_DIR"
        cd "$APP_DIR"
    fi
    echo "✓ 代码已就绪"
}

# 配置环境变量
setup_env() {
    if [ ! -f "$APP_DIR/.env" ]; then
        echo "创建环境变量文件..."
        cat > "$APP_DIR/.env" << 'ENVEOF'
# 数据库配置
DB_USER=postgres
DB_PASSWORD=VH_Postgres_2024!

# Redis 配置
REDIS_PASSWORD=VH_Redis_2024!

# JWT 配置 (请修改为随机字符串)
JWT_SECRET=your_jwt_secret_key_change_this_in_production_2024

# Claude API (可选)
CLAUDE_API_KEY=

# 前端 API 地址 (修改为你的域名或IP)
NEXT_PUBLIC_API_URL=http://localhost/api/v1
ENVEOF
        echo ""
        echo "⚠️  请编辑 $APP_DIR/.env 文件，修改以下配置："
        echo "   - DB_PASSWORD: 数据库密码"
        echo "   - REDIS_PASSWORD: Redis 密码"
        echo "   - JWT_SECRET: JWT 密钥"
        echo "   - NEXT_PUBLIC_API_URL: 改为你的域名"
        echo ""
        read -p "按 Enter 继续，或 Ctrl+C 退出编辑配置..."
    fi
    echo "✓ 环境变量已配置"
}

# 构建并启动服务
start_services() {
    cd "$APP_DIR"

    echo "构建 Docker 镜像..."
    docker-compose build

    echo "启动服务..."
    docker-compose up -d

    echo "等待服务启动..."
    sleep 10

    echo "初始化数据库..."
    docker-compose exec -T server npx prisma migrate deploy || true

    echo "✓ 服务已启动"
}

# 显示状态
show_status() {
    echo ""
    echo "=========================================="
    echo "  部署完成！"
    echo "=========================================="
    echo ""
    echo "服务状态:"
    docker-compose ps
    echo ""
    echo "访问地址:"
    echo "  - 前端: http://$(hostname -I | awk '{print $1}')"
    echo "  - API:  http://$(hostname -I | awk '{print $1}')/api/v1"
    echo "  - 文档: http://$(hostname -I | awk '{print $1}'):3001/api/docs"
    echo ""
    echo "常用命令:"
    echo "  - 查看日志: cd $APP_DIR && docker-compose logs -f"
    echo "  - 重启服务: cd $APP_DIR && docker-compose restart"
    echo "  - 停止服务: cd $APP_DIR && docker-compose down"
    echo "  - 更新部署: cd $APP_DIR && git pull && docker-compose up -d --build"
    echo ""
}

# 主流程
main() {
    check_docker
    check_git
    setup_code
    setup_env
    start_services
    show_status
}

main
