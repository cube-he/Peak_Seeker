'use client';

import { useState } from 'react';
import type { RankingBoard } from '@/services/university';
import type { BoardGroup } from '../lib/groupBoards';
import { RankRow } from './RankRow';
import { StarIcon, LocIcon, GridIcon, BooksIcon } from './shared/Icon';

const PREVIEW_COUNT = 10;

/**
 * 后端 groupKey → 设计稿视觉变体(决定左侧识别色条 + group-ic 配色)
 *   本科:national 金 / region 棕 / industry 蓝
 *   专科:national-col 橙 / region-col 橙
 */
function designVariant(groupKey: string, level: '本科' | '专科'): 'national' | 'region' | 'industry' | 'national-col' | 'region-col' {
  const isCollege = level === '专科';
  if (groupKey === 'elite') return isCollege ? 'national-col' : 'national';
  if (groupKey === 'vocational') return 'national-col';
  if (groupKey === 'category' || groupKey === 'private') return 'industry';
  // sichuan / neighbor / developed
  return isCollege ? 'region-col' : 'region';
}

const SUB_TITLES: Record<string, string> = {
  elite: '全国本科综合实力 · 软科主榜',
  sichuan: '在川招生重点 · 软科最新',
  neighbor: '川渝周边 · 川甘云贵渝陕鄂',
  developed: '京沪粤浙 · 发达地区',
  category: '7 类行业特色榜单 · 选你的专业方向',
  private: '民办本科 · 软科综合实力',
  vocational: '高职分类榜 · 软科 9 大类',
};

function GroupIconFor({ variant }: { variant: ReturnType<typeof designVariant> }) {
  switch (variant) {
    case 'national':
      return <StarIcon />;
    case 'industry':
      return <GridIcon />;
    case 'national-col':
      return <BooksIcon />;
    case 'region':
    case 'region-col':
    default:
      return <LocIcon />;
  }
}

/**
 * 同 group 多 board 时的列标题。
 * level 混搭(川内/周边/发达 group 同时有本科 + 专科) → "本科榜"/"专科榜"
 * level 全相同(行业特色 7 张都是本科) → 用 board.title 区分
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
    <div style={{ minWidth: 0 }}>
      {label && (
        <h4 className="board-col-label">
          <span className="badge" />
          {label}
        </h4>
      )}
      {visible.length > 0 ? (
        <div>
          {visible.map((item) => (
            <RankRow key={item.id} item={item} />
          ))}
        </div>
      ) : (
        <div style={{ padding: '24px 12px', color: 'var(--text-muted)', fontSize: 12, textAlign: 'center' }}>
          该榜暂无数据
        </div>
      )}
      {board.items.length > PREVIEW_COUNT && (
        <button type="button" className="board-expand" onClick={() => setExpanded((v) => !v)}>
          {expanded ? '收起' : `查看完整榜单 (共 ${board.items.length} 所)`}
        </button>
      )}
    </div>
  );
}

export function BoardSection({ group, level }: { group: BoardGroup; level: '本科' | '专科' }) {
  const variant = designVariant(group.groupKey, level);
  const showLabel = group.boards.length > 1;
  const subTitle = SUB_TITLES[group.groupKey] ?? '';
  // src 显示榜单来源(后端没字段,做一个统一标识)
  const src = '软科 · ' + (group.boards[0]?.level === '本科' ? '中国大学' : '高职') + ' 榜';

  return (
    <section className={`board group-${variant}`}>
      <div className="board-head">
        <div className="title-wrap">
          <span className="group-ic">
            <GroupIconFor variant={variant} />
          </span>
          <div>
            <h3>{group.groupTitle}</h3>
            {subTitle && <div className="sub-title">{subTitle}</div>}
          </div>
        </div>
        <span className="src">{src}</span>
      </div>
      <div className="board-cols">
        {group.boards.map((board) => (
          <BoardColumn key={board.key} board={board} label={showLabel ? deriveColLabel(board, group) : null} />
        ))}
      </div>
    </section>
  );
}
