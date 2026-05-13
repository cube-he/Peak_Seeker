import chinaAreaData from 'china-area-data';

const RAW = chinaAreaData as Record<string, Record<string, string>>;

export interface SingleOption {
  label: string;
  value: string;
}

export interface CascaderOption {
  value: string;
  label: string;
  children?: CascaderOption[];
}

export const ETHNICITY_OPTIONS: SingleOption[] = [
  '汉族',
  '蒙古族',
  '回族',
  '藏族',
  '维吾尔族',
  '苗族',
  '彝族',
  '壮族',
  '布依族',
  '朝鲜族',
  '满族',
  '侗族',
  '瑶族',
  '白族',
  '土家族',
  '哈尼族',
  '哈萨克族',
  '傣族',
  '黎族',
  '傈僳族',
  '佤族',
  '畲族',
  '高山族',
  '拉祜族',
  '水族',
  '东乡族',
  '纳西族',
  '景颇族',
  '柯尔克孜族',
  '土族',
  '达斡尔族',
  '仫佬族',
  '羌族',
  '布朗族',
  '撒拉族',
  '毛南族',
  '仡佬族',
  '锡伯族',
  '阿昌族',
  '普米族',
  '塔吉克族',
  '怒族',
  '乌孜别克族',
  '俄罗斯族',
  '鄂温克族',
  '德昂族',
  '保安族',
  '裕固族',
  '京族',
  '塔塔尔族',
  '独龙族',
  '鄂伦春族',
  '赫哲族',
  '门巴族',
  '珞巴族',
  '基诺族',
].map((name) => ({ label: name, value: name }));

export const POLITICAL_STATUS_OPTIONS: SingleOption[] = [
  { label: '群众', value: 'MASSES' },
  { label: '共青团员', value: 'LEAGUE_MEMBER' },
  { label: '中共党员', value: 'PARTY_MEMBER' },
];

export const BONUS_POLICY_OPTIONS: SingleOption[] = [
  { label: '无加分', value: 'NONE' },
  { label: '有加分', value: 'HAS_BONUS' },
  { label: '暂不确定', value: 'UNKNOWN' },
];

let cached: CascaderOption[] | null = null;

function normalizeProvinceName(name: string): string {
  return name
    .replace('特别行政区', '')
    .replace('维吾尔自治区', '')
    .replace('壮族自治区', '')
    .replace('回族自治区', '')
    .replace('自治区', '')
    .replace(/[省市]$/, '');
}

export function getRegionCascaderOptions(): CascaderOption[] {
  if (cached) return cached;
  const provinces = RAW['86'] ?? {};
  cached = Object.entries(provinces).map(([provCode, provName]) => {
    const cities = RAW[provCode] ?? {};
    const normalizedProvinceName = normalizeProvinceName(provName);
    return {
      value: normalizedProvinceName,
      label: normalizedProvinceName,
      children: Object.entries(cities).map(([cityCode, cityName]) => {
        const counties = RAW[cityCode] ?? {};
        const childArr = Object.entries(counties).map(([, countyName]) => ({
          value: countyName,
          label: countyName,
        }));
        return {
          value: cityName,
          label: cityName,
          ...(childArr.length > 0 ? { children: childArr } : {}),
        };
      }),
    };
  });
  return cached;
}
