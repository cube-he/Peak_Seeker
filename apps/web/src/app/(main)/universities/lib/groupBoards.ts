import type { RankingBoard } from '@/services/university';

export interface BoardGroup {
  groupKey: string;
  groupTitle: string;
  boards: RankingBoard[];
}

export function groupBoards(boards: RankingBoard[]): BoardGroup[] {
  const groups: BoardGroup[] = [];
  for (const board of boards) {
    let group = groups.find((g) => g.groupKey === board.groupKey);
    if (!group) {
      group = { groupKey: board.groupKey, groupTitle: board.groupTitle, boards: [] };
      groups.push(group);
    }
    group.boards.push(board);
  }
  return groups;
}
