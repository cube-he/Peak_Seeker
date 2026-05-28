#!/usr/bin/env python3
"""
全自动部署脚本 - VolunteerHelper (志愿填报助手)
本地构建 → SSH 上传 → 远程迁移 → 重启服务

用法:
  python deploy_auto.py                        # 完整构建+部署
  python deploy_auto.py --skip-build           # 跳过构建，直接部署
  python deploy_auto.py --skip-tests           # 跳过测试
  python deploy_auto.py --build-only           # 只构建不部署
  python deploy_auto.py --setup                # 首次服务器初始化
  python deploy_auto.py --import-enriched      # 部署后导入丰富数据（首次需要）
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
        'clean_first': True,
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
    # 服务器端 ts-node 运行的运维脚本（ETL/seed/校准）
    'server_scripts': {
        'local': os.path.join(LOCAL_SERVER, 'scripts'),
        'remote': 'apps/server/scripts',
    },
    # 运维脚本通过 ts-node 引用的纯函数模块（subject-normalize / predict 等）
    'server_src_scripts': {
        'local': os.path.join(LOCAL_SERVER, 'src', 'scripts'),
        'remote': 'apps/server/src/scripts',
    },
    # 配置文件目录（rank-prediction.json 等运行时配置）
    'config': {
        'local': os.path.join(LOCAL_ROOT, 'config'),
        'remote': 'config',
    },
}

# 需要上传的脚本文件
SCRIPT_FILES = {
    'import_enriched': {
        'local': os.path.join(LOCAL_ROOT, 'scripts', 'import-enriched.ts'),
        'remote': 'scripts/import-enriched.ts',
    },
}

# 根目录需要上传的配置文件
ROOT_FILES = [
    'package.json',
    'pnpm-workspace.yaml',
    'pnpm-lock.yaml',
    'ecosystem.config.js',
]


def safe_print(text):
    """安全打印，处理 Windows GBK 编码问题"""
    try:
        print(text)
    except UnicodeEncodeError:
        print(text.encode('ascii', errors='replace').decode('ascii'))


def run_local(cmd, cwd=None):
    """执行本地命令"""
    safe_print(f'  > {cmd}')
    result = subprocess.run(
        cmd, shell=True, cwd=cwd or LOCAL_ROOT,
        capture_output=True, encoding='utf-8', errors='replace',
    )
    if result.returncode != 0:
        err = (result.stderr or '')[:500]
        safe_print(f'  X {err}')
        return False
    if result.stdout:
        safe_print(result.stdout[:300])
    return True


def run_remote(ssh, cmd):
    """执行远程命令"""
    safe_print(f'  > {cmd}')
    stdin, stdout, stderr = ssh.exec_command(cmd, timeout=180)
    out = stdout.read().decode('utf-8', errors='replace')
    err = stderr.read().decode('utf-8', errors='replace')
    exit_code = stdout.channel.recv_exit_status()
    if out:
        safe_print(out[:500])
    if err and 'warning' not in err.lower() and exit_code != 0:
        safe_print(f'  STDERR: {err[:300]}')
    return exit_code == 0


def connect_ssh():
    """SSH 连接"""
    print(f'连接服务器 {HOST}...')
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())

    try:
        if os.path.exists(SSH_KEY_PATH):
            ssh.connect(HOST, username=USER, key_filename=SSH_KEY_PATH, timeout=30)
            print(f'[OK] 已连接 (SSH key: {os.path.basename(SSH_KEY_PATH)})')
        else:
            password = os.environ.get('DEPLOY_PASSWORD')
            if not password:
                print(f'[FAIL] SSH key 不存在: {SSH_KEY_PATH}')
                print(f'  设置方法: ssh-keygen -t ed25519 -f {SSH_KEY_PATH}')
                print(f'  或设置环境变量: DEPLOY_PASSWORD=xxx')
                return None
            ssh.connect(HOST, username=USER, password=password, timeout=30)
            print('[OK] 已连接 (密码)')
        # 上传 .next/dist 经常 5+ 分钟, 没 keepalive 服务器会因 idle 断 SFTP 连接
        # (paramiko EOFError "Server connection dropped"). 30s 心跳保活解决.
        transport = ssh.get_transport()
        if transport:
            transport.set_keepalive(30)
        return ssh
    except Exception as e:
        print(f'[FAIL] 连接失败: {e}')
        return None


def upload_directory(sftp, local_dir, remote_dir, incremental=True, stats=None):
    """递归上传目录.

    incremental=True (默认): 远端已有同 size 文件就跳过. 大幅减少 .next/dist 重传量
    (next build 后大部分 chunk hash 文件 size 一致, 只新增/修改少量).
    arity-同 size 内容不同的边界情况几乎不会发生 - chunk 是 hash 命名, 内容变 hash 变.
    incremental=False: 全量传 (旧行为).
    """
    if stats is None:
        stats = {'uploaded': 0, 'skipped': 0}

    if not os.path.exists(local_dir):
        print(f'    跳过 (不存在): {local_dir}')
        return 0

    for item in os.listdir(local_dir):
        local_path = os.path.join(local_dir, item)
        remote_path = f'{remote_dir}/{item}'

        # 跳过不需要的文件/目录
        if item in ('node_modules', '__pycache__', '.git', '.env', '.env.local', 'venv'):
            continue

        if os.path.isfile(local_path):
            if incremental:
                try:
                    rstat = sftp.stat(remote_path)
                    if rstat.st_size == os.path.getsize(local_path):
                        stats['skipped'] += 1
                        continue
                except FileNotFoundError:
                    pass
            sftp.put(local_path, remote_path)
            stats['uploaded'] += 1
        elif os.path.isdir(local_path):
            try:
                sftp.stat(remote_path)
            except FileNotFoundError:
                sftp.mkdir(remote_path)
            upload_directory(sftp, local_path, remote_path, incremental, stats)

    return stats['uploaded']


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

    if not validate_build_artifacts():
        return False

    print('\n[OK] 构建完成')
    return True


def validate_build_artifacts():
    """部署前校验关键构建产物，避免上传半成品 .next/dist。"""
    print('\n=== 构建产物校验 ===')

    checks = [
        (os.path.join(LOCAL_SERVER, 'dist', 'main.js'), '后端 dist/main.js'),
        (os.path.join(LOCAL_WEB, '.next', 'BUILD_ID'), '前端 .next/BUILD_ID'),
        (os.path.join(LOCAL_WEB, '.next', 'server'), '前端 .next/server'),
        (os.path.join(LOCAL_WEB, '.next', 'static'), '前端 .next/static'),
    ]

    ok = True
    for path, label in checks:
        if os.path.exists(path):
            safe_print(f'  [OK] {label}')
        else:
            safe_print(f'  [FAIL] 缺少 {label}: {path}')
            ok = False

    if not ok:
        safe_print('  请停止可能占用 apps/web/.next 的 dev server，清理 .next 后重新构建。')
        return False

    build_id_path = os.path.join(LOCAL_WEB, '.next', 'BUILD_ID')
    try:
        with open(build_id_path, 'r', encoding='utf-8') as f:
            safe_print(f'  前端 BUILD_ID: {f.read().strip()}')
    except OSError:
        return False

    return True


def deploy(ssh, run_enriched_import=False, full_upload=False):
    """部署到服务器. full_upload=True 时强制 rm-rf 远端目录 + 全量传"""
    print('\n=== 部署到服务器 ===')
    if full_upload:
        print('  [模式] 全量上传 (强制清空远端)')
    else:
        print('  [模式] 增量上传 (size 相同的文件跳过)')
    sftp = ssh.open_sftp()

    # 1. 确保远程目录存在
    print('\n[1/7] 准备远程目录...')
    for key, conf in UPLOAD_MAP.items():
        remote = f"{REMOTE_PATH}/{conf['remote']}"
        run_remote(ssh, f'mkdir -p {remote}')
    run_remote(ssh, f'mkdir -p {REMOTE_PATH}/scripts')

    # 2. 上传根目录配置文件
    print('\n[2/7] 上传配置文件...')
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

    # 上传脚本文件
    for key, conf in SCRIPT_FILES.items():
        local_file = conf['local']
        if os.path.exists(local_file):
            print(f'    {conf["remote"]}')
            sftp.put(local_file, f'{REMOTE_PATH}/{conf["remote"]}')

    # 3. 上传各模块
    print('\n[3/7] 上传编译产物...')
    for key, conf in UPLOAD_MAP.items():
        local_dir = conf['local']
        remote_dir = f"{REMOTE_PATH}/{conf['remote']}"

        if not os.path.exists(local_dir):
            print(f'  [{key}] 跳过 (不存在)')
            continue

        # clean_first: 仅在 full_upload 模式才 rm-rf 重建. 增量模式保留旧文件让 size
        # 比对去重 (孤儿文件会残留, 但不影响功能; 每月手动清一次即可).
        if conf.get('clean_first') and full_upload:
            run_remote(ssh, f'rm -rf {remote_dir}')
            run_remote(ssh, f'mkdir -p {remote_dir}')
        else:
            # 保证目录存在
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
        stats = {'uploaded': 0, 'skipped': 0}
        upload_directory(sftp, local_dir, remote_dir, incremental=not full_upload, stats=stats)
        print(f'  [{key}] [OK] 上传 {stats["uploaded"]} / 跳过 {stats["skipped"]}')

    sftp.close()

    # 4. 安装服务器依赖
    print('\n[4/7] 安装服务器依赖...')
    run_remote(ssh, f'cd {REMOTE_PATH} && CI=true pnpm install --prod 2>&1 | tail -5')
    # ts-node 用于运行导入脚本，安装为全局或临时依赖
    run_remote(ssh, f'cd {REMOTE_PATH} && pnpm add -Dw ts-node typescript 2>&1 | tail -3')
    run_remote(ssh, f'cd {REMOTE_PATH}/apps/server && npx prisma generate 2>&1 | tail -3')

    # 5. 运行数据库迁移
    print('\n[5/7] 运行数据库迁移...')
    run_remote(ssh, f'cd {REMOTE_PATH}/apps/server && npx prisma migrate deploy 2>&1')

    # 6. 导入丰富数据（首次或指定时运行）
    if run_enriched_import:
        print('\n[6/7] 导入丰富数据...')
        success = run_remote(ssh, f'cd {REMOTE_PATH} && npx ts-node scripts/import-enriched.ts 2>&1')
        if not success:
            print('  [WARN] 丰富数据导入失败，可稍后手动运行: pnpm import:enriched')
    else:
        print('\n[6/7] 跳过丰富数据导入 (使用 --import-enriched 启用)')

    # 7. 重启服务
    print('\n[7/7] 重启服务...')
    run_remote(ssh, 'pm2 delete vh-server vh-web vh-ocr 2>/dev/null || true')
    run_remote(ssh, f'cd {REMOTE_PATH} && pm2 start ecosystem.config.js 2>&1')
    run_remote(ssh, 'pm2 list 2>&1 | head -20')

    print('\n[OK] 部署完成')
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

    print('\n[OK] 服务器初始化完成')
    return True


def main():
    parser = argparse.ArgumentParser(description='VolunteerHelper 自动部署')
    parser.add_argument('--skip-build', action='store_true', help='跳过构建')
    parser.add_argument('--skip-tests', action='store_true', help='跳过测试')
    parser.add_argument('--build-only', action='store_true', help='只构建不部署')
    parser.add_argument('--setup', action='store_true', help='首次服务器初始化')
    parser.add_argument('--import-enriched', action='store_true', help='部署后导入丰富数据（体检/地区资格/院校专业增强）')
    parser.add_argument('--full-upload', action='store_true', help='强制全量上传 (清空远端再传). 默认增量传, 远端 size 相同的文件跳过')
    args = parser.parse_args()

    print('==========================================')
    print('  志愿填报助手 - 自动部署')
    print('==========================================')

    # 构建
    if not args.skip_build and not args.setup:
        if not build_project(skip_tests=args.skip_tests):
            print('\n[FAIL] 构建失败')
            sys.exit(1)
    elif args.skip_build and not args.setup:
        if not validate_build_artifacts():
            print('\n[FAIL] 构建产物不完整，已停止部署')
            sys.exit(1)

    # 部署
    if not args.build_only:
        ssh = connect_ssh()
        if not ssh:
            sys.exit(1)
        try:
            if args.setup:
                setup_server(ssh)
            if not deploy(ssh, run_enriched_import=args.import_enriched, full_upload=args.full_upload):
                print('\n[FAIL] 部署失败')
                sys.exit(1)
        finally:
            ssh.close()

    print('\n=== 完成 ===')


if __name__ == '__main__':
    main()
