// plan-candidate.service.spec.ts
import { Test } from '@nestjs/testing';
import { PlanCandidateService } from './plan-candidate.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('PlanCandidateService', () => {
  let service: PlanCandidateService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      volunteerPlan: { findUnique: jest.fn() },
      studentProfile: { findUnique: jest.fn() },
      enrollmentPlan: { findMany: jest.fn() },
      admissionRecord: { findMany: jest.fn() },
      healthRestriction: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const mod = await Test.createTestingModule({
      providers: [PlanCandidateService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = mod.get(PlanCandidateService);
  });

  it('PASS 排在 SOFT_FAIL 前', async () => {
    prisma.volunteerPlan.findUnique.mockResolvedValue({
      id: 1, studentId: 10, batchName: '本科批A段', batchConfigId: 5,
      year: 2026,
    });
    prisma.studentProfile.findUnique.mockResolvedValue({
      id: 10, province: '四川', examType: 'PHYSICS', provincialRank: 30000,
      colorBlind: false, colorWeak: false, visionLeft: 5, visionRight: 5,
      isRural: false, tuitionBudget: 'UNLIMITED', acceptSinoForeign: true,
      acceptPrivate: 'RELAXED', user: { gender: '男', ethnicity: '汉族' },
    });
    prisma.enrollmentPlan.findMany.mockResolvedValue([
      { id: 100, universityId: 1, majorId: 1, university: { name: 'A' }, major: { name: 'M1', code: '0805', notes: '' },
        recruitType: '普通类', isSinoForeign: false, planNotes: '', tuition: 5000,
        majorCode: '0805', subjects: '物理', batch: '本科批A段', groupCode: 'G1', majorName: 'M1' },
      { id: 101, universityId: 2, majorId: 2, university: { name: 'B' }, major: { name: 'M2', code: '1001', notes: '本专业仅限女生报考' },
        recruitType: '普通类', isSinoForeign: false, planNotes: '', tuition: 5000,
        majorCode: '1001', subjects: '物理', batch: '本科批A段', groupCode: 'G2', majorName: 'M2' },
    ]);
    prisma.admissionRecord.findMany.mockResolvedValue([]);

    const r = await service.getCandidates(1, { page: 1, pageSize: 10, includeSoftFails: true });
    expect(r.items.length).toBe(2);
    expect(r.items[0].matchStatus).toBe('PASS');
    expect(r.items[1].matchStatus).toBe('SOFT_FAIL');
  });

  it('includeSoftFails=false 仅返回 PASS', async () => {
    // 同上 mock 设置...（此处略，实际写时复制上面 mock）
    prisma.volunteerPlan.findUnique.mockResolvedValue({
      id: 1, studentId: 10, batchName: '本科批A段', batchConfigId: 5, year: 2026,
    });
    prisma.studentProfile.findUnique.mockResolvedValue({
      id: 10, province: '四川', examType: 'PHYSICS', provincialRank: 30000,
      colorBlind: false, colorWeak: false, visionLeft: 5, visionRight: 5,
      isRural: false, tuitionBudget: 'UNLIMITED', acceptSinoForeign: true,
      acceptPrivate: 'RELAXED', user: { gender: '男', ethnicity: '汉族' },
    });
    prisma.enrollmentPlan.findMany.mockResolvedValue([
      { id: 101, universityId: 2, majorId: 2, university: { name: 'B' }, major: { name: 'M2', code: '1001', notes: '本专业仅限女生报考' },
        recruitType: '普通类', isSinoForeign: false, planNotes: '', tuition: 5000,
        majorCode: '1001', subjects: '物理', batch: '本科批A段', groupCode: 'G2', majorName: 'M2' },
    ]);
    prisma.admissionRecord.findMany.mockResolvedValue([]);

    const r = await service.getCandidates(1, { page: 1, pageSize: 10, includeSoftFails: false });
    expect(r.items.length).toBe(0);
  });

  it('正确合并 AdmissionRecord 历史快照', async () => {
    prisma.volunteerPlan.findUnique.mockResolvedValue({
      id: 1, studentId: 10, batchName: '本科批A段', batchConfigId: 5, year: 2026,
    });
    prisma.studentProfile.findUnique.mockResolvedValue({
      id: 10, province: '四川', examType: 'PHYSICS', provincialRank: 8000,
      colorBlind: false, colorWeak: false, visionLeft: 5, visionRight: 5,
      isRural: false, tuitionBudget: 'UNLIMITED', acceptSinoForeign: true,
      acceptPrivate: 'RELAXED', user: { gender: '男', ethnicity: '汉族' },
    });
    prisma.enrollmentPlan.findMany.mockResolvedValue([
      { id: 200, universityId: 1, majorId: 1, university: { name: 'A' }, major: { name: 'M', code: '0805', notes: '' },
        recruitType: '普通类', isSinoForeign: false, planNotes: '', tuition: 5000,
        majorCode: '0805', majorName: 'M', subjects: '物理', batch: '本科批A段', groupCode: 'G1' },
    ]);
    prisma.admissionRecord.findMany.mockResolvedValue([
      { universityId: 1, subjects: '物理', batch: '本科批A段', recruitType: '普通类',
        groupCode: 'G1', majorCode: '0805', majorName: 'M', year: 2025,
        groupMinRank: 10000, groupMinScore: 600, majorMinRank: 9500, majorMinScore: 605 },
    ]);

    const r = await service.getCandidates(1, { page: 1, pageSize: 10, includeSoftFails: true });
    expect(r.items[0].history.rank25Group).toBe(10000);
    expect(r.items[0].suggestedGradient).toBe('CHONG'); // 8000/10000 = 0.8
  });
});
