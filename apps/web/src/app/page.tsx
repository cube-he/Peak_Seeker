'use client';

import { Fragment } from 'react';
import Link from 'next/link';
import MainLayout from '@/components/layout/MainLayout';
import HomeTimelineCard from '@/components/home/HomeTimelineCard';
import HeroStats from '@/components/home/HeroStats';
import { useHomeMotion } from '@/components/home/useHomeMotion';
import './homepage.css';

// 产品能力区 — 三步流程
const flowSteps = [
  { n: '01', t: '查分定位' },
  { n: '02', t: '研究院校与专业' },
  { n: '03', t: 'AI 推荐并打磨志愿表' },
];

// 方案示例区 — 冲/稳/保分布(示例常量)
const sampleDist = [
  { type: 'rush', name: '冲 · 反向尝试', desc: '概率较低', cnt: 12 },
  { type: 'safe', name: '稳 · 对位匹配', desc: '概率适中', cnt: 20 },
  { type: 'stable', name: '保 · 兜底安全', desc: '概率较高', cnt: 13 },
] as const;

// 方案示例区 — 示例志愿行(示例常量)
const sampleRows = [
  {
    tier: 'rush' as const,
    tierLabel: '冲',
    crestTone: 'tone-blue',
    crest: '同',
    name: '同济大学',
    tags: [
      { text: '985', elite: true, stable: false },
      { text: '211', elite: true, stable: false },
      { text: '双一流', elite: false, stable: false },
    ],
    major: '土木类',
    majorSub: '含土木工程 · 测绘 · 交通',
    score: '632',
    scoreSub: '2024 · 物理类',
    prob: 28,
  },
  {
    tier: 'safe' as const,
    tierLabel: '稳',
    crestTone: 'tone-amber',
    crest: '西',
    name: '西南交通大学',
    tags: [
      { text: '211', elite: true },
      { text: '双一流', elite: false },
      { text: '川内', elite: false, stable: true },
    ],
    major: '交通运输类',
    majorSub: '含交通运输 · 铁道工程',
    score: '618',
    scoreSub: '2024 · 物理类',
    prob: 62,
  },
  {
    tier: 'stable' as const,
    tierLabel: '保',
    crestTone: 'tone-green',
    crest: '西',
    name: '西南财经大学',
    tags: [
      { text: '211', elite: true },
      { text: '双一流', elite: false },
      { text: '川内', elite: false, stable: true },
    ],
    major: '金融学类',
    majorSub: '含金融 · 投资学 · 保险',
    score: '609',
    scoreSub: '2024 · 物理类',
    prob: 88,
  },
];

