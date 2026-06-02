/**
 * 测试 backfill 的核心校区组装逻辑(从 processOne 抽出来的纯函数)。
 *
 * 设计目标 — 修 2026-06-01 试跑暴露的 bug(西南交大坐标被去污规则误删):
 *   1. main 成功 → 始终生成一条 isMain=true 的主校区记录(name='本部')。
 *      candidates 是否为空都不影响。这是 5-07 fix 留下的回退坑:
 *      candidates 非空时不创建主校区记录,导致主校区坐标在库里"消失"。
 *   2. candidate 的 geocodeCampus 结果 isMainAlias=true → 跳过,不创建副本。
 *      不再标 invalid + 清坐标。
 *   3. candidate 真分校(isMainAlias=false)→ 创建 isMain=false verified 副校区。
 *   4. candidate 完全找不到 → 创建 isMain=false invalid 副校区,带候选名,无坐标。
 */
import { buildCampusRows } from './build-campus-rows';

const main = {
  address: '成都市江安',
  province: '四川省', city: '成都市', district: '双流区',
  latitude: 30.557573, longitude: 103.999715,
  source: 'amap_poi' as const,
  formattedAddress: '成都市双流区江安校区',
};

describe('buildCampusRows', () => {
  it('main 成功 + 无 candidate → 只产生一条「本部」主校区记录', () => {
    const rows = buildCampusRows({
      main,
      candidates: [],
      candidateResults: new Map(),
    });
    expect(rows).toEqual([
      {
        name: '本部', isMain: true,
        province: '四川省', city: '成都市', district: '双流区',
        address: '成都市江安',
        latitude: 30.557573, longitude: 103.999715,
        geoStatus: 'verified', geoSource: 'amap_poi',
        discoveredFrom: 'amap_search',
      },
    ]);
  });

  it('main 成功 + candidate 是主校区别名 → 主校区记录保留,候选被跳过(不再 invalid)', () => {
    // 这是西南交大场景:main=犀浦,candidate '犀浦' 查出来还是 main → 跳过候选
    const rows = buildCampusRows({
      main,
      candidates: [{ name: '犀浦', source: 'enrollment_plan_tag' }],
      candidateResults: new Map([
        ['犀浦', { result: { ...main }, isMainAlias: true }],
      ]),
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('本部');
    expect(rows[0].isMain).toBe(true);
    expect(rows[0].geoStatus).toBe('verified');
    expect(rows[0].latitude).toBe(30.557573); // 主校区坐标不丢
  });

  it('main 成功 + candidate 是真分校 → 一条主 + 一条 isMain=false 副', () => {
    // 哈工大场景:main=哈尔滨,candidate '威海' 远离 main → 真副校
    const weihai = {
      address: '威海市文化西路',
      province: '山东省', city: '威海市', district: '环翠区',
      latitude: 37.512345, longitude: 122.123456,
      source: 'amap_poi' as const,
      formattedAddress: '威海市环翠区哈工大威海校区',
    };
    const rows = buildCampusRows({
      main,
      candidates: [{ name: '威海', source: 'enrollment_plan_tag' }],
      candidateResults: new Map([
        ['威海', { result: weihai, isMainAlias: false }],
      ]),
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ name: '本部', isMain: true, geoStatus: 'verified' });
    expect(rows[1]).toMatchObject({
      name: '威海', isMain: false, geoStatus: 'verified',
      latitude: 37.512345, longitude: 122.123456,
      discoveredFrom: 'enrollment_plan_tag',
    });
  });

  it('main 成功 + candidate 完全找不到 → 一条主 + 一条带名 invalid 副', () => {
    const rows = buildCampusRows({
      main,
      candidates: [{ name: '某虚构校区', source: 'enrollment_plan_tag' }],
      candidateResults: new Map([['某虚构校区', null]]),
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ name: '本部', isMain: true, geoStatus: 'verified' });
    expect(rows[1]).toMatchObject({
      name: '某虚构校区', isMain: false, geoStatus: 'invalid',
      discoveredFrom: 'enrollment_plan_tag',
    });
    expect(rows[1].latitude).toBeUndefined();
    expect(rows[1].longitude).toBeUndefined();
  });

  it('main 失败 → 不产生主校区,candidates 全部按现有逻辑(invalid,无主校区参考)', () => {
    // 边界:连主校区都没拿到,只能把 candidates 当线索全标 invalid
    const rows = buildCampusRows({
      main: null,
      candidates: [{ name: '某校区', source: 'enrollment_plan_tag' }],
      candidateResults: new Map([['某校区', null]]),
    });
    expect(rows.find((r) => r.isMain)).toBeUndefined();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      name: '某校区', isMain: false, geoStatus: 'invalid',
    });
  });

  it('多个 candidate 同时是 main 别名 → 只保留一条主校区,全部跳过候选', () => {
    // 川大场景:main=江安,candidate 可能既有"江安"也有"望江"... 如果两个都被识为 alias,都跳过
    const rows = buildCampusRows({
      main,
      candidates: [
        { name: '江安', source: 'enrollment_plan_tag' },
        { name: '本部', source: 'enrollment_plan_tag' },
      ],
      candidateResults: new Map([
        ['江安', { result: { ...main }, isMainAlias: true }],
        ['本部', { result: { ...main }, isMainAlias: true }],
      ]),
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('本部');
    expect(rows[0].isMain).toBe(true);
  });

  it('混合:main + 一个别名 candidate + 一个真分校 candidate', () => {
    const weihai = {
      address: '威海', province: '山东省', city: '威海市', district: '环翠区',
      latitude: 37.512345, longitude: 122.123456,
      source: 'amap_poi' as const, formattedAddress: '威海',
    };
    const rows = buildCampusRows({
      main,
      candidates: [
        { name: '本部', source: 'enrollment_plan_tag' },
        { name: '威海', source: 'enrollment_plan_tag' },
      ],
      candidateResults: new Map([
        ['本部', { result: { ...main }, isMainAlias: true }],
        ['威海', { result: weihai, isMainAlias: false }],
      ]),
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ name: '本部', isMain: true });
    expect(rows[1]).toMatchObject({ name: '威海', isMain: false, geoStatus: 'verified' });
  });
});
