'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { Spin } from 'antd';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import MainLayout from '@/components/layout/MainLayout';
import { universityService } from '@/services/university';
import UniversityLogo from '@/components/university/UniversityLogo';
import CharterCard from '@/components/university/CharterCard';
import CampusLocationTab from '@/components/university/campus-location/CampusLocationTab';
import QiangjiTable from '@/components/university/QiangjiTable';
import AdmissionDetailTab from '@/components/university/admission-detail/AdmissionDetailTab';
import { useUserStore } from '@/stores/userStore';
import { useStudentRank } from '@/stores/studentRankStore';
import { LocIcon, BankIcon, TrophyIcon, ChartIcon, BookmarkIcon, ArrowIcon } from '../components/shared/Icon';
import { tierImageFor } from '../lib/tier';
import { TrendBanner } from './components/TrendBanner';
import '../styles.css';

type TabKey = 'info' | 'admission' | 'majors' | 'campus';

export default function UniversityDetailPage() {
  const params = useParams();
  const id = Number(params.id);

  const { examInfo } = useUserStore();
  const examType = useStudentRank((s) => s.examType);
  const studentRank = useStudentRank((s) => s.rank);
  const userSubject = examInfo.subjects?.[0] ?? examType;
  const [tab, setTab] = useState<TabKey>('info');
  const [descExpanded, setDescExpanded] = useState(false);

  const { data: university, isLoading } = useQuery({
    queryKey: ['university', id, userSubject],
    queryFn: () => universityService.getById(id, userSubject),
    enabled: !!id,
  });

  const { data: admissions } = useQuery({
    queryKey: ['university-admissions', id],
    queryFn: () => universityService.getAdmissions(id),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <MainLayout noPadding>
        <div style={{ padding: 60, display: 'flex', justifyContent: 'center' }}>
          <Spin size="large" />
        </div>
      </MainLayout>
    );
  }

  if (!university) {
    return (
      <MainLayout noPadding>
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)' }}>
          院校不存在
        </div>
      </MainLayout>
    );
  }

  const u = university;
  const latestAdmission = u.admissionRecords?.[0] ?? admissions?.[0] ?? null;

  // 5 档梯队 → hero data-tier + bg image
  const tierImg = tierImageFor({
    is985: u.is985,
    is211: u.is211,
    isDoubleFirstClass: u.isDoubleFirstClass,
    softRanking: u.softRanking,
    softRankList: u.softRankList,
    level: u.level,
    nature: u.runningNature,
  });

  // hit-card:命中率(后端提供 bestPrediction.acceptRate)+ 用户位次
  const acceptRate = u.bestPrediction?.acceptRate ?? null;
  const uniMinRank =
    examType === '历史' ? u.minRankHistory ?? null : u.minRankPhysics ?? null;
  const rankDiff = studentRank != null && uniMinRank != null ? uniMinRank - studentRank : null;

  // 描述段落拆分
  const description = (u.description as string | null | undefined) ?? null;
  const website = (u.website as string | null | undefined) ?? null;
  const paras = description
    ? description.split(/[　\s]{2,}/).map((s) => s.trim()).filter(Boolean)
    : [];
  const truncated = description != null && description.length < 500 && !/[。！？.!?]$/.test(description.trim());

  return (
    <MainLayout noPadding>
      {/* ===========================
           HERO — full bleed 深 navy + tier 背景图
           =========================== */}
      <section className="dt-hero" data-tier={tierImg.id}>
        <div className="dt-hero-bg" aria-hidden="true">
          <img src={tierImg.src} alt="" />
        </div>
        <div className="dt-hero-inner">
          <UniversityLogo name={u.name} logoUrl={u.logoUrl} size={80} className="uni-logo" />
          <div style={{ minWidth: 0 }}>
            <nav className="dt-crumb">
              <Link href="/universities">院校库</Link>
              <span className="sep">/</span>
              <span>{u.name}</span>
            </nav>
            <div className="dt-eyebrow">院校代码 · {u.code || u.id} · 在川招生</div>
            <h1>{u.name}</h1>
            <div className="loc">
              <LocIcon />
              <span>{[u.province, u.city, u.type, u.level, u.runningNature].filter(Boolean).join(' · ')}</span>
            </div>
            <div className="badges">
              {u.is985 && <span className="tag gold">985 工程</span>}
              {u.is211 && <span className="tag">211 工程</span>}
              {u.isDoubleFirstClass && <span className="tag">双一流</span>}
              {u.type && <span className="tag">{u.type}</span>}
              {u.runningNature && <span className="tag">{u.runningNature}</span>}
            </div>
          </div>
          <div className="hit-card">
            <div className="k">
              基于你的位次 {studentRank != null ? ` · ${studentRank.toLocaleString()} 名` : ''}
            </div>
            <div className="pct">
              {acceptRate != null ? Math.round(acceptRate * 100) : '— —'}
              {acceptRate != null && <span className="pct-tail">%</span>}
            </div>
            {rankDiff != null && acceptRate != null && (
              <div className="verdict">
                你比录取线 {rankDiff > 0 ? '↑' : rankDiff < 0 ? '↓' : '·'}{' '}
                <span className="em">{Math.abs(rankDiff).toLocaleString()}</span> 名
              </div>
            )}
            <div className="sub">
              {acceptRate != null ? '基于最近三年录取趋势 · 仅供参考' : '录入位次后生成个性化预测'}
            </div>
            <div className="actions">
              <button type="button" className="btn outline">
                <BookmarkIcon /> 收藏
              </button>
              <button type="button" className="btn primary">
                加入方案 <ArrowIcon />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ===========================
           Stats strip — 6 列(核心 3 大字 + 辅助 3 小字)
           =========================== */}
      <section className="dt-stats">
        <div className="dt-stats-inner">
          {[
            {
              k: '最近最低分',
              v:
                latestAdmission?.minScore ?? latestAdmission?.majorMinScore != null ? (
                  <span className="em">
                    {latestAdmission?.minScore ?? latestAdmission?.majorMinScore}
                  </span>
                ) : (
                  '—'
                ),
              s: latestAdmission?.year ? `${latestAdmission.year} · ${examType}类` : '等待录取数据',
              core: true,
            },
            {
              k: '最近最低位次',
              v: latestAdmission?.minRank ?? latestAdmission?.majorMinRank
                ? (latestAdmission.minRank ?? latestAdmission.majorMinRank).toLocaleString()
                : '—',
              s: `${examType}类参考`,
              core: true,
            },
            {
              k: '软科排名',
              v:
                u.softRanking != null ? (
                  <span className="em">#{u.softRanking}</span>
                ) : (
                  '—'
                ),
              s:
                u.softRanking != null
                  ? `软科 ${u.softRankYear ?? ''} ${u.softRankList ?? ''}榜`.trim()
                  : '尚无软科数据',
              core: true,
            },
            {
              k: '院校代码',
              v: u.code || '—',
              s: u.department || '主管部门待补充',
            },
            {
              k: '招生专业',
              v: u.masterProgramCount != null ? String(u.masterProgramCount) : '—',
              s: '一级学科硕士点',
            },
            {
              k: '建校时间',
              v: u.createdYear ? String(u.createdYear) : '—',
              s: u.campusArea ? `校园面积 ${u.campusArea.toLocaleString()} 亩` : '基础信息',
            },
          ].map((it, i) => (
            <div key={i} className={`cell ${it.core ? 'core' : 'aux'}`}>
              <div className="k">{it.k}</div>
              <div className="v">{it.v}</div>
              <div className="sub">{it.s}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ===========================
           Trend banner — 录取走势主角卡
           =========================== */}
      {(admissions?.length ?? 0) > 0 && (
        <div style={{ maxWidth: 1500, margin: '0 auto', padding: '24px 32px 0' }}>
          <TrendBanner
            admissions={admissions ?? []}
            studentRank={studentRank ?? null}
            defaultSubject={examType}
          />
        </div>
      )}

      {/* ===========================
           Sticky subnav
           =========================== */}
      <nav className="dt-subnav">
        <div className="dt-subnav-inner">
          {(
            [
              ['info', '概览'],
              ['admission', '招录详情'],
              ['majors', '热门专业'],
              ['campus', '校区与生活'],
            ] as const
          ).map(([k, l]) => (
            <button
              key={k}
              type="button"
              className={tab === k ? 'is-active' : ''}
              onClick={() => {
                setTab(k);
                document.getElementById('dt-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
            >
              {l}
            </button>
          ))}
        </div>
      </nav>

      {/* ===========================
           Body
           =========================== */}
      <div className="dt-body" id="dt-section">
        {description && (
          <section
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 14,
              padding: 24,
              marginBottom: 24,
            }}
          >
            <div className="eyebrow" style={{ fontSize: 11, letterSpacing: 2, color: 'var(--accent)' }}>
              Overview · 院校概览
            </div>
            <h2 style={{ margin: '8px 0 12px', fontFamily: 'var(--font-heading)', fontSize: 22, fontWeight: 600 }}>
              {u.name} 的核心信息
            </h2>
            <button
              type="button"
              onClick={() => setDescExpanded((v) => !v)}
              style={{
                background: 'transparent',
                border: 0,
                padding: 0,
                color: 'var(--primary)',
                fontSize: 13,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              {descExpanded ? '▾ 收起院校简介' : '▸ 展开院校简介'}
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 400 }}>
                ({description.length} 字)
              </span>
            </button>
            {descExpanded && (
              <>
                <div style={{ marginTop: 12 }}>
                  {paras.map((p, i) => (
                    <p key={i} style={{ margin: '0 0 12px', fontSize: 14, lineHeight: 1.85, color: 'var(--text-tertiary)', textIndent: '2em' }}>
                      {p}
                    </p>
                  ))}
                </div>
                <div style={{ marginTop: 12, display: 'flex', gap: 12, fontSize: 12, color: 'var(--text-tertiary)' }}>
                  {truncated && <span style={{ color: '#92400e' }}>⚠ 简介数据不完整</span>}
                  {website && (
                    <a
                      href={website.startsWith('http') ? website : `https://${website}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: 'var(--primary)', borderBottom: '1px dotted', paddingBottom: 1 }}
                    >
                      访问学校官网 ↗
                    </a>
                  )}
                </div>
              </>
            )}
          </section>
        )}

        {tab === 'info' && (
          <>
            {/* 章程区(更名历史 / 招生章程 / 章程信息) */}
            {(u.renameHistory || u.admissionGuide || u.charterInfo) && (
              <div style={{ marginBottom: 24 }}>
                <CharterCard
                  renameHistory={u.renameHistory ?? null}
                  admissionGuide={u.admissionGuide ?? null}
                  charterInfo={u.charterInfo ?? null}
                />
              </div>
            )}

            <div className="info-grid">
              {/* —— 总览 —— */}
              <div className="info-card">
                <h4>
                  <span className="ic"><BankIcon /></span>总览
                </h4>
                <dl>
                  <dt>院校代码</dt><dd>{u.code || '—'}</dd>
                  <dt>所在省市</dt><dd>{[u.province, u.city].filter(Boolean).join(' · ') || '—'}</dd>
                  <dt>学校类型</dt><dd>{u.type || '—'}</dd>
                  <dt>办学层次</dt><dd>{u.level || '—'}</dd>
                  <dt>办学性质</dt><dd>{u.runningNature || '—'}</dd>
                  <dt>办学规格</dt><dd>{u.runningLevel || '—'}</dd>
                  <dt>主管部门</dt><dd>{u.department || '—'}</dd>
                  <dt>建校年份</dt><dd>{u.createdYear || '—'}</dd>
                  <dt>校园面积</dt><dd>{u.campusArea ? `${u.campusArea.toLocaleString()} 亩` : '—'}</dd>
                  {u.maleRatio != null && u.femaleRatio != null && (
                    <>
                      <dt>男女比例</dt>
                      <dd>{u.maleRatio} : {u.femaleRatio}</dd>
                    </>
                  )}
                  {Array.isArray(u.tags) && u.tags.length > 0 && (
                    <>
                      <dt>标签</dt>
                      <dd>{u.tags.slice(0, 6).join(' · ')}</dd>
                    </>
                  )}
                </dl>
              </div>

              {/* —— 学科与排名 —— */}
              <div className="info-card">
                <h4>
                  <span className="ic"><TrophyIcon /></span>学科与排名
                </h4>
                <dl>
                  <dt>软科主榜</dt>
                  <dd>
                    {u.softRanking != null ? (
                      <>
                        <span className="em">#{u.softRanking}</span> · {u.softRankYear ?? ''} {u.softRankList ?? ''}榜
                      </>
                    ) : (
                      '—'
                    )}
                  </dd>
                  <dt>分类榜</dt>
                  <dd>
                    {u.softCategory && u.softCategoryRank != null ? (
                      <>
                        <span className="em">#{u.softCategoryRank}</span> · {u.softCategory}
                      </>
                    ) : (
                      '—'
                    )}
                  </dd>
                  <dt>学科评估</dt><dd>{u.disciplineEvaluationLevel || '—'}</dd>
                  <dt>A 类学科</dt><dd>{u.aClassDisciplineCount != null ? `${u.aClassDisciplineCount} 个` : '—'}</dd>
                  <dt>硕士点</dt>
                  <dd>
                    {u.hasMasterProgram && u.masterProgramCount != null
                      ? `${u.masterProgramCount} 个一级学科`
                      : '—'}
                  </dd>
                  <dt>博士点</dt>
                  <dd>
                    {u.hasDoctoralProgram && u.doctoralProgramCount != null
                      ? `${u.doctoralProgramCount} 个一级学科`
                      : '—'}
                  </dd>
                  <dt>QS 世界</dt><dd>{u.rankingQS != null ? `#${u.rankingQS}` : '—'}</dd>
                  <dt>校友会</dt><dd>{u.rankingAlumni != null ? `#${u.rankingAlumni}` : '—'}</dd>
                  <dt>USNews</dt><dd>{u.rankingUSNews != null ? `#${u.rankingUSNews}` : '—'}</dd>
                </dl>
              </div>

              {/* —— 就业与满意度 —— */}
              <div className="info-card">
                <h4>
                  <span className="ic"><ChartIcon /></span>就业与满意度
                </h4>
                <dl>
                  <dt>就业率</dt>
                  <dd>
                    {u.employmentRate != null ? (
                      <span className="em">{u.employmentRate}%</span>
                    ) : (
                      '—'
                    )}
                  </dd>
                  <dt>升学率</dt>
                  <dd>{u.furtherStudyRate != null ? `${u.furtherStudyRate}%` : '—'}</dd>
                  <dt>保研率</dt>
                  <dd>{u.postgradRate != null ? `${u.postgradRate}%` : '—'}</dd>
                  <dt>平均薪资</dt>
                  <dd>
                    {u.avgSalary != null ? (
                      <>
                        <span className="em">¥{u.avgSalary.toLocaleString()}</span> / 月
                      </>
                    ) : (
                      '—'
                    )}
                  </dd>
                  <dt>满意度</dt>
                  <dd>
                    {u.satisfactionOverall != null
                      ? `${u.satisfactionOverall} / 5.0 · 综合`
                      : '—'}
                  </dd>
                  {Array.isArray(u.topEmployers) && u.topEmployers.length > 0 && (
                    <>
                      <dt>主要去向</dt>
                      <dd>{u.topEmployers.slice(0, 3).join(' · ')}</dd>
                    </>
                  )}
                </dl>
              </div>

              {/* —— 校园与生活 —— */}
              <div className="info-card">
                <h4>
                  <span className="ic"><LocIcon /></span>校园与生活
                </h4>
                <dl>
                  <dt>军训时长</dt><dd>{u.militaryTrainingDuration || '—'}</dd>
                  <dt>转专业</dt><dd>{u.transferDifficulty || '—'}</dd>
                  <dt>校园面积</dt><dd>{u.campusArea ? `${u.campusArea.toLocaleString()} 亩` : '—'}</dd>
                  <dt>校区数</dt><dd>{u.campuses ? `${u.campuses.length} 个` : '—'}</dd>
                  {u.maleRatio != null && u.femaleRatio != null && (
                    <>
                      <dt>男女比</dt>
                      <dd>{u.maleRatio} : {u.femaleRatio}</dd>
                    </>
                  )}
                </dl>
              </div>
            </div>

            {/* 校区与周边(高德地图 + POI) */}
            {u.campuses && u.campuses.length > 0 && (
              <div style={{ marginTop: 24 }}>
                <CampusLocationTab universityId={u.id} campuses={u.campuses} />
              </div>
            )}
          </>
        )}

        {tab === 'admission' && (
          <div className="info-card" style={{ padding: 0, minHeight: 0 }}>
            <AdmissionDetailTab
              universityId={u.id}
              universityFlags={{ is985: u.is985, is211: u.is211 }}
              rawAdmissions={admissions ?? []}
              universityScores={{
                minScorePhysics: u.minScorePhysics ?? null,
                minRankPhysics: u.minRankPhysics ?? null,
                minScoreHistory: u.minScoreHistory ?? null,
                minRankHistory: u.minRankHistory ?? null,
              }}
            />
          </div>
        )}

        {tab === 'majors' && (
          <div className="info-card">
            <h4>
              <span className="ic"><BankIcon /></span>热门专业方向
            </h4>
            <div style={{ padding: '30px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              详细专业库内容由专业模块提供
              <br />
              <Link href="/majors" style={{ color: 'var(--primary)', marginTop: 8, display: 'inline-block', fontSize: 13 }}>
                进入专业库查看 →
              </Link>
            </div>
          </div>
        )}

        {tab === 'campus' && (
          <>
            {u.campuses && u.campuses.length > 0 ? (
              <CampusLocationTab universityId={u.id} campuses={u.campuses} />
            ) : (
              <div className="info-card">
                <h4>
                  <span className="ic"><LocIcon /></span>校区与生活
                </h4>
                <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                  校区信息暂未补充
                </div>
              </div>
            )}
          </>
        )}

        {/* 强基计划(条件渲染,在所有 tab 之外) */}
        {u.qiangjiAdmissions && u.qiangjiAdmissions.length > 0 && (
          <div style={{ marginTop: 24 }}>
            <div className="section-banner">
              <h2>强基计划</h2>
              <span className="sb">{u.qiangjiAdmissions.length} 个专业</span>
              <span className="line" />
            </div>
            <QiangjiTable data={u.qiangjiAdmissions} />
          </div>
        )}
      </div>
    </MainLayout>
  );
}
