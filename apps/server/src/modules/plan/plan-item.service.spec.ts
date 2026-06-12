import { Test } from '@nestjs/testing';
import { PlanItemService } from './plan-item.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PlanStateMachineService } from './plan-state-machine.service';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { RiskEngineService } from './risk-engine/risk-engine.service';

describe('PlanItemService.add', () => {
  let service: PlanItemService;
  let prisma: any;
  let sm: PlanStateMachineService;

  beforeEach(async () => {
    prisma = {
      volunteerPlan: { findUnique: jest.fn(), update: jest.fn() },
      planItem: {
        count: jest.fn(),
        create: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        aggregate: jest.fn().mockResolvedValue({ _max: { sequence: null } }),
      },
      enrollmentPlan: { findUnique: jest.fn() },
      admissionRecord: { findFirst: jest.fn() },
      batchConfig: { findUnique: jest.fn() },
      studentProfile: { findUnique: jest.fn() },
      $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    };
    sm = new PlanStateMachineService();
    const mod = await Test.createTestingModule({
      providers: [
        PlanItemService,
        { provide: PrismaService, useValue: prisma },
        { provide: PlanStateMachineService, useValue: sm },
        {
          provide: RiskEngineService,
          useValue: {
            recomputeForPlan: jest.fn().mockResolvedValue({ evaluated: 0, totalFindings: 0 }),
          },
        },
      ],
    }).compile();
    service = mod.get(PlanItemService);
  });

  it('非 DRAFT 状态拒绝加入', async () => {
    prisma.volunteerPlan.findUnique.mockResolvedValue({ id: 1, status: 'APPROVED', batchConfigId: 5 });
    await expect(service.add(1, { enrollmentPlanId: 100 } as any)).rejects.toThrow();
  });

  it('达到 maxGroupCount 上限拒绝加入', async () => {
    prisma.volunteerPlan.findUnique.mockResolvedValue({ id: 1, status: 'DRAFT', batchConfigId: 5, year: 2026, studentId: 10 });
    prisma.batchConfig.findUnique.mockResolvedValue({ id: 5, maxGroupCount: 45 });
    prisma.planItem.count.mockResolvedValue(45);
    await expect(service.add(1, { enrollmentPlanId: 100 } as any)).rejects.toThrow(ConflictException);
  });

  it('rejects a soft-failed candidate unless the teacher confirms override', async () => {
    prisma.volunteerPlan.findUnique.mockResolvedValue({ id: 1, status: 'DRAFT', batchConfigId: 5, year: 2026, studentId: 10 });

    await expect(
      service.add(1, {
        enrollmentPlanId: 100,
        softFailReasons: [{ rule: 'tuition', note: '瀛﹁垂瓒呴绠?' }],
      } as any),
    ).rejects.toThrow(ConflictException);
  });

  it('正常加入：sequence 自动 = max(sequence) + 1，gradient 自动算', async () => {
    prisma.volunteerPlan.findUnique.mockResolvedValue({ id: 1, status: 'DRAFT', batchConfigId: 5, year: 2026, studentId: 10 });
    prisma.batchConfig.findUnique.mockResolvedValue({ id: 5, maxGroupCount: 45 });
    prisma.planItem.count.mockResolvedValue(2);
    prisma.planItem.aggregate.mockResolvedValue({ _max: { sequence: 2 } });
    prisma.studentProfile.findUnique.mockResolvedValue({ id: 10, provincialRank: 8000 });
    prisma.enrollmentPlan.findUnique.mockResolvedValue({
      id: 100, universityId: 11, majorId: 22, university: { name: 'U', code: 'UC' }, major: { name: 'M' },
      groupCode: 'G', groupName: 'GN', majorCode: 'MC', majorName: 'M',
      groupMajors: '专业A,专业B,专业C', subjects: '物理', batch: '本科批A段', recruitType: '普通类',
      planCount: 5, tuition: 5000, subjectRequirements: null,
    });
    prisma.admissionRecord.findFirst.mockResolvedValue({
      groupMinScore: 600, groupMinRank: 10000, majorMinScore: 605, majorMinRank: 9500,
    });
    prisma.planItem.create.mockImplementation((args: any) => Promise.resolve({ id: 999, ...args.data }));

    const result = await service.add(1, {
      enrollmentPlanId: 100,
      softFailReasons: [{ rule: 'tuition', note: '瀛﹁垂瓒呴绠?' }],
      softFailOverrideConfirmed: true,
      overrideReason: 'teacher confirmed with student',
    } as any);
    expect(result.sequence).toBe(3);
    expect(result.gradient).toBe('BAO'); // 10000/8000=1.25
    expect(result.overrideSoftFail).toBe(true);
    expect(result.softFailReasons).toEqual([{ rule: 'tuition', note: '瀛﹁垂瓒呴绠?' }]);
  });

  it('删除产生 sequence 空洞后仍可加入：取 max(sequence)+1 而非 count+1', async () => {
    // 复现 2026-06-12 线上 bug: 7 条删 5 条剩 seq {1,4}, count+1=3 可加,
    // 再加 count+1=4 撞 (plan_id,sequence) 唯一约束 → 永久 500
    prisma.volunteerPlan.findUnique.mockResolvedValue({ id: 1, status: 'DRAFT', batchConfigId: 5, year: 2026, studentId: 10 });
    prisma.batchConfig.findUnique.mockResolvedValue({ id: 5, maxGroupCount: 45 });
    prisma.planItem.count.mockResolvedValue(2); // 剩 2 条
    prisma.planItem.aggregate.mockResolvedValue({ _max: { sequence: 4 } }); // 但最大 seq 是 4
    prisma.studentProfile.findUnique.mockResolvedValue({ id: 10, provincialRank: 8000 });
    prisma.enrollmentPlan.findUnique.mockResolvedValue({
      id: 100, universityId: 11, majorId: 22, university: { name: 'U', code: 'UC' }, major: { name: 'M' },
      groupCode: 'G', groupName: 'GN', majorCode: 'MC', majorName: 'M',
      groupMajors: 'A,B', subjects: '历史', batch: '本科批B段', recruitType: '普通类',
      planCount: 5, tuition: 5000, subjectRequirements: null,
    });
    prisma.admissionRecord.findFirst.mockResolvedValue({ groupMinScore: 500, groupMinRank: 40000 });
    prisma.planItem.create.mockImplementation((args: any) => Promise.resolve({ id: 999, ...args.data }));

    const result = await service.add(1, { enrollmentPlanId: 100 } as any);
    expect(result.sequence).toBe(5);
  });

  it('sequence 唯一约束冲突 (P2002) 返回 409 而非 500', async () => {
    prisma.volunteerPlan.findUnique.mockResolvedValue({ id: 1, status: 'DRAFT', batchConfigId: 5, year: 2026, studentId: 10 });
    prisma.batchConfig.findUnique.mockResolvedValue({ id: 5, maxGroupCount: 45 });
    prisma.planItem.count.mockResolvedValue(2);
    prisma.planItem.aggregate.mockResolvedValue({ _max: { sequence: 4 } });
    prisma.studentProfile.findUnique.mockResolvedValue({ id: 10, provincialRank: 8000 });
    prisma.enrollmentPlan.findUnique.mockResolvedValue({
      id: 100, universityId: 11, majorId: 22, university: { name: 'U', code: 'UC' }, major: { name: 'M' },
      groupCode: 'G', groupName: 'GN', majorCode: 'MC', majorName: 'M',
      groupMajors: 'A,B', subjects: '历史', batch: '本科批B段', recruitType: '普通类',
      planCount: 5, tuition: 5000, subjectRequirements: null,
    });
    prisma.admissionRecord.findFirst.mockResolvedValue({ groupMinScore: 500, groupMinRank: 40000 });
    const p2002: any = new Error('Unique constraint failed on the constraint: `plan_items_plan_id_sequence_key`');
    p2002.code = 'P2002';
    prisma.planItem.create.mockRejectedValue(p2002);

    await expect(service.add(1, { enrollmentPlanId: 100 } as any)).rejects.toThrow(ConflictException);
  });

  it('saves selected major order and full ranking when adding a major group', async () => {
    prisma.volunteerPlan.findUnique.mockResolvedValue({ id: 1, status: 'DRAFT', batchConfigId: 5, year: 2026, studentId: 10 });
    prisma.batchConfig.findUnique.mockResolvedValue({ id: 5, maxGroupCount: 45 });
    prisma.planItem.count.mockResolvedValue(2);
    prisma.studentProfile.findUnique.mockResolvedValue({ id: 10, provincialRank: 8000 });
    prisma.enrollmentPlan.findUnique.mockResolvedValue({
      id: 100, universityId: 11, majorId: 22, university: { name: 'U', code: 'UC' }, major: { name: 'M' },
      groupCode: 'G', groupName: 'GN', majorCode: 'MC', majorName: 'M',
      groupMajors: 'M,A,B,C,D,E,F', subjects: 'Physics', batch: 'Batch A', recruitType: 'General',
      planCount: 5, tuition: 5000, subjectRequirements: null,
    });
    prisma.admissionRecord.findFirst.mockResolvedValue({
      groupMinScore: 600, groupMinRank: 10000, majorMinScore: 605, majorMinRank: 9500,
    });
    prisma.planItem.create.mockImplementation((args: any) => Promise.resolve({ id: 999, ...args.data }));

    const selectedMajors = [
      { order: 1, enrollmentPlanId: 100, majorId: 22, majorName: 'M', majorCode: 'MC', displaySection: 'RECOMMENDED', displayReason: 'preferred', majorMinScore: 605, majorMinRank: 9500, planCount: 5 },
      { order: 2, enrollmentPlanId: 101, majorId: 23, majorName: 'A', majorCode: 'A01', displaySection: 'BACKUP', displayReason: 'backup', majorMinScore: 600, majorMinRank: 10000, planCount: 4 },
    ];
    const candidateMajorRanking = [
      ...selectedMajors,
      { order: 3, enrollmentPlanId: 102, majorId: 24, majorName: 'Risk', majorCode: 'R01', displaySection: 'RISK', displayReason: 'risk', majorMinScore: 620, majorMinRank: 3000, planCount: 2 },
    ];

    const result = await service.add(1, {
      enrollmentPlanId: 100,
      acceptAdjust: false,
      selectedMajors,
      candidateMajorRanking,
    } as any);

    expect(result.recommendedOrder).toBe('M、A');
    expect(result.acceptAdjust).toBe(true);
    expect(result.fullMajorRanking).toEqual({
      strategyVersion: 'major-group-fill-v1',
      acceptAdjust: true,
      selectedMajors,
      candidateMajorRanking,
    });
  });

  it('rejects adding another major from the same university group to one plan', async () => {
    prisma.volunteerPlan.findUnique.mockResolvedValue({ id: 1, status: 'DRAFT', batchConfigId: 5, year: 2026, studentId: 10 });
    prisma.batchConfig.findUnique.mockResolvedValue({ id: 5, maxGroupCount: 45 });
    prisma.planItem.count.mockResolvedValue(2);
    prisma.enrollmentPlan.findUnique.mockResolvedValue({
      id: 101, universityId: 11, majorId: 23, university: { name: 'U', code: 'UC' }, major: { name: 'M2' },
      groupCode: 'G', groupName: 'GN', majorCode: 'MC2', majorName: 'M2',
      groupMajors: 'Major A,Major B', subjects: 'Physics', batch: 'Batch A', recruitType: 'General',
      planCount: 5, tuition: 5000, subjectRequirements: null,
    });
    prisma.planItem.findFirst.mockResolvedValue({
      id: 300,
      planId: 1,
      universityId: 11,
      groupCode: 'G',
      majorName: 'M1',
    });

    await expect(service.add(1, { enrollmentPlanId: 101 } as any)).rejects.toThrow(ConflictException);
    expect(prisma.planItem.create).not.toHaveBeenCalled();
  });

  it('updates selected majors and recomputes recommended order', async () => {
    prisma.volunteerPlan.findUnique.mockResolvedValue({ id: 1, status: 'DRAFT', createdById: 9 });
    prisma.planItem.findUnique.mockResolvedValue({
      id: 20,
      planId: 1,
      fullMajorRanking: {
        selectedMajors: [
          { order: 1, enrollmentPlanId: 100, majorId: 10, majorName: 'A' },
          { order: 2, enrollmentPlanId: 101, majorId: 11, majorName: 'B' },
        ],
        candidateMajorRanking: [
          { order: 1, enrollmentPlanId: 100, majorId: 10, majorName: 'A' },
          { order: 2, enrollmentPlanId: 101, majorId: 11, majorName: 'B' },
          { order: 3, enrollmentPlanId: 102, majorId: 12, majorName: 'C' },
        ],
      },
    });
    prisma.planItem.update.mockImplementation((args: any) => Promise.resolve({ id: 20, ...args.data }));

    const result = await service.update(1, 20, {
      selectedMajors: [
        { order: 1, enrollmentPlanId: 102, majorId: 12, majorName: 'C' },
        { order: 2, enrollmentPlanId: 100, majorId: 10, majorName: 'A' },
      ],
    } as any, 9);

    expect(result.recommendedOrder).toBe('C、A');
    expect(result.acceptAdjust).toBe(true);
    expect(result.fullMajorRanking).toEqual({
      strategyVersion: 'major-group-manual-v1',
      acceptAdjust: true,
      selectedMajors: [
        { order: 1, enrollmentPlanId: 102, majorId: 12, majorName: 'C' },
        { order: 2, enrollmentPlanId: 100, majorId: 10, majorName: 'A' },
      ],
      candidateMajorRanking: [
        { order: 1, enrollmentPlanId: 100, majorId: 10, majorName: 'A' },
        { order: 2, enrollmentPlanId: 101, majorId: 11, majorName: 'B' },
        { order: 3, enrollmentPlanId: 102, majorId: 12, majorName: 'C' },
      ],
    });
  });

  it('rejects selected majors outside the full candidate ranking', async () => {
    prisma.volunteerPlan.findUnique.mockResolvedValue({ id: 1, status: 'DRAFT', createdById: 9 });
    prisma.planItem.findUnique.mockResolvedValue({
      id: 20,
      planId: 1,
      fullMajorRanking: {
        selectedMajors: [{ order: 1, enrollmentPlanId: 100, majorId: 10, majorName: 'A' }],
        candidateMajorRanking: [{ order: 1, enrollmentPlanId: 100, majorId: 10, majorName: 'A' }],
      },
    });

    await expect(service.update(1, 20, {
      selectedMajors: [{ order: 1, enrollmentPlanId: 999, majorId: 99, majorName: 'Ghost' }],
    } as any, 9)).rejects.toThrow(BadRequestException);
  });

  it('moves a pending-review plan back to draft after selected majors change', async () => {
    prisma.volunteerPlan.findUnique.mockResolvedValue({ id: 1, status: 'PENDING_REVIEW', createdById: 9 });
    prisma.planItem.findUnique.mockResolvedValue({
      id: 20,
      planId: 1,
      fullMajorRanking: {
        selectedMajors: [{ order: 1, enrollmentPlanId: 100, majorId: 10, majorName: 'A' }],
        candidateMajorRanking: [{ order: 1, enrollmentPlanId: 100, majorId: 10, majorName: 'A' }],
      },
    });
    prisma.planItem.update.mockImplementation((args: any) => Promise.resolve({ id: 20, ...args.data }));
    prisma.volunteerPlan.update.mockResolvedValue({ id: 1, status: 'DRAFT' });

    await service.update(1, 20, {
      selectedMajors: [{ order: 1, enrollmentPlanId: 100, majorId: 10, majorName: 'A' }],
    } as any, 9);

    expect(prisma.volunteerPlan.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { status: 'DRAFT', currentReviewerId: null },
    });
  });

  it('rejects selected major changes while a plan is under review', async () => {
    prisma.volunteerPlan.findUnique.mockResolvedValue({ id: 1, status: 'REVIEWING', createdById: 9 });

    await expect(service.update(1, 20, {
      selectedMajors: [{ order: 1, enrollmentPlanId: 100, majorId: 10, majorName: 'A' }],
    } as any, 9)).rejects.toThrow(ConflictException);
  });
});
