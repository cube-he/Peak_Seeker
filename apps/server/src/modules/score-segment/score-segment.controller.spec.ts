import { ScoreSegmentController } from './score-segment.controller';
import { ScoreSegmentService } from './score-segment.service';
import { BadRequestException } from '@nestjs/common';

describe('ScoreSegmentController', () => {
  let controller: ScoreSegmentController;
  let service: any;

  beforeEach(() => {
    service = {
      scoreToRank: jest.fn(),
      rankToScore: jest.fn(),
      equivalent: jest.fn(),
    };
    controller = new ScoreSegmentController(service as ScoreSegmentService);
  });

  describe('lookup', () => {
    it('有 score → 调用 scoreToRank', async () => {
      service.scoreToRank.mockResolvedValue({ rank: 28500 });
      const result = await controller.lookup({ year: 2025, examType: '物理', score: 580 });
      expect(service.scoreToRank).toHaveBeenCalledWith(2025, '物理', 580);
      expect(result.rank).toBe(28500);
    });

    it('有 rank → 调用 rankToScore', async () => {
      service.rankToScore.mockResolvedValue({ score: 580 });
      const result = await controller.lookup({ year: 2025, examType: '物理', rank: 28500 });
      expect(service.rankToScore).toHaveBeenCalledWith(2025, '物理', 28500);
      expect(result.score).toBe(580);
    });

    it('两者都没有 → BadRequestException', async () => {
      await expect(
        controller.lookup({ year: 2025, examType: '物理' } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('equivalent', () => {
    it('委托给 service.equivalent', async () => {
      service.equivalent.mockResolvedValue({ base: {}, equivalents: [] });
      await controller.equivalent({ baseYear: 2025, examType: '物理', rank: 28500 });
      expect(service.equivalent).toHaveBeenCalledWith(2025, '物理', 28500);
    });
  });
});
