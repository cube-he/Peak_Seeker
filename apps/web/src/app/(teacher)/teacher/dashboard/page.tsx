'use client';

/**
 * 教师工作台 · 看板 (Dashboard)
 * 复刻自 `WillNest Design System/teacher/views/dashboard.jsx`,
 * 用现有 react-query 数据源 + transform helpers 喂入设计稿组件.
 *
 * className 完全沿用设计稿 styles.css 命名 (db-hero / db-silent / db-cdn / db-parent /
 * db-tl / qa / track / todo / empty). 不引入 antd Button / Card, 让样式来自
 * willnest-teacher.css 而不是 antd reset.
 *
 * 上一版的 antd 实现保留全部业务逻辑 (沉默学生 / 三轨待办 / 倒计时 / 家长申请),
 * 只把渲染层换掉. transform 函数集中在文件顶端, 方便其他页面后续复用.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Spin, message } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { studentApi } from '@/services/student-api';
import { planApi } from '@/services/plan-api';
import { timelineApi, type TimelineEvent } from '@/services/timeline-api';
import { consultationApi, type Consultation } from '@/services/consultation-api';
import { useAuthStore } from '@/stores/authStore';
import {
  Avatar,
  ChannelIcon,
  SectionHead,
  StatusChip,
  TIcon,
  TodoCard,
  TrackEmpty,
  type WnStudent,
} from '@/components/willnest';

// === Fallback timeline dates: 仅在 timeline API 加载失败时使用 ===
const FALLBACK_EXAM_DATE = '2026-06-07T09:00:00+08:00';

// === 文案字典 (设计稿原本走 window.WN_TEACHER) ===
const CHANNEL_TXT: Record<Consultation['channel'], string> = {
  phone: '电话',
  wechat: '微信',
  in_person: '线下',
  video: '视频',
};
const COMM_STATUS_TXT: Record<Consultation['status'], string> = {
  requested: '待确认',
  scheduled: '待开始',
  in_progress: '进行中',
  completed: '已完成',
  cancelled: '已取消',
  no_show: '缺席',
};
// === Avatar tone 派 — 用 id 稳定 hash, 避免每次 render 抖色 ===
const TONES = ['t-blue', 't-amber', 't-violet', 't-rose', 't-green'];
function pickTone(id: number | string): string {
  const n =
    typeof id === 'number'
      ? id
      : Array.from(String(id)).reduce((s, c) => s + c.charCodeAt(0), 0);
  return TONES[Math.abs(n) % TONES.length];
}

// === Types ===
interface BackendStudent {
  id: number;
  user?: { realName?: string | null; username?: string };
  realName?: string;
  username?: string;
  workflowStatus?: string;
  status?: string;
  score?: number;
  totalScore?: number;
  completeness?: number;
  progress?: { overallCompleteness?: number };
  updatedAt?: string;
}

interface PendingPlan {
  id: number;
  studentName: string;
  studentId: number;
  status: string;
  updatedAt: string;
}

/**
 * 设计稿 dashboard.jsx 期望的 student shape — 在 WnStudent 基础上加了 dashboard
 * 自己的派生字段 (track / silentDays / 状态文案 / 跳转地址).
 */
interface DashStudent extends WnStudent {
  score: number | null;
  track: 'me' | 'parent' | 'supervisor';
  silentDays: number;
  statusLabel: string;
  statusDetail: string;
  nextAction: string;
  href: string;
  /** 沉默统计与 silent track 区分 — silent 学生仍属原 track, 只是被加到顶部 alert */
  lastActHours?: number;
}

function getName(s: BackendStudent): string {
  return s.user?.realName ?? s.user?.username ?? s.realName ?? s.username ?? '学生';
}

function getScore(s: BackendStudent): number | null {
  return s.score ?? s.totalScore ?? null;
}

function getCompleteness(s: BackendStudent): number {
  return s.completeness ?? s.progress?.overallCompleteness ?? 0;
}

function daysSince(date: string | undefined, now: number): number {
  if (!date) return 0;
  const past = new Date(date).getTime();
  if (Number.isNaN(past)) return 0;
  return Math.max(0, Math.floor((now - past) / 86_400_000));
}

