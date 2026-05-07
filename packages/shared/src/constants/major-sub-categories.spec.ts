import { MAJOR_SUB_CATEGORIES } from './major-sub-categories';
import { MAJOR_CATEGORIES } from './major';

describe('MAJOR_SUB_CATEGORIES', () => {
  it('contains 计算机类 (categoryCode 08 工学)', () => {
    const cs = MAJOR_SUB_CATEGORIES.find((m) => m.name === '计算机类');
    expect(cs).toBeDefined();
    expect(cs?.categoryCode).toBe('08');
  });

  it('contains 临床医学类 (categoryCode 10 医学)', () => {
    const cm = MAJOR_SUB_CATEGORIES.find((m) => m.name === '临床医学类');
    expect(cm).toBeDefined();
    expect(cm?.categoryCode).toBe('10');
  });

  it('contains 金融学类 (categoryCode 02 经济学)', () => {
    expect(MAJOR_SUB_CATEGORIES.find((m) => m.name === '金融学类')).toBeDefined();
  });

  it('has 92 entries (教育部 2024 目录)', () => {
    expect(MAJOR_SUB_CATEGORIES.length).toBe(92);
  });

  it('all codes are unique', () => {
    const codes = MAJOR_SUB_CATEGORIES.map((m) => m.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('every categoryCode references a valid MAJOR_CATEGORIES entry', () => {
    const validCodes = new Set(MAJOR_CATEGORIES.map((c) => c.code));
    for (const sub of MAJOR_SUB_CATEGORIES) {
      expect(validCodes).toContain(sub.categoryCode);
    }
  });

  it('every code starts with its categoryCode (4-digit = 2-digit category + 2-digit subcategory)', () => {
    for (const sub of MAJOR_SUB_CATEGORIES) {
      expect(sub.code.startsWith(sub.categoryCode)).toBe(true);
    }
  });

  it('all codes match /^\\d{4}$/ format', () => {
    for (const sub of MAJOR_SUB_CATEGORIES) {
      expect(sub.code).toMatch(/^\d{4}$/);
    }
  });
});
