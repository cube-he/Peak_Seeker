import { normalizeUniversityName, UniversityMatcher } from '../university-matcher';

describe('normalizeUniversityName', () => {
  it('去除中文括号及内容', () => {
    expect(normalizeUniversityName('中国传媒大学（北京）')).toBe('中国传媒大学');
  });
  it('去除英文括号及内容', () => {
    expect(normalizeUniversityName('清华大学(深圳)')).toBe('清华大学');
  });
  it('去除全部空格', () => {
    expect(normalizeUniversityName(' 北京大学  ')).toBe('北京大学');
    expect(normalizeUniversityName('北 京 大 学')).toBe('北京大学');
  });
  it('保留无括号无空格的名字', () => {
    expect(normalizeUniversityName('复旦大学')).toBe('复旦大学');
  });
});

describe('UniversityMatcher', () => {
  const fakeUniversities = [
    { id: 1, name: '北京大学', code: '10001' },
    { id: 2, name: '清华大学', code: '10003' },
    { id: 3, name: '中国传媒大学（北京）', code: '10033' },
  ];

  const fakePrisma = {
    university: {
      findMany: async () => fakeUniversities,
    },
  };

  it('matchByCode 严格匹配', async () => {
    const m = await UniversityMatcher.fromDb(fakePrisma as any);
    expect(m.matchByCode('10001')).toEqual([1]);
    expect(m.matchByCode('99999')).toBeNull();
  });

  it('matchByName 用 normalize 后名字匹配', async () => {
    const m = await UniversityMatcher.fromDb(fakePrisma as any);
    expect(m.matchByName('北京大学')).toEqual([1]);
    expect(m.matchByName('中国传媒大学')).toEqual([3]);
    expect(m.matchByName('不存在的院校')).toBeNull();
  });

  it('reportUnmatched 累积未匹配数 + 前 20 个样本', async () => {
    const m = await UniversityMatcher.fromDb(fakePrisma as any);
    m.matchByName('不存在 1');
    m.matchByName('不存在 2');
    m.matchByName('不存在 1');
    const r = m.reportUnmatched();
    expect(r.totalUnmatched).toBe(3);
    expect(r.sampleNames).toContain('不存在 1');
    expect(r.sampleNames).toContain('不存在 2');
  });
});
