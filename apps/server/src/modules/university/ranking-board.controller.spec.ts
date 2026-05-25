import { UniversityController } from './university.controller';

describe('UniversityController.getRankingBoard', () => {
  it('delegates to RankingBoardService with the requested exam type', async () => {
    const rankingBoardService = { getRankingBoard: jest.fn().mockResolvedValue([]) };
    const controller = new UniversityController(
      {} as any, rankingBoardService as any,
    );

    await controller.getRankingBoard({ examType: '历史' });

    expect(rankingBoardService.getRankingBoard).toHaveBeenCalledWith('历史');
  });

  it('defaults exam type to 物理 when omitted', async () => {
    const rankingBoardService = { getRankingBoard: jest.fn().mockResolvedValue([]) };
    const controller = new UniversityController({} as any, rankingBoardService as any);

    await controller.getRankingBoard({});

    expect(rankingBoardService.getRankingBoard).toHaveBeenCalledWith('物理');
  });
});
