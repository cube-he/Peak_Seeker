'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Alert, Button, Drawer, Empty, Input, Pagination, Select, Spin, Switch, Table, Tooltip, message } from 'antd';
import { DurationLabel } from './DurationLabel';
import {
  BookOutlined,
  CloseOutlined,
  ReadOutlined,
  RightOutlined,
  SearchOutlined,
  StarFilled,
  StarOutlined,
  SwapOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import MainLayout from '@/components/layout/MainLayout';
import { majorService, type MajorQueryParams } from '@/services/major';
import { favoriteService } from '@/services/favorite';
import { useAuthStore } from '@/stores/authStore';
import { studentApi } from '@/services/student-api';
import PreferredMajorTierFormItem from '@/components/student/preferred-majors/PreferredMajorTierFormItem';
import { coerceTierShape, normalize } from '@/components/student/preferred-majors/PreferredMajorTierEditor';
import type { PreferredMajorTier } from '@/components/student/preferred-majors/types';
import { useMajorOptions } from '@/components/student/picker/options/useMajorOptions';
import { FIELD_LABELS } from '@/components/student/stage-fields';
import { useWorkbench } from '@/stores/workbenchStore';
import { levelMismatchTag, type EligibleLevel } from '@/lib/level-mismatch';
// 意向池编辑器样式 (pm-*) scope 在 .wn-teacher-scope 下, 抽屉内包同名容器复用
import '@/styles/willnest-teacher.css';

// 本科学科门类（13 个，含 2026 新设的交叉学科）
const CATEGORIES = [
  '哲学', '经济学', '法学', '教育学', '文学', '历史学',
  '理学', '工学', '农学', '医学', '管理学', '艺术学', '交叉学科',
];

// 高职专科 19 个专业大类
const VOCATIONAL_CATEGORIES = [
  '农林牧渔大类', '资源环境与安全大类', '能源动力与材料大类', '土木建筑大类',
  '水利大类', '装备制造大类', '生物与化工大类', '轻工纺织大类',
  '食品药品与粮食大类', '交通运输大类', '电子与信息大类', '医药卫生大类',
  '财经商贸大类', '旅游大类', '文化艺术大类', '新闻传播大类',
  '教育与体育大类', '公安与司法大类', '公共管理与服务大类',
];

const LEVELS = ['本科', '专科'];

// 选考建议筛选项（新高考选考科目）
const ELECTIVE_SUBJECTS = ['物理', '历史', '化学', '生物', '政治', '地理'];

// 2025 批次结构表 10 批次 (按投档顺序, 与详情页 BATCH_ORDER 同源)
const BATCH_OPTIONS = [
  '本科提前批(国家专项)', '本科提前批A段', '本科提前批(高校专项)', '本科提前批B段',
  '本科批A段', '本科批(高校专项)', '本科批B段', '本科批(区域教育均衡发展专项)',
  '高职(专科)提前批', '高职(专科)批',
].map((b) => ({ label: b, value: b }));

// 特殊招生形式 (value 为 scRecruitTypes 的 contains 子串, 选项按 2025 在川计划 recruit_type 实际值整理)
const RECRUIT_FORM_OPTIONS = [
  { label: '订单定向医学生', value: '订单定向' },
  { label: '公费师范', value: '公费师范' },
  { label: '优师计划', value: '优师' },
  { label: '民族班', value: '民族班' },
  { label: '少数民族预科', value: '预科' },
  { label: '定向培养军士', value: '军士' },
  { label: '军事类', value: '军事类' },
  { label: '公安/司法类', value: '公安' },
  { label: '航海类', value: '航海类' },
  { label: '高校综合评价', value: '综合评价' },
  { label: '乡村振兴计划', value: '乡村振兴' },
  { label: '中外合作办学', value: '中外合作' },
];

/** 学生位次 vs 专业位次带 (lane 科类) → 匹配信号. 位次数值越小越好 */
type MatchSignal = 'safe' | 'fit' | 'rush' | 'out';
function matchSignal(rank: number, lo?: number | null, hi?: number | null): MatchSignal | null {
  if (hi == null) return null; // 该科类无位次数据, 不给信号
  if (lo != null && rank <= lo) return 'safe'; // 优于带内最好校 → 稳
  if (rank <= hi) return 'fit'; // 带内 → 部分院校可及
  if (rank <= hi * 1.2) return 'rush'; // 超带 ≤20% → 冲刺区
  return 'out';
}

const SIGNAL_UI: Record<MatchSignal, { text: string; cls: string; tip: string }> = {
  safe: { text: '稳', cls: 'bg-stable-fixed text-safe', tip: '学生位次优于该专业去年所有院校的最低位次' },
  fit: { text: '可选', cls: 'bg-primary-fixed text-primary', tip: '学生位次落在去年各校最低位次带内，可选带内部分院校' },
  rush: { text: '偏冲', cls: 'bg-amber-100 text-amber-700', tip: '超出去年位次带 20% 以内，可作冲刺志愿' },
  out: { text: '够不着', cls: 'bg-surface-dim text-text-muted', tip: '按去年位次数据，超出该专业位次带较多' },
};

const CATEGORY_COLORS: Record<string, string> = {
  哲学: '#7c3aed',
  经济学: '#b8860b',
  法学: '#c53030',
  教育学: '#276749',
  文学: '#be185d',
  历史学: '#78716c',
  理学: '#2c5282',
  工学: '#4f46e5',
  农学: '#15803d',
  医学: '#e11d48',
  管理学: '#0284c7',
  艺术学: '#9333ea',
  交叉学科: '#0d9488',
};

type ActiveFilter = {
  key: keyof MajorQueryParams;
  label: string;
};

function parseRate(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function formatSalary(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '--';
  if (value >= 1000) return `¥${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)}k`;
  return `¥${value}`;
}

// 热度值(人) → "X.X万"；非上榜专业返回 null（不显示）
function formatHeat(value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return `${(value / 10000).toFixed(1)}万`;
}

function CategoryNav({
  categories,
  selected,
  onSelect,
  counts,
}: {
  categories: string[];
  selected: string | undefined;
  onSelect: (category: string | undefined) => void;
  counts: Record<string, number>;
}) {
  return (
    <aside className="rounded-xl bg-surface py-4 shadow-card lg:sticky lg:top-20">
      <div className="mb-2 flex items-center gap-2 px-4 font-serif text-sm font-semibold text-text">
        <BookOutlined className="text-primary" />
        学科门类
      </div>
      <button
        type="button"
        onClick={() => onSelect(undefined)}
        className={`flex w-full items-center justify-between border-0 px-4 py-2.5 text-left text-sm transition-colors ${
          !selected ? 'bg-primary-fixed font-medium text-primary' : 'bg-transparent text-text-secondary hover:bg-bg hover:text-text'
        }`}
      >
        <span>全部门类</span>
        <RightOutlined className={`text-[10px] ${!selected ? 'opacity-100' : 'opacity-0'}`} />
      </button>
      {categories.map((category) => (
        <button
          key={category}
          type="button"
          onClick={() => onSelect(selected === category ? undefined : category)}
          className={`flex w-full items-center justify-between border-0 px-4 py-2.5 text-left text-sm transition-colors ${
            selected === category ? 'bg-primary-fixed font-medium text-primary' : 'bg-transparent text-text-secondary hover:bg-bg hover:text-text'
          }`}
        >
          <span className="flex min-w-0 items-center gap-2">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: CATEGORY_COLORS[category] || '#94a3b8' }}
            />
            <span className="truncate">{category}</span>
          </span>
          <span className="ml-2 text-[11px] text-text-faint tabular-nums">
            {counts[category] ?? ''}
          </span>
        </button>
      ))}
    </aside>
  );
}

