'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Select, Spin, Tooltip, message } from 'antd';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import MainLayout from '@/components/layout/MainLayout';
import { universityService } from '@/services/university';
import UniversityLogo from '@/components/university/UniversityLogo';
import CharterCard from '@/components/university/CharterCard';
import CampusLocationTab from '@/components/university/campus-location/CampusLocationTab';
import QiangjiTable from '@/components/university/QiangjiTable';
import AdmissionDetailTab from '@/components/university/admission-detail/AdmissionDetailTab';
import { useStudentRank } from '@/stores/studentRankStore';
import { useWorkStudent, useWorkStudentOptions } from '@/hooks/useWorkStudent';
import { categorizeBatch } from '@/utils/batch-categorize';
import { useAuthStore } from '@/stores/authStore';
import { useUniversityCompare } from '@/stores/compareStore';
import { favoriteService } from '@/services/favorite';
import { studentApi } from '@/services/student-api';
import { FIELD_LABELS } from '@/components/student/stage-fields';
import { classifyRank, getTier, type RankTier } from '@/utils/classify-rank';
import { LocIcon, BankIcon, TrophyIcon, ChartIcon, BookmarkIcon, ArrowIcon } from '../components/shared/Icon';
import { tierImageFor } from '../lib/tier';
import { getLatestYearly } from '../lib/admission';
import { TrendBanner } from './components/TrendBanner';
import '../styles.css';

type TabKey = 'info' | 'admission' | 'majors' | 'campus';

// hero 命中率卡的冲稳保大字 (与招录详情 banner 同档位文案)
const TIER_TEXT: Record<RankTier, { label: string; color: string }> = {
  unreachable: { label: '难达', color: '#6b7280' },
  rush: { label: '冲', color: '#ef4444' },
  stable: { label: '稳', color: '#3b82f6' },
  safe: { label: '保', color: '#22c55e' },
  elite: { label: '远', color: '#f59e0b' },
  unknown: { label: '—', color: '#9ca3af' },
};

