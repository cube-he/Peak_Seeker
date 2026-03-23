'use client';

import {
  ArrowRightOutlined,
  BankOutlined,
  BookOutlined,
  BulbOutlined,
  FileTextOutlined,
  SafetyCertificateOutlined,
  DatabaseOutlined,
} from '@ant-design/icons';
import Link from 'next/link';
import MainLayout from '@/components/layout/MainLayout';
import GradientButton from '@/components/ui/GradientButton';

const features = [
  {
    icon: <BankOutlined className="text-2xl" />,
    title: '大学查询',
    description: '覆盖 2,800+ 所高校的详尽数据库，综合多维度指标与横向评估。',
    link: '/universities',
    accent: 'border-l-primary',
    iconBg: 'bg-primary-fixed',
    iconColor: 'text-primary',
  },
  {
    icon: <BookOutlined className="text-2xl" />,
    title: '专业库查询',
    description: '深入解析 1,200 多个学科的职业走向与就业前景及发展趋势。',
    link: '/majors',
    accent: 'border-l-secondary',
    iconBg: 'bg-secondary-fixed',
    iconColor: 'text-secondary',
  },
  {
    icon: <BulbOutlined className="text-2xl" />,
    title: '智能推荐',
    description: '基于大数据结合历史录取概率分析，精准匹配冲稳保最佳方案。',
    link: '/recommend',
    accent: 'border-l-tertiary',
    iconBg: 'bg-tertiary-fixed',
    iconColor: 'text-tertiary',
  },
  {
    icon: <FileTextOutlined className="text-2xl" />,
    title: '志愿填报方案',
    description: '针对不同科目的填报策略，自动生成冲稳保优化志愿组合，直逼录取率。',
    link: '/plan',
    accent: 'border-l-primary',
    iconBg: 'bg-primary-fixed',
    iconColor: 'text-primary',
  },
];

const stats = [
  { value: '2,800+', label: '覆盖院校' },
  { value: '1,200+', label: '覆盖专业' },
  { value: '15+', label: '历年数据研究' },
  { value: '1,250万', label: '生成方案数' },
];

const methodology = [
  {
    num: '01',
    title: '官方权威同步',
    description: '直接与各省教育考试院及高校招生办同步，确保招生政策与志愿的实时性准确性。',
  },
  {
    num: '02',
    title: '长周期趋势分析',
    description: '我们的 AI 模型综合考量人口结构变化及科技前沿趋势，涵盖 15 年维度的纵向预测。',
  },
  {
    num: '03',
    title: '隐私优先承诺',
    description: '企业级加密技术确保学生个人信息在参与智能量化分析时，始终处于严格保护之中。',
  },
];

