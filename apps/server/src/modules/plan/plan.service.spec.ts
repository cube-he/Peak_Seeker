import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PlanService } from './plan.service';
import { PlanStateMachineService } from './plan-state-machine.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RiskEngineService } from './risk-engine/risk-engine.service';
import { NotificationService } from '../notification/notification.service';
import { FEATURE_FLAGS } from '../../config/feature-flags';

describe('PlanService workflow gates', () => {
  let service: PlanService;
  let prisma: any;
  let notifications: any;

  beforeEach(async () => {
    prisma = {
      teacherProfile: {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
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
      planItemRisk: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        update: jest.fn(),
      },
      planReview: { create: jest.fn() },
      planReviewDraft: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      $transaction: jest.fn((cb: any) => cb(prisma)),
    };

    const mod = await Test.createTestingModule({
      providers: [
        PlanService,
        PlanStateMachineService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: RiskEngineService,
          useValue: {
            recomputeForPlan: jest.fn().mockResolvedValue({ evaluated: 0, totalFindings: 0 }),
            countByPlan: jest.fn().mockResolvedValue({ critical: 0, moderate: 0, minor: 0 }),
          },
        },
        {
          provide: NotificationService,
          useValue: { send: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();
    service = mod.get(PlanService);
    notifications = mod.get(NotificationService);
  });

  it('createForStudent 放宽策略: intakeStatus 未 VERIFIED 也允许出方案 (2026-06-25 拆门)', async () => {
    prisma.teacherProfile.findUnique.mockResolvedValue({ id: 5, userId: 20 });
    prisma.studentProfile.findUnique.mockResolvedValue({
      id: 10,
      teacherId: 5,
      intakeStatus: 'SUBMITTED',
      preferredBatches: [],
      user: { realName: '小王', username: 'student' },
    });
    prisma.batchConfig.findUnique.mockResolvedValue({
      id: 1, batch: '本科批B段', year: 2026, province: '四川',
    });
    prisma.volunteerPlan.findFirst.mockResolvedValue(null);
    prisma.volunteerPlan.create.mockResolvedValue({ id: 99, status: 'DRAFT' });

    const result = await service.createForStudent(20, 10, { batchConfigId: 1 } as any);
    expect(result).toEqual({ id: 99, status: 'DRAFT' });
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
      examType: 'PHYSICS',
      county: '叙永县',
      isRural: true,
      user: { realName: '小王', username: 'student', birthDate: new Date('2008-01-01'), ethnicity: '汉族', gender: 'MALE' },
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

  it('parentConfirm moves an approved plan to PARENT_CONFIRMED', async () => {
    prisma.volunteerPlan.findUnique.mockResolvedValue({
      id: 1,
      studentId: 10,
      status: 'APPROVED',
      student: { userId: 100 },
    });
    prisma.volunteerPlan.update.mockResolvedValue({
      id: 1,
      status: 'PARENT_CONFIRMED',
      parentConfirmedAt: new Date(),
    });
    prisma.planReview.create.mockResolvedValue({ id: 1 });

    const result = await (service as any).parentConfirm(1, 100);

    expect(result).toHaveProperty('status', 'PARENT_CONFIRMED');
    expect(prisma.volunteerPlan.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1 },
        data: expect.objectContaining({
          status: 'PARENT_CONFIRMED',
          parentConfirmedAt: expect.any(Date),
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
      status: 'PARENT_CONFIRMED',
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

  describe('createForStudent batch validation (STRICT_BATCH_VALIDATION)', () => {
    const originalFlag = FEATURE_FLAGS.STRICT_BATCH_VALIDATION;
    afterEach(() => {
      FEATURE_FLAGS.STRICT_BATCH_VALIDATION = originalFlag;
    });

    const setupMocks = (preferredBatches: string[], targetBatch: string) => {
      prisma.teacherProfile.findUnique.mockResolvedValue({ id: 5, userId: 20 });
      prisma.studentProfile.findUnique.mockResolvedValue({
        id: 10,
        teacherId: 5,
        intakeStatus: 'VERIFIED',
        preferredBatches,
        examType: 'PHYSICS',
        county: '叙永县',
        isRural: true,
        user: { realName: '小王', username: 'student', birthDate: new Date('2008-01-01'), ethnicity: '汉族', gender: 'MALE' },
      });
      prisma.batchConfig.findUnique.mockResolvedValue({
        id: 22,
        year: 2026,
        province: '四川',
        batch: targetBatch,
      });
      prisma.volunteerPlan.findFirst.mockResolvedValue(null);
      prisma.volunteerPlan.create.mockResolvedValue({ id: 99, status: 'DRAFT' });
    };

    it('STRICT=false 时 batch 不在 preferredBatches 中只 warn, 创建成功', async () => {
      FEATURE_FLAGS.STRICT_BATCH_VALIDATION = false;
      setupMocks(['本科批A段'], '本科批B段');
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      const result = await service.createForStudent(20, 10, { batchConfigId: 22 } as any);
      expect(result).toEqual({ id: 99, status: 'DRAFT' });
      expect(warnSpy).toHaveBeenCalledWith(
        '[STRICT_BATCH_VALIDATION disabled]',
        expect.stringMatching(/本科批B段.*未被学生选定/),
      );
      warnSpy.mockRestore();
    });

    it('STRICT=true 时 batch 不在 preferredBatches 中抛 BadRequestException', async () => {
      FEATURE_FLAGS.STRICT_BATCH_VALIDATION = true;
      setupMocks(['本科批A段'], '本科批B段');
      await expect(
        service.createForStudent(20, 10, { batchConfigId: 22 } as any),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.volunteerPlan.create).not.toHaveBeenCalled();
    });

    it('preferredBatches 为空 (老学生) 时不校验, 直接创建', async () => {
      FEATURE_FLAGS.STRICT_BATCH_VALIDATION = true;
      setupMocks([], '本科批B段');
      const result = await service.createForStudent(20, 10, { batchConfigId: 22 } as any);
      expect(result).toEqual({ id: 99, status: 'DRAFT' });
    });

    it('batch 在 preferredBatches 中正常创建', async () => {
      FEATURE_FLAGS.STRICT_BATCH_VALIDATION = true;
      setupMocks(['本科批A段', '本科批B段'], '本科批B段');
      const result = await service.createForStudent(20, 10, { batchConfigId: 22 } as any);
      expect(result).toEqual({ id: 99, status: 'DRAFT' });
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

describe('PlanService review notifications', () => {
  let service: PlanService;
  let prisma: any;
  let notifications: any;

  beforeEach(async () => {
    prisma = {
      teacherProfile: {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
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
        {
          provide: RiskEngineService,
          useValue: {
            recomputeForPlan: jest.fn().mockResolvedValue({ evaluated: 0, totalFindings: 0 }),
            countByPlan: jest.fn().mockResolvedValue({ critical: 0, moderate: 0, minor: 0 }),
          },
        },
        {
          provide: NotificationService,
          useValue: { send: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();
    service = mod.get(PlanService);
    notifications = mod.get(NotificationService);
  });

  it('APPROVE 通知出方案老师 + 学生', async () => {
    prisma.volunteerPlan.findUnique.mockResolvedValue({ id: 7, status: 'REVIEWING', currentReviewerId: 99, createdById: 20, studentId: 10, name: '小王-本科批', student: { userId: 30 } });
    prisma.volunteerPlan.update.mockResolvedValue({ id: 7, status: 'APPROVED' });
    await service.review(7, 99, { action: 'APPROVE' } as any);
    expect(notifications.send).toHaveBeenCalledWith(expect.objectContaining({ userId: 20, type: 'plan_approved', refId: 7, refType: 'plan' }));
    expect(notifications.send).toHaveBeenCalledWith(expect.objectContaining({ userId: 30, type: 'plan_approved', refId: 7 }));
  });
  it('REJECT 只通知出方案老师', async () => {
    prisma.volunteerPlan.findUnique.mockResolvedValue({ id: 7, status: 'REVIEWING', currentReviewerId: 99, createdById: 20, studentId: 10, name: 'X' });
    prisma.volunteerPlan.update.mockResolvedValue({ id: 7, status: 'REJECTED' });
    await service.review(7, 99, { action: 'REJECT', comment: '冲档太多' } as any);
    expect(notifications.send).toHaveBeenCalledWith(expect.objectContaining({ userId: 20, type: 'plan_rejected', refId: 7 }));
    expect(notifications.send).toHaveBeenCalledTimes(1);
  });
  it('主管认领后通知出方案老师', async () => {
    prisma.teacherProfile.findUnique.mockResolvedValue({ isSupervisor: true });
    prisma.$executeRaw = jest.fn().mockResolvedValue(1);
    prisma.volunteerPlan.findUnique.mockResolvedValue({ id: 7, createdById: 20, name: 'X' });
    await service.startReview(7, 99);
    expect(notifications.send).toHaveBeenCalledWith(expect.objectContaining({ userId: 20, type: 'plan_review_started', refId: 7 }));
  });
  it('家长确认后通知出方案老师', async () => {
    prisma.volunteerPlan.findUnique.mockResolvedValue({ id: 7, status: 'APPROVED', createdById: 20, studentId: 10, name: 'X', student: { userId: 30 } });
    prisma.volunteerPlan.update.mockResolvedValue({ id: 7, status: 'PARENT_CONFIRMED' });
    await service.parentConfirm(7, 30);
    expect(notifications.send).toHaveBeenCalledWith(expect.objectContaining({ userId: 20, type: 'parent_confirmed', refId: 7 }));
  });
  it('REQUEST_CHANGE 通知出方案老师打回', async () => {
    prisma.volunteerPlan.findUnique.mockResolvedValue({ id: 7, status: 'REVIEWING', currentReviewerId: 99, createdById: 20, studentId: 10, name: 'X' });
    prisma.volunteerPlan.update.mockResolvedValue({ id: 7, status: 'DRAFT' });
    await service.review(7, 99, { action: 'REQUEST_CHANGE', comment: '补两个稳档' } as any);
    expect(notifications.send).toHaveBeenCalledWith(expect.objectContaining({ userId: 20, type: 'plan_change_requested', refId: 7 }));
    expect(notifications.send).toHaveBeenCalledTimes(1);
  });
  it('家长退回修改通知出方案老师', async () => {
    prisma.volunteerPlan.findUnique.mockResolvedValue({ id: 7, status: 'APPROVED', createdById: 20, studentId: 10, name: 'X', student: { userId: 30 } });
    prisma.volunteerPlan.update.mockResolvedValue({ id: 7, status: 'DRAFT' });
    await service.parentRequestChange(7, 30, '想换个城市');
    expect(notifications.send).toHaveBeenCalledWith(expect.objectContaining({ userId: 20, type: 'parent_change_requested', refId: 7 }));
  });
  it('submitReview 广播全部主管', async () => {
    // findById 走 volunteerPlan.findUnique (含 student/planItems/reviews); batchConfigId=null 跳过批次查询
    prisma.volunteerPlan.findUnique.mockResolvedValue({ id: 7, status: 'DRAFT', createdById: 20, studentId: 10, name: 'X', batchConfigId: null, student: { user: {} }, planItems: [], reviews: [] });
    prisma.planItem.count.mockResolvedValue(0);
    prisma.volunteerPlan.update.mockResolvedValue({ id: 7, status: 'PENDING_REVIEW' });
    prisma.teacherProfile.findMany.mockResolvedValue([{ userId: 40 }, { userId: 41 }]);
    await service.submitReview(7, 20);
    expect(notifications.send).toHaveBeenCalledWith(expect.objectContaining({ userId: 40, type: 'plan_submitted' }));
    expect(notifications.send).toHaveBeenCalledWith(expect.objectContaining({ userId: 41, type: 'plan_submitted' }));
  });
});
