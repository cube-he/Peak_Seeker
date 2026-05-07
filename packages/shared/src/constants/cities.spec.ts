import { CITIES } from './cities';

describe('CITIES', () => {
  it('contains 成都市 with provinceName 四川省', () => {
    const cd = CITIES.find((c) => c.name === '成都市');
    expect(cd).toBeDefined();
    expect(cd?.provinceName).toBe('四川省');
  });

  it('contains 北京市 / 上海市 / 深圳市', () => {
    expect(CITIES.find((c) => c.name === '北京市')).toBeDefined();
    expect(CITIES.find((c) => c.name === '上海市')).toBeDefined();
    expect(CITIES.find((c) => c.name === '深圳市')).toBeDefined();
  });

  it('has > 300 cities', () => {
    expect(CITIES.length).toBeGreaterThan(300);
  });

  it('all codes are unique', () => {
    const codes = CITIES.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('成都市 has 6-digit code 510100 with provinceCode 510000', () => {
    const cd = CITIES.find((c) => c.name === '成都市')!;
    expect(cd.code).toBe('510100');
    expect(cd.provinceCode).toBe('510000');
  });

  it('all codes are 6-digit GB/T 2260 strings', () => {
    expect(CITIES.every((c) => /^\d{6}$/.test(c.code))).toBe(true);
    expect(CITIES.every((c) => /^\d{6}$/.test(c.provinceCode))).toBe(true);
  });

  it('does not contain literal 市辖区 entries', () => {
    expect(CITIES.find((c) => c.name === '市辖区')).toBeUndefined();
  });
});
