'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { message } from 'antd';
import { authService, LoginParams } from '@/services/auth';
import { useAuthStore } from '@/stores/authStore';
import AuthLayout from '@/components/layout/AuthLayout';

export default function LoginPage() {
  const router = useRouter();
  const { setAuth } = useAuthStore();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const submitRef = useRef<HTMLButtonElement>(null);

  const loginMutation = useMutation({
    mutationFn: (params: LoginParams) => authService.login(params),
    onSuccess: (data: any) => {
      setAuth({
        user: data.user,
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
      });
      message.success('登录成功');
      const role = data.user?.role;
      const dashboards: Record<string, string> = {
        ADMIN: '/admin/dashboard',
        TEACHER: '/teacher/dashboard',
        STUDENT: '/',
      };
      router.push(dashboards[role] || '/');
    },
    onError: (error: any) => {
      const msg = error.response?.data?.message;
      message.error(Array.isArray(msg) ? msg[0] : msg || '登录失败');
    },
  });

  // 必填项为空时,提交按钮抖动提示 — 复刻设计稿交互
  const shakeSubmit = () => {
    submitRef.current?.animate(
      [
        { transform: 'translateX(0)' },
        { transform: 'translateX(-6px)' },
        { transform: 'translateX(6px)' },
        { transform: 'translateX(-4px)' },
        { transform: 'translateX(0)' },
      ],
      { duration: 360, easing: 'ease-out' },
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (loginMutation.isPending) return;
    if (!username.trim() || !password) {
      shakeSubmit();
      return;
    }
    loginMutation.mutate({ username, password });
  };

  return (
    <AuthLayout
      bgImage="/images/bg-auth-corridor.webp"
      eyebrow="WELCOME BACK · 欢迎回来"
      title={
        <>
          继续你的<em>志愿规划</em>，<br />
          进度都为你保留。
        </>
      }
      subtitle="你的推荐方案、收藏院校与位次查询记录会跟随账号保存，换设备也能从上次离开的地方继续。"
      features={[
        { strong: '基于真实录取数据', text: '—— 从 14.4 万条 2022—2025 真实录取里反推冲 / 稳 / 保。' },
        { strong: '方案逐条可编辑', text: '—— 不喜欢的院校换掉、专业重排，结果同步重算。' },
        { strong: '进度多端同步', text: '—— 手机查院校、电脑改方案，登录后无缝接续。' },
      ]}
    >
      <div className="auth-switch fade-up">
        <span>还没账号？</span>
        <Link href="/register">
          免费注册 <span aria-hidden="true">→</span>
        </Link>
      </div>

      <div className="auth-title fade-up d1">
        <div className="eyebrow">SIGN IN · 登录</div>
        <h1>欢迎回来</h1>
        <p className="sub">
          输入账号继续你的志愿规划，
          <br />
          所有方案与收藏都已为你保留。
        </p>
      </div>

      <form className="fade-up d2" onSubmit={handleSubmit} noValidate>
        <div className="field">
          <label className="field-label" htmlFor="login-username">
            用户名
          </label>
          <div className="input-wrap">
            <span className="prefix" aria-hidden="true">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </span>
            <input
              id="login-username"
              name="username"
              type="text"
              autoComplete="username"
              placeholder="请输入用户名"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
        </div>

        <div className="field">
          <label className="field-label" htmlFor="login-password">
            密码
          </label>
          <div className="input-wrap">
            <span className="prefix" aria-hidden="true">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </span>
            <input
              id="login-password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="请输入密码"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              className="suffix"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? '隐藏密码' : '显示密码'}
              style={{ color: showPassword ? 'var(--primary)' : undefined }}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </button>
          </div>
        </div>

        <div className="field-row">
          <label className="cbx">
            <input
              type="checkbox"
              name="remember"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            <span className="box" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </span>
            <span>30 天内自动登录</span>
          </label>
          <span className="hint-link">忘记密码请联系管理员</span>
        </div>

        <button ref={submitRef} type="submit" className="btn-submit" disabled={loginMutation.isPending}>
          {loginMutation.isPending ? (
            '登录中…'
          ) : (
            <>
              登录智愿家
              <span className="arrow" aria-hidden="true">
                →
              </span>
            </>
          )}
        </button>

        <div className="auth-divider">
          <span>OR · 协议</span>
        </div>

        <p className="auth-legal">
          继续即代表同意智愿家的
          <span className="lk">《用户协议》</span>
          与<span className="lk">《隐私政策》</span>
          <span className="faint">你的成绩与个人信息仅用于推荐计算。</span>
        </p>
      </form>
    </AuthLayout>
  );
}
