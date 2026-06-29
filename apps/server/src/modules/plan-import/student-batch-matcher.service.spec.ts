import { Test } from '@nestjs/testing';
import { StudentBatchMatcherService } from './student-batch-matcher.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('StudentBatchMatcherService', () => {
  let service: StudentBatchMatcherService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      batchConfig: { findMany: jest.fn() },
      studentProfile: { findMany: jest.fn() },
    };
    const mod = await Test.createTestingModule({
      providers: [
        StudentBatchMatcherService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = mod.get(StudentBatchMatcherService);
  });

  it('matchBatchConfig: 批次名归一化(本科批次B段 == 本科批B段) + examType 映射 PHYSICS→物理', async () => {
    prisma.batchConfig.findMany.mockResolvedValue([
      { id: 7, year: 2026, province: '四川', batch: '本科批B段', examType: '物理' },
      { id: 8, year: 2026, province: '四川', batch: '本科批A段', examType: '物理' },
    ]);
    const bc = await service.matchBatchConfig('本科批次B段', 'PHYSICS', 2026, '四川');
    expect(bc?.id).toBe(7);
    // 确认按 examType=物理 查询(映射自 PHYSICS)
    expect(prisma.batchConfig.findMany).toHaveBeenCalledWith({ where: { year: 2026, province: '四川', examType: '物理' } });
  });

  it('matchBatchConfig: 找不到返回 null', async () => {
    prisma.batchConfig.findMany.mockResolvedValue([{ id: 8, batch: '本科批A段', examType: '物理' }]);
    const bc = await service.matchBatchConfig('本科批次B段', 'PHYSICS', 2026, '四川');
    expect(bc).toBeNull();
  });

  it('findCandidateStudents: 经 teacher.userId 过滤, 班级一致排前', async () => {
    prisma.studentProfile.findMany.mockResolvedValue([
      { id: 100, classInfo: '9班', user: { realName: '袁嘉' } },
      { id: 101, classInfo: '10班', user: { realName: '袁嘉' } },
    ]);
    const list = await service.findCandidateStudents({ name: '袁嘉', classInfo: '10班' }, 42);
    expect(list.map(s => s.id)).toEqual([101, 100]);
    // where 用 teacher.userId + user.realName 过滤
    expect(prisma.studentProfile.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { teacher: { userId: 42 }, user: { realName: '袁嘉' } },
    }));
  });
});
