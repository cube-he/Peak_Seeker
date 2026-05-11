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
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      planItem: { count: jest.fn(), findMany: jest.fn() },
      planReview: { create: jest.fn() },
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
});
