import { Test } from '@nestjs/testing';
import { VolunteerFormResolverService } from './volunteer-form-resolver.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ParsedVolunteer } from './volunteer-form.types';

describe('VolunteerFormResolverService.resolveGroups', () => {
  let service: VolunteerFormResolverService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      university: { findMany: jest.fn() },
      enrollmentPlan: { findMany: jest.fn() },
    };
    const mod = await Test.createTestingModule({
      providers: [
        VolunteerFormResolverService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = mod.get(VolunteerFormResolverService);
  });

  const opts = { year: 2026, subjects: '物理', batch: '本科批B段' };

  it('院校代码不在库 → unmatched(院校代码不在库)', async () => {
    prisma.university.findMany.mockResolvedValue([]);
    const v: ParsedVolunteer = { seq: 1, schoolCode: '5120', schoolName: '四川师范大学', groupCode: '111', acceptAdjust: true, majors: [{ code: '0G', name: '数学与应用数学' }] };
    const r = await service.resolveGroups([v], opts);
    expect(r.groups[0].status).toBe('unmatched');
    expect(r.groups[0].unmatchedReason).toBe('院校代码不在库');
    expect(r.summary).toEqual({ total: 1, matched: 0, unmatched: 1 });
  });

  it('该批次无此组 → unmatched(该批次无此专业组)', async () => {
    prisma.university.findMany.mockResolvedValue([{ id: 11, code: '5120', name: '四川师范大学' }]);
    prisma.enrollmentPlan.findMany.mockResolvedValue([]);
    const v: ParsedVolunteer = { seq: 1, schoolCode: '5120', schoolName: '四川师范大学', groupCode: '111', acceptAdjust: true, majors: [{ code: '0G', name: '数学与应用数学' }] };
    const r = await service.resolveGroups([v], opts);
    expect(r.groups[0].status).toBe('unmatched');
    expect(r.groups[0].unmatchedReason).toBe('该批次无此专业组');
  });

  it('命中 → 锚定第一个匹配专业的 EP, selectedMajors 按 PDF 顺序, 名字优先匹配', async () => {
    prisma.university.findMany.mockResolvedValue([{ id: 11, code: '5120', name: '四川师范大学' }]);
    prisma.enrollmentPlan.findMany.mockResolvedValue([
      { id: 901, majorId: 1, majorCode: '0N', majorName: '化学' },
      { id: 902, majorId: 2, majorCode: '0G', majorName: '数学与应用数学' },
      { id: 903, majorId: 3, majorCode: '13', majorName: '物理学' },
    ]);
    const v: ParsedVolunteer = { seq: 1, schoolCode: '5120', schoolName: '四川师范大学', groupCode: '111', acceptAdjust: true,
      majors: [{ code: '0G', name: '数学与应用数学' }, { code: '0N', name: '化学' }, { code: '13', name: '物理学' }] };
    const r = await service.resolveGroups([v], opts);
    expect(r.groups[0].status).toBe('matched');
    expect(r.groups[0].anchorEnrollmentPlanId).toBe(902);
    expect(r.groups[0].selectedMajors.map(m => m.enrollmentPlanId)).toEqual([902, 901, 903]);
    expect(r.groups[0].selectedMajors.map(m => m.order)).toEqual([1, 2, 3]);
    expect(r.groups[0].acceptAdjust).toBe(true);
  });

  it('前一个专业未对齐时保留后续专业在 PDF 中的原始顺序', async () => {
    prisma.university.findMany.mockResolvedValue([{ id: 11, code: '5120', name: '四川师范大学' }]);
    prisma.enrollmentPlan.findMany.mockResolvedValue([
      { id: 902, majorId: 2, majorCode: '0G', majorName: '数学与应用数学' },
    ]);
    const v: ParsedVolunteer = {
      seq: 1,
      schoolCode: '5120',
      schoolName: '四川师范大学',
      groupCode: '111',
      acceptAdjust: true,
      majors: [
        { code: 'ZZ', name: '未对齐专业' },
        { code: '0G', name: '数学与应用数学' },
      ],
    };

    const result = await service.resolveGroups([v], opts);

    expect(result.groups[0].selectedMajors).toEqual([
      expect.objectContaining({ enrollmentPlanId: 902, order: 2 }),
    ]);
  });

  it('高职批按招生计划实名高职(专科)批查询, 避免误报该批次无此专业组', async () => {
    prisma.university.findMany.mockResolvedValue([{ id: 10714, code: '5156', name: '四川电力职业技术学院' }]);
    prisma.enrollmentPlan.findMany.mockResolvedValue([
      { id: 821978, majorId: 1, majorCode: '06', majorName: '发电厂及电力系统' },
    ]);

    const v: ParsedVolunteer = {
      seq: 2,
      schoolCode: '5156',
      schoolName: '四川电力职业技术学院',
      groupCode: '101',
      acceptAdjust: true,
      majors: [{ code: '06', name: '发电厂及电力系统' }],
    };
    const r = await service.resolveGroups([v], { year: 2026, subjects: '物理', batch: '高职批' });

    expect(prisma.enrollmentPlan.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        universityId: 10714,
        groupCode: '101',
        year: 2026,
        batch: '高职(专科)批',
        subjects: '物理',
      }),
    }));
    expect(r.groups[0].status).toBe('matched');
    expect(r.groups[0].anchorEnrollmentPlanId).toBe(821978);
  });

  it('带招生类型约束的批次别名会同步收窄 recruitType', async () => {
    prisma.university.findMany.mockResolvedValue([{ id: 11, code: '5120', name: '四川师范大学' }]);
    prisma.enrollmentPlan.findMany.mockResolvedValue([
      { id: 901, majorId: 1, majorCode: '0G', majorName: '数学与应用数学' },
    ]);
    const v: ParsedVolunteer = { seq: 1, schoolCode: '5120', schoolName: '四川师范大学', groupCode: '111', acceptAdjust: true, majors: [{ code: '0G', name: '数学与应用数学' }] };

    await service.resolveGroups([v], { year: 2026, subjects: '物理', batch: '本科批A段（国家专项）' });

    expect(prisma.enrollmentPlan.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        batch: '本科批A段',
        recruitType: { contains: '国家专项' },
      }),
    }));
  });

  it('专业全对不上 → 组仍 matched, 锚定取该组任一 EP, selectedMajors 空, note=专业未对齐', async () => {
    prisma.university.findMany.mockResolvedValue([{ id: 11, code: '5120', name: '四川师范大学' }]);
    prisma.enrollmentPlan.findMany.mockResolvedValue([{ id: 901, majorId: 1, majorCode: 'ZZ', majorName: '别的专业' }]);
    const v: ParsedVolunteer = { seq: 1, schoolCode: '5120', schoolName: '四川师范大学', groupCode: '111', acceptAdjust: true, majors: [{ code: '0G', name: '数学与应用数学' }] };
    const r = await service.resolveGroups([v], opts);
    expect(r.groups[0].status).toBe('matched');
    expect(r.groups[0].anchorEnrollmentPlanId).toBe(901);
    expect(r.groups[0].selectedMajors).toEqual([]);
    expect(r.groups[0].note).toBe('专业未对齐');
  });
});
