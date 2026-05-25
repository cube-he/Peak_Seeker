import type { MajorRowProps } from './types';

const ELIGIBLE_GRADE_RE = /(A\+|A|A-|B\+|B|B-|C\+|C|C-)/;

function extractGrade(text: string | null): string | null {
  if (!text) return null;
  const m = text.match(ELIGIBLE_GRADE_RE);
  return m ? m[1] : text;
}

export default function MajorRow({ major, multiYearData }: MajorRowProps) {
  const { extras } = major;
  const rankingChip = extras.majorRanking ? `软科 #${extras.majorRanking}` : null;
  const evalChip = extractGrade(extras.disciplineEval);
  const featureChip = extras.isNationalFeature ? '国家特色' : null;
  const hasAnyChip = rankingChip || evalChip || featureChip;

  return (
    <div className="px-3 py-2.5 border-b border-border-subtle last:border-b-0">
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-medium text-text">{major.majorName}</span>
            {hasAnyChip && (
              <span data-testid="major-chips" className="inline-flex gap-1.5 ml-0.5">
                {rankingChip && (
                  <span className="bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded text-[10px] font-bold">{rankingChip}</span>
                )}
                {evalChip && (
                  <span className="bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded text-[10px] font-bold">{evalChip}</span>
                )}
                {featureChip && (
                  <span className="bg-red-100 text-red-800 px-1.5 py-0.5 rounded text-[10px] font-bold">{featureChip}</span>
                )}
              </span>
            )}
          </div>
          <div className="text-[11px] text-text-tertiary mt-0.5">
            代码 {major.majorCode}{major.planCount != null && ` · 计划 ${major.planCount} 人`}
          </div>
        </div>
        <div className="flex gap-2 text-[11px] flex-shrink-0">
          {multiYearData.map((y, idx) => (
            <div key={y.year} className={`text-right ${idx === 0 ? 'font-semibold text-text' : 'text-text-tertiary'} min-w-[60px]`}>
              <div className="font-bold">{y.year}</div>
              <div>{y.majorMinScore ?? '—'} / {y.majorMinRank != null ? `#${y.majorMinRank}` : '—'}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
