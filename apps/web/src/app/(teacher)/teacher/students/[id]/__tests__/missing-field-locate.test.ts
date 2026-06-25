import { CHECK_TO_SECTION, firstMissingSectionKey } from '../missing-field-locate';

describe('firstMissingSectionKey', () => {
  it('返回第一个未通过项所在分区', () => {
    // totalScore 属硬性字段 → required 子页
    expect(
      firstMissingSectionKey([
        { key: 'subjects', passed: true },
        { key: 'totalScore', passed: false },
        { key: 'majors', passed: false },
      ]),
    ).toBe('required');
  });
  it('全通过 → null', () => {
    expect(firstMissingSectionKey([{ key: 'subjects', passed: true }])).toBe(null);
  });
  it('未知 key 跳过, 取下一个有映射的', () => {
    // majors 属按需采集字段 → optional 子页
    expect(
      firstMissingSectionKey([
        { key: 'unknown', passed: false },
        { key: 'majors', passed: false },
      ]),
    ).toBe('optional');
  });
  it('每个核对项都有分区映射', () => {
    for (const key of [
      'subjects', 'totalScore', 'rank', 'cities', 'majors', 'bonusStatus', 'health', 'location',
    ]) {
      expect(CHECK_TO_SECTION[key]).toBeTruthy();
    }
  });
});
