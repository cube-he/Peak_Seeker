'use client';

import { useState } from 'react';
import type { BoardGroup } from '../lib/groupBoards';
import { RankRow } from './RankRow';

const PREVIEW_COUNT = 10;

export function BoardSection({ group }: { group: BoardGroup }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [expanded, setExpanded] = useState(false);

  const board = group.boards[activeIndex] ?? group.boards[0];
  const visible = expanded ? board.items : board.items.slice(0, PREVIEW_COUNT);

  return (
    <section className="rounded-xl bg-surface p-5 shadow-card">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="m-0 font-serif text-lg font-semibold text-text">{group.groupTitle}</h3>
        {group.boards.length > 1 && (
          <div className="flex overflow-hidden rounded-md border border-border">
            {group.boards.map((b, idx) => (
              <button
                key={b.key}
                type="button"
                onClick={() => {
                  setActiveIndex(idx);
                  setExpanded(false);
                }}
                className={`border-0 px-3 py-1 text-[12px] transition-colors ${
                  idx === activeIndex
                    ? 'bg-primary-fixed font-medium text-primary'
                    : 'bg-surface text-text-tertiary hover:text-primary'
                }`}
              >
                {b.level === '本科' ? '本科榜' : '专科榜'}
              </button>
            ))}
          </div>
        )}
      </div>

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
    </section>
  );
}
