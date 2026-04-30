'use client';

import type { EquivalentResult } from '@/services/score-segment';

interface Props {
  equivalents: EquivalentResult | null;
}

export function EquivalentScores({ equivalents }: Props) {
  if (!equivalents || equivalents.equivalents.length === 0) return null;
  return (
    <div className="text-[12px] text-text-tertiary">
      <div className="text-[11px] uppercase tracking-[1.5px] text-accent mb-1.5">历年等效分数</div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
        {equivalents.equivalents.map((e) => (
          <div key={e.year} className="flex items-baseline gap-1.5">
            <span className="text-text-tertiary">{e.year} {e.examType}</span>
            <span className="font-serif text-text font-semibold tabular-nums">{e.score}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
