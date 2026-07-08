import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { VolunteerFormImportController } from './volunteer-form-import.controller';

describe('VolunteerFormImportController.preview', () => {
  let controller: VolunteerFormImportController;
  let prisma: any;
  let parser: any;
  let resolver: any;
  let matcher: any;
  let importSvc: any;

  beforeEach(() => {
    prisma = {
      studentProfile: { findFirst: jest.fn(), findUnique: jest.fn() },
    };
    parser = {
      extractPdfText: jest.fn(),
      parseFormText: jest.fn(),
    };
    resolver = {
      resolveGroups: jest.fn(),
    };
    matcher = {
      findCandidateStudents: jest.fn(),
      matchBatchConfig: jest.fn(),
    };
    importSvc = { commit: jest.fn() };
    controller = new VolunteerFormImportController(prisma, parser, resolver, matcher, importSvc);
  });

  it('文本层为空的截图/扫描 PDF 返回明确提示', async () => {
    parser.extractPdfText.mockResolvedValue('   \n  ');

    await expect(
      controller.preview({ buffer: Buffer.from('pdf') }, { user: { id: 42 } }, undefined),
    ).rejects.toThrow(BadRequestException);
    await expect(
      controller.preview({ buffer: Buffer.from('pdf') }, { user: { id: 42 } }, undefined),
    ).rejects.toThrow('当前 PDF 没有可读取文字');

    expect(parser.parseFormText).not.toHaveBeenCalled();
  });

  it('从学生详情进入时优先锁定该学生, 用该学生科类和年份匹配批次', async () => {
    parser.extractPdfText.mockResolvedValue('valid text');
    parser.parseFormText.mockReturnValue({
      identity: { name: '张三' },
      batch: '专科批次',
      examTypeHint: undefined,
      volunteers: [
        { seq: 1, schoolCode: '5120', schoolName: '四川师范大学', groupCode: '101', majors: [], acceptAdjust: true },
      ],
    });
    prisma.studentProfile.findFirst.mockResolvedValue({
      id: 10,
      classInfo: '9班',
      examYear: 2026,
      examType: 'HISTORY',
      teacher: { userId: 42 },
      user: { realName: '张三' },
    });
    matcher.matchBatchConfig.mockResolvedValue({ id: 17, year: 2026, batch: '高职批' });
    resolver.resolveGroups.mockResolvedValue({
      groups: [{ seq: 1, status: 'matched' }],
    });

    const result = await controller.preview(
      { buffer: Buffer.from('pdf') },
      { user: { id: 42 } },
      { studentId: '10' },
    );

    expect(prisma.studentProfile.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 10, teacher: { userId: 42 } },
    }));
    expect(matcher.findCandidateStudents).not.toHaveBeenCalled();
    expect(matcher.matchBatchConfig).toHaveBeenCalledWith('专科批次', 'HISTORY', 2026, '四川');
    expect(result.candidateStudents).toEqual([{ id: 10, realName: '张三', classInfo: '9班' }]);
  });

  it('传入不属于当前老师的 studentId 时拒绝预览', async () => {
    parser.extractPdfText.mockResolvedValue('valid text');
    parser.parseFormText.mockReturnValue({
      identity: { name: '张三' },
      batch: '本科批次B段',
      examTypeHint: 'PHYSICS',
      volunteers: [
        { seq: 1, schoolCode: '5120', schoolName: '四川师范大学', groupCode: '101', majors: [], acceptAdjust: true },
      ],
    });
    prisma.studentProfile.findFirst.mockResolvedValue(null);

    await expect(
      controller.preview({ buffer: Buffer.from('pdf') }, { user: { id: 42 } }, { studentId: '10' }),
    ).rejects.toThrow(ForbiddenException);
  });
});
