#!/usr/bin/env python3
"""
部署验证脚本 - 检查服务器上的应用状态
"""
import paramiko
import os
import sys

HOST = '132.232.245.53'
USER = 'ubuntu'
REMOTE_PATH = '/home/ubuntu/apps/volunteer-helper'
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
    print(f'  Port 3004 (web):    {run(ssh, "ss -tlnp | grep :3004 | head -1") or "NOT LISTENING"}')
    print(f'  Port 3003 (server): {run(ssh, "ss -tlnp | grep :3003 | head -1") or "NOT LISTENING"}')
    print(f'  Port 8100 (OCR):    {run(ssh, "ss -tlnp | grep :8100 | head -1") or "NOT LISTENING"}')

    # Check Nginx
    print('\n[Nginx]')
    print(f'  Config test: {run(ssh, "sudo nginx -t 2>&1 | tail -1")}')
    nginx_site = run(
        ssh,
        'grep -l "127.0.0.1:3004" /etc/nginx/sites-enabled/* 2>/dev/null || echo NOT CONFIGURED',
    )
    print(f'  volunteer-helper site: {nginx_site}')

    # Disk usage
    print('\n[Disk Usage]')
    print(f'  {run(ssh, f"du -sh {REMOTE_PATH} 2>/dev/null || echo NOT DEPLOYED")}')

    # Health check
    print('\n[Health Check]')
    print(f'  API: {run(ssh, "curl -s -o /dev/null -w %{http_code} http://127.0.0.1:3003/api/v1/health 2>/dev/null || echo UNREACHABLE")}')
    print(f'  Web: {run(ssh, "curl -s -o /dev/null -w %{http_code} http://127.0.0.1:3004 2>/dev/null || echo UNREACHABLE")}')

    ssh.close()
    print('\n=== Done ===')


if __name__ == '__main__':
    main()
