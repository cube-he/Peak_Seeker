import {
  filterGroupsByNature,
  filterGroupsByTags,
  filterGroupsByBackgrounds,
  filterGroupsByUniversityProvinces,
  filterGroupsByUniversityCities,
  filterGroupsByIsNewItem,
} from './major-mode-filters';

// 构造最小 group: 7 项 chip 只看 university 子对象 + isNewMajor/isNewUniversity 顶层标记
const g = (
  university: any,
  extra: Partial<{ isNewMajor: boolean; isNewUniversity: boolean }> = {},
) => ({ university, ...extra });

describe('major-mode-filters', () => {
  describe('filterGroupsByNature: runningNature 子串单选', () => {
    const groups = [
      g({ runningNature: '公办' }),                 // 0
      g({ runningNature: '民办' }),                 // 1
      g({ runningNature: '公办 中外合作办学' }),     // 2 (公办+中外, 两个 chip 都该命中)
      g({ runningNature: '港澳台合作办学' }),        // 3
      g({ runningNature: '境外高校独立办学' }),      // 4 (库里真实值; 无"独立学院", independent chip 实筛此类)
      g({ runningNature: null }),                    // 5 (字段空, 无 chip 时通过, 有 chip 时排除)
    ];

    it('sinoForeign 只留含"中外合作"的院校', () => {
      const r = filterGroupsByNature(groups, 'sinoForeign');
      expect(r).toEqual([groups[2]]);
    });

    it('private 只留"民办"', () => {
      expect(filterGroupsByNature(groups, 'private')).toEqual([groups[1]]);
    });

    it('hkMacau 命中"港澳"子串', () => {
      expect(filterGroupsByNature(groups, 'hkMacau')).toEqual([groups[3]]);
    });

    it('independent 命中"境外"子串(境外高校独立办学), 不再误匹配假"独立学院"', () => {
      expect(filterGroupsByNature(groups, 'independent')).toEqual([groups[4]]);
    });

    it('空 nature 原样返回同引用(不过滤)', () => {
      expect(filterGroupsByNature(groups, undefined)).toBe(groups);
      expect(filterGroupsByNature(groups, '')).toBe(groups);
    });
  });

  describe('filterGroupsByTags: 985/211/双一流 多选 OR', () => {
    const groups = [
      g({ is985: true,  is211: true,  isDoubleFirstClass: true  }),  // 0 三冠
      g({ is985: false, is211: true,  isDoubleFirstClass: false }),  // 1 仅 211
      g({ is985: true,  is211: false, isDoubleFirstClass: false }),  // 2 仅 985
      g({ is985: false, is211: false, isDoubleFirstClass: true  }),  // 3 仅双一流 (河南大学/宁夏大学型)
      g({ is985: null,  is211: null,  isDoubleFirstClass: null  }),  // 4 全 null
    ];

    it('tags=985,211 OR 语义: 是 985 或 是 211 任一即过', () => {
      const r = filterGroupsByTags(groups, '985,211');
      expect(r).toEqual([groups[0], groups[1], groups[2]]);
    });

    it('tags=985,doubleFirstClass OR 语义: 是 985 或 是双一流 任一即过 (含仅双一流的非 985)', () => {
      const r = filterGroupsByTags(groups, '985,doubleFirstClass');
      expect(r).toEqual([groups[0], groups[2], groups[3]]);
    });

    it('tags=doubleFirstClass: 双一流匹配', () => {
      const r = filterGroupsByTags(groups, 'doubleFirstClass');
      expect(r).toEqual([groups[0], groups[3]]);
    });

    it('空 csv 原样返回同引用', () => {
      expect(filterGroupsByTags(groups, '')).toBe(groups);
      expect(filterGroupsByTags(groups, undefined)).toBe(groups);
    });
  });

  describe('filterGroupsByBackgrounds: LIKE 多选 OR', () => {
    const groups = [
      g({ universityBackground: '九校联盟/卓越大学联盟' }),  // 0 双背景
      g({ universityBackground: '国防七子' }),               // 1
      g({ universityBackground: '法学五院四系' }),           // 2
      g({ universityBackground: '' }),                       // 3 空字符串 (永不命中)
      g({ universityBackground: null }),                     // 4 null (永不命中)
    ];

    it('backgrounds=九校联盟,国防七子 OR 语义: 任一命中即留', () => {
      const r = filterGroupsByBackgrounds(groups, '九校联盟,国防七子');
      expect(r).toEqual([groups[0], groups[1]]);
    });

    it('单值=九校联盟 子串匹配 (从 "九校联盟/卓越大学联盟" 中识别)', () => {
      const r = filterGroupsByBackgrounds(groups, '九校联盟');
      expect(r).toEqual([groups[0]]);
    });

    it('空 csv 原样返回同引用', () => {
      expect(filterGroupsByBackgrounds(groups, '')).toBe(groups);
    });
  });

  describe('filterGroupsByUniversityProvinces / Cities: CSV IN', () => {
    const groups = [
      g({ province: '北京', city: '北京' }),    // 0
      g({ province: '上海', city: '上海' }),    // 1
      g({ province: '四川', city: '成都' }),    // 2
      g({ province: null,   city: null }),      // 3 空 → 有过滤时排除
    ];

    it('universityProvinces=北京,上海 只留两省', () => {
      const r = filterGroupsByUniversityProvinces(groups, '北京,上海');
      expect(r).toEqual([groups[0], groups[1]]);
    });

    it('universityCities=成都,北京 只留两市', () => {
      const r = filterGroupsByUniversityCities(groups, '成都,北京');
      expect(r).toEqual([groups[0], groups[2]]);
    });

    it('城市去后缀归一: 输入"成都市"也命中库里的"成都"', () => {
      const r = filterGroupsByUniversityCities(groups, '成都市');
      expect(r).toEqual([groups[2]]);
    });

    it('城市去后缀归一: 库里"璧山区"被输入"璧山"命中', () => {
      const bishan = [g({ province: '重庆', city: '璧山区' })];
      expect(filterGroupsByUniversityCities(bishan, '璧山')).toEqual([bishan[0]]);
    });

    it('空 csv 原样返回同引用 (两函数都验)', () => {
      expect(filterGroupsByUniversityProvinces(groups, '')).toBe(groups);
      expect(filterGroupsByUniversityCities(groups, undefined)).toBe(groups);
    });
  });

  describe('filterGroupsByIsNewItem: 新增院校/专业/任一', () => {
    const groups = [
      g({}, { isNewMajor: true,  isNewUniversity: false }), // 0 仅新增专业
      g({}, { isNewMajor: false, isNewUniversity: true  }), // 1 仅新增院校
      g({}, { isNewMajor: true,  isNewUniversity: true  }), // 2 都新增
      g({}, { isNewMajor: false, isNewUniversity: false }), // 3 都不
    ];

    it('isNewItem=major 只留 isNewMajor=true', () => {
      const r = filterGroupsByIsNewItem(groups, 'major');
      expect(r).toEqual([groups[0], groups[2]]);
    });

    it('isNewItem=university 只留 isNewUniversity=true', () => {
      const r = filterGroupsByIsNewItem(groups, 'university');
      expect(r).toEqual([groups[1], groups[2]]);
    });

    it('isNewItem=either 任一为 true 即留', () => {
      const r = filterGroupsByIsNewItem(groups, 'either');
      expect(r).toEqual([groups[0], groups[1], groups[2]]);
    });

    it('空 isNewItem 原样返回同引用', () => {
      expect(filterGroupsByIsNewItem(groups, '')).toBe(groups);
      expect(filterGroupsByIsNewItem(groups, undefined)).toBe(groups);
    });
  });
});
