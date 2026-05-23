'use client';

import { useState } from 'react';
import type { RankingBoard } from '@/services/university';
import type { BoardGroup } from '../lib/groupBoards';
import { RankRow } from './RankRow';

const PREVIEW_COUNT = 10;

/**
 * 同组内多 board 时的列标签：
 * - level 混搭（本科+专科，如川内/周边/发达组）→ "本科榜"/"专科榜"（保留旧行为，简洁）
 * - level 全相同（如 7 张类别榜全是本科）→ 用 board.title 区分（财经类榜/医药类榜...）
 */
function deriveColLabel(board: RankingBoard, group: BoardGroup): string {
  const levels = new Set(group.boards.map((b) => b.level));
  if (levels.size > 1) return board.level === '本科' ? '本科榜' : '专科榜';
  return board.title;
}

function BoardColumn({ board, label }: { board: RankingBoard; label: string | null }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? board.items : board.items.slice(0, PREVIEW_COUNT);

  return (
    <div className="min-w-0">
      {label && (
        <div className="mb-2 text-sm font-semibold text-text-secondary">
          {label}
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
      {/* grid auto-fit:1 board 占满,2 boards 双列,7 boards 自动按宽度换行(2-3-4 列) */}
      <div className="grid gap-6 grid-cols-[repeat(auto-fit,minmax(280px,1fr))]">
        {group.boards.map((board) => (
          <BoardColumn
            key={board.key}
            board={board}
            label={showLabel ? deriveColLabel(board, group) : null}
          />
        ))}
      </div>
    </section>
  );
}
