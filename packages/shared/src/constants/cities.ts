// 城市常量，数据来源 china-division v2（基于民政部、国家统计局）
// 使用 pca-code.json：province(2位) -> city(4位) -> district(6位)
// 转换为 6位 GB/T 2260 标准码：province code + "0000", city code + "00"
import pcasCodeJson from 'china-division/dist/pca-code.json';

export interface CityOption {
  /** 城市名，如 "成都市" */
  name: string;
  /** 城市行政区划码（6位GB/T 2260），如 "510100" */
  code: string;
  /** 所属省名，如 "四川省" */
  provinceName: string;
  /** 所属省码（6位GB/T 2260），如 "510000" */
  provinceCode: string;
}

interface City {
  code: string;
  name: string;
  children?: Array<{ code: string; name: string }>;
}

interface Province {
  code: string;
  name: string;
  children?: City[];
}

export const CITIES: CityOption[] = [];

const municipalities = new Set(['11', '12', '31', '50']); // Beijing, Tianjin, Shanghai, Chongqing
const provinces = pcasCodeJson as Province[];

for (const province of provinces) {
  const provinceName = province.name;
  // Convert 2-digit province code to 6-digit: "51" -> "510000"
  const provinceCode = province.code.padEnd(6, '0');

  // For direct municipalities, add the province/municipality itself as a city
  if (municipalities.has(province.code)) {
    CITIES.push({
      name: provinceName,
      // Convert 2-digit province code to 6-digit: "11" -> "110100"
      code: province.code.padEnd(6, '0'),
      provinceName,
      provinceCode,
    });
  }

  // Add all second-level cities (skip "市辖区" which is not a real city)
  if (province.children) {
    for (const city of province.children) {
      // Skip 市辖区 entries - they're administrative groupings, not actual cities
      if (city.name === '市辖区') {
        continue;
      }

      CITIES.push({
        name: city.name,
        // Convert 4-digit city code to 6-digit: "5101" -> "510100"
        code: city.code.padEnd(6, '0'),
        provinceName,
        provinceCode,
      });
    }
  }
}
