// 学生意向专业字段的双 shape 兼容 helper:
//   旧 shape: string[]                       (历史扁平数组, migration 之前)
//   新 shape: PreferredMajorTier[]           (梯队结构)
// migration 之后线上数据全是新 shape, 但保留兜底分支以防迁移失败 / 测试 mock 用旧形状。

export interface PreferredMajorTier {
  tier: number;
  majors: string[];
}

export function isTierShape(value: unknown): value is PreferredMajorTier[] {
  if (!Array.isArray(value) || value.length === 0) return false;
  const first = value[0];
  return (
    typeof first === 'object' &&
    first !== null &&
    'tier' in first &&
    'majors' in first
  );
}

export function flattenPreferredMajors(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  if (isTierShape(value)) {
    return value.flatMap((t) =>
      Array.isArray(t?.majors) ? t.majors.filter((m): m is string => typeof m === 'string') : [],
    );
  }
  // 旧 shape 兜底
  return value.filter((x): x is string => typeof x === 'string');
}

export function getTierMajors(value: unknown, tier: number): string[] {
  if (!isTierShape(value) || tier <= 0) return [];
  const t = value.find((x) => x?.tier === tier);
  return t && Array.isArray(t.majors)
    ? t.majors.filter((m): m is string => typeof m === 'string')
    : [];
}

export function listTiers(value: unknown): PreferredMajorTier[] {
  if (!isTierShape(value)) return [];
  return value
    .filter(
      (x): x is PreferredMajorTier =>
        typeof x?.tier === 'number' && Array.isArray(x?.majors),
    )
    .map((x) => ({
      tier: x.tier,
      majors: x.majors.filter((m): m is string => typeof m === 'string'),
    }));
}
