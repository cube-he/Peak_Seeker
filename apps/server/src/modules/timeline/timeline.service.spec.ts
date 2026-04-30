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
        key: 'early_batch',
        status: 'estimated',
      });
      prisma.timelineEvent.update.mockResolvedValue({});

      const result = await service.updateStatus('early_batch', 2026, 'in_progress', 'https://example.com');

      expect(result).toBe(true);
      expect(prisma.timelineEvent.update).toHaveBeenCalled();
    });

    it('should NOT update when new status has lower/equal priority', async () => {
      prisma.timelineEvent.findUnique.mockResolvedValue({
        key: 'early_batch',
        status: 'in_progress',
      });

      const result = await service.updateStatus('early_batch', 2026, 'estimated');

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
      prisma.timelineEvent.count.mockResolvedValue(5);

      await service.seedYear(2026);

      expect(prisma.timelineEvent.createMany).not.toHaveBeenCalled();
    });

    it('should create 5 events for a new year', async () => {
      prisma.timelineEvent.count.mockResolvedValue(0);
      prisma.timelineEvent.createMany.mockResolvedValue({ count: 5 });

      await service.seedYear(2026);

      expect(prisma.timelineEvent.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({ key: 'gaokao', status: 'countdown', sortOrder: 1 }),
          expect.objectContaining({ key: 'vocational_batch', status: 'estimated', sortOrder: 5 }),
        ]),
      });
    });
  });
});
