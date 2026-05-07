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
});
