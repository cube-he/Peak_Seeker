'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { authService, LoginParams } from '@/services/auth';
import { useAuthStore } from '@/stores/authStore';
import AuthLayout from '@/components/layout/AuthLayout';

export default function LoginPage() {
  const router = useRouter();
  const { setAuth } = useAuthStore();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  // 内联提示：成功/失败都在表单里直接显示，不依赖 antd message
  // （这个全屏登录页上 antd message 不可靠，且失败时整页会刷新冲掉 toast）。
  const [status, setStatus] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const submitRef = useRef<HTMLButtonElement>(null);

  const loginMutation = useMutation({
    mutationFn: (params: LoginParams) => authService.login(params),
    onSuccess: (data: any) => {
      setAuth({
        user: data.user,
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
      });
      setStatus({ type: 'success', text: '登录成功，正在跳转…' });
      const role = data.user?.role;
      // 直接跳到 role-specific dashboard, 不用 '/' 走 middleware 二次重定向.
      // 用 location.assign 硬刷新而非 router.replace 客户端 navigation —— 否则切换
      // 账号时 layout (含主管入口判断) 沿用上一次 render 的 isSupervisor, 用户必须 F5
      // 才看到正确导航. 硬跳转代价是失去客户端路由动画, 但解决了 hydrate race.
      const dashboards: Record<string, string> = {
        ADMIN: '/admin/dashboard',
        TEACHER: '/teacher/dashboard',
        STUDENT: '/student/dashboard',
      };
      if (typeof window !== 'undefined') {
        window.location.assign(dashboards[role] || '/');
      } else {
        router.replace(dashboards[role] || '/');
      }
    },
    onError: (error: any) => {
      const msg = error.response?.data?.message;
      const text = Array.isArray(msg) ? msg[0] : msg || '用户名或密码错误';
      setStatus({ type: 'error', text });
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
    setStatus(null);
    if (!username.trim() || !password) {
      shakeSubmit();
      setStatus({ type: 'error', text: '请输入用户名和密码' });
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
      subtitle="学生档案、沟通记录与志愿方案都跟随账号保存，换设备也能接着上次的进度继续。"
      features={[
        { strong: '学生全程在档', text: '—— 基础信息、成绩位次、沟通记录集中管理。' },
        { strong: '按批次梯队出方案', text: '—— 院校专业逐条可调，冲 / 稳 / 保分层清晰。' },
        { strong: '多端进度同步', text: '—— 电脑出方案、手机查院校，登录后无缝接续。' },
      ]}
    >
      <div className="auth-title fade-up d1">
        <div className="eyebrow">SIGN IN · 登录</div>
        <h1>欢迎回来</h1>
        <p className="sub">
          输入账号继续你的工作，
          <br />
          学生资料与方案进度都已为你保留。
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
              autoFocus
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
          <span />
          <span className="hint-link">忘记密码请联系管理员</span>
        </div>

        {status && (
          <div
            role="alert"
            style={{
              marginBottom: 12,
              fontSize: 13,
              fontWeight: 500,
              lineHeight: 1.5,
              color: status.type === 'error' ? '#dc2626' : '#16a34a',
            }}
          >
            {status.text}
          </div>
        )}

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
