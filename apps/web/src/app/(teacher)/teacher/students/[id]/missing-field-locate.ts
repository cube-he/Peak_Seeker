// 资料页关键字段核对项 key → 所在子页 key.
// 子页改成 2 个: required(必填资料) / optional(选填资料), 与 page.tsx 的 SUBTABS 对齐.
// 核对项来自 getFieldChecks(): subjects/totalScore/rank/cities/majors/bonusStatus/health/location.
// 与 2 子页的"实际字段归属"对齐: 必填子页含 考试成绩/户籍/色觉 → required;
// 选填子页含 意向地区/意向专业/加分政策/体检 → optional。
// 只有 required 项缺失才计入"缺关键资料"并催填; optional 缺失视为正常(按需采集), 不催。
// 注: health 检的是 色觉(colorBlind/colorWeak), 它在必填子页带红*, 故归 required(不是选填的体检身高视力)。
export const CHECK_TO_SECTION: Record<string, string> = {
  subjects: 'required',
  totalScore: 'required',
  rank: 'required',
  location: 'required',
  health: 'required',
  cities: 'optional',
  majors: 'optional',
  bonusStatus: 'optional',
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
