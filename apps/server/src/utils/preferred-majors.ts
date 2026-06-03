// 学生意向专业字段的双 shape 兼容 helper:
//   旧 shape: string[]                       (历史扁平数组, migration 之前)
//   新 shape: PreferredMajorTier[]           (梯队结构 + tier=0 意向池)
// migration 之后线上数据全是新 shape, 但保留兜底分支以防迁移失败 / 测试 mock 用旧形状。
//
// 池子语义 (2026-06-03 加入):
//   tier=0 表示"意向池" — 老师/学生暂存还没排梯队的专业.
//   池子里专业**不**参与方案推荐 (业务决策, 由前端 UI 加上"拖动到梯队"操作转化).
//   helper 默认行为: flatten / listTiers / hasAny 都跳过 tier=0.
//   需要看完整数据 (如 UI 显示) 时, 显式传 { includePool: true }.

export interface PreferredMajorTier {
  tier: number;
  majors: string[];
}

interface PoolOptions {
  /** 默认 false: filter tier<=0 (池子不参与). true: 把池子也算进去 (UI 展示用). */
  includePool?: boolean;
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

function tierFilter(includePool: boolean) {
  return (t: PreferredMajorTier) => includePool || (typeof t?.tier === 'number' && t.tier > 0);
}

export function flattenPreferredMajors(value: unknown, options?: PoolOptions): string[] {
  const includePool = options?.includePool ?? false;
  if (!Array.isArray(value)) return [];
  if (isTierShape(value)) {
    return value
      .filter(tierFilter(includePool))
      .flatMap((t) =>
        Array.isArray(t?.majors) ? t.majors.filter((m): m is string => typeof m === 'string') : [],
      );
  }
  // 旧 shape 兜底: string[] — 没有 tier 概念, 池子 option 不适用, 直接全返回
  return value.filter((x): x is string => typeof x === 'string');
}

export function getTierMajors(value: unknown, tier: number): string[] {
  if (!isTierShape(value) || tier <= 0) return [];
  const t = value.find((x) => x?.tier === tier);
  return t && Array.isArray(t.majors)
    ? t.majors.filter((m): m is string => typeof m === 'string')
    : [];
}

export function listTiers(value: unknown, options?: PoolOptions): PreferredMajorTier[] {
  const includePool = options?.includePool ?? false;
  if (!isTierShape(value)) return [];
  return value
    .filter(
      (x): x is PreferredMajorTier =>
        typeof x?.tier === 'number' && Array.isArray(x?.majors),
    )
    .filter(tierFilter(includePool))
    .map((x) => ({
      tier: x.tier,
      majors: x.majors.filter((m): m is string => typeof m === 'string'),
    }));
}

/** 拿池子内容 (tier=0 的 majors). 用于 UI 显示, 不影响推荐. */
export function getPoolMajors(value: unknown): string[] {
  if (!isTierShape(value)) return [];
  const pool = value.find((x) => typeof x?.tier === 'number' && x.tier === 0);
  return pool && Array.isArray(pool.majors)
    ? pool.majors.filter((m): m is string => typeof m === 'string')
    : [];
}
