import { laneOf, levelMismatchTag } from '../level-mismatch';

describe('laneOf', () => {
  it('PHYSICS→phy, HISTORY→his, 其余→null', () => {
    expect(laneOf('PHYSICS')).toBe('phy');
    expect(laneOf('HISTORY')).toBe('his');
    expect(laneOf('COMPREHENSIVE_SCIENCE')).toBeNull();
    expect(laneOf(null)).toBeNull();
  });
});

describe('levelMismatchTag', () => {
  it('本科生 × 专科项 → 专科', () => {
    expect(levelMismatchTag('专科', '本科')).toBe('专科');
  });
  it('专科生 × 本科项 → 本科', () => {
    expect(levelMismatchTag('本科', '专科')).toBe('本科');
  });
  it('同层 → null', () => {
    expect(levelMismatchTag('本科', '本科')).toBeNull();
  });
  it('兼有 → null', () => {
    expect(levelMismatchTag('兼有', '本科')).toBeNull();
  });
  it('eligibleLevel=null 或 itemLevel 缺失 → null', () => {
    expect(levelMismatchTag('专科', null)).toBeNull();
    expect(levelMismatchTag(null, '本科')).toBeNull();
  });
});
