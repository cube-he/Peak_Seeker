'use client';

/**
 * 教师工作台 · 学生管理 (列表)
 * 复刻自 `WillNest Design System/teacher/views/students.jsx`.
 * 业务逻辑保留: keyword debounce → backend, 二级过滤前端做, useSearchParams
 * + Suspense 框架, CSV 导出.
 * className 用设计稿 stu-grid / stu-tbl / stu-card / fc / chip-bar /
 *           search-wrap / stu-select / stu-view-toggle.
 */

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Spin, message } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { studentApi, type ProfileProgress } from '@/services/student-api';
import {
  Avatar,
  Empty,
  PageHeader,
  SubjectChip,
  TIcon,
  fmtAgo,
  type WnStudent,
} from '@/components/willnest';

// ============================================================
//   Types & mappings
// ============================================================
interface BackendStudent {
  id: number;
  username: string;
  realName?: string;
  phone?: string;
  workflowStatus?: string;
  status: string;
  user?: { realName?: string; phone?: string };
  totalScore?: number;
  provincialRank?: number;
  progress?: ProfileProgress;
  planCount?: number;
  latestPlanStatus?: string | null;
  latestPlanId?: number | null;
  latestPlanVersionNo?: number | null;
  updatedAt?: string;
  createdAt: string;
  examType?: 'PHYSICS' | 'HISTORY' | null;
}

type DesignTrack = 'me' | 'parent' | 'supervisor' | 'done' | 'idle';

const PLAN_STATUS_LABEL: Record<string, string> = {
  DRAFT: '草稿',
  PENDING_REVIEW: '待审',
  REVIEWING: '审中',
  APPROVED: '已通过',
  PARENT_CONFIRMED: '家长确认',
  REJECTED: '已退回',
  FINALIZED: '已定稿',
  PUBLISHED: '已发布',
  OUTDATED: '已过期',
};

const TRACK_TONE: Record<DesignTrack, { txt: string; tone: string; cls: string }> = {
  me: { txt: '等我动手', tone: 'rush', cls: 'me' },
  parent: { txt: '等学生家长', tone: 'accent', cls: 'parent' },
  supervisor: { txt: '待主管', tone: 'primary', cls: 'sup' },
  done: { txt: '已交付', tone: '', cls: 'done' },
  idle: { txt: '进行中', tone: '', cls: 'none' },
};

// Avatar tone — id 稳定 hash 防抖
const TONES = ['t-blue', 't-amber', 't-violet', 't-rose', 't-green'];
function pickTone(id: number): string {
  return TONES[Math.abs(id) % TONES.length];
}

function getName(s: BackendStudent): string {
  return s.user?.realName ?? s.realName ?? s.username;
}
function getPhone(s: BackendStudent): string {
  return s.user?.phone ?? s.phone ?? '';
}
function getCompleteness(s: BackendStudent): number {
  return s.progress?.overallCompleteness ?? 0;
}
function getStudentCompleteness(s: BackendStudent): number {
  return s.progress?.studentSelfCompleteness ?? 0;
}
function getTeacherCompleteness(s: BackendStudent): number {
  // teacher 完整度 = overall - student (近似)
  return Math.max(0, getCompleteness(s) - getStudentCompleteness(s));
}

function daysSince(date: string | undefined, now: number): number {
  if (!date) return 0;
  const t = new Date(date).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((now - t) / 86_400_000));
}

// backend workflow 状态 → 设计稿 track
function getTrack(s: BackendStudent): DesignTrack {
  const status = s.workflowStatus ?? 'COLLECTING';
  if (status === 'SUBMITTED') return 'done';
  if (s.latestPlanStatus === 'PENDING_REVIEW' || s.latestPlanStatus === 'REVIEWING') {
    return 'supervisor';
  }
  const completeness = getCompleteness(s);
  if (status === 'COLLECTING' && completeness < 60) return 'me';
  if (status === 'GENERATING') return 'me';
  if (status === 'COLLECTING') return 'parent';
  if (status === 'FINALIZED') return 'parent';
  return 'idle';
}

// backend workflow → 设计稿 intakeStatus (用于"资料状态"过滤)
function getIntakeStatus(s: BackendStudent): 'VERIFIED' | 'SUBMITTED' | 'NEEDS_CHANGES' | 'DRAFT' {
  const w = s.workflowStatus ?? 'COLLECTING';
  if (w === 'FINALIZED' || w === 'SUBMITTED') return 'VERIFIED';
  if (w === 'REVIEWING') return 'SUBMITTED';
  if (s.latestPlanStatus === 'REJECTED') return 'NEEDS_CHANGES';
  return 'DRAFT';
}

