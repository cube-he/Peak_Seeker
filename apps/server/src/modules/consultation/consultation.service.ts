import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateConsultationDto } from './dto/create-consultation.dto';
import { UpdateConsultationDto } from './dto/update-consultation.dto';
import { RequestConsultationDto } from './dto/request-consultation.dto';

@Injectable()
export class ConsultationService {
  constructor(private prisma: PrismaService) {}

  private async resolveTeacherId(userId: number): Promise<number> {
    const teacher = await this.prisma.teacherProfile.findFirst({
      where: { userId },
    });
    if (!teacher) throw new ForbiddenException('当前用户没有老师档案');
    return teacher.id;
  }

  async create(userId: number, dto: CreateConsultationDto) {
    const teacherId = await this.resolveTeacherId(userId);
    return this.prisma.consultationAppointment.create({
      data: {
        studentId: dto.studentId,
        teacherId,
        scheduledAt: new Date(dto.scheduledAt),
        durationEst: dto.durationEst,
        channel: dto.channel,
        purpose: dto.purpose,
        notes: dto.notes,
        status: 'scheduled',
      },
    });
  }

  async update(userId: number, id: number, dto: UpdateConsultationDto) {
    const teacherId = await this.resolveTeacherId(userId);
    const appt = await this.prisma.consultationAppointment.findUnique({ where: { id } });
    if (!appt) throw new NotFoundException('预约不存在');
    if (appt.teacherId !== teacherId) throw new ForbiddenException('无权修改该预约');

    return this.prisma.consultationAppointment.update({
      where: { id },
      data: {
        ...(dto.scheduledAt && { scheduledAt: new Date(dto.scheduledAt) }),
        ...(dto.durationEst !== undefined && { durationEst: dto.durationEst }),
        ...(dto.channel && { channel: dto.channel }),
        ...(dto.purpose !== undefined && { purpose: dto.purpose }),
        ...(dto.status && { status: dto.status }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
      },
    });
  }

  async start(userId: number, id: number) {
    const teacherId = await this.resolveTeacherId(userId);
    const appt = await this.prisma.consultationAppointment.findUnique({ where: { id } });
    if (!appt) throw new NotFoundException('预约不存在');
    if (appt.teacherId !== teacherId) throw new ForbiddenException('无权操作');

    return this.prisma.consultationAppointment.update({
      where: { id },
      data: {
        status: 'in_progress',
        startedAt: new Date(),
      },
    });
  }

  async end(userId: number, id: number, notes?: string) {
    const teacherId = await this.resolveTeacherId(userId);
    const appt = await this.prisma.consultationAppointment.findUnique({ where: { id } });
    if (!appt) throw new NotFoundException('预约不存在');
    if (appt.teacherId !== teacherId) throw new ForbiddenException('无权操作');

    const endedAt = new Date();
    const durationAct = appt.startedAt
      ? Math.round((endedAt.getTime() - appt.startedAt.getTime()) / 60000)
      : null;

    return this.prisma.consultationAppointment.update({
      where: { id },
      data: {
        status: 'completed',
        endedAt,
        durationAct,
        ...(notes !== undefined && { notes }),
      },
    });
  }

  async listByStudent(userId: number, studentId: number) {
    const teacherId = await this.resolveTeacherId(userId);
    return this.prisma.consultationAppointment.findMany({
      where: { studentId, teacherId },
      orderBy: { scheduledAt: 'desc' },
    });
  }

  async listToday(userId: number) {
    const teacherId = await this.resolveTeacherId(userId);
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(startOfDay.getTime() + 86_400_000);

    return this.prisma.consultationAppointment.findMany({
      where: {
        teacherId,
        scheduledAt: {
          gte: startOfDay,
          lt: endOfDay,
        },
      },
      include: {
        student: {
          include: {
            user: { select: { realName: true, username: true } },
          },
        },
      },
      orderBy: { scheduledAt: 'asc' },
    });
  }

  async requestByParent(userId: number, dto: RequestConsultationDto) {
    const studentProfile = await this.prisma.studentProfile.findFirst({
      where: { userId },
    });
    if (!studentProfile) throw new ForbiddenException('当前用户没有学生档案');
    if (!studentProfile.teacherId) throw new ForbiddenException('该学生未关联老师,无法申请预约');

    return this.prisma.consultationAppointment.create({
      data: {
        studentId: studentProfile.id,
        teacherId: studentProfile.teacherId,
        scheduledAt: new Date(dto.scheduledAt),
        durationEst: dto.durationEst,
        channel: dto.channel,
        purpose: dto.purpose,
        notes: dto.notes,
        status: 'requested',
        createdByActor: 'student',
      },
    });
  }

  async confirmRequest(userId: number, id: number) {
    const teacherId = await this.resolveTeacherId(userId);
    const appt = await this.prisma.consultationAppointment.findUnique({ where: { id } });
    if (!appt) throw new NotFoundException('预约不存在');
    if (appt.teacherId !== teacherId) throw new ForbiddenException('无权操作');
    if (appt.status !== 'requested') throw new ForbiddenException('当前状态不可确认');

    return this.prisma.consultationAppointment.update({
      where: { id },
      data: { status: 'scheduled' },
    });
  }

  async rejectRequest(userId: number, id: number, reason?: string) {
    const teacherId = await this.resolveTeacherId(userId);
    const appt = await this.prisma.consultationAppointment.findUnique({ where: { id } });
    if (!appt) throw new NotFoundException('预约不存在');
    if (appt.teacherId !== teacherId) throw new ForbiddenException('无权操作');

    return this.prisma.consultationAppointment.update({
      where: { id },
      data: {
        status: 'cancelled',
        notes: reason ? `[已拒绝] ${reason}` : `[已拒绝]`,
      },
    });
  }

  async listPendingRequests(userId: number) {
    const teacherId = await this.resolveTeacherId(userId);
    return this.prisma.consultationAppointment.findMany({
      where: { teacherId, status: 'requested' },
      include: {
        student: {
          include: { user: { select: { realName: true, username: true } } },
        },
      },
      orderBy: { scheduledAt: 'asc' },
    });
  }

  async listMine(userId: number) {
    const studentProfile = await this.prisma.studentProfile.findFirst({
      where: { userId },
    });
    if (!studentProfile) throw new ForbiddenException('当前用户没有学生档案');

    return this.prisma.consultationAppointment.findMany({
      where: { studentId: studentProfile.id },
      orderBy: { scheduledAt: 'desc' },
    });
  }

  async remove(userId: number, id: number) {
    const teacherId = await this.resolveTeacherId(userId);
    const appt = await this.prisma.consultationAppointment.findUnique({ where: { id } });
    if (!appt) throw new NotFoundException('预约不存在');
    if (appt.teacherId !== teacherId) throw new ForbiddenException('无权删除');

    await this.prisma.consultationAppointment.delete({ where: { id } });
    return { ok: true };
  }
}
