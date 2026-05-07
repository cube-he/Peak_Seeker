// 城市常量，数据来源 china-division v2（基于民政部、国家统计局）
import pcasCode from 'china-division/dist/pcas-code.json';

export interface CityOption {
  /** 城市名，如 "成都市" */
  name: string;
  /** 城市行政区划码，如 "510100" */
  code: string;
  /** 所属省名，如 "四川省" */
  provinceName: string;
  /** 所属省码，如 "510000" */
  provinceCode: string;
}

interface City {
  code: string;
  name: string;
  children?: unknown[];
}

interface Province {
  code: string;
  name: string;
  children?: City[];
}

export const CITIES: CityOption[] = [];

const provinces = pcasCode as Province[];

for (const province of provinces) {
  const provinceName = province.name;
  const provinceCode = province.code;

  // For direct municipalities (北京市, 上海市, 天津市, 重庆市),
  // the province name itself is the city
  if (
    provinceName === '北京市' ||
    provinceName === '上海市' ||
    provinceName === '天津市' ||
    provinceName === '重庆市'
  ) {
    CITIES.push({
      name: provinceName,
      code: provinceCode + '00',
      provinceName,
      provinceCode,
    });
  }

  // Also add all second-level cities
  if (province.children) {
    for (const city of province.children) {
      CITIES.push({
        name: city.name,
        code: city.code,
        provinceName,
        provinceCode,
      });
    }
  }
}
