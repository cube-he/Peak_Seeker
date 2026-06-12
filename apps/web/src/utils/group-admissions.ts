export type GroupedAdmission = {
  year: number;
  subjects: string;
  batch: string;
  groupCode: string;
  groupName: string | null;
  recruitType: string;
  groupMinScore: number | null;
  groupMinRank: number | null;
  groupAdmissionCount: number | null;
  majors: Array<{
    majorId: number | null;
    majorCode: string;
    majorName: string;
    majorMinScore: number | null;
    majorMinRank: number | null;
    planCount: number | null;
    extras: { majorRanking: string | null; disciplineEval: string | null; isNationalFeature: boolean };
  }>;
};

type RawAdmission = {
  year: number;
  subjects: string;
  batch: string;
  groupCode: string;
  groupName: string | null;
  recruitType?: string;
  majorId?: number | null;
  groupMinScore: number | null;
  groupMinRank: number | null;
  groupAdmissionCount: number | null;
  majorCode: string;
  majorName: string;
  majorMinScore: number | null;
  majorMinRank: number | null;
  planCount: number | null;
  extras?: { majorRanking: string | null; disciplineEval: string | null; isNationalFeature: boolean };
};

/**
 * 按 (year, subjects, batch, recruitType, groupCode) 把 AdmissionRecord 列表聚合成专业组结构。
 * - recruitType 进键: 专项/预科与普通类同组号不会被并进一张卡 (与自然主键口径一致)
 * - 跨年同 groupCode 不合并（每年独立）
 * - 组内 majors 按 majorMinRank 升序（null 排末尾）
 * - 输出整体按 year 降序
 */
export function groupAdmissions(records: RawAdmission[]): GroupedAdmission[] {
  const map = new Map<string, GroupedAdmission>();

  for (const r of records) {
    const recruitType = r.recruitType ?? '';
    const key = `${r.year}|${r.subjects}|${r.batch}|${recruitType}|${r.groupCode}`;
    let group = map.get(key);
    if (!group) {
      group = {
        year: r.year,
        subjects: r.subjects,
        batch: r.batch,
        groupCode: r.groupCode,
        groupName: r.groupName,
        recruitType,
        groupMinScore: r.groupMinScore,
        groupMinRank: r.groupMinRank,
        groupAdmissionCount: r.groupAdmissionCount,
        majors: [],
      };
      map.set(key, group);
    }
    group.majors.push({
      majorId: r.majorId ?? null,
      majorCode: r.majorCode,
      majorName: r.majorName,
      majorMinScore: r.majorMinScore,
      majorMinRank: r.majorMinRank,
      planCount: r.planCount,
      extras: r.extras ?? { majorRanking: null, disciplineEval: null, isNationalFeature: false },
    });
  }

  for (const g of map.values()) {
    g.majors.sort((a, b) => {
      if (a.majorMinRank == null && b.majorMinRank == null) return 0;
      if (a.majorMinRank == null) return 1;
      if (b.majorMinRank == null) return -1;
      return a.majorMinRank - b.majorMinRank;
    });
  }

  return Array.from(map.values()).sort((a, b) => b.year - a.year);
}
