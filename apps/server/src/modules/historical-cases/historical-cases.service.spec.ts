import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { HistoricalCasesService } from './historical-cases.service';

describe('HistoricalCasesService attachment access', () => {
  const attachment = {
    id: 7,
    studentId: 10,
    storagePath: 'historical/10/admission_proof.png',
    student: {
      id: 10,
      userId: 100,
      isArchived: true,
      teacher: {
        userId: 200,
        user: { id: 200 },
      },
      user: { id: 100 },
    },
  };
  let prisma: {
    studentAttachment: {
      findUnique: jest.Mock;
    };
  };
  let service: HistoricalCasesService;

  beforeEach(() => {
    prisma = {
      studentAttachment: {
        findUnique: jest.fn().mockResolvedValue(attachment),
      },
    };
    service = new HistoricalCasesService(prisma as any);
  });

  it('forbids a student from downloading another student attachment', async () => {
    await expect(
      service.getAttachmentForDownload(7, {
        id: 101,
        username: 'other-student',
        role: 'STUDENT',
        studentProfileId: 11,
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('allows the owning student to download their own attachment', async () => {
    await expect(
      service.getAttachmentForDownload(7, {
        id: 100,
        username: 'owner-student',
        role: 'STUDENT',
        studentProfileId: 10,
      }),
    ).resolves.toBe(attachment);
  });

  it('keeps historical attachment access available to teachers', async () => {
    await expect(
      service.getAttachmentForDownload(7, {
        id: 201,
        username: 'other-teacher',
        role: 'TEACHER',
        teacherProfileId: 21,
      }),
    ).resolves.toBe(attachment);
  });

  it('keeps historical attachment access available to administrators', async () => {
    await expect(
      service.getAttachmentForDownload(7, {
        id: 1,
        username: 'admin',
        role: 'ADMIN',
      }),
    ).resolves.toBe(attachment);
  });

  it('does not expose an active student attachment through the historical endpoint', async () => {
    prisma.studentAttachment.findUnique.mockResolvedValue({
      ...attachment,
      student: { ...attachment.student, isArchived: false },
    });

    await expect(
      service.getAttachmentForDownload(7, {
        id: 201,
        username: 'other-teacher',
        role: 'TEACHER',
        teacherProfileId: 21,
      }),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('HistoricalCasesService stats', () => {
  it('returns only exam years that exist in historical cases', async () => {
    const prisma = {
      studentProfile: {
        findMany: jest.fn().mockResolvedValue([
          {
            examYear: 2026,
            examType: 'PHYSICS',
            admissionResult: {
              batchName: '本科批',
              scoreDiff: null,
              admittedMinScore: null,
              admittedUniName: '测试大学',
            },
          },
          {
            examYear: 2024,
            examType: 'HISTORY',
            admissionResult: {
              batchName: '本科批',
              scoreDiff: null,
              admittedMinScore: null,
              admittedUniName: '测试大学',
            },
          },
          {
            examYear: null,
            examType: null,
            admissionResult: null,
          },
        ]),
      },
    };
    const service = new HistoricalCasesService(prisma as any);

    const stats = await service.stats();

    expect(stats.byExamYear).toEqual({ '2026': 1, '2024': 1 });
  });
});
