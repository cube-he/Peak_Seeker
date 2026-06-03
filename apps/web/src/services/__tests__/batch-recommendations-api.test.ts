jest.mock('../api', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

import { batchRecommendationsApi } from '../batch-recommendations-api';
import api from '../api';

describe('batchRecommendationsApi', () => {
  beforeEach(() => jest.clearAllMocks());

  it('fetch 调 2 个端点合并', async () => {
    (api.get as jest.Mock)
      .mockResolvedValueOnce([
        { batchConfigId: 1, batchName: '本科批A段', verdict: 'ELIGIBLE' },
      ])
      .mockResolvedValueOnce({ batchesConfirmedAt: null });
    const result = await batchRecommendationsApi.fetch(10);
    expect(api.get).toHaveBeenCalledWith('/students/10/eligible-batches');
    expect(api.get).toHaveBeenCalledWith('/students/10');
    expect(result.batches).toHaveLength(1);
    expect(result.batchesConfirmedAt).toBe(null);
  });

  it('confirm 提交 preferredBatches', async () => {
    (api.post as jest.Mock).mockResolvedValueOnce({});
    await batchRecommendationsApi.confirm(
      10,
      ['本科批A段', '本科批B段'],
      '面谈备注',
    );
    expect(api.post).toHaveBeenCalledWith('/students/10/confirm-batches', {
      preferredBatches: ['本科批A段', '本科批B段'],
      reviewComment: '面谈备注',
    });
  });

  it('unlock 发空 body', async () => {
    (api.post as jest.Mock).mockResolvedValueOnce({});
    await batchRecommendationsApi.unlock(10);
    expect(api.post).toHaveBeenCalledWith('/students/10/unlock-batches', {});
  });
});
