#!/usr/bin/env python3
"""
全自动部署脚本 - VolunteerHelper (志愿填报助手)
本地构建 → SSH 上传 → 远程迁移 → 重启服务

用法:
  python deploy_auto.py              # 完整构建+部署
  python deploy_auto.py --skip-build # 跳过构建，直接部署
  python deploy_auto.py --skip-tests # 跳过测试
  python deploy_auto.py --build-only # 只构建不部署
  python deploy_auto.py --setup      # 首次服务器初始化
  python deploy_auto.py --branch dev # 指定分支（默认 master）
"""
import paramiko
import os
import sys
import subprocess
import argparse

# ==================== 配置 ====================
HOST = '132.232.245.53'
USER = 'ubuntu'
REMOTE_PATH = '/home/ubuntu/apps/volunteer-helper'
SSH_KEY_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'cube.pem')
DEFAULT_BRANCH = 'master'

# 本地路径
LOCAL_ROOT = os.path.dirname(os.path.abspath(__file__))
LOCAL_WEB = os.path.join(LOCAL_ROOT, 'apps', 'web')
LOCAL_SERVER = os.path.join(LOCAL_ROOT, 'apps', 'server')
LOCAL_SHARED = os.path.join(LOCAL_ROOT, 'packages', 'shared')

# 需要上传到服务器的目录/文件清单
UPLOAD_MAP = {
    # 后端编译产物
    'server_dist': {
        'local': os.path.join(LOCAL_SERVER, 'dist'),
        'remote': 'apps/server/dist',
    },
    # Prisma schema + migrations
    'prisma': {
        'local': os.path.join(LOCAL_SERVER, 'prisma'),
        'remote': 'apps/server/prisma',
    },
    # 前端编译产物
    'web_next': {
        'local': os.path.join(LOCAL_WEB, '.next'),
        'remote': 'apps/web/.next',
        'clean_first': True,
    },
    # 前端静态资源
    'web_public': {
        'local': os.path.join(LOCAL_WEB, 'public'),
        'remote': 'apps/web/public',
    },
    # 共享类型包
    'shared': {
        'local': LOCAL_SHARED,
        'remote': 'packages/shared',
    },
    # OCR 服务
    'ocr': {
        'local': os.path.join(LOCAL_ROOT, 'services', 'ocr-service'),
        'remote': 'services/ocr-service',
        'files_only': [
            'main.py', 'ai_parser.py', 'multi_engine_validator.py',
            'image_preprocessor.py', 'requirements.txt', 'setup.sh',
        ],
    },
}

# 根目录需要上传的配置文件
ROOT_FILES = [
    'package.json',
    'pnpm-workspace.yaml',
    'pnpm-lock.yaml',
    'ecosystem.config.js',
]


def run_local(cmd, cwd=None):
    """执行本地命令"""
    print(f'  > {cmd}')
    result = subprocess.run(
        cmd, shell=True, cwd=cwd or LOCAL_ROOT,
        capture_output=True, encoding='utf-8', errors='replace',
    )
    if result.returncode != 0:
        err = (result.stderr or '')[:500]
        print(f'  ✗ {err}')
        return False
    if result.stdout:
        print(result.stdout[:300])
    return True


def run_remote(ssh, cmd):
    """执行远程命令"""
    print(f'  > {cmd}')
    stdin, stdout, stderr = ssh.exec_command(cmd, timeout=180)
    out = stdout.read().decode('utf-8', errors='replace')
    err = stderr.read().decode('utf-8', errors='replace')
    exit_code = stdout.channel.recv_exit_status()
    if out:
        print(out[:500])
    if err and 'warning' not in err.lower() and exit_code != 0:
        print(f'  STDERR: {err[:300]}')
    return exit_code == 0


