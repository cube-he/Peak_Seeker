import { mapExamType } from './exam-type.helper';

describe('mapExamType', () => {
  it('物理 → 理科 当目标年 ≤ 2024', () => {
    expect(mapExamType('物理', 2024)).toBe('理科');
    expect(mapExamType('物理', 2022)).toBe('理科');
  });

  it('历史 → 文科 当目标年 ≤ 2024', () => {
    expect(mapExamType('历史', 2024)).toBe('文科');
  });

  it('物理 → 物理 当目标年 ≥ 2025', () => {
    expect(mapExamType('物理', 2025)).toBe('物理');
    expect(mapExamType('物理', 2026)).toBe('物理');
  });

  it('理科 → 理科（同年保持）', () => {
    expect(mapExamType('理科', 2023)).toBe('理科');
    expect(mapExamType('理科', 2025)).toBe('理科');
  });

  it('文科 → 文科', () => {
    expect(mapExamType('文科', 2025)).toBe('文科');
  });

  it('不识别的科类 → 抛错', () => {
    expect(() => mapExamType('xxx' as any, 2025)).toThrow(/不支持的科类/);
  });
});
