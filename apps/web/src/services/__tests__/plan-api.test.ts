const mockDelete = jest.fn();

jest.mock('../api', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    patch: jest.fn(),
    delete: mockDelete,
  },
}));

import { planApi } from '../plan-api';

describe('planApi', () => {
  beforeEach(() => {
    mockDelete.mockClear();
  });

  it('deletes a volunteer plan through the plan delete route', () => {
    planApi.deletePlan('12');

    expect(mockDelete).toHaveBeenCalledWith('/plans/12');
  });
});
