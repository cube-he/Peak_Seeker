'use client';

import Link from 'next/link';
import MainLayout from '@/components/layout/MainLayout';
import { CountdownBadge } from '@/components/home/TimelineTracker';
import { RankInput } from '@/components/score/RankInput';
import { useQuery } from '@tanstack/react-query';
import { timelineApi, type TimelineEvent } from '@/services/timeline-api';
import { useMemo } from 'react';

const stats = [
  { value: '2,237', label: '在川招生院校' },
  { value: '14.4 万', label: '录取记录' },
  { value: '1,434', label: '专业覆盖' },
  { value: '4 年', label: '数据纵深' },
];

const features = [
  {
    icon: '🏛',
    bg: 'bg-elite-fixed',
    title: '院校库',
    desc: '2,237 所在川招生院校，按层次、地区、专业组合多维筛选。',
    href: '/universities',
    action: '浏览院校',
  },
  {
    icon: '📊',
    bg: 'bg-primary-fixed',
    title: '专业库',
    desc: '1,434 个本专科专业，结合历年录取数据与专业方向，辅助横向比较。',
    href: '/majors',
    action: '浏览专业',
  },
  {
    icon: '📈',
    bg: 'bg-safe-fixed',
    title: '分数线 · 4 年纵深',
    desc: '2022-2025 录取最低分、最低位次与批次信息，一眼看出趋势。',
    href: '/scores',
    action: '查询分数',
  },
  {
    icon: '✨',
    bg: 'bg-rush-fixed',
    title: 'AI 智能推荐',
    desc: '基于位次、偏好与录取历史，生成冲/稳/保梯度方案。',
    href: '/recommend',
    action: '立即推荐',
  },
  {
    icon: '📋',
    bg: 'bg-accent-fixed',
    title: '志愿方案编辑器',
    desc: '对比、调整、保存你的志愿组合，并导出完整方案用于沟通确认。',
    href: '/plan',
    action: '打开方案',
  },
  {
    icon: '🔒',
    bg: 'bg-surface-dim',
    title: '数据安全',
    desc: '成绩、位次、偏好与个人信息仅用于志愿决策流程，严格保护。',
    href: '/profile',
    action: '账户设置',
  },
];

const sampleRows = [
  { order: '01', crest: '复', name: '复旦大学', major: '汉语言文学 · 中文系 · 上海', type: 'rush', chance: '22%' },
  { order: '02', crest: '同', name: '同济大学', major: '新闻传播学类 · 上海', type: 'rush', chance: '31%' },
  { order: '03', crest: '华', name: '华东师范大学', major: '教育学 · 师范类 · 上海', type: 'safe', chance: '68%' },
  { order: '04', crest: '南', name: '南京大学', major: '广告学 · 新闻传播学院', type: 'safe', chance: '72%' },
  { order: '05', crest: '川', name: '四川大学', major: '新闻传播学 · 文新学院', type: 'stable', chance: '94%' },
  { order: '06', crest: '东', name: '东南大学', major: '人文社科类 · 南京', type: 'stable', chance: '96%' },
];

const fallbackTimeline = [
  {
    date: '现在',
    label: '进行中',
    title: '备考冲刺 & 院校研究',
    desc: '用零碎时间浏览意向院校、收藏专业、了解 4 年录取数据。心里有数，临场不慌。',
    tone: 'now',
  },
  {
    date: '6 月 7 - 9 日',
    label: 'key date',
    title: '2026 年高考',
    desc: '语文 / 数学 / 外语 + 选考科目。考完后保留所有准考材料，随时可能用到。',
    tone: 'pending',
  },
  {
    date: '6 月 23 日前后',
    label: '出分日',
    title: '公布成绩 & 一分一段表',
    desc: '查到分数当天，使用真实位次重新计算推荐方案。一分一段表是后续决策基准。',
    tone: 'key',
  },
  {
    date: '6 月 24 - 28 日',
    label: '练习',
    title: '模拟填报演练',
    desc: '熟悉省考试院模拟系统，同步完成方案 V1，导出给老师或家长过目。',
    tone: 'pending',
  },
  {
    date: '6 月 29 - 7 月 5 日',
    label: '正式提交',
    title: '志愿填报截止',
    desc: '本科批、专科批志愿陆续提交。最终提交前做一次梯度和风险自检。',
    tone: 'key',
  },
  {
    date: '7 月 8 日起',
    label: '等待',
    title: '录取 · 通知书寄达',
    desc: '按批次投档录取，及时跟进录取结果，并保留后续征集志愿的应对空间。',
    tone: 'pending',
  },
];

