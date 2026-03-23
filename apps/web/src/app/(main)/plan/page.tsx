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
          <div className="w-20 h-20 rounded-full bg-surface-container-high flex items-center justify-center mb-6">
            <FolderOpenOutlined className="text-3xl text-on-surface-variant" />
          </div>
          <p className="text-on-surface-variant text-sm mb-6">请先登录后查看志愿方案</p>
          <Link href="/login">
            <button className="h-12 px-8 rounded-xl bg-gradient-to-r from-primary to-primary-container text-on-primary font-semibold text-sm border-0 cursor-pointer transition-all duration-300 hover:shadow-glow-primary-lg active:scale-[0.98]">
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
        <h2 className="font-headline font-extrabold text-2xl tracking-tight text-primary">
          我的志愿方案
        </h2>
        <p className="font-body text-sm text-on-surface-variant">管理您的个性化升学策略</p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
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
          accentColor="tertiary"
        />
        <StatCard
          label="AI 准确率"
          value="98.4%"
          subtitle="基于 2024 年官方验证数据"
          accentColor="secondary"
        />
      </div>

      {/* Section Title + Actions */}
      <div className="flex justify-between items-end mb-8">
        <div>
          <h3 className="font-headline font-bold text-xl text-on-surface">方案工作台</h3>
          <div className="h-1 w-12 bg-primary mt-2 rounded-full" />
        </div>
        <div className="flex gap-2">
          <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-surface-container-high font-body text-sm font-semibold text-on-surface hover:bg-surface-container-highest transition-colors border-0 cursor-pointer">
            <FilterOutlined /> 筛选
          </button>
          <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-surface-container-high font-body text-sm font-semibold text-on-surface hover:bg-surface-container-highest transition-colors border-0 cursor-pointer">
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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Create New Plan Card */}
          <button
            onClick={() => setCreateModalOpen(true)}
            className="relative group h-full min-h-[280px] rounded-2xl border-2 border-dashed border-outline-variant/40 bg-surface-container-low hover:bg-surface-container-high transition-all duration-300 flex flex-col items-center justify-center p-12 text-center cursor-pointer"
          >
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
              <PlusOutlined className="text-primary text-2xl" />
            </div>
            <h4 className="font-headline font-bold text-lg text-primary">创建新策略方案</h4>
            <p className="font-body text-sm text-on-surface-variant max-w-[240px] mt-2">
              启动 AI 引擎，根据您的分数匹配目标院校。
            </p>
            <div className="absolute inset-0 bg-primary opacity-0 group-active:opacity-5 transition-opacity rounded-2xl" />
          </button>

          {/* Plan Cards */}
          {planList.map((plan: any) => {
            const dist = getStrategyDistribution(plan.items);
            const itemCount = plan.items?.length || 0;
            const hasItems = itemCount > 0;

            return (
              <div
                key={plan.id}
                className="bg-surface-container-lowest rounded-2xl p-8 border-l-[3px] border-l-primary group hover:-translate-y-1 transition-transform duration-300 relative"
              >
                {/* Card Header */}
                <div className="flex justify-between items-start mb-6">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-headline font-bold text-lg text-on-surface truncate">
                        {plan.name}
                      </h4>
                      <StatusChip variant={statusChipVariant(plan.status)} size="sm">
                        {statusLabel(plan.status)}
                      </StatusChip>
                    </div>
                    <div className="flex gap-4 mt-2 flex-wrap">
                      <span className="text-xs font-label uppercase tracking-widest text-on-surface-variant">
                        创建于: {new Date(plan.createdAt || plan.updatedAt).toLocaleDateString('zh-CN')}
                      </span>
                      {plan.province && (
                        <span className="text-xs font-label uppercase tracking-widest text-on-surface-variant">
                          省份: {plan.province}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      className="p-2 rounded-lg hover:bg-surface-container-high transition-colors border-0 bg-transparent cursor-pointer"
                      onClick={() => favoriteMutation.mutate(plan.id)}
                    >
                      {plan.isFavorite
                        ? <StarFilled className="text-lg text-tertiary" />
                        : <StarOutlined className="text-lg text-outline-variant" />
                      }
                    </button>
                    <Popconfirm
                      title="确定删除该方案？"
                      onConfirm={() => deleteMutation.mutate(plan.id)}
                    >
                      <button className="p-2 rounded-lg hover:bg-error-container transition-colors border-0 bg-transparent cursor-pointer">
                        <DeleteOutlined className="text-lg text-outline" />
                      </button>
                    </Popconfirm>
                  </div>
                </div>

                {/* Score + Update Row */}
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="bg-surface-container-low p-4 rounded-xl">
                    <p className="text-[10px] uppercase font-bold text-on-surface-variant mb-1">志愿数</p>
                    <div className="flex items-end gap-2">
                      <span className="font-headline font-extrabold text-2xl text-on-surface">{itemCount}</span>
                      <span className="text-xs text-primary font-bold mb-1">{plan.year}</span>
                    </div>
                  </div>
                  <div className="bg-surface-container-low p-4 rounded-xl">
                    <p className="text-[10px] uppercase font-bold text-on-surface-variant mb-1">最后更新</p>
                    <div className="flex items-center gap-2 h-8">
                      <ClockCircleOutlined className="text-sm text-on-surface-variant" />
                      <span className="font-body text-sm font-medium text-on-surface">
                        {timeAgo(plan.updatedAt)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Strategy Distribution */}
                {hasItems ? (
                  <div className="space-y-3 mb-8">
                    <div className="flex justify-between items-center text-xs font-bold uppercase tracking-wider text-on-surface-variant">
                      <span>策略分布</span>
                      <span className="text-primary">{plan.strategy || '均衡风险模型'}</span>
                    </div>
                    <div className="flex h-3 w-full rounded-full overflow-hidden">
                      <div className="h-full bg-error transition-all" style={{ width: `${dist.rush}%` }} title={`冲 (${dist.rush}%)`} />
                      <div className="h-full bg-primary transition-all" style={{ width: `${dist.stable}%` }} title={`稳 (${dist.stable}%)`} />
                      <div className="h-full bg-secondary transition-all" style={{ width: `${dist.safe}%` }} title={`保 (${dist.safe}%)`} />
                    </div>
                    <div className="flex gap-6 pt-1">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-error" />
                        <span className="text-[10px] font-bold text-on-surface-variant uppercase">冲 {dist.rush}%</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-primary" />
                        <span className="text-[10px] font-bold text-on-surface-variant uppercase">稳 {dist.stable}%</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-secondary" />
                        <span className="text-[10px] font-bold text-on-surface-variant uppercase">保 {dist.safe}%</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="mb-8 py-4 text-center">
                    <p className="text-xs text-on-surface-variant">暂无志愿，点击下方查看详情添加</p>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex gap-3">
                  <Link href={`/plan/${plan.id}`} className="flex-1">
                    <button className="w-full py-2.5 rounded-lg bg-gradient-to-r from-primary to-primary-container text-on-primary font-body text-sm font-semibold shadow-md hover:shadow-lg transition-all border-0 cursor-pointer">
                      查看详情
                    </button>
                  </Link>
                  <button className="px-4 py-2.5 rounded-lg bg-surface-container border border-outline-variant/20 hover:bg-surface-container-high transition-colors cursor-pointer">
                    <DownloadOutlined className="text-lg text-on-surface-variant" />
                  </button>
                </div>
              </div>
            );
          })}

          {/* Empty state when no plans exist */}
          {planList.length === 0 && (
            <div className="lg:col-span-1 flex flex-col items-center justify-center py-16 text-center">
              <div className="w-16 h-16 rounded-full bg-surface-container-high flex items-center justify-center mb-4">
                <FolderOpenOutlined className="text-2xl text-on-surface-variant" />
              </div>
              <p className="text-sm text-on-surface-variant mb-4">暂无方案，去智能推荐页面生成一个吧</p>
              <Link href="/recommend">
                <button className="h-11 px-6 rounded-xl bg-gradient-to-r from-primary to-primary-container text-on-primary font-semibold text-sm border-0 cursor-pointer flex items-center gap-2 transition-all duration-300 hover:shadow-glow-primary-lg active:scale-[0.98]">
                  <RocketOutlined /> 开始智能推荐
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
            <button className="h-12 px-8 rounded-xl bg-gradient-to-r from-primary to-primary-container text-on-primary font-semibold text-sm border-0 cursor-pointer flex items-center gap-2 transition-all duration-300 hover:shadow-glow-primary-lg active:scale-[0.98]">
              <RocketOutlined /> 开始智能推荐
            </button>
          </Link>
        </div>
      )}

      {/* Create Plan Modal */}
      <Modal
        title={<span className="font-headline font-semibold text-on-surface">创建志愿方案</span>}
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
