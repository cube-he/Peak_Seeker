// 省份常量
export const PROVINCES = [
  { code: '11', name: '北京', shortName: '京' },
  { code: '12', name: '天津', shortName: '津' },
  { code: '13', name: '河北', shortName: '冀' },
  { code: '14', name: '山西', shortName: '晋' },
  { code: '15', name: '内蒙古', shortName: '蒙' },
  { code: '21', name: '辽宁', shortName: '辽' },
  { code: '22', name: '吉林', shortName: '吉' },
  { code: '23', name: '黑龙江', shortName: '黑' },
  { code: '31', name: '上海', shortName: '沪' },
  { code: '32', name: '江苏', shortName: '苏' },
  { code: '33', name: '浙江', shortName: '浙' },
  { code: '34', name: '安徽', shortName: '皖' },
  { code: '35', name: '福建', shortName: '闽' },
  { code: '36', name: '江西', shortName: '赣' },
  { code: '37', name: '山东', shortName: '鲁' },
  { code: '41', name: '河南', shortName: '豫' },
  { code: '42', name: '湖北', shortName: '鄂' },
  { code: '43', name: '湖南', shortName: '湘' },
  { code: '44', name: '广东', shortName: '粤' },
  { code: '45', name: '广西', shortName: '桂' },
  { code: '46', name: '海南', shortName: '琼' },
  { code: '50', name: '重庆', shortName: '渝' },
  { code: '51', name: '四川', shortName: '川' },
  { code: '52', name: '贵州', shortName: '黔' },
  { code: '53', name: '云南', shortName: '滇' },
  { code: '54', name: '西藏', shortName: '藏' },
  { code: '61', name: '陕西', shortName: '陕' },
  { code: '62', name: '甘肃', shortName: '甘' },
  { code: '63', name: '青海', shortName: '青' },
  { code: '64', name: '宁夏', shortName: '宁' },
  { code: '65', name: '新疆', shortName: '新' },
] as const;

export const PROVINCE_MAP = new Map(PROVINCES.map(p => [p.name, p]));

export type ProvinceName = typeof PROVINCES[number]['name'];
