/**
 * @jest-environment jsdom
 */
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as React from 'react';
import { usePoi } from '../usePoi';
import { universityService } from '@/services/university';

jest.mock('@/services/university', () => ({
  universityService: {
    getCampusPois: jest.fn(),
  },
}));

const wrap = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children);
};

describe('usePoi', () => {
  beforeEach(() => jest.clearAllMocks());

  it('fetches POIs with the requested category', async () => {
    (universityService.getCampusPois as jest.Mock).mockResolvedValue([
      { id: 1, amapId: 'A', name: '西大直街', category: 'subway', distance: 380, metadata: null },
    ]);

    const { result } = renderHook(
      () => usePoi({ universityId: 1, campusId: 10, category: 'subway' }),
      { wrapper: wrap() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
    expect(universityService.getCampusPois).toHaveBeenCalledWith(1, 10, {
      category: 'subway',
      limit: 5,
    });
  });

  it('returns isError when the API throws', async () => {
    (universityService.getCampusPois as jest.Mock).mockRejectedValue(new Error('boom'));

    const { result } = renderHook(
      () => usePoi({ universityId: 1, campusId: 10, category: 'subway' }),
      { wrapper: wrap() },
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it('does not fetch when campusId is null', () => {
    renderHook(
      () => usePoi({ universityId: 1, campusId: null, category: 'subway' }),
      { wrapper: wrap() },
    );

    expect(universityService.getCampusPois).not.toHaveBeenCalled();
  });
});
