import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { StudentService } from './student.service';
import { PrismaService } from '../../prisma/prisma.service';
import { StudentStatus } from '@prisma/client';

// Mock bcrypt — keep hash deterministic for tests
jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed_password'),
}));

describe('StudentService', () => {
  let service: StudentService;
  let prisma: {
    user: {
      findUnique: jest.Mock;
      create: jest.Mock;
    };
    studentProfile: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      update: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      studentProfile: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StudentService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<StudentService>(StudentService);
  });

  // ── create ──────────────────────────────────────────────

  describe('create', () => {
    const dto = {
      username: 'student01',
      password: '123456',
      realName: '张三',
      phone: '13800000001',
      highSchool: '成都七中',
    };

    it('should create a student with User + StudentProfile', async () => {
      prisma.user.findUnique.mockResolvedValue(null); // no duplicate
      const created = {
        id: 1,
        username: 'student01',
        realName: '张三',
        studentProfile: {
          id: 10,
          teacherId: 5,
          highSchool: '成都七中',
          status: StudentStatus.ACTIVE,
        },
      };
      prisma.user.create.mockResolvedValue(created);

      const result = await service.create(5, dto);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { username: 'student01' },
      });
      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            username: 'student01',
            passwordHash: 'hashed_password',
            realName: '张三',
            studentProfile: expect.objectContaining({
              create: expect.objectContaining({
                teacherId: 5,
                highSchool: '成都七中',
                status: StudentStatus.ACTIVE,
              }),
            }),
          }),
        }),
      );
      expect(result).toEqual(created);
    });

    it('should throw ConflictException on duplicate username', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 99 });

      await expect(service.create(5, dto)).rejects.toThrow(ConflictException);
    });
  });

  // ── findByTeacher ───────────────────────────────────────

  describe('findByTeacher', () => {
    it('should return paginated results for a teacher', async () => {
      const profiles = [{ id: 1 }, { id: 2 }];
      prisma.studentProfile.findMany.mockResolvedValue(profiles);
      prisma.studentProfile.count.mockResolvedValue(2);

      const result = await service.findByTeacher(5, {
        page: 1,
        pageSize: 20,
      });

      expect(result).toEqual({
        data: profiles,
        total: 2,
        page: 1,
        pageSize: 20,
      });

      // Verify teacher filter was applied
      expect(prisma.studentProfile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ teacherId: 5 }),
        }),
      );
    });

    it('should filter by status and keyword', async () => {
      prisma.studentProfile.findMany.mockResolvedValue([]);
      prisma.studentProfile.count.mockResolvedValue(0);

      await service.findByTeacher(5, {
        status: StudentStatus.ACTIVE,
        keyword: '张',
        page: 1,
        pageSize: 10,
      });

      expect(prisma.studentProfile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            teacherId: 5,
            status: StudentStatus.ACTIVE,
            user: {
              OR: [
                { realName: { contains: '张' } },
                { username: { contains: '张' } },
              ],
            },
          }),
        }),
      );
    });
  });

  // ── updateProfile ───────────────────────────────────────

  describe('updateProfile', () => {
    it('should update profile and increment dataVersion', async () => {
      const current = {
        id: 10,
        dataVersion: 3,
        status: StudentStatus.ACTIVE,
        highSchool: '成都七中',
        examYear: null,
        examType: null,
        firstChoice: null,
        totalScore: null,
        priorityMode: null,
        careerPlan: null,
      };
      prisma.studentProfile.findUnique.mockResolvedValue(current);

      const updated = { ...current, city: '成都', dataVersion: 4 };
      prisma.studentProfile.update.mockResolvedValue(updated);

      const result = await service.updateProfile(10, {
        dataVersion: 3,
        city: '成都',
      });

      expect(prisma.studentProfile.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 10 },
          data: expect.objectContaining({
            city: '成都',
            dataVersion: { increment: 1 },
          }),
        }),
      );
      expect(result).toHaveProperty('infoCompleteness');
    });

    it('should throw ConflictException on version mismatch', async () => {
      prisma.studentProfile.findUnique.mockResolvedValue({
        id: 10,
        dataVersion: 5,
      });

      await expect(
        service.updateProfile(10, { dataVersion: 3, city: '成都' }),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw NotFoundException if student does not exist', async () => {
      prisma.studentProfile.findUnique.mockResolvedValue(null);

      await expect(
        service.updateProfile(999, { dataVersion: 0 }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── calculateCompleteness ───────────────────────────────

  describe('calculateCompleteness', () => {
    it('should return 0 for empty profile', () => {
      expect(service.calculateCompleteness({})).toBe(0);
    });

    it('should return 70 when all required fields are filled', () => {
      const profile = {
        highSchool: '成都七中',
        examYear: 2026,
        examType: 'PHYSICS',
        firstChoice: '物理',
        totalScore: 600,
        priorityMode: 'BALANCED',
        careerPlan: 'POSTGRADUATE',
      };
      expect(service.calculateCompleteness(profile)).toBe(70);
    });

    it('should return 100 when all fields are filled', () => {
      const profile = {
        // Required
        highSchool: '成都七中',
        examYear: 2026,
        examType: 'PHYSICS',
        firstChoice: '物理',
        totalScore: 600,
        priorityMode: 'BALANCED',
        careerPlan: 'POSTGRADUATE',
        // Optional
        city: '成都',
        classInfo: '3班',
        parentPhone: '13800000000',
        scoreChinese: 120,
        scoreMath: 130,
        scoreEnglish: 140,
        scoreFirstChoice: 90,
        scoreSub1: 80,
        scoreSub2: 70,
        provincialRank: 1000,
        careerDirection: '计算机',
        preferredProvinces: ['四川'],
        preferredMajors: ['计算机'],
        preferredUniversityTypes: ['985'],
      };
      expect(service.calculateCompleteness(profile)).toBe(100);
    });
  });
});
