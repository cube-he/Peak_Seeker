import { Test } from '@nestjs/testing';
import { PlanItemService } from './plan-item.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PlanStateMachineService } from './plan-state-machine.service';
import { ConflictException } from '@nestjs/common';

describe('PlanItemService.add', () => {
  let service: PlanItemService;
  let prisma: any;
  let sm: PlanStateMachineService;

  beforeEach(async () => {
    prisma = {
      volunteerPlan: { findUnique: jest.fn() },
      planItem: { count: jest.fn(), create: jest.fn() },
      enrollmentPlan: { findUnique: jest.fn() },
      admissionRecord: { findFirst: jest.fn() },
      batchConfig: { findUnique: jest.fn() },
      studentProfile: { findUnique: jest.fn() },
    };
    sm = new PlanStateMachineService();
    const mod = await Test.createTestingModule({
      providers: [PlanItemService, { provide: PrismaService, useValue: prisma },
                  { provide: PlanStateMachineService, useValue: sm }],
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

  it('正常加入：sequence 自动 = count + 1，gradient 自动算', async () => {
    prisma.volunteerPlan.findUnique.mockResolvedValue({ id: 1, status: 'DRAFT', batchConfigId: 5, year: 2026, studentId: 10 });
    prisma.batchConfig.findUnique.mockResolvedValue({ id: 5, maxGroupCount: 45 });
    prisma.planItem.count.mockResolvedValue(2);
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

    const result = await service.add(1, { enrollmentPlanId: 100 } as any);
    expect(result.sequence).toBe(3);
    expect(result.gradient).toBe('CHONG'); // 8000/10000=0.8
  });
});