export default function HomePage() {
  // 滚动动效:reveal / 冲稳保 count-up / 进度条填充 / AI 卡片光晕
  // 完整复刻 landing.html 的内联 script(Hero 4 统计的 count-up 由 HeroStats 自管)
  useHomeMotion();

  return (
    <MainLayout noPadding hideMobileBottomNav>
      {/* ============================================================
          SECTION 1 · HERO
          ============================================================ */}
      <section className="hero">
        <div className="hero-bg" aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/bg-hero-campus-distant.webp" alt="" />
        </div>

        <div className="container hero-grid">
          {/* LEFT */}
          <div>
            <span className="eyebrow-pill">
              <span className="dot" />
              为四川考生而生 · For Sichuan Gaokao
            </span>

            <h1 className="hero-h1">
              <span className="line">
                <span className="lead-char">智</span>
                <span className="rest">
                  者明察<span className="pause" />洞见四方
                </span>
              </span>
              <span className="line">
                <span className="lead-char">愿</span>
                <span className="rest">
                  展宏图<span className="pause" />扶摇直上
                </span>
              </span>
              <span className="line">
                <span className="lead-char">家</span>
                <span className="rest">
                  有良师<span className="pause" />伴你远航
                </span>
              </span>
            </h1>

            <p className="hero-sub">
              汇集 <span className="em-num">2022–2025</span> 四年四川在川招生录取真实数据，结合 AI 推荐引擎，
              帮你把分数和位次准确转换成一份冲、稳、保都站得住脚的志愿方案——专业可信，温暖陪伴。
            </p>

            <div className="hero-cta">
              <Link className="btn btn-primary" href="/login">
                免费开始智能推荐<span className="arrow">→</span>
              </Link>
              <Link className="btn btn-secondary" href="/universities">
                浏览在川招生院校
              </Link>
            </div>

            {/* 4 统计 — 接 GET /stats/homepage,数字 count-up 到真实值 */}
            <HeroStats />
          </div>

          {/* RIGHT — Countdown + Timeline card */}
          <HomeTimelineCard />
        </div>
      </section>

      {/* ============================================================
          SECTION 2 · CAPABILITY (flow + 5 entries)
          ============================================================ */}
      <section className="sec tone-dim" id="capability">
        <div className="container">
          <div className="sec-head" data-reveal>
            <span className="eyebrow-pill">
              <span className="dot" />
              产品能力
            </span>
            <h2>从查分到方案落地，一条主线走到底</h2>
            <p className="lead">不堆功能，只把志愿填报真正用得到的工具，按顺序排好。</p>
          </div>

          {/* Flow line */}
          <div className="flow" role="list" data-reveal>
            {flowSteps.map((step, index) => (
              <Fragment key={step.n}>
                <div className="flow-step" role="listitem">
                  <div className="n">{step.n}</div>
                  <div className="t">{step.t}</div>
                </div>
                {index < flowSteps.length - 1 && <div className="flow-arrow">→</div>}
              </Fragment>
            ))}
          </div>

          {/* 5 capability cards */}
          <div className="cap-grid" data-reveal-stagger>
            <Link className="cap-card c1" href="/universities">
              <div className="cap-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 9.5 12 4l9 5.5" />
                  <path d="M5 10v9h14v-9" />
                  <path d="M9 19v-5h6v5" />
                </svg>
              </div>
              <div className="ttl">院校库</div>
              <div className="desc">2,237 所在川招生院校，多维度筛选、对比与历年录取深读。</div>
              <span className="lk">进入院校库 →</span>
            </Link>

            <Link className="cap-card c2" href="/majors">
              <div className="cap-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 19V6a2 2 0 0 1 2-2h11l3 3v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z" />
                  <path d="M8 8h7" />
                  <path d="M8 12h7" />
                  <path d="M8 16h5" />
                </svg>
              </div>
              <div className="ttl">专业库</div>
              <div className="desc">1,434 个专业的方向、课程、就业去向，从此不再&ldquo;望名生义&rdquo;。</div>
              <span className="lk">进入专业库 →</span>
            </Link>

            <Link className="cap-card c3" href="/scores">
              <div className="cap-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 20V10" />
                  <path d="M10 20V4" />
                  <path d="M16 20v-7" />
                  <path d="M22 20H2" />
                </svg>
              </div>
              <div className="ttl">查分系统</div>
              <div className="desc">输入分数与位次，立刻转换为四年纵向对照与等位分映射。</div>
              <span className="lk">进入查分 →</span>
            </Link>

            <Link className="cap-card c4 featured" href="/recommend">
              <div className="cap-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 3v3" />
                  <path d="M5.6 5.6 7.7 7.7" />
                  <path d="M3 12h3" />
                  <path d="M5.6 18.4 7.7 16.3" />
                  <path d="M12 21v-3" />
                  <path d="M18.4 18.4 16.3 16.3" />
                  <path d="M21 12h-3" />
                  <path d="M18.4 5.6 16.3 7.7" />
                  <circle cx="12" cy="12" r="3.2" />
                </svg>
              </div>
              <div className="ttl">AI 推荐</div>
              <div className="desc">
                读完你的分数、位次、偏好，从 14.4 万条录取记录里反推合理的冲 / 稳 / 保梯度，给出一份初步志愿方案——这是这个产品真正在做的事。
              </div>
              <span className="lk">进入推荐 →</span>
            </Link>

            <Link className="cap-card c5" href="/plan">
              <div className="cap-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 4h12l4 4v12a0 0 0 0 1 0 0H4Z" />
                  <path d="M16 4v4h4" />
                  <path d="M8 13l3 3 5-5" />
                </svg>
              </div>
              <div className="ttl">方案编辑器</div>
              <div className="desc">逐条编辑、对比、备注、保存，最终一键导出报考用清单。</div>
              <span className="lk">进入方案 →</span>
            </Link>
          </div>
        </div>
      </section>

      {/* ============================================================
          SECTION 3 · SAMPLE PLAN
          ============================================================ */}
      <section className="sec sample-section" id="sample">
        <div className="container">
          <div className="sec-head" data-reveal>
            <span className="eyebrow-pill">
              <span className="dot" />
              方案示例
            </span>
            <h2>一份志愿方案长什么样</h2>
            <p className="lead">下面是智愿家为示例考生生成的方案样式——结构、信息密度、决策线索一目了然。</p>
          </div>

          <div className="sample-disclaim" data-reveal>
            <span className="badge">示例 Demo</span>
            <span>
              以下为示例演示，注册后将基于<strong>你的真实分数和偏好</strong>生成。
            </span>
          </div>

          <div className="sample-frame" data-reveal>
            {/* Sample student head */}
            <div className="sample-head">
              <div>
                <div className="l">Sample Candidate · 示例考生</div>
                <h3>2025 物理类 · 选考 物 + 化 + 生</h3>
              </div>
              <div className="r">
                <div className="stat">
                  <div className="v">628</div>
                  <div className="k">总分(示例)</div>
                </div>
                <div className="stat">
                  <div className="v">12,500</div>
                  <div className="k">省内位次(示例)</div>
                </div>
                <div className="stat">
                  <div className="v">本科批</div>
                  <div className="k">志愿批次</div>
                </div>
              </div>
            </div>

            {/* 冲 / 稳 / 保 distribution — 数字 count-up,由 useHomeMotion 驱动 */}
            <div className="sample-dist" data-anim-dist>
              {sampleDist.map((cell) => (
                <div key={cell.type} className={`dist-cell ${cell.type}`}>
                  <div className="lhs">
                    <span className="pip" />
                    <span className="name">{cell.name}</span>
                  </div>
                  <span className="desc">{cell.desc}</span>
                  {/* 初值 0,data-target 为终值;进入视口后 tween 到终值 */}
                  <span className="cnt" data-target={cell.cnt}>
                    0
                  </span>
                </div>
              ))}
            </div>

            {/* Table head */}
            <div className="plan-thead">
              <div />
              <div>院校 · 标签</div>
              <div>专业方向</div>
              <div>近年最低分(示例)</div>
              <div className="ra">录取概率(示例)</div>
            </div>

            {/* Sample rows: 3 rows, 冲 / 稳 / 保 */}
            <div className="sample-table">
              {sampleRows.map((row) => (
                <div className="plan-row" key={row.name}>
                  <div className={`tier-mark ${row.tier}`}>{row.tierLabel}</div>
                  <div className="school">
                    <div className={`crest-fb ${row.crestTone}`}>{row.crest}</div>
                    <div className="meta">
                      <div className="name">{row.name}</div>
                      <div className="tags">
                        {row.tags.map((tag) => (
                          <span
                            key={tag.text}
                            className={`pill${tag.elite ? ' elite' : ''}${tag.stable ? ' stable' : ''}`}
                          >
                            {tag.text}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="major-cell">
                    <div className="nm">{row.major}</div>
                    <div className="sb">{row.majorSub}</div>
                  </div>
                  <div className="scoreyr">
                    {row.score} <span className="sb">{row.scoreSub}</span>
                  </div>
                  <div className={`prob ${row.tier}`}>
                    <div className="v">{row.prob}%</div>
                    <div className="bar">
                      {/* 初始 width 0%,data-target 为终值;由 useHomeMotion 填充 */}
                      <div
                        className="fill"
                        data-bar-fill
                        data-target={row.prob}
                        style={{ width: '0%' }}
                      />
                    </div>
                    <span className="sb">示例</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="sample-foot">
              <div>共展示 3 条示例；完整方案通常 40—50 条，按 冲 / 稳 / 保 分层排序。</div>
              <Link href="/login">用我的分数生成 →</Link>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================
          SECTION 4 · END CTA
          ============================================================ */}
      <section className="cta">
        <div className="cta-bg" aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/bg-cta-campus-approach.webp" alt="" />
        </div>

        <div className="container cta-inner">
          <span className="eyebrow-pill">
            <span className="dot" />
            开始你的志愿方案
          </span>
          <h2>
            认真对待每一个选择，
            <br />
            我们陪你一起。
          </h2>
          <p className="lead">
            注册后即可输入你的分数与偏好，几分钟得到一份基于真实录取数据的初步志愿方案。
          </p>
          <div className="cta-buttons">
            <Link className="btn btn-primary" href="/login">
              免费开始智能推荐<span className="arrow">→</span>
            </Link>
            <Link className="btn btn-secondary" href="/universities">
              先浏览院校
            </Link>
          </div>
          <div className="cta-promises">
            <span className="pp">免费注册</span>
            <span className="pp">无广告</span>
            <span className="pp">无诱导消费</span>
          </div>
        </div>
      </section>

      {/* ============================================================
          SECTION 5 · SOURCE STRIP
          ============================================================ */}
      <footer className="sources">
        <div className="container sources-inner">
          <span className="label">Data Sources · 数据来源</span>
          <a href="https://www.sceea.cn" target="_blank" rel="noopener noreferrer">
            四川省教育考试院
          </a>
          <span className="sep">·</span>
          <a href="https://gaokao.chsi.com.cn" target="_blank" rel="noopener noreferrer">
            阳光高考信息平台
          </a>
          <span className="sep">·</span>
          <span>各高校招生办</span>
          <span className="sep">·</span>
          <span>2022—2025 录取年报</span>
        </div>
      </footer>
    </MainLayout>
  );
}
