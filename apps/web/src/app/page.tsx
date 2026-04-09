'use client';

import Link from 'next/link';
import MainLayout from '@/components/layout/MainLayout';

export default function HomePage() {
  return (
    <MainLayout noPadding>
      {/* Hero Section */}
      <section className="max-w-[1200px] mx-auto px-12 pt-[100px] pb-20">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          {/* Left Column */}
          <div>
            <div className="inline-flex items-center gap-1.5 bg-surface border border-border rounded-full px-4 py-1.5 text-xs text-text-muted mb-6">
              <span className="w-1.5 h-1.5 bg-safe rounded-full" />
              2026 高考数据已更新
            </div>
            <h1 className="font-serif text-[48px] font-bold leading-[1.12] tracking-tight text-text">
              每一个志愿，
              <br />
              都值得被<span className="text-primary">认真对待</span>。
            </h1>
            <p className="text-[17px] text-text-tertiary leading-relaxed mt-5 max-w-[480px]">
              智愿家基于 15 年录取大数据与 AI
              深度分析，为你构建专属的升学决策方案。不只是填表工具，更是你的升学智囊。
            </p>
            <div className="flex gap-3 mt-8">
              <Link
                href="/recommend"
                className="bg-gradient-to-br from-primary to-primary-light text-white px-7 py-3.5 rounded-[10px] text-[15px] font-medium shadow-glow-primary hover:shadow-glow-primary-lg hover:-translate-y-px transition-all duration-200 no-underline"
              >
                开始智能推荐
              </Link>
              <Link
                href="/universities"
                className="bg-surface text-text-secondary px-7 py-3.5 rounded-[10px] text-[15px] font-medium shadow-ring hover:shadow-card-hover transition-all duration-200 no-underline"
              >
                浏览全国院校
              </Link>
            </div>
          </div>

          {/* Right Column — Floating Data Cards */}
          <div className="relative h-[420px]">
            {/* Card 1: Match Summary */}
            <div className="absolute top-0 left-5 right-5 bg-surface rounded-xl p-5 shadow-card-hover border-l-[3px] border-primary">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-text-muted">为你匹配</div>
                  <div className="font-serif text-[32px] font-semibold text-primary tabular-nums">
                    48 所院校
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <span className="bg-rush/10 text-rush text-xs font-medium px-2.5 py-1 rounded-full">
                    冲12
                  </span>
                  <span className="bg-stable/10 text-stable text-xs font-medium px-2.5 py-1 rounded-full">
                    稳20
                  </span>
                  <span className="bg-safe/10 text-safe text-xs font-medium px-2.5 py-1 rounded-full">
                    保16
                  </span>
                </div>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden bg-border mt-4 flex">
                <div className="bg-rush h-full" style={{ width: '25%' }} />
                <div className="bg-stable h-full" style={{ width: '42%' }} />
                <div className="bg-safe h-full" style={{ width: '33%' }} />
              </div>
            </div>

            {/* Card 2: AI Accuracy */}
            <div className="absolute top-[160px] left-0 w-[52%] bg-surface rounded-xl p-5 shadow-card-hover">
              <div className="text-xs text-text-muted">AI 精准度</div>
              <div className="font-serif text-[32px] font-semibold text-accent tabular-nums">
                99.8%
              </div>
              <div className="text-xs text-text-muted mt-1">历年预测准确率</div>
            </div>

            {/* Card 3: Families Served */}
            <div className="absolute top-[160px] right-0 w-[44%] bg-surface rounded-xl p-5 shadow-card-hover">
              <div className="text-xs text-text-muted">已服务家庭</div>
              <div className="font-serif text-[32px] font-semibold text-text tabular-nums">
                125万+
              </div>
              <div className="text-xs text-text-muted mt-1">覆盖全国 31 省份</div>
            </div>
          </div>
        </div>
      </section>

      {/* Trust Bar */}
      <section className="max-w-[1200px] mx-auto px-12 pb-20 flex justify-center gap-12">
        {[
          { value: '2,800+', label: '全国院校' },
          { value: '1,200+', label: '专业覆盖' },
          { value: '15 年', label: '录取数据纵深' },
          { value: '1,250 万', label: '已生成方案' },
        ].map((item, i) => (
          <div key={i}>
            <div className="font-serif text-[28px] font-semibold text-primary tabular-nums text-center">
              {item.value}
            </div>
            <div className="text-[13px] text-text-muted mt-1 text-center">
              {item.label}
            </div>
          </div>
        ))}
      </section>

      {/* Features Section */}
      <section className="bg-surface-dim py-20 px-12">
        <div className="max-w-[1200px] mx-auto">
          <div className="text-[11px] uppercase tracking-[2px] text-accent font-medium">
            核心能力
          </div>
          <h2 className="font-serif text-[36px] font-semibold text-text mt-2.5">
            用数据照亮每一步抉择
          </h2>
          <p className="text-[15px] text-text-tertiary mt-3 max-w-[560px] leading-relaxed">
            从院校全景到专业深度、从智能推荐到趋势洞察，六大核心模块覆盖升学决策的每一个关键环节。
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mt-10">
            {[
              {
                icon: '🏛',
                bg: 'bg-primary-fixed',
                title: '院校全景',
                desc: '覆盖全国 2,800+ 院校，多维度数据横向对比，助你快速锁定目标。',
              },
              {
                icon: '📊',
                bg: 'bg-safe-fixed',
                title: '专业洞察',
                desc: '1,200+ 专业的就业前景、薪资走势与发展空间，看清每一条赛道。',
              },
              {
                icon: '✨',
                bg: 'bg-accent-fixed',
                title: 'AI 智能推荐',
                desc: '深度分析 15 年录取数据，结合你的分数与偏好，生成个性化冲/稳/保方案。',
              },
              {
                icon: '📈',
                bg: 'bg-rush-fixed',
                title: '趋势分析',
                desc: '录取分数线走势、报考热度变化、专业冷热轮动，数据驱动前瞻决策。',
              },
              {
                icon: '📋',
                bg: 'bg-stable-fixed',
                title: '方案管理',
                desc: '对比、调整、优化你的志愿组合，一键导出完整方案，填报时胸有成竹。',
              },
              {
                icon: '🔒',
                bg: 'bg-surface-dim',
                title: '隐私优先',
                desc: '企业级数据加密，你的个人信息与成绩数据始终在严格保护之中。',
              },
            ].map((card, i) => (
              <div
                key={i}
                className="bg-surface rounded-xl p-7 hover:shadow-card-hover transition-shadow duration-300 cursor-pointer"
              >
                <div
                  className={`w-11 h-11 rounded-[10px] ${card.bg} flex items-center justify-center text-xl`}
                >
                  {card.icon}
                </div>
                <h3 className="font-serif text-[19px] font-semibold text-text mt-4">
                  {card.title}
                </h3>
                <p className="text-sm text-text-tertiary mt-2 leading-relaxed">
                  {card.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="max-w-[1200px] mx-auto px-12 py-20">
        <div className="text-[11px] uppercase tracking-[2px] text-accent font-medium">
          使用流程
        </div>
        <h2 className="font-serif text-[36px] font-semibold text-text mt-2.5">
          三步，从迷茫到从容
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-12">
          {[
            {
              num: '01',
              title: '输入你的成绩',
              desc: '填写高考分数、位次、所在省份。支持一分一段表精确定位。',
            },
            {
              num: '02',
              title: 'AI 生成方案',
              desc: '智能引擎分析 15 年录取数据，结合你的偏好生成个性化冲/稳/保方案。',
            },
            {
              num: '03',
              title: '优化并导出',
              desc: '调整、比较、确认。导出最终方案，胸有成竹走进填报系统。',
            },
          ].map((step, i) => (
            <div key={i}>
              <div className="font-serif text-[64px] font-bold text-border leading-none">
                {step.num}
              </div>
              <h3 className="font-serif text-xl font-semibold text-text mt-3">
                {step.title}
              </h3>
              <p className="text-sm text-text-tertiary mt-2 leading-relaxed">
                {step.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-primary py-20 px-12 text-center">
        <h2 className="font-serif text-[36px] font-semibold text-white">
          你的未来，值得一份好方案
        </h2>
        <p className="text-base text-white/70 mt-3">
          智愿家与你一起，认真对待每一个选择
        </p>
        <Link
          href="/recommend"
          className="bg-accent text-white px-9 py-4 rounded-[10px] text-base font-medium shadow-glow-accent hover:-translate-y-px transition-all duration-200 mt-7 inline-block no-underline"
        >
          免费开始使用
        </Link>
      </section>
    </MainLayout>
  );
}
