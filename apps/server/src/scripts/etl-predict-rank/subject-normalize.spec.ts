import { normalizeSubject, CanonicalSubject, decidePoolKey } from './subject-normalize';

describe('normalizeSubject', () => {
  it.each([
    ['物理', '物理'],
    ['物理类', '物理'],
    ['理科', '物理'],
    ['历史', '历史'],
    ['历史类', '历史'],
    ['文科', '历史'],
    ['全部', '全部'],
    ['物理化学', '物理化学'],
    ['物化', '物理化学'],
    ['物化组合', '物理化学'],
    ['', null],
    ['综合改革', null],
    ['  物理  ', '物理'],
  ])('%s -> %s', (input, expected) => {
    expect(normalizeSubject(input)).toBe(expected);
  });
});

describe('decidePoolKey', () => {
  it('returns 物理化学 when subject=物理 and req contains 化学', () => {
    expect(decidePoolKey('物理', '化学')).toBe('物理化学');
    expect(decidePoolKey('物理', '化学和生物')).toBe('物理化学');
    expect(decidePoolKey('物理类', '化学')).toBe('物理化学');
  });
  it('returns 物理 when subject=物理 and req does not contain 化学', () => {
    expect(decidePoolKey('物理', '不限')).toBe('物理');
    expect(decidePoolKey('物理', '生物')).toBe('物理');
    expect(decidePoolKey('物理', '')).toBe('物理');
    expect(decidePoolKey('物理', null)).toBe('物理');
  });
  it('returns 历史 regardless of req (historical subset is < 1%)', () => {
    expect(decidePoolKey('历史', '化学')).toBe('历史');
    expect(decidePoolKey('历史', '不限')).toBe('历史');
  });
  it('returns null for unknown subject', () => {
    expect(decidePoolKey('综合改革', '化学')).toBeNull();
    expect(decidePoolKey(null, '化学')).toBeNull();
  });
  it('handles legacy gaokao subjects (理科/文科)', () => {
    expect(decidePoolKey('理科', '化学')).toBe('物理化学');
    expect(decidePoolKey('文科', '化学')).toBe('历史');
  });
});
