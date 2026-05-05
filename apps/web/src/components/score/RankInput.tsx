'use client';

import { useState } from 'react';
import { useStudentRank } from '@/stores/studentRankStore';
import { scoreSegmentApi, type ExamType } from '@/services/score-segment';
import { EquivalentScores } from './EquivalentScores';

const EXAM_TYPES: ExamType[] = ['物理', '历史'];
const CURRENT_YEAR = new Date().getFullYear();
// 2026 一分一段表通常 6 月底才出，前面用 2025 代理
const PROXY_YEAR = CURRENT_YEAR < 2026 || new Date().getMonth() < 5 ? 2025 : CURRENT_YEAR;

interface Props {
  variant?: 'default' | 'compact';
  className?: string;
}

export function RankInput({ variant = 'default', className = '' }: Props) {
  const { score, examType, rank, equivalents, setRankResult, setExamType, clear } = useStudentRank();
  const [inputScore, setInputScore] = useState<string>(score != null ? String(score) : '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const s = parseInt(inputScore, 10);
    if (!Number.isFinite(s) || s < 0 || s > 750) {
      setError('请输入 0-750 的分数');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const lookup = await scoreSegmentApi.lookup({
        year: PROXY_YEAR,
        examType,
        score: s,
      });
      const equiv = await scoreSegmentApi.equivalent({
        baseYear: PROXY_YEAR,
        examType,
        rank: lookup.rank,
      });
      setRankResult({
        score: s,
        examType,
        rank: lookup.rank,
        baseYear: PROXY_YEAR,
        equivalents: equiv,
      });
    } catch (e: any) {
      setError(e?.message ?? '查询失败');
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setInputScore('');
    clear();
  };

  // 已展开态（已查询过）
  if (rank != null && score != null) {
    return (
      <div className={`bg-white/[0.04] backdrop-blur-md border border-white/[0.12] rounded-xl p-4 ${className}`}>
        <div className="flex items-baseline justify-between mb-2">
          <div>
            <span className="text-white/50 text-[11px]">你的位次 ≈</span>
            <span className="font-serif text-white text-[22px] font-bold tabular-nums ml-2">
              {rank.toLocaleString()}
            </span>
          </div>
          <button
            onClick={reset}
            className="text-[11px] text-accent-light hover:text-accent underline"
          >
            修改
          </button>
        </div>
        <div className="text-[11px] text-white/40 mb-3">
          {score}分 · {examType} · 基于 {PROXY_YEAR} 数据
          {PROXY_YEAR !== CURRENT_YEAR && <span className="ml-1">（{CURRENT_YEAR} 真表未发布，用代理）</span>}
        </div>
        <div className="border-t border-white/10 pt-3">
          <EquivalentScores equivalents={equivalents} />
        </div>
      </div>
    );
  }

  // 输入态
  return (
    <div className={`bg-white/[0.04] backdrop-blur-md border border-white/[0.12] rounded-xl p-4 ${className}`}>
      <div className="text-[11px] uppercase tracking-[1.5px] text-accent-light mb-2">输入成绩</div>
      <div className="flex gap-2 mb-2">
        {EXAM_TYPES.map((t) => (
          <button
            key={t}
            onClick={() => setExamType(t)}
            className={`text-[12px] px-2 py-0.5 rounded ${
              examType === t ? 'bg-accent text-white' : 'bg-white/10 text-white/60 hover:bg-white/20'
            }`}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={750}
          placeholder="高考分数"
          value={inputScore}
          onChange={(e) => setInputScore(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          className="flex-1 bg-white/10 border border-white/15 rounded px-3 py-2 text-white text-[14px] tabular-nums placeholder:text-white/30 focus:outline-none focus:border-accent"
        />
        <button
          onClick={submit}
          disabled={loading}
          className="bg-accent hover:bg-accent-light text-white px-4 py-2 rounded text-[13px] font-medium disabled:opacity-50"
        >
          {loading ? '...' : '查位次'}
        </button>
      </div>
      {error && <div className="text-[11px] text-rush mt-1.5">{error}</div>}
      {variant === 'default' && (
        <div className="text-[10px] text-white/30 mt-2">
          仅基于历史数据估算，实际录取以当年情况为准
        </div>
      )}
    </div>
  );
}
