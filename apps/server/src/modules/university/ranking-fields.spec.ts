import { aggregateMinScoreRank, pickUniversityPredRank } from './ranking-fields';

describe('aggregateMinScoreRank', () => {
  it('picks the lowest-score row across the year records', () => {
    const result = aggregateMinScoreRank([
      { majorMinScore: 520, majorMinRank: 30000, groupMinScore: null, groupMinRank: null },
      { majorMinScore: 480, majorMinRank: 55000, groupMinScore: null, groupMinRank: null },
      { majorMinScore: 510, majorMinRank: 38000, groupMinScore: null, groupMinRank: null },
    ]);
    expect(result).toEqual({ minScore: 480, minRank: 55000 });
  });

  it('falls back to groupMin when majorMin is null', () => {
    const result = aggregateMinScoreRank([
      { majorMinScore: null, majorMinRank: null, groupMinScore: 500, groupMinRank: 42000 },
    ]);
    expect(result).toEqual({ minScore: 500, minRank: 42000 });
  });

  it('returns null when no row has a usable score', () => {
    expect(aggregateMinScoreRank([
      { majorMinScore: null, majorMinRank: null, groupMinScore: null, groupMinRank: null },
    ])).toBeNull();
    expect(aggregateMinScoreRank([])).toBeNull();
  });
});

describe('pickUniversityPredRank', () => {
  it('takes the smallest pointRank (hardest group)', () => {
    expect(pickUniversityPredRank([
      { pointRank: 9000 }, { pointRank: 3000 }, { pointRank: 15000 },
    ])).toBe(3000);
  });

  it('ignores null pointRank and returns null when all null', () => {
    expect(pickUniversityPredRank([{ pointRank: null }, { pointRank: 7000 }])).toBe(7000);
    expect(pickUniversityPredRank([{ pointRank: null }])).toBeNull();
    expect(pickUniversityPredRank([])).toBeNull();
  });
});
