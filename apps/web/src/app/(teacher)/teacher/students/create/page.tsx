'use client';

/**
 * 教师工作台 · 新建学生
 * 复刻自 `WillNest Design System/teacher/views/student-create.jsx`.
 * 仍用 studentApi.create + react-query mutation, antd message 提示.
 * 设计稿 className: sc-hero / sc-card / sc-grid / sc-field / sc-label /
 *                   sc-input / sc-hint / sc-radio / sc-footer / qa primary.
 */

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { message } from 'antd';
import { studentApi } from '@/services/student-api';
import { PageHeader, TIcon } from '@/components/willnest';

interface CreateForm {
  username: string;
  password: string;
  realName: string;
  phone: string;
  gender: 'MALE' | 'FEMALE';
}

export default function CreateStudentPage() {
  const router = useRouter();
  const [form, setForm] = useState<CreateForm>({
    username: '',
    password: '',
    realName: '',
    phone: '',
    gender: 'MALE',
  });

  const createMutation = useMutation({
    mutationFn: (values: CreateForm) =>
      studentApi.create({
        username: values.username,
        password: values.password,
        realName: values.realName,
        phone: values.phone || undefined,
        gender: values.gender,
      }),
    onSuccess: (data: any) => {
      message.success('学生创建成功');
      // 详情页路由要 studentProfile.id (不是 user.id); 取错字段会跳到 /teacher/students/ 落回列表
      const sid = data?.studentProfile?.id;
      router.push(sid ? `/teacher/students/${sid}` : '/teacher/students');
    },
    onError: (error: any) => {
      // 透传后端具体原因 (用户名已存在 / 手机号已被占用), 否则老师只看到"创建失败"无从下手
      const msg = error?.response?.data?.message;
      message.error(Array.isArray(msg) ? msg[0] : msg ?? '创建失败,请重试');
    },
  });

  // 字段校验 (设计稿原版逻辑保留)
  const errors: Partial<Record<keyof CreateForm, string>> = {};
  if (form.username && form.username.length < 3) errors.username = '至少 3 个字符';
  if (form.password && form.password.length < 6) errors.password = '至少 6 位';
  const canSubmit =
    form.username.length >= 3 &&
    form.password.length >= 6 &&
    form.realName.trim().length > 0 &&
    !createMutation.isPending;

  const update = <K extends keyof CreateForm>(k: K, v: CreateForm[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const submit = () => {
    if (!canSubmit) return;
    createMutation.mutate(form);
  };

  return (
    <div className="view-transition">
      {/* —— 返回 —— */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 13,
          color: 'var(--text-tertiary)',
          marginBottom: 20,
        }}
      >
        <Link
          href="/teacher/students"
          style={{
            background: 'transparent',
            border: 0,
            padding: '4px 8px',
            borderRadius: 6,
            color: 'var(--text-tertiary)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            whiteSpace: 'nowrap',
            textDecoration: 'none',
          }}
        >
          <span style={{ width: 12, height: 12, display: 'inline-flex' }}>
            <TIcon.chevLeft />
          </span>{' '}
          返回学生列表
        </Link>
      </div>

      <PageHeader
        eyebrow="ONBOARD STUDENT"
        title="创建学生"
        meta={
          <span>
            登录账号 + 基本身份 · 后续可在学生详情补全成绩、户籍、偏好和健康信息
          </span>
        }
        fresh=""
      />

      {/* —— Navy hero banner —— */}
      <section className="sc-hero fade-up d1">
        <div className="eyebrow">CREATE STUDENT</div>
        <h2>先创建登录账号</h2>
        <p>
          学生即可用账号登录小程序,自助填报成绩 / 户籍 / 选科 / 偏好。
          也可以后续再补,不影响你出方案。
        </p>
      </section>

      {/* —— 表单卡片 —— */}
      <div className="sc-card fade-up d2">
        <div className="sc-grid">
          <div className="sc-field">
            <label className="sc-label">
              登录用户名 <span className="req">必填</span>
            </label>
            <input
              className={`sc-input ${errors.username ? 'is-err' : ''}`}
              placeholder="如 zhangsan2025"
              value={form.username}
              onChange={(e) => update('username', e.target.value)}
            />
            {errors.username ? (
              <div className="sc-hint err">{errors.username}</div>
            ) : (
              <div className="sc-hint">至少 3 字符,推荐"姓名拼音+年份"</div>
            )}
          </div>

          <div className="sc-field">
            <label className="sc-label">
              初始密码 <span className="req">必填</span>
            </label>
            <input
              type="password"
              className={`sc-input ${errors.password ? 'is-err' : ''}`}
              placeholder="至少 6 位"
              value={form.password}
              onChange={(e) => update('password', e.target.value)}
            />
            {errors.password ? (
              <div className="sc-hint err">{errors.password}</div>
            ) : (
              <div className="sc-hint">首次登录会要求学生修改</div>
            )}
          </div>

          <div className="sc-field">
            <label className="sc-label">
              真实姓名 <span className="req">必填</span>
            </label>
            <input
              className="sc-input"
              placeholder="如 张三"
              value={form.realName}
              onChange={(e) => update('realName', e.target.value)}
            />
            <div className="sc-hint">与身份证一致,用于报名信息核对</div>
          </div>

          <div className="sc-field">
            <label className="sc-label">
              手机号 <span className="opt">选填</span>
            </label>
            <input
              className="sc-input"
              placeholder="如 138 0000 0000"
              value={form.phone}
              onChange={(e) => update('phone', e.target.value)}
            />
            <div className="sc-hint">学生或家长手机号,沟通用</div>
          </div>

          <div className="sc-field sc-field-full">
            <label className="sc-label">性别</label>
            <div className="sc-radio-group">
              {(
                [
                  { v: 'MALE', t: '男' },
                  { v: 'FEMALE', t: '女' },
                ] as const
              ).map((o) => (
                <button
                  key={o.v}
                  type="button"
                  className={`sc-radio ${form.gender === o.v ? 'is-active' : ''}`}
                  onClick={() => update('gender', o.v)}
                >
                  <span className="sc-radio-dot" />
                  {o.t}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="sc-footer">
          <Link
            href="/teacher/students"
            className="qa"
            style={{ textDecoration: 'none' }}
          >
            取消
          </Link>
          <button
            type="button"
            className={`qa primary ${!canSubmit ? 'is-disabled' : ''}`}
            onClick={submit}
            disabled={!canSubmit}
          >
            {createMutation.isPending ? (
              '正在创建...'
            ) : (
              <>
                <TIcon.plus /> 创建学生
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
