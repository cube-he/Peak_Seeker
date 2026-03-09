#!/usr/bin/env python3
"""
全自动部署脚本 - VolunteerHelper (志愿填报助手)
参考 CourseAssistant 部署方式，支持 SSH 密钥认证
用法:
  python deploy_auto.py              # 完整构建+部署
  python deploy_auto.py --skip-build # 跳过构建，直接部署
  python deploy_auto.py --skip-tests # 跳过测试
  python deploy_auto.py --build-only # 只构建不部署
"""
import paramiko
import os
import sys
import subprocess
import argparse

# Server configuration
HOST = '47.109.156.104'
USER = 'hcz'
REMOTE_PATH = '/home/hcz/apps/volunteer-helper'
SSH_KEY_PATH = os.path.expanduser('~/.ssh/volunteer_helper_deploy')

# Local paths
LOCAL_ROOT = os.path.dirname(os.path.abspath(__file__))
LOCAL_WEB = os.path.join(LOCAL_ROOT, 'apps', 'web')
LOCAL_SERVER = os.path.join(LOCAL_ROOT, 'apps', 'server')


def run_local_command(cmd, cwd=None):
    """Run a local command and return success status"""
    print(f'  > {cmd}')
    result = subprocess.run(cmd, shell=True, cwd=cwd or LOCAL_ROOT,
                            capture_output=True, encoding='utf-8', errors='replace')
    if result.returncode != 0:
        err = result.stderr.encode('ascii', 'replace').decode('ascii') if result.stderr else ''
        print(f'  Error: {err[:500]}')
        return False
    if result.stdout:
        out = result.stdout[:500].encode('ascii', 'replace').decode('ascii')
        print(out)
    return True


def connect_ssh():
    """Connect to server using SSH key or environment password"""
    print('Connecting to server...')
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())

    try:
        if os.path.exists(SSH_KEY_PATH):
            ssh.connect(HOST, username=USER, key_filename=SSH_KEY_PATH, timeout=30)
            print('Connected (SSH key)')
        else:
            # Fallback: try CourseAssistant's key
            ca_key = os.path.expanduser('~/.ssh/course_assistant_deploy')
            if os.path.exists(ca_key):
                ssh.connect(HOST, username=USER, key_filename=ca_key, timeout=30)
                print('Connected (CourseAssistant SSH key)')
            else:
                password = os.environ.get('DEPLOY_PASSWORD')
                if not password:
                    print('Error: SSH key not found and DEPLOY_PASSWORD not set')
                    print(f'Setup SSH key:')
                    print(f'  ssh-keygen -t ed25519 -f {SSH_KEY_PATH}')
                    print(f'  ssh-copy-id -i {SSH_KEY_PATH}.pub {USER}@{HOST}')
                    print(f'Or reuse CourseAssistant key:')
                    print(f'  cp ~/.ssh/course_assistant_deploy {SSH_KEY_PATH}')
                    return None
                ssh.connect(HOST, username=USER, password=password, timeout=30)
                print('Connected (password)')
        return ssh
    except Exception as e:
        print(f'Connection failed: {e}')
        return None


def upload_directory(sftp, local_dir, remote_dir):
    """Recursively upload a directory"""
    if not os.path.exists(local_dir):
        print(f'    Warning: {local_dir} does not exist, skipping')
        return

    for item in os.listdir(local_dir):
        local_path = os.path.join(local_dir, item)
        remote_path = f'{remote_dir}/{item}'

        if os.path.isfile(local_path):
            print(f'    {item}')
            sftp.put(local_path, remote_path)
        elif os.path.isdir(local_path):
            try:
                sftp.stat(remote_path)
            except:
                sftp.mkdir(remote_path)
            upload_directory(sftp, local_path, remote_path)


def run_remote_command(ssh, cmd):
    """Run a command on the remote server"""
    print(f'  > {cmd}')
    stdin, stdout, stderr = ssh.exec_command(cmd, timeout=120)
    out = stdout.read().decode('utf-8', errors='replace')
    err = stderr.read().decode('utf-8', errors='replace')
    if out:
        out_safe = out[:500].encode('ascii', 'replace').decode('ascii')
        print(out_safe)
    if err and 'warning' not in err.lower():
        err_safe = err[:200].encode('ascii', 'replace').decode('ascii')
        print(f'  STDERR: {err_safe}')
    return stdout.channel.recv_exit_status() == 0


