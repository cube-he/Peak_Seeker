'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { message } from 'antd';
import { authService, RegisterParams } from '@/services/auth';
import { useAuthStore } from '@/stores/authStore';
import AuthLayout from '@/components/layout/AuthLayout';

// 密码强度评分 — 复刻设计稿 register.html 的 scorePassword
const STRENGTH_LEVELS = ['—', '太弱', '一般', '良好', '强'];

function scorePassword(p: string): number {
  if (!p) return 0;
  let score = 0;
  if (p.length >= 6) score++;
  if (p.length >= 10) score++;
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(p)).length;
  if (classes >= 2) score++;
  if (classes >= 3) score++;
  return Math.min(4, score);
}

// 密码必须 ≥6 位且含大小写字母与数字 — 保留原 Ant 校验强度
function isPasswordValid(p: string): boolean {
  return p.length >= 6 && /[a-z]/.test(p) && /[A-Z]/.test(p) && /\d/.test(p);
}

export default function RegisterPage() {
  const router = useRouter();
  const { setAuth } = useAuthStore();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [terms, setTerms] = useState(false);
  const submitRef = useRef<HTMLButtonElement>(null);

  const registerMutation = useMutation({
    mutationFn: (params: RegisterParams) => authService.register(params),
    onSuccess: (data: any) => {
      setAuth({
        user: data.user,
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
      });
      message.success('注册成功');
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
      message.error(Array.isArray(msg) ? msg[0] : msg || '注册失败');
    },
  });

  const strength = scorePassword(password);
  const strengthColor =
    strength >= 3
      ? 'var(--safe)'
      : strength === 2
        ? 'var(--accent)'
        : strength === 1
          ? 'var(--rush)'
          : 'var(--text-muted)';

  // 确认密码一致性提示
  const confirmHint = !confirmPassword
    ? { text: '需要与上一项设置的密码完全一致。', cls: '' }
    : confirmPassword !== password
      ? { text: '两次密码不一致，请检查。', cls: 'is-error' }
      : { text: '已确认一致 ✓', cls: 'is-ok' };

  // 必填项不合格时,提交按钮抖动提示 — 复刻设计稿交互
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
    if (registerMutation.isPending) return;
    if (
      username.trim().length < 3 ||
      !isPasswordValid(password) ||
      password !== confirmPassword ||
      !terms
    ) {
      shakeSubmit();
      return;
    }
    // 产品仅面向四川考生,省份固定为四川省(设计稿已去掉省份选择字段)
    const params: RegisterParams = { username, password, province: '四川省' };
    if (phone.trim()) params.phone = phone.trim();
    registerMutation.mutate(params);
  };

  return (
    <AuthLayout
      bgImage="/images/bg-auth-gate.webp"
      eyebrow="CREATE ACCOUNT · 开通账号"
      title={
        <>
          从分数到方案，<br />
          <em>几分钟</em>跑通整条路径。
        </>
      }
      subtitle="注册后即可输入分数与位次，基于 4 年真实录取数据生成一份初步志愿方案——免费、无广告、不诱导消费。"
      features={[
        {
          strong: '真实数据，不是估算',
          text: '—— 四川省教育考试院、阳光高考与各高校公开数据同口径整理。',
        },
        { strong: 'AI 给方案，决定权在你', text: '—— 智能生成冲 / 稳 / 保梯度，你可以逐条调整。' },
        {
          strong: '陪伴整个志愿季',
          text: '—— 从模考到出分到提交志愿，每个节点都能回到方案继续调整。',
        },
      ]}
    >
      <div className="auth-switch fade-up">
        <span>已有账号？</span>
        <Link href="/login">
          立即登录 <span aria-hidden="true">→</span>
        </Link>
      </div>

      <div className="auth-title fade-up d1">
        <div className="eyebrow">SIGN UP · 注册</div>
        <h1>开通账号</h1>
        <p className="sub">
          填写基本信息，1 分钟开始
          <br />
          属于你自己的志愿规划。
        </p>
      </div>

      <form className="fade-up d2" onSubmit={handleSubmit} noValidate>
        <div className="field">
          <label className="field-label" htmlFor="reg-username">
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
              id="reg-username"
              name="username"
              type="text"
              autoComplete="username"
              placeholder="用于登录的用户名，至少 3 个字符"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
        </div>

        <div className="field">
          <label className="field-label" htmlFor="reg-password">
            设置密码
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
              id="reg-password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="至少 6 位，含大小写字母和数字"
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
          <div className="strength" aria-hidden="true">
            <div className="strength-bars" data-level={strength}>
              <span />
              <span />
              <span />
              <span />
            </div>
            <span className="strength-label" style={{ color: strengthColor }}>
              {STRENGTH_LEVELS[strength]}
            </span>
          </div>
        </div>

        <div className="field">
          <label className="field-label" htmlFor="reg-confirm">
            确认密码
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
              id="reg-confirm"
              name="confirmPassword"
              type={showConfirm ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="再次输入密码"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
            <button
              type="button"
              className="suffix"
              onClick={() => setShowConfirm((v) => !v)}
              aria-label={showConfirm ? '隐藏密码' : '显示密码'}
              style={{ color: showConfirm ? 'var(--primary)' : undefined }}
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
          <div className={`field-hint ${confirmHint.cls}`}>{confirmHint.text}</div>
        </div>

        <div className="field">
          <label className="field-label" htmlFor="reg-phone">
            手机号<span className="opt">选填 · 用于出分提醒</span>
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
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
            </span>
            <input
              id="reg-phone"
              name="phone"
              type="tel"
              autoComplete="tel"
              inputMode="numeric"
              maxLength={11}
              placeholder="选填，11 位手机号"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
        </div>

        <div className="field-row" style={{ margin: '18px 0 22px' }}>
          <label className="cbx" style={{ alignItems: 'flex-start' }}>
            <input
              type="checkbox"
              name="terms"
              checked={terms}
              onChange={(e) => setTerms(e.target.checked)}
            />
            <span className="box" aria-hidden="true" style={{ marginTop: '2px' }}>
              <svg viewBox="0 0 24 24">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </span>
            <span style={{ fontSize: '12.5px', lineHeight: 1.55, color: 'var(--text-tertiary)' }}>
              我已阅读并同意智愿家的
              <span style={{ color: 'var(--primary)', borderBottom: '1px dotted rgba(30,58,95,.35)' }}>
                《用户协议》
              </span>
              和
              <span style={{ color: 'var(--primary)', borderBottom: '1px dotted rgba(30,58,95,.35)' }}>
                《隐私政策》
              </span>
              ，授权基于我的成绩信息生成个性化推荐。
            </span>
          </label>
        </div>

        <button ref={submitRef} type="submit" className="btn-submit" disabled={registerMutation.isPending}>
          {registerMutation.isPending ? (
            '创建中…'
          ) : (
            <>
              免费创建账号
              <span className="arrow" aria-hidden="true">
                →
              </span>
            </>
          )}
        </button>

        <div className="auth-trust">
          <span className="pp">完全免费</span>
          <span className="pp">无广告</span>
          <span className="pp">无诱导消费</span>
        </div>
      </form>
    </AuthLayout>
  );
}