function categorize(
  students: BackendStudent[],
  pendingPlans: PendingPlan[],
  isSupervisor: boolean,
  now: number,
): DashStudent[] {
  const out: DashStudent[] = [];

  students.forEach((s) => {
    const status = s.workflowStatus ?? 'COLLECTING';
    if (status === 'SUBMITTED') return;
    const completeness = getCompleteness(s);
    const silentDays = daysSince(s.updatedAt, now);
    const name = getName(s);
    const base: Pick<DashStudent, 'id' | 'name' | 'initials' | 'tone' | 'score' | 'silentDays' | 'lastActHours'> = {
      id: s.id,
      name,
      initials: name.charAt(0),
      tone: pickTone(s.id),
      score: getScore(s),
      silentDays,
      lastActHours: silentDays * 24,
    };

    if (status === 'COLLECTING' && completeness < 60) {
      out.push({
        ...base,
        track: 'me',
        statusLabel: '待采集资料',
        statusDetail: `完整度 ${completeness}% · 老师需补充`,
        nextAction: '继续采集',
        href: `/teacher/students/${s.id}`,
      });
    } else if (status === 'GENERATING') {
      out.push({
        ...base,
        track: 'me',
        statusLabel: '待生成方案',
        statusDetail: `资料已齐 ${completeness}% · 等老师出方案`,
        nextAction: '生成方案',
        href: `/teacher/plans/generate/${s.id}`,
      });
    } else if (status === 'COLLECTING') {
      out.push({
        ...base,
        track: 'parent',
        statusLabel: '等家长补资料',
        statusDetail: `已 ${completeness}% · 缺剩余字段`,
        nextAction: '查看 / 催办',
        href: `/teacher/students/${s.id}`,
      });
    } else if (status === 'FINALIZED') {
      out.push({
        ...base,
        track: 'parent',
        statusLabel: '终稿待签字',
        statusDetail: '方案已定稿 · 等家长确认提交',
        nextAction: '查看方案',
        href: `/teacher/students/${s.id}`,
      });
    }
    // REVIEWING 状态走 pendingPlans 数据源, 这里不重复
  });

  // 等主管审核 — pendingPlans → supervisor 轨
  pendingPlans.forEach((p) => {
    const silentDays = daysSince(p.updatedAt, now);
    const name = p.studentName ?? '学生';
    out.push({
      // 同一个 student 可能既在自身列表又在 pendingPlans, 用 plan-{id} 唯一化
      id: `plan-${p.id}`,
      name,
      initials: name.charAt(0),
      tone: pickTone(p.studentId),
      score: null,
      track: 'supervisor',
      silentDays,
      lastActHours: silentDays * 24,
      statusLabel: isSupervisor ? '待我审核' : '等主管审核',
      statusDetail: silentDays === 0 ? '刚提交' : `提交 ${silentDays} 天前`,
      nextAction: isSupervisor ? '审核' : '查看方案',
      href: `/teacher/plans/${p.id}`,
    });
  });

  return out;
}

interface Countdown {
  id: string;
  label: string;
  note: string;
  days: number;
  pct: number;
  variant: 'rush' | 'accent' | 'safe';
}

function buildCountdowns(events: TimelineEvent[], now: number): Countdown[] {
  const find = (key: string) => events.find((e) => e.key === key);
  const make = (
    key: string,
    label: string,
    variant: Countdown['variant'],
  ): Countdown | null => {
    const e = find(key);
    if (!e?.startDate) return null;
    const t = new Date(e.startDate).getTime();
    const days = Math.max(0, Math.ceil((t - now) / 86_400_000));
    const note = new Date(e.startDate).toLocaleDateString('zh-CN', {
      month: 'long',
      day: 'numeric',
    });
    const pct = Math.min(100, Math.max(0, Math.round(((60 - days) / 60) * 100)));
    return { id: key, label, note, days, pct, variant };
  };
  return [
    make('volunteer_deadline_early', '提前批截止', 'rush'),
    make('volunteer_deadline_regular', '本科批截止', 'accent'),
    make('volunteer_deadline_vocational', '专科批截止', 'safe'),
  ].filter((x): x is Countdown => x !== null);
}

