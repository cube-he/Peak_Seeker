import { parseMainRank } from './parse-main-rank';

describe('parseMainRank', () => {
  it('returns the integer for pure numeric strings', () => {
    expect(parseMainRank('1')).toBe(1);
    expect(parseMainRank('42')).toBe(42);
    expect(parseMainRank('  123 ')).toBe(123);
  });

  it('returns the integer when the cell value is already a number', () => {
    expect(parseMainRank(1)).toBe(1);
    expect(parseMainRank(42)).toBe(42);
  });

  it('returns null for category-prefixed ranks (医1/财1/政1/语1/民1/体1/中医药1)', () => {
    // 软科中国大学排名（总榜）里专门类院校用类别前缀编号,不是综合排序
    expect(parseMainRank('医1')).toBeNull();
    expect(parseMainRank('财1')).toBeNull();
    expect(parseMainRank('政1')).toBeNull();
    expect(parseMainRank('语1')).toBeNull();
    expect(parseMainRank('民1')).toBeNull();
    expect(parseMainRank('体1')).toBeNull();
    expect(parseMainRank('医5')).toBeNull();
    expect(parseMainRank('财23')).toBeNull();
  });

  it('returns null for empty, null, undefined, or whitespace-only', () => {
    expect(parseMainRank('')).toBeNull();
    expect(parseMainRank('   ')).toBeNull();
    expect(parseMainRank(null)).toBeNull();
    expect(parseMainRank(undefined)).toBeNull();
  });

  it('returns null for non-integer numeric strings (decimals, signs, separators)', () => {
    expect(parseMainRank('1.5')).toBeNull();
    expect(parseMainRank('-1')).toBeNull();
    expect(parseMainRank('1,000')).toBeNull();
  });

  it('returns null for trailing-letter ranks (defensive against other prefix schemes)', () => {
    expect(parseMainRank('1医')).toBeNull();
    expect(parseMainRank('1a')).toBeNull();
  });

  it('extracts text from ExcelJS rich-text cell objects before parsing', () => {
    // exceljs 有时候把 cell value 包成 { richText: [{ text: '...' }] } 或 { text: '...' }
    expect(parseMainRank({ richText: [{ text: '5' }] })).toBe(5);
    expect(parseMainRank({ richText: [{ text: '医' }, { text: '1' }] })).toBeNull();
    expect(parseMainRank({ text: '7' })).toBe(7);
    expect(parseMainRank({ text: '医3' })).toBeNull();
  });
});
