import {
  parseRecruitTypeCsv,
  filterGroupsByRecruitType,
  collectRecruitTypes,
} from './recruit-type-filter';

const g = (recruitType: string) => ({ recruitType });

describe('recruit-type-filter', () => {
  it('parseRecruitTypeCsv: 拆分去空白去空项', () => {
    expect(parseRecruitTypeCsv('普通类本科, 国家专项计划 ,')).toEqual(['普通类本科', '国家专项计划']);
    expect(parseRecruitTypeCsv('')).toEqual([]);
    expect(parseRecruitTypeCsv(undefined)).toEqual([]);
  });

  it('filterGroupsByRecruitType: 单值只留该类', () => {
    const groups = [g('普通类本科'), g('民族班'), g('普通类本科')];
    expect(filterGroupsByRecruitType(groups, '普通类本科')).toEqual([g('普通类本科'), g('普通类本科')]);
  });

  it('filterGroupsByRecruitType: 多值留多类', () => {
    const groups = [g('国家专项计划'), g('地方专项计划'), g('普通类本科')];
    expect(filterGroupsByRecruitType(groups, '国家专项计划,地方专项计划'))
      .toEqual([g('国家专项计划'), g('地方专项计划')]);
  });

  it('filterGroupsByRecruitType: 空 csv 原样返回同引用(不过滤)', () => {
    const groups = [g('普通类本科')];
    expect(filterGroupsByRecruitType(groups, '')).toBe(groups);
    expect(filterGroupsByRecruitType(groups, undefined)).toBe(groups);
  });

  it('collectRecruitTypes: distinct + 按组数降序(普通类置顶), 同数 localeCompare', () => {
    const groups = [g('民族班'), g('普通类本科'), g('普通类本科'), g('国家专项计划'), g('普通类本科')];
    expect(collectRecruitTypes(groups)).toEqual(['普通类本科', '国家专项计划', '民族班']);
  });

  it('collectRecruitTypes: 忽略空 recruitType', () => {
    const groups = [{ recruitType: '' }, { recruitType: null as any }, g('普通类本科')];
    expect(collectRecruitTypes(groups)).toEqual(['普通类本科']);
  });
});
