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

// 软科高职分类榜:综合/理工/师范/农林/医药/财经/政法/体育/文艺
// 跟本科类别榜复用 softCategory 字段,靠 softRankList='高职' vs '本科' 区分。
// 软科「中国高职专科院校排名（总榜）」是分档并列结构(rank=1 对应 9 个学校),
// 不可线性排序;但这 9 个分类子榜各自数据干净(uniquePure 接近 pure 数),
// 是 frontend 真正可信的高职榜来源。顺序锁定为 spec 里 mock.calls[15..23]。
export const HIGH_VOCATIONAL_CATEGORIES = [
  '综合类', '理工类', '师范类', '农林类', '医药类', '财经类', '政法类', '体育类', '文艺类',
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
  // 9 个软科高职分类榜,归到 group="vocational"「高职分类」
  // 取消原「全国高职榜」(softRankList='高职' 的 softRanking 全是分档并列,不可靠)
  ...HIGH_VOCATIONAL_CATEGORIES.map((category) => ({
    key: `vocational-${category}`,
    title: `${category}高职榜`,
    groupKey: 'vocational',
    groupTitle: '高职分类',
    level: '专科' as const,
    region: { kind: 'category' as const, value: category },
  })),
];