function formatTimelineDate(event: TimelineEvent) {
  if (!event.startDate) return '待公布';
  const start = new Date(event.startDate);
  const startText = `${start.getMonth() + 1} 月 ${start.getDate()} 日`;
  if (!event.endDate) return `${startText} 起`;
  const end = new Date(event.endDate);
  return `${startText} - ${end.getDate()} 日`;
}

function getTimelineDescription(event: TimelineEvent) {
  const detail = event.detail;
  if (detail && typeof detail.description === 'string') return detail.description;
  if (detail && typeof detail.note === 'string') return detail.note;
  return '关键节点临近时，系统会结合你的方案进度给出提醒。';
}

function useLandingTimeline(events: TimelineEvent[]) {
  return useMemo(() => {
    if (events.length === 0) return fallbackTimeline;

    return events.slice(0, 6).map((event, index) => ({
      date: formatTimelineDate(event),
      label: event.status === 'countdown' ? '进行中' : event.status,
      title: event.name,
      desc: getTimelineDescription(event),
      tone: index === 0 ? 'now' : event.status.includes('completed') ? 'done' : index === 2 || index === 4 ? 'key' : 'pending',
    }));
  }, [events]);
}

export default function HomePage() {
  const currentYear = useMemo(() => new Date().getFullYear(), []);
  const { data: timelineData } = useQuery({
    queryKey: ['timeline', currentYear],
    queryFn: () => timelineApi.getTimeline(currentYear),
    staleTime: 60 * 60 * 1000,
  });

  const events = timelineData?.events ?? [];
  const timelineItems = useLandingTimeline(events);

  return (
    <MainLayout noPadding hideMobileBottomNav>
      <section className="relative isolate overflow-hidden bg-[#1a2c47] text-white">
        <div
          className="absolute inset-0 -z-20 opacity-40"
          style={{
            backgroundImage: `url('/images/bg-hero-home.webp')`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(800px_420px_at_72%_26%,rgba(184,134,11,0.22),transparent_62%),radial-gradient(680px_420px_at_12%_82%,rgba(44,82,130,0.55),transparent_62%)]" />
        <div
          className="absolute inset-0 -z-10 opacity-[0.035] mix-blend-overlay"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          }}
        />

        <div className="mx-auto grid max-w-[1200px] grid-cols-1 items-center gap-10 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)] lg:gap-[60px] lg:px-12 lg:py-24">
          <div>
            <CountdownBadge events={events} />
            <div className="mb-4 text-[11px] font-medium uppercase tracking-[2px] text-accent-light">
              为四川考生而生 · FOR SICHUAN STUDENTS
            </div>
            <h1 className="font-serif text-[40px] font-bold leading-[1.08] tracking-normal text-white sm:text-[48px] lg:text-[56px]">
              每一个志愿，
              <br />
              都值得被认真对待。
            </h1>
            <p className="mt-5 max-w-[540px] text-[16px] leading-relaxed text-white/75 sm:text-[18px]">
              汇集 2022-2025 年四川在川招生录取数据，结合 AI 智能推荐与 4 年位次趋势，帮助你做出更有把握的志愿决策。
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/recommend"
                className="inline-flex items-center justify-center rounded-lg bg-accent px-7 py-3.5 text-[15px] font-semibold text-white no-underline shadow-glow-accent transition-all duration-200 hover:-translate-y-px hover:bg-accent-light"
              >
                免费开始智能推荐 →
              </Link>
              <Link
                href="/universities"
                className="inline-flex items-center justify-center rounded-lg border border-white/20 bg-white/10 px-7 py-3.5 text-[15px] font-medium text-white no-underline transition-all duration-200 hover:bg-white/20"
              >
                浏览在川招生院校
              </Link>
            </div>

            <div className="mt-10 flex flex-wrap gap-x-8 gap-y-4 border-t border-white/10 pt-8 text-[13px] text-white/60">
              {stats.map((item) => (
                <div key={item.label}>
                  <span className="block font-serif text-2xl font-semibold tabular-nums text-white">
                    {item.value}
                  </span>
                  {item.label}
                </div>
              ))}
            </div>
          </div>

          <div className="hidden rounded-xl border border-white/15 bg-white/[0.06] p-5 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_24px_70px_rgba(0,0,0,0.18)] backdrop-blur-xl sm:p-6 md:block">
            <div className="text-[11px] uppercase tracking-[1.6px] text-white/55">三步预估你的位次</div>
            <h2 className="mt-1 font-serif text-[24px] font-semibold leading-tight text-white">
              输入分数，看看你能去哪
            </h2>
            <p className="mt-2 text-[13px] leading-relaxed text-white/50">
              这里接入现有位次换算接口。查询后会写入本地志愿推荐上下文，后续页面可继续使用。
            </p>
            <div className="mt-5">
              <RankInput variant="compact" />
            </div>
            <div className="mt-5 grid grid-cols-3 overflow-hidden rounded-lg border border-white/10 bg-white/[0.04]">
              {[
                ['推算位次', '≈ 12,485'],
                ['超本科线', '+ 110 分'],
                ['可冲击', '中流 985'],
              ].map(([label, value]) => (
                <div key={label} className="border-r border-white/10 p-3 last:border-r-0">
                  <div className="text-[10px] uppercase tracking-[1.4px] text-white/40">{label}</div>
                  <div className="mt-1 font-serif text-[15px] font-semibold text-white">{value}</div>
                </div>
              ))}
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-rush-fixed px-3 py-1 text-xs font-medium text-rush">● 冲</span>
              <span className="rounded-full bg-safe-fixed px-3 py-1 text-xs font-medium text-safe">● 稳</span>
              <span className="rounded-full bg-stable-fixed px-3 py-1 text-xs font-medium text-stable">● 保</span>
              <span className="ml-auto text-xs text-white/45">已为你预筛 168 所</span>
            </div>
            <Link
              href="/recommend"
              className="mt-5 inline-flex w-full items-center justify-center rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-white no-underline shadow-glow-accent transition-all duration-200 hover:-translate-y-px hover:bg-accent-light"
            >
              查看智能推荐方案 →
            </Link>
          </div>
        </div>
      </section>

      <section className="border-y border-border-subtle bg-surface py-8">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-4 px-4 text-[12px] uppercase tracking-[1.4px] text-text-muted sm:px-6 lg:px-12">
          <span>数据来源</span>
          <strong className="font-medium text-text-secondary">四川省教育考试院</strong>
          <strong className="font-medium text-text-secondary">阳光高考信息平台</strong>
          <strong className="font-medium text-text-secondary">各高校招生办</strong>
          <strong className="font-medium text-text-secondary">2022-2025 录取年报</strong>
          <span className="text-accent">● 持续更新</span>
        </div>
      </section>

      <section className="px-4 py-16 sm:px-6 sm:py-20 lg:px-12">
        <div className="mx-auto max-w-[1200px]">
          <SectionHeader eyebrow="三步走 · HOW IT WORKS" title="从迷茫，到从容" centered>
            不需要你成为数据专家。告诉我们分数、位次和偏好，我们把值得认真考虑的选择排出来。
          </SectionHeader>
          <div className="mt-12 grid grid-cols-1 gap-5 md:grid-cols-3">
            {[
              ['01', '输入分数与位次', '填入高考分数和省内排名，或使用位次换算器从历年模考成绩推算。'],
              ['02', '勾选你在意的事', '城市偏好、专业大类、学费上限、是否服从调剂，只筛你真正会选的院校。'],
              ['03', '收到志愿建议', '基于 4 年录取数据生成冲/稳/保三档，每条建议附概率与近年分数。'],
            ].map(([num, title, desc], index) => (
              <div key={num} className="relative rounded-xl bg-surface p-7 shadow-card">
                <div className="font-serif text-5xl font-semibold leading-none text-accent/50 tabular-nums">{num}</div>
                <h3 className="mt-3 font-serif text-[22px] font-semibold text-text">{title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-text-tertiary">{desc}</p>
                {index < 2 && (
                  <span className="absolute right-[-14px] top-1/2 hidden -translate-y-1/2 text-xl text-text-faint md:block">
                    →
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-surface px-4 py-16 sm:px-6 sm:py-20 lg:px-12">
        <div className="mx-auto max-w-[1200px]">
          <SectionHeader eyebrow="核心能力 · CORE CAPABILITIES" title="一个工作台，覆盖整个填报季" centered />
          <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <Link
                key={feature.title}
                href={feature.href}
                className="rounded-xl bg-surface-high p-6 text-text no-underline shadow-card transition-all duration-300 hover:-translate-y-0.5 hover:shadow-card-hover"
              >
                <div className={`flex h-12 w-12 items-center justify-center rounded-[10px] ${feature.bg} text-[22px]`}>
                  {feature.icon}
                </div>
                <h3 className="mt-4 font-serif text-[20px] font-semibold text-text">{feature.title}</h3>
                <p className="mt-2 text-[14px] leading-relaxed text-text-tertiary">{feature.desc}</p>
                <span className="mt-4 inline-flex text-[13px] font-medium text-primary">
                  {feature.action} →
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-16 sm:px-6 sm:py-20 lg:px-12">
        <div className="mx-auto max-w-[1200px]">
          <SectionHeader eyebrow="真实案例 · A SAMPLE PLAN" title="看看 628 分的同学，AI 推荐了什么" centered>
            物理类 · 希望就读上海或南京 · 工科或新闻 · 学费不超过 8000
          </SectionHeader>
          <div className="mt-10 grid gap-8 rounded-xl bg-surface p-6 shadow-card lg:grid-cols-[1fr_1.2fr] lg:p-8">
            <div className="flex flex-col gap-4">
              <div>
                <div className="text-[11px] uppercase tracking-[1.5px] text-text-muted">推荐方案概览</div>
                <h3 className="mt-1 font-serif text-[24px] font-semibold text-text">冲 18 · 稳 18 · 保 9</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-text-tertiary">
                  综合 4 年录取数据与偏好，从候选院校中挑选 45 条志愿建议，并按概率和梯度排好顺序。
                </p>
              </div>
              <PlanBar label="冲" color="rush" value={40} />
              <PlanBar label="稳" color="safe" value={40} />
              <PlanBar label="保" color="stable" value={20} />
              <div className="h-px bg-border-subtle" />
              <Link
                href="/recommend"
                className="inline-flex items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary-light px-5 py-3 text-sm font-semibold text-white no-underline shadow-glow-primary transition-all duration-200 hover:-translate-y-px hover:shadow-glow-primary-lg"
              >
                查看完整推荐 →
              </Link>
            </div>
            <div className="flex flex-col gap-2">
              <div className="mb-1 text-[11px] uppercase tracking-[1.5px] text-text-muted">推荐前 6 条 · TOP 6 OF 45</div>
              {sampleRows.map((row) => (
                <div
                  key={row.order}
                  className={`grid grid-cols-[32px_44px_minmax(0,1fr)_auto_auto] items-center gap-3 rounded-lg border-l-[3px] bg-surface-high p-3 shadow-card ${
                    row.type === 'rush' ? 'border-l-rush' : row.type === 'safe' ? 'border-l-safe' : 'border-l-stable'
                  }`}
                >
                  <span className="font-mono text-xs text-text-faint">{row.order}</span>
                  <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary-fixed font-serif text-xl font-semibold text-primary">
                    {row.crest}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-[15px] font-medium text-text">
                      {row.name} <span className="rounded-full bg-elite-fixed px-2 py-0.5 text-[11px] font-medium text-elite">985</span>
                    </div>
                    <div className="mt-0.5 truncate text-xs text-text-tertiary">{row.major}</div>
                  </div>
                  <StatusPill type={row.type} />
                  <span className={`font-serif text-lg font-semibold tabular-nums ${
                    row.type === 'rush' ? 'text-rush' : row.type === 'safe' ? 'text-safe' : 'text-stable'
                  }`}>
                    {row.chance}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="bg-surface px-4 py-16 sm:px-6 sm:py-20 lg:px-12">
        <div className="mx-auto max-w-[1200px]">
          <SectionHeader eyebrow="数据底座 · TRUSTED FOUNDATIONS" title="让每一个数字，都来自真实历史" centered />
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="在川招生院校" value="2,237" sub="本科 1,508 · 专科 729" tone="primary" />
            <StatCard label="录取记录" value="144,082" sub="2022-2025 全口径" tone="accent" />
            <StatCard label="推荐方案匹配度" value="92%" sub="持续随数据模型校准" tone="safe" />
            <StatCard label={`距 ${currentYear} 高考`} value="动态" sub="由时间线接口计算" tone="rush" />
          </div>
        </div>
      </section>

      <section className="px-4 py-16 sm:px-6 sm:py-20 lg:px-12">
        <div className="mx-auto max-w-[1200px]">
          <SectionHeader eyebrow="填报流程 · APPLICATION TIMELINE" title="从今天到拿到通知书，这一年是这样走过来的。" centered>
            关键节点来自后端时间线接口；没有数据时使用设计稿默认流程展示。
          </SectionHeader>
          <div className="mt-10 space-y-5 md:hidden">
            {timelineItems.map((item) => (
              <div key={`${item.date}-${item.title}-mobile`} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div
                    className={`mt-1 h-3.5 w-3.5 rounded-full border-2 ${
                      item.tone === 'now'
                        ? 'border-accent bg-accent shadow-[0_0_0_6px_rgba(184,134,11,0.14)]'
                        : item.tone === 'key'
                          ? 'border-primary bg-primary'
                          : item.tone === 'done'
                            ? 'border-text-tertiary bg-text-tertiary'
                            : 'border-border bg-white'
                    }`}
                  />
                  <div className="mt-2 min-h-[72px] w-px flex-1 bg-border-subtle" />
                </div>
                <div className="min-w-0 pb-3">
                  <div className="font-serif text-[13px] font-semibold text-text-secondary tabular-nums">{item.date}</div>
                  <span
                    className={`mt-2 inline-block rounded px-2 py-0.5 text-[10px] font-medium uppercase tracking-[1.2px] ${
                      item.tone === 'now'
                        ? 'bg-accent/15 text-accent'
                        : item.tone === 'key'
                          ? 'bg-primary/10 text-primary'
                          : 'bg-surface-dim text-text-tertiary'
                    }`}
                  >
                    {item.label}
                  </span>
                  <h3 className="mt-2 font-serif text-[17px] font-semibold text-text">{item.title}</h3>
                  <p className="mt-1 text-[13px] leading-relaxed text-text-tertiary">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="relative mt-12 hidden pb-4 md:block">
            <div className="absolute left-0 right-0 top-[58px] hidden h-0.5 bg-[repeating-linear-gradient(90deg,#e8e6dc_0_6px,transparent_6px_12px)] md:block" />
            <div className="grid grid-cols-6 gap-0">
              {timelineItems.map((item) => (
                <div key={`${item.date}-${item.title}`} className="relative px-3">
                  <span className="mb-2 block font-serif text-[13px] font-semibold text-text-secondary tabular-nums">
                    {item.date}
                  </span>
                  <div
                    className={`relative z-10 mb-4 h-3.5 w-3.5 rounded-full border-2 ${
                      item.tone === 'now'
                        ? 'border-accent bg-accent shadow-[0_0_0_6px_rgba(184,134,11,0.18)]'
                        : item.tone === 'key'
                          ? 'border-primary bg-primary'
                          : item.tone === 'done'
                            ? 'border-text-tertiary bg-text-tertiary'
                            : 'border-border bg-white'
                    }`}
                  />
                  <span
                    className={`mb-2 inline-block rounded px-2 py-0.5 text-[10px] font-medium uppercase tracking-[1.2px] ${
                      item.tone === 'now'
                        ? 'bg-accent/15 text-accent'
                        : item.tone === 'key'
                          ? 'bg-primary/10 text-primary'
                          : 'bg-surface-dim text-text-tertiary'
                    }`}
                  >
                    {item.label}
                  </span>
                  <h3 className="font-serif text-[16px] font-semibold text-text">{item.title}</h3>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-text-tertiary">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-8 flex items-center gap-4 rounded-lg border border-border-subtle border-l-[3px] border-l-accent bg-surface p-5 text-[13px] text-text-secondary">
            <span className="text-xl">🔔</span>
            <div>
              每个关键节点提前提醒；出分后使用你的真实成绩重新计算冲稳保，帮助你在提交前完成最后一次梯度自检。
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 py-16 sm:px-6 sm:py-20 lg:px-12">
        <div className="mx-auto grid max-w-[1200px] gap-8 overflow-hidden rounded-[18px] bg-primary p-8 text-white sm:p-10 lg:grid-cols-[1.2fr_0.8fr] lg:p-14">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-[2px] text-accent-light">现在开始 · GET STARTED</div>
            <h2 className="mt-3 font-serif text-[30px] font-semibold leading-tight text-white sm:text-[38px]">
              把这一年的努力，
              <br />
              交给一份认真做的志愿表。
            </h2>
            <p className="mt-4 max-w-[620px] text-[16px] leading-relaxed text-white/75">
              免费注册即可使用 AI 智能推荐、4 年录取分数查询与志愿方案编辑器。无广告，无诱导消费。
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link href="/recommend" className="inline-flex items-center justify-center rounded-lg bg-accent px-7 py-3.5 text-[15px] font-semibold text-white no-underline shadow-glow-accent transition-all duration-200 hover:-translate-y-px hover:bg-accent-light">
                免费开始使用 →
              </Link>
              <Link href="/universities" className="inline-flex items-center justify-center rounded-lg border border-white/20 bg-white/10 px-7 py-3.5 text-[15px] font-medium text-white no-underline transition-all duration-200 hover:bg-white/20">
                查看院校库
              </Link>
            </div>
          </div>
          <div className="self-end text-left lg:text-right">
            <div className="text-[11px] uppercase tracking-[1.5px] text-white/50">已有 12,408 名 2026 届考生</div>
            <div className="mt-2 font-serif text-[40px] font-semibold leading-none text-white sm:text-[48px]">在使用智愿家</div>
            <div className="mt-4 text-[13px] text-white/50">来自全省 21 个市州 · 832 所中学</div>
          </div>
        </div>
      </section>
    </MainLayout>
  );
}

function SectionHeader({
  eyebrow,
  title,
  children,
  centered = false,
}: {
  eyebrow: string;
  title: string;
  children?: React.ReactNode;
  centered?: boolean;
}) {
  return (
    <div className={centered ? 'mx-auto max-w-[680px] text-center' : 'max-w-[680px]'}>
      <div className="text-[11px] font-medium uppercase tracking-[2px] text-accent">{eyebrow}</div>
      <h2 className="mt-2 font-serif text-[28px] font-semibold leading-tight text-text sm:text-[34px]">{title}</h2>
      {children && <p className="mt-3 text-[16px] leading-relaxed text-text-tertiary">{children}</p>}
    </div>
  );
}

function StatusPill({ type }: { type: string }) {
  const config = {
    rush: ['冲', 'bg-rush-fixed text-rush'],
    safe: ['稳', 'bg-safe-fixed text-safe'],
    stable: ['保', 'bg-stable-fixed text-stable'],
  }[type] ?? ['保', 'bg-stable-fixed text-stable'];

  return <span className={`rounded-full px-3 py-1 text-xs font-medium ${config[1]}`}>● {config[0]}</span>;
}

function PlanBar({ label, color, value }: { label: string; color: 'rush' | 'safe' | 'stable'; value: number }) {
  const colorClass = {
    rush: 'bg-rush text-rush',
    safe: 'bg-safe text-safe',
    stable: 'bg-stable text-stable',
  }[color];

  const [barClass, textClass] = colorClass.split(' ');

  return (
    <div className="grid grid-cols-[72px_1fr_54px] items-center gap-3">
      <span className={`inline-flex w-fit rounded-full px-3 py-1 text-xs font-medium ${color === 'rush' ? 'bg-rush-fixed text-rush' : color === 'safe' ? 'bg-safe-fixed text-safe' : 'bg-stable-fixed text-stable'}`}>
        ● {label}
      </span>
      <div className="h-2 overflow-hidden rounded-full bg-surface-dim">
        <div className={`h-full rounded-full ${barClass}`} style={{ width: `${value}%` }} />
      </div>
      <span className={`text-right font-serif text-sm font-semibold tabular-nums ${textClass}`}>{value}%</span>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone: 'primary' | 'accent' | 'safe' | 'rush';
}) {
  const toneClass = {
    primary: 'border-l-primary text-primary',
    accent: 'border-l-accent text-accent',
    safe: 'border-l-safe text-safe',
    rush: 'border-l-rush text-rush',
  }[tone];

  const [borderClass, textClass] = toneClass.split(' ');

  return (
    <div className={`rounded-lg border-l-[3px] ${borderClass} bg-surface-high p-5 shadow-card`}>
      <div className="text-[11px] uppercase tracking-[1.4px] text-text-muted">{label}</div>
      <div className={`mt-2 font-serif text-[30px] font-semibold leading-none tabular-nums ${textClass}`}>{value}</div>
      <div className="mt-2 text-[11px] text-text-muted">{sub}</div>
    </div>
  );
}
