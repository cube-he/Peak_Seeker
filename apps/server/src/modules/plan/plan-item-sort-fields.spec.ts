import { toSortFields } from './plan-item-sort-fields';

describe('toSortFields', () => {
  const item = {
    universityId: 10,
    score25Group: 620, rank25Group: 8000,
    score25Major: 615, rank25Major: 9000,
    score24Major: 610, lastYearMinScore: 600, lastYearMinRank: 12000,
    planCount: 50, tuition: 4900,
    schoolNature: '民办', schoolTags: '211',
  };
  const uni = {
    province: '四川', runningNature: '公办', softRanking: 33,
    is985: true, is211: true, isDoubleFirstClass: true,
  };

  it('University 优先 + 派生 inSichuan', () => {
    const f = toSortFields(item, uni);
    expect(f.schoolNature).toBe('公办');      // University 优先于快照
    expect(f.province).toBe('四川');
    expect(f.inSichuan).toBe(true);
    expect(f.softRanking).toBe(33);
    expect(f.is985).toBe(true);
    expect(f.score25Group).toBe(620);
    expect(f.rank25Group).toBe(8000);
  });

  it('无 University 时回退快照, 字段安全置空/false', () => {
    const f = toSortFields(item, undefined);
    expect(f.schoolNature).toBe('民办');       // 回退快照
    expect(f.province).toBeNull();
    expect(f.inSichuan).toBe(false);
    expect(f.softRanking).toBeNull();
    expect(f.is985).toBe(false);
    expect(f.is211).toBe(false);
  });

  it('省份非四川 → inSichuan=false', () => {
    expect(toSortFields(item, { ...uni, province: '北京' }).inSichuan).toBe(false);
  });
});
