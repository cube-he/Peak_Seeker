'use client';

import Link from 'next/link';
import { Alert, Button, Spin } from 'antd';
import {
  DatabaseOutlined,
  FileTextOutlined,
  SettingOutlined,
  TeamOutlined,
  UserOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/services/admin-api';

export default function AdminDashboardPage() {
  const { data: statsData, isLoading } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: () => adminApi.getDashboardStats(),
  });

  const stats = statsData?.data;

  const { data: configData } = useQuery({
    queryKey: ['admin-config'],
    queryFn: () => adminApi.getConfig(),
  });

  const isFreezeMode = configData?.data?.freezeMode ?? false;
  const finalizedRatio = stats?.totalPlans
    ? Math.round((stats.finalizedPlans / stats.totalPlans) * 100)
    : 0;

  const kpis = [
    { label: '学生总数', value: stats?.totalStudents ?? 0, icon: <TeamOutlined />, delta: '学生档案' },
    { label: '教师总数', value: stats?.totalTeachers ?? 0, icon: <UserOutlined />, delta: '班级管理' },
    { label: '方案总数', value: stats?.totalPlans ?? 0, icon: <FileTextOutlined />, delta: '志愿方案' },
    { label: '已定稿方案', value: stats?.finalizedPlans ?? 0, icon: <FileTextOutlined />, delta: `${finalizedRatio}%` },
  ];

  return (
    <div className="space-y-5">
      <section className="rounded-2xl bg-[#0f1419] px-6 py-6 text-white shadow-[0_20px_60px_rgba(15,20,25,0.18)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-md bg-[#22c55e]/15 px-3 py-1 text-xs font-semibold text-[#22c55e]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#22c55e]" />
              系统运行中
            </div>
            <h1 className="font-serif text-3xl font-semibold">系统总览</h1>
            <p className="mt-2 text-sm text-slate-400">
              智愿家管理后台 · 数据统计来自现有 admin dashboard 接口
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/admin/data/import">
              <Button icon={<DatabaseOutlined />}>数据导入</Button>
            </Link>
            <Link href="/admin/config">
              <Button type="primary" danger icon={<SettingOutlined />}>
                系统配置
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {isFreezeMode ? (
        <Alert
          type="warning"
          icon={<WarningOutlined />}
          message="系统处于冻结模式"
          description="填报冻结期已开启，所有方案编辑已禁用。学生和老师只能查看已定稿方案。"
          showIcon
          banner
        />
      ) : null}

      {isLoading ? (
        <div className="rounded-2xl bg-surface py-16 text-center shadow-card">
          <Spin size="large" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {kpis.map((kpi) => (
            <div key={kpi.label} className="rounded-2xl border border-[#1e2530] bg-[#161d27] px-5 py-5 text-white shadow-card">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-medium uppercase tracking-[1.4px] text-slate-500">{kpi.label}</p>
                <span className="text-slate-500">{kpi.icon}</span>
              </div>
              <p className="mt-3 font-serif text-3xl font-semibold">{kpi.value}</p>
              <p className="mt-1 text-xs text-slate-500">{kpi.delta}</p>
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
        <section className="overflow-hidden rounded-2xl border border-[#1e2530] bg-[#161d27] text-white shadow-card">
          <div className="flex items-center justify-between border-b border-[#1e2530] px-6 py-4">
            <h2 className="font-serif text-lg font-semibold">系统健康</h2>
            <span className="text-xs text-slate-500">服务状态由当前页面静态呈现，监控接口待接入</span>
          </div>
          <div className="divide-y divide-[#1e2530] px-6">
            {[
              ['Web 主站', '正常', '182ms', 'text-[#22c55e]'],
              ['API 推荐服务', '正常', '340ms', 'text-[#22c55e]'],
              ['AI 网关', '关注', '待配置', 'text-[#eab308]'],
              ['数据库', '正常', '12ms', 'text-[#22c55e]'],
              ['Redis 缓存', '关注', '命中率待接入', 'text-[#eab308]'],
            ].map(([name, status, value, color]) => (
              <div key={name} className="grid grid-cols-[1fr_90px_90px] items-center gap-4 py-4 text-sm">
                <span className="text-slate-300">{name}</span>
                <span className="font-serif font-semibold">{value}</span>
                <span className={`rounded-md bg-white/5 px-2 py-1 text-center text-xs font-semibold ${color}`}>{status}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl bg-surface shadow-card">
          <div className="border-b border-border-subtle px-6 py-4">
            <h2 className="font-serif text-lg font-semibold text-text">快捷入口</h2>
          </div>
          <div className="grid gap-3 p-5">
            {[
              ['/admin/users', '用户管理', '管理学生、教师与管理员账号'],
              ['/admin/data/import', '数据导入', '导入招生计划、院校和专业数据'],
              ['/admin/config', '系统配置', '冻结模式、时间线和全局开关'],
              ['/admin/algorithm-config', '算法配置', '推荐策略与阈值参数'],
            ].map(([href, title, desc]) => (
              <Link key={href} href={href} className="rounded-xl bg-bg px-4 py-3 text-text no-underline hover:bg-surface-dim">
                <span className="block text-sm font-medium">{title}</span>
                <span className="mt-1 block text-xs text-text-muted">{desc}</span>
              </Link>
            ))}
          </div>
        </section>
      </div>

      <section className="overflow-hidden rounded-2xl bg-surface shadow-card">
        <div className="border-b border-border-subtle px-6 py-4">
          <h2 className="font-serif text-lg font-semibold text-text">最近活动</h2>
        </div>
        <div className="divide-y divide-border-subtle px-6">
          {[
            ['系统统计已刷新', '刚刚', 'info'],
            ['方案定稿率已更新', `${finalizedRatio}%`, 'success'],
            ['数据导入、审计日志和服务监控接口待接入', '待办', 'default'],
          ].map(([action, time, type]) => (
            <div key={action} className="flex items-center justify-between py-4">
              <div className="flex items-center gap-3">
                <span className={`h-2 w-2 rounded-full ${type === 'success' ? 'bg-safe' : type === 'info' ? 'bg-primary' : 'bg-text-faint'}`} />
                <span className="text-sm text-text">{action}</span>
              </div>
              <span className="text-xs text-text-faint">{time}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
