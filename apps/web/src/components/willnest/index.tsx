/**
 * WillNest 教师工作台共享组件 (从设计稿 components.jsx 移植).
 * 改造点:
 * - 删 window.WN_TEACHER 全局依赖, 改 props 传入
 * - 删 Object.assign(window, ...) 暴露, 改 ES module export
 * - 加 TypeScript 类型
 *
 * 配套的 CSS 在 apps/web/src/styles/willnest-teacher.css (全局 import).
 * className 保持设计稿原样 (.av, .sb, .ph, .todo, .empty, .st-chip 等).
 */
import React from 'react';

// ============================================================
// Icon set (Lucide outline 风格 SVG, 24×24, 全部用 currentColor)
// ============================================================
type IconFn = () => React.ReactElement;

export const TIcon: Record<string, IconFn> = {
  lock: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  ),
  dashboard: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="9" />
      <rect x="14" y="3" width="7" height="5" />
      <rect x="14" y="12" width="7" height="9" />
      <rect x="3" y="16" width="7" height="5" />
    </svg>
  ),
  students: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  plans: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="14" y2="17" />
    </svg>
  ),
  history: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <polyline points="3 4 3 10 9 10" />
      <line x1="12" y1="7" x2="12" y2="12" />
      <line x1="12" y1="12" x2="15.5" y2="14" />
    </svg>
  ),
  clinic: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M9 12h6" />
      <path d="M12 9v6" />
    </svg>
  ),
  reflect: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  ),
  team: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 11l-3-3-3 3" />
      <line x1="19" y1="8" x2="19" y2="15" />
    </svg>
  ),
  uni: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9.5 12 4l9 5.5" />
      <path d="M5 10v9h14v-9" />
      <path d="M9 19v-5h6v5" />
    </svg>
  ),
  major: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16v6H4z" />
      <path d="M4 14h16v6H4z" />
      <line x1="7" y1="7" x2="13" y2="7" />
      <line x1="7" y1="17" x2="13" y2="17" />
    </svg>
  ),
  help: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  logout: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  ),
  search: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  ),
  bell: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  ),
  clock: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 15 14" />
    </svg>
  ),
  flame: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 17v0a2.5 2.5 0 0 0 2.5-2.5c0-1.5-1-2-1-3 0 0 .5 1 2 1 1.5 0 2.5-1.5 2.5-3 0-1.5-1.5-2.5-1.5-4 0-1 1-1.5 1-3 0-1-1.5-2-3-2 0 0 1 1 1 3 0 1.5-1 3-2 3-2 0-2-3-2-3s-2 1-2 4c0 1 .5 1 .5 2.5 0 1.5-1 2-1 3.5z" />
    </svg>
  ),
  send: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  ),
  shield: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
  check: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  info: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  ),
  close: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  x: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  chevDown: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  ),
  chevRight: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  ),
  chevLeft: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  ),
  plus: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  ),
  upload: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  ),
  download: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  ),
  sparkles: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
    </svg>
  ),
  save: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <polyline points="17 21 17 13 7 13 7 21" />
      <polyline points="7 3 7 8 15 8" />
    </svg>
  ),
  alert: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  silent: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M9 15a3 3 0 0 1 6 0" />
      <line x1="9" y1="9" x2="9.01" y2="9" />
      <line x1="15" y1="9" x2="15.01" y2="9" />
    </svg>
  ),
  phone: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.37 1.9.72 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.35 1.85.59 2.81.72A2 2 0 0 1 22 16.92z" />
    </svg>
  ),
  wechat: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  ),
  video: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="23 7 16 12 23 17 23 7" />
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
    </svg>
  ),
  inperson: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  ),
  link: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  ),
  arrowRight: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  ),
  user: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
  card: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
  filter: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  ),
  edit: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  ),
  excel: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="9" y1="13" x2="15" y2="19" />
      <line x1="15" y1="13" x2="9" y2="19" />
    </svg>
  ),
  trendUp: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
      <polyline points="17 6 23 6 23 12" />
    </svg>
  ),
};

