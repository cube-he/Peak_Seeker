'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Spin } from 'antd';
import { universityService } from '@/services/university';
import { useStudentRank } from '@/stores/studentRankStore';
import { groupBoards } from '../lib/groupBoards';
import { BoardSection } from './BoardSection';
import { PageHead } from './shared/PageHead';
import { SubjectToggle } from './shared/SubjectToggle';
import { Empty } from './shared/Empty';

/**
 * 排行导览 tab。设计稿:
 * - PageHead (eyebrow + 标题 + lead)
 * - summary card (科类切换 + 本科/专科 张数 + 当前科类高亮)
 * - 「本科榜单」section banner + 一组 board.group-*
 * - 「专科榜单」section banner + 一组 board.group-*-col
 */
export function RankingBoardTab() {
  const examType = useStudentRank((s) => s.examType);
  const setExamType = useStudentRank((s) => s.setExamType);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['ranking-board', examType],
    queryFn: () => universityService.getRankingBoard(examType),
  });

  const undergradGroups = useMemo(
    () => (data ? groupBoards(data.filter((b) => b.level === '本科')) : []),
    [data],
  );
  const collegeGroups = useMemo(
    () => (data ? groupBoards(data.filter((b) => b.level === '专科')) : []),
    [data],
  );

  const undergradBoards = undergradGroups.reduce((s, g) => s + g.boards.length, 0);
  const collegeBoards = collegeGroups.reduce((s, g) => s + g.boards.length, 0);
  const undergradItems = undergradGroups.reduce(
    (s, g) => s + g.boards.reduce((ss, b) => ss + b.items.length, 0),
    0,
  );
  const collegeItems = collegeGroups.reduce(
    (s, g) => s + g.boards.reduce((ss, b) => ss + b.items.length, 0),
    0,
  );

  const hasAny = undergradGroups.length > 0 || collegeGroups.length > 0;

  return (
    <div className="fade-up">
      <PageHead
        eyebrow="University Rankings · 排行导览"
        title={<>看看那些<span className="num">权威推荐</span>的院校</>}
        lead={
          <>
            按软科 2024 综合实力榜、川渝周边、发达地区与行业特色榜单分组浏览。
            每榜默认显示前 10 名,可展开看全部。
          </>
        }
      />

      <div
        className="card"
        style={{
          padding: '18px 20px',
          marginBottom: 24,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <SubjectToggle value={examType} onChange={setExamType} />
        <div style={{ display: 'flex', gap: 24, alignItems: 'baseline' }}>
          <SummaryStat label="本科榜单" value={`${undergradBoards} 张`} />
          <SummaryStat label="专科榜单" value={`${collegeBoards} 张`} />
          <SummaryStat
            label="当前科类"
            value={`${examType}类`}
            sub={hasAny ? `${(undergradItems + collegeItems).toLocaleString()} 所收录` : '加载中…'}
            accent
          />
        </div>
      </div>

      {isLoading ? (
        <div className="card" style={{ padding: 80, display: 'flex', justifyContent: 'center' }}>
          <Spin size="large" />
        </div>
      ) : isError ? (
        <div className="card" style={{ padding: 24 }}>
          <Alert type="error" showIcon message="排行榜加载失败" description="请稍后刷新重试。" />
        </div>
      ) : !hasAny ? (
        <div className="card" style={{ padding: 32 }}>
          <Empty msg="暂无排行数据" />
        </div>
      ) : (
        <>
          {undergradGroups.length > 0 && (
            <div style={{ marginBottom: 40 }}>
              <div className="section-banner">
                <h2>本科榜单</h2>
                <span className="sb">
                  {undergradItems.toLocaleString()} 所院校 · {undergradBoards} 张榜单
                </span>
                <span className="line" />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                {undergradGroups.map((g) => (
                  <BoardSection key={g.groupKey} group={g} level="本科" />
                ))}
              </div>
            </div>
          )}

          {collegeGroups.length > 0 && (
            <div>
              <div className="section-banner">
                <h2>专科榜单</h2>
                <span className="sb">
                  {collegeItems.toLocaleString()} 所院校 · {collegeBoards} 张榜单
                </span>
                <span className="line" />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                {collegeGroups.map((g) => (
                  <BoardSection key={g.groupKey} group={g} level="专科" />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SummaryStat({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 10,
          letterSpacing: 1.4,
          textTransform: 'uppercase',
          color: 'var(--text-muted)',
        }}
      >
        {label}
      </div>
      <div
        style={{
          marginTop: 4,
          fontFamily: 'var(--font-heading)',
          fontSize: 18,
          fontWeight: 600,
          color: accent ? 'var(--accent)' : undefined,
        }}
      >
        {value}
      </div>
      {sub && (
        <div style={{ marginTop: 2, fontSize: 11, color: 'var(--text-muted)' }}>{sub}</div>
      )}
    </div>
  );
}
