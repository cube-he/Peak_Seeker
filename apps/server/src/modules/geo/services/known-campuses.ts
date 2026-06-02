/**
 * 手工维护的"已知校区"映射表 — 补招生数据完全没线索的真分校。
 *
 * 触发场景:像川大华西、哈工大威海、山大威海/青岛 这些数据源(招生备注、
 * 招生章程)里完全没出现的校区。采集程序原理上扒不到,只能手工录入。
 *
 * 用法:CampusExtractor.extract() 把这里的 candidates 合并到自动提取的清单里。
 * source = 'manual',跟自动 extractor 提取的 enrollment_plan_tag/charter_extract
 * 区分开。geocodeCampus 仍然走高德 POI 验证坐标(防误录)。
 *
 * 维护原则:
 *   - 只列**确实存在的**校区(知名度足够、能在百度/知乎找到证据)
 *   - 不需要列 '本部' / '主校区'(backfill 会自动建主校区)
 *   - 名字 = 短地名 / 简称(如"华西"而非"华西校区"),高德 POI 查询时会拼成"学校名+校区名"
 */
export interface KnownCampus {
  universityId: number;
  universityName: string;     // 仅供阅读,backfill 不使用
  candidates: string[];       // 校区简称列表(不含"本部")
  notes?: string;
}

export const KNOWN_CAMPUSES: KnownCampus[] = [
  // ─── 北京 ───
  { universityId: 8961, universityName: '北京师范大学', candidates: ['珠海'] },
  { universityId: 9042, universityName: '北京航空航天大学', candidates: ['学院路'] },        // 主校区在学院路,本部默认会有,沙河已扒到
  { universityId: 9043, universityName: '北京理工大学', candidates: ['良乡'] },              // 珠海已扒到
  // ─── 上海 ───
  { universityId: 8974, universityName: '复旦大学', candidates: ['江湾', '枫林', '张江'] },
  { universityId: 8975, universityName: '同济大学', candidates: ['嘉定'] },
  { universityId: 8976, universityName: '上海交通大学', candidates: ['闵行', '徐汇'] },
  // ─── 武汉 ───
  { universityId: 8995, universityName: '武汉大学', candidates: ['信息学部', '文理学部', '医学部'] },
  { universityId: 9019, universityName: '华中科技大学', candidates: ['同济医学院'] },
  // ─── 成都/重庆 ───
  { universityId: 9002, universityName: '四川大学', candidates: ['望江', '华西'] },         // 江安已扒到
  { universityId: 9004, universityName: '西南交通大学', candidates: ['九里'] },              // 犀浦已扒到
  // ─── 山东/黑龙江 ───
  { universityId: 8992, universityName: '山东大学', candidates: ['威海', '青岛', '洪家楼', '兴隆山'] },
  { universityId: 9055, universityName: '哈尔滨工业大学', candidates: ['威海', '深圳'] },
  // ─── 广东/华南 ───
  { universityId: 9000, universityName: '中山大学', candidates: ['深圳'] },                  // 珠海已扒到
];

/** 按 universityId 查 KNOWN_CAMPUSES。未命中返回空数组。 */
export function lookupKnownCampuses(universityId: number): string[] {
  const entry = KNOWN_CAMPUSES.find((e) => e.universityId === universityId);
  return entry ? entry.candidates : [];
}
