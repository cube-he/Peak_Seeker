import type { AggregatedAdmissionListItem } from '@volunteer-helper/shared';
import { classifyRank, getTier, isHistorical } from './classify-rank';

export interface BucketedAdmissions {
  rush: AggregatedAdmissionListItem[];
  stable: AggregatedAdmissionListItem[];
  safe: AggregatedAdmissionListItem[];
  /** Count of items whose prediction was insufficient (classifyRank === 'unknown'). */
  unknownCount: number;
}

/**
 * Split lightweight admission items into rush/stable/safe buckets.
 * elite (over-safe bottom picks) and unknown (insufficient prediction data)
 * are deliberately excluded from the tabs; unknown is counted for the position card.
 */
export function bucketAdmissions(
  items: AggregatedAdmissionListItem[],
  userRank: number,
): BucketedAdmissions {
  const result: BucketedAdmissions = {
    rush: [],
    stable: [],
    safe: [],
    unknownCount: 0,
  };

  for (const item of items) {
    const tier = getTier({
      is985: item.university.is985,
      is211: item.university.is211,
      batch: item.batch,
    });
    const historical = isHistorical(item.subjects);
    // classifyRank's predictedRank param accepts number | null.
    const predictedRank = item.predictedMinRank ? item.predictedMinRank.point : null;
    const verdict = classifyRank(userRank, predictedRank, tier, historical);

    if (verdict === 'rush') {
      result.rush.push(item);
    } else if (verdict === 'stable') {
      result.stable.push(item);
    } else if (verdict === 'safe') {
      result.safe.push(item);
    } else if (verdict === 'unknown') {
      result.unknownCount += 1;
    }
    // 'elite' is intentionally dropped.
  }

  return result;
}
