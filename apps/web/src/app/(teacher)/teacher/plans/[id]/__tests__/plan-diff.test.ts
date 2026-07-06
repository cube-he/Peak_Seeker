import { diffPlanItems, planItemIdentity } from '../plan-diff';

function item(overrides: Record<string, any>) {
  return {
    id: overrides.id,
    sequence: overrides.sequence,
    universityId: overrides.universityId ?? 1,
    universityCode: overrides.universityCode ?? 'U1',
    universityName: overrides.universityName ?? 'University A',
    groupCode: overrides.groupCode ?? '101',
    majorId: overrides.majorId ?? 10,
    majorCode: overrides.majorCode ?? '01',
    majorName: overrides.majorName ?? 'Nursing',
    ...overrides,
  };
}

describe('planItemIdentity', () => {
  it('uses university + group + major fields, so same major name in different groups is not merged', () => {
    expect(planItemIdentity(item({ id: 1, groupCode: '101' }))).not.toBe(
      planItemIdentity(item({ id: 2, groupCode: '102' })),
    );
  });

  it('falls back to code/name fields when ids are absent', () => {
    expect(planItemIdentity(item({
      id: 1,
      universityId: undefined,
      universityCode: '5156',
      groupCode: '101',
      majorId: undefined,
      majorCode: '06',
      majorName: 'Power Systems',
    }))).toBe('5156|101|06');
  });
});

describe('diffPlanItems', () => {
  it('detects same item moved to a new sequence and exposes old/new sequence', () => {
    const compare = [
      item({ id: 101, sequence: 1, universityId: 1, groupCode: '101', majorId: 1 }),
      item({ id: 102, sequence: 2, universityId: 2, groupCode: '101', majorId: 2 }),
      item({ id: 103, sequence: 3, universityId: 3, groupCode: '101', majorId: 3 }),
    ];
    const current = [
      item({ id: 201, sequence: 1, universityId: 2, groupCode: '101', majorId: 2 }),
      item({ id: 202, sequence: 2, universityId: 1, groupCode: '101', majorId: 1 }),
      item({ id: 203, sequence: 3, universityId: 3, groupCode: '101', majorId: 3 }),
    ];

    const rows = diffPlanItems(current, compare);

    expect(rows.map((r) => [r.sequence, r.kind, r.fromSequence, r.toSequence])).toEqual([
      [1, 'reordered', 2, 1],
      [2, 'reordered', 1, 2],
      [3, 'same', undefined, undefined],
    ]);
  });

  it('does not steal a moved compare row for a same-sequence replacement', () => {
    const rows = diffPlanItems(
      [
        item({ id: 201, sequence: 1, universityId: 9, majorId: 9 }),
        item({ id: 202, sequence: 2, universityId: 1, majorId: 1 }),
      ],
      [item({ id: 101, sequence: 1, universityId: 1, majorId: 1 })],
    );

    expect(rows.map((r) => [r.sequence, r.kind, r.fromSequence, r.toSequence])).toEqual([
      [1, 'added', undefined, undefined],
      [2, 'reordered', 1, 2],
    ]);
  });

  it('keeps same-sequence replacement as modified when neither side moved elsewhere', () => {
    const rows = diffPlanItems(
      [item({ id: 201, sequence: 1, universityId: 9, majorId: 9 })],
      [item({ id: 101, sequence: 1, universityId: 1, majorId: 1 })],
    );

    expect(rows).toMatchObject([{ sequence: 1, kind: 'modified' }]);
  });

  it('reports added and removed items when no same-sequence pairing exists', () => {
    const rows = diffPlanItems(
      [item({ id: 201, sequence: 3, universityId: 3, majorId: 3 })],
      [item({ id: 101, sequence: 1, universityId: 1, majorId: 1 })],
    );

    expect(rows.map((r) => [r.sequence, r.kind])).toEqual([
      [1, 'removed'],
      [3, 'added'],
    ]);
  });

  it('does not confuse same university and major across different groups', () => {
    const rows = diffPlanItems(
      [item({ id: 201, sequence: 1, universityId: 1, groupCode: '102', majorId: 10, majorName: 'Nursing' })],
      [item({ id: 101, sequence: 1, universityId: 1, groupCode: '101', majorId: 10, majorName: 'Nursing' })],
    );

    expect(rows).toMatchObject([{ sequence: 1, kind: 'modified' }]);
  });
});
