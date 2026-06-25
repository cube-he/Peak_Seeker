// 资料页关键字段核对项 key → 所在子页 key.
// 子页改成 2 个: required(必填资料) / optional(选填资料), 与 page.tsx 的 SUBTABS 对齐.
// 核对项来自 getFieldChecks(): subjects/totalScore/rank/cities/majors/bonusStatus/health/location.
// 硬性字段(考试成绩/户籍)归 required; 按需采集字段(加分/健康/偏好)归 optional.
export const CHECK_TO_SECTION: Record<string, string> = {
  subjects: 'required',
  totalScore: 'required',
  rank: 'required',
  location: 'required',
  cities: 'optional',
  majors: 'optional',
  bonusStatus: 'optional',
  health: 'optional',
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
