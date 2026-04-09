'use client';

import { useState } from 'react';
import {
  Tabs,
  Empty,
  Popconfirm,
  Spin,
  message,
  Button,
} from 'antd';
import {
  StarFilled,
  DeleteOutlined,
  BankOutlined,
  BookOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import MainLayout from '@/components/layout/MainLayout';
import { favoriteService } from '@/services/favorite';
import { useAuthStore } from '@/stores/authStore';
import Link from 'next/link';

function UniversityCard({ record, onRemove, removing }: { record: any; onRemove: (id: number) => void; removing: boolean }) {
  const uni = record.university;
  const tags = [
    uni?.is985 && '985',
    uni?.is211 && '211',
    uni?.isDoubleFirstClass && '双一流',
  ].filter(Boolean);

  return (
    <div className="bg-surface rounded-lg shadow-card hover:shadow-card-hover transition-all duration-300 p-4 sm:p-5">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 sm:gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <Link
              href={`/universities/${uni?.id}`}
              className="font-serif font-semibold text-text hover:text-primary truncate transition-colors text-base"
            >
              {uni?.name}
            </Link>
            {tags.map((tag) => (
              <span
                key={tag}
                className="bg-surface-dim text-text-secondary rounded-full px-2.5 py-0.5 text-xs font-medium"
              >
                {tag}
              </span>
            ))}
          </div>

          <div className="text-sm text-text-tertiary mb-2">
            {uni?.province} · {uni?.type}
          </div>

          {record.notes && (
            <div className="text-sm text-text-tertiary">
              备注：{record.notes}
            </div>
          )}
        </div>

        <div className="flex items-center gap-4 shrink-0">
          <div className="text-xs text-text-muted [font-variant-numeric:tabular-nums]">
            {new Date(record.createdAt).toLocaleDateString('zh-CN')}
          </div>
          <Popconfirm
            title="确定取消收藏？"
            onConfirm={() => onRemove(record.id)}
          >
            <button
              className="text-rush text-sm hover:text-rush/80 transition-colors border-0 bg-transparent cursor-pointer inline-flex items-center gap-1 px-0"
              disabled={removing}
            >
              <DeleteOutlined />
              取消收藏
            </button>
          </Popconfirm>
        </div>
      </div>
    </div>
  );
}

function MajorCard({ record, onRemove, removing }: { record: any; onRemove: (id: number) => void; removing: boolean }) {
  const major = record.major;

  return (
    <div className="bg-surface rounded-lg shadow-card hover:shadow-card-hover transition-all duration-300 p-4 sm:p-5">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 sm:gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="font-serif font-semibold text-text text-base">
              {major?.name}
            </span>
            {major?.level && (
              <span className="bg-surface-dim text-text-secondary rounded-full px-2.5 py-0.5 text-xs font-medium">
                {major?.level}
              </span>
            )}
          </div>

          <div className="text-sm text-text-tertiary mb-2">
            {major?.category} · {major?.discipline}
          </div>

          {record.notes && (
            <div className="text-sm text-text-tertiary">
              备注：{record.notes}
            </div>
          )}
        </div>

        <div className="flex items-center gap-4 shrink-0">
          <div className="text-xs text-text-muted [font-variant-numeric:tabular-nums]">
            {new Date(record.createdAt).toLocaleDateString('zh-CN')}
          </div>
          <Popconfirm
            title="确定取消收藏？"
            onConfirm={() => onRemove(record.id)}
          >
            <button
              className="text-rush text-sm hover:text-rush/80 transition-colors border-0 bg-transparent cursor-pointer inline-flex items-center gap-1 px-0"
              disabled={removing}
            >
              <DeleteOutlined />
              取消收藏
            </button>
          </Popconfirm>
        </div>
      </div>
    </div>
  );
}

function EmptyFavorites({ type }: { type: 'university' | 'major' }) {
  const label = type === 'university' ? '院校' : '专业';
  const href = type === 'university' ? '/universities' : '/majors';

  return (
    <div className="text-center py-12">
      <StarFilled className="text-4xl text-text-faint mb-4" />
      <div className="font-serif text-lg text-text-muted mb-4">
        暂无收藏的{label}
      </div>
      <Link href={href}>
        <button className="bg-gradient-to-br from-primary to-primary-light text-white px-6 py-2.5 rounded font-medium border-0 cursor-pointer transition-all duration-200 hover:-translate-y-px shadow-glow-accent text-sm">
          去发现{label}
        </button>
      </Link>
    </div>
  );
}

export default function FavoritesPage() {
  const { isLoggedIn } = useAuthStore();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'university' | 'major'>('university');

  const { data: favorites, isLoading } = useQuery({
    queryKey: ['favorites', activeTab],
    queryFn: () => favoriteService.getList(activeTab),
    enabled: isLoggedIn,
  });

  const removeMutation = useMutation({
    mutationFn: (id: number) => favoriteService.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['favorites'] });
      message.success('已取消收藏');
    },
  });

  if (!isLoggedIn) {
    return (
      <MainLayout>
        <div className="bg-surface rounded-xl text-center py-16 shadow-card">
          <Empty description="请先登录后查看收藏" />
          <Link href="/login">
            <Button type="primary" className="mt-4">去登录</Button>
          </Link>
        </div>
      </MainLayout>
    );
  }

  const tabItems = [
    {
      key: 'university',
      label: (
        <span><BankOutlined className="mr-1" />收藏的院校</span>
      ),
      children: isLoading ? (
        <div className="flex justify-center py-12"><Spin size="large" /></div>
      ) : !favorites || favorites.length === 0 ? (
        <EmptyFavorites type="university" />
      ) : (
        <div className="flex flex-col gap-3">
          {favorites.map((record: any) => (
            <UniversityCard
              key={record.id}
              record={record}
              onRemove={(id) => removeMutation.mutate(id)}
              removing={removeMutation.isPending}
            />
          ))}
        </div>
      ),
    },
    {
      key: 'major',
      label: (
        <span><BookOutlined className="mr-1" />收藏的专业</span>
      ),
      children: isLoading ? (
        <div className="flex justify-center py-12"><Spin size="large" /></div>
      ) : !favorites || favorites.length === 0 ? (
        <EmptyFavorites type="major" />
      ) : (
        <div className="flex flex-col gap-3">
          {favorites.map((record: any) => (
            <MajorCard
              key={record.id}
              record={record}
              onRemove={(id) => removeMutation.mutate(id)}
              removing={removeMutation.isPending}
            />
          ))}
        </div>
      ),
    },
  ];

  return (
    <MainLayout>
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="font-serif text-[22px] sm:text-2xl font-semibold text-text m-0 flex items-center gap-2">
          <StarFilled className="text-accent" />
          我的收藏
        </h1>
      </div>

      {/* Tabs Section */}
      <div className="bg-surface rounded-xl p-4 sm:p-6 shadow-card">
        <Tabs
          items={tabItems}
          activeKey={activeTab}
          onChange={(key) => setActiveTab(key as 'university' | 'major')}
        />
      </div>
    </MainLayout>
  );
}
