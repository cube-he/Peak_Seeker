import Link from 'next/link';
import UniversityLogo from '@/components/university/UniversityLogo';
import type { UniversityListItem } from '@/services/university';
import { Tags } from '../shared/Tags';
import { TierBadge, RankDistance } from '../shared/TierBadge';
import type { Tier } from '../../lib/tier';
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
}: {
  uni: UniversityListItem;
  userRank: number | null;
  examType: '物理' | '历史';
}) {
  const admission = uni.latestAdmission;
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
