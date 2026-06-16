// region-match.ts
// 地域匹配: 学生意向省/市 vs 院校所在省/市。
// 院校是「院校级」整组属性, 不当软规则(不进风险区), 而是给组打 regionMismatch 标记,
// 由前端"显示非意向地区"开关折叠。
//
// 关键: 归一化去掉末尾"省/市"后缀 —— 学生意向城市存的是"成都市", 院校库存的是"成都",
// 精确比对永远对不上(既有 REGION_FIRST 排序也有此 bug)。

export function normalizeRegion(s: unknown): string {
  return String(s ?? '').trim().replace(/[省市]$/, '');
}

function toRegionSet(provinces: unknown, cities: unknown): Set<string> {
  const set = new Set<string>();
  for (const arr of [provinces, cities]) {
    if (!Array.isArray(arr)) continue;
    for (const r of arr) {
      const n = normalizeRegion(r);
      if (n) set.add(n);
    }
  }
  return set;
}

/** 学生是否设置了意向地区(省或市任一非空)。 */
export function hasRegionPreference(provinces: unknown, cities: unknown): boolean {
  return toRegionSet(provinces, cities).size > 0;
}

/** 组级"非意向地区"标记: 学生填了意向地区 且 院校省、市都不命中。
 *  学生没填意向地区 → false(无偏好, 一律保留)。 */
export function isRegionMismatch(
  uniProvince: unknown,
  uniCity: unknown,
  provinces: unknown,
  cities: unknown,
): boolean {
  const set = toRegionSet(provinces, cities);
  if (set.size === 0) return false;
  return !(set.has(normalizeRegion(uniProvince)) || set.has(normalizeRegion(uniCity)));
}
