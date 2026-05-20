export type BoardLevel = '本科' | '专科';

export type BoardRegion =
  | { kind: 'province'; values: string[] }
  | { kind: 'city'; values: string[] }
  | { kind: 'elite' };

export interface BoardConfig {
  key: string;
  title: string;
  groupKey: string;
  groupTitle: string;
  level: BoardLevel;
  region: BoardRegion;
}

// 与四川接壤、择校意义上的「周边」省份
export const NEIGHBOR_PROVINCES = ['重庆', '陕西', '云南', '贵州', '甘肃'];

// 一线 + 发达二线城市（成都/重庆/西安已属川内或周边，不计入）
export const DEVELOPED_CITIES = ['北京', '上海', '广州', '深圳', '杭州', '南京', '苏州', '天津'];

// 榜单层次 -> AdmissionRecord.recruitType（取值见 university.service.ts findById）
export const RECRUIT_TYPE_BY_LEVEL: Record<BoardLevel, string> = {
  本科: '普通类本科',
  专科: '普通类高职(专科)',
};

export const BOARD_CONFIGS: BoardConfig[] = [
  { key: 'sichuan-undergrad', title: '川内本科榜', groupKey: 'sichuan', groupTitle: '川内', level: '本科', region: { kind: 'province', values: ['四川'] } },
  { key: 'sichuan-college', title: '川内专科榜', groupKey: 'sichuan', groupTitle: '川内', level: '专科', region: { kind: 'province', values: ['四川'] } },
  { key: 'neighbor-undergrad', title: '周边本科榜', groupKey: 'neighbor', groupTitle: '四川周边', level: '本科', region: { kind: 'province', values: NEIGHBOR_PROVINCES } },
  { key: 'neighbor-college', title: '周边专科榜', groupKey: 'neighbor', groupTitle: '四川周边', level: '专科', region: { kind: 'province', values: NEIGHBOR_PROVINCES } },
  { key: 'developed-undergrad', title: '发达城市本科榜', groupKey: 'developed', groupTitle: '发达城市', level: '本科', region: { kind: 'city', values: DEVELOPED_CITIES } },
  { key: 'developed-college', title: '发达城市专科榜', groupKey: 'developed', groupTitle: '发达城市', level: '专科', region: { kind: 'city', values: DEVELOPED_CITIES } },
  { key: 'national-elite', title: '全国名校榜', groupKey: 'elite', groupTitle: '全国名校榜', level: '本科', region: { kind: 'elite' } },
];
