export type BoardLevel = '本科' | '专科';

export type BoardRegion =
  | { kind: 'province'; values: string[] }
  | { kind: 'city'; values: string[] }
  | { kind: 'elite' }
  // 软科类别榜（财经/医药/...）：按 softCategory 过滤、softCategoryRank 排序
  | { kind: 'category'; value: string }
  // 软科主榜分支（民办/高职）：按 softRankList 过滤、softRanking 排序
  | { kind: 'list'; value: string };

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

// 软科本科类别榜：财经/医药/中医药/语言/政法/民族/体育
// 顺序锁定为：spec 里通过 mock.calls[7..13] 索引来取这 7 个榜的 findMany 调用
export const SOFT_CATEGORIES = [
  '财经类', '医药类', '中医药类', '语言类', '政法类', '民族类', '体育类',
] as const;

export const BOARD_CONFIGS: BoardConfig[] = [
  { key: 'sichuan-undergrad', title: '川内本科榜', groupKey: 'sichuan', groupTitle: '川内', level: '本科', region: { kind: 'province', values: ['四川'] } },
  { key: 'sichuan-college', title: '川内专科榜', groupKey: 'sichuan', groupTitle: '川内', level: '专科', region: { kind: 'province', values: ['四川'] } },
  { key: 'neighbor-undergrad', title: '周边本科榜', groupKey: 'neighbor', groupTitle: '四川周边', level: '本科', region: { kind: 'province', values: NEIGHBOR_PROVINCES } },
  { key: 'neighbor-college', title: '周边专科榜', groupKey: 'neighbor', groupTitle: '四川周边', level: '专科', region: { kind: 'province', values: NEIGHBOR_PROVINCES } },
  { key: 'developed-undergrad', title: '发达城市本科榜', groupKey: 'developed', groupTitle: '发达城市', level: '本科', region: { kind: 'city', values: DEVELOPED_CITIES } },
  { key: 'developed-college', title: '发达城市专科榜', groupKey: 'developed', groupTitle: '发达城市', level: '专科', region: { kind: 'city', values: DEVELOPED_CITIES } },
  { key: 'national-elite', title: '全国名校榜', groupKey: 'elite', groupTitle: '全国名校榜', level: '本科', region: { kind: 'elite' } },
  // 7 个软科类别榜，统一归到 group="category"「行业特色院校」
  // 与行业绑定（财经/医药/政法/民族/体育等）的院校，区别于"综合/理工"主榜
  ...SOFT_CATEGORIES.map((category) => ({
    key: `category-${category}`,
    title: `${category}榜`,
    groupKey: 'category',
    groupTitle: '行业特色院校',
    level: '本科' as const,
    region: { kind: 'category' as const, value: category },
  })),
  // 民办本科榜（独立 group）
  { key: 'private-undergrad', title: '民办本科榜', groupKey: 'private', groupTitle: '民办本科', level: '本科', region: { kind: 'list', value: '民办' } },
  // 全国高职榜（独立 group）
  { key: 'national-college', title: '全国高职榜', groupKey: 'national-college', groupTitle: '全国高职', level: '专科', region: { kind: 'list', value: '高职' } },
];
