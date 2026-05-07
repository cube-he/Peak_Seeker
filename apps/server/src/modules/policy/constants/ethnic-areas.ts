/**
 * 四川省民族地区加分"实施区域"——三州十七县两区。
 * 来源：《关于做好我省2026年普通高校招生工作的通知》第十一节(5)
 *
 * 用途：
 *   - 加分政策"三统一"判定（高中阶段连续 3 年完整户籍 + 学籍 + 实际就读）
 *   - 省属高校少数民族预科招生资格判定
 *
 * Vault: 10-Projects/VolunteerHelper/domain/sichuan-2026-policy.md §6
 */

/** 三个民族自治州 */
export const ETHNIC_AREA_PREFECTURES: ReadonlyArray<string> = [
  '甘孜藏族自治州',
  '阿坝藏族羌族自治州',
  '凉山彝族自治州',
];

/** 简写形式（与 student profile 中实际录入的 province/city 字段值兼容） */
export const ETHNIC_AREA_PREFECTURES_SHORT: ReadonlyArray<string> = [
  '甘孜州',
  '阿坝州',
  '凉山州',
  '甘孜',
  '阿坝',
  '凉山',
];

/** 十七个享受民族地区加分的县 */
export const ETHNIC_AREA_COUNTIES: ReadonlyArray<string> = [
  '峨边彝族自治县',
  '马边彝族自治县',
  '米易县',
  '盐边县',
  '石棉县',
  '北川羌族自治县',
  '平武县',
  '汉源县',
  '宝兴县',
  '兴文县',
  '宣汉县',
  '叙永县',
  '古蔺县',
  '筠连县',
  '珙县',
  '屏山县',
  '荥经县',
];

/** 县简写（与录入容差兼容） */
export const ETHNIC_AREA_COUNTIES_SHORT: ReadonlyArray<string> = [
  '峨边县', '峨边',
  '马边县', '马边',
  '米易',
  '盐边',
  '石棉',
  '北川县', '北川',
  '平武',
  '汉源',
  '宝兴',
  '兴文',
  '宣汉',
  '叙永',
  '古蔺',
  '筠连',
  '珙县', '珙',
  '屏山',
  '荥经',
];

/** 两个享受民族地区加分的市辖区（攀枝花仁和区、乐山金口河区） */
export const ETHNIC_AREA_DISTRICTS: ReadonlyArray<string> = [
  '仁和区',
  '金口河区',
];

/**
 * 判定学生 (province, city, county) 是否落在"三州十七县两区"范围内。
 * 容错：支持全称/简写/带不带"自治"等变体。
 *
 * 注：本函数不验证"三统一"——年限/学籍/实际就读字段当前 student profile 还没采集。
 * 第二版加资格字段后再加严格判定；当前版本只做地理范围 best-effort 匹配。
 */
export function isInEthnicArea(
  province: string | null | undefined,
  city: string | null | undefined,
  county: string | null | undefined,
): boolean {
  // 必须四川
  if (!province || !province.includes('四川')) return false;

  const fullCity = (city || '').trim();
  const fullCounty = (county || '').trim();

  // 三州（city 字段承载州名）
  // 注：必须 fullCity 非空才走 includes 比较——否则 "X".includes("") === true 会误判
  if (fullCity) {
    if (
      ETHNIC_AREA_PREFECTURES.some((p) => fullCity.includes(p) || p.includes(fullCity)) ||
      ETHNIC_AREA_PREFECTURES_SHORT.includes(fullCity)
    ) {
      return true;
    }
  }

  // 十七县（county 字段承载）
  if (fullCounty) {
    if (
      ETHNIC_AREA_COUNTIES.some((c) => fullCounty.includes(c) || c.includes(fullCounty)) ||
      ETHNIC_AREA_COUNTIES_SHORT.includes(fullCounty)
    ) {
      return true;
    }

    // 两区（county 字段承载，攀枝花/乐山下辖）
    if (ETHNIC_AREA_DISTRICTS.includes(fullCounty)) {
      return true;
    }
  }

  return false;
}