export default function HomePage() {
  return (
    <MainLayout noPadding>
      {/* Hero Section */}
      <section className="relative min-h-[600px] lg:min-h-[700px] flex items-center">
        <div className="w-full max-w-[1920px] mx-auto px-6 lg:px-16 py-20">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold mb-8 bg-secondary-fixed text-on-secondary-fixed-variant">
              <BulbOutlined /> AI 驱动的升学智能引擎
            </div>
            <h1 className="font-headline font-extrabold text-5xl lg:text-7xl text-on-surface leading-tight mb-6">
              睿智抉择，
              <br />
              <span className="text-primary">定鼎未来。</span>
            </h1>
            <p className="text-on-surface-variant text-lg leading-relaxed mb-10 max-w-lg">
              1000万+ 家庭的共同选择。依托顶尖 AI 数据建模，以 99.8% 的极高精度预判大学录取概率。
            </p>
            <div className="flex flex-wrap gap-4">
              <Link href="/recommend">
                <GradientButton size="large" icon={<ArrowRightOutlined />}>
                  开始智能推荐
                </GradientButton>
              </Link>
              <Link href="/universities">
                <GradientButton size="large" variant="secondary">
                  浏览全国院校
                </GradientButton>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Features Bento Grid */}
      <section className="bg-surface-container-low py-20 lg:py-24">
        <div className="max-w-[1920px] mx-auto px-6 lg:px-16">
          <h2 className="font-headline font-extrabold text-2xl lg:text-3xl text-on-surface mb-3">
            全维度决策情报站
          </h2>
          <p className="text-on-surface-variant text-base mb-12 max-w-xl">
            我们的核心引擎提供四层深度分析，确保您的学术路径在每一个环节都得到最优化。
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feat, i) => (
              <Link key={i} href={feat.link} className="no-underline group">
                <div
                  className={`bg-surface-container-lowest rounded-xl p-8 border-l-[3px] ${feat.accent} transition-all duration-300 hover:shadow-ambient hover:translate-y-[-4px] h-full`}
                >
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-6 ${feat.iconBg} ${feat.iconColor}`}>
                    {feat.icon}
                  </div>
                  <h3 className="font-headline font-bold text-base text-on-surface mb-2">
                    {feat.title}
                  </h3>
                  <p className="text-sm text-on-surface-variant leading-relaxed mb-4">
                    {feat.description}
                  </p>
                  <span className="text-sm font-semibold text-primary inline-flex items-center gap-1 group-hover:gap-2 transition-all">
                    了解更多 <ArrowRightOutlined className="text-xs" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Social Proof - Dark Card */}
      <section className="py-20 lg:py-24">
        <div className="max-w-[1920px] mx-auto px-6 lg:px-16">
          <div className="bg-inverse-surface rounded-3xl p-10 lg:p-16">
            <h3 className="font-headline font-extrabold text-xl text-inverse-on-surface mb-2">
              卓越规模
            </h3>
            <p className="text-inverse-on-surface/60 text-sm mb-10 max-w-lg">
              我们的数据引擎处理海量数据点，只为给每一个体带来确定性的答案。
            </p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
              {stats.map((stat, i) => (
                <div key={i}>
                  <div className="text-3xl lg:text-4xl font-headline font-extrabold text-secondary-fixed mb-1">
                    {stat.value}
                  </div>
                  <div className="text-xs uppercase tracking-widest text-inverse-on-surface/50 font-label">
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Methodology Section */}
      <section className="bg-surface-container-low py-20 lg:py-24">
        <div className="max-w-[1920px] mx-auto px-6 lg:px-16">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            {/* Left - Image Placeholder */}
            <div className="bg-surface-container rounded-3xl aspect-[4/3] flex items-center justify-center">
              <div className="text-center">
                <DatabaseOutlined className="text-5xl text-primary/20 mb-4" />
                <p className="text-on-surface-variant text-sm">数据分析引擎</p>
              </div>
            </div>

            {/* Right - Steps */}
            <div>
              <h2 className="font-headline font-extrabold text-2xl lg:text-3xl text-on-surface mb-3">
                数据来源与算法机制
              </h2>
              <p className="text-on-surface-variant text-base mb-10">
                透明、可靠、可追溯的数据基础设施
              </p>
              <div className="space-y-8">
                {methodology.map((step, i) => (
                  <div key={i} className="flex items-start gap-5">
                    <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                      <span className="text-white font-headline font-bold text-sm">{step.num}</span>
                    </div>
                    <div>
                      <h4 className="font-semibold text-on-surface mb-1">{step.title}</h4>
                      <p className="text-sm text-on-surface-variant leading-relaxed">{step.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 lg:py-24">
        <div className="max-w-[1920px] mx-auto px-6 lg:px-16">
          <div className="bg-surface-container-low rounded-3xl p-10 lg:p-16 text-center">
            <h2 className="font-headline font-extrabold text-3xl lg:text-4xl text-on-surface mb-4">
              开启你的卓越未来
            </h2>
            <p className="text-on-surface-variant text-base mb-8 max-w-md mx-auto">
              加入万千学子的行列，通过巅峰智选锁定理想学府的入场券。
            </p>
            <Link href="/recommend">
              <GradientButton size="large" icon={<SafetyCertificateOutlined />}>
                开启成功方案
              </GradientButton>
            </Link>
          </div>
        </div>
      </section>
    </MainLayout>
  );
}
