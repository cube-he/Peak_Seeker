/**
 * @jest-environment jsdom
 */
import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PoiList } from '../PoiList';
import { universityService } from '@/services/university';

jest.mock('@/services/university', () => ({
  universityService: { getCampusPois: jest.fn() },
}));

const wrap = (ui: React.ReactNode) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
  );
};

describe('PoiList', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders POI items with names and distances', async () => {
    (universityService.getCampusPois as jest.Mock).mockResolvedValue([
      { id: 1, amapId: 'A', name: '西大直街', category: 'subway', distance: 380, metadata: null },
      { id: 2, amapId: 'B', name: '哈工大',   category: 'subway', distance: 1250, metadata: null },
    ]);

    wrap(<PoiList universityId={1} campusId={10} category="subway" />);

    expect(await screen.findByText('西大直街')).toBeTruthy();
    expect(screen.getByText('380 m')).toBeTruthy();
    expect(screen.getByText('哈工大')).toBeTruthy();
    expect(screen.getByText('1.3 km')).toBeTruthy();
  });

  it('shows empty placeholder when API returns []', async () => {
    (universityService.getCampusPois as jest.Mock).mockResolvedValue([]);

    wrap(<PoiList universityId={1} campusId={10} category="subway" />);

    expect(await screen.findByText(/暂无周边/)).toBeTruthy();
  });

  it('shows error placeholder when API throws', async () => {
    (universityService.getCampusPois as jest.Mock).mockRejectedValue(new Error('boom'));

    wrap(<PoiList universityId={1} campusId={10} category="subway" />);

    expect(await screen.findByText(/无法加载/)).toBeTruthy();
  });
});
