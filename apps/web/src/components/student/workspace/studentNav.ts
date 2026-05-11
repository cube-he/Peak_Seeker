export type StudentNavKey =
  | 'dashboard'
  | 'plans'
  | 'recommend'
  | 'universities'
  | 'profile';

export interface StudentNavItem {
  key: StudentNavKey;
  href: string;
  label: string;
  description: string;
  highlight?: boolean;
}

export const STUDENT_NAV_ITEMS: StudentNavItem[] = [
  {
    key: 'dashboard',
    href: '/student/dashboard',
    label: '首页',
    description: '进度与提醒',
  },
  {
    key: 'plans',
    href: '/student/plans',
    label: '方案',
    description: '老师生成的志愿方案',
  },
  {
    key: 'recommend',
    href: '/student/recommend',
    label: '推荐',
    description: 'AI 快速推荐',
    highlight: true,
  },
  {
    key: 'universities',
    href: '/universities',
    label: '院校',
    description: '院校库查询',
  },
  {
    key: 'profile',
    href: '/student/profile',
    label: '我的',
    description: '档案与偏好',
  },
];

export function isStudentNavActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}
