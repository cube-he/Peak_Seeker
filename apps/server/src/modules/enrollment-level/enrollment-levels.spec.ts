import { classifyLevel } from './enrollment-levels';

describe('classifyLevel', () => {
  it('本科+专科都有 → 兼有', () => {
    expect(classifyLevel(3, 2)).toBe('兼有');
  });
  it('只有本科 → 本科', () => {
    expect(classifyLevel(5, 0)).toBe('本科');
  });
  it('只有专科 → 专科', () => {
    expect(classifyLevel(0, 4)).toBe('专科');
  });
  it('都没有 → null', () => {
    expect(classifyLevel(0, 0)).toBeNull();
  });
});
