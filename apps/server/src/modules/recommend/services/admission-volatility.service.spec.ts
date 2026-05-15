import { AdmissionVolatilityService } from './admission-volatility.service';
import { PrismaService } from '../../../prisma/prisma.service';

type RankRow = {
  universityId: number;
  subjects: string;
  batch: string;
  recruitType: string;
  majorCode: string;
  majorName: string;
  majorMinRank: number;
};

function makeRows(yearRankStart: number, deltas: number[] = []): {
  fromRows: RankRow[];
  toRows: RankRow[];
} {
  const fromRows = deltas.map((delta, index) => {
    const base = yearRankStart + index * 1000;
    return {
      universityId: index + 1,
      subjects: 'PHYSICS',
      batch: '本科批',
      recruitType: 'NORMAL',
      majorCode: `M${index + 1}`,
      majorName: `Major ${index + 1}`,
      majorMinRank: base,
    };
  });
  const toRows = fromRows.map((row, index) => ({
    ...row,
    majorMinRank: row.majorMinRank + deltas[index],
  }));
  return { fromRows, toRows };
}

function percentile(values: number[], p: number) {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[index];
}

describe('AdmissionVolatilityService', () => {
  let prisma: any;
  let service: AdmissionVolatilityService;

  beforeEach(() => {
    prisma = {
      admissionRecord: {
        findMany: jest.fn(),
      },
    };
    service = new AdmissionVolatilityService(prisma as PrismaService);
  });

  it('calculates directional rush and safety boundaries from the latest rank-bucket sample', async () => {
    const deltas = [
      -26000, -18000, -12000, -8000, -5000, -3000, -1000, 0, 1000, 2000,
      3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000, 11000, 12000,
      13000, 14000, 15000, 16000, 17000, 18000, 19000, 20000, 24000,
      30000,
    ];
    const { fromRows, toRows } = makeRows(105000, deltas);

    prisma.admissionRecord.findMany.mockImplementation(({ where }: any) => {
      if (where.year === 2024) return Promise.resolve(fromRows);
      if (where.year === 2025) return Promise.resolve(toRows);
      return Promise.resolve([]);
    });

    const result = await service.calculate({
      province: 'Sichuan',
      examType: 'PHYSICS',
      batch: '本科批',
      candidateRank: 120000,
      sourceAdmissionYear: 2025,
    });

    expect(result.sampleScope).toBe('RANK_BUCKET');
    expect(result.sampleSize).toBe(deltas.length);
    expect(result.basisPairs).toEqual([{ fromYear: 2024, toYear: 2025 }]);
    expect(result.rushFormalLimit).toBe(percentile(deltas, 75));
    expect(result.rushObserveLimit).toBe(percentile(deltas, 90));
    expect(result.safeNormalMargin).toBe(Math.abs(Math.min(percentile(deltas, 25), 0)));
    expect(result.safeStrongMargin).toBe(Math.abs(Math.min(percentile(deltas, 10), 0)));
  });

  it('falls back from a sparse latest-year sample to older same-bucket samples', async () => {
    const latest = makeRows(110000, [1000, 2000, 3000, 4000, 5000]);
    const olderDeltas = Array.from({ length: 30 }, (_, index) => index * 1000);
    const older = makeRows(112000, olderDeltas);

    prisma.admissionRecord.findMany.mockImplementation(({ where }: any) => {
      if (where.year === 2024 && where.majorMinRank?.gte) return Promise.resolve(latest.fromRows);
      if (where.year === 2025 && where.majorMinRank?.gt === 0) return Promise.resolve(latest.toRows);
      if (where.year === 2023 && where.majorMinRank?.gte) return Promise.resolve(older.fromRows);
      if (where.year === 2024 && where.majorMinRank?.gt === 0) return Promise.resolve(older.toRows);
      return Promise.resolve([]);
    });

    const result = await service.calculate({
      province: 'Sichuan',
      examType: 'PHYSICS',
      batch: '本科批',
      candidateRank: 130000,
      sourceAdmissionYear: 2025,
    });

    expect(result.basisPairs).toEqual([
      { fromYear: 2024, toYear: 2025 },
      { fromYear: 2023, toYear: 2024 },
    ]);
    expect(result.sampleSize).toBe(35);
  });

  it('deduplicates concurrent identical rank-bucket calculations', async () => {
    const deltas = Array.from({ length: 30 }, (_, index) => index * 100);
    const { fromRows, toRows } = makeRows(105000, deltas);

    prisma.admissionRecord.findMany.mockImplementation(async ({ where }: any) => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      if (where.year === 2024) return fromRows;
      if (where.year === 2025) return toRows;
      return [];
    });

    await Promise.all(
      Array.from({ length: 5 }, () =>
        service.calculate({
          province: 'Sichuan',
          examType: 'PHYSICS',
          batch: 'Batch A',
          candidateRank: 120000,
          sourceAdmissionYear: 2025,
        }),
      ),
    );

    expect(prisma.admissionRecord.findMany).toHaveBeenCalledTimes(2);
  });
});
