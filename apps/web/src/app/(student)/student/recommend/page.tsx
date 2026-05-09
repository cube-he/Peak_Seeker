'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Button, Empty, InputNumber, Spin } from 'antd';
import {
  BankOutlined,
  CheckCircleOutlined,
  EnvironmentOutlined,
  FileAddOutlined,
  PhoneOutlined,
  RightOutlined,
  SearchOutlined,
  StarOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery } from '@tanstack/react-query';
import { studentApi } from '@/services/student-api';

interface RecommendResult {
  id: number;
  universityName: string;
  majorName: string;
  gradient: 'rush' | 'stable' | 'safe';
  admissionProbability: number;
  historicalMinScore?: number;
  historicalMinRank?: number;
}

const GRADIENT_STYLE: Record<
  RecommendResult['gradient'],
  { label: string; title: string; color: string; bgClass: string; textClass: string }
> = {
  rush: {
    label: '冲',
    title: '冲一冲',
    color: '#c53030',
    bgClass: 'bg-rush-fixed',
    textClass: 'text-rush',
  },
  stable: {
    label: '稳',
    title: '稳一稳',
    color: '#2c5282',
    bgClass: 'bg-stable-fixed',
    textClass: 'text-accent',
  },
  safe: {
    label: '保',
    title: '保一保',
    color: '#276749',
    bgClass: 'bg-safe-fixed',
    textClass: 'text-safe',
  },
};

