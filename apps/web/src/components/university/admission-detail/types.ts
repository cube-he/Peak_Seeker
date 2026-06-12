import type { GroupedAdmission } from '@/utils/group-admissions';
import type { BatchCategory } from '@/utils/batch-categorize';
import type { RankTier } from '@/utils/classify-rank';

export type Subject = '物理类' | '历史类';

export interface UniversityRankInput {
  /** 当前选中科类下，最新年份的院校最低位次（已按 batchCategory 过滤） */
  latestUniversityMinRank: number | null;
  latestUniversityMinScore: number | null;
  latestYear: number | null;
  trendYears: Array<{
    year: number;
    universityMinScore: number | null;
    universityMinRank: number | null;
  }>;
}

export interface GroupCardProps {
  group: GroupedAdmission;
  /** 同 (subjects, batch, groupCode) 跨年的所有记录（含 group 本身），用于卡头多年并排 */
  multiYearGroups: GroupedAdmission[];
  tier: RankTier;
  diffText: string | null;
  userRank: number | null;
}

export interface MajorRowProps {
  major: GroupedAdmission['majors'][number];
  multiYearData: Array<{ year: number; majorMinScore: number | null; majorMinRank: number | null }>;
}

export interface UniversityRankBannerProps {
  subject: Subject;
  batchCategory: BatchCategory;
  rankInput: UniversityRankInput;
  tier: RankTier;
  userRank: number | null;
  diffText: string | null;
}

export interface BatchSubjectSwitcherProps {
  subject: Subject;
  onSubjectChange: (s: Subject) => void;
  /** 该科类无数据时禁用对应按钮 (默认可用) */
  physicsAvailable?: boolean;
  historyAvailable?: boolean;
}
