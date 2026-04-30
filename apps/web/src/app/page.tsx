'use client';

import Link from 'next/link';
import MainLayout from '@/components/layout/MainLayout';
import { CountdownBadge, TimelinePanel } from '@/components/home/TimelineTracker';
import { RankInput } from '@/components/score/RankInput';
import { useQuery } from '@tanstack/react-query';
import { timelineApi } from '@/services/timeline-api';
import { useMemo } from 'react';

export default function HomePage() {
  const currentYear = useMemo(() => new Date().getFullYear(), []);
  const { data: timelineData } = useQuery({
    queryKey: ['timeline', currentYear],
    queryFn: () => timelineApi.getTimeline(currentYear),
    staleTime: 60 * 60 * 1000,
  });
  const events = timelineData?.events ?? [];

  return (
    <MainLayout noPadding>
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-primary">
        {/* 背景图（淡化） */}
        <div
          className="absolute inset-0 opacity-[0.10]"
          style={{
            backgroundImage: `url('/images/bg-hero-home.webp')`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />
        {/* 装饰光晕：右上暖色 + 左下冷色，打破矩形铺图的单调 */}
        <div
          className="absolute -top-1/3 -right-1/4 w-[60%] aspect-square pointer-events-none"
          style={{
            background: 'radial-gradient(circle at center, rgba(184,134,11,0.18) 0%, rgba(184,134,11,0.05) 35%, transparent 70%)',
          }}
        />
        <div
          className="absolute -bottom-1/3 -left-1/4 w-[55%] aspect-square pointer-events-none"
          style={{
            background: 'radial-gradient(circle at center, rgba(120,160,200,0.12) 0%, rgba(120,160,200,0.03) 40%, transparent 70%)',
          }}
        />
        {/* 微噪点纹理（极淡，增加质感） */}
        <div
          className="absolute inset-0 opacity-[0.03] pointer-events-none mix-blend-overlay"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          }}
        />
        {/* 顶部柔光过渡 */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'linear-gradient(to bottom, rgba(30,58,95,0.3) 0%, transparent 40%, transparent 100%)',
          }}
        />

        <div className="relative max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-12 py-12 sm:py-16 lg:py-20">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_240px] lg:grid-cols-[1fr_280px] gap-10 lg:gap-12 items-start">
            {/* Left Column */}
            <div>
              <CountdownBadge events={events} />

              <h1 className="font-serif text-[28px] sm:text-[36px] lg:text-[44px] font-bold leading-[1.12] tracking-tight text-white">
                每一个志愿，
                <br />
                都值得被<span className="text-accent-light">认真对待</span>。
              </h1>
              <p className="text-[15px] sm:text-[17px] text-white/65 leading-relaxed mt-5 max-w-[460px]">
                汇集 2022-2025 年四川在川招生录取数据，帮助四川考生做出更有把握的志愿决策。
              </p>
              <div className="flex flex-col sm:flex-row gap-3 mt-8">
                <Link
                  href="/recommend"
                  className="w-full sm:w-auto text-center bg-accent hover:bg-accent-light text-white px-7 py-3.5 rounded-[10px] text-[15px] font-semibold shadow-glow-accent hover:-translate-y-px transition-all duration-200 no-underline"
                >
                  开始智能推荐
                </Link>
                <Link
                  href="/universities"
                  className="w-full sm:w-auto text-center bg-white/10 text-white border border-white/20 px-7 py-3.5 rounded-[10px] text-[15px] font-medium hover:bg-white/20 transition-all duration-200 no-underline"
                >
                  浏览在川招生院校
                </Link>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6 lg:gap-8 mt-10 pt-8 border-t border-white/10">
                {[
                  { value: '2,237', label: '在川招生院校' },
                  { value: '14.4万', label: '录取记录' },
                  { value: '1,434', label: '专业覆盖' },
                  { value: '4年', label: '数据纵深' },
                ].map((item, i) => (
                  <div key={i}>
                    <div className="font-serif text-[20px] sm:text-[22px] font-semibold text-white tabular-nums">
                      {item.value}
                    </div>
                    <div className="text-[11px] text-white/40 mt-1">{item.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right Column — RankInput + Timeline (md+) */}
            <div className="hidden md:flex md:flex-col md:gap-4 w-full">
              <RankInput variant="compact" />
              <TimelinePanel />
            </div>
          </div>

          {/* Mobile Timeline (sm only) — kept inside hero so bg-primary is continuous */}
          {events.length > 0 && (
            <div className="md:hidden mt-8 max-w-md">
              <TimelinePanel />
            </div>
          )}
        </div>
      </section>

      {/* Features Section */}
      <section className="bg-surface-dim py-16 sm:py-20 lg:py-24 px-4 sm:px-6 lg:px-12">
        <div className="max-w-[1200px] mx-auto">
          <div className="text-[11px] uppercase tracking-[2px] text-accent font-medium">
            核心能力
          </div>
          <h2 className="font-serif text-[24px] sm:text-[30px] lg:text-[36px] font-semibold text-text mt-2.5">
            用数据支撑每一步抉择
          </h2>
          <p className="text-[15px] text-text-tertiary mt-3 max-w-[560px] leading-relaxed">
            从院校筛选到方案生成，基于四川在川招生真实数据，覆盖志愿决策的关键环节。
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mt-10">
            {[
              { icon: '🏛', bg: 'bg-primary-fixed', title: '院校筛选', desc: '覆盖全国 2,237 所在川招生院校，多维度数据横向对比，快速锁定目标。' },
              { icon: '📊', bg: 'bg-safe-fixed', title: '专业洞察', desc: '1,434 个专业的录取数据与趋势，了解每一条赛道的竞争态势。' },
              { icon: '✨', bg: 'bg-accent-fixed', title: '智能推荐', desc: '基于 4 年录取数据与你的分数位次，生成个性化冲/稳/保方案。' },
              { icon: '📈', bg: 'bg-rush-fixed', title: '趋势分析', desc: '录取分数线走势、报考热度变化，用历史数据辅助前瞻决策。' },
              { icon: '📋', bg: 'bg-stable-fixed', title: '方案管理', desc: '对比、调整、优化你的志愿组合，导出完整方案，填报时心中有数。' },
              { icon: '🔒', bg: 'bg-surface-dim', title: '数据安全', desc: '你的个人信息与成绩数据在严格保护之中。' },
            ].map((card, i) => (
              <div
                key={i}
                className="bg-surface rounded-xl p-5 sm:p-7 hover:shadow-card-hover transition-shadow duration-300 cursor-pointer"
              >
                <div className={`w-11 h-11 rounded-[10px] ${card.bg} flex items-center justify-center text-xl`}>
                  {card.icon}
                </div>
                <h3 className="font-serif text-[19px] font-semibold text-text mt-4">{card.title}</h3>
                <p className="text-sm text-text-tertiary mt-2 leading-relaxed">{card.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-12 py-16 sm:py-20 lg:py-24">
        <div className="text-[11px] uppercase tracking-[2px] text-accent font-medium">使用流程</div>
        <h2 className="font-serif text-[24px] sm:text-[30px] lg:text-[36px] font-semibold text-text mt-2.5">
          三步，从迷茫到从容
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-12">
          {[
            { num: '01', title: '输入你的成绩', desc: '填写高考分数与位次，系统自动定位你在四川考生中的相对位置。' },
            { num: '02', title: '获取推荐方案', desc: '基于 2022-2025 年录取数据，生成个性化的冲/稳/保志愿方案。' },
            { num: '03', title: '优化并导出', desc: '调整、比较、确认，导出最终方案用于正式填报。' },
          ].map((step, i) => (
            <div key={i}>
              <div className="font-serif text-[40px] sm:text-[52px] lg:text-[64px] font-bold text-border leading-none">{step.num}</div>
              <h3 className="font-serif text-xl font-semibold text-text mt-3">{step.title}</h3>
              <p className="text-sm text-text-tertiary mt-2 leading-relaxed">{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative overflow-hidden bg-primary">
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage: `url('/images/bg-cta-home.webp')`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />
        <div className="relative py-16 sm:py-20 lg:py-24 px-4 sm:px-6 lg:px-12 text-center">
          <h2 className="font-serif text-[24px] sm:text-[30px] lg:text-[36px] font-semibold text-white">
            你的未来，值得一份好方案
          </h2>
          <p className="text-base text-white/65 mt-3">
            智愿家与你一起，认真对待每一个选择
          </p>
          <Link
            href="/recommend"
            className="w-full sm:w-auto bg-accent hover:bg-accent-light text-white px-9 py-4 rounded-[10px] text-base font-semibold shadow-glow-accent hover:-translate-y-px transition-all duration-200 mt-7 inline-block no-underline"
          >
            免费开始使用
          </Link>
        </div>
      </section>
    </MainLayout>
  );
}
