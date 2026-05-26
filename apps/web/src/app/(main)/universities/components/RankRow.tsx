import Link from 'next/link';
import UniversityLogo from '@/components/university/UniversityLogo';
import type { RankedUniversity } from '@/services/university';
import { Tags } from './shared/Tags';

/**
 * 排行榜单条行。ClassName 来自 universities/styles.css:
 *   .rank-row + .rank-{N} 变体(rank-1 金色封神,rank-2/3 略放大)
 *   .badge.r1/r2/r3/rN
 *   .uni-logo(由 UniversityLogo 渲染时套用 styles.css 字体设置)
 *   .main / .meta / .rhs / .v / .k
 */
export function RankRow({ item }: { item: RankedUniversity }) {
  const r = item.rank;
  const badgeCls = r === 1 ? 'r1' : r === 2 ? 'r2' : r === 3 ? 'r3' : 'rN';
  const meta = [item.city || item.province, item.type, item.runningNature]
    .filter(Boolean)
    .join(' · ');
  const softCaption = item.softRanking ? ` · 软科 ${item.softRankList ?? ''}#${item.softRanking}` : '';
  const size = r === 1 ? 44 : 40;

  return (
    <Link href={`/universities/${item.id}`} className={`rank-row rank-${r}`} prefetch={false}>
      <span className={`badge ${badgeCls}`}>{r}</span>
      <UniversityLogo name={item.name} logoUrl={item.logoUrl} size={size} className="uni-logo" />
      <div className="main">
        <div className="name">
          {item.name}
          <Tags is985={item.is985} is211={item.is211} isDoubleFirstClass={item.isDoubleFirstClass} />
        </div>
        <div className="meta">
          {meta}
          {softCaption}
        </div>
      </div>
      <div className="rhs">
        <div className="v">{item.admissionMinRank != null ? item.admissionMinRank.toLocaleString() : '—'}</div>
        <div className="k">四川最低位次</div>
      </div>
    </Link>
  );
}