interface DesignStudent extends WnStudent {
  /** 转成 string 方便设计稿原版 .toLowerCase() 调用 */
  idStr: string;
  /** backend id (用于 router push) */
  rawId: number;
  score: number;
  rank: number;
  plansCount: number;
  latestPlan: string | null;
  lastActHours: number;
  silentDays: number;
  needsAttention: boolean;
  intakeStatus: 'VERIFIED' | 'SUBMITTED' | 'NEEDS_CHANGES' | 'DRAFT';
  completion: { total: number; student: number; teacher: number };
  exam: 'PHYSICS' | 'HISTORY' | null;
  contact: { school: string; clazz: string; phone: string };
  track: DesignTrack;
}

function toDesign(s: BackendStudent, now: number): DesignStudent {
  const name = getName(s);
  const silentDays = daysSince(s.updatedAt, now);
  const track = getTrack(s);
  const completeness = getCompleteness(s);
  const latestPlan = s.latestPlanStatus
    ? `${s.latestPlanVersionNo ? `v${s.latestPlanVersionNo} ` : ''}${
        PLAN_STATUS_LABEL[s.latestPlanStatus] ?? s.latestPlanStatus
      }`
    : null;
  return {
    id: s.id,
    rawId: s.id,
    idStr: String(s.id),
    name,
    initials: name.charAt(0),
    tone: pickTone(s.id),
    score: s.totalScore ?? 0,
    rank: s.provincialRank ?? 0,
    plansCount: s.planCount ?? 0,
    latestPlan,
    lastActHours: silentDays * 24,
    silentDays,
    needsAttention: silentDays >= 4 || (track === 'me' && completeness < 30),
    intakeStatus: getIntakeStatus(s),
    completion: {
      total: completeness,
      student: getStudentCompleteness(s),
      teacher: getTeacherCompleteness(s),
    },
    exam: s.examType ?? null,
    contact: {
      school: '', // backend 暂未提供, 占位
      clazz: '',
      phone: getPhone(s),
    },
    track,
  };
}

