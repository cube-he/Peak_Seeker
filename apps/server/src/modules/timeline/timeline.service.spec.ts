import { TimelineService } from './timeline.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('TimelineService', () => {
  let service: TimelineService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      timelineEvent: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        count: jest.fn(),
        createMany: jest.fn(),
        upsert: jest.fn(),
      },
    };
    service = new TimelineService(prisma as unknown as PrismaService);
  });

  describe('getTimeline', () => {
    it('should return events ordered by sortOrder', async () => {
      const mockEvents = [
        { key: 'gaokao', sortOrder: 1 },
        { key: 'score_query', sortOrder: 2 },
      ];
      prisma.timelineEvent.findMany.mockResolvedValue(mockEvents);

      const result = await service.getTimeline(2026);

      expect(prisma.timelineEvent.findMany).toHaveBeenCalledWith({
        where: { year: 2026 },
        orderBy: { sortOrder: 'asc' },
      });
      expect(result).toEqual(mockEvents);
    });
  });

  describe('updateStatus', () => {
    it('should update when new status has higher priority', async () => {
      prisma.timelineEvent.findUnique.mockResolvedValue({
        key: 'early_batch_a',
        status: 'estimated',
      });
      prisma.timelineEvent.update.mockResolvedValue({});

      const result = await service.updateStatus('early_batch_a', 2026, 'in_progress', 'https://example.com');

      expect(result).toBe(true);
      expect(prisma.timelineEvent.update).toHaveBeenCalled();
    });

    it('should NOT update when new status has lower/equal priority', async () => {
      prisma.timelineEvent.findUnique.mockResolvedValue({
        key: 'early_batch_a',
        status: 'in_progress',
      });

      const result = await service.updateStatus('early_batch_a', 2026, 'estimated');

      expect(result).toBe(false);
      expect(prisma.timelineEvent.update).not.toHaveBeenCalled();
    });

    it('should return false when event not found', async () => {
      prisma.timelineEvent.findUnique.mockResolvedValue(null);

      const result = await service.updateStatus('nonexistent', 2026, 'completed');

      expect(result).toBe(false);
    });
  });

  describe('seedYear', () => {
    it('should upsert 13 events including the 3 volunteer-deadline nodes', async () => {
      prisma.timelineEvent.upsert.mockResolvedValue({});

      await service.seedYear(2026);

      expect(prisma.timelineEvent.upsert).toHaveBeenCalledTimes(13);
      const keys = prisma.timelineEvent.upsert.mock.calls.map(
        (c: any[]) => c[0].where.key_year.key,
      );
      expect(keys).toEqual(
        expect.arrayContaining([
          'volunteer_deadline_early',
          'volunteer_deadline_regular',
          'volunteer_deadline_vocational',
        ]),
      );
    });

    it('should not overwrite status on existing events (update payload omits status)', async () => {
      prisma.timelineEvent.upsert.mockResolvedValue({});

      await service.seedYear(2026);

      for (const call of prisma.timelineEvent.upsert.mock.calls) {
        expect(call[0].update).not.toHaveProperty('status');
      }
    });
  });
});
