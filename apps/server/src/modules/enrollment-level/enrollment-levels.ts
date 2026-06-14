import { Prisma, PrismaClient } from '@prisma/client';

export type MajorLevel = '本科' | '专科' | '兼有';
export type OptionLevels = { phy: MajorLevel | null; his: MajorLevel | null };

/** 由本科批次计数 bk、专科批次计数 zk 归约出层次。 */
export function classifyLevel(bk: number, zk: number): MajorLevel | null {
  if (bk > 0 && zk > 0) return '兼有';
  if (bk > 0) return '本科';
  if (zk > 0) return '专科';
  return null;
}

type RedisLike = {
  getCache<T>(key: string): Promise<T | null>;
  setCache(key: string, value: unknown, ttlSeconds: number): Promise<void>;
};

const PROVINCE = '四川';
const TTL = 86400;

// MySQL SUM(...) 是 DECIMAL, Prisma $queryRaw 返回 string/Decimal 而非 number,
// 故 bk/zk 标 unknown, 强制下游用 Number() 兜底 (见 foldRows)。
type RawRow = { key: string; bk: unknown; zk: unknown; lane: string };

// 按 lane(物理/历史) 把 (key, bk, zk) 行折叠成 { phy, his }。
// 注: 上游 SQL 的 CASE 对 subjects 同时含物理+历史的(异常)行按 历史 计 —
// 正常一行只有一个首选科目, 这种重叠属脏数据, 归历史是保守取舍。
function foldRows(rows: RawRow[]): Record<string, OptionLevels> {
  const out: Record<string, OptionLevels> = {};
  for (const r of rows) {
    const lane = r.lane === '物理' ? 'phy' : r.lane === '历史' ? 'his' : null;
    if (!lane) continue;
    const level = classifyLevel(Number(r.bk), Number(r.zk));
    if (!out[r.key]) out[r.key] = { phy: null, his: null };
    out[r.key][lane] = level;
  }
  return out;
}

async function latestScYear(prisma: PrismaClient): Promise<number | null> {
  const agg = await prisma.enrollmentPlan.aggregate({
    _max: { year: true },
    where: { province: PROVINCE },
  });
  return agg._max.year ?? null;
}

/** 专业名 → 在川各科类层次。MySQL 原始聚合，缓存于 Redis。 */
export async function getMajorLevelMap(
  prisma: PrismaClient,
  redis: RedisLike,
): Promise<Record<string, OptionLevels>> {
  const cacheKey = 'enroll-level:major:四川';
  const cached = await redis.getCache<Record<string, OptionLevels>>(cacheKey);
  if (cached) return cached;
  const year = await latestScYear(prisma);
  if (year == null) return {};
  const rows = await prisma.$queryRaw<RawRow[]>(Prisma.sql`
    SELECT ep.major_name AS \`key\`,
           CASE WHEN ep.subjects LIKE '%历史%' THEN '历史' ELSE '物理' END AS lane,
           SUM(ep.batch LIKE '本科%') AS bk,
           SUM(ep.batch LIKE '高职%' OR ep.batch LIKE '%专科%') AS zk
    FROM enrollment_plans ep
    WHERE ep.province = ${PROVINCE} AND ep.year = ${year}
      AND (ep.subjects LIKE '%物理%' OR ep.subjects LIKE '%历史%')
    GROUP BY ep.major_name, lane
  `);
  const map = foldRows(rows);
  await redis.setCache(cacheKey, map, TTL);
  return map;
}

/** 院校 id → 在川各科类层次。 */
export async function getUniversityLevelMap(
  prisma: PrismaClient,
  redis: RedisLike,
): Promise<Record<number, OptionLevels>> {
  const cacheKey = 'enroll-level:university:四川';
  const cached = await redis.getCache<Record<number, OptionLevels>>(cacheKey);
  if (cached) return cached;
  const year = await latestScYear(prisma);
  if (year == null) return {};
  const rows = await prisma.$queryRaw<RawRow[]>(Prisma.sql`
    SELECT CAST(ep.university_id AS CHAR) AS \`key\`,
           CASE WHEN ep.subjects LIKE '%历史%' THEN '历史' ELSE '物理' END AS lane,
           SUM(ep.batch LIKE '本科%') AS bk,
           SUM(ep.batch LIKE '高职%' OR ep.batch LIKE '%专科%') AS zk
    FROM enrollment_plans ep
    WHERE ep.province = ${PROVINCE} AND ep.year = ${year}
      AND (ep.subjects LIKE '%物理%' OR ep.subjects LIKE '%历史%')
    GROUP BY ep.university_id, lane
  `);
  const folded = foldRows(rows);
  const out: Record<number, OptionLevels> = {};
  for (const [k, v] of Object.entries(folded)) out[Number(k)] = v;
  await redis.setCache(cacheKey, out, TTL);
  return out;
}
