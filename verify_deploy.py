#!/usr/bin/env python3
"""
部署验证脚本 - 检查服务器上的应用状态
"""
import paramiko
import os
import sys

HOST = '132.232.245.53'
USER = 'ubuntu'
SSH_KEY_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'cube.pem')


def connect():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    if not os.path.exists(SSH_KEY_PATH):
        print(f'No SSH key found at {SSH_KEY_PATH}')
        sys.exit(1)
    ssh.connect(HOST, username=USER, key_filename=SSH_KEY_PATH, timeout=30)
    return ssh


def run(ssh, cmd):
    stdin, stdout, stderr = ssh.exec_command(cmd, timeout=30)
    return stdout.read().decode('utf-8', errors='replace').strip()


def main():
    ssh = connect()
    print('=== VolunteerHelper Deployment Status ===\n')

    # PM2 status
    print('[PM2 Status]')
    print(run(ssh, 'pm2 list 2>&1 | grep -E "vh-|Name"'))

    # Check ports
    print('\n[Port Check]')
    print(f'  Port 3000 (web):    {run(ssh, "ss -tlnp | grep :3000 | head -1") or "NOT LISTENING"}')
    print(f'  Port 3001 (server): {run(ssh, "ss -tlnp | grep :3001 | head -1") or "NOT LISTENING"}')

    # Check Nginx
    print('\n[Nginx]')
    print(f'  Config test: {run(ssh, "sudo nginx -t 2>&1 | tail -1")}')
    print(f'  volunteer.teach-helper.cn: {run(ssh, "grep -l volunteer /etc/nginx/sites-enabled/* 2>/dev/null || echo NOT CONFIGURED")}')

    # Disk usage
    print('\n[Disk Usage]')
    print(f'  {run(ssh, "du -sh /home/hcz/apps/volunteer-helper 2>/dev/null || echo NOT DEPLOYED")}')

    # Health check
    print('\n[Health Check]')
    print(f'  API: {run(ssh, "curl -s -o /dev/null -w %{http_code} http://127.0.0.1:3001/api/v1/health 2>/dev/null || echo UNREACHABLE")}')

    ssh.close()
    print('\n=== Done ===')


if __name__ == '__main__':
    main()
