import { laneOf, levelMismatchTag, tagForLevels } from '../level-mismatch';

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

describe('tagForLevels', () => {
  it('按 lane 取对应层次再判定 (phy/his 不串)', () => {
    // 物理 lane=专科 → 本科生标专科; 历史 lane=本科 → 同层不标
    expect(tagForLevels({ phy: '专科', his: '本科' }, 'PHYSICS', '本科')).toBe('专科');
    expect(tagForLevels({ phy: '专科', his: '本科' }, 'HISTORY', '本科')).toBeNull();
  });
  it('无 levels 或科类映射不到 lane → null', () => {
    expect(tagForLevels(null, 'PHYSICS', '本科')).toBeNull();
    expect(tagForLevels({ phy: '专科', his: '专科' }, 'COMPREHENSIVE_SCIENCE', '本科')).toBeNull();
  });
});