// ============================================================
// 类型
// ============================================================
export interface WnStudent {
  id: number | string;
  name: string;
  initials: string;
  tone?: string; // 'gold' | 't-blue' | 't-amber' 等
}

export interface WnUser {
  id: number | string;
  name: string;
  initials: string;
  role?: string;
  team?: string;
  isSupervisor?: boolean;
}

// ============================================================
// 简单组件
// ============================================================

export function ChannelIcon({ kind }: { kind: keyof typeof TIcon }) {
  const I = TIcon[kind] || TIcon.phone;
  return <I />;
}

export function Avatar({ student, size = 36, className = '', gold = false }: {
  student: WnStudent;
  size?: number;
  className?: string;
  gold?: boolean;
}) {
  const cls = `av ${student.tone || 't-blue'} ${gold ? 'gold' : ''} ${className}`.trim();
  return (
    <span
      className={cls}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.45) }}
      title={student.name}
    >
      {student.initials}
    </span>
  );
}

export function StatusChip({ status, dict }: { status: string; dict: Record<string, string> }) {
  const label = dict[status] || status;
  return <span className={`st-chip st-${status}`}>{label}</span>;
}

export function PlanStatusChip({ status, dict, toneDict }: {
  status: string;
  dict: Record<string, string>;
  toneDict: Record<string, string>;
}) {
  const txt = dict[status] || status;
  const tone = toneDict[status] || 'gray';
  const cls = ({
    rush: 'st-no_show',
    accent: 'st-requested',
    primary: 'st-scheduled',
    safe: 'st-completed',
    gray: 'st-cancelled',
  } as Record<string, string>)[tone] || 'st-cancelled';
  return <span className={`st-chip ${cls}`}>{txt}</span>;
}

