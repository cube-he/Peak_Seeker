import { RankStrategyService } from './rank-strategy.service';
import { AdmissionVolatilityService } from './admission-volatility.service';

const volatilityResult = {
  sourceAdmissionYear: 2025,
  rankBucket: '100k-200k',
  sampleScope: 'RANK_BUCKET',
  sampleSize: 120,
  basisPairs: [{ fromYear: 2024, toYear: 2025 }],
  rushFormalLimit: 16194,
  rushObserveLimit: 28616,
  safeNormalMargin: 7754,
  safeStrongMargin: 17642,
  insufficientData: false,
};

describe('RankStrategyService', () => {
  let volatility: any;
  let service: RankStrategyService;

  beforeEach(() => {
    volatility = {
      calculate: jest.fn().mockResolvedValue(volatilityResult),
    };
    service = new RankStrategyService(volatility as AdmissionVolatilityService);
  });

  it('rejects candidates beyond the historical P90 easier boundary', async () => {
    const result = await service.evaluateCandidate({
      studentRank: 156077,
      candidateRank: 88,
      studentExamYear: 2026,
      province: 'Sichuan',
      examType: 'PHYSICS',
      batch: '本科批',
    });

    expect(result.eligibility).toBe('REJECTED');
    expect(result.requiredEasierDelta).toBe(155989);
    expect(result.rushObserveLimit).toBe(28616);
    expect(result.reason).toContain('P90');
  });

  it('allows formal recommendations within the historical P75 easier boundary', async () => {
    const result = await service.evaluateCandidate({
      studentRank: 156077,
      candidateRank: 140000,
      studentExamYear: 2026,
      province: 'Sichuan',
      examType: 'PHYSICS',
      batch: '本科批',
    });

    expect(result.eligibility).toBe('FORMAL');
    expect(result.requiredEasierDelta).toBe(16077);
  });

  it('marks P75 to P90 rush candidates as observe-only', async () => {
    const result = await service.evaluateCandidate({
      studentRank: 156077,
      candidateRank: 130000,
      studentExamYear: 2026,
      province: 'Sichuan',
      examType: 'PHYSICS',
      batch: '本科批',
    });

    expect(result.eligibility).toBe('OBSERVE_ONLY');
    expect(result.requiredEasierDelta).toBe(26077);
  });

  it('keeps safety margins for candidates at or below the student rank', async () => {
    const result = await service.evaluateCandidate({
      studentRank: 156077,
      candidateRank: 170000,
      studentExamYear: 2026,
      province: 'Sichuan',
      examType: 'PHYSICS',
      batch: '本科批',
    });

    expect(result.eligibility).toBe('FORMAL');
    expect(result.requiredEasierDelta).toBeNull();
    expect(result.safetyMargin).toBe(13923);
    expect(result.safeNormalMargin).toBe(7754);
    expect(result.safeStrongMargin).toBe(17642);
  });

  it('returns insufficient data when the candidate rank is missing', async () => {
    const result = await service.evaluateCandidate({
      studentRank: 156077,
      candidateRank: null,
      studentExamYear: 2026,
      province: 'Sichuan',
      examType: 'PHYSICS',
      batch: '本科批',
    });

    expect(result.eligibility).toBe('INSUFFICIENT_DATA');
    expect(volatility.calculate).not.toHaveBeenCalled();
  });

  it('marks 2026 rank checks as 2025 estimated before 2026 data is available', async () => {
    const result = await service.evaluateCandidate({
      studentRank: 156077,
      candidateRank: 140000,
      studentExamYear: 2026,
      province: 'Sichuan',
      examType: 'PHYSICS',
      batch: '本科批',
    });

    expect(result.sourceAdmissionYear).toBe(2025);
    expect(result.rankSourceYear).toBe('2025_ESTIMATED');
  });
});
