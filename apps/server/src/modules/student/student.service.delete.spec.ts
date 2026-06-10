import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { StudentService } from './student.service';
import { ProgressService } from './progress.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ScoreSegmentService } from '../score-segment/score-segment.service';

describe('StudentService.deleteStudentPermanently', () => {
  let service: StudentService;
  let prisma: any;
  let tx: any;

  beforeEach(async () => {
    tx = {
      volunteerPlan: { deleteMany: jest.fn() },
      searchHistory: { deleteMany: jest.fn() },
      favorite: { deleteMany: jest.fn() },
      comparison: { deleteMany: jest.fn() },
      order: { deleteMany: jest.fn() },
      notification: { deleteMany: jest.fn() },
      auditLog: { deleteMany: jest.fn() },
      studentProfile: { delete: jest.fn() },
      user: { delete: jest.fn() },
    };
    prisma = {
      studentProfile: { findUnique: jest.fn() },
      $transaction: jest.fn().mockImplementation((fn: any) => fn(tx)),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        StudentService,
        { provide: PrismaService, useValue: prisma },
        { provide: ProgressService, useValue: {} },
        { provide: ScoreSegmentService, useValue: {} },
      ],
    }).compile();
    service = moduleRef.get<StudentService>(StudentService);
  });

  const ownerTeacher = {
    id: 7,
    role: 'TEACHER',
    teacherProfileId: 5,
    isSupervisor: false,
  } as any;

  it('学生不存在 → NotFoundException', async () => {
    prisma.studentProfile.findUnique.mockResolvedValue(null);
    await expect(service.deleteStudentPermanently(99, ownerTeacher)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('不是自己带的学生且非管理员 → ForbiddenException', async () => {
    prisma.studentProfile.findUnique.mockResolvedValue({
      id: 1,
      userId: 20,
      teacherId: 999,
    });
    await expect(service.deleteStudentPermanently(1, ownerTeacher)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('自己带的学生 → 事务内删方案/档案/登录账号', async () => {
    prisma.studentProfile.findUnique.mockResolvedValue({
      id: 1,
      userId: 20,
      teacherId: 5,
    });

    await service.deleteStudentPermanently(1, ownerTeacher);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.volunteerPlan.deleteMany).toHaveBeenCalledWith({ where: { studentId: 1 } });
    expect(tx.favorite.deleteMany).toHaveBeenCalledWith({ where: { userId: 20 } });
    expect(tx.notification.deleteMany).toHaveBeenCalledWith({ where: { userId: 20 } });
    expect(tx.studentProfile.delete).toHaveBeenCalledWith({ where: { id: 1 } });
    expect(tx.user.delete).toHaveBeenCalledWith({ where: { id: 20 } });
  });

  it('管理员可删任意学生', async () => {
    prisma.studentProfile.findUnique.mockResolvedValue({
      id: 2,
      userId: 30,
      teacherId: 999,
    });
    const admin = { id: 1, role: 'ADMIN' } as any;

    await expect(service.deleteStudentPermanently(2, admin)).resolves.toBeDefined();
    expect(tx.user.delete).toHaveBeenCalledWith({ where: { id: 30 } });
  });
});
