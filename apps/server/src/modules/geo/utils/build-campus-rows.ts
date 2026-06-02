/**
 * 把"主校区 geo + candidate 列表 + candidate 地理编码结果"组装成最终的 campus 行集合。
 *
 * 从 geo-backfill.ts processOne 抽出来,目的是让 backfill 这段核心逻辑可单测,
 * 并且修 2026-06-01 试跑发现的两个 bug:
 *   1. 旧版 candidates 非空时不创建主校区记录,主校区坐标在库里"消失"
 *      (西南交大 invalid 事件)
 *   2. 旧版 candidate 距 main < 300m 时被标 invalid + 清坐标——但其实
 *      这种情况说明 candidate 就是主校区的别名,应当跳过而非误伤
 *
 * 新规则:
 *   - main 成功 → 始终产生一条 isMain=true 主校区,name='本部'。
 *   - candidate.result == null → 高德没找到,生成一条 isMain=false invalid 副校区(保留候选名)。
 *   - candidate.result != null && isMainAlias=true → 跳过(就是主校区,不创建副本)。
 *   - candidate.result != null && isMainAlias=false → 生成一条 isMain=false verified 副校区。
 *   - main 失败 → 不创建主校区记录,candidates 全部按"无 main 参考"处理(invalid)。
 *
 * 放在 geo/utils 下而非 scripts/lib,因为 server jest rootDir 是 src/,
 * spec 要能被发现就得在 src 树下。逻辑上这函数也确实属于 geo 模块工具层。
 */
import type { CampusCandidate } from '../dto/campus-candidate.dto';
import type { GeoResult } from '../dto/geo-result.dto';

export interface CampusRow {
  name: string;
  isMain: boolean;
  province?: string;
  city?: string;
  district?: string | null;
  address?: string;
  latitude?: number;
  longitude?: number;
  geoStatus: 'verified' | 'invalid' | 'pending';
  geoSource?: string;
  discoveredFrom: string;
}

export type CandidateGeoResult = { result: GeoResult; isMainAlias: boolean };

export interface BuildCampusRowsInput {
  main: GeoResult | null;
  candidates: CampusCandidate[];
  /** candidate.name → geocodeCampus 结果。null 表示该 candidate 高德查不到。 */
  candidateResults: Map<string, CandidateGeoResult | null>;
}

export function buildCampusRows(input: BuildCampusRowsInput): CampusRow[] {
  const { main, candidates, candidateResults } = input;
  const rows: CampusRow[] = [];

  if (main) {
    rows.push({
      name: '本部', isMain: true,
      province: main.province,
      city: main.city,
      district: main.district,
      address: main.address,
      latitude: main.latitude,
      longitude: main.longitude,
      geoStatus: 'verified',
      geoSource: main.source,
      discoveredFrom: 'amap_search',
    });
  }

  for (const c of candidates) {
    const r = candidateResults.get(c.name) ?? null;
    if (r == null) {
      // 高德查不到——保留候选名作为线索,标 invalid
      rows.push({
        name: c.name, isMain: false,
        geoStatus: 'invalid',
        discoveredFrom: c.source,
      });
      continue;
    }
    if (r.isMainAlias) {
      // 该候选其实就是主校区,跳过不再创建副本
      continue;
    }
    // 真分校
    rows.push({
      name: c.name, isMain: false,
      province: r.result.province,
      city: r.result.city,
      district: r.result.district,
      address: r.result.address,
      latitude: r.result.latitude,
      longitude: r.result.longitude,
      geoStatus: 'verified',
      geoSource: r.result.source,
      discoveredFrom: c.source,
    });
  }

  return rows;
}
