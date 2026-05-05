import { computeTrend } from '../trendChip';

describe('computeTrend', () => {
  it('returns null when prev or curr is missing', () => {
    expect(computeTrend(undefined, 100, 'score')).toBeNull();
    expect(computeTrend(100, undefined, 'score')).toBeNull();
    expect(computeTrend(undefined, undefined, 'score')).toBeNull();
  });

  it('flat when delta is 0', () => {
    expect(computeTrend(100, 100, 'score')).toEqual({
      delta: 0,
      arrow: '─',
      color: 'flat',
      text: '─',
    });
  });

  it('score semantic: rise (curr > prev) is red', () => {
    expect(computeTrend(580, 600, 'score')).toMatchObject({
      delta: 20,
      arrow: '↑',
      color: 'red',
      text: '↑20',
    });
  });

  it('score semantic: fall (curr < prev) is green', () => {
    expect(computeTrend(600, 580, 'score')).toMatchObject({
      delta: -20,
      arrow: '↓',
      color: 'green',
      text: '↓20',
    });
  });

  it('rank semantic: number decreases (rank rises) → red', () => {
    expect(computeTrend(30000, 10000, 'rank')).toMatchObject({
      delta: -20000,
      arrow: '↑',
      color: 'red',
      text: '↑20000',
    });
  });

  it('rank semantic: number increases (rank falls) → green', () => {
    expect(computeTrend(10000, 30000, 'rank')).toMatchObject({
      delta: 20000,
      arrow: '↓',
      color: 'green',
      text: '↓20000',
    });
  });
});
