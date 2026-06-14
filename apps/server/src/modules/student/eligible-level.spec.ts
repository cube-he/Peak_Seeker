import { eligibleLevelFromScore } from './eligible-level';

describe('eligibleLevelFromScore', () => {
  it('过本科线 → 本科', () => {
    expect(eligibleLevelFromScore(560, 541)).toBe('本科');
  });
  it('等于本科线 → 本科', () => {
    expect(eligibleLevelFromScore(541, 541)).toBe('本科');
  });
  it('没过本科线 → 专科', () => {
    expect(eligibleLevelFromScore(400, 541)).toBe('专科');
  });
  it('没填分 → null', () => {
    expect(eligibleLevelFromScore(null, 541)).toBeNull();
  });
  it('查不到本科线 → null', () => {
    expect(eligibleLevelFromScore(560, null)).toBeNull();
  });
});
