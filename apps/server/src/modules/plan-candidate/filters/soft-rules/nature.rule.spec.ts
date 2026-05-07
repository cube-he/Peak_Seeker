import { NatureRule } from './nature.rule';

const rule = new NatureRule();

describe('NatureRule', () => {
  it('不接受中外合作 + 中外合作专业 → 软不符合', () => {
    const s = { acceptSinoForeign: false } as any;
    const c = { isSinoForeign: true, university: { runningNature: '公办' } } as any;
    expect(rule.check(s, c).pass).toBe(false);
  });

  it('接受中外合作 + 中外合作 → 通过', () => {
    const s = { acceptSinoForeign: true } as any;
    const c = { isSinoForeign: true, university: { runningNature: '公办' } } as any;
    expect(rule.check(s, c).pass).toBe(true);
  });

  it('STRICT 拒绝民办 + 民办院校 → 软不符合', () => {
    const s = { acceptSinoForeign: true, acceptPrivate: 'STRICT' } as any;
    const c = { isSinoForeign: false, university: { runningNature: '民办' } } as any;
    expect(rule.check(s, c).pass).toBe(false);
  });

  it('RELAXED 民办 + 民办 → 通过', () => {
    const s = { acceptSinoForeign: true, acceptPrivate: 'RELAXED' } as any;
    const c = { isSinoForeign: false, university: { runningNature: '民办' } } as any;
    expect(rule.check(s, c).pass).toBe(true);
  });
});
