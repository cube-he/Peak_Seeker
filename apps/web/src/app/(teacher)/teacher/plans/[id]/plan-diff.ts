export type DiffKind = 'same' | 'modified' | 'added' | 'removed' | 'reordered';

export interface DiffRow {
  sequence: number;
  current: any | null;
  compare: any | null;
  kind: DiffKind;
  fromSequence?: number;
  toSequence?: number;
}

function filled(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  return String(value);
}

export function planItemIdentity(item: any): string {
  const university = filled(item?.universityId) ?? filled(item?.universityCode) ?? filled(item?.universityName) ?? '?uni';
  const group = filled(item?.groupCode) ?? filled(item?.groupName) ?? '?group';
  const major = filled(item?.majorId) ?? filled(item?.majorCode) ?? filled(item?.majorName) ?? '?major';
  return [university, group, major].join('|');
}

function sortedBySequence(items: any[]): any[] {
  return [...items].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
}

function groupCompareItems(compareItems: any[]) {
  const byKey = new Map<string, any[]>();
  for (const item of sortedBySequence(compareItems)) {
    const key = planItemIdentity(item);
    const list = byKey.get(key) ?? [];
    list.push(item);
    byKey.set(key, list);
  }
  return byKey;
}

function takeBestCompare(current: any, compareByKey: Map<string, any[]>, usedCompareIds: Set<number>) {
  const key = planItemIdentity(current);
  const candidates = compareByKey.get(key)?.filter((item) => !usedCompareIds.has(item.id)) ?? [];
  if (candidates.length === 0) return null;
  return candidates.find((item) => item.sequence === current.sequence) ?? candidates[0];
}

export function diffPlanItems(currentItems: any[], compareItems: any[]): DiffRow[] {
  const compareByKey = groupCompareItems(compareItems);
  const compareBySeq = new Map<number, any>();
  compareItems.forEach((item) => compareBySeq.set(item.sequence, item));
  const usedCompareIds = new Set<number>();
  const currentRows: DiffRow[] = [];

  for (const cur of sortedBySequence(currentItems)) {
    const matchedCompare = takeBestCompare(cur, compareByKey, usedCompareIds);
    if (matchedCompare) {
      usedCompareIds.add(matchedCompare.id);
      const reordered = matchedCompare.sequence !== cur.sequence;
      currentRows.push({
        sequence: cur.sequence,
        current: cur,
        compare: matchedCompare,
        kind: reordered ? 'reordered' : 'same',
        fromSequence: reordered ? matchedCompare.sequence : undefined,
        toSequence: reordered ? cur.sequence : undefined,
      });
      continue;
    }

    const sameSeqCompare = compareBySeq.get(cur.sequence);
    if (sameSeqCompare && !usedCompareIds.has(sameSeqCompare.id)) {
      usedCompareIds.add(sameSeqCompare.id);
      currentRows.push({
        sequence: cur.sequence,
        current: cur,
        compare: sameSeqCompare,
        kind: 'modified',
      });
      continue;
    }

    currentRows.push({ sequence: cur.sequence, current: cur, compare: null, kind: 'added' });
  }

  const removedRows = sortedBySequence(compareItems)
    .filter((item) => !usedCompareIds.has(item.id))
    .map((item) => ({
      sequence: item.sequence,
      current: null,
      compare: item,
      kind: 'removed' as const,
    }));

  return [...currentRows, ...removedRows].sort((a, b) => {
    if (a.sequence !== b.sequence) return a.sequence - b.sequence;
    return kindSortWeight(a.kind) - kindSortWeight(b.kind);
  });
}

function kindSortWeight(kind: DiffKind): number {
  if (kind === 'removed') return 1;
  return 0;
}
