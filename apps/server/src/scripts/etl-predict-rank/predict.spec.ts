import { subjectWeight, planWeight, predictMinRank, type PredictInput } from './predict';

describe('subjectWeight', () => {
  it('returns ratio of target/historical pools', () => {
    expect(subjectWeight(100000, 80000)).toBeCloseTo(1.25);
  });
  it('returns 1 when historical is null', () => {
    expect(subjectWeight(100000, null)).toBe(1);
  });
  it('returns 1 when target is null', () => {
    expect(subjectWeight(null, 80000)).toBe(1);
  });
  it('returns 1 when target is zero (degenerate)', () => {
    expect(subjectWeight(0, 80000)).toBe(1);
  });
});

describe('planWeight', () => {
  it('more plans this year than historical → multiplier > 1 → rank moves higher', () => {
    expect(planWeight(50, 100)).toBeCloseTo(2); // P_h=50, P_t=100 → multiply historical_rank by 2
  });
  it('returns 1 when historical is null', () => {
    expect(planWeight(50, null)).toBe(1);
  });
  it('returns 1 when target is null', () => {
    expect(planWeight(null, 50)).toBe(1);
  });
  it('returns 1 when target is zero (degenerate)', () => {
    expect(planWeight(50, 0)).toBe(1);
  });
});

describe('predictMinRank', () => {
  // Helper: build a minimal valid input
  function makeInput(overrides: Partial<PredictInput> = {}): PredictInput {
    return {
      history: [
        { year: 2024, minRank: 5000 },
        { year: 2023, minRank: 5500 },
        { year: 2022, minRank: 6000 },
      ],
      planTarget: 100,
      planHistorical: { 2024: 100, 2023: 100, 2022: 100 },
      poolTarget: 200000,
      poolHistorical: { 2024: 200000, 2023: 200000, 2022: 200000 },
      poolTargetIsProxy: false,
      ...overrides,
    };
  }

  it('returns null when history < 2 years', () => {
    expect(predictMinRank(makeInput({ history: [{ year: 2024, minRank: 5000 }] }))).toBeNull();
  });

  it('returns null when both target pool and proxy missing', () => {
    expect(predictMinRank(makeInput({ poolTarget: null }))).toBeNull();
  });

  it('flat case (all weights = 1) → weighted avg', () => {
    const out = predictMinRank(makeInput());
    // weights 0.5/0.3/0.2 → 5000*.5 + 5500*.3 + 6000*.2 = 5350
    expect(out!.point).toBe(5350);
    expect(out!.optimistic).toBe(5000);
    expect(out!.conservative).toBe(6000);
    expect(out!.basisYears).toEqual([2024, 2023, 2022]);
    expect(out!.confidence).toBe('high');
  });

  it('subject pool grew → predicted rank grows proportionally', () => {
    // pool 2024 = 200000, target = 220000 → equiv 2024 = 5000 * 1.1 = 5500
    const out = predictMinRank(makeInput({ poolTarget: 220000 }));
    expect(out!.point).toBeGreaterThan(5350);
  });

  it('plan count doubled → predicted rank shifts higher (looser threshold)', () => {
    const out = predictMinRank(makeInput({ planTarget: 200 }));
    // More plans this year ⇒ lower-ranked candidates also accepted ⇒
    // minimum admitted rank moves to a LARGER number.
    // Therefore equiv = historical_rank × planWeight where planWeight = P_target/P_historical.
    expect(out!.point).toBeGreaterThan(5350);
  });

  it('only 2 years of history → confidence medium', () => {
    const out = predictMinRank(makeInput({
      history: [{ year: 2024, minRank: 5000 }, { year: 2023, minRank: 5500 }],
    }));
    expect(out!.confidence).toBe('medium');
  });

  it('proxy pool used → confidence medium', () => {
    const out = predictMinRank(makeInput({ poolTargetIsProxy: true }));
    expect(out!.confidence).toBe('medium');
  });

  it('plan target null → confidence low', () => {
    const out = predictMinRank(makeInput({ planTarget: null }));
    expect(out!.confidence).toBe('low');
  });
});
