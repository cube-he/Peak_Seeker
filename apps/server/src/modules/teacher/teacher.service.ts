import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class TeacherService {
  constructor(private prisma: PrismaService) {}

  /**
   * List all teachers with user info and student count.
   */
  async findAll() {
    const teachers = await this.prisma.teacherProfile.findMany({
      include: {
        user: {
          select: {
            id: true,
            username: true,
            realName: true,
            phone: true,
            createdAt: true,
          },
        },
        _count: {
          select: { students: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return teachers;
  }

  /**
   * Get a single teacher with user info and student count.
   */
  async findById(id: number) {
    const teacher = await this.prisma.teacherProfile.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            realName: true,
            phone: true,
            createdAt: true,
          },
        },
        _count: {
          select: { students: true },
        },
      },
    });

    if (!teacher) {
      throw new NotFoundException('教师不存在');
    }

    return teacher;
  }

  /**
   * Update teacher profile fields (school, isSupervisor).
   */
  async updateProfile(
    id: number,
    data: { school?: string; isSupervisor?: boolean },
  ) {
    const teacher = await this.prisma.teacherProfile.findUnique({
      where: { id },
    });

    if (!teacher) {
      throw new NotFoundException('教师不存在');
    }

    return this.prisma.teacherProfile.update({
      where: { id },
      data,
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
  }

  /**
   * Get student statistics grouped by status for a teacher.
   */
  async getStudentStats(teacherProfileId: number) {
    const students = await this.prisma.studentProfile.groupBy({
      by: ['status'],
      where: { teacherId: teacherProfileId },
      _count: { status: true },
    });

    const total = students.reduce((sum, s) => sum + s._count.status, 0);

    return {
      total,
      byStatus: students.map((s) => ({
        status: s.status,
        count: s._count.status,
      })),
    };
  }
}
