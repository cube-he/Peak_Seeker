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

function takeBestCompare(current: any, compareByKey: Map<string, any[]>, usedCompareItems: Set<any>) {
  const key = planItemIdentity(current);
  const candidates = compareByKey.get(key)?.filter((item) => !usedCompareItems.has(item)) ?? [];
  if (candidates.length === 0) return null;
  return candidates.find((item) => item.sequence === current.sequence) ?? candidates[0];
}

function buildCompareBySeq(compareItems: any[], usedCompareItems: Set<any>) {
  const bySeq = new Map<number, any>();
  for (const item of sortedBySequence(compareItems)) {
    if (!usedCompareItems.has(item) && !bySeq.has(item.sequence)) {
      bySeq.set(item.sequence, item);
    }
  }
  return bySeq;
}

export function diffPlanItems(currentItems: any[], compareItems: any[]): DiffRow[] {
  const compareByKey = groupCompareItems(compareItems);
  const usedCompareItems = new Set<any>();
  const rows: DiffRow[] = [];
  const unmatchedCurrent: any[] = [];

  for (const cur of sortedBySequence(currentItems)) {
    const matchedCompare = takeBestCompare(cur, compareByKey, usedCompareItems);
    if (!matchedCompare) {
      unmatchedCurrent.push(cur);
      continue;
    }

    usedCompareItems.add(matchedCompare);
    const reordered = matchedCompare.sequence !== cur.sequence;
    rows.push({
      sequence: cur.sequence,
      current: cur,
      compare: matchedCompare,
      kind: reordered ? 'reordered' : 'same',
      fromSequence: reordered ? matchedCompare.sequence : undefined,
      toSequence: reordered ? cur.sequence : undefined,
    });
  }

  const compareBySeq = buildCompareBySeq(compareItems, usedCompareItems);
  for (const cur of unmatchedCurrent) {
    const sameSeqCompare = compareBySeq.get(cur.sequence);
    if (sameSeqCompare) {
      usedCompareItems.add(sameSeqCompare);
      compareBySeq.delete(cur.sequence);
      rows.push({
        sequence: cur.sequence,
        current: cur,
        compare: sameSeqCompare,
        kind: 'modified',
      });
      continue;
    }

    rows.push({ sequence: cur.sequence, current: cur, compare: null, kind: 'added' });
  }

  const removedRows = sortedBySequence(compareItems)
    .filter((item) => !usedCompareItems.has(item))
    .map((item) => ({
      sequence: item.sequence,
      current: null,
      compare: item,
      kind: 'removed' as const,
    }));

  return [...rows, ...removedRows].sort((a, b) => {
    if (a.sequence !== b.sequence) return a.sequence - b.sequence;
    return kindSortWeight(a.kind) - kindSortWeight(b.kind);
  });
}

function kindSortWeight(kind: DiffKind): number {
  if (kind === 'removed') return 1;
  return 0;
}
