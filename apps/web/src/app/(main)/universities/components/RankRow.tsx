import Link from 'next/link';
import UniversityLogo from '@/components/university/UniversityLogo';
import type { RankedUniversity } from '@/services/university';

const RANK_TONE: Record<number, string> = {
  1: 'bg-[#f3c64a] text-[#7a5600]',
  2: 'bg-[#ccd3da] text-[#46505a]',
  3: 'bg-[#e0a878] text-[#6a3a14]',
};

export function RankRow({ item }: { item: RankedUniversity }) {
  const tags: string[] = [];
  if (item.is985) tags.push('985');
  if (item.is211) tags.push('211');
  if (item.isDoubleFirstClass) tags.push('双一流');

  const rankTone = RANK_TONE[item.rank] ?? 'bg-surface-dim text-text-tertiary';
  const meta = [item.city || item.province, item.type, item.runningNature]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="flex items-center gap-3 border-b border-border-subtle py-3 last:border-b-0">
      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[13px] font-bold ${rankTone}`}>
        {item.rank}
      </span>
      <Link href={`/universities/${item.id}`} className="shrink-0 no-underline">
        <UniversityLogo name={item.name} logoUrl={item.logoUrl} size={40} />
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/universities/${item.id}`}
            className="truncate font-serif text-[15px] font-semibold text-text no-underline hover:text-primary"
          >
            {item.name}
          </Link>
          {tags.map((tag) => (
            <span key={tag} className="rounded bg-accent-fixed px-1.5 py-0.5 text-[10px] font-medium text-accent">
              {tag}
            </span>
          ))}
        </div>
        <div className="mt-1 text-[11px] text-text-muted">
          {meta}
          {item.softRanking ? ` · 软科全国 #${item.softRanking}` : ''}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className="font-serif text-[16px] font-semibold text-text tabular-nums">
          {item.admissionMinRank ?? '—'}
        </div>
        <div className="text-[10px] text-text-muted">四川最低位次</div>
      </div>
    </div>
  );
}
