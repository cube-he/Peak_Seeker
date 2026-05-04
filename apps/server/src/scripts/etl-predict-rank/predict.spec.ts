import { subjectWeight, planWeight } from './predict';

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
  it('returns ratio of historical/target plans', () => {
    // more plans → looser → higher rank → multiply by P_y/P_t
    expect(planWeight(50, 100)).toBeCloseTo(0.5);
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
