import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  AdmissionVolatilityInput,
  AdmissionVolatilityResult,
  VolatilityYearPair,
} from '../interfaces/recommend.types';

type AdmissionRankRow = {
  universityId: number;
  subjects: string | null;
  batch: string | null;
  recruitType: string | null;
  majorCode: string | null;
  majorName: string | null;
  majorMinRank: number | null;
};

type RankBucket = {
  label: string;
  min: number;
  max: number;
};

const MIN_SAMPLE_SIZE = 30;
const MAX_LOOKBACK_PAIRS = 3;

@Injectable()
export class AdmissionVolatilityService {
  private readonly cache = new Map<string, AdmissionVolatilityResult>();
  private readonly pending = new Map<string, Promise<AdmissionVolatilityResult>>();

  constructor(private readonly prisma: PrismaService) {}

  async calculate(
    input: AdmissionVolatilityInput,
  ): Promise<AdmissionVolatilityResult> {
    const sourceAdmissionYear =
      input.sourceAdmissionYear ?? new Date().getFullYear() - 1;
    const bucket = this.getRankBucket(input.candidateRank);
    const cacheKey = this.getCacheKey(input, sourceAdmissionYear, bucket);
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    const pending = this.pending.get(cacheKey);
    if (pending) return pending;

    const calculation = this.calculateUncached(input, sourceAdmissionYear, bucket)
      .then((result) => {
        this.cache.set(cacheKey, result);
        return result;
      })
      .finally(() => {
        this.pending.delete(cacheKey);
      });

    this.pending.set(cacheKey, calculation);
    return calculation;
  }

  private async calculateUncached(
    input: AdmissionVolatilityInput,
    sourceAdmissionYear: number,
    bucket: RankBucket,
  ): Promise<AdmissionVolatilityResult> {
    const deltas: number[] = [];
    const basisPairs: VolatilityYearPair[] = [];

    for (let offset = 0; offset < MAX_LOOKBACK_PAIRS; offset += 1) {
      const toYear = sourceAdmissionYear - offset;
      const fromYear = toYear - 1;
      if (fromYear < 2022) break;

      const pairDeltas = await this.collectPairDeltas(
        input,
        bucket,
        fromYear,
        toYear,
      );
      if (pairDeltas.length === 0) continue;

      deltas.push(...pairDeltas);
      basisPairs.push({ fromYear, toYear });

      if (deltas.length >= MIN_SAMPLE_SIZE) break;
    }

    const result =
      deltas.length >= MIN_SAMPLE_SIZE
        ? this.buildResult(sourceAdmissionYear, bucket, deltas, basisPairs)
        : this.buildInsufficientResult(
            sourceAdmissionYear,
            bucket,
            deltas.length,
            basisPairs,
          );

    return result;
  }

  private async collectPairDeltas(
    input: AdmissionVolatilityInput,
    bucket: RankBucket,
    fromYear: number,
    toYear: number,
  ): Promise<number[]> {
    const fromRows = await this.findRankRows(input, fromYear, bucket);
    const toRows = await this.findRankRows(input, toYear);
    const toRankByKey = new Map<string, number>();

    for (const row of toRows) {
      if (!this.isPositiveRank(row.majorMinRank)) continue;
      toRankByKey.set(this.getMajorKey(row), row.majorMinRank);
    }

    const deltas: number[] = [];
    for (const row of fromRows) {
      if (!this.isPositiveRank(row.majorMinRank)) continue;
      const nextRank = toRankByKey.get(this.getMajorKey(row));
      if (!nextRank) continue;
      deltas.push(nextRank - row.majorMinRank);
    }

    return deltas;
  }

  private async findRankRows(
    input: AdmissionVolatilityInput,
    year: number,
    bucket?: RankBucket,
  ): Promise<AdmissionRankRow[]> {
    const where: any = {
      province: input.province,
      year,
      majorMinRank: bucket
        ? { gte: bucket.min, lte: bucket.max }
        : { gt: 0 },
    };

    if (input.batch) where.batch = input.batch;

    const subjects = this.getSubjectCandidates(input.examType);
    if (subjects.length > 0) {
      where.subjects = { in: subjects };
    }

    return this.prisma.admissionRecord.findMany({
      where,
      select: {
        universityId: true,
        subjects: true,
        batch: true,
        recruitType: true,
        majorCode: true,
        majorName: true,
        majorMinRank: true,
      },
    });
  }