export default function StudentRecommendPage() {
  const [score, setScore] = useState<number | null>(null);
  const [results, setResults] = useState<RecommendResult[] | null>(null);

  const { data: profileData } = useQuery({
    queryKey: ['student-profile'],
    queryFn: () => studentApi.getMyProfile(),
  });

  const profile = profileData?.data;
  const effectiveScore = score ?? profile?.totalScore ?? null;

  const recommendMutation = useMutation({
    mutationFn: (inputScore: number) => studentApi.quickRecommend({ score: inputScore }),
    onSuccess: (data) => {
      setResults(data?.data || []);
    },
  });

  const groupedResults = useMemo(
    () => ({
      rush: results?.filter((item) => item.gradient === 'rush') || [],
      stable: results?.filter((item) => item.gradient === 'stable') || [],
      safe: results?.filter((item) => item.gradient === 'safe') || [],
    }),
    [results],
  );

  const handleSearch = () => {
    if (effectiveScore) {
      recommendMutation.mutate(effectiveScore);
    }
  };

  const paths = [
    {
      label: '智能推荐',
      desc: '基于分数快速匹配院校专业',
      icon: <ThunderboltOutlined />,
      active: true,
    },
    {
      label: '分专业筛选',
      desc: '围绕一个专业方向深挖',
      icon: <StarOutlined />,
    },
    {
      label: '城市优先',
      desc: '仅看意向城市院校',
      icon: <EnvironmentOutlined />,
    },
    {
      label: '手动组建',
      desc: '从院校库逐一挑选',
      icon: <FileAddOutlined />,
    },
  ];

  return (
    <div className="space-y-5">
      <header>
        <p className="mb-2 text-[11px] font-medium uppercase tracking-[2px] text-accent">AI 智能推荐</p>
        <h1 className="font-serif text-[26px] font-semibold leading-tight text-text">
          找到更适合你的院校组合
        </h1>
        <p className="mt-2 text-sm leading-6 text-text-muted">
          根据分数快速匹配冲、稳、保三档结果；更完整的偏好推荐需要后端扩展参数接口。
        </p>
      </header>

      <section className="rounded-2xl border border-border-subtle bg-gradient-to-br from-surface to-[#fbfaf5] px-5 py-4 shadow-card">
        <div className="flex items-center gap-4">
          <div className="font-serif text-[38px] font-semibold leading-none text-accent">
            {effectiveScore ?? '--'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium uppercase tracking-[1.4px] text-text-muted">
              当前推荐分数
            </p>
            <p className="mt-1 truncate text-sm text-text-secondary">
              {profile?.provincialRank ? `省排名 ${profile.provincialRank.toLocaleString('zh-CN')} 位` : '可手动输入分数'}
            </p>
          </div>
          <span className="rounded-lg bg-safe/10 px-3 py-1.5 text-xs font-medium text-safe">
            快速版
          </span>
        </div>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <InputNumber
            value={effectiveScore}
            onChange={(value) => setScore(value)}
            min={0}
            max={750}
            placeholder="输入高考或模考分数"
            size="large"
            className="w-full flex-1"
            style={{ width: '100%' }}
          />
          <Button
            type="primary"
            size="large"
            icon={<ThunderboltOutlined />}
            onClick={handleSearch}
            loading={recommendMutation.isPending}
            disabled={!effectiveScore}
            className="border-0"
          >
            开始推荐
          </Button>
        </div>
      </section>

      <section className="rounded-2xl bg-[#1e3a5f] px-5 py-5 text-white shadow-[0_14px_36px_rgba(30,58,95,0.22)]">
        <p className="text-[11px] uppercase tracking-[2px] text-accent-light">一键智能生成</p>
        <h2 className="mt-2 font-serif text-2xl font-semibold">生成冲稳保参考结果</h2>
        <p className="mt-2 text-sm leading-6 text-white/70">
          当前已接入快速推荐接口；专业偏好、城市偏好、家庭预算等多维推荐参数待后端开放。
        </p>
        <div className="mt-4 flex items-center justify-between">
          <Button
            type="primary"
            icon={<ThunderboltOutlined />}
            onClick={handleSearch}
            loading={recommendMutation.isPending}
            disabled={!effectiveScore}
            className="border-0 bg-accent"
          >
            开始推荐
          </Button>
          <div className="text-right text-[11px] text-white/55">
            <strong className="block font-serif text-base text-white">quickRecommend</strong>
            已接入
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-serif text-base font-semibold text-text-secondary">推荐流程</h2>
        <div className="space-y-2">
          {[
            ['基本信息', effectiveScore ? `分数 ${effectiveScore}` : '等待输入分数', true],
            ['省排名/选科', profile?.provincialRank ? `位次 ${profile.provincialRank}` : '待完善档案', Boolean(profile?.provincialRank)],
            ['专业与城市偏好', '待扩展推荐参数接口', false],
          ].map(([label, meta, done], index) => (
            <div key={label as string} className="grid grid-cols-[32px_1fr_auto] items-center gap-3 rounded-xl bg-surface px-4 py-3 shadow-card">
              <span className={`flex h-7 w-7 items-center justify-center rounded-full font-serif text-xs font-semibold ${done ? 'bg-safe text-white' : 'bg-accent-fixed text-accent'}`}>
                {index + 1}
              </span>
              <span>
                <span className="block text-sm font-medium text-text">{label}</span>
                <span className="mt-0.5 block text-xs text-text-muted">{meta}</span>
              </span>
              {done ? <CheckCircleOutlined className="text-safe" /> : <RightOutlined className="text-text-faint" />}
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-serif text-base font-semibold text-text-secondary">选择推荐路径</h2>
        <div className="grid grid-cols-2 gap-3">
          {paths.map((path) => (
            <div
              key={path.label}
              className={`rounded-2xl border-t-[3px] bg-surface px-4 py-4 shadow-card ${
                path.active ? 'border-t-accent' : 'border-t-border opacity-75'
              }`}
            >
              <span className="mb-2 block text-xl text-accent">{path.icon}</span>
              <p className="font-serif text-sm font-semibold text-text">{path.label}</p>
              <p className="mt-1 text-xs leading-5 text-text-muted">{path.desc}</p>
              <p className="mt-2 text-[11px] font-medium text-accent">{path.active ? '已接入' : '待接入'}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-serif text-lg font-semibold text-text">推荐结果</h2>
          {results ? <span className="text-xs text-text-muted">共 {results.length} 条</span> : null}
        </div>

        {recommendMutation.isPending ? (
          <div className="rounded-2xl bg-surface py-16 text-center shadow-card">
            <Spin size="large" />
          </div>
        ) : results === null ? (
          <div className="rounded-2xl bg-surface py-12 text-center shadow-card">
            <SearchOutlined className="text-4xl text-text-faint" />
            <p className="mt-3 text-sm text-text-muted">输入分数后开始生成推荐</p>
          </div>
        ) : results.length === 0 ? (
          <div className="rounded-2xl bg-surface py-12 shadow-card">
            <Empty description="暂无匹配结果，请调整分数后重试" />
          </div>
        ) : (
          <div className="space-y-5">
            {(['rush', 'stable', 'safe'] as RecommendResult['gradient'][]).map((key) => {
              const style = GRADIENT_STYLE[key];
              const items = groupedResults[key];
              if (items.length === 0) return null;
              return (
                <div key={key}>
                  <div className="mb-2 flex items-center gap-2">
                    <span className={`rounded-md px-2 py-1 text-xs font-semibold ${style.bgClass} ${style.textClass}`}>
                      {style.label}
                    </span>
                    <span className="text-sm font-medium text-text-secondary">{style.title}</span>
                    <span className="text-xs text-text-faint">({items.length})</span>
                  </div>
                  <div className="overflow-hidden rounded-2xl bg-surface shadow-card">
                    {items.map((item) => (
                      <div
                        key={item.id}
                        className="grid grid-cols-[1fr_64px] gap-3 border-b border-border-subtle px-4 py-3 last:border-b-0"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-serif text-sm font-semibold text-text">{item.universityName}</p>
                          <p className="mt-1 truncate text-xs text-text-muted">{item.majorName}</p>
                          {item.historicalMinScore ? (
                            <p className="mt-1 text-[11px] text-text-faint">
                              历年最低 {item.historicalMinScore}
                              {item.historicalMinRank ? ` · 位次 ${item.historicalMinRank}` : ''}
                            </p>
                          ) : null}
                        </div>
                        <div className="text-right">
                          <p className="font-serif text-lg font-semibold" style={{ color: style.color }}>
                            {item.admissionProbability}%
                          </p>
                          <p className="text-[10px] text-text-muted">概率</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}

            <div className="rounded-2xl bg-surface px-5 py-5 text-center shadow-card">
              <p className="mb-3 text-sm text-text-secondary">
                想获得完整个性化方案，请联系你的指导老师生成正式方案。
              </p>
              <Button icon={<PhoneOutlined />} type="primary" ghost>
                联系老师获取完整方案
              </Button>
            </div>
          </div>
        )}
      </section>

      <Link href="/universities" className="flex items-center justify-center gap-2 rounded-2xl bg-surface px-5 py-4 text-sm font-medium text-primary no-underline shadow-card">
        <BankOutlined />
        去院校库手动查看
      </Link>
    </div>
  );
}
