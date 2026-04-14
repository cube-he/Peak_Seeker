import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentProfileDto } from './dto/update-student-profile.dto';
import { QueryStudentDto } from './dto/query-student.dto';
import { Role, StudentStatus, Prisma } from '@prisma/client';

@Injectable()
export class StudentService {
  constructor(private prisma: PrismaService) {}

  /**
   * Create a student account (User + StudentProfile) assigned to a teacher.
   */
  async create(teacherProfileId: number, dto: CreateStudentDto) {
    // Check username uniqueness
    const existing = await this.prisma.user.findUnique({
      where: { username: dto.username },
    });
    if (existing) {
      throw new ConflictException('用户名已存在');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    return this.prisma.user.create({
      data: {
        username: dto.username,
        passwordHash,
        realName: dto.realName,
        phone: dto.phone,
        gender: dto.gender,
        ethnicity: dto.ethnicity,
        role: Role.STUDENT,
        studentProfile: {
          create: {
            teacherId: teacherProfileId,
            highSchool: dto.highSchool,
            classInfo: dto.classInfo,
            city: dto.city,
            examYear: dto.examYear,
            status: StudentStatus.ACTIVE,
          },
        },
      },
      include: {
        studentProfile: true,
      },
    });
  }

  /**
   * Paginated query for students belonging to a teacher.
   * Admin callers pass teacherProfileId = undefined to see all.
   */
  async findByTeacher(
    teacherProfileId: number | undefined,
    query: QueryStudentDto,
  ) {
    const { status, keyword, page = 1, pageSize = 20 } = query;

    const where: Prisma.StudentProfileWhereInput = {};

    if (teacherProfileId !== undefined) {
      where.teacherId = teacherProfileId;
    }

    if (status) {
      where.status = status;
    }

    if (keyword) {
      where.user = {
        OR: [
          { realName: { contains: keyword } },
          { username: { contains: keyword } },
        ],
      };
    }

    const [data, total] = await Promise.all([
      this.prisma.studentProfile.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              username: true,
              realName: true,
              phone: true,
              gender: true,
              ethnicity: true,
              createdAt: true,
            },
          },
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.studentProfile.count({ where }),
    ]);

    return { data, total, page, pageSize };
  }

  /**
   * Get a single student profile with user info and teacher info.
   */
  async findById(id: number) {
    const profile = await this.prisma.studentProfile.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            realName: true,
            phone: true,
            gender: true,
            ethnicity: true,
            createdAt: true,
          },
        },
        teacher: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                realName: true,
              },
            },
          },
        },
      },
    });

    if (!profile) {
      throw new NotFoundException('学生不存在');
    }

    return profile;
  }

  /**
   * Update student profile with optimistic locking.
   * Automatically calculates infoCompleteness and may upgrade status.
   */
  async updateProfile(id: number, dto: UpdateStudentProfileDto) {
    const { dataVersion, ...updateData } = dto;

    // Optimistic lock: only update if dataVersion matches
    const current = await this.prisma.studentProfile.findUnique({
      where: { id },
    });

    if (!current) {
      throw new NotFoundException('学生不存在');
    }

    if (current.dataVersion !== dataVersion) {
      throw new ConflictException(
        '数据已被其他人修改，请刷新后重试',
      );
    }

    // Merge current + incoming to calculate completeness on the resulting state
    const merged = { ...current, ...updateData };
    const completeness = this.calculateCompleteness(merged);

    // Auto-update status to ACTIVE if info completeness >= 80% and currently ACTIVE
    const statusUpdate: Record<string, any> = {};
    if (completeness >= 80 && current.status === StudentStatus.ACTIVE) {
      // Keep ACTIVE — the status already reflects a valid student
    }

    const updated = await this.prisma.studentProfile.update({
      where: { id },
      data: {
        ...updateData,
        ...statusUpdate,
        dataVersion: { increment: 1 },
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            realName: true,
          },
        },
      },
    });

    return { ...updated, infoCompleteness: completeness };
  }

  /**
   * Reassign a student to a different teacher.
   */
  async assignTeacher(studentId: number, teacherProfileId: number) {
    const profile = await this.prisma.studentProfile.findUnique({
      where: { id: studentId },
    });

    if (!profile) {
      throw new NotFoundException('学生不存在');
    }

    return this.prisma.studentProfile.update({
      where: { id: studentId },
      data: { teacherId: teacherProfileId },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            realName: true,
          },
        },
        teacher: {
          include: {
            user: {
              select: { id: true, realName: true },
            },
          },
        },
      },
    });
  }

  /**
   * Calculate profile completeness as a percentage.
   * Required fields: highSchool, examYear, examType, firstChoice, totalScore, priorityMode, careerPlan
   * Optional fields contribute the remaining weight.
   */
  calculateCompleteness(profile: Record<string, any>): number {
    const requiredFields = [
      'highSchool',
      'examYear',
      'examType',
      'firstChoice',
      'totalScore',
      'priorityMode',
      'careerPlan',
    ];

    const optionalFields = [
      'city',
      'classInfo',
      'parentPhone',
      'scoreChinese',
      'scoreMath',
      'scoreEnglish',
      'scoreFirstChoice',
      'scoreSub1',
      'scoreSub2',
      'provincialRank',
      'careerDirection',
      'preferredProvinces',
      'preferredMajors',
      'preferredUniversityTypes',
    ];

    // Required fields account for 70% of completeness
    const requiredWeight = 70;
    const requiredFilled = requiredFields.filter(
      (f) => profile[f] !== null && profile[f] !== undefined,
    ).length;
    const requiredScore =
      (requiredFilled / requiredFields.length) * requiredWeight;

    // Optional fields account for 30% of completeness
    const optionalWeight = 30;
    const optionalFilled = optionalFields.filter(
      (f) => profile[f] !== null && profile[f] !== undefined,
    ).length;
    const optionalScore =
      (optionalFilled / optionalFields.length) * optionalWeight;

    return Math.round(requiredScore + optionalScore);
  }
}
