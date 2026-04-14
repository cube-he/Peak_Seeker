import { Injectable, Logger } from '@nestjs/common';
import {
  ScoredCandidate,
  Bin,
  GradientType,
  GRADIENT_DISTRIBUTION,
  TOTAL_GROUPS,
} from '../interfaces/recommend.types';

/**
 * Sub-module 8: Bin Sampler (CRITICAL)
 *
 * Systematic sampling algorithm:
 * 1. Divide rank range [rank - rangeUp, rank + rangeDown] into bins
 * 2. Bin size determined by totalGroups / gradient distribution
 * 3. 6 gradients: HIGH_RUSH(13), RUSH(11), STABLE_RUSH(10), STABLE(10), SAFE_STABLE(6), SAFE(5) = 55 total
 * 4. Per bin: select anchor major (highest scoring candidate in bin)
 * 5. Map anchor major → university group (院校专业组)
 */
@Injectable()
export class BinSamplerService {
  private readonly logger = new Logger(BinSamplerService.name);

  /**
   * Create bins from a rank range and assign candidates to them.
   *
   * @param candidates  sorted scored candidates (by majorMinRank ascending)
   * @param rankCenter  student's provincial rank
   * @param rangeUp     how far above (lower rank number) to search
   * @param rangeDown   how far below (higher rank number) to search
   * @param totalGroups override for total group count (default 55)
   */
  createBins(
    candidates: ScoredCandidate[],
    rankCenter: number,
    rangeUp: number,
    rangeDown: number,
    totalGroups: number = TOTAL_GROUPS,
  ): Bin[] {
    const rankStart = Math.max(1, rankCenter - rangeUp);
    const rankEnd = rankCenter + rangeDown;
    const totalRange = rankEnd - rankStart;

    if (totalRange <= 0 || candidates.length === 0) {
      this.logger.warn('Empty range or no candidates for binning');
      return [];
    }

    // Calculate bin boundaries based on gradient distribution
    const gradients = Object.entries(GRADIENT_DISTRIBUTION) as [
      GradientType,
      number,
    ][];

    const bins: Bin[] = [];
    let binIndex = 0;
    let currentRankStart = rankStart;

    for (const [gradient, groupCount] of gradients) {
      // Each gradient gets a proportional slice of the total range
      const gradientRangeSize = Math.round(
        (totalRange * groupCount) / totalGroups,
      );

      // Divide this gradient's range into individual bins
      const binSize = Math.max(1, Math.round(gradientRangeSize / groupCount));

      for (let g = 0; g < groupCount; g++) {
        const binRankStart = currentRankStart + g * binSize;
        const binRankEnd = Math.min(
          binRankStart + binSize - 1,
          rankEnd,
        );

        if (binRankStart > rankEnd) break;

        bins.push({
          index: binIndex,
          gradient,
          rankStart: binRankStart,
          rankEnd: binRankEnd,
          candidates: [],
        });
        binIndex++;
      }

      currentRankStart += gradientRangeSize;
    }

    // Assign candidates to bins
    for (const candidate of candidates) {
      const rank = candidate.majorMinRank;
      if (rank === null) continue;

      // Find the bin this candidate belongs to
      const bin = bins.find((b) => rank >= b.rankStart && rank <= b.rankEnd);
      if (bin) {
        bin.candidates.push(candidate);
      }
    }

    // Select anchor for each bin (highest composite score)
    for (const bin of bins) {
      if (bin.candidates.length > 0) {
        bin.anchor = bin.candidates.reduce((best, c) =>
          c.compositeScore > best.compositeScore ? c : best,
        );
      }
    }

    this.logger.debug(
      `Created ${bins.length} bins from rank ${rankStart} to ${rankEnd}. ` +
        `${bins.filter((b) => b.anchor).length} bins have anchors.`,
    );

    return bins;
  }

  /**
   * Map a GradientType to the PlanItem gradient enum value.
   */
  static toDbGradient(gradient: GradientType): 'CHONG' | 'WEN' | 'BAO' {
    switch (gradient) {
      case GradientType.HIGH_RUSH:
      case GradientType.RUSH:
        return 'CHONG';
      case GradientType.STABLE_RUSH:
      case GradientType.STABLE:
        return 'WEN';
      case GradientType.SAFE_STABLE:
      case GradientType.SAFE:
        return 'BAO';
    }
  }

  /**
   * Get a human-readable label for the gradient.
   */
  static gradientLabel(gradient: GradientType): string {
    const labels: Record<GradientType, string> = {
      [GradientType.HIGH_RUSH]: '高冲',
      [GradientType.RUSH]: '冲',
      [GradientType.STABLE_RUSH]: '稳冲',
      [GradientType.STABLE]: '稳',
      [GradientType.SAFE_STABLE]: '稳保',
      [GradientType.SAFE]: '保',
    };
    return labels[gradient];
  }
}
