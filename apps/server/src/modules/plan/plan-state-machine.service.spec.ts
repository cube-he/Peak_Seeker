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

  it('组数不足 + 不足额理由(≥10字) → 放行 (提前批/专项只填想去的组)', () => {
    expect(sm.transition('DRAFT', 'SUBMIT_REVIEW', {
      itemCount: 9, maxGroupCount: 30,
      underfillReason: '公费师范定向县逐组核实, 仅填报家庭可接受的 9 个定向县组',
    })).toBe('PENDING_REVIEW');
  });

  it('组数不足 + 理由太短 → 仍拒', () => {
    expect(() => sm.transition('DRAFT', 'SUBMIT_REVIEW', {
      itemCount: 9, maxGroupCount: 30, underfillReason: '不想填',
    })).toThrow(/组数|理由/);
  });

  it('组数超出上限 → 即使有理由也拒', () => {
    expect(() => sm.transition('DRAFT', 'SUBMIT_REVIEW', {
      itemCount: 46, maxGroupCount: 45, underfillReason: '这是一个足够长的不足额理由说明',
    })).toThrow(/组数|上限/);
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

  it('APPROVED -> parent-confirm -> PARENT_CONFIRMED', () => {
    expect(sm.transition('APPROVED', 'PARENT_CONFIRM')).toBe('PARENT_CONFIRMED');
  });

  it('APPROVED -> parent-request-change -> DRAFT', () => {
    expect(sm.transition('APPROVED', 'PARENT_REQUEST_CHANGE')).toBe('DRAFT');
  });

  it('PARENT_CONFIRMED -> finalize -> FINALIZED', () => {
    expect(sm.transition('PARENT_CONFIRMED', 'FINALIZE')).toBe('FINALIZED');
  });

  it('APPROVED -> finalize requires parent confirmation', () => {
    expect(() => sm.transition('APPROVED', 'FINALIZE')).toThrow(/不允许/);
  });

  it('DRAFT -> finalize 抛错', () => {
    expect(() => sm.transition('DRAFT', 'FINALIZE')).toThrow(/不允许/);
  });

  it('FINALIZED 不能再 submit-review', () => {
    expect(() => sm.transition('FINALIZED', 'SUBMIT_REVIEW', { itemCount: 45, maxGroupCount: 45 }))
      .toThrow(/不允许/);
  });

  it('canDeriveVersion: APPROVED/PARENT_CONFIRMED/REJECTED/FINALIZED 可派生，DRAFT/PENDING_REVIEW/REVIEWING 不可', () => {
    expect(sm.canDeriveVersion('APPROVED')).toBe(true);
    expect(sm.canDeriveVersion('PARENT_CONFIRMED')).toBe(true);
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

  it('canEditMajorSelection: DRAFT and PENDING_REVIEW can adjust majors before review starts', () => {
    expect(sm.canEditMajorSelection('DRAFT')).toBe(true);
    expect(sm.canEditMajorSelection('PENDING_REVIEW')).toBe(true);
    expect(sm.canEditMajorSelection('REVIEWING')).toBe(false);
    expect(sm.canEditMajorSelection('APPROVED')).toBe(false);
    expect(sm.canEditMajorSelection('FINALIZED')).toBe(false);
  });
});