  private buildResult(
    sourceAdmissionYear: number,
    bucket: RankBucket,
    deltas: number[],
    basisPairs: VolatilityYearPair[],
  ): AdmissionVolatilityResult {
    const p75 = this.percentile(deltas, 75);
    const p90 = this.percentile(deltas, 90);
    const p25 = this.percentile(deltas, 25);
    const p10 = this.percentile(deltas, 10);

    return {
      sourceAdmissionYear,
      rankBucket: bucket.label,
      sampleScope: 'RANK_BUCKET',
      sampleSize: deltas.length,
      basisPairs,
      rushFormalLimit: Math.max(0, p75),
      rushObserveLimit: Math.max(0, p90),
      safeNormalMargin: Math.abs(Math.min(p25, 0)),
      safeStrongMargin: Math.abs(Math.min(p10, 0)),
      insufficientData: false,
    };
  }

  private buildInsufficientResult(
    sourceAdmissionYear: number,
    bucket: RankBucket,
    sampleSize: number,
    basisPairs: VolatilityYearPair[],
  ): AdmissionVolatilityResult {
    return {
      sourceAdmissionYear,
      rankBucket: bucket.label,
      sampleScope: 'INSUFFICIENT_DATA',
      sampleSize,
      basisPairs,
      rushFormalLimit: 0,
      rushObserveLimit: 0,
      safeNormalMargin: 0,
      safeStrongMargin: 0,
      insufficientData: true,
    };
  }

  private getRankBucket(rank: number): RankBucket {
    if (rank <= 1000) return { label: '0-1k', min: 1, max: 1000 };
    if (rank <= 3000) return { label: '1k-3k', min: 1001, max: 3000 };
    if (rank <= 10000) return { label: '3k-10k', min: 3001, max: 10000 };
    if (rank <= 30000) return { label: '10k-30k', min: 10001, max: 30000 };
    if (rank <= 50000) return { label: '30k-50k', min: 30001, max: 50000 };
    if (rank <= 100000) return { label: '50k-100k', min: 50001, max: 100000 };
    if (rank <= 200000) return { label: '100k-200k', min: 100001, max: 200000 };
    return { label: '200k+', min: 200001, max: Number.MAX_SAFE_INTEGER };
  }

  private getSubjectCandidates(examType?: string | null): string[] {
    if (!examType) return [];
    if (examType === 'PHYSICS') return ['PHYSICS', '\u7269\u7406'];
    if (examType === 'HISTORY') return ['HISTORY', '\u5386\u53f2'];
    if (examType === 'COMPREHENSIVE_SCIENCE') {
      return ['COMPREHENSIVE_SCIENCE', '\u7406\u79d1'];
    }
    if (examType === 'COMPREHENSIVE_LIBERAL') {
      return ['COMPREHENSIVE_LIBERAL', '\u6587\u79d1'];
    }
    return [examType];
  }

  private getMajorKey(row: AdmissionRankRow): string {
    return [
      row.universityId,
      row.subjects ?? '',
      row.batch ?? '',
      row.recruitType ?? '',
      row.majorCode ?? '',
      row.majorName ?? '',
    ].join('|');
  }

  private getCacheKey(
    input: AdmissionVolatilityInput,
    sourceAdmissionYear: number,
    bucket: RankBucket,
  ): string {
    return [
      input.province,
      input.examType ?? '',
      input.batch ?? '',
      bucket.label,
      sourceAdmissionYear,
    ].join('|');
  }

  private percentile(values: number[], p: number): number {
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.min(
      sorted.length - 1,
      Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
    );
    return sorted[index];
  }

  private isPositiveRank(value: number | null): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value > 0;
  }
}
