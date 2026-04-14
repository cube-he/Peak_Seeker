import { Injectable, Logger } from '@nestjs/common';
import { Bin, ScoredCandidate } from '../interfaces/recommend.types';

/**
 * Sub-module 9: Dedup Limiter
 *
 * Three-step deduplication:
 * 1. Group dedup: keep only the best candidate per university group
 * 2. University frequency limit: max 2 groups per university
 * 3. Local frequency limit: max 3 consecutive bins from same university
 */
@Injectable()
export class DedupLimiterService {
  private readonly logger = new Logger(DedupLimiterService.name);

  /** Max university groups allowed per university across all bins */
  private static readonly MAX_GROUPS_PER_UNIVERSITY = 2;

  /** Max consecutive bins that can feature the same university */
  private static readonly MAX_CONSECUTIVE_BINS = 3;

  dedup(bins: Bin[]): Bin[] {
    let result = this.groupDedup(bins);
    result = this.universityFrequencyLimit(result);
    result = this.localFrequencyLimit(result);
    return result;
  }

  /**
   * Step 1: Group dedup
   * Within each bin, keep only the best-scoring candidate per university group.
   * Group key = universityId + groupCode (or universityId alone if no group code).
   */
  private groupDedup(bins: Bin[]): Bin[] {
    return bins.map((bin) => {
      const groupMap = new Map<string, ScoredCandidate>();

      for (const c of bin.candidates) {
        const groupKey = `${c.universityId}:${c.enrollmentGroupCode || 'default'}`;
        const existing = groupMap.get(groupKey);

        if (!existing || c.compositeScore > existing.compositeScore) {
          groupMap.set(groupKey, c);
        }
      }

      const deduped = [...groupMap.values()];
      return {
        ...bin,
        candidates: deduped,
        // Re-select anchor from deduped candidates
        anchor:
          deduped.length > 0
            ? deduped.reduce((best, c) =>
                c.compositeScore > best.compositeScore ? c : best,
              )
            : undefined,
      };
    });
  }

  /**
   * Step 2: University frequency limit
   * Across all bins, keep at most MAX_GROUPS_PER_UNIVERSITY groups per university.
   * Prioritize higher-scoring appearances.
   */
  private universityFrequencyLimit(bins: Bin[]): Bin[] {
    // Collect all anchors with their bin index and score
    const anchorEntries: {
      binIndex: number;
      universityId: number;
      score: number;
    }[] = [];

    for (const bin of bins) {
      if (bin.anchor) {
        anchorEntries.push({
          binIndex: bin.index,
          universityId: bin.anchor.universityId,
          score: bin.anchor.compositeScore,
        });
      }
    }

    // Sort by score descending to keep the best appearances
    anchorEntries.sort((a, b) => b.score - a.score);

    // Count per university
    const universityCount = new Map<number, number>();
    const allowedBins = new Set<number>();

    for (const entry of anchorEntries) {
      const count = universityCount.get(entry.universityId) || 0;
      if (count < DedupLimiterService.MAX_GROUPS_PER_UNIVERSITY) {
        universityCount.set(entry.universityId, count + 1);
        allowedBins.add(entry.binIndex);
      }
    }

    // Remove anchors from bins that exceeded the limit
    return bins.map((bin) => {
      if (bin.anchor && !allowedBins.has(bin.index)) {
        // Remove this anchor's university candidates from the bin
        const removedUniId = bin.anchor.universityId;
        const filteredCandidates = bin.candidates.filter(
          (c) => c.universityId !== removedUniId,
        );
        const newAnchor =
          filteredCandidates.length > 0
            ? filteredCandidates.reduce((best, c) =>
                c.compositeScore > best.compositeScore ? c : best,
              )
            : undefined;

        return {
          ...bin,
          candidates: filteredCandidates,
          anchor: newAnchor,
        };
      }
      return bin;
    });
  }

  /**
   * Step 3: Local frequency limit
   * No more than MAX_CONSECUTIVE_BINS consecutive bins should feature
   * the same university.
   */
  private localFrequencyLimit(bins: Bin[]): Bin[] {
    const result = [...bins];

    for (let i = DedupLimiterService.MAX_CONSECUTIVE_BINS; i < result.length; i++) {
      if (!result[i].anchor) continue;

      const currentUni = result[i].anchor!.universityId;
      let consecutiveCount = 0;

      // Look back at previous bins
      for (
        let j = i - 1;
        j >= Math.max(0, i - DedupLimiterService.MAX_CONSECUTIVE_BINS);
        j--
      ) {
        if (result[j].anchor?.universityId === currentUni) {
          consecutiveCount++;
        } else {
          break;
        }
      }

      if (consecutiveCount >= DedupLimiterService.MAX_CONSECUTIVE_BINS) {
        // Remove this university from the current bin
        const filtered = result[i].candidates.filter(
          (c) => c.universityId !== currentUni,
        );
        const newAnchor =
          filtered.length > 0
            ? filtered.reduce((best, c) =>
                c.compositeScore > best.compositeScore ? c : best,
              )
            : undefined;

        result[i] = {
          ...result[i],
          candidates: filtered,
          anchor: newAnchor,
        };
      }
    }

    return result;
  }
}