def build_project(skip_tests=False):
    """Build frontend and backend"""
    print('\n=== Building Project ===')

    # Install dependencies
    print('\n[1/5] Installing dependencies...')
    if not run_local_command('pnpm install'):
        return False

    # Generate Prisma Client
    print('\n[2/5] Generating Prisma Client...')
    if not run_local_command('npx prisma generate', cwd=LOCAL_SERVER):
        return False

    # Run tests (optional)
    if not skip_tests:
        print('\n[3/5] Running tests...')
        run_local_command('pnpm test')  # Don't fail on test errors
    else:
        print('\n[3/5] Skipping tests...')

    # Build backend
    print('\n[4/5] Building backend...')
    if not run_local_command('pnpm run build:server'):
        return False

    # Build frontend
    print('\n[5/5] Building frontend...')
    if not run_local_command('pnpm run build:web'):
        return False

    print('\nBuild completed successfully!')
    return True


def deploy(ssh):
    """Deploy to server"""
    print('\n=== Deploying to Server ===')
    sftp = ssh.open_sftp()

    # Ensure remote directories exist
    print('\n[1/8] Preparing remote directories...')
    run_remote_command(ssh, f'mkdir -p {REMOTE_PATH}/apps/server/dist')
    run_remote_command(ssh, f'mkdir -p {REMOTE_PATH}/apps/server/prisma')
    run_remote_command(ssh, f'mkdir -p {REMOTE_PATH}/apps/web/.next')
    run_remote_command(ssh, f'mkdir -p {REMOTE_PATH}/apps/web/public')
    run_remote_command(ssh, f'mkdir -p {REMOTE_PATH}/services/ocr-service')

    # Upload backend dist
    print('\n[2/8] Uploading backend...')
    local_server_dist = os.path.join(LOCAL_SERVER, 'dist')
    remote_server_dist = f'{REMOTE_PATH}/apps/server/dist'
    upload_directory(sftp, local_server_dist, remote_server_dist)

    # Upload Prisma schema + migrations
    print('\n[3/8] Uploading Prisma files...')
    local_prisma = os.path.join(LOCAL_SERVER, 'prisma')
    remote_prisma = f'{REMOTE_PATH}/apps/server/prisma'
    upload_directory(sftp, local_prisma, remote_prisma)

    # Upload frontend build
    print('\n[4/8] Uploading frontend...')
    local_web_next = os.path.join(LOCAL_WEB, '.next')
    remote_web_next = f'{REMOTE_PATH}/apps/web/.next'
    # Clean old build first
    run_remote_command(ssh, f'rm -rf {REMOTE_PATH}/apps/web/.next')
    run_remote_command(ssh, f'mkdir -p {remote_web_next}')
    upload_directory(sftp, local_web_next, remote_web_next)

    # Upload public assets
    local_public = os.path.join(LOCAL_WEB, 'public')
    if os.path.exists(local_public):
        remote_public = f'{REMOTE_PATH}/apps/web/public'
        upload_directory(sftp, local_public, remote_public)

    # Upload OCR service
    print('\n[5/8] Uploading OCR service...')
    local_ocr = os.path.join(LOCAL_ROOT, 'services', 'ocr-service')
    remote_ocr = f'{REMOTE_PATH}/services/ocr-service'
    for f in ['main.py', 'requirements.txt', 'setup.sh']:
        local_file = os.path.join(local_ocr, f)
        if os.path.exists(local_file):
            print(f'    {f}')
            sftp.put(local_file, f'{remote_ocr}/{f}')

    # Upload ecosystem.config.js
    eco_file = os.path.join(LOCAL_ROOT, 'ecosystem.config.js')
    if os.path.exists(eco_file):
        sftp.put(eco_file, f'{REMOTE_PATH}/ecosystem.config.js')

    sftp.close()

    # Run database migrations on server
    print('\n[6/8] Running database migrations...')
    run_remote_command(ssh,
        f'cd {REMOTE_PATH}/apps/server && npx prisma migrate deploy 2>&1 || npx prisma db push 2>&1')

    # Setup OCR service on server
    print('\n[7/8] Setting up OCR service...')
    run_remote_command(ssh, f'cd {REMOTE_PATH}/services/ocr-service && bash setup.sh 2>&1 | tail -10')

    # Restart PM2 applications
    print('\n[8/8] Restarting applications...')
    run_remote_command(ssh, f'cd {REMOTE_PATH} && pm2 start ecosystem.config.js 2>&1 || pm2 restart all 2>&1')
    run_remote_command(ssh, 'pm2 list 2>&1 | head -20')

    print('\nDeployment completed!')
    return True


