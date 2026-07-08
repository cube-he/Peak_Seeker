import { Test } from '@nestjs/testing';
import { VolunteerFormImportService } from './volunteer-form-import.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PlanItemService } from '../plan/plan-item.service';
import { ResolvedGroup } from './volunteer-form.types';

describe('VolunteerFormImportService.commit', () => {
  let service: VolunteerFormImportService;
  let prisma: any;
  let planItem: any;

  const tx = () => ({
    volunteerPlan: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
  });

  beforeEach(async () => {
    const txObj = tx();
    prisma = {
      studentProfile: { findUnique: jest.fn() },
      batchConfig: { findUnique: jest.fn() },
      $transaction: jest.fn(async (fn: any) => fn(txObj)),
      __tx: txObj,
    };
    planItem = { add: jest.fn().mockResolvedValue({ id: 1 }) };
    const mod = await Test.createTestingModule({
      providers: [
        VolunteerFormImportService,
        { provide: PrismaService, useValue: prisma },
        { provide: PlanItemService, useValue: planItem },
      ],
    }).compile();
    service = mod.get(VolunteerFormImportService);
  });

  const matched: ResolvedGroup = {
    seq: 1, schoolCode: '5120', schoolName: '四川师范大学', groupCode: '111', status: 'matched',
    anchorEnrollmentPlanId: 902, acceptAdjust: true,
    selectedMajors: [{ order: 1, enrollmentPlanId: 902, majorId: 2, majorName: '数学与应用数学', majorCode: '0G' }],
  };
  const unmatched: ResolvedGroup = {
    seq: 2, schoolCode: '9999', schoolName: 'X', groupCode: '000', status: 'unmatched', acceptAdjust: true, selectedMajors: [], unmatchedReason: '院校代码不在库',
  };

  it('建新版本: versionNo=父max+1, parentVersionId=父, status=DRAFT; 只写 matched; 父DRAFT置OUTDATED', async () => {
    prisma.studentProfile.findUnique.mockResolvedValue({ id: 10, userId: 50 });
    prisma.batchConfig.findUnique.mockResolvedValue({ id: 7, year: 2026, province: '四川', batch: '本科批B段' });
    prisma.__tx.volunteerPlan.findFirst.mockResolvedValue({ id: 200, versionNo: 1, status: 'DRAFT', name: '袁嘉-本科批B段-v1', createdById: 42 });
    prisma.__tx.volunteerPlan.create.mockResolvedValue({ id: 201, versionNo: 2 });

    const res = await service.commit({ studentId: 10, batchConfigId: 7, resolvedGroups: [matched, unmatched], actorUserId: 42 });

    expect(res.id).toBe(201);
    const createArg = prisma.__tx.volunteerPlan.create.mock.calls[0][0].data;
    expect(createArg.versionNo).toBe(2);
    expect(createArg.parentVersionId).toBe(200);
    expect(createArg.status).toBe('DRAFT');
    expect(createArg.batchConfigId).toBe(7);
    expect(planItem.add).toHaveBeenCalledTimes(1);
    const [planId, dto] = planItem.add.mock.calls[0];
    expect(planId).toBe(201);
    expect(dto.enrollmentPlanId).toBe(902);
    expect(dto.acceptAdjust).toBe(true);
    expect(dto.allowDuplicateGroup).toBe(true);
    expect(dto.selectedMajors).toHaveLength(1);
    expect(prisma.__tx.volunteerPlan.update).toHaveBeenCalledWith({ where: { id: 200 }, data: { status: 'OUTDATED' } });
  });

  it('无父版本: versionNo=1, parentVersionId=null, 不调 update', async () => {
    prisma.studentProfile.findUnique.mockResolvedValue({ id: 10, userId: 50 });
    prisma.batchConfig.findUnique.mockResolvedValue({ id: 7, year: 2026, province: '四川', batch: '本科批B段' });
    prisma.__tx.volunteerPlan.findFirst.mockResolvedValue(null);
    prisma.__tx.volunteerPlan.create.mockResolvedValue({ id: 201, versionNo: 1 });

    await service.commit({ studentId: 10, batchConfigId: 7, resolvedGroups: [matched], actorUserId: 42 });

    const createArg = prisma.__tx.volunteerPlan.create.mock.calls[0][0].data;
    expect(createArg.versionNo).toBe(1);
    expect(createArg.parentVersionId).toBeNull();
    expect(prisma.__tx.volunteerPlan.update).not.toHaveBeenCalled();
  });
});
