import { PlanStateMachineService } from './plan-state-machine.service';

describe('PlanStateMachineService', () => {
  let sm: PlanStateMachineService;

  beforeEach(() => {
    sm = new PlanStateMachineService();
  });
  it('DRAFT -> submit-review -> PENDING_REVIEW（满足组数）', () => {
    expect(sm.transition('DRAFT', 'SUBMIT_REVIEW', { itemCount: 45, maxGroupCount: 45 }))
      .toBe('PENDING_REVIEW');
  });

  it('DRAFT -> submit-review 组数不够 抛错', () => {
    expect(() => sm.transition('DRAFT', 'SUBMIT_REVIEW', { itemCount: 30, maxGroupCount: 45 }))
      .toThrow(/组数/);
  });

  it('PENDING_REVIEW -> start-review -> REVIEWING', () => {
    expect(sm.transition('PENDING_REVIEW', 'START_REVIEW')).toBe('REVIEWING');
  });

  it('REVIEWING -> APPROVE -> APPROVED', () => {
    expect(sm.transition('REVIEWING', 'APPROVE')).toBe('APPROVED');
  });

  it('REVIEWING -> REJECT -> REJECTED', () => {
    expect(sm.transition('REVIEWING', 'REJECT')).toBe('REJECTED');
  });

  it('REVIEWING -> REQUEST_CHANGE -> DRAFT', () => {
    expect(sm.transition('REVIEWING', 'REQUEST_CHANGE')).toBe('DRAFT');
  });

  it('REVIEWING -> COMMENT 不改状态', () => {
    expect(sm.transition('REVIEWING', 'COMMENT')).toBe('REVIEWING');
  });

  it('APPROVED -> finalize -> FINALIZED', () => {
    expect(sm.transition('APPROVED', 'FINALIZE')).toBe('FINALIZED');
  });

  it('DRAFT -> finalize 抛错', () => {
    expect(() => sm.transition('DRAFT', 'FINALIZE')).toThrow(/不允许/);
  });

  it('FINALIZED 不能再 submit-review', () => {
    expect(() => sm.transition('FINALIZED', 'SUBMIT_REVIEW', { itemCount: 45, maxGroupCount: 45 }))
      .toThrow(/不允许/);
  });

  it('canDeriveVersion: APPROVED/REJECTED/FINALIZED 可派生，DRAFT/PENDING_REVIEW/REVIEWING 不可', () => {
    expect(sm.canDeriveVersion('APPROVED')).toBe(true);
    expect(sm.canDeriveVersion('REJECTED')).toBe(true);
    expect(sm.canDeriveVersion('FINALIZED')).toBe(true);
    expect(sm.canDeriveVersion('DRAFT')).toBe(false);
    expect(sm.canDeriveVersion('PENDING_REVIEW')).toBe(false);
    expect(sm.canDeriveVersion('REVIEWING')).toBe(false);
  });

  it('canEditItems: 仅 DRAFT 允许', () => {
    expect(sm.canEditItems('DRAFT')).toBe(true);
    expect(sm.canEditItems('PENDING_REVIEW')).toBe(false);
    expect(sm.canEditItems('APPROVED')).toBe(false);
    expect(sm.canEditItems('FINALIZED')).toBe(false);
  });
});
