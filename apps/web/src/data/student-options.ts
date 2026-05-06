/**
 * 学生档案选项数据：民族、政治面貌、加分政策、行政区划
 *
 * - 民族 / 政治面貌：固定列表，写死
 * - 加分政策：常见枚举，覆盖 90%+ 场景；不覆盖的填"其他"
 * - 行政区划：来自 china-area-data（民政部 GB/T 2260），转换为 antd Cascader options
 */
import chinaAreaData from 'china-area-data';

const RAW = chinaAreaData as Record<string, Record<string, string>>;

export interface SingleOption { label: string; value: string; }
export interface CascaderOption { value: string; label: string; children?: CascaderOption[]; }

/** 56 个民族（按国家民委发布顺序） */
export const ETHNICITY_OPTIONS: SingleOption[] = [
  '汉族', '蒙古族', '回族', '藏族', '维吾尔族', '苗族', '彝族', '壮族',
  '布依族', '朝鲜族', '满族', '侗族', '瑶族', '白族', '土家族', '哈尼族',
  '哈萨克族', '傣族', '黎族', '傈僳族', '佤族', '畲族', '高山族', '拉祜族',
  '水族', '东乡族', '纳西族', '景颇族', '柯尔克孜族', '土族', '达斡尔族', '仫佬族',
  '羌族', '布朗族', '撒拉族', '毛南族', '仡佬族', '锡伯族', '阿昌族', '普米族',
  '塔吉克族', '怒族', '乌孜别克族', '俄罗斯族', '鄂温克族', '德昂族', '保安族', '裕固族',
  '京族', '塔塔尔族', '独龙族', '鄂伦春族', '赫哲族', '门巴族', '珞巴族', '基诺族',
].map((n) => ({ label: n, value: n }));

/** 政治面貌 13 项（含民主党派完整列表） */
export const POLITICAL_STATUS_OPTIONS: SingleOption[] = [
  '群众', '共青团员', '中共党员', '中共预备党员',
  '民革会员', '民盟盟员', '民建会员', '民进会员',
  '农工党党员', '致公党党员', '九三学社社员', '台盟盟员',
  '无党派人士',
].map((n) => ({ label: n, value: n }));

/** 加分政策常见 5 项 */
export const BONUS_POLICY_OPTIONS: SingleOption[] = [
  { label: '无', value: '无' },
  { label: '少数民族加分', value: '少数民族加分' },
  { label: '烈士子女', value: '烈士子女' },
  { label: '退伍军人', value: '退伍军人' },
  { label: '其他（请在加分细则中说明）', value: '其他' },
];

/**
 * 把 china-area-data 的扁平结构 build 成 antd Cascader 三级 options。
 * 用 lazy memo（顶层调用一次后被缓存）。
 *
 * value 用「中文名」而不是数字编码 — 后端 DTO 是 String 字段，存中文方便人读。
 */
let cached: CascaderOption[] | null = null;
export function getRegionCascaderOptions(): CascaderOption[] {
  if (cached) return cached;
  const provinces = RAW['86'] ?? {};
  cached = Object.entries(provinces).map(([provCode, provName]) => {
    const cities = RAW[provCode] ?? {};
    return {
      value: provName,
      label: provName,
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