function FilterChip({
  label,
  onRemove,
}: {
  label: string;
  onRemove: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onRemove}
      className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-3 py-1 text-[11px] text-text-secondary transition-colors hover:border-primary hover:text-primary"
    >
      {label}
      <CloseOutlined className="text-[9px]" />
    </button>
  );
}

// 物理/历史类最低分带格: 该专业各院校投档最低分的跨校范围, 悬停补位次带
function BandCell({
  label, lo, hi, rankLo, rankHi, year, colorClass,
}: {
  label: string;
  lo?: number | null;
  hi?: number | null;
  rankLo?: number | null;
  rankHi?: number | null;
  year?: number | null;
  colorClass: string;
}) {
  if (lo == null) {
    return (
      <div className="text-center">
        <div className="text-[10px] uppercase tracking-[1.2px] text-text-muted">{label}</div>
        <div className="mt-1 font-serif text-lg font-semibold text-text-muted">--</div>
        <div className="text-[10px] text-text-faint">无录取数据</div>
      </div>
    );
  }
  const band = hi != null && hi !== lo ? `${lo}~${hi}` : `${lo}`;
  const rankBand =
    rankLo != null
      ? rankHi != null && rankHi !== rankLo
        ? `${rankLo.toLocaleString()}~${rankHi.toLocaleString()}`
        : rankLo.toLocaleString()
      : null;
  return (
    <Tooltip title={`${year ?? ''} 年该专业各院校最低分跨度${rankBand ? `；对应位次 ${rankBand}` : ''}`}>
      <div className="text-center" style={{ cursor: 'help' }}>
        <div className="text-[10px] uppercase tracking-[1.2px] text-text-muted">{label}</div>
        <div className={`mt-1 font-serif text-lg font-semibold tabular-nums ${colorClass}`}>{band}</div>
        <div className="text-[10px] text-text-faint">{year} 各校最低分带</div>
      </div>
    </Tooltip>
  );
}

