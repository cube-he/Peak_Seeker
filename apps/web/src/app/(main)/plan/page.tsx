'use client';

import { useState } from 'react';
import {
  Modal,
  Form,
  Input,
  Select,
  InputNumber,
  Popconfirm,
  message,
  Spin,
} from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  StarOutlined,
  StarFilled,
  DownloadOutlined,
  FilterOutlined,
  SortAscendingOutlined,
  FolderOpenOutlined,
  RocketOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import MainLayout from '@/components/layout/MainLayout';
import StatCard from '@/components/ui/StatCard';
import StatusChip from '@/components/ui/StatusChip';
import { planService, CreatePlanDto } from '@/services/plan';
import { useAuthStore } from '@/stores/authStore';
import { PROVINCES } from '@volunteer-helper/shared';
import Link from 'next/link';

const { Option } = Select;

/* ---------- helpers ---------- */

const statusChipVariant = (status: string): 'rush' | 'stable' | 'safe' | 'elite' | 'ai' | 'default' => {
  switch (status) {
    case 'DRAFT': return 'default';
    case 'SUBMITTED': return 'stable';
    case 'ARCHIVED': return 'safe';
    default: return 'default';
  }
};

const statusLabel = (status: string) => {
  switch (status) {
    case 'DRAFT': return '草稿';
    case 'SUBMITTED': return '已提交';
    case 'ARCHIVED': return '已归档';
    default: return status;
  }
};

/** Compute strategy distribution from plan items */
function getStrategyDistribution(items: any[] | undefined) {
  if (!items || items.length === 0) return { rush: 0, stable: 0, safe: 0 };
  let rush = 0, stable = 0, safe = 0;
  items.forEach((item: any) => {
    const t = (item.type || item.strategy || '').toLowerCase();
    if (t === '冲' || t === 'rush') rush++;
    else if (t === '稳' || t === 'stable') stable++;
    else if (t === '保' || t === 'safe') safe++;
    else stable++; // default bucket
  });
  const total = rush + stable + safe;
  return {
    rush: Math.round((rush / total) * 100),
    stable: Math.round((stable / total) * 100),
    safe: Math.round((safe / total) * 100),
  };
}

function timeAgo(dateStr: string) {
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  const diff = now - date;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  return new Date(dateStr).toLocaleDateString('zh-CN');
}

/* ---------- component ---------- */

