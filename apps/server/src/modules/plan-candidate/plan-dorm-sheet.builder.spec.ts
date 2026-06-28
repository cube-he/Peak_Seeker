import { buildDormSheet, DORM_FIELD_KEYS } from './plan-dorm-sheet.builder';

const plan = {
  id: 78,
  batchName: '本科批',
  year: 2026,
  student: { user: { realName: '张三' } },
  planItems: [
    { sequence: 1, universityId: 10 },
    { sequence: 2, universityId: 20 },
    { sequence: 3, universityId: 10 }, // 同校重复, 应去重保第一次出现顺序
  ],
};

const universities = [
  { id: 20, name: '北京大学', province: '北京', city: '北京', runningLevel: '本科', runningNature: '公办', roomCapacity: '4', dormAirConditioner: '有' },
  { id: 10, name: '四川大学', province: '四川', city: '成都', runningLevel: '本科', runningNature: '公办' }, // 28 字段全空
];

describe('buildDormSheet', () => {
  it('按 planItems.sequence 去重保序', () => {
    const sheet = buildDormSheet({ plan: plan as any, universities: universities as any });
    expect(sheet.universities.map((u) => u.id)).toEqual([10, 20]);
  });

  it('plan/student 元信息透出', () => {
    const sheet = buildDormSheet({ plan: plan as any, universities: universities as any });
    expect(sheet.plan).toEqual({ id: 78, batchName: '本科批', year: 2026 });
    expect(sheet.student).toEqual({ name: '张三' });
  });

  it('28 字段全空的院校 hasData=false', () => {
    const sheet = buildDormSheet({ plan: plan as any, universities: universities as any });
    const scu = sheet.universities.find((u) => u.id === 10)!;
    expect(scu.hasData).toBe(false);
    expect(scu.dorm.roomCapacity).toBeNull();
  });

  it('有任一字段的院校 hasData=true 且字段透出', () => {
    const sheet = buildDormSheet({ plan: plan as any, universities: universities as any });
    const pku = sheet.universities.find((u) => u.id === 20)!;
    expect(pku.hasData).toBe(true);
    expect(pku.dorm.roomCapacity).toBe('4');
    expect(pku.dorm.dormAirConditioner).toBe('有');
  });

  it('DORM_FIELD_KEYS 含 28 个字段', () => {
    expect(DORM_FIELD_KEYS).toHaveLength(28);
  });
});