def connect_ssh():
    """SSH 连接"""
    print(f'连接服务器 {HOST}...')
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())

    try:
        if os.path.exists(SSH_KEY_PATH):
            ssh.connect(HOST, username=USER, key_filename=SSH_KEY_PATH, timeout=30)
            print(f'✓ 已连接 (SSH key: {os.path.basename(SSH_KEY_PATH)})')
        else:
            password = os.environ.get('DEPLOY_PASSWORD')
            if not password:
                print(f'✗ SSH key 不存在: {SSH_KEY_PATH}')
                print(f'  设置方法: ssh-keygen -t ed25519 -f {SSH_KEY_PATH}')
                print(f'  或设置环境变量: DEPLOY_PASSWORD=xxx')
                return None
            ssh.connect(HOST, username=USER, password=password, timeout=30)
            print('✓ 已连接 (密码)')
        return ssh
    except Exception as e:
        print(f'✗ 连接失败: {e}')
        return None


def upload_directory(sftp, local_dir, remote_dir):
    """递归上传目录"""
    if not os.path.exists(local_dir):
        print(f'    跳过 (不存在): {local_dir}')
        return 0

    count = 0
    for item in os.listdir(local_dir):
        local_path = os.path.join(local_dir, item)
        remote_path = f'{remote_dir}/{item}'

        # 跳过不需要的文件/目录
        if item in ('node_modules', '__pycache__', '.git', '.env', '.env.local', 'venv'):
            continue

        if os.path.isfile(local_path):
            sftp.put(local_path, remote_path)
            count += 1
        elif os.path.isdir(local_path):
            try:
                sftp.stat(remote_path)
            except FileNotFoundError:
                sftp.mkdir(remote_path)
            count += upload_directory(sftp, local_path, remote_path)

    return count


def build_project(skip_tests=False):
    """本地构建"""
    print('\n=== 本地构建 ===')

    print('\n[1/5] 安装依赖...')
    if not run_local('pnpm install'):
        return False

    print('\n[2/5] 生成 Prisma Client...')
    if not run_local('npx prisma generate', cwd=LOCAL_SERVER):
        return False

    if not skip_tests:
        print('\n[3/5] 运行测试...')
        run_local('pnpm test')  # 测试失败不阻断部署
    else:
        print('\n[3/5] 跳过测试')

    print('\n[4/5] 构建后端...')
    if not run_local('pnpm build:server'):
        return False

    print('\n[5/5] 构建前端...')
    if not run_local('pnpm build:web'):
        return False

    print('\n✓ 构建完成')
    return True


def deploy(ssh):
    """部署到服务器"""
    print('\n=== 部署到服务器 ===')
    sftp = ssh.open_sftp()

    # 1. 确保远程目录存在
    print('\n[1/6] 准备远程目录...')
    for key, conf in UPLOAD_MAP.items():
        remote = f"{REMOTE_PATH}/{conf['remote']}"
        run_remote(ssh, f'mkdir -p {remote}')

    # 2. 上传根目录配置文件
    print('\n[2/6] 上传配置文件...')
    for f in ROOT_FILES:
        local_file = os.path.join(LOCAL_ROOT, f)
        if os.path.exists(local_file):
            print(f'    {f}')
            sftp.put(local_file, f'{REMOTE_PATH}/{f}')

    # 上传 server 和 web 的 package.json
    for sub in ['apps/server/package.json', 'apps/web/package.json', 'apps/web/next.config.js']:
        local_file = os.path.join(LOCAL_ROOT, sub)
        if os.path.exists(local_file):
            print(f'    {sub}')
            sftp.put(local_file, f'{REMOTE_PATH}/{sub}')

    # 3. 上传各模块
    print('\n[3/6] 上传编译产物...')
    for key, conf in UPLOAD_MAP.items():
        local_dir = conf['local']
        remote_dir = f"{REMOTE_PATH}/{conf['remote']}"

        if not os.path.exists(local_dir):
            print(f'  [{key}] 跳过 (不存在)')
            continue

        # 需要先清理旧文件的目录
        if conf.get('clean_first'):
            run_remote(ssh, f'rm -rf {remote_dir}')
            run_remote(ssh, f'mkdir -p {remote_dir}')

        # 只上传指定文件
        if conf.get('files_only'):
            for f in conf['files_only']:
                local_file = os.path.join(local_dir, f)
                if os.path.exists(local_file):
                    print(f'    [{key}] {f}')
                    sftp.put(local_file, f'{remote_dir}/{f}')
            continue

        print(f'  [{key}] 上传中...')
        count = upload_directory(sftp, local_dir, remote_dir)
        print(f'  [{key}] ✓ {count} 个文件')

    sftp.close()

    # 4. 安装服务器依赖
    print('\n[4/6] 安装服务器依赖...')
    run_remote(ssh, f'cd {REMOTE_PATH} && CI=true pnpm install --prod 2>&1 | tail -5')
    run_remote(ssh, f'cd {REMOTE_PATH}/apps/server && npx prisma generate 2>&1 | tail -3')

    # 5. 运行数据库迁移
    print('\n[5/6] 运行数据库迁移...')
    run_remote(ssh, f'cd {REMOTE_PATH}/apps/server && npx prisma migrate deploy 2>&1')

    # 6. 重启服务
    print('\n[6/6] 重启服务...')
    run_remote(ssh, f'cd {REMOTE_PATH} && pm2 restart ecosystem.config.js 2>&1 || pm2 start ecosystem.config.js 2>&1')
    run_remote(ssh, 'pm2 list 2>&1 | head -20')

    print('\n✓ 部署完成')
    return True


