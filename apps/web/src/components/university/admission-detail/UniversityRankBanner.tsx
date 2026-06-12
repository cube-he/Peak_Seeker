import type { UniversityRankBannerProps } from './types';
import type { RankTier } from '@/utils/classify-rank';

const TIER_STYLE: Record<RankTier, { border: string; bg: string; chip: string; label: string }> = {
  unreachable: { border: 'border-gray-300 border-l-gray-500', bg: 'bg-gradient-to-br from-gray-100 to-white', chip: 'bg-gray-500', label: '难达' },
  rush:    { border: 'border-red-200 border-l-red-500',    bg: 'bg-gradient-to-br from-red-50 to-white',    chip: 'bg-red-500',    label: '冲' },
  stable:  { border: 'border-blue-200 border-l-blue-500',  bg: 'bg-gradient-to-br from-blue-50 to-white',   chip: 'bg-blue-500',   label: '稳' },
  safe:    { border: 'border-green-200 border-l-green-500',bg: 'bg-gradient-to-br from-green-50 to-white',  chip: 'bg-green-500',  label: '保' },
  elite:   { border: 'border-amber-200 border-l-amber-500',bg: 'bg-gradient-to-br from-amber-50 to-white',  chip: 'bg-amber-500',  label: '远' },
  unknown: { border: 'border-gray-200 border-l-gray-300',  bg: 'bg-gray-50',                                 chip: 'bg-gray-400',   label: '—' },
};

export default function UniversityRankBanner({
  subject,
  batchCategory,
  rankInput,
  tier,
  userRank,
  diffText,
}: UniversityRankBannerProps) {
  const style = TIER_STYLE[tier];
  const isEmpty = rankInput.latestUniversityMinRank == null && rankInput.latestYear == null;

  return (
    <div className={`rounded-lg border border-l-4 ${style.border} ${style.bg} p-4 mb-4`}>
      <div className="flex items-start justify-between mb-2 gap-3">
        <div>
          <div className="text-[10px] tracking-[1.5px] text-amber-800 font-bold">
            院校最低调档线 · {subject} · {batchCategory}
          </div>
        </div>
        {userRank != null && (
          <span className={`text-white text-[12px] font-bold px-3 py-1 rounded-full ${style.chip}`}>
            院校层 · {style.label}
          </span>
        )}
      </div>

      {isEmpty ? (
        <div className="text-text-tertiary text-sm py-4 text-center">暂无该科类/批次的院校层调档数据</div>
      ) : (
        <div className="flex items-end gap-5">
          <div>
            <div className="text-[10px] text-amber-800">{rankInput.latestYear} 录取</div>
            <div className="text-[36px] font-extrabold leading-none text-text font-serif">
              {rankInput.latestUniversityMinScore ?? '—'}
            </div>
            <div className="text-[11px] text-text-tertiary mt-1">
              最低位次 {rankInput.latestUniversityMinRank != null ? `#${rankInput.latestUniversityMinRank.toLocaleString()}` : '—'}
            </div>
          </div>
          {rankInput.trendYears.length > 0 && (
            <div className="border-l border-red-100 pl-4 flex-1">
              <div className="text-[10px] text-amber-800 mb-1.5">历年趋势</div>
              <div className="grid grid-cols-3 gap-2">
                {rankInput.trendYears.slice(0, 3).map((y, i, arr) => {
                  // 与更早一年比较分数涨跌 (涨↑红 / 跌↓绿, 与透视表/走势图同款)
                  const prev = arr[i + 1];
                  const delta =
                    prev?.universityMinScore != null && y.universityMinScore != null
                      ? y.universityMinScore - prev.universityMinScore
                      : null;
                  return (
                    <div key={y.year} className="bg-white border border-red-100 rounded px-2 py-1">
                      <div className="text-[9px] text-text-tertiary">{y.year}</div>
                      <div className="text-[14px] font-bold">
                        {y.universityMinScore ?? '—'}
                        {delta != null && delta !== 0 && (
                          <span className={`ml-0.5 text-[10px] ${delta > 0 ? 'text-red-500' : 'text-green-600'}`}>
                            {delta > 0 ? '↑' : '↓'}
                          </span>
                        )}
                      </div>
                      <div className="text-[9px] text-text-tertiary">{y.universityMinRank != null ? `#${y.universityMinRank.toLocaleString()}` : '—'}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {userRank != null && diffText && !isEmpty && (
        <div className="mt-2.5 px-3 py-1.5 bg-white rounded text-[11px] text-text">{diffText}</div>
      )}
      {userRank == null && !isEmpty && (
        <div className="mt-2.5 px-3 py-1.5 bg-white rounded text-[11px] text-text-tertiary">
          在<a href="/universities" className="text-primary underline">院校库</a>选择学生或录入位次后，这里会显示冲稳保判定
        </div>
      )}
      {!isEmpty && (
        <div className="mt-2 text-[10px] text-text-faint">
          口径：各年 {subject} · {batchCategory} 的最低录取线（投档线优先，缺失时依次用院校线 / 专业组线 / 专业线兜底）
        </div>
      )}
    </div>
  );
}