export default function PlanPage() {
  const { isLoggedIn } = useAuthStore();
  const queryClient = useQueryClient();
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [form] = Form.useForm();

  /* ---- data fetching ---- */
  const { data: plans, isLoading } = useQuery({
    queryKey: ['plans'],
    queryFn: () => planService.getList(),
    enabled: isLoggedIn,
  });

  const createMutation = useMutation({
    mutationFn: (data: CreatePlanDto) => planService.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plans'] });
      setCreateModalOpen(false);
      form.resetFields();
      message.success('方案创建成功');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => planService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plans'] });
      message.success('已删除');
    },
  });

  const favoriteMutation = useMutation({
    mutationFn: (id: number) => planService.toggleFavorite(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plans'] });
    },
  });

  /* ---- derived stats ---- */
  const planList: any[] = plans || [];
  const totalPlans = planList.length;
  const totalItems = planList.reduce((sum: number, p: any) => sum + (p.items?.length || 0), 0);

  /* ---- not logged in ---- */
  if (!isLoggedIn) {
    return (
      <MainLayout>
        <div className="flex flex-col items-center justify-center py-32">
          <div className="w-20 h-20 rounded-full bg-surface-dim flex items-center justify-center mb-6">
            <FolderOpenOutlined className="text-3xl text-text-muted" />
          </div>
          <p className="text-text-secondary text-sm mb-6">请先登录后查看志愿方案</p>
          <Link href="/login">
            <button className="h-12 px-8 rounded-lg bg-gradient-to-r from-primary to-accent text-white font-sans font-semibold text-sm border-0 cursor-pointer transition-all duration-300 shadow-glow-primary hover:shadow-glow-accent active:scale-[0.98]">
              去登录
            </button>
          </Link>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      {/* Page Header */}
      <div className="mb-8">
        <h2 className="font-serif font-semibold text-2xl tracking-tight text-text">
          我的志愿方案
        </h2>
        <p className="font-sans text-sm text-text-muted mt-1">管理您的个性化升学策略</p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-10">
        <StatCard
          label="方案总数"
          value={String(totalPlans).padStart(2, '0')}
          subtitle={`共 ${totalItems} 个志愿`}
          accentColor="primary"
        />
        <StatCard
          label="名校匹配"
          value={totalItems > 0 ? totalItems : '--'}
          subtitle="已覆盖 Top 5% 院校"
          accentColor="accent"
        />
        <StatCard
          label="AI 准确率"
          value="98.4%"
          subtitle="基于 2024 年官方验证数据"
          accentColor="safe"
        />
      </div>

      {/* Section Title + Actions */}
      <div className="flex justify-between items-end mb-6">
        <div>
          <h3 className="font-serif font-semibold text-xl text-text">方案工作台</h3>
          <div className="h-0.5 w-10 bg-primary mt-2 rounded-full" />
        </div>
        <div className="flex gap-2">
          <button className="bg-surface text-text-secondary shadow-ring rounded px-4 py-2 text-sm font-medium hover:shadow-card-hover transition-all border-0 cursor-pointer flex items-center gap-1.5">
            <FilterOutlined /> 筛选
          </button>
          <button className="bg-surface text-text-secondary shadow-ring rounded px-4 py-2 text-sm font-medium hover:shadow-card-hover transition-all border-0 cursor-pointer flex items-center gap-1.5">
            <SortAscendingOutlined /> 排序
          </button>
        </div>
      </div>

      {/* Plan Cards Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <Spin size="large" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Create New Plan Card */}
          <button
            onClick={() => setCreateModalOpen(true)}
            className="relative group h-full min-h-[260px] rounded-lg border-2 border-dashed border-border bg-surface hover:shadow-card transition-all duration-300 flex flex-col items-center justify-center p-10 text-center cursor-pointer"
          >
            <div className="w-14 h-14 rounded-full bg-primary-light flex items-center justify-center mb-5 group-hover:scale-110 transition-transform">
              <PlusOutlined className="text-primary text-xl" />
            </div>
            <h4 className="font-serif text-base font-semibold text-text">创建新策略方案</h4>
            <p className="font-sans text-sm text-text-muted max-w-[240px] mt-2">
              启动 AI 引擎，根据您的分数匹配目标院校。
            </p>
          </button>

          {/* Plan Cards */}
          {planList.map((plan: any) => {
            const dist = getStrategyDistribution(plan.items);
            const itemCount = plan.items?.length || 0;
            const hasItems = itemCount > 0;

            return (
              <div
                key={plan.id}
                className="bg-surface rounded-lg shadow-card hover:shadow-card-hover transition-all duration-300 p-5 border-l-[3px] border-l-primary"
              >
                {/* Card Header */}
                <div className="flex justify-between items-start mb-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-serif text-base font-semibold text-text truncate">
                        {plan.name}
                      </h4>
                      <StatusChip variant={statusChipVariant(plan.status)} size="sm">
                        {statusLabel(plan.status)}
                      </StatusChip>
                    </div>
                    <div className="flex gap-4 mt-1.5 flex-wrap">
                      <span className="text-xs text-text-muted">
                        创建于: {new Date(plan.createdAt || plan.updatedAt).toLocaleDateString('zh-CN')}
                      </span>
                      {plan.province && (
                        <span className="text-xs text-text-muted">
                          省份: {plan.province}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      className="p-2 rounded-lg hover:bg-surface-dim transition-colors border-0 bg-transparent cursor-pointer"
                      onClick={() => favoriteMutation.mutate(plan.id)}
                    >
                      {plan.isFavorite
                        ? <StarFilled className="text-lg text-accent" />
                        : <StarOutlined className="text-lg text-text-faint" />
                      }
                    </button>
                    <Popconfirm
                      title="确定删除该方案？"
                      onConfirm={() => deleteMutation.mutate(plan.id)}
                    >
                      <button className="p-2 rounded-lg hover:bg-rush-fixed transition-colors border-0 bg-transparent cursor-pointer">
                        <DeleteOutlined className="text-lg text-text-faint" />
                      </button>
                    </Popconfirm>
                  </div>
                </div>

                {/* Score + Update Row */}
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="bg-bg p-3.5 rounded-lg">
                    <p className="text-[11px] uppercase tracking-wider font-medium text-text-muted mb-1">志愿数</p>
                    <div className="flex items-end gap-2">
                      <span className="font-serif text-[28px] font-semibold [font-variant-numeric:tabular-nums] text-text">{itemCount}</span>
                      <span className="text-xs text-primary font-medium mb-1">{plan.year}</span>
                    </div>
                  </div>
                  <div className="bg-bg p-3.5 rounded-lg">
                    <p className="text-[11px] uppercase tracking-wider font-medium text-text-muted mb-1">最后更新</p>
                    <div className="flex items-center gap-2 h-8">
                      <ClockCircleOutlined className="text-sm text-text-muted" />
                      <span className="text-sm text-text-secondary font-medium">
                        {timeAgo(plan.updatedAt)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Strategy Distribution */}
                {hasItems ? (
                  <div className="space-y-2.5 mb-6">
                    <div className="flex justify-between items-center text-xs font-medium text-text-muted">
                      <span>策略分布</span>
                      <span className="text-text-secondary">{plan.strategy || '均衡风险模型'}</span>
                    </div>
                    <div className="flex h-1.5 w-full rounded-full overflow-hidden bg-border">
                      <div className="h-full bg-rush transition-all" style={{ width: `${dist.rush}%` }} title={`冲 (${dist.rush}%)`} />
                      <div className="h-full bg-stable transition-all" style={{ width: `${dist.stable}%` }} title={`稳 (${dist.stable}%)`} />
                      <div className="h-full bg-safe transition-all" style={{ width: `${dist.safe}%` }} title={`保 (${dist.safe}%)`} />
                    </div>
                    <div className="flex gap-5 pt-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-rush" />
                        <span className="text-xs text-text-muted">冲 {dist.rush}%</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-stable" />
                        <span className="text-xs text-text-muted">稳 {dist.stable}%</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-safe" />
                        <span className="text-xs text-text-muted">保 {dist.safe}%</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="mb-6 py-4 text-center">
                    <p className="text-xs text-text-muted">暂无志愿，点击下方查看详情添加</p>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex gap-3">
                  <Link href={`/plan/${plan.id}`} className="flex-1">
                    <button className="w-full py-2 rounded-lg bg-gradient-to-r from-primary to-accent text-white font-sans text-sm font-medium shadow-card hover:shadow-card-hover transition-all border-0 cursor-pointer">
                      查看详情
                    </button>
                  </Link>
                  <button className="bg-surface text-text-secondary shadow-ring rounded px-4 py-2 text-sm font-medium hover:shadow-card-hover transition-all border-0 cursor-pointer">
                    <DownloadOutlined className="text-lg" />
                  </button>
                </div>
              </div>
            );
          })}

          {/* Empty state when no plans exist */}
          {planList.length === 0 && (
            <div className="lg:col-span-1 text-center py-16">
              <div className="w-16 h-16 rounded-full bg-surface-dim flex items-center justify-center mb-4 mx-auto">
                <FolderOpenOutlined className="text-2xl text-text-muted" />
              </div>
              <h4 className="font-serif text-xl text-text-muted mb-2">暂无方案</h4>
              <p className="text-sm text-text-faint mb-6">去智能推荐页面生成一个吧</p>
              <Link href="/recommend">
                <button className="h-11 px-6 rounded-lg bg-gradient-to-r from-primary to-accent text-white font-sans font-medium text-sm border-0 cursor-pointer inline-flex items-center gap-2 transition-all duration-300 shadow-glow-primary hover:shadow-glow-accent active:scale-[0.98]">
                  <RocketOutlined /> 创建第一个方案
                </button>
              </Link>
            </div>
          )}
        </div>
      )}

      {/* Smart Recommend CTA */}
      {planList.length > 0 && (
        <div className="mt-10 flex justify-center">
          <Link href="/recommend">
            <button className="h-12 px-8 rounded-lg bg-gradient-to-r from-primary to-accent text-white font-sans font-semibold text-sm border-0 cursor-pointer flex items-center gap-2 transition-all duration-300 shadow-glow-primary hover:shadow-glow-accent active:scale-[0.98]">
              <RocketOutlined /> 开始智能推荐
            </button>
          </Link>
        </div>
      )}

      {/* Create Plan Modal */}
      <Modal
        title={<span className="font-serif font-semibold text-text">创建志愿方案</span>}
        open={createModalOpen}
        onCancel={() => setCreateModalOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={createMutation.isPending}
        okText="创建"
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={(values) => {
            createMutation.mutate({ ...values, items: [] });
          }}
          initialValues={{ year: 2025, province: '四川' }}
          className="mt-4"
        >
          <Form.Item name="name" label="方案名称" rules={[{ required: true }]}>
            <Input placeholder="例如：第一志愿方案" />
          </Form.Item>
          <Form.Item name="year" label="年份" rules={[{ required: true }]}>
            <InputNumber min={2020} max={2030} className="w-full" />
          </Form.Item>
          <Form.Item name="province" label="省份">
            <Select>
              {PROVINCES.map((p) => (
                <Option key={p.code} value={p.name}>{p.name}</Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="notes" label="备注">
            <Input.TextArea rows={3} placeholder="方案备注（可选）" />
          </Form.Item>
        </Form>
      </Modal>
    </MainLayout>
  );
}
