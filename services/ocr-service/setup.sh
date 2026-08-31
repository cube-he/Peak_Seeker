#!/bin/bash
# OCR 微服务环境安装脚本
# 在服务器上运行: bash services/ocr-service/setup.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "=========================================="
echo "  OCR 微服务环境安装"
echo "=========================================="

# 检查 Python3
if ! command -v python3 &> /dev/null; then
    echo "安装 Python3..."
    sudo apt-get update
    sudo apt-get install -y python3 python3-pip python3-venv
fi

# 有些 Ubuntu 镜像预装 python3，但没有单独打包的 venv/ensurepip。
if ! python3 -c 'import ensurepip, venv' &> /dev/null; then
    echo "安装 Python venv..."
    sudo apt-get update
    sudo apt-get install -y python3-venv
fi

# 扫描版志愿表和录取结果 PDF 需要 Poppler 渲染为图片。
if ! command -v pdftoppm &> /dev/null || ! pdftoppm -v &> /dev/null; then
    echo "安装 PDF 渲染工具 Poppler..."
    sudo apt-get update
    sudo apt-get install -y poppler-utils
fi

if ! pdftoppm -v &> /dev/null; then
    echo "错误: pdftoppm 安装后仍不可用"
    exit 1
fi

# 创建虚拟环境
if [ ! -d "venv" ]; then
    echo "创建 Python 虚拟环境..."
    python3 -m venv venv
fi

# 激活虚拟环境并安装依赖
echo "安装 Python 依赖..."
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

echo "检查 OCR 运行依赖..."
python -c 'import fastapi, multipart, PIL, cv2, onnxruntime, rapidocr_onnxruntime, mysql.connector'

echo ""
echo "=========================================="
echo "  安装完成！"
echo ""
echo "  启动方式:"
echo "    方式1 (直接运行):"
echo "      cd $SCRIPT_DIR"
echo "      source venv/bin/activate"
echo "      python main.py"
echo ""
echo "    方式2 (PM2 管理):"
echo "      pm2 start ecosystem.config.js --only vh-ocr"
echo "=========================================="
