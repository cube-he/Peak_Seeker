'use client';

import { useQuery } from '@tanstack/react-query';
import { Alert, Empty, Spin } from 'antd';
import type { ExamType } from '@/services/score-segment';
import { universityService } from '@/services/university';
import { useStudentRank } from '@/stores/studentRankStore';
import { groupBoards } from '../lib/groupBoards';
import { BoardSection } from './BoardSection';

const EXAM_TYPES: ExamType[] = ['物理', '历史'];

export function RankingBoardTab() {
  const examType = useStudentRank((s) => s.examType);
  const setExamType = useStudentRank((s) => s.setExamType);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['ranking-board', examType],
    queryFn: () => universityService.getRankingBoard(examType),
  });

  const groups = data ? groupBoards(data) : [];

  return (
    <div className="pb-12">
      <div className="mb-5 flex items-center gap-2">
        <span className="text-sm text-text-muted">科类</span>
        {EXAM_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setExamType(t)}
            className={`rounded-full border px-3.5 py-1 text-[13px] transition-colors ${
              examType === t
                ? 'border-primary bg-primary-fixed font-medium text-primary'
                : 'border-border bg-surface text-text-tertiary hover:text-primary'
            }`}
          >
            {t}类
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center rounded-xl bg-surface py-20 shadow-card">
          <Spin size="large" />
        </div>
      ) : isError ? (
        <div className="rounded-xl bg-surface p-6 shadow-card">
          <Alert type="error" showIcon message="排行榜加载失败" description="请稍后刷新重试。" />
        </div>
      ) : groups.length > 0 ? (
        <div className="space-y-6">
          {groups.map((g) => (
            <BoardSection key={g.groupKey} group={g} />
          ))}
        </div>
      ) : (
        <div className="rounded-xl bg-surface p-8 shadow-card">
          <Empty description="暂无排行数据" />
        </div>
      )}
    </div>
  );
}
