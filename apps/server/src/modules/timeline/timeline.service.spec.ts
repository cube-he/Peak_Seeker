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
    it('should skip if data already exists', async () => {
      prisma.timelineEvent.count.mockResolvedValue(10);

      await service.seedYear(2026);

      expect(prisma.timelineEvent.createMany).not.toHaveBeenCalled();
    });

    it('should create 10 events for a new year', async () => {
      prisma.timelineEvent.count.mockResolvedValue(0);
      prisma.timelineEvent.createMany.mockResolvedValue({ count: 10 });

      await service.seedYear(2026);

      expect(prisma.timelineEvent.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({ key: 'gaokao', status: 'countdown', sortOrder: 1 }),
          expect.objectContaining({ key: 'early_batch_a', sortOrder: 4 }),
          expect.objectContaining({ key: 'early_batch_b', sortOrder: 5 }),
          expect.objectContaining({ key: 'regular_batch_a', sortOrder: 6 }),
          expect.objectContaining({ key: 'regular_batch_b', sortOrder: 7 }),
          expect.objectContaining({ key: 'vocational_early', sortOrder: 8 }),
          expect.objectContaining({ key: 'vocational_batch', sortOrder: 9 }),
          expect.objectContaining({ key: 'admission_end', sortOrder: 10 }),
        ]),
      });
      const callArg = prisma.timelineEvent.createMany.mock.calls[0][0];
      expect(callArg.data).toHaveLength(10);
    });
  });
});
