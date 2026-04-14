'use client';

import { Card, Alert, Spin } from 'antd';
import {
  TeamOutlined,
  FileTextOutlined,
  UserOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/services/admin-api';
import StatCard from '@/components/ui/StatCard';

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-serif text-xl font-semibold text-text">系统总览</h1>
        <p className="text-sm text-text-muted mt-1">智愿家管理后台</p>
      </div>

      {/* Freeze Mode Banner */}
      {isFreezeMode && (
        <Alert
          type="warning"
          icon={<WarningOutlined />}
          message="系统处于冻结模式"
          description="填报冻结期已开启，所有方案编辑已禁用。学生和老师只能查看已定版方案。"
          showIcon
          banner
        />
      )}

      {/* Stats */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spin size="large" />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="学生总数"
            value={stats?.totalStudents ?? 0}
            accentColor="primary"
            icon={<TeamOutlined />}
          />
          <StatCard
            label="教师总数"
            value={stats?.totalTeachers ?? 0}
            accentColor="accent"
            icon={<UserOutlined />}
          />
          <StatCard
            label="方案总数"
            value={stats?.totalPlans ?? 0}
            accentColor="safe"
            icon={<FileTextOutlined />}
          />
          <StatCard
            label="已定版方案"
            value={stats?.finalizedPlans ?? 0}
            subtitle={stats?.totalPlans ? `${Math.round((stats.finalizedPlans / stats.totalPlans) * 100)}%` : undefined}
            accentColor="rush"
          />
        </div>
      )}

      {/* Recent Activity */}
      <Card title="最近活动" size="small">
        <div className="space-y-3">
          {[
            { action: '教师 张老师 创建了学生 李明', time: '5分钟前', type: 'info' },
            { action: '方案 #1024 已通过审核', time: '15分钟前', type: 'success' },
            { action: '数据导入完成：2026年招生计划', time: '1小时前', type: 'default' },
            { action: '教师 王老师 生成了3个方案', time: '2小时前', type: 'info' },
          ].map((item, i) => (
            <div
              key={i}
              className="flex items-center justify-between py-2 border-b border-border-subtle last:border-0"
            >
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${
                  item.type === 'success' ? 'bg-safe' :
                  item.type === 'info' ? 'bg-primary' : 'bg-text-faint'
                }`} />
                <span className="text-sm text-text">{item.action}</span>
              </div>
              <span className="text-xs text-text-faint flex-shrink-0">{item.time}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Quick Links */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card hoverable size="small" bodyStyle={{ padding: '16px', textAlign: 'center' }}>
          <a href="/admin/users" className="no-underline text-text-secondary text-sm font-medium">
            用户管理
          </a>
        </Card>
        <Card hoverable size="small" bodyStyle={{ padding: '16px', textAlign: 'center' }}>
          <a href="/admin/data/import" className="no-underline text-text-secondary text-sm font-medium">
            数据导入
          </a>
        </Card>
        <Card hoverable size="small" bodyStyle={{ padding: '16px', textAlign: 'center' }}>
          <a href="/admin/config" className="no-underline text-text-secondary text-sm font-medium">
            系统配置
          </a>
        </Card>
      </div>
    </div>
  );
}