// ============================================================
//   Hooks
// ============================================================
function useDebouncedValue<T>(value: T, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// ============================================================
//   Page wrapper (Suspense for useSearchParams)
// ============================================================
export default function TeacherStudentsPage() {
  return (
    <Suspense
      fallback={
        <div className="view-transition" style={{ padding: 80, textAlign: 'center' }}>
          <Spin size="large" />
        </div>
      }
    >
      <Inner />
    </Suspense>
  );
}

function Inner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // 状态
  const [searchInput, setSearchInput] = useState(() => searchParams.get('keyword') ?? '');
  const search = useDebouncedValue(searchInput, 300);
  const [filter, setFilter] = useState<string>(() => searchParams.get('filter') ?? 'all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [progressFilter, setProgressFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'card' | 'table'>('card');

  // 数据
  const { data, isLoading } = useQuery({
    queryKey: ['teacher-students', search],
    queryFn: () => studentApi.getList({ pageSize: 200, search: search || undefined }),
  });
  const raw: BackendStudent[] = (data as any)?.data?.data ?? (data as any)?.data ?? [];

  const [now] = useState(() => Date.now());
  const students = useMemo(() => raw.map((s) => toDesign(s, now)), [raw, now]);

  // 分桶计数
  const counts = useMemo(
    () => ({
      me: students.filter((s) => s.track === 'me').length,
      parent: students.filter((s) => s.track === 'parent').length,
      sup: students.filter((s) => s.track === 'supervisor').length,
      silent: students.filter((s) => s.silentDays >= 4).length,
      done: students.filter((s) => s.track === 'done').length,
      attn: students.filter((s) => s.needsAttention).length,
      noPlan: students.filter((s) => s.plansCount === 0).length,
      pending: students.filter((s) => s.track === 'supervisor').length,
      high: students.filter((s) => s.score >= 640).length,
      all: students.length,
    }),
    [students],
  );

  // 应用过滤器
  const filtered = useMemo(() => {
    let xs = students;
    switch (filter) {
      case 'me':
        xs = xs.filter((s) => s.track === 'me');
        break;
      case 'parent':
        xs = xs.filter((s) => s.track === 'parent');
        break;
      case 'sup':
        xs = xs.filter((s) => s.track === 'supervisor');
        break;
      case 'silent':
        xs = xs.filter((s) => s.silentDays >= 4);
        break;
      case 'done':
        xs = xs.filter((s) => s.track === 'done');
        break;
      case 'attn':
        xs = xs.filter((s) => s.needsAttention);
        break;
      case 'noPlan':
        xs = xs.filter((s) => s.plansCount === 0);
        break;
      case 'pending':
        xs = xs.filter((s) => s.track === 'supervisor');
        break;
      case 'high':
        xs = xs.filter((s) => s.score >= 640);
        break;
      default:
        break;
    }
    if (statusFilter === 'verified') xs = xs.filter((s) => s.intakeStatus === 'VERIFIED');
    else if (statusFilter === 'submitted') xs = xs.filter((s) => s.intakeStatus === 'SUBMITTED');
    else if (statusFilter === 'changes') xs = xs.filter((s) => s.intakeStatus === 'NEEDS_CHANGES');
    else if (statusFilter === 'draft') xs = xs.filter((s) => s.intakeStatus === 'DRAFT');

    if (progressFilter === 'self_low') xs = xs.filter((s) => s.completion.student < 50);
    else if (progressFilter === 'self_mid')
      xs = xs.filter((s) => s.completion.student >= 50 && s.completion.student < 100);
    else if (progressFilter === 'teacher_low') xs = xs.filter((s) => s.completion.teacher < 80);
    else if (progressFilter === 'recommendable') xs = xs.filter((s) => s.completion.total >= 80);
    return xs;
  }, [students, filter, statusFilter, progressFilter]);

  const openStudent = (id: number) => router.push(`/teacher/students/${id}`);

  // 两组 chips (作业流 + 属性筛选)
  const trackChips = [
    { k: 'all', label: '全部' },
    { k: 'me', label: '等我动手' },
    { k: 'parent', label: '等学生家长' },
    { k: 'sup', label: '等主管' },
    { k: 'done', label: '已交付' },
  ];
  const attrChips: { k: string; label: string; tone?: string }[] = [
    { k: 'attn', label: '需关注', tone: 'rush' },
    { k: 'silent', label: '沉默 ≥4 天', tone: 'rush' },
    { k: 'noPlan', label: '未建方案' },
    { k: 'pending', label: '待审核' },
    { k: 'high', label: '≥640 分', tone: 'safe' },
  ];

  if (isLoading) {
    return (
      <div className="view-transition" style={{ padding: 80, textAlign: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div className="view-transition">
      <PageHeader
        eyebrow="ROSTER"
        title="学生管理"
        meta={
          <>
            <span>
              <span className="em">{students.length}</span> 名签约学生
            </span>
            <span className="dot" />
            <span>
              <span className="em">{counts.attn}</span> 需关注
            </span>
            <span className="dot" />
            <span>
              <span className="em">{counts.done}</span> 已交付
            </span>
          </>
        }
        fresh="刚刚"
        actions={
          <>
            <button
              type="button"
              className="qa"
              disabled
              title="批量导入待接入"
              onClick={() => message.info('批量导入功能待接入')}
            >
              <TIcon.upload /> 批量导入
            </button>
            <Link href="/teacher/students/create" className="qa primary" style={{ textDecoration: 'none' }}>
              <TIcon.plus /> 新建学生
            </Link>
          </>
        }
      />

      <div className="chip-bar fade-up d1">
        <span className="chip-label">作业流</span>
        {trackChips.map((c) => (
          <button
            key={c.k}
            type="button"
            className={`fc ${filter === c.k ? 'is-active' : ''}`}
            onClick={() => setFilter(c.k)}
          >
            {c.label}
            <span className="n">{counts[c.k as keyof typeof counts]}</span>
          </button>
        ))}
        <span className="chip-sep" aria-hidden="true" />
        <span className="chip-label">筛选</span>
        {attrChips.map((c) => (
          <button
            key={c.k}
            type="button"
            className={`fc ${filter === c.k ? `is-active t-${c.tone || ''}` : ''}`}
            onClick={() => setFilter(c.k)}
          >
            {c.label}
            <span className="n">{counts[c.k as keyof typeof counts]}</span>
          </button>
        ))}
      </div>

      <div className="search-wrap fade-up d2">
        <TIcon.search />
        <input
          placeholder="姓名 / 学号 / 学校"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
        <span className="stu-toolbar-sep" />
        <select
          className="stu-select"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="all">资料状态:全部</option>
          <option value="verified">已确认</option>
          <option value="submitted">待确认</option>
          <option value="changes">已退回</option>
          <option value="draft">草稿</option>
        </select>
        <select
          className="stu-select"
          value={progressFilter}
          onChange={(e) => setProgressFilter(e.target.value)}
        >
          <option value="all">进度:全部</option>
          <option value="self_low">学生自填 &lt; 50%</option>
          <option value="self_mid">学生自填 50-99%</option>
          <option value="teacher_low">老师录入 &lt; 80%</option>
          <option value="recommendable">可推荐 (≥80%)</option>
        </select>
        <div className="stu-view-toggle">
          <button
            type="button"
            className={viewMode === 'card' ? 'is-active' : ''}
            onClick={() => setViewMode('card')}
            title="卡片视图"
          >
            <TIcon.dashboard />
          </button>
          <button
            type="button"
            className={viewMode === 'table' ? 'is-active' : ''}
            onClick={() => setViewMode('table')}
            title="表格视图"
          >
            <TIcon.filter />
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <Empty title="没有匹配的学生" sub="试试更换过滤条件或调整搜索关键词" />
      ) : viewMode === 'card' ? (
        <div className="stu-grid fade-up d3">
          {filtered.map((s) => (
            <StudentCard key={s.id} student={s} onOpen={() => openStudent(s.rawId)} />
          ))}
        </div>
      ) : (
        <StudentTable students={filtered} onOpen={openStudent} />
      )}
    </div>
  );
}

// ============================================================
//   StudentCard (卡片视图)
// ============================================================
function StudentCard({ student: s, onOpen }: { student: DesignStudent; onOpen: () => void }) {
  const tl = TRACK_TONE[s.track];
  return (
    <article className={`stu-card track-${tl.cls}`} onClick={onOpen}>
      <div className="row1">
        <Avatar student={s} size={44} />
        <div className="who">
          <div className="name">
            {s.name}
            {tl.txt ? <span className={`label ${tl.tone}`}>{tl.txt}</span> : null}
          </div>
          {(s.contact.school || s.contact.clazz) && (
            <div className="school">
              {s.contact.school}
              {s.contact.clazz ? ` · ${s.contact.clazz}` : ''}
            </div>
          )}
        </div>
      </div>

      <div className="score-line">
        <span className="score">{s.score || '--'}</span>
        <span className="rank">
          位次 <span className="em">{s.rank ? s.rank.toLocaleString() : '--'}</span>
        </span>
        <SubjectChip exam={s.exam} />
      </div>

      <div className="stu-card-prog">
        <div className="stu-card-prog-row">
          <span className="lbl">资料完整度</span>
          <span className="val">{s.completion.total}%</span>
        </div>
        <div
          className={`stu-card-prog-bar ${
            s.completion.total >= 90 ? 'full' : s.completion.total < 60 ? 'low' : ''
          }`}
        >
          <span className="fill" style={{ width: `${s.completion.total}%` }} />
        </div>
      </div>

      <div className="meta">
        方案 <span className="em">{s.plansCount}</span> 份
        {s.latestPlan ? (
          <>
            {' '}
            · 最新 <span className="em">{s.latestPlan}</span>
          </>
        ) : null}
        <br />
        <span className="last">
          <TIcon.clock /> 上次动作 {fmtAgo(s.lastActHours)}
          {s.silentDays >= 4 ? (
            <span style={{ color: 'var(--rush)', marginLeft: 8 }}>· 沉默 {s.silentDays} 天</span>
          ) : null}
        </span>
      </div>
    </article>
  );
}

// ============================================================
//   StudentTable (表格视图, 9 列)
// ============================================================
function StudentTable({
  students,
  onOpen,
}: {
  students: DesignStudent[];
  onOpen: (id: number) => void;
}) {
  return (
    <div className="stu-tbl fade-up d3">
      <div className="stu-tbl-head">
        <span>姓名</span>
        <span>手机</span>
        <span>状态</span>
        <span style={{ textAlign: 'right' }}>总分</span>
        <span style={{ textAlign: 'right' }}>位次</span>
        <span style={{ textAlign: 'right' }}>完整度</span>
        <span style={{ textAlign: 'right' }}>方案</span>
        <span>最新方案</span>
        <span style={{ textAlign: 'right' }}>最近更新</span>
      </div>
      {students.map((s) => {
        const tl = TRACK_TONE[s.track];
        return (
          <div className="stu-tbl-row" key={s.id} onClick={() => onOpen(s.rawId)}>
            <span className="nm">
              <Avatar student={s} size={28} />
              <span>
                <strong>{s.name}</strong>
                {s.contact.school ? <em>{s.contact.school}</em> : null}
              </span>
            </span>
            <span className="phone">{s.contact.phone || '—'}</span>
            <span>
              <span className={`stu-tbl-status tone-${tl.tone || 'muted'}`}>{tl.txt}</span>
            </span>
            <span className="num score">{s.score || '--'}</span>
            <span className="num rank">{s.rank ? s.rank.toLocaleString() : '--'}</span>
            <span className="num pct">
              <span
                className={`stu-tbl-pct ${
                  s.completion.total >= 90 ? 'full' : s.completion.total < 60 ? 'low' : ''
                }`}
              >
                {s.completion.total}%
              </span>
            </span>
            <span className="num pl">{s.plansCount}</span>
            <span className="latest">
              {s.latestPlan ?? <em style={{ color: 'var(--text-faint)' }}>—</em>}
            </span>
            <span className="when">
              {fmtAgo(s.lastActHours)}
              {s.silentDays >= 4 ? (
                <span style={{ display: 'block', color: 'var(--rush)', fontSize: 10.5 }}>
                  沉默 {s.silentDays} 天
                </span>
              ) : null}
            </span>
          </div>
        );
      })}
    </div>
  );
}