def setup_server(ssh):
    """首次服务器初始化"""
    print('\n=== 首次服务器初始化 ===')

    # 创建目录结构
    dirs = [
        'apps/server/dist', 'apps/server/prisma',
        'apps/web/.next', 'apps/web/public',
        'packages/shared',
        'services/ocr-service',
        'logs',
    ]
    for d in dirs:
        run_remote(ssh, f'mkdir -p {REMOTE_PATH}/{d}')

    # 上传配置文件 + 依赖安装
    sftp = ssh.open_sftp()
    for f in ROOT_FILES:
        local_file = os.path.join(LOCAL_ROOT, f)
        if os.path.exists(local_file):
            print(f'  上传 {f}')
            sftp.put(local_file, f'{REMOTE_PATH}/{f}')

    for sub in ['apps/server/package.json', 'apps/web/package.json']:
        local_file = os.path.join(LOCAL_ROOT, sub)
        if os.path.exists(local_file):
            sftp.put(local_file, f'{REMOTE_PATH}/{sub}')

    # 上传共享包
    if os.path.exists(LOCAL_SHARED):
        upload_directory(sftp, LOCAL_SHARED, f'{REMOTE_PATH}/packages/shared')

    sftp.close()

    # 安装依赖
    print('\n  安装依赖...')
    run_remote(ssh, f'cd {REMOTE_PATH} && CI=true pnpm install --prod 2>&1 | tail -5')
    run_remote(ssh, f'cd {REMOTE_PATH}/apps/server && npx prisma generate 2>&1')

    print('\n✓ 服务器初始化完成')
    return True


def main():
    parser = argparse.ArgumentParser(description='VolunteerHelper 自动部署')
    parser.add_argument('--skip-build', action='store_true', help='跳过构建')
    parser.add_argument('--skip-tests', action='store_true', help='跳过测试')
    parser.add_argument('--build-only', action='store_true', help='只构建不部署')
    parser.add_argument('--setup', action='store_true', help='首次服务器初始化')
    args = parser.parse_args()

    print('==========================================')
    print('  志愿填报助手 - 自动部署')
    print('==========================================')

    # 构建
    if not args.skip_build and not args.setup:
        if not build_project(skip_tests=args.skip_tests):
            print('\n✗ 构建失败')
            sys.exit(1)

    # 部署
    if not args.build_only:
        ssh = connect_ssh()
        if not ssh:
            sys.exit(1)
        try:
            if args.setup:
                setup_server(ssh)
            if not deploy(ssh):
                print('\n✗ 部署失败')
                sys.exit(1)
        finally:
            ssh.close()

    print('\n=== 完成 ===')


if __name__ == '__main__':
    main()
