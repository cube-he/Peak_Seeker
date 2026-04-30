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
    const existing = await this.prisma.timelineEvent.count({ where: { year } });
    if (existing > 0) {
      this.logger.debug(`Timeline for ${year} already exists, skipping seed`);
      return;
    }

    const events = [
      {
        key: 'gaokao',
        name: '高考',
        status: 'countdown',
        sortOrder: 1,
        startDate: new Date(`${year}-06-07`),
        endDate: new Date(`${year}-06-09`),
        year,
      },
      {
        key: 'score_query',
        name: '成绩查询',
        status: 'estimated',
        sortOrder: 2,
        startDate: new Date(`${year}-06-25`),
        endDate: null,
        year,
      },
      {
        key: 'early_batch',
        name: '本科提前批',
        status: 'estimated',
        sortOrder: 3,
        startDate: new Date(`${year}-07-07`),
        endDate: new Date(`${year}-07-18`),
        year,
      },
      {
        key: 'regular_batch',
        name: '本科批',
        status: 'estimated',
        sortOrder: 4,
        startDate: new Date(`${year}-07-21`),
        endDate: new Date(`${year}-08-04`),
        year,
      },
      {
        key: 'vocational_batch',
        name: '专科批',
        status: 'estimated',
        sortOrder: 5,
        startDate: new Date(`${year}-08-06`),
        endDate: new Date(`${year}-08-15`),
        year,
      },
    ];

    await this.prisma.timelineEvent.createMany({ data: events });
    this.logger.log(`Seeded timeline for ${year} with ${events.length} events`);
  }
}
