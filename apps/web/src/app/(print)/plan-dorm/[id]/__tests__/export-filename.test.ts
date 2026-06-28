import { buildDormTitle } from '../export-filename';

describe('buildDormTitle', () => {
  const now = new Date('2026-06-28T10:00:00');

  it('拼 学生_批次_院校生活情况_日期', () => {
    const t = buildDormTitle({ student: { name: '王润' }, plan: { batchName: '本科批B段' } } as any, now);
    expect(t).toBe('王润_本科批B段_院校生活情况_20260628');
  });

  it('清洗非法字符 + 缺名兜底', () => {
    const t = buildDormTitle({ student: { name: 'a/b' }, plan: { batchName: null } } as any, now);
    expect(t).toBe('a_b_院校生活情况_20260628');
  });
});
