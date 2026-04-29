"""
数据部署脚本 - 上传处理好的JSON + 导入脚本到服务器并执行
用法:
  python scripts/data-processing/deploy_data.py              # 上传+导入
  python scripts/data-processing/deploy_data.py --upload-only # 只上传不执行
  python scripts/data-processing/deploy_data.py --run-only    # 只执行（已上传过）
"""
import paramiko
import os
import sys
import time
import stat

sys.stdout.reconfigure(encoding='utf-8')

# ==================== 配置 ====================
HOST = '132.232.245.53'
USER = 'ubuntu'
SSH_KEY = os.path.join(os.path.dirname(__file__), '..', '..', 'cube.pem')
REMOTE_APP = '/home/ubuntu/apps/volunteer-helper'
REMOTE_DATA = f'{REMOTE_APP}/scripts/data-processing/output'
LOCAL_OUTPUT = os.path.join(os.path.dirname(__file__), 'output')
LOCAL_SCRIPT = os.path.join(os.path.dirname(__file__), 'import_to_db.ts')

# 需要上传的JSON文件（按依赖顺序）
DATA_FILES = [
    'score_segments.json',
    'batch_lines.json',
    'universities_enriched.json',
    'majors_enriched.json',
    'enrollment_plans_enriched.json',
    'admission_records_filled.json',
    'health_restrictions.json',
    'supplementary_records.json',  # 征集志愿 (2023-2025)
    # 辅助数据（可选）
    'batch_order.json',
    'eligible_regions.json',
    'qiangji_admissions.json',
]


def get_ssh():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username=USER, key_filename=SSH_KEY, timeout=15)
    return ssh


def ssh_exec(ssh, cmd, timeout=60):
    """执行远程命令，实时输出"""
    stdin, stdout, stderr = ssh.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode('utf-8', errors='replace').strip()
    err = stderr.read().decode('utf-8', errors='replace').strip()
    code = stdout.channel.recv_exit_status()
    return out, err, code


def upload_files(ssh):
    """上传JSON文件和导入脚本到服务器"""
    sftp = ssh.open_sftp()

    # 创建远程目录
    try:
        sftp.stat(REMOTE_DATA)
    except FileNotFoundError:
        # 递归创建
        parts = REMOTE_DATA.split('/')
        for i in range(2, len(parts) + 1):
            d = '/'.join(parts[:i])
            try:
                sftp.stat(d)
            except FileNotFoundError:
                sftp.mkdir(d)

    print(f'上传数据文件到 {HOST}:{REMOTE_DATA}')
    total_size = 0

    for filename in DATA_FILES:
        local_path = os.path.join(LOCAL_OUTPUT, filename)
        if not os.path.exists(local_path):
            print(f'  ⚠ 跳过: {filename} (不存在)')
            continue

        remote_path = f'{REMOTE_DATA}/{filename}'
        size = os.path.getsize(local_path)
        total_size += size
        size_str = f'{size/1024/1024:.1f}MB' if size > 1024*1024 else f'{size/1024:.0f}KB'

        print(f'  上传: {filename} ({size_str})...', end='', flush=True)
        start = time.time()
        sftp.put(local_path, remote_path)
        elapsed = time.time() - start
        speed = size / 1024 / 1024 / elapsed if elapsed > 0 else 0
        print(f' ✓ ({elapsed:.1f}s, {speed:.1f}MB/s)')

    # 上传导入脚本
    remote_script = f'{REMOTE_APP}/scripts/data-processing/import_to_db.ts'
    print(f'  上传: import_to_db.ts...', end='', flush=True)
    sftp.put(LOCAL_SCRIPT, remote_script)
    print(' ✓')

    sftp.close()
    print(f'总上传: {total_size/1024/1024:.0f}MB')


def run_import(ssh):
    """在服务器上执行导入脚本"""
    print(f'\n在服务器上执行导入...')

    # 检查tsx是否可用
    out, err, code = ssh_exec(ssh, f'cd {REMOTE_APP}/apps/server && npx tsx --version 2>&1')
    if code != 0:
        print(f'安装tsx...')
        ssh_exec(ssh, f'cd {REMOTE_APP} && pnpm add -D tsx -w 2>&1', timeout=60)

    # 执行导入脚本
    cmd = (
        f'cd {REMOTE_APP}/apps/server && '
        f'npx tsx ../../scripts/data-processing/import_to_db.ts '
        f'--data=../../scripts/data-processing/output '
        f'2>&1'
    )

    print(f'执行: npx tsx import_to_db.ts')
    print('=' * 50)

    # 使用长超时（数据量大）
    stdin, stdout, stderr = ssh.exec_command(cmd, timeout=600)

    # 实时读取输出
    while True:
        line = stdout.readline()
        if not line:
            break
        print(line.rstrip())

    err_out = stderr.read().decode('utf-8', errors='replace').strip()
    code = stdout.channel.recv_exit_status()

    if err_out and 'Warning' not in err_out:
        print(f'\nSTDERR: {err_out[:500]}')

    if code != 0:
        print(f'\n✗ 导入失败 (exit code {code})')
        return False

    print(f'\n✓ 导入完成')
    return True


def verify(ssh):
    """验证导入结果"""
    print(f'\n验证导入结果...')
    cmd = '''mysql -u root -p"Xyt52005201314!" volunteer_helper -e "
        SELECT 'universities' as tbl, COUNT(*) as cnt FROM universities
        UNION ALL SELECT 'majors', COUNT(*) FROM majors
        UNION ALL SELECT 'enrollment_plans', COUNT(*) FROM enrollment_plans
        UNION ALL SELECT 'admission_records', COUNT(*) FROM admission_records
        UNION ALL SELECT 'score_segments', COUNT(*) FROM score_segments
        UNION ALL SELECT 'batch_lines', COUNT(*) FROM batch_lines
        UNION ALL SELECT 'supplementary_records', COUNT(*) FROM supplementary_records;
    " 2>&1 | grep -v Warning'''

    out, _, _ = ssh_exec(ssh, cmd)
    print(out)


def main():
    args = set(sys.argv[1:])
    upload_only = '--upload-only' in args
    run_only = '--run-only' in args

    print('╔══════════════════════════════════════════════════════════╗')
    print('║          智愿家 数据部署 → 服务器                        ║')
    print('╚══════════════════════════════════════════════════════════╝')
    print(f'服务器: {USER}@{HOST}')
    print(f'远程路径: {REMOTE_APP}')

    ssh = get_ssh()
    print(f'SSH 连接成功 ✓')

    try:
        if not run_only:
            upload_files(ssh)

        if not upload_only:
            ok = run_import(ssh)
            if ok:
                verify(ssh)
    finally:
        ssh.close()


if __name__ == '__main__':
    main()