export function PageHeader({ eyebrow, title, meta, actions, fresh = '刚刚' }: {
  eyebrow?: string;
  title: React.ReactNode;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  fresh?: string;
}) {
  return (
    <div className="ph">
      <div className="lhs">
        {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
        <h1>{title}</h1>
        {meta ? (
          <div className="meta">
            {meta}
            {fresh ? <span className="fresh">数据更新于 {fresh}</span> : null}
          </div>
        ) : null}
      </div>
      {actions ? <div className="rhs">{actions}</div> : null}
    </div>
  );
}

export function TodoCard({ student, label, labelTone = 'gray', sub, actionText, actionKind = 'outline', onClick, onAction }: {
  student: WnStudent;
  label?: string;
  labelTone?: string;
  sub?: React.ReactNode;
  actionText?: string;
  actionKind?: 'outline' | 'solid';
  onClick?: () => void;
  onAction?: () => void;
}) {
  return (
    <div className="todo" onClick={onClick}>
      <Avatar student={student} size={36} />
      <div className="body">
        <div className="name">
          {student.name}
          {label ? <span className={`label ${labelTone}`}>{label}</span> : null}
        </div>
        {sub ? <div className="sub">{sub}</div> : null}
      </div>
      {actionText ? (
        <button
          className={`btn ${actionKind === 'solid' ? 'solid' : ''}`}
          onClick={(e) => { e.stopPropagation(); onAction?.(); }}
        >
          {actionText}
        </button>
      ) : null}
    </div>
  );
}

export function SectionHead({ title, count, action }: {
  title: React.ReactNode;
  /** 接受数字或字符串等任意 React 节点 (设计稿里有传 `${n} 条` 这种串) */
  count?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="section-head">
      <h2>{title}</h2>
      {count != null ? <span className="count">{count}</span> : null}
      <span className="line" />
      {action}
    </div>
  );
}

export function Empty({ icon = 'sparkles', title = '所有学生待办都不在你这里 ✓', sub }: {
  icon?: keyof typeof TIcon;
  title?: React.ReactNode;
  sub?: React.ReactNode;
}) {
  const I = TIcon[icon] || TIcon.sparkles;
  return (
    <div className="empty">
      <div className="em-glyph"><I /></div>
      <div className="em-title">{title}</div>
      {sub ? <div className="em-sub">{sub}</div> : null}
    </div>
  );
}

export function TrackEmpty({ kind }: { kind: 'me' | 'parent' | 'supervisor' | 'supervisorMy' }) {
  const msg: Record<string, [string, string]> = {
    me: ['✓', '所有学生待办都不在你这里'],
    parent: ['—', '学生家长侧无待办'],
    supervisor: ['—', '无方案在主管手上'],
    supervisorMy: ['—', '暂无方案待我审核'],
  };
  const [icon, text] = msg[kind] || ['—', '暂无'];
  return (
    <div className="track-empty">
      <div className="em">{icon}</div>
      <div>{text}</div>
    </div>
  );
}

export function SubjectChip({ exam }: { exam?: 'PHYSICS' | 'HISTORY' | null }) {
  if (!exam) return null;
  const cls = exam === 'PHYSICS' ? 'physics' : 'history';
  const txt = exam === 'PHYSICS' ? '物理类' : '历史类';
  return <span className={`subj-chip ${cls}`}>{txt}</span>;
}

// ============================================================
// Sidebar (设计稿原版自带 nav 数据, 这里改为外部 props 让 next/link 接管)
// ============================================================
export interface SidebarItem {
  id: string;
  label: string;
  icon: keyof typeof TIcon;
  href: string;
  badge?: { n: number; kind?: 'rush' | 'gold' } | null;
}

export interface SidebarGroup {
  label: string;
  items: SidebarItem[];
}

export function Sidebar({
  active,
  groups,
  currentUser,
  isSupervisor,
  onLogout,
  ItemWrapper = ({ children, onClick }: any) => (
    <button onClick={onClick}>{children}</button>
  ),
}: {
  active: string;
  groups: SidebarGroup[];
  currentUser: WnUser;
  isSupervisor: boolean;
  onLogout?: () => void;
  /** 注入路由组件 (next/link 在 client 端用; 测试可以用 button) */
  ItemWrapper?: React.ComponentType<{ href: string; onClick?: () => void; children: React.ReactNode }>;
}) {
  return (
    <aside className="sb">
      <div className="sb-brand">
        <div className="txt">
          <span className="zh">智愿家</span>
          <span className="en">Teacher Workspace</span>
        </div>
      </div>

      {groups.map((g) => (
        <div className="sb-group" key={g.label}>
          <div className="sb-group-label">{g.label}</div>
          {g.items.map((it) => {
            const Ic = TIcon[it.icon];
            return (
              <ItemWrapper key={it.id} href={it.href}>
                <span className={`sb-item ${active === it.id ? 'is-active' : ''}`}>
                  <Ic />
                  <span className="text">{it.label}</span>
                  {it.badge ? (
                    <span className={`count ${it.badge.kind || ''}`}>{it.badge.n}</span>
                  ) : null}
                </span>
              </ItemWrapper>
            );
          })}
        </div>
      ))}

      <div className="sb-foot">
        <div className="sb-user">
          <span className={`av ${isSupervisor ? 'gold' : ''}`}>{currentUser.initials}</span>
          <div className="who">
            <span className="name">{currentUser.name}</span>
            <span className="sub">
              {currentUser.role ?? ''}
              {currentUser.team ? ` · ${currentUser.team}` : ''}
            </span>
          </div>
        </div>
        <div className="small-row">
          <a href="#help"><TIcon.help /> 帮助</a>
          <button
            type="button"
            onClick={onLogout}
            style={{ background: 'none', border: 0, padding: 0, color: 'inherit', cursor: 'pointer' }}
          >
            <TIcon.logout /> 退出
          </button>
        </div>
      </div>
    </aside>
  );
}

// ============================================================
// Utility
// ============================================================

export function fmtMins(m: number | null | undefined): string {
  if (m == null) return '—';
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (h === 0) return `${mm}分`;
  if (mm === 0) return `${h}h`;
  return `${h}h ${mm}m`;
}

export function fmtAgo(hours: number | null | undefined): string {
  if (hours == null) return '—';
  if (hours < 1) return '刚刚';
  if (hours < 24) return `${hours} 小时前`;
  const d = Math.floor(hours / 24);
  return `${d} 天前`;
}