export default function UniversityDetailPage() {
  const params = useParams();
  const id = Number(params.id);

  const examType = useStudentRank((s) => s.examType);
  const studentRank = useStudentRank((s) => s.rank);

  // ===== 工作台学生上下文 (与列表/专业库共享): 位次与科类统一注入 =====
  const searchParams = useSearchParams();
  const {
    isTeacher,
    studentId: workStudentId,
    setStudentId: setWorkStudentId,
    student: workStudent,
    name: workStudentName,
    lane: workLane,
    rank: workRank,
    refetch: refetchWorkStudent,
  } = useWorkStudent();
  useEffect(() => {
    const sid = searchParams.get('studentId');
    if (sid) setWorkStudentId(sid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const effRank: number | null = workRank ?? studentRank ?? null;
  // 页级单一科类开关: 走势图/招录详情/统计条/预测全部联动 (此前各组件独立 state 可同页矛盾)
  const baseLane = (workLane ?? examType) as '物理' | '历史';
  const [laneOverride, setLaneOverride] = useState<'物理' | '历史' | null>(null);
  useEffect(() => {
    setLaneOverride(null); // 换学生重置为其科类
  }, [workStudentId]);
  const effType = laneOverride ?? baseLane;

  const userSubject = effType;
  const [tab, setTab] = useState<TabKey>('info');
  // 选定学生时默认直达招录详情 ("招录优先"反转的另一半); 仅首次, 不打断手动切换
  const didDefaultTab = useRef(false);
  useEffect(() => {
    if (workStudentId && !didDefaultTab.current) {
      didDefaultTab.current = true;
      setTab('admission');
    }
  }, [workStudentId]);
  const [descExpanded, setDescExpanded] = useState(false);
  const studentOptions = useWorkStudentOptions(isTeacher);

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

  // 收藏 (与列表/收藏页共用 query)
  const { isLoggedIn } = useAuthStore();
  const queryClient = useQueryClient();
  const { data: favData } = useQuery({
    queryKey: ['favorites', 'university'],
    queryFn: () => favoriteService.getList('university'),
    enabled: isLoggedIn,
  });
  const favId = useMemo(() => {
    const list = (favData as any)?.data ?? favData ?? [];
    for (const f of Array.isArray(list) ? list : []) {
      if (f.universityId === id) return f.id as number;
    }
    return null;
  }, [favData, id]);

  // 对比 (全局 store, 与列表共享清单)
  const compareToggle = useUniversityCompare((s) => s.toggle);
  const inCompare = useUniversityCompare((s) => s.list.some((c) => c.id === id));

  // 开设专业 (切到 tab 才拉)
  const { data: uniMajorsRaw } = useQuery({
    queryKey: ['university-majors', id],
    queryFn: () => universityService.getMajors(id),
    enabled: !!id && tab === 'majors',
  });

  // 同类院校 (同类型同层次, 前端按位次近邻取前 10)
  const { data: similarRaw } = useQuery({
    queryKey: ['similar-unis', university?.type, university?.level, effType],
    queryFn: () =>
      universityService.getList({
        type: university?.type,
        level: university?.level,
        pageSize: 60,
        sortBy: 'rank',
        examType: effType,
      } as any),
    enabled: !!university?.type,
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
  // 最近最低分/位次:跟 TrendBanner 共享 lib/admission.ts 的 getLatestYearly,
  // 按 effType 筛 + groupBy year 后取最近年最低门槛(filing > university > group > major)。
  // 避免之前用 admissionRecords[0] 取任意一条导致跟走势图数据不一致。
  const latestYearly = getLatestYearly(admissions ?? u.admissionRecords ?? [], effType);

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

  // hit-card: 预测线优先 (rankPrediction.point), 无预测退回去年实际最低位次。
  // 此前读后端从不返回的 bestPrediction.acceptRate, 命中率恒 '— —' (2026-06-12 修复)
  const uniMinRank =
    effType === '历史' ? u.minRankHistory ?? null : u.minRankPhysics ?? null;
  const predRank: number | null =
    u.bestPrediction?.point ?? (effType === '历史' ? u.predRankHistory : u.predRankPhysics) ?? null;
  const refRank = predRank ?? uniMinRank;
  const rankDiff = effRank != null && refRank != null ? refRank - effRank : null;
  const heroTier: RankTier | null =
    effRank != null && refRank != null
      ? classifyRank(
          effRank,
          refRank,
          getTier({ is985: u.is985, is211: u.is211, batch: u.level ?? '' }),
          effType === '历史',
        )
      : null;

  // 意向院校 (工作台学生)
  const uniPool: string[] = Array.isArray(workStudent?.preferredUniversities)
    ? workStudent.preferredUniversities
    : [];
  const inPool = uniPool.includes(u.name);
  const addToPool = async () => {
    if (!isTeacher || !workStudentId) {
      message.info('先在院校库列表选择学生，再加入其意向院校');
      return;
    }
    if (inPool) {
      message.info(`「${u.name}」已在意向院校`);
      return;
    }
    try {
      await studentApi.update(workStudentId, { preferredUniversities: [...uniPool, u.name] } as any);
      message.success(`已把「${u.name}」加入${workStudentName ? ` ${workStudentName} 的` : ''}意向院校`);
      refetchWorkStudent();
    } catch {
      message.error('保存失败，请重试');
    }
  };

  const toggleFav = async () => {
    if (!isLoggedIn) {
      message.info('登录后即可收藏院校');
      return;
    }
    try {
      if (favId) {
        await favoriteService.remove(favId);
        message.success('已取消收藏');
      } else {
        await favoriteService.add({ type: 'university', universityId: id });
        message.success(`已收藏「${u.name}」`);
      }
      queryClient.invalidateQueries({ queryKey: ['favorites', 'university'] });
    } catch {
      message.error('收藏操作失败，请重试');
    }
  };

  const toggleCompare = () => {
    const r = compareToggle({
      ...u,
      latestAdmission: latestYearly ? { minScore: latestYearly.score, minRank: latestYearly.rank } : null,
      predictedMinRank: predRank,
    });
    if (r === 'full') message.warning('最多同时对比 4 所院校');
    else if (r === 'added') message.success('已加入对比，回院校库列表查看对比清单');
  };

  // 同类院校: 排除自身, 按与本校最低位次的距离取近邻
  const similarUnis: any[] = (() => {
    const list: any[] = (similarRaw as any)?.data ?? [];
    const base = latestYearly?.rank ?? uniMinRank;
    return list
      .filter((s) => s.id !== id)
      .sort((a, b) => {
        const ar = a.latestAdmission?.minRank ?? null;
        const br = b.latestAdmission?.minRank ?? null;
        if (ar == null && br == null) return 0;
        if (ar == null) return 1;
        if (br == null) return -1;
        if (base == null) return ar - br;
        return Math.abs(ar - base) - Math.abs(br - base);
      })
      .slice(0, 10);
  })();

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
              基于{workStudentName ? ` ${workStudentName} ` : '你'}的位次
              {effRank != null ? ` · ${effRank.toLocaleString()} 名 · ${effType}类` : ''}
            </div>
            <div className="pct" style={heroTier ? { color: TIER_TEXT[heroTier].color } : undefined}>
              {heroTier ? TIER_TEXT[heroTier].label : '— —'}
            </div>
            {rankDiff != null && (
              <div className="verdict">
                你比{predRank != null ? '预测线' : '去年线'} {rankDiff > 0 ? '↑' : rankDiff < 0 ? '↓' : '·'}{' '}
                <span className="em">{Math.abs(rankDiff).toLocaleString()}</span> 名
              </div>
            )}
            <div className="sub">
              {u.bestPrediction
                ? `预测 ${u.bestPrediction.targetYear} 最低位次 ${Number(u.bestPrediction.point).toLocaleString()}（保守 ${Number(u.bestPrediction.conservative).toLocaleString()}）· 仅供参考`
                : refRank != null
                  ? `参考最近一年最低位次 ${refRank.toLocaleString()} · ${effType}类`
                  : effRank != null
                    ? '该科类暂无录取参考线'
                    : '选择学生或录入位次后生成判定'}
            </div>
            <div className="actions">
              <button type="button" className="btn outline" onClick={toggleFav}>
                <BookmarkIcon /> {favId ? '已收藏' : '收藏'}
              </button>
              <button type="button" className="btn outline" onClick={toggleCompare}>
                {inCompare ? '已在对比' : '对比'}
              </button>
              <button type="button" className="btn primary" onClick={addToPool}>
                {inPool ? '已在意向 ✓' : '加入意向'} <ArrowIcon />
              </button>
            </div>
            {/* 资料完整度出口: 选了意向不代表资料完整 */}
            {workStudent?.progress && (
              <div style={{ marginTop: 8, fontSize: 11 }}>
                {workStudent.progress.isRecommendable ? (
                  <Link
                    href={`/teacher/plans/generate/${workStudentId}`}
                    style={{ color: 'var(--primary)', textDecoration: 'underline' }}
                  >
                    资料齐全 · 去生成方案 →
                  </Link>
                ) : (
                  <Tooltip
                    title={`还缺: ${(workStudent.progress.missingFieldsForRecommend ?? [])
                      .map((f: string) => FIELD_LABELS[f] ?? f)
                      .join('、')}`}
                  >
                    <Link
                      href={`/teacher/students/${workStudentId}`}
                      style={{ color: '#b45309', textDecoration: 'underline' }}
                    >
                      资料缺 {(workStudent.progress.missingFieldsForRecommend ?? []).length} 项 · 去补全 →
                    </Link>
                  </Tooltip>
                )}
              </div>
            )}
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
              v: latestYearly ? <span className="em">{latestYearly.score}</span> : '—',
              s: latestYearly ? `${latestYearly.year} · ${effType}类` : '等待录取数据',
              core: true,
            },
            {
              k: '最近最低位次',
              v: latestYearly ? latestYearly.rank.toLocaleString() : '—',
              s: latestYearly ? `${latestYearly.year} · ${effType}类参考` : `${effType}类参考`,
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
              // 此前误用硕士点数冒充招生专业数; 改读在川计划物化列
              k: '在川计划',
              v: u.scPlanCount != null ? <span className="em">{u.scPlanCount.toLocaleString()}</span> : '—',
              s:
                u.scGroupCount != null
                  ? `${u.scGroupCount} 个专业组${u.scSupplCount ? ` · 征集 ${u.scSupplCount}` : ''}`
                  : '在川招生计划',
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
           Trend banner — 录取走势主角卡 (主批次口径, 与调档线 banner 一致,
           避免专科/提前批低分行把"每年最低门槛"拉到失真口径)
           =========================== */}
      {(admissions?.length ?? 0) > 0 && (
        <div style={{ maxWidth: 1500, margin: '0 auto', padding: '24px 32px 0' }}>
          <TrendBanner
            admissions={(() => {
              const all: any[] = admissions ?? [];
              if (all.some((r) => categorizeBatch(r.batch) === '本科批')) {
                return all.filter((r) => categorizeBatch(r.batch) === '本科批');
              }
              if (all.some((r) => categorizeBatch(r.batch) === '高职专科')) {
                return all.filter((r) => categorizeBatch(r.batch) === '高职专科');
              }
              return all;
            })()}
            studentRank={effRank}
            subject={effType}
            onSubjectChange={(v) => setLaneOverride(v as '物理' | '历史')}
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
              ['majors', '在川专业'],
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
          {/* 轻量学生条: 同校换学生不用回列表, 换人后全页冲稳保信号即时刷新 */}
          {isTeacher && (
            <span
              style={{
                marginLeft: 'auto',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                paddingLeft: 16,
              }}
            >
              <Select
                size="small"
                showSearch
                allowClear
                placeholder="选择学生"
                style={{ minWidth: 190 }}
                options={studentOptions}
                value={workStudentId ?? undefined}
                optionFilterProp="label"
                onChange={(v) => setWorkStudentId(v ?? null)}
              />
              {workStudent && (
                <span style={{ fontSize: 12, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
                  {workLane ? `${workLane}类` : ''}
                  {workRank ? ` · #${workRank.toLocaleString()}` : ''}
                  {` · 意向 ${uniPool.length} 所`}
                </span>
              )}
            </span>
          )}
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
              userRank={effRank}
              subject={effType === '历史' ? '历史类' : '物理类'}
              onSubjectChange={(s) => setLaneOverride(s === '历史类' ? '历史' : '物理')}
            />
          </div>
        )}

        {tab === 'majors' && (
          <UniMajorsTab
            plans={((uniMajorsRaw as any)?.data ?? uniMajorsRaw ?? []) as any[]}
            admissions={(admissions ?? []) as any[]}
            lane={workLane}
            studentId={workStudentId}
            userRank={effRank}
            flags={{ is985: u.is985, is211: u.is211 }}
          />
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

        {/* 同类院校参考: 同类型同层次, 位次最接近的 10 所 */}
        {similarUnis.length > 0 && (
          <div style={{ marginTop: 24 }}>
            <div className="section-banner">
              <h2>同类院校参考</h2>
              <span className="sb">{u.type} · {effType}类位次相近</span>
              <span className="line" />
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {similarUnis.map((s) => (
                <Link
                  key={s.id}
                  href={`/universities/${s.id}`}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 14px',
                    borderRadius: 999,
                    border: '1px solid var(--border)',
                    background: 'var(--surface)',
                    fontSize: 13,
                    color: 'var(--text-secondary)',
                    textDecoration: 'none',
                  }}
                >
                  {s.name}
                  {s.latestAdmission?.minRank != null && (
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      #{s.latestAdmission.minRank.toLocaleString()}
                    </span>
                  )}
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </MainLayout>
  );
}

/** 开设专业 tab: 最新计划年的在川招生计划表 + 录取分/位次关联 + 筛选排序 */
function UniMajorsTab({
  plans,
  admissions,
  lane,
  studentId,
  userRank,
  flags,
}: {
  plans: any[];
  admissions: any[];
  lane: string | null;
  studentId: string | null;
  userRank: number | null;
  flags: { is985: boolean; is211: boolean };
}) {
  // 筛选 / 排序状态
  const [laneFilter, setLaneFilter] = useState<string>(lane ?? '全部');
  const [batchFilter, setBatchFilter] = useState<string>('全部');
  const [tierFilter, setTierFilter] = useState<string>('全部');
  type SortKey = 'default' | 'score' | 'rank' | 'plan' | 'tuition';
  const [sortKey, setSortKey] = useState<SortKey>('default');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  useEffect(() => {
    setLaneFilter(lane ?? '全部'); // 换学生跟随其科类
  }, [lane]);

  const latestYear = plans.reduce((mx, p) => Math.max(mx, p.year ?? 0), 0);

  // 录取关联: 最新有分录取年, 键逐级退化 (majorId+科类+批次+组 → +批次 → +科类)
  const admYear = admissions.reduce(
    (mx, a) => (a.majorMinScore != null || a.majorMinRank != null ? Math.max(mx, a.year ?? 0) : mx),
    0,
  );
  const admByKey = new Map<string, { score: number | null; rank: number | null }>();
  for (const a of admissions) {
    if (a.year !== admYear || a.majorId == null) continue;
    if (a.majorMinScore == null && a.majorMinRank == null) continue;
    const v = { score: a.majorMinScore ?? null, rank: a.majorMinRank ?? null };
    for (const k of [
      `${a.majorId}|${a.subjects}|${a.batch}|${a.groupCode}`,
      `${a.majorId}|${a.subjects}|${a.batch}`,
      `${a.majorId}|${a.subjects}`,
    ]) {
      if (!admByKey.has(k)) admByKey.set(k, v);
    }
  }
  const admOf = (p: any) =>
    admByKey.get(`${p.majorId}|${p.subjects}|${p.batch}|${p.groupCode}`) ??
    admByKey.get(`${p.majorId}|${p.subjects}|${p.batch}`) ??
    admByKey.get(`${p.majorId}|${p.subjects}`) ??
    null;

  // 行预构建: 计划行 + 关联录取 + 冲稳保
  const allRows = plans
    .filter((p) => p.year === latestYear)
    .map((p) => {
      const adm = admOf(p);
      const tier: RankTier | null =
        userRank != null && adm?.rank != null
          ? classifyRank(
              userRank,
              adm.rank,
              getTier({ is985: flags.is985, is211: flags.is211, batch: p.batch ?? '' }),
              p.subjects === '历史',
            )
          : null;
      return { p, adm, tier };
    });

  const batches = Array.from(new Set(allRows.map((r) => r.p.batch).filter(Boolean))) as string[];
  batches.sort((a, b) => a.localeCompare(b, 'zh-CN'));

  const filtered = allRows.filter((r) => {
    if (laneFilter !== '全部' && r.p.subjects !== laneFilter) return false;
    if (batchFilter !== '全部' && r.p.batch !== batchFilter) return false;
    if (tierFilter !== '全部' && TIER_TEXT[(r.tier ?? 'unknown') as RankTier].label !== tierFilter) return false;
    return true;
  });

  const sortVal = (r: (typeof allRows)[number]): number | null => {
    if (sortKey === 'score') return r.adm?.score ?? null;
    if (sortKey === 'rank') return r.adm?.rank ?? null;
    if (sortKey === 'plan') return r.p.planCount ?? null;
    if (sortKey === 'tuition') return r.p.tuition != null ? Number(r.p.tuition) : null;
    return null;
  };
  const rows =
    sortKey === 'default'
      ? [...filtered].sort(
          (a, b) =>
            String(a.p.batch ?? '').localeCompare(String(b.p.batch ?? ''), 'zh-CN') ||
            String(a.p.groupCode ?? '').localeCompare(String(b.p.groupCode ?? '')) ||
            String(a.p.majorName ?? '').localeCompare(String(b.p.majorName ?? ''), 'zh-CN'),
        )
      : [...filtered].sort((a, b) => {
          const av = sortVal(a);
          const bv = sortVal(b);
          if (av == null && bv == null) return 0;
          if (av == null) return 1; // null 沉底
          if (bv == null) return -1;
          return sortDir === 'asc' ? av - bv : bv - av;
        });

  const clickSort = (k: SortKey, defaultDir: 'asc' | 'desc') => {
    if (sortKey !== k) {
      setSortKey(k);
      setSortDir(defaultDir);
    } else if (sortDir === defaultDir) {
      setSortDir(defaultDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey('default'); // 第三次点击回默认 (批次+组序)
    }
  };
  const arrowOf = (k: SortKey) => (sortKey === k ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ' ⇅');

  const chipStyle = (active: boolean): React.CSSProperties => ({
    fontSize: 12,
    padding: '3px 10px',
    borderRadius: 6,
    cursor: 'pointer',
    border: active ? '1px solid var(--primary)' : '1px solid var(--border)',
    background: active ? 'var(--primary)' : 'var(--surface)',
    color: active ? '#fff' : 'var(--text-tertiary)',
  });

  type Header = { label: string; key?: SortKey; dir?: 'asc' | 'desc' };
  const headers: Header[] = [
    { label: '专业' },
    { label: '科类' },
    { label: '批次' },
    { label: '组' },
    { label: '计划', key: 'plan', dir: 'desc' },
    { label: admYear ? `${admYear} 最低分` : '最低分', key: 'score', dir: 'desc' },
    { label: admYear ? `${admYear} 最低位次` : '最低位次', key: 'rank', dir: 'asc' },
    ...(userRank != null ? [{ label: '判定' } as Header] : []),
    { label: '学费/年', key: 'tuition', dir: 'asc' },
    { label: '学制' },
    { label: '选科要求' },
  ];

  return (
    <div className="info-card">
      <h4>
        <span className="ic"><BankIcon /></span>
        {latestYear ? `${latestYear} 年在川招生专业 · ${rows.length} 条` : '在川招生专业'}
      </h4>

      {/* 筛选行: 科类 / 批次 / 判定 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, margin: '4px 0 12px' }}>
        {['全部', '物理', '历史'].map((s) => (
          <button key={s} type="button" style={chipStyle(laneFilter === s)} onClick={() => setLaneFilter(s)}>
            {s === '全部' ? '全部科类' : `${s}类`}
          </button>
        ))}
        {batches.length > 1 && (
          <>
            <span style={{ width: 1, height: 18, background: 'var(--border)' }} />
            <Select
              size="small"
              style={{ minWidth: 170 }}
              value={batchFilter}
              options={[{ label: '全部批次', value: '全部' }, ...batches.map((b) => ({ label: b, value: b }))]}
              onChange={(v) => setBatchFilter(v)}
            />
          </>
        )}
        {userRank != null && (
          <>
            <span style={{ width: 1, height: 18, background: 'var(--border)' }} />
            {['全部', '冲', '稳', '保'].map((t) => (
              <button key={t} type="button" style={chipStyle(tierFilter === t)} onClick={() => setTierFilter(t)}>
                {t === '全部' ? '全部判定' : t}
              </button>
            ))}
          </>
        )}
      </div>

      {rows.length === 0 ? (
        <div style={{ padding: '30px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
          {plans.length === 0 ? '加载中或暂无在川招生计划' : '当前筛选条件下无计划'}
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ color: 'var(--text-muted)', fontSize: 11, textAlign: 'left' }}>
                {headers.map((h) => (
                  <th
                    key={h.label}
                    onClick={h.key ? () => clickSort(h.key!, h.dir!) : undefined}
                    style={{
                      padding: '6px 10px',
                      borderBottom: '1px solid var(--border)',
                      fontWeight: 500,
                      whiteSpace: 'nowrap',
                      cursor: h.key ? 'pointer' : undefined,
                      userSelect: 'none',
                      color: h.key && sortKey === h.key ? 'var(--primary)' : undefined,
                    }}
                  >
                    {h.label}
                    {h.key ? arrowOf(h.key) : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ p, adm, tier }) => (
                <tr key={p.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <td style={{ padding: '7px 10px' }}>
                    {p.majorId ? (
                      <Link href={`/majors/${p.majorId}`} style={{ color: 'var(--primary)' }}>
                        {p.majorName}
                      </Link>
                    ) : (
                      p.majorName
                    )}
                  </td>
                  <td style={{ padding: '7px 10px' }}>
                    <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 4, background: p.subjects === '物理' ? 'rgba(59,130,246,.1)' : 'rgba(244,63,94,.1)', color: p.subjects === '物理' ? '#1d4ed8' : '#be123c' }}>
                      {p.subjects}
                    </span>
                  </td>
                  <td style={{ padding: '7px 10px', fontSize: 12, color: 'var(--text-tertiary)' }}>{p.batch}</td>
                  <td style={{ padding: '7px 10px', fontSize: 12 }}>{p.groupCode}</td>
                  <td style={{ padding: '7px 10px', fontWeight: 600 }}>{p.planCount ?? '—'}</td>
                  <td style={{ padding: '7px 10px', fontWeight: 600 }}>{adm?.score ?? '—'}</td>
                  <td style={{ padding: '7px 10px', fontSize: 12 }}>
                    {adm?.rank != null ? `#${adm.rank.toLocaleString()}` : '—'}
                  </td>
                  {userRank != null && (
                    <td style={{ padding: '7px 10px' }}>
                      {tier ? (
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            padding: '1px 8px',
                            borderRadius: 999,
                            color: '#fff',
                            background: TIER_TEXT[tier].color,
                          }}
                        >
                          {TIER_TEXT[tier].label}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                      )}
                    </td>
                  )}
                  <td style={{ padding: '7px 10px', fontSize: 12 }}>{p.tuition != null ? `¥${Number(p.tuition).toLocaleString()}` : '—'}</td>
                  <td style={{ padding: '7px 10px', fontSize: 12 }}>{p.duration ? `${p.duration} 年` : '—'}</td>
                  <td style={{ padding: '7px 10px', fontSize: 12, color: 'var(--text-tertiary)' }}>{p.subjectRequirements || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, fontSize: 12 }}>
        <Link
          href={studentId ? `/majors?studentId=${studentId}` : '/majors'}
          style={{ color: 'var(--primary)' }}
        >
          去专业库按条件细查（分带 / 特殊形式 / 意向池）→
        </Link>
        {admYear > 0 && (
          <span style={{ color: 'var(--text-faint)', fontSize: 11 }}>
            分数/位次为 {admYear} 年该专业最低录取线，按 专业+科类+批次+组 关联
          </span>
        )}
      </div>
    </div>
  );
}