export function MajorCard({
  major,
  favorited,
  onToggleFav,
  inCompare,
  onToggleCompare,
  poolEnabled,
  inPool,
  onAddToPool,
  signal,
  eligibleLevel = null,
}: {
  major: any;
  favorited: boolean;
  onToggleFav: (major: any) => void;
  inCompare: boolean;
  onToggleCompare: (major: any) => void;
  /* 老师选定学生后的意向池一键加入 */
  poolEnabled: boolean;
  inPool: boolean;
  onAddToPool: (major: any) => void;
  /* 学生位次 vs 专业位次带的匹配信号 (学生模式下才有) */
  signal: MatchSignal | null;
  /* 学生可上层次, 用于标记专业层次与之不符 (如本科生看到专科专业) */
  eligibleLevel?: EligibleLevel;
}) {
  const employmentRate = parseRate(major.employmentRate);
  const categoryColor = CATEGORY_COLORS[major.category] || '#1e3a5f';
  const tags = [major.category, major.discipline, major.degree, major.level, major.softRating]
    .filter(Boolean)
    .slice(0, 5);
  // 卡片整体是 Link, 内部操作按钮需要拦截导航
  const stop = (e: React.MouseEvent, fn: () => void) => {
    e.preventDefault();
    e.stopPropagation();
    fn();
  };

  return (
    <Link
      href={`/majors/${major.id}`}
      className={`block rounded-xl bg-surface p-5 text-text no-underline shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover ${
        signal === 'out' ? 'opacity-55' : ''
      }`}
    >
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="m-0 truncate font-serif text-[20px] font-semibold leading-tight text-text">
            {major.name}
          </h3>
          {(() => {
            const flag = levelMismatchTag(major.level, eligibleLevel);
            return flag ? (
              <span className="major-level-flag ml-2 align-middle text-[12px] text-text-muted">{`（${flag}）`}</span>
            ) : null;
          })()}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="inline-flex rounded bg-bg px-2 py-0.5 font-mono text-[11px] text-text-muted">
              {major.code || '暂无代码'}
            </span>
            {typeof major.setupYear === 'number' && major.setupYear >= 2024 && (
              <span className="inline-flex rounded bg-accent px-2 py-0.5 text-[11px] font-medium text-white">
                {major.setupYear} 新增
              </span>
            )}
            {/* 热度徽标：仅 2025 本科热度 TOP50 显示 */}
            {typeof major.popularityRank === 'number' && (
              <span className="inline-flex items-center rounded bg-[#fff2e8] px-2 py-0.5 text-[11px] font-medium text-[#fa541c]">
                🔥 热度第{major.popularityRank}
                {formatHeat(major.popularityHeat) ? ` · ${formatHeat(major.popularityHeat)}` : ''}
              </span>
            )}
          </div>
        </div>
        <span className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={(e) => stop(e, () => onToggleFav(major))}
            title={favorited ? '取消收藏' : '收藏专业'}
            className="flex h-7 w-7 items-center justify-center rounded-full border-0 bg-bg text-sm transition-colors hover:bg-surface-dim"
          >
            {favorited
              ? <StarFilled className="text-amber-500" />
              : <StarOutlined className="text-text-muted" />}
          </button>
          {signal ? (
            <Tooltip title={SIGNAL_UI[signal].tip}>
              <span
                className={`rounded-full px-3 py-1 text-[11px] font-medium ${SIGNAL_UI[signal].cls}`}
                style={{ cursor: 'help' }}
              >
                {SIGNAL_UI[signal].text}
              </span>
            </Tooltip>
          ) : (
            <span className="rounded-full bg-accent-fixed px-3 py-1 text-[11px] font-medium text-accent">
              {major.isRestricted ? '限报提示' : '可填报'}
            </span>
          )}
        </span>
      </div>

      {/* 在川招录事实 (物化列): 计划规模 + 物理/历史最低分带; 无计划 = 重要负信号, 灰条提示 */}
      {major.scPlanCount != null ? (
        <div className="grid grid-cols-3 gap-3 border-y border-border-subtle py-4">
          <div className="text-center">
            <div className="text-[10px] uppercase tracking-[1.2px] text-text-muted">在川计划</div>
            <div className="mt-1 font-serif text-lg font-semibold text-text tabular-nums">
              {major.scPlanCount}
              <span className="text-xs font-normal text-text-muted"> 人</span>
            </div>
            <div className="text-[10px] text-text-faint">{major.scPlanUnis} 所院校 · {major.scPlanYear}</div>
          </div>
          <BandCell
            label="物理类最低分"
            lo={major.scPhyScoreLo} hi={major.scPhyScoreHi}
            rankLo={major.scPhyRankLo} rankHi={major.scPhyRankHi}
            year={major.scScoreYear} colorClass="text-blue-700"
          />
          <BandCell
            label="历史类最低分"
            lo={major.scHisScoreLo} hi={major.scHisScoreHi}
            rankLo={major.scHisRankLo} rankHi={major.scHisRankHi}
            year={major.scScoreYear} colorClass="text-rose-700"
          />
        </div>
      ) : (
        <div className="border-y border-border-subtle py-4 text-center text-xs text-text-muted">
          近年无在川招生计划
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {/* 批次覆盖: 最多平铺 2 个, 其余收进悬停 */}
        {(major.scBatches ? String(major.scBatches).split('、') : []).slice(0, 2).map((b: string) => (
          <span key={b} className="rounded bg-accent-fixed px-2 py-0.5 text-[11px] font-medium text-accent">
            {b}
          </span>
        ))}
        {major.scBatches && String(major.scBatches).split('、').length > 2 && (
          <Tooltip title={String(major.scBatches).split('、').join(' / ')}>
            <span className="rounded bg-accent-fixed px-2 py-0.5 text-[11px] font-medium text-accent" style={{ cursor: 'help' }}>
              +{String(major.scBatches).split('、').length - 2} 批次
            </span>
          </Tooltip>
        )}
        {/* 特殊招生形式 (公费师范/订单定向/民族班…), 紫色系区分于批次 */}
        {(major.scRecruitTypes ? String(major.scRecruitTypes).split('、') : []).slice(0, 2).map((f: string) => (
          <span key={f} className="rounded bg-[#f3e8ff] px-2 py-0.5 text-[11px] font-medium text-[#7c3aed]">
            {f}
          </span>
        ))}
        {major.scRecruitTypes && String(major.scRecruitTypes).split('、').length > 2 && (
          <Tooltip title={String(major.scRecruitTypes).split('、').join(' / ')}>
            <span className="rounded bg-[#f3e8ff] px-2 py-0.5 text-[11px] font-medium text-[#7c3aed]" style={{ cursor: 'help' }}>
              +{String(major.scRecruitTypes).split('、').length - 2}
            </span>
          </Tooltip>
        )}
        {/* 征集信号: 去年没录满, 保底参考 */}
        {typeof major.scSupplCount === 'number' && major.scSupplCount > 0 && (
          <Tooltip title={`去年征集志愿（补录）计划 ${major.scSupplCount} 人 — 第一轮未录满，报考热度不足，可作保底参考`}>
            <span className="rounded bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700" style={{ cursor: 'help' }}>
              征集 {major.scSupplCount}
            </span>
          </Tooltip>
        )}
        {major.electiveAdvice && (
          <span className="rounded bg-primary-fixed px-2 py-0.5 text-[11px] font-medium text-primary">
            选考 {major.electiveAdvice}
          </span>
        )}
        {tags.length > 0 ? (
          tags.map((tag) => (
            <span key={tag} className="rounded bg-bg px-2 py-0.5 text-[11px] text-text-tertiary">
              {tag}
            </span>
          ))
        ) : (
          !major.electiveAdvice && (
            <span className="rounded bg-bg px-2 py-0.5 text-[11px] text-text-faint">等待补充分类</span>
          )
        )}
      </div>

      {/* 全国静态指标降级为小字 (category 在上方 tags 已有, 不重复) */}
      <div className="mt-4 flex items-center justify-between border-t border-border-subtle pt-4 text-xs text-text-tertiary">
        <span className="inline-flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: categoryColor }} />
          <span>
            {employmentRate ? <>就业率 {employmentRate}% · </> : null}
            {typeof major.avgSalary === 'number' && major.avgSalary > 0 ? <>起薪 {formatSalary(major.avgSalary)} · </> : null}
            学制 <DurationLabel value={major.standardDuration || '4年'} />
          </span>
        </span>
        <span className="inline-flex items-center gap-3">
          {poolEnabled && (
            <button
              type="button"
              onClick={(e) => stop(e, () => onAddToPool(major))}
              className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] transition-colors ${
                inPool
                  ? 'border-safe bg-stable-fixed text-safe'
                  : 'border-accent bg-accent text-white hover:opacity-90'
              }`}
            >
              {inPool ? '已在意向 ✓' : '+ 意向池'}
            </button>
          )}
          <button
            type="button"
            onClick={(e) => stop(e, () => onToggleCompare(major))}
            className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] transition-colors ${
              inCompare
                ? 'border-primary bg-primary text-white'
                : 'border-border bg-transparent text-text-tertiary hover:border-primary hover:text-primary'
            }`}
          >
            <SwapOutlined className="text-[10px]" />
            {inCompare ? '对比中' : '对比'}
          </button>
          <span>查看详情 →</span>
        </span>
      </div>
    </Link>
  );
}

function MajorsPageInner() {
  // 支持从专业详情面包屑等入口带 ?category=&level= 进入并直接套用筛选
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState<MajorQueryParams>(() => {
    const level = searchParams.get('level');
    return {
      page: 1,
      pageSize: 12,
      category: searchParams.get('category') || undefined,
      level: level === '本科' || level === '专科' ? level : undefined,
    };
  });

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['majors', filters],
    queryFn: () => majorService.getList(filters),
  });

  const { data: categoriesData } = useQuery({
    queryKey: ['major-categories'],
    queryFn: () => majorService.getCategories(),
  });

  // ===== 收藏: 登录后可收藏专业 (与 /favorites 页同一体系) =====
  const { isLoggedIn, user } = useAuthStore();
  const queryClient = useQueryClient();
  const { data: favData } = useQuery({
    queryKey: ['favorites', 'major'],
    queryFn: () => favoriteService.getList('major'),
    enabled: isLoggedIn,
  });
  const favByMajorId = useMemo(() => {
    const map = new Map<number, number>();
    const list = (favData as any)?.data ?? favData ?? [];
    for (const f of Array.isArray(list) ? list : []) {
      if (f.majorId) map.set(f.majorId, f.id);
    }
    return map;
  }, [favData]);
  const toggleFav = async (major: any) => {
    if (!isLoggedIn) {
      message.info('登录后即可收藏专业');
      return;
    }
    const favId = favByMajorId.get(major.id);
    try {
      if (favId) {
        await favoriteService.remove(favId);
        message.success(`已取消收藏「${major.name}」`);
      } else {
        await favoriteService.add({ type: 'major', majorId: major.id });
        message.success(`已收藏「${major.name}」，可在“我的收藏”查看`);
      }
      queryClient.invalidateQueries({ queryKey: ['favorites', 'major'] });
    } catch {
      message.error('收藏操作失败，请重试');
    }
  };

  // ===== 对比: 跨页勾选 2-4 个专业, 底部浮条进入对比抽屉 =====
  const [compareList, setCompareList] = useState<any[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const toggleCompare = (major: any) => {
    setCompareList((prev) => {
      if (prev.some((m) => m.id === major.id)) return prev.filter((m) => m.id !== major.id);
      if (prev.length >= 4) {
        message.warning('最多同时对比 4 个专业');
        return prev;
      }
      return [...prev, major];
    });
  };

  // ===== 意向池工作台 (仅老师, 主管也是 TEACHER): 选学生 → 卡片一键进意向池 → 抽屉排梯队保存 =====
  const isTeacher = isLoggedIn && user?.role === 'TEACHER';
  // 学生上下文与院校库共享 (workbenchStore); URL ?studentId= 冷启动写入
  const workStudentId = useWorkbench((s) => s.studentId);
  const setWorkStudentId = useWorkbench((s) => s.setStudentId);
  useEffect(() => {
    const sid = searchParams.get('studentId');
    if (sid) setWorkStudentId(sid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [poolTiers, setPoolTiers] = useState<PreferredMajorTier[]>([]);
  const [poolDirty, setPoolDirty] = useState(false);
  const [poolOpen, setPoolOpen] = useState(false);
  const [poolSaving, setPoolSaving] = useState(false);

  const { data: studentListRaw } = useQuery({
    queryKey: ['workbench-students'],
    queryFn: () => studentApi.getList({ pageSize: 500 }),
    enabled: isTeacher,
  });
  const studentOptions = useMemo(() => {
    const list = (studentListRaw as any)?.data ?? [];
    return (Array.isArray(list) ? list : []).map((s: any) => {
      const name = s.user?.realName ?? s.realName ?? s.username ?? `#${s.id}`;
      return {
        label: s.provincialRank ? `${name} · 位次 ${Number(s.provincialRank).toLocaleString()}` : name,
        value: String(s.id),
      };
    });
  }, [studentListRaw]);

  const { data: workStudentRaw, refetch: refetchWorkStudent } = useQuery({
    queryKey: ['workbench-student', workStudentId],
    queryFn: () => studentApi.getById(workStudentId!),
    enabled: isTeacher && !!workStudentId,
  });
  const workStudent = (workStudentRaw as any)?.data ?? workStudentRaw ?? null;
  const workStudentName =
    workStudent?.user?.realName ?? workStudent?.realName ?? workStudent?.username ?? '';
  // 详情加载/学生切换后同步意向数据; dirty 时不覆盖, 防止冲掉老师未保存的编辑
  useEffect(() => {
    if (!workStudent || poolDirty) return;
    setPoolTiers(coerceTierShape(workStudent.preferredMajors));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workStudent]);

  const poolNames = useMemo(() => new Set(poolTiers.flatMap((t) => t.majors)), [poolTiers]);
  const { data: editorMajorOptions, isLoading: editorOptionsLoading } = useMajorOptions();

  // 学生首选科目 → 列表科类视角 ('物理'|'历史'|null)
  const studentLane: string | null =
    workStudent?.examType === 'PHYSICS' || workStudent?.firstChoice === '物理'
      ? '物理'
      : workStudent?.examType === 'HISTORY' || workStudent?.firstChoice === '历史'
        ? '历史'
        : null;
  const studentRank: number | null = workStudent?.provincialRank
    ? Number(workStudent.provincialRank)
    : null;
  // 选定学生(或科类首次加载)后默认按其科类过滤; 老师可用工作台条开关手动关
  useEffect(() => {
    setFilters((prev) =>
      prev.subjectLane === (studentLane ?? undefined)
        ? prev
        : { ...prev, subjectLane: studentLane ?? undefined, page: 1 },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentLane]);

  const savePool = async (tiers: PreferredMajorTier[], silent = false) => {
    if (!workStudentId) return false;
    setPoolSaving(true);
    try {
      await studentApi.update(workStudentId, { preferredMajors: normalize(tiers) } as any);
      setPoolDirty(false);
      if (!silent) message.success('意向专业已保存');
      refetchWorkStudent();
      return true;
    } catch {
      message.error('保存失败，请重试');
      return false;
    } finally {
      setPoolSaving(false);
    }
  };

  // 单击即落库: 老师不需要记得另外保存
  const addToPool = async (major: any) => {
    if (!workStudentId) {
      message.info('先在上方选择学生');
      return;
    }
    if (poolNames.has(major.name)) {
      message.info(`「${major.name}」已在意向列表`);
      return;
    }
    const next = poolTiers.map((t) => ({ tier: t.tier, majors: [...t.majors] }));
    const pool = next.find((t) => t.tier === 0);
    if (pool) pool.majors.push(major.name);
    else next.unshift({ tier: 0, majors: [major.name] });
    const prev = poolTiers;
    setPoolTiers(next);
    const ok = await savePool(next, true);
    if (ok) message.success(`已把「${major.name}」加入${workStudentName ? ` ${workStudentName} 的` : ''}意向池`);
    else setPoolTiers(prev); // 落库失败回滚, 避免卡片假性显示"已在意向"
  };

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    if (Array.isArray(categoriesData)) {
      categoriesData.forEach((category: any) => {
        if (category.value) counts[category.value] = category.count || 0;
      });
    }
    return counts;
  }, [categoriesData]);

  const activeFilters = useMemo<ActiveFilter[]>(() => {
    const items: ActiveFilter[] = [];
    if (filters.category) items.push({ key: 'category', label: filters.category });
    if (filters.level) items.push({ key: 'level', label: filters.level });
    if (filters.emerging) items.push({ key: 'emerging', label: '新兴专业' });
    if (filters.electiveSubject) items.push({ key: 'electiveSubject', label: `选考 ${filters.electiveSubject}` });
    if (filters.sortBy === 'salary') items.push({ key: 'sortBy', label: '按薪资排序' });
    if (filters.sortBy === 'popularity') items.push({ key: 'sortBy', label: '按热度排序' });
    if (filters.sortBy === 'plan') items.push({ key: 'sortBy', label: '按在川计划人数' });
    if (filters.subjectLane) items.push({ key: 'subjectLane', label: `只看${filters.subjectLane}类` });
    if (filters.batch) items.push({ key: 'batch', label: filters.batch });
    if (filters.recruitType) {
      items.push({
        key: 'recruitType',
        label: RECRUIT_FORM_OPTIONS.find((o) => o.value === filters.recruitType)?.label ?? filters.recruitType,
      });
    }
    if (filters.hasSupplementary) items.push({ key: 'hasSupplementary', label: '有征集 · 可捡漏' });
    return items;
  }, [filters.category, filters.level, filters.emerging, filters.electiveSubject, filters.sortBy,
      filters.subjectLane, filters.batch, filters.recruitType, filters.hasSupplementary]);

  const majors = data?.data || [];
  const total = data?.pagination?.total || 0;

  return (
    <MainLayout>
      <div className="pb-12">
        <div className="mb-6">
          <div className="mb-2 text-[11px] font-medium uppercase tracking-[2px] text-accent">
            Major Directory · 专业库
          </div>
          <h1 className="m-0 font-serif text-[32px] font-semibold leading-tight text-text sm:text-[36px]">
            {total > 0 ? total.toLocaleString() : '——'} 个专业
          </h1>
          <p className="mt-2 text-sm text-text-tertiary">
            覆盖本科与高职专科，对齐教育部最新专业目录。可按增设年份、选考建议、薪资筛选，帮你判断专业适配度。
          </p>
          <Link
            href="/majors/rankings"
            className="mt-3 inline-flex items-center gap-2 rounded-lg border border-accent/25 bg-accent-fixed px-4 py-2 text-sm font-medium text-accent transition hover:shadow-card"
          >
            🏆 专业排行榜
            <span className="text-xs font-normal text-text-tertiary">考公友好 · 热度 · 录取分 · 招生计划 · 征集捡漏</span>
            <RightOutlined className="text-xs" />
          </Link>
        </div>

        {/* 老师工作台: 选定学生后, 专业卡片出现"+ 意向池"一键加入 */}
        {isTeacher && (
          <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-accent/25 bg-accent-fixed p-4 shadow-card">
            <span className="flex items-center gap-2 text-sm font-semibold text-accent">
              <UserOutlined />
              为学生选专业
            </span>
            <Select
              showSearch
              allowClear
              placeholder="选择学生（可按姓名搜索）"
              style={{ minWidth: 250 }}
              options={studentOptions}
              value={workStudentId ?? undefined}
              optionFilterProp="label"
              onChange={(v) => {
                setWorkStudentId(v ?? null);
                setPoolDirty(false);
                setPoolTiers([]);
              }}
            />
            {workStudentId && workStudent ? (
              <>
                <span className="text-xs text-text-secondary">
                  {studentLane ? `${studentLane}类` : ''}
                  {studentRank ? ` · 位次 ${studentRank.toLocaleString()}` : ''}
                  {` · 意向 ${poolNames.size} 个`}
                </span>
                {studentLane && (
                  <span className="flex items-center gap-1.5 text-xs text-text-secondary">
                    <Switch
                      size="small"
                      checked={filters.subjectLane === studentLane}
                      onChange={(on) =>
                        setFilters({ ...filters, subjectLane: on ? studentLane : undefined, page: 1 })
                      }
                    />
                    只看{studentLane}类有招生
                  </span>
                )}
                <Button size="small" onClick={() => setPoolOpen(true)}>
                  编辑意向池 / 排序
                </Button>
                {/* 完整度分流出口: 资料齐 → 生成方案; 缺 → 去补全 (选了意向不代表资料完整) */}
                {workStudent.progress &&
                  (workStudent.progress.isRecommendable ? (
                    <Link href={`/teacher/plans/generate/${workStudentId}`}>
                      <Button size="small" type="primary">去生成方案 →</Button>
                    </Link>
                  ) : (
                    <Tooltip
                      title={`还缺: ${(workStudent.progress.missingFieldsForRecommend ?? [])
                        .map((f: string) => FIELD_LABELS[f] ?? f)
                        .join('、')}`}
                    >
                      <Link href={`/teacher/students/${workStudentId}`}>
                        <Button size="small" danger>
                          资料缺 {(workStudent.progress.missingFieldsForRecommend ?? []).length} 项 · 去补全
                        </Button>
                      </Link>
                    </Tooltip>
                  ))}
              </>
            ) : (
              <span className="text-xs text-text-muted">选择学生后，专业卡片可一键加入其意向池</span>
            )}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
          <div className="space-y-4">
            <CategoryNav
              categories={filters.level === '专科' ? VOCATIONAL_CATEGORIES : CATEGORIES}
              selected={filters.category}
              onSelect={(category) => setFilters({ ...filters, category, page: 1 })}
              counts={categoryCounts}
            />
          </div>

          <main className="min-w-0">
            <div className="mb-4 rounded-xl bg-surface p-4 shadow-card">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
                <Input
                  placeholder="搜索专业名 / 代码 / 关键词，例如“金融”“人工智能”"
                  prefix={<SearchOutlined className="text-text-muted" />}
                  value={filters.keyword}
                  onChange={(event) => setFilters({ ...filters, keyword: event.target.value, page: 1 })}
                  allowClear
                  className="min-w-0 flex-1"
                  size="large"
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setFilters({ ...filters, level: undefined, page: 1 })}
                    className={`rounded-md border-0 px-3.5 py-2 text-[13px] transition-colors ${
                      !filters.level ? 'bg-surface-high font-medium text-text shadow-[0_1px_2px_rgba(0,0,0,0.04)]' : 'bg-bg text-text-tertiary hover:text-primary'
                    }`}
                  >
                    全部
                  </button>
                  {LEVELS.map((level) => (
                    <button
                      key={level}
                      type="button"
                      onClick={() => setFilters({ ...filters, level: filters.level === level ? undefined : level, page: 1 })}
                      className={`rounded-md border-0 px-3.5 py-2 text-[13px] transition-colors ${
                        filters.level === level ? 'bg-surface-high font-medium text-text shadow-[0_1px_2px_rgba(0,0,0,0.04)]' : 'bg-bg text-text-tertiary hover:text-primary'
                      }`}
                    >
                      {level}
                    </button>
                  ))}
                </div>
              </div>

              {/* 第二行筛选：新兴专业 / 选考建议 / 薪资排序 */}
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border-subtle pt-3">
                <button
                  type="button"
                  onClick={() => setFilters({ ...filters, emerging: filters.emerging ? undefined : true, page: 1 })}
                  className={`rounded-md border-0 px-3.5 py-2 text-[13px] transition-colors ${
                    filters.emerging ? 'bg-accent font-medium text-white' : 'bg-bg text-text-tertiary hover:text-primary'
                  }`}
                >
                  新兴专业
                </button>
                <span className="mx-1 h-4 w-px bg-border" />
                <span className="text-[12px] text-text-muted">选考</span>
                {ELECTIVE_SUBJECTS.map((subj) => (
                  <button
                    key={subj}
                    type="button"
                    onClick={() => setFilters({ ...filters, electiveSubject: filters.electiveSubject === subj ? undefined : subj, page: 1 })}
                    className={`rounded-md border-0 px-3 py-2 text-[13px] transition-colors ${
                      filters.electiveSubject === subj ? 'bg-primary font-medium text-white' : 'bg-bg text-text-tertiary hover:text-primary'
                    }`}
                  >
                    {subj}
                  </button>
                ))}
                <span className="mx-1 h-4 w-px bg-border" />
                <button
                  type="button"
                  onClick={() => setFilters({ ...filters, sortBy: filters.sortBy === 'plan' ? undefined : 'plan', page: 1 })}
                  className={`rounded-md border-0 px-3.5 py-2 text-[13px] transition-colors ${
                    filters.sortBy === 'plan' ? 'bg-surface-high font-medium text-text shadow-[0_1px_2px_rgba(0,0,0,0.04)]' : 'bg-bg text-text-tertiary hover:text-primary'
                  }`}
                >
                  按在川计划人数
                </button>
                <button
                  type="button"
                  onClick={() => setFilters({ ...filters, sortBy: filters.sortBy === 'salary' ? undefined : 'salary', page: 1 })}
                  className={`rounded-md border-0 px-3.5 py-2 text-[13px] transition-colors ${
                    filters.sortBy === 'salary' ? 'bg-surface-high font-medium text-text shadow-[0_1px_2px_rgba(0,0,0,0.04)]' : 'bg-bg text-text-tertiary hover:text-primary'
                  }`}
                >
                  按薪资排序
                </button>
                <button
                  type="button"
                  onClick={() => setFilters({ ...filters, sortBy: filters.sortBy === 'popularity' ? undefined : 'popularity', page: 1 })}
                  className={`rounded-md border-0 px-3.5 py-2 text-[13px] transition-colors ${
                    filters.sortBy === 'popularity' ? 'bg-surface-high font-medium text-text shadow-[0_1px_2px_rgba(0,0,0,0.04)]' : 'bg-bg text-text-tertiary hover:text-primary'
                  }`}
                >
                  按热度排序
                </button>
              </div>

              {/* 第三行筛选: 批次 / 特殊招生形式 / 征集捡漏 */}
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border-subtle pt-3">
                <span className="text-[12px] text-text-muted">批次</span>
                <Select
                  size="small"
                  allowClear
                  placeholder="全部批次"
                  style={{ minWidth: 200 }}
                  options={BATCH_OPTIONS}
                  value={filters.batch}
                  onChange={(v) => setFilters({ ...filters, batch: v || undefined, page: 1 })}
                />
                <span className="mx-1 h-4 w-px bg-border" />
                <span className="text-[12px] text-text-muted">特殊形式</span>
                <Select
                  size="small"
                  allowClear
                  placeholder="公费师范 / 订单定向…"
                  style={{ minWidth: 185 }}
                  options={RECRUIT_FORM_OPTIONS}
                  value={filters.recruitType}
                  onChange={(v) => setFilters({ ...filters, recruitType: v || undefined, page: 1 })}
                />
                <span className="mx-1 h-4 w-px bg-border" />
                <Tooltip title="去年有征集志愿（第一轮未录满）的专业，报考热度不足，可作保底参考">
                  <button
                    type="button"
                    onClick={() => setFilters({ ...filters, hasSupplementary: filters.hasSupplementary ? undefined : true, page: 1 })}
                    className={`rounded-md border-0 px-3.5 py-2 text-[13px] transition-colors ${
                      filters.hasSupplementary ? 'bg-amber-600 font-medium text-white' : 'bg-bg text-text-tertiary hover:text-primary'
                    }`}
                  >
                    有征集 · 可捡漏
                  </button>
                </Tooltip>
              </div>
            </div>

            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-2 text-sm text-text-tertiary">
                <ReadOutlined className="text-primary" />
                找到 <strong className="font-serif text-lg font-semibold text-text tabular-nums">{total}</strong> 个专业
              </div>
              <div className="flex flex-wrap gap-2">
                {activeFilters.length > 0 ? (
                  activeFilters.map((item) => (
                    <FilterChip
                      key={item.key}
                      label={item.label}
                      onRemove={() => setFilters({ ...filters, [item.key]: undefined, page: 1 })}
                    />
                  ))
                ) : (
                  <span className="rounded-full border border-dashed border-border px-3 py-1 text-[11px] text-text-faint">
                    暂未限定条件
                  </span>
                )}
              </div>
            </div>

            {isLoading ? (
              <div className="flex justify-center rounded-xl bg-surface py-20 shadow-card">
                <Spin size="large" />
              </div>
            ) : isError ? (
              <div className="rounded-xl bg-surface p-6 shadow-card sm:p-8">
                <Alert
                  type="error"
                  showIcon
                  message="专业数据加载失败"
                  description={(error as Error)?.message || '请稍后刷新重试，或检查当前站点网络配置。'}
                />
              </div>
            ) : majors.length > 0 ? (
              <div className="grid gap-4 xl:grid-cols-2">
                {majors.map((major: any) => (
                  <MajorCard
                    key={major.id}
                    major={major}
                    favorited={favByMajorId.has(major.id)}
                    onToggleFav={toggleFav}
                    inCompare={compareList.some((m) => m.id === major.id)}
                    onToggleCompare={toggleCompare}
                    poolEnabled={isTeacher && !!workStudentId}
                    inPool={poolNames.has(major.name)}
                    onAddToPool={addToPool}
                    eligibleLevel={workStudent?.eligibleLevel ?? null}
                    signal={
                      studentRank != null && studentLane
                        ? matchSignal(
                            studentRank,
                            studentLane === '物理' ? major.scPhyRankLo : major.scHisRankLo,
                            studentLane === '物理' ? major.scPhyRankHi : major.scHisRankHi,
                          )
                        : null
                    }
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-xl bg-surface p-8 shadow-card sm:p-12">
                <Empty description="暂无匹配的专业" />
              </div>
            )}

            {total > 0 && (
              <div className="mt-8 flex justify-center">
                <Pagination
                  current={filters.page}
                  pageSize={filters.pageSize}
                  total={total}
                  showSizeChanger
                  showQuickJumper
                  showTotal={(count) => `共 ${count} 个专业`}
                  onChange={(page, pageSize) => setFilters({ ...filters, page, pageSize })}
                />
              </div>
            )}
          </main>
        </div>

        {/* 对比浮条: 有勾选时常驻底部 */}
        {compareList.length > 0 && (
          <div className="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full bg-primary px-4 py-2 text-white shadow-lg">
            <SwapOutlined className="text-sm" />
            <span className="hidden gap-1 sm:flex">
              {compareList.map((m) => (
                <span key={m.id} className="flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-xs">
                  {m.name}
                  <CloseOutlined className="cursor-pointer text-[9px]" onClick={() => toggleCompare(m)} />
                </span>
              ))}
            </span>
            <button
              type="button"
              disabled={compareList.length < 2}
              onClick={() => setCompareOpen(true)}
              className={`rounded-full border-0 px-3 py-1 text-xs font-medium ${
                compareList.length >= 2 ? 'bg-accent text-white' : 'bg-white/20 text-white/50'
              }`}
            >
              对比 ({compareList.length})
            </button>
            <button
              type="button"
              onClick={() => setCompareList([])}
              className="rounded-full border-0 bg-transparent px-1 text-xs text-white/60 hover:text-white"
            >
              清空
            </button>
          </div>
        )}

        <Drawer
          title={`专业对比 (${compareList.length})`}
          open={compareOpen}
          onClose={() => setCompareOpen(false)}
          width={Math.min(280 + compareList.length * 230, 1180)}
        >
          <Table
            size="small"
            bordered
            pagination={false}
            rowKey="metric"
            columns={[
              { title: '指标', dataIndex: 'metric', width: 118, fixed: 'left' as const },
              ...compareList.map((m, i) => ({
                title: (
                  <Link href={`/majors/${m.id}`} className="text-primary">
                    {m.name}
                  </Link>
                ),
                dataIndex: `v${i}`,
                width: 210,
                render: (v: any) => (v == null || v === '' ? <span className="text-text-muted">--</span> : v),
              })),
            ]}
            dataSource={buildCompareRows(compareList)}
          />
        </Drawer>

        {/* 意向池编辑抽屉: 复用学生档案的梯队编辑器 (拖拽排序), 样式靠 wn-teacher-scope */}
        <Drawer
          title={workStudentName ? `${workStudentName} 的意向专业` : '意向专业'}
          open={poolOpen}
          onClose={() => setPoolOpen(false)}
          width={560}
          extra={
            <Button
              type="primary"
              size="small"
              loading={poolSaving}
              disabled={!poolDirty}
              onClick={() => savePool(poolTiers)}
            >
              保存
            </Button>
          }
        >
          <div className="wn-teacher-scope">
            <p className="mb-3 mt-0 text-xs text-text-tertiary">
              在专业卡片点「+ 意向池」即时加入；这里可拖动专业排梯队（梯队 1 = 最优先），调整后点右上角保存。
            </p>
            <PreferredMajorTierFormItem
              value={poolTiers}
              options={editorMajorOptions ?? []}
              isLoading={editorOptionsLoading}
              onChange={(next) => {
                setPoolTiers(next);
                setPoolDirty(true);
              }}
            />
          </div>
        </Drawer>
      </div>
    </MainLayout>
  );
}

// 对比表: 指标做行、专业做列 (值取列表接口已返回的物化字段, 无额外请求)
function buildCompareRows(list: any[]) {
  const band = (lo?: number | null, hi?: number | null, fmt?: (n: number) => string) => {
    if (lo == null) return null;
    const f = fmt ?? ((n: number) => String(n));
    return hi != null && hi !== lo ? `${f(lo)}~${f(hi)}` : f(lo);
  };
  const kfmt = (n: number) => n.toLocaleString();
  const rows: Array<[string, (m: any) => any]> = [
    ['层次', (m) => m.level],
    ['门类', (m) => m.category],
    ['在川计划', (m) => (m.scPlanCount != null ? `${m.scPlanCount} 人 · ${m.scPlanUnis} 校 (${m.scPlanYear})` : '近年无在川计划')],
    ['招生批次', (m) => m.scBatches],
    ['物理类最低分带', (m) => band(m.scPhyScoreLo, m.scPhyScoreHi)],
    ['物理类位次带', (m) => band(m.scPhyRankLo, m.scPhyRankHi, kfmt)],
    ['历史类最低分带', (m) => band(m.scHisScoreLo, m.scHisScoreHi)],
    ['历史类位次带', (m) => band(m.scHisRankLo, m.scHisRankHi, kfmt)],
    ['选考建议', (m) => m.electiveAdvice],
    ['学制', (m) => m.standardDuration],
    ['起薪 (全国样本)', (m) => (typeof m.avgSalary === 'number' && m.avgSalary > 0 ? `¥${m.avgSalary.toLocaleString()}` : null)],
    ['就业率', (m) => (parseRate(m.employmentRate) ? `${parseRate(m.employmentRate)}%` : null)],
    ['本科热度', (m) => (m.popularityRank ? `全国第 ${m.popularityRank}` : null)],
  ];
  return rows.map(([metric, fn]) => {
    const row: Record<string, any> = { metric };
    list.forEach((m, i) => {
      row[`v${i}`] = fn(m);
    });
    return row;
  });
}

// useSearchParams 在静态预渲染页面要求 Suspense 边界 (Next 14 CSR bailout)
export default function MajorsPage() {
  return (
    <Suspense
      fallback={
        <MainLayout>
          <div className="flex justify-center py-20"><Spin size="large" /></div>
        </MainLayout>
      }
    >
      <MajorsPageInner />
    </Suspense>
  );
}
