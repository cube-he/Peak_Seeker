const mockGet = jest.fn();

jest.mock('../api', () => ({
  __esModule: true,
  default: { get: mockGet },
}));

import { universityService } from '../university';

describe('universityService.getRankingBoard', () => {
  beforeEach(() => mockGet.mockClear());

  it('requests the ranking board route with the exam type', () => {
    universityService.getRankingBoard('物理');
    expect(mockGet).toHaveBeenCalledWith('/universities/ranking-board', {
      params: { examType: '物理' },
    });
  });
});
