/**
 * 院校列表排序选项定义。
 * - hot 组（6 个）：常驻在主排序栏；其他组在 "更多排序" popover 内
 * - lockedAsc：排名类（"#1 最佳"），不允许降序
 * - defaultDir：第一次点击的方向
 * - requiresExamType / requiresUserRank：未满足时按钮 disabled
 */

export type SortDirection = 'asc' | 'desc';

export type SortGroup = 'hot' | 'ranking' | 'discipline' | 'employment' | 'satisfaction' | 'other';

export interface SortOption {
  key: string;          // 传给后端的 sortBy
  label: string;
  group: SortGroup;
  lockedAsc?: boolean;
  defaultDir: SortDirection;
  requiresExamType?: boolean;
  requiresUserRank?: boolean;
}

export const SORT_OPTIONS: SortOption[] = [
  // 热门组（6 个）
  { key: 'softRank',  label: '默认',   group: 'hot', defaultDir: 'asc', lockedAsc: true },
  { key: 'minRank',   label: '位次',   group: 'hot', defaultDir: 'asc', lockedAsc: true, requiresExamType: true },
  { key: 'softRank',  label: '软科',   group: 'hot', defaultDir: 'asc', lockedAsc: true },
  { key: 'tier',      label: '冲稳保', group: 'hot', defaultDir: 'asc', lockedAsc: true, requiresUserRank: true },
  { key: 'province',  label: '省份',   group: 'hot', defaultDir: 'asc' },
  { key: 'type',      label: '类型',   group: 'hot', defaultDir: 'asc' },

  // 院校排名（4 个，排名类锁升序）
  { key: 'rankingAlumni',  label: '校友会',  group: 'ranking', defaultDir: 'asc', lockedAsc: true },
  { key: 'rankingQS',      label: 'QS',      group: 'ranking', defaultDir: 'asc', lockedAsc: true },
  { key: 'rankingUSNews',  label: 'USNews',  group: 'ranking', defaultDir: 'asc', lockedAsc: true },
  { key: 'rankingTimes',   label: '泰晤士',  group: 'ranking', defaultDir: 'asc', lockedAsc: true },

  // 学科实力（2 个）
  { key: 'aClassDisciplineCount',    label: 'A 类学科数',  group: 'discipline', defaultDir: 'desc' },
  { key: 'firstClassDisciplineCount', label: '双一流学科数', group: 'discipline', defaultDir: 'desc' },

  // 就业表现（3 个）
  { key: 'employmentRate',   label: '就业率',  group: 'employment', defaultDir: 'desc' },
  { key: 'avgSalary',        label: '平均薪资', group: 'employment', defaultDir: 'desc' },
  { key: 'furtherStudyRate', label: '考研率',  group: 'employment', defaultDir: 'desc' },

  // 学生评价（3 个）
  { key: 'satisfactionOverall', label: '综合满意度', group: 'satisfaction', defaultDir: 'desc' },
  { key: 'satisfactionLife',    label: '生活满意度', group: 'satisfaction', defaultDir: 'desc' },
  { key: 'satisfactionEnviron', label: '环境满意度', group: 'satisfaction', defaultDir: 'desc' },

  // 其他（3 个）
  { key: 'campusArea',  label: '校园面积', group: 'other', defaultDir: 'desc' },
  { key: 'createdYear', label: '建校年份', group: 'other', defaultDir: 'asc' },
  { key: 'heatScore',   label: '热度',    group: 'other', defaultDir: 'desc' },
];

export const GROUP_LABELS: Record<SortGroup, string> = {
  hot: '',
  ranking: '院校排名',
  discipline: '学科实力',
  employment: '就业表现',
  satisfaction: '学生评价',
  other: '其他',
};
