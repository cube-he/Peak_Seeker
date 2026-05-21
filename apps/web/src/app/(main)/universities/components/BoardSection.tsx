'use client';

import { useState } from 'react';
import type { RankingBoard } from '@/services/university';
import type { BoardGroup } from '../lib/groupBoards';
import { RankRow } from './RankRow';

const PREVIEW_COUNT = 10;

function BoardColumn({ board, showLabel }: { board: RankingBoard; showLabel: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? board.items : board.items.slice(0, PREVIEW_COUNT);

  return (
    <div className="min-w-0 flex-1">
      {showLabel && (
        <div className="mb-2 text-sm font-semibold text-text-secondary">
          {board.level === '本科' ? '本科榜' : '专科榜'}
        </div>
      )}
      {visible.length > 0 ? (
        <div>
          {visible.map((item) => (
            <RankRow key={item.id} item={item} />
          ))}
        </div>
      ) : (
        <div className="py-8 text-center text-sm text-text-muted">该榜暂无数据</div>
      )}
      {board.items.length > PREVIEW_COUNT && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-3 w-full rounded-md border-0 bg-bg py-2 text-[13px] text-primary transition-colors hover:bg-surface-dim"
        >
          {expanded ? '收起' : `查看完整榜单（共 ${board.items.length} 所）`}
        </button>
      )}
    </div>
  );
}

export function BoardSection({ group }: { group: BoardGroup }) {
  const showLabel = group.boards.length > 1;

  return (
    <section className="rounded-xl bg-surface p-5 shadow-card">
      <h3 className="m-0 mb-3 font-serif text-lg font-semibold text-text">{group.groupTitle}</h3>
      <div className="flex flex-col gap-6 md:flex-row">
        {group.boards.map((board) => (
          <BoardColumn key={board.key} board={board} showLabel={showLabel} />
        ))}
      </div>
    </section>
  );
}
