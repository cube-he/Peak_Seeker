import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

// 状态优先级，用于防止回退
const STATUS_PRIORITY: Record<string, number> = {
  estimated: 0,
  countdown: 1,
  filling: 2,
  available: 3,
  in_progress: 4,
  collecting_1: 5,
  collecting_2: 6,
  collecting_3: 7,
  completed: 10,
};

@Injectable()
export class TimelineService {
  private readonly logger = new Logger(TimelineService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getTimeline(year: number) {
    return this.prisma.timelineEvent.findMany({
      where: { year },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async updateStatus(
    key: string,
    year: number,
    newStatus: string,
    sourceUrl?: string,
    detail?: Record<string, unknown>,
  ): Promise<boolean> {
    const event = await this.prisma.timelineEvent.findUnique({
      where: { key_year: { key, year } },
    });

    if (!event) {
      this.logger.warn(`TimelineEvent not found: key=${key}, year=${year}`);
      return false;
    }

    const currentPriority = STATUS_PRIORITY[event.status] ?? 0;
    const newPriority = STATUS_PRIORITY[newStatus] ?? 0;

    if (newPriority <= currentPriority) {
      this.logger.debug(
        `Skipping status update: ${key} ${event.status}(${currentPriority}) -> ${newStatus}(${newPriority})`,
      );
      return false;
    }

    await this.prisma.timelineEvent.update({
      where: { key_year: { key, year } },
      data: {
        status: newStatus,
        ...(sourceUrl && { sourceUrl }),
        ...(detail && { detail: detail as Prisma.InputJsonValue }),
      },
    });

    this.logger.log(`Timeline updated: ${key} -> ${newStatus}`);
    return true;
  }

  async completeAll(year: number, sourceUrl?: string): Promise<void> {
    await this.prisma.timelineEvent.updateMany({
      where: { year, status: { not: 'completed' } },
      data: {
        status: 'completed',
        ...(sourceUrl && { sourceUrl }),
      },
    });
    this.logger.log(`All timeline events for ${year} marked as completed`);
  }

  async seedYear(year: number): Promise<void> {
    // 节点设计参考 2025 年四川录取批次结构表 + sceea.cn 实际通知粒度。
    // 志愿填报截止时间(volunteer_deadline_*)来源:四川省教育考试院 2026 年通知。
    const events = [
      { key: 'gaokao', name: '高考', status: 'countdown', sortOrder: 1,
        startDate: new Date(`${year}-06-07`), endDate: new Date(`${year}-06-09`), year },
      { key: 'score_query', name: '出分/分数线', status: 'estimated', sortOrder: 2,
        startDate: new Date(`${year}-06-22`), endDate: new Date(`${year}-06-25`), year },
      { key: 'volunteer_filling', name: '志愿填报', status: 'estimated', sortOrder: 3,
        startDate: new Date(`${year}-06-24`), endDate: new Date(`${year}-07-02`), year },
      { key: 'volunteer_deadline_early', name: '本科提前批志愿截止', status: 'estimated', sortOrder: 4,
        startDate: new Date(`${year}-06-28T17:00:00+08:00`), endDate: null, year },
      { key: 'volunteer_deadline_regular', name: '本科批志愿截止', status: 'estimated', sortOrder: 5,
        startDate: new Date(`${year}-07-01T17:00:00+08:00`), endDate: null, year },
      { key: 'volunteer_deadline_vocational', name: '专科批志愿截止', status: 'estimated', sortOrder: 6,
        startDate: new Date(`${year}-07-05T17:00:00+08:00`), endDate: null, year },
      { key: 'early_batch_a', name: '本科提前批 A 段', status: 'estimated', sortOrder: 7,
        startDate: new Date(`${year}-07-07`), endDate: new Date(`${year}-07-15`), year },
      { key: 'early_batch_b', name: '本科提前批 B 段', status: 'estimated', sortOrder: 8,
        startDate: new Date(`${year}-07-16`), endDate: new Date(`${year}-07-20`), year },
      { key: 'regular_batch_a', name: '本科批 A 段', status: 'estimated', sortOrder: 9,
        startDate: new Date(`${year}-07-20`), endDate: new Date(`${year}-07-25`), year },
      { key: 'regular_batch_b', name: '本科批 B 段', status: 'estimated', sortOrder: 10,
        startDate: new Date(`${year}-07-26`), endDate: new Date(`${year}-08-05`), year },
      { key: 'vocational_early', name: '高职专科提前批', status: 'estimated', sortOrder: 11,
        startDate: new Date(`${year}-08-06`), endDate: new Date(`${year}-08-09`), year },
      { key: 'vocational_batch', name: '高职专科批', status: 'estimated', sortOrder: 12,
        startDate: new Date(`${year}-08-10`), endDate: new Date(`${year}-08-14`), year },
      { key: 'admission_end', name: '录取结束', status: 'estimated', sortOrder: 13,
        startDate: new Date(`${year}-08-15`), endDate: null, year },
    ];

    // 逐节点 upsert:新节点 create,已存在节点只 update 日历字段(不含 status,
    // 避免覆盖 updateStatus() 已推进的状态)。复合唯一键为 (key, year)。
    for (const event of events) {
      await this.prisma.timelineEvent.upsert({
        where: { key_year: { key: event.key, year } },
        create: event,
        update: {
          name: event.name,
          sortOrder: event.sortOrder,
          startDate: event.startDate,
          endDate: event.endDate,
        },
      });
    }
    this.logger.log(`Seeded/synced timeline for ${year}: ${events.length} events`);
  }
}
