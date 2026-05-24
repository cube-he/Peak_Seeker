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

  // 把 boards 按 level 拆两段后再各自 group:
  // - 本科榜单(13 张): 川内本科、周边本科、发达城市本科、全国名校榜、行业特色院校(7)、民办本科
  // - 专科榜单(12 张): 川内专科、周边专科、发达城市专科、高职分类(9)
  // 川内/周边/发达 在两段各出现一次,各自只渲染对应 level 的单 board(BoardSection 自适应)
  const undergradGroups = data ? groupBoards(data.filter((b) => b.level === '本科')) : [];
  const collegeGroups = data ? groupBoards(data.filter((b) => b.level === '专科')) : [];
  const hasAny = undergradGroups.length > 0 || collegeGroups.length > 0;

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
      ) : hasAny ? (
        <div className="space-y-10">
          {undergradGroups.length > 0 && (
            <section>
              <h2 className="m-0 mb-4 font-serif text-xl font-semibold text-text">本科榜单</h2>
              <div className="space-y-6">
                {undergradGroups.map((g) => (
                  <BoardSection key={g.groupKey} group={g} />
                ))}
              </div>
            </section>
          )}
          {collegeGroups.length > 0 && (
            <section>
              <h2 className="m-0 mb-4 font-serif text-xl font-semibold text-text">专科榜单</h2>
              <div className="space-y-6">
                {collegeGroups.map((g) => (
                  <BoardSection key={g.groupKey} group={g} />
                ))}
              </div>
            </section>
          )}
        </div>
      ) : (
        <div className="rounded-xl bg-surface p-8 shadow-card">
          <Empty description="暂无排行数据" />
        </div>
      )}
    </div>
  );
}
