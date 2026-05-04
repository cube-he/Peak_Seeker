'use client';

import Link from 'next/link';
import UniversityLogo from '@/components/university/UniversityLogo';
import RankTierBadge from './RankTierBadge';
import RankDistance from './RankDistance';
import { classifyRank, getTier, isHistorical, type RankTier } from '@/utils/classify-rank';

const BAR_COLOR_BY_TIER: Record<RankTier, string> = {
  rush:    '#c53030',
  stable:  '#2c5282',
  safe:    '#276749',
  elite:   '#b8860b',
  unknown: '#d1cfc5',
};

export interface AdmissionRowData {
  university: {
    id: number;
    name: string;
    logoUrl?: string | null;
    is985: boolean;
    is211: boolean;
    isDoubleFirstClass?: boolean;
  };
  major?: { id: number; name: string } | null;
  majorName?: string;
  groupCode: string;
  batch: string;
  recruitType: string;
  subjects: string;
  predictedMinRank: { point: number } | null;
}

interface AdmissionRowProps {
  data: AdmissionRowData;
  /** User's rank from useUserStore. When null, all rows render as 'unknown'. */
  userRank: number | null;
}

export default function AdmissionRow({ data, userRank }: AdmissionRowProps) {
  const u = data.university;
  const predictedPoint = data.predictedMinRank?.point ?? null;

  const tier: RankTier = userRank == null
    ? 'unknown'
    : classifyRank(
        userRank,
        predictedPoint,
        getTier({ is985: u.is985, is211: u.is211, batch: data.batch }),
        isHistorical(data.subjects),
      );

  const diff = userRank != null && predictedPoint != null ? predictedPoint - userRank : null;

  const tagBadges: string[] = [];
  if (u.is985) tagBadges.push('985');
  else if (u.is211) tagBadges.push('211');
  if (u.isDoubleFirstClass && !u.is985 && !u.is211) tagBadges.push('双一流');

  const majorDisplay = data.major?.name ?? data.majorName ?? '—';

  return (
    <div
      className="bg-surface rounded-lg shadow-card relative overflow-hidden mb-2"
      style={{ borderLeft: `3px solid ${BAR_COLOR_BY_TIER[tier]}` }}
    >
      <div className="flex items-center gap-3 py-3 px-4">
        <UniversityLogo name={u.name} logoUrl={u.logoUrl} size={40} />

        <div className="flex-1 min-w-0 flex items-center gap-2">
          <Link
            href={`/universities/${u.id}`}
            className="font-serif font-semibold text-[15px] text-primary whitespace-nowrap hover:text-primary-light"
          >
            {u.name}
          </Link>
          {tagBadges.map((t) => (
            <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-full bg-surface-dim text-text-secondary flex-shrink-0">
              {t}
            </span>
          ))}
          <span className="text-xs text-text-tertiary truncate min-w-0">
            {majorDisplay} · {data.subjects} · 组{data.groupCode}
          </span>
        </div>

        <div className="flex items-center gap-2.5 flex-shrink-0">
          <RankDistance diff={diff} tier={tier} />
          <RankTierBadge tier={tier} />
        </div>
      </div>
    </div>
  );
}
