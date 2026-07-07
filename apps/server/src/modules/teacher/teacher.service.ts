import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  sanitizeTierThresholds,
  DEFAULT_TIER_THRESHOLDS,
} from '../plan-candidate/gradient-calculator';

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
   * Update teacher profile fields (school, isSupervisor, isPrimarySupervisor).
   */
  async updateProfile(
    id: number,
    data: { school?: string; isSupervisor?: boolean; isPrimarySupervisor?: boolean },
  ) {
    const teacher = await this.prisma.teacherProfile.findUnique({
      where: { id },
    });

    if (!teacher) {
      throw new NotFoundException('教师不存在');
    }

    const updateData = { ...data };
    if (updateData.isPrimarySupervisor === true) {
      updateData.isSupervisor = true;
    }
    if (updateData.isSupervisor === false) {
      updateData.isPrimarySupervisor = false;
    }

    return this.prisma.$transaction(async (tx) => {
      if (updateData.isPrimarySupervisor === true) {
        await tx.teacherProfile.updateMany({
          where: { id: { not: id } },
          data: { isPrimarySupervisor: false },
        });
      }

      return tx.teacherProfile.update({
        where: { id },
        data: updateData,
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

  /**
   * 当前老师的"8段动态梯度"分界阈值: 未设/非法 → 返回系统默认 + isDefault=true。
   * 同时回 default 供前端"恢复默认"。
   */
  async getGradientConfig(teacherProfileId: number) {
    const t = await this.prisma.teacherProfile.findUnique({
      where: { id: teacherProfileId },
      select: { gradientThresholds: true },
    });
    const custom = sanitizeTierThresholds(t?.gradientThresholds);
    return {
      thresholds: custom ?? DEFAULT_TIER_THRESHOLDS,
      isDefault: custom == null,
      default: DEFAULT_TIER_THRESHOLDS,
    };
  }

  /**
   * 保存当前老师的梯度阈值; 7 项齐全 + 严格单调递增才接受, 否则 400。
   * "恢复默认" = 前端把默认值灌进来再存(默认值本身合法), 无需单独清空逻辑。
   */
  async updateGradientConfig(teacherProfileId: number, raw: unknown) {
    const clean = sanitizeTierThresholds(raw);
    if (!clean) {
      throw new BadRequestException(
        '梯度阈值非法: 需 7 项(够不着/冲/小冲/稳/稳保/保/强保)齐全, 且严格单调递增。',
      );
    }
    await this.prisma.teacherProfile.update({
      where: { id: teacherProfileId },
      data: { gradientThresholds: clean as any },
    });
    return { thresholds: clean, isDefault: false, default: DEFAULT_TIER_THRESHOLDS };
  }
}
