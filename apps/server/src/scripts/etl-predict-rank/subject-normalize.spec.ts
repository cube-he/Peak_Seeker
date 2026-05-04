import { normalizeSubject, CanonicalSubject } from './subject-normalize';

describe('normalizeSubject', () => {
  it.each([
    ['物理', '物理'],
    ['物理类', '物理'],
    ['理科', '物理'],
    ['历史', '历史'],
    ['历史类', '历史'],
    ['文科', '历史'],
    ['全部', '全部'],
    ['', null],
    ['综合改革', null],
    ['  物理  ', '物理'],
  ])('%s -> %s', (input, expected) => {
    expect(normalizeSubject(input)).toBe(expected);
  });
});
