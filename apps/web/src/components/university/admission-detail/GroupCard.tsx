'use client';
import { useState } from 'react';
import MajorRow from './MajorRow';
import type { GroupCardProps } from './types';
import type { RankTier } from '@/utils/classify-rank';

const TIER_STYLE: Record<RankTier, { border: string; bg: string; chip: string; label: string }> = {
  unreachable: { border: 'border-gray-300 border-l-gray-500', bg: 'bg-gray-100', chip: 'bg-gray-500', label: '难达' },
  rush:    { border: 'border-red-200 border-l-red-500', bg: 'bg-red-50',    chip: 'bg-red-500',    label: '冲' },
  stable:  { border: 'border-blue-200 border-l-blue-500', bg: 'bg-blue-50',  chip: 'bg-blue-500',   label: '稳' },
  safe:    { border: 'border-green-200 border-l-green-500', bg: 'bg-green-50', chip: 'bg-green-500',  label: '保' },
  elite:   { border: 'border-amber-200 border-l-amber-500', bg: 'bg-amber-50', chip: 'bg-amber-500',  label: '远' },
  unknown: { border: 'border-gray-200 border-l-gray-300', bg: 'bg-gray-50',  chip: 'bg-gray-400',   label: '—' },
};

export default function GroupCard({ group, multiYearGroups, tier, diffText, userRank }: GroupCardProps) {
  const [open, setOpen] = useState(false);
  const style = TIER_STYLE[tier];
  const trendYears = [...multiYearGroups].sort((a, b) => b.year - a.year).slice(0, 3);

  return (
    <div className={`rounded-lg mb-3 overflow-hidden border border-l-4 ${style.border} ${style.bg}`}>
      <div className="px-3.5 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="font-bold text-[14px] text-text">📦 {group.groupCode}{group.groupName && ` · ${group.groupName}`}</div>
            <div className="text-[11px] text-text-tertiary mt-1">
              {group.subjects} · {group.batch} · 招 {group.groupAdmissionCount ?? '—'} 人
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {userRank != null && (
              <span className={`text-white text-[11px] font-bold px-2.5 py-0.5 rounded-full ${style.chip}`}>{style.label}</span>
            )}
            <button
              type="button"
              onClick={() => setOpen(o => !o)}
              aria-label={open ? '折叠' : '展开'}
              className="text-text-tertiary hover:text-primary bg-transparent border-0 cursor-pointer text-base leading-none"
            >
              {open ? '▴' : '▾'}
            </button>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 mt-2.5">
          {trendYears.map((g, idx) => (
            <div key={g.year} className={`rounded p-1.5 ${idx === 0 ? 'bg-amber-100' : 'bg-gray-100'}`}>
              <div className={`text-[9px] font-bold ${idx === 0 ? 'text-amber-800' : 'text-text-tertiary'}`}>{g.year}</div>
              <div className="text-[15px] font-bold text-text">{g.groupMinScore ?? '—'}</div>
              <div className="text-[10px] text-text-tertiary">
                {g.groupMinRank != null ? `位次 ${g.groupMinRank.toLocaleString()}` : '—'}
              </div>
            </div>
          ))}
        </div>
        {userRank != null && diffText && (
          <div className="mt-2 px-2.5 py-1.5 bg-white rounded text-[11px] text-text">
            {group.year} 组最低 {group.groupMinRank != null ? `#${group.groupMinRank.toLocaleString()}` : '—'} · 你 #{userRank.toLocaleString()} · {diffText}
          </div>
        )}
      </div>
      {open && (
        <div className="bg-white border-t border-border-subtle">
          <div className="px-3 py-2 text-[10px] font-bold text-text-tertiary tracking-wide">组内专业 · {group.majors.length} 个</div>
          {group.majors.map(m => (
            <MajorRow
              key={`${m.majorCode}|${m.majorName}`}
              major={m}
              // 同组跨年按专业名对齐, 老师可看组内单个专业的近三年走势 (此前只传单年)
              multiYearData={trendYears
                .map(g => {
                  const hit = g.majors.find(x => x.majorName === m.majorName);
                  return hit
                    ? { year: g.year, majorMinScore: hit.majorMinScore, majorMinRank: hit.majorMinRank }
                    : null;
                })
                .filter((x): x is { year: number; majorMinScore: number | null; majorMinRank: number | null } => x != null)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
