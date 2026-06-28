// 院校宿舍生活情况打印表 — 纯组装(去重保序 + hasData 判定), 无 Prisma, 可单测。

export const DORM_FIELD_KEYS = [
  'multiCampus', 'loftBed', 'roomCapacity', 'dormAirConditioner', 'privateBathroom',
  'hotWaterSchedule', 'washingMachine', 'dormPowerLimit', 'classroomAirConditioner',
  'allNightStudyRoom', 'nightPowerCut', 'nightNetworkCut', 'dormInspection', 'curfewTime',
  'morningEveningStudy', 'morningRun', 'runningCheckIn', 'campusNetworkSpeed',
  'campusNetworkPrice', 'freshmanComputer', 'hasSubway', 'distanceToCity',
  'transportConvenience', 'foodDelivery', 'canteenPrice', 'supermarketPrice',
  'expressDelivery', 'sharedBikes',
] as const;

export type DormFieldKey = (typeof DORM_FIELD_KEYS)[number];

export interface DormUniversity {
  id: number;
  name: string;
  province: string | null;
  city: string | null;
  runningLevel: string | null;
  runningNature: string | null;
  dorm: Record<DormFieldKey, string | null>;
  hasData: boolean;
}

export interface DormSheet {
  plan: { id: number; batchName: string | null; year: number | null };
  student: { name: string | null };
  universities: DormUniversity[];
}

interface BuildInput {
  plan: {
    id: number;
    batchName: string | null;
    year: number | null;
    student?: { user?: { realName?: string | null } | null } | null;
    planItems: Array<{ sequence: number; universityId: number }>;
  };
  universities: Array<Record<string, unknown> & { id: number; name: string }>;
}

export function buildDormSheet({ plan, universities }: BuildInput): DormSheet {
  const uById = new Map(universities.map((u) => [u.id, u]));

  // planItems 已按 sequence 排序(调用方保证); 去重保第一次出现顺序。
  const seen = new Set<number>();
  const orderedIds: number[] = [];
  for (const item of plan.planItems) {
    if (seen.has(item.universityId)) continue;
    seen.add(item.universityId);
    orderedIds.push(item.universityId);
  }

  const out: DormUniversity[] = [];
  for (const id of orderedIds) {
    const u = uById.get(id);
    if (!u) continue; // 院校被删等极端情况, 跳过
    const dorm = {} as Record<DormFieldKey, string | null>;
    let hasData = false;
    for (const k of DORM_FIELD_KEYS) {
      const v = u[k];
      const val = typeof v === 'string' && v.trim() !== '' ? v : null;
      dorm[k] = val;
      if (val !== null) hasData = true;
    }
    out.push({
      id: u.id,
      name: String(u.name),
      province: (u.province as string) ?? null,
      city: (u.city as string) ?? null,
      runningLevel: (u.runningLevel as string) ?? null,
      runningNature: (u.runningNature as string) ?? null,
      dorm,
      hasData,
    });
  }

  return {
    plan: { id: plan.id, batchName: plan.batchName, year: plan.year },
    student: { name: plan.student?.user?.realName ?? null },
    universities: out,
  };
}