// ============================================================
//   Page
// ============================================================
export default function TeacherDashboardPage() {
  const router = useRouter();

  // === 角色 / 当前用户 (zustand hydrate race 老问题, 沿用 subscribe 模式) ===
  const [isSupervisor, setIsSupervisor] = useState(false);
  const [currentUser, setCurrentUser] = useState<{
    name: string;
    initials: string;
  }>({ name: '老师', initials: '老' });

  useEffect(() => {
    const sync = () => {
      const u = useAuthStore.getState().user;
      const sup = u?.teacherProfile?.isSupervisor === true;
      setIsSupervisor(sup);
      const name = u?.realName ?? u?.username ?? '老师';
      setCurrentUser({ name, initials: name.charAt(0) });
    };
    sync();
    return useAuthStore.subscribe(sync);
  }, []);

  // === 数据 ===
  const { data: studentsData, isLoading: studentsLoading } = useQuery({
    queryKey: ['teacher-dashboard-students'],
    queryFn: () => studentApi.getList({ pageSize: 200 }),
  });
  const { data: plansData, isLoading: plansLoading } = useQuery({
    queryKey: ['teacher-dashboard-pending-plans'],
    queryFn: () =>
      planApi.getTeacherPlans({ status: 'PENDING_REVIEW', pageSize: 100 }),
  });
  const { data: timelineData } = useQuery({
    queryKey: ['timeline', new Date().getFullYear()],
    queryFn: () => timelineApi.getTimeline(),
    staleTime: 1000 * 60 * 60,
  });

  // 接口可能返回 { data: { data: T[] } } 或 { data: T[] } 两种, 兼容
  const students: BackendStudent[] =
    (studentsData as any)?.data?.data ?? (studentsData as any)?.data ?? [];
  const pendingPlans: PendingPlan[] =
    (plansData as any)?.data?.data ?? (plansData as any)?.data ?? [];
  const timelineEvents: TimelineEvent[] = timelineData?.events ?? [];

  // === Clock — 客户端 mount 后再生成, 防 SSR/CSR 不一致 ===
  const [clock, setClock] = useState<Date | null>(null);
  useEffect(() => {
    setClock(new Date());
  }, []);
  const isLoading = studentsLoading || plansLoading || clock === null;

  // === 派生数据 ===
  const dashStudents = useMemo(
    () => categorize(students, pendingPlans, isSupervisor, clock?.getTime() ?? Date.now()),
    [students, pendingPlans, isSupervisor, clock],
  );

  const trackMe = dashStudents.filter((s) => s.track === 'me');
  const trackPar = dashStudents.filter((s) => s.track === 'parent');
  const trackSup = dashStudents.filter((s) => s.track === 'supervisor');
  const silent = dashStudents.filter((s) => s.silentDays >= 4);

  const avg = useMemo(() => {
    const scored = dashStudents
      .map((s) => s.score)
      .filter((x): x is number => typeof x === 'number');
    return scored.length
      ? Math.round(scored.reduce((a, b) => a + b, 0) / scored.length)
      : null;
  }, [dashStudents]);

  const countdowns = useMemo(
    () => buildCountdowns(timelineEvents, clock?.getTime() ?? Date.now()),
    [timelineEvents, clock],
  );

  // 高考倒计时单独算一个 — 设计稿 hero 没显示, 但保留以备 fallback 用
  const examDaysLeft = useMemo(() => {
    const gaokao = timelineEvents.find((e) => e.key === 'gaokao');
    const t = new Date(gaokao?.startDate ?? FALLBACK_EXAM_DATE).getTime();
    return Math.max(0, Math.ceil((t - (clock?.getTime() ?? Date.now())) / 86_400_000));
  }, [timelineEvents, clock]);

  // === Hero greeting ===
  const hour = clock?.getHours() ?? 10;
  const greeting = hour < 12 ? '早上好' : hour < 18 ? '下午好' : '晚上好';
  const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const dateLabel = clock
    ? `${WEEK[clock.getDay()]} · ${clock.getMonth() + 1} 月 ${clock.getDate()} 日`
    : '加载中...';

  const focusList = isSupervisor ? trackSup : trackMe;
  const focusN = focusList.length;

  // === 渲染 ===
  if (isLoading) {
    return (
      <div className="view-transition" style={{ textAlign: 'center', padding: 80 }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div className="view-transition">
      {/* —— Hero —— */}
      <div className="db-hero fade-up">
        <div className="db-hero-l">
          <div className="db-eyebrow">
            {dateLabel} · 距高考 {examDaysLeft} 天
          </div>
          <h1 className="db-greeting">
            {greeting}，<span className="nm">{currentUser.name}</span>
          </h1>
          <div className="db-hero-meta">
            <span>
              <strong>{students.length}</strong> 名签约学生
            </span>
            <span className="dot" />
            <span>
              平均 <strong>{avg ?? '--'}</strong> 分
            </span>
            <span className="dot" />
            <span>
              沉默学生 <strong>{silent.length}</strong> 名
            </span>
          </div>
        </div>
        <div className="db-focus">
          <div className="db-focus-num">{focusN}</div>
          <div className="db-focus-body">
            <div className="db-focus-k">{isSupervisor ? '待我审核' : '今日待动手'}</div>
            <div className="db-focus-avatars">
              {focusList.slice(0, 4).map((s) => (
                <Avatar student={s} size={26} key={s.id} />
              ))}
              {focusList.length > 4 ? (
                <span className="db-focus-more">+{focusList.length - 4}</span>
              ) : null}
            </div>
            <button
              type="button"
              className="db-focus-btn"
              onClick={() => router.push('/teacher/plans')}
            >
              立即处理{' '}
              <span style={{ width: 11, height: 11, display: 'inline-flex' }}>
                <TIcon.arrowRight />
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* —— 沉默学生 (顶部 alert) —— */}
      {silent.length > 0 && (
        <div className="db-silent fade-up d1">
          <div className="db-silent-head">
            <span className="db-silent-ic">
              <TIcon.alert />
            </span>
            <h3>沉默学生 · {silent.length} 名</h3>
            <span className="db-silent-sub">超过 4 天无互动,建议优先跟进</span>
          </div>
          <div className="db-silent-list">
            {silent.map((s) => (
              <div className="db-silent-row" key={s.id}>
                <Avatar student={s} size={32} />
                <div className="db-silent-body">
                  <div className="db-silent-name">{s.name}</div>
                  <div className="db-silent-state">{s.statusLabel}</div>
                </div>
                <div className="db-silent-days">
                  <span className="num">{s.silentDays}</span>
                  <span className="unit">天</span>
                </div>
                <button
                  type="button"
                  className="db-silent-act"
                  onClick={() => router.push(s.href)}
                >
                  联系跟进
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* —— 倒计时 3 卡 —— */}
      {countdowns.length > 0 && (
        <div className="db-countdowns fade-up d2">
          {countdowns.map((c) => (
            <div key={c.id} className={`db-cdn tone-${c.variant}`}>
              <div className="db-cdn-top">
                <div className="db-cdn-k">{c.label}</div>
                <div className="db-cdn-date">{c.note}</div>
              </div>
              <div className="db-cdn-v">
                <span className="num">{c.days}</span>
                <span className="unit">天</span>
              </div>
              <div className="db-cdn-bar">
                <span className="fill" style={{ width: `${c.pct}%` }} />
              </div>
              <div className="db-cdn-foot">报名周期 已过 {c.pct}%</div>
            </div>
          ))}
        </div>
      )}

      {/* —— Quick actions —— */}
      <div className="qa-row fade-up d3">
        {isSupervisor ? (
          <>
            <Link href="/teacher/plans?status=PENDING_REVIEW" className="qa primary">
              <TIcon.shield /> 处理 {pendingPlans.length} 份待审
            </Link>
            <Link href="/teacher/insights/team" className="qa">
              <TIcon.trendUp /> 团队报表
            </Link>
            <Link href="/teacher/students" className="qa">
              <TIcon.students /> 全班学生
            </Link>
          </>
        ) : (
          <>
            <Link href="/teacher/plans" className="qa primary">
              <TIcon.shield /> 处理 {trackMe.length} 项待办
            </Link>
            <Link href="/teacher/students/create" className="qa accent">
              <TIcon.plus /> 新建学生
            </Link>
            <button type="button" className="qa" disabled title="批量导入功能待接入">
              <TIcon.upload /> 批量导入
            </button>
            <Link href="/teacher/students" className="qa">
              <TIcon.students /> 班级清单
            </Link>
          </>
        )}
      </div>

      {/* —— 家长申请预约 (accent 强调) —— */}
      <ParentRequestsSection />

      {/* —— 今日沟通 (timeline) —— */}
      <TodayCommsSection students={dashStudents} onOpenStudent={(id) => router.push(`/teacher/students/${id}`)} />

      {/* —— 三轨待办板 —— */}
      <div className="section fade-up d5">
        <SectionHead title="今天该做什么" />
        <div className="track-board">
          <TodoTrack
            tone="me"
            icon="flame"
            title="等我动手"
            sub={`${trackMe.length} 项待动手 · 优先 ${
              trackMe.filter((s) => s.silentDays >= 4).length
            } 项`}
            list={trackMe}
            labelTone="rush"
            kind="me"
            actionKind="solid"
            onOpenStudent={(href) => router.push(href)}
          />
          <TodoTrack
            tone="parent"
            icon="send"
            title="等学生家长"
            sub={`${trackPar.length} 项等回复 · 平均 ${
              trackPar.length
                ? Math.round(
                    trackPar.reduce((s, x) => s + (x.lastActHours ?? 0), 0) /
                      trackPar.length /
                      24,
                  )
                : 0
            } 天`}
            list={trackPar}
            labelTone="accent"
            kind="parent"
            onOpenStudent={(href) => router.push(href)}
          />
          <TodoTrack
            tone="supervisor"
            icon="shield"
            title={isSupervisor ? '待我审核' : '等主管审核'}
            sub={`${trackSup.length} 份方案 · SLA 24 小时`}
            list={trackSup}
            labelTone="primary"
            kind={isSupervisor ? 'supervisorMy' : 'supervisor'}
            actionText={isSupervisor ? '审核' : '查看方案'}
            actionKind={isSupervisor ? 'solid' : 'outline'}
            onOpenStudent={(href) => router.push(href)}
          />
        </div>
      </div>
    </div>
  );
}

// ============================================================
//   子组件
// ============================================================

function TodoTrack({
  tone,
  icon,
  title,
  sub,
  list,
  labelTone,
  kind,
  actionText,
  actionKind,
  onOpenStudent,
}: {
  tone: 'me' | 'parent' | 'supervisor';
  icon: keyof typeof TIcon;
  title: string;
  sub: string;
  list: DashStudent[];
  labelTone: 'rush' | 'accent' | 'primary';
  kind: 'me' | 'parent' | 'supervisor' | 'supervisorMy';
  actionText?: string;
  actionKind?: 'outline' | 'solid';
  onOpenStudent: (href: string) => void;
}) {
  const I = TIcon[icon] ?? TIcon.flame;
  return (
    <div className={`track t-${tone}`}>
      <div className="track-head">
        <div className="lhs">
          <span className="ic">
            <I />
          </span>
          <div>
            <h3>{title}</h3>
            <div className="track-sub">{sub}</div>
          </div>
        </div>
        <span className={`num ${labelTone === 'rush' ? 'rush' : ''}`}>{list.length}</span>
      </div>
      <div className="track-body">
        {list.length === 0 ? (
          <TrackEmpty kind={kind} />
        ) : (
          list.map((s) => (
            <TodoCard
              key={s.id}
              student={s}
              label={s.statusLabel}
              labelTone={labelTone}
              sub={s.statusDetail}
              actionText={actionText ?? s.nextAction}
              actionKind={actionKind}
              onClick={() => onOpenStudent(s.href)}
              onAction={() => onOpenStudent(s.href)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function ParentRequestsSection() {
  const qc = useQueryClient();
  const { data: list = [] } = useQuery({
    queryKey: ['pending-requests'],
    queryFn: () => consultationApi.listPendingRequests(),
  });

  const confirmMutation = useMutation({
    mutationFn: (id: number) => consultationApi.confirmRequest(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pending-requests'] });
      qc.invalidateQueries({ queryKey: ['consultations-today'] });
      message.success('已确认');
    },
  });
  const rejectMutation = useMutation({
    mutationFn: (id: number) => consultationApi.rejectRequest(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pending-requests'] });
      message.success('已拒绝');
    },
  });

  if (list.length === 0) return null;

  return (
    <div className="db-parent-card fade-up d3">
      <div className="db-parent-head">
        <span className="db-parent-dot" />
        <h3>家长申请预约</h3>
        <span className="db-parent-sub">
          {list.length} 条待响应 · 建议 2 小时内回复
        </span>
      </div>
      {list.map((r) => {
        const name = r.student?.user?.realName ?? r.student?.user?.username ?? '学生';
        const time = new Date(r.scheduledAt).toLocaleString('zh-CN', {
          month: 'numeric',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
        return (
          <div className="db-parent-row" key={r.id}>
            <Avatar
              student={{ id: r.id, name, initials: name.charAt(0), tone: 't-amber' }}
              size={36}
            />
            <div className="info">
              <div className="name">
                {name} <span className="grey">的家长</span>
              </div>
              <div className="meta">
                <span>
                  <TIcon.clock />
                  {time}
                </span>
                <span>
                  <ChannelIcon kind={r.channel} />
                  {CHANNEL_TXT[r.channel]} · 预计 {r.durationEst ?? 30} 分
                </span>
                {r.purpose ? <span className="topic">{r.purpose}</span> : null}
              </div>
            </div>
            <div className="actions">
              <button
                type="button"
                className="btn-confirm"
                disabled={confirmMutation.isPending}
                onClick={() => confirmMutation.mutate(r.id)}
              >
                <TIcon.check /> 确认
              </button>
              <button
                type="button"
                className="btn-decline"
                disabled={rejectMutation.isPending}
                onClick={() => rejectMutation.mutate(r.id)}
              >
                拒绝
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TodayCommsSection({
  students,
  onOpenStudent,
}: {
  students: DashStudent[];
  onOpenStudent: (id: number | string) => void;
}) {
  const { data: rawList = [] } = useQuery({
    queryKey: ['consultations-today'],
    queryFn: () => consultationApi.listToday(),
  });
  // requested 已在 ParentRequestsSection 处理, 不重复
  const list = rawList.filter((c) => c.status !== 'requested');

  if (list.length === 0) return null;

  return (
    <div className="section fade-up d4">
      <SectionHead
        title="今日沟通"
        count={`${list.length} 条`}
        action={
          <Link href="/teacher/clinic" className="more">
            查看全部 <TIcon.chevRight />
          </Link>
        }
      />
      <div className="db-timeline">
        {list.map((c) => {
          const name = c.student?.user?.realName ?? c.student?.user?.username ?? '学生';
          const stu =
            students.find((s) => s.id === c.studentId) ?? {
              id: c.studentId,
              name,
              initials: name.charAt(0),
              tone: pickTone(c.studentId),
            };
          const t = new Date(c.scheduledAt);
          const hh = t.getHours();
          const ampm = hh < 12 ? 'AM' : 'PM';
          const time = t.toLocaleTimeString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          });
          const isLive = c.status === 'in_progress';
          return (
            <div
              className={`db-tl-item ${isLive ? 'is-live' : ''}`}
              key={c.id}
              onClick={() => onOpenStudent(stu.id)}
            >
              <div className="db-tl-time">
                <span className="hh">{time}</span>
                <span className="ampm">{ampm}</span>
              </div>
              <div className="db-tl-dot">{isLive ? <span className="pulse" /> : null}</div>
              <div className="db-tl-card">
                <div className="head">
                  <Avatar student={stu} size={28} />
                  <strong>{name}</strong>
                  <span className="ch">
                    <ChannelIcon kind={c.channel} />
                    {CHANNEL_TXT[c.channel]}
                  </span>
                  <span className="est">预计 {c.durationEst ?? 30} 分</span>
                  <span className="st">
                    <StatusChip status={c.status} dict={COMM_STATUS_TXT} />
                  </span>
                </div>
                {c.purpose ? <div className="topic">{c.purpose}</div> : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
