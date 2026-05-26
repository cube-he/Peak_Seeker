import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PlanService } from './plan.service';
import { PlanStateMachineService } from './plan-state-machine.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('PlanService workflow gates', () => {
  let service: PlanService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      teacherProfile: { findUnique: jest.fn().mockResolvedValue(null) },
      studentProfile: { findUnique: jest.fn() },
      batchConfig: { findUnique: jest.fn() },
      volunteerPlan: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      planItem: { count: jest.fn(), findMany: jest.fn() },
      planReview: { create: jest.fn() },
      planReviewDraft: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      $transaction: jest.fn((cb: any) => cb(prisma)),
    };

    const mod = await Test.createTestingModule({
      providers: [
        PlanService,
        PlanStateMachineService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = mod.get(PlanService);
  });

  it('createForStudent rejects unverified intake', async () => {
    prisma.teacherProfile.findUnique.mockResolvedValue({ id: 5, userId: 20 });
    prisma.studentProfile.findUnique.mockResolvedValue({
      id: 10,
      teacherId: 5,
      intakeStatus: 'SUBMITTED',
      user: { realName: '小王', username: 'student' },
    });

    await expect(
      service.createForStudent(20, 10, { batchConfigId: 1 } as any),
    ).rejects.toThrow(ConflictException);
  });

  it('createForStudent reuses an existing plan for the same student and batch', async () => {
    const existingPlan = {
      id: 5,
      studentId: 10,
      batchConfigId: 22,
      versionNo: 1,
      status: 'DRAFT',
    };
    prisma.teacherProfile.findUnique.mockResolvedValue({ id: 5, userId: 20 });
    prisma.studentProfile.findUnique.mockResolvedValue({
      id: 10,
      teacherId: 5,
      intakeStatus: 'VERIFIED',
      user: { realName: '小王', username: 'student' },
    });
    prisma.batchConfig.findUnique.mockResolvedValue({
      id: 22,
      year: 2026,
      province: '四川',
      batch: '本科批B段',
    });
    prisma.volunteerPlan.findFirst.mockResolvedValue(existingPlan);

    const result = await service.createForStudent(20, 10, { batchConfigId: 22 } as any);

    expect(result).toBe(existingPlan);
    expect(prisma.volunteerPlan.findFirst).toHaveBeenCalledWith({
      where: { studentId: 10, batchConfigId: 22 },
      orderBy: { versionNo: 'desc' },
    });
    expect(prisma.volunteerPlan.create).not.toHaveBeenCalled();
  });

  it('studentConfirm moves an approved plan to STUDENT_CONFIRMED', async () => {
    prisma.volunteerPlan.findUnique.mockResolvedValue({
      id: 1,
      studentId: 10,
      status: 'APPROVED',
      student: { userId: 100 },
    });
    prisma.volunteerPlan.update.mockResolvedValue({
      id: 1,
      status: 'STUDENT_CONFIRMED',
      studentConfirmedAt: new Date(),
    });
    prisma.planReview.create.mockResolvedValue({ id: 1 });

    const result = await (service as any).studentConfirm(1, 100);

    expect(result).toHaveProperty('status', 'STUDENT_CONFIRMED');
    expect(prisma.volunteerPlan.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1 },
        data: expect.objectContaining({
          status: 'STUDENT_CONFIRMED',
          studentConfirmedAt: expect.any(Date),
        }),
      }),
    );
  });

  it('finalize rejects a plan before student confirmation', async () => {
    prisma.volunteerPlan.findUnique.mockResolvedValue({
      id: 1,
      createdById: 20,
      userId: null,
      status: 'APPROVED',
      batchConfigId: null,
    });

    await expect(service.finalize(1, 20)).rejects.toThrow(ConflictException);
  });

  it('finalize rejects non-creator teachers', async () => {
    prisma.volunteerPlan.findUnique.mockResolvedValue({
      id: 1,
      createdById: 20,
      userId: null,
      status: 'STUDENT_CONFIRMED',
      batchConfigId: null,
    });

    await expect(service.finalize(1, 99)).rejects.toThrow(ForbiddenException);
  });

  it('exposes selected majors and adjustment status in plan item details', () => {
    const fullMajorRanking = {
      strategyVersion: 'major-group-fill-v1',
      acceptAdjust: true,
      selectedMajors: [
        { order: 1, majorName: 'Computer Science' },
        { order: 2, majorName: 'Software Engineering' },
      ],
      candidateMajorRanking: [],
    };

    const result = (service as any).toPlanItem({
      id: 1,
      sequence: 1,
      universityName: 'U',
      universityCode: 'UC',
      groupCode: 'G',
      groupName: 'GN',
      majorName: 'Computer Science',
      majorCode: '080901',
      gradient: 'WEN',
      planCount: 10,
      tuition: 5000,
      recommendedOrder: 'Computer Science、Software Engineering',
      fullMajorRanking,
      acceptAdjust: true,
    });

    expect(result.recommendedOrder).toBe('Computer Science、Software Engineering');
    expect(result.fullMajorRanking).toBe(fullMajorRanking);
    expect(result.selectedMajors).toEqual(fullMajorRanking.selectedMajors);
    expect(result.acceptAdjust).toBe(true);
  });

  it('includes batch group rules in plan detail', async () => {
    prisma.volunteerPlan.findUnique.mockResolvedValue({
      id: 1,
      createdById: 20,
      userId: null,
      studentId: 10,
      batchConfigId: 22,
      batchName: '本科批B段',
      status: 'DRAFT',
      student: { user: { realName: '小王', username: 'student' } },
      planItems: [],
      reviews: [],
    });
    prisma.batchConfig.findUnique.mockResolvedValue({
      id: 22,
      batch: '本科批B段',
      maxGroupCount: 45,
      maxMajorPerGroup: 6,
      volunteerMode: 'parallel',
    });

    const result = await service.findById(1, 20);

    expect(prisma.batchConfig.findUnique).toHaveBeenCalledWith({
      where: { id: 22 },
      select: {
        id: true,
        batch: true,
        maxGroupCount: true,
        maxMajorPerGroup: true,
        volunteerMode: true,
      },
    });
    expect(result.batchConfig).toEqual({
      id: 22,
      batch: '本科批B段',
      maxGroupCount: 45,
      maxMajorPerGroup: 6,
      volunteerMode: 'parallel',
    });
  });

  it('review clears reviewer draft within the same transaction', async () => {
    // 设置当前用户为主管,且 plan 在 REVIEWING 状态
    prisma.volunteerPlan.findUnique.mockResolvedValue({
      id: 50,
      status: 'REVIEWING',
      currentReviewerId: 20,
      versionNo: 1,
    });
    prisma.volunteerPlan.update.mockResolvedValue({ id: 50, status: 'APPROVED' });
    prisma.planReview.create.mockResolvedValue({ id: 999 });

    await service.review(50, 20, {
      action: 'APPROVE',
      comment: 'looks good',
      itemAnnotations: [{ sequence: 1, annotation: 'ok' }],
    });

    expect(prisma.planReviewDraft.deleteMany).toHaveBeenCalledWith({
      where: { planId: 50, reviewerId: 20 },
    });
  });
});
