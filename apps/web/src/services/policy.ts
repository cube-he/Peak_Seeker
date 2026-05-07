import api from './api';

/** 加分项类型（与后端 bonus-calc.types.ts 对齐） */
export type BonusItemType =
  | 'VETERAN_SELF_EMPLOYED'
  | 'VETERAN_MERIT_LEVEL_2_PLUS'
  | 'OVERSEAS_RETURNED'
  | 'OVERSEAS_CHILD'
  | 'TAIWAN_REGISTRY'
  | 'MARTYR_CHILD'
  | 'ETHNIC_AREA_MINORITY'
  | 'ETHNIC_AREA_HAN'
  | 'PRIORITY_RETIRED_OFFICER'
  | 'PRIORITY_DISABLED_POLICE'
  | 'PRIORITY_5A_VOLUNTEER'
  | 'PRIORITY_POLICE_HERO_CHILD'
  | 'PRIORITY_RIGHTEOUS_CHILD'
  | 'PRIORITY_MILITARY_CHILD'
  | 'PRIORITY_FIREFIGHTER_CHILD'
  | 'PRIORITY_JUDICIAL_POLICE_CHILD';

export interface BonusItemEvaluation {
  type: BonusItemType;
  value: number;
  matched: boolean;
  reason: string;
  isPriority: boolean;
}

export interface BonusCalcResult {
  bonusValue: number;
  appliedItem: BonusItemEvaluation | null;
  matchedItems: BonusItemEvaluation[];
  rejectedItems: BonusItemEvaluation[];
  priorityFlags: BonusItemEvaluation[];
  caveats: string[];
}

export const policyApi = {
  /** 学生：算自己的加分政策 */
  getMyBonus(): Promise<BonusCalcResult> {
    return api.get('/policy/bonus/me') as any;
  },

  /** 老师/管理员：算指定学生的加分 */
  getStudentBonus(studentProfileId: number): Promise<BonusCalcResult> {
    return api.get(`/policy/bonus/${studentProfileId}`) as any;
  },
};