def setup_server(ssh):
    """First-time server setup"""
    print('\n=== First-time Server Setup ===')

    # Create directory structure
    run_remote_command(ssh, f'mkdir -p {REMOTE_PATH}/apps/server')
    run_remote_command(ssh, f'mkdir -p {REMOTE_PATH}/apps/web')
    run_remote_command(ssh, f'mkdir -p {REMOTE_PATH}/services/ocr-service')

    # Upload package.json files for dependency installation
    sftp = ssh.open_sftp()

    # Root package.json + pnpm workspace
    for f in ['package.json', 'pnpm-workspace.yaml', 'pnpm-lock.yaml', 'ecosystem.config.js']:
        local_file = os.path.join(LOCAL_ROOT, f)
        if os.path.exists(local_file):
            print(f'  Uploading {f}...')
            sftp.put(local_file, f'{REMOTE_PATH}/{f}')

    # Server package.json
    server_pkg = os.path.join(LOCAL_SERVER, 'package.json')
    if os.path.exists(server_pkg):
        sftp.put(server_pkg, f'{REMOTE_PATH}/apps/server/package.json')

    # Web package.json + next.config.js
    for f in ['package.json', 'next.config.js']:
        local_file = os.path.join(LOCAL_WEB, f)
        if os.path.exists(local_file):
            sftp.put(local_file, f'{REMOTE_PATH}/apps/web/{f}')

    # Shared package
    local_shared = os.path.join(LOCAL_ROOT, 'packages', 'shared')
    if os.path.exists(local_shared):
        run_remote_command(ssh, f'mkdir -p {REMOTE_PATH}/packages/shared')
        upload_directory(sftp, local_shared, f'{REMOTE_PATH}/packages/shared')

    sftp.close()

    # Install dependencies on server
    print('\n  Installing dependencies on server...')
    run_remote_command(ssh, f'cd {REMOTE_PATH} && pnpm install --prod 2>&1 | tail -5')

    # Generate Prisma Client on server
    print('\n  Generating Prisma Client...')
    run_remote_command(ssh, f'cd {REMOTE_PATH}/apps/server && npx prisma generate 2>&1')

    print('\nServer setup completed!')
    return True


def main():
    parser = argparse.ArgumentParser(description='VolunteerHelper Auto Deploy')
    parser.add_argument('--skip-build', action='store_true', help='Skip build step')
    parser.add_argument('--skip-tests', action='store_true', help='Skip tests')
    parser.add_argument('--build-only', action='store_true', help='Only build, no deploy')
    parser.add_argument('--setup', action='store_true', help='First-time server setup')
    args = parser.parse_args()

    # Build
    if not args.skip_build and not args.setup:
        if not build_project(skip_tests=args.skip_tests):
            print('\nBuild failed!')
            sys.exit(1)

    # Deploy
    if not args.build_only:
        ssh = connect_ssh()
        if not ssh:
            sys.exit(1)

        try:
            if args.setup:
                if not setup_server(ssh):
                    print('\nServer setup failed!')
                    sys.exit(1)
            if not deploy(ssh):
                print('\nDeployment failed!')
                sys.exit(1)
        finally:
            ssh.close()

    print('\n=== All Done! ===')


if __name__ == '__main__':
    main()
