/** @jest-environment node */
import { middleware } from '../middleware';
import { NextRequest } from 'next/server';

// 构造一个 payload 段含 role 的假 JWT(middleware 只解码不验签)
function tokenWithRole(role: string): string {
  const payload = Buffer.from(JSON.stringify({ role })).toString('base64url');
  return `header.${payload}.sig`;
}

describe('middleware — 首页登录态重定向', () => {
  it('已登录 STUDENT 访问 / 重定向到 /student/dashboard', () => {
    const req = new NextRequest('http://localhost/', {
      headers: { cookie: `access_token=${tokenWithRole('STUDENT')}` },
    });
    const res = middleware(req);
    expect(res.headers.get('location')).toContain('/student/dashboard');
  });

  it('已登录 TEACHER 访问 / 重定向到 /teacher/dashboard', () => {
    const req = new NextRequest('http://localhost/', {
      headers: { cookie: `access_token=${tokenWithRole('TEACHER')}` },
    });
    const res = middleware(req);
    expect(res.headers.get('location')).toContain('/teacher/dashboard');
  });

  it('未登录访客访问 / 放行(看 landing,无重定向)', () => {
    const req = new NextRequest('http://localhost/');
    const res = middleware(req);
    expect(res.headers.get('location')).toBeNull();
  });

  it('token 无法解析出角色时也放行 landing', () => {
    const req = new NextRequest('http://localhost/', {
      headers: { cookie: 'access_token=not-a-valid-jwt' },
    });
    const res = middleware(req);
    expect(res.headers.get('location')).toBeNull();
  });
});
