// gradient-calculator.spec.ts
import { calcGradient } from './gradient-calculator';

describe('calcGradient', () => {
  it('返回 CHONG 当学生位次显著优于历史最低位次', () => {
    expect(calcGradient(8000, 10000)).toBe('CHONG'); // 8000/10000=0.8 < 0.9
  });

  it('返回 WEN 当位次接近历史最低位次', () => {
    expect(calcGradient(10000, 10000)).toBe('WEN'); // ratio=1.0
    expect(calcGradient(9500, 10000)).toBe('WEN');  // 0.95
    expect(calcGradient(10500, 10000)).toBe('WEN'); // 1.05
  });

  it('返回 BAO 当位次明显低于历史最低位次', () => {
    expect(calcGradient(15000, 10000)).toBe('BAO'); // 1.5 > 1.1
  });

  it('边界 0.9：恰好等于阈值返回 WEN', () => {
    expect(calcGradient(9000, 10000)).toBe('WEN');
  });

  it('边界 1.1：恰好等于阈值返回 WEN', () => {
    expect(calcGradient(11000, 10000)).toBe('WEN');
  });

  it('historyMinRank 缺失（null/undefined）返回 BAO', () => {
    expect(calcGradient(10000, null)).toBe('BAO');
    expect(calcGradient(10000, undefined as any)).toBe('BAO');
  });

  it('historyMinRank 为 0 返回 BAO（避免除零）', () => {
    expect(calcGradient(10000, 0)).toBe('BAO');
  });

  it('支持自定义阈值', () => {
    expect(calcGradient(8400, 10000, { chong: 0.85, bao: 1.05 })).toBe('CHONG'); // 0.84 < 0.85
    expect(calcGradient(10600, 10000, { chong: 0.85, bao: 1.05 })).toBe('BAO'); // 1.06 > 1.05
  });
});
