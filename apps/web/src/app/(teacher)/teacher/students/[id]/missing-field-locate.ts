// 资料页关键字段核对项 key → 所在 Collapse 分区 key.
// 分区 key 与 page.tsx 的 Collapse items 一致: basic/household/exam/bonus/health/preference.
// 核对项来自 getFieldChecks(): subjects/totalScore/rank/cities/majors/bonusStatus/health/location.
export const CHECK_TO_SECTION: Record<string, string> = {
  subjects: 'exam',
  totalScore: 'exam',
  rank: 'exam',
  cities: 'preference',
  majors: 'preference',
  bonusStatus: 'bonus',
  health: 'health',
  location: 'household',
};

export interface FieldCheckLike {
  key: string;
  passed: boolean;
}

/** 第一个未通过且有分区映射的核对项所在分区 key; 否则 null. */
export function firstMissingSectionKey(checks: FieldCheckLike[]): string | null {
  for (const c of checks) {
    if (!c.passed) {
      const sec = CHECK_TO_SECTION[c.key];
      if (sec) return sec;
    }
  }
  return null;
}
