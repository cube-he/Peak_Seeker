import Link from 'next/link';
import UniversityLogo from '@/components/university/UniversityLogo';
import type { UniversityListItem } from '@/services/university';
import { Tags } from '../shared/Tags';
import { TierBadge, RankDistance } from '../shared/TierBadge';
import type { Tier } from '../../lib/tier';
import { pickBackgroundTags } from '../../lib/backgrounds';
import { getTier, classifyRank } from '@/utils/classify-rank';

/**
 * 全部院校 tab 的紧凑列表卡(design `.list-card`):
 *   3 列 grid: 48px logo / 主信息 / 140px 右侧分数块。
 *   .row1 (name + 985/211/双一流 + 冲稳保 badge)
 *   .info-chips (类型 / 省市 / 性质 / 专科 灰条)
 *   .meta (软科榜 / 软科分类榜 / 院校代码)
 *   .rhs (大号最低分 + 副标题 + 位次 + 距你)
 */
export function ListCard({
  uni,
  userRank,
  examType,
  favorited,
  onToggleFav,
  inCompare,
  onToggleCompare,
  poolEnabled,
  inPool,
  onAddToPool,
}: {
  uni: UniversityListItem;
  userRank: number | null;
  examType: '物理' | '历史';
  favorited: boolean;
  onToggleFav: (u: UniversityListItem) => void;
  inCompare: boolean;
  onToggleCompare: (u: UniversityListItem) => void;
  /* 老师选定学生后的意向院校一键加入 */
  poolEnabled: boolean;
  inPool: boolean;
  onAddToPool: (u: UniversityListItem) => void;
}) {
  const admission = uni.latestAdmission;
  // 卡片整体是 Link, 内部操作按钮拦截导航
  const stop = (e: React.MouseEvent, fn: () => void) => {
    e.preventDefault();
    e.stopPropagation();
    fn();
  };
  // 直辖市 province === city 去重(同值 chip 会触发 React duplicate key)
  const infoChips = Array.from(
    new Set(
      [
        uni.type,
        uni.province && uni.city && uni.province !== uni.city
          ? `${uni.province} · ${uni.city}`
          : uni.province ?? uni.city,
        uni.runningNature,
      ].filter(Boolean),
    ),
  ) as string[];

  // 项目自身 verdict(用 classifyRank,跟科类挂钩),用于卡片左上 TierBadge。
  const projectTier =
    userRank != null
      ? getTier({ is985: uni.is985, is211: uni.is211, batch: uni.level ?? '' })
      : null;
  const verdict =
    userRank != null && projectTier
      ? classifyRank(userRank, uni.predictedMinRank, projectTier, examType === '历史')
      : null;

  return (
    <Link href={`/universities/${uni.id}`} className="list-card" prefetch={false}>
      <UniversityLogo name={uni.name} logoUrl={uni.logoUrl} size={48} className="uni-logo" />
      <div className="main">
        <div className="row1">
          <span className="name">{uni.name}</span>
          <Tags is985={uni.is985} is211={uni.is211} isDoubleFirstClass={uni.isDoubleFirstClass} />
          {verdict && <TierBadge tier={verdict as Tier} />}
        </div>
        <div className="info-chips">
          {infoChips.map((c) => (
            <span key={c} className="chip-mini">
              {c}
            </span>
          ))}
          {uni.level === '专科' && (
            <span className="chip-mini" style={{ background: 'rgba(249,115,22,.08)', color: '#9a3412' }}>
              专科
            </span>
          )}
          {/* 院校背景 tags(C9联盟 / 卓越工程师 / 原邮电部直属 等)。
              accent 配色,跟 type/省/性质 等常规 info chip 区分开。 */}
          {pickBackgroundTags(uni.tags).map((t) => (
            <span
              key={t}
              className="chip-mini"
              style={{ background: 'var(--accent-fixed)', color: 'var(--accent)', fontWeight: 500 }}
            >
              {t}
            </span>
          ))}
        </div>
        <div className="meta">
          {uni.softRanking != null && (
            <span>
              软科 {uni.softRankYear ?? ''} {uni.softRankList ?? ''}#{uni.softRanking}
            </span>
          )}
          {uni.softCategory && uni.softCategoryRank != null && (
            <span>
              {uni.softCategory} #{uni.softCategoryRank}
            </span>
          )}
          {uni.code && <span>院校代码 {uni.code}</span>}
          {/* 在川机会规模 (物化统计) + 征集捡漏信号 */}
          {uni.scPlanCount != null && (
            <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>
              在川计划 {uni.scPlanCount.toLocaleString()} 人 · {uni.scGroupCount ?? '-'} 个专业组
            </span>
          )}
          {typeof uni.scSupplCount === 'number' && uni.scSupplCount > 0 && (
            <span
              title={`去年征集志愿（补录）计划 ${uni.scSupplCount} 人 — 有专业未录满，可作保底参考`}
              style={{ background: 'rgba(245,158,11,.12)', color: '#b45309', borderRadius: 4, padding: '1px 6px', cursor: 'help' }}
            >
              征集 {uni.scSupplCount}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
          {poolEnabled && (
            <button
              type="button"
              onClick={(e) => stop(e, () => onAddToPool(uni))}
              style={{
                fontSize: 11,
                padding: '2px 8px',
                borderRadius: 4,
                cursor: 'pointer',
                border: inPool ? '1px solid #276749' : '1px solid var(--accent)',
                background: inPool ? 'rgba(39,103,73,.08)' : 'var(--accent)',
                color: inPool ? '#276749' : '#fff',
              }}
            >
              {inPool ? '已在意向 ✓' : '+ 意向院校'}
            </button>
          )}
          <button
            type="button"
            onClick={(e) => stop(e, () => onToggleCompare(uni))}
            style={{
              fontSize: 11,
              padding: '2px 8px',
              borderRadius: 4,
              cursor: 'pointer',
              border: inCompare ? '1px solid var(--primary)' : '1px solid var(--border)',
              background: inCompare ? 'var(--primary)' : 'transparent',
              color: inCompare ? '#fff' : 'var(--text-tertiary)',
            }}
          >
            {inCompare ? '对比中' : '对比'}
          </button>
          <button
            type="button"
            onClick={(e) => stop(e, () => onToggleFav(uni))}
            title={favorited ? '取消收藏' : '收藏院校'}
            style={{
              fontSize: 13,
              border: 0,
              background: 'transparent',
              cursor: 'pointer',
              color: favorited ? '#f59e0b' : 'var(--text-muted)',
              padding: '0 2px',
              lineHeight: 1,
            }}
          >
            {favorited ? '★' : '☆'}
          </button>
        </div>
      </div>
      <div className="rhs">
        <div className="score">{admission?.minScore ?? '—'}</div>
        <div className="sub">{examType}类 · 最近一年最低分</div>
        <div className="pos">位次 {admission?.minRank?.toLocaleString() ?? '—'}</div>
        {userRank != null && (uni.predictedMinRank ?? admission?.minRank) != null && (
          <RankDistance uniRank={uni.predictedMinRank ?? admission?.minRank} userRank={userRank} />
        )}
      </div>
    </Link>
  );
}
