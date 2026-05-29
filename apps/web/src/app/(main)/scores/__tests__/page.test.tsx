/** @jest-environment jsdom */
import { render, screen, waitFor } from '@testing-library/react';
import ScoresPage from '../page';
import { scoreSegmentApi } from '@/services/score-segment';
import { admissionService } from '@/services/admission';

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation((query: string) => ({
    matches: false, media: query, onchange: null,
    addListener: jest.fn(), removeListener: jest.fn(),
    addEventListener: jest.fn(), removeEventListener: jest.fn(), dispatchEvent: jest.fn(),
  })),
});

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  usePathname: () => '/scores',
  useSearchParams: () => ({ get: () => null }),
}));

jest.mock('@/services/score-segment', () => ({
  scoreSegmentApi: { lookup: jest.fn(), equivalent: jest.fn() },
}));
jest.mock('@/services/admission', () => ({
  admissionService: { getAggregated: jest.fn(), getAggregatedDetail: jest.fn() },
}));
jest.mock('@/stores/userStore', () => ({
  useUserStore: () => ({
    examInfo: { score: 600, rank: 12000, province: '四川', subjects: ['物理'], examYear: 2025 },
  }),
}));
jest.mock('@/components/layout/MainLayout', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('@/components/university/UniversityLogo', () => ({
  __esModule: true,
  default: () => null,
}));

describe('ScoresPage', () => {
  beforeEach(() => {
    (scoreSegmentApi.lookup as jest.Mock).mockReset();
    (scoreSegmentApi.equivalent as jest.Mock).mockReset();
    (admissionService.getAggregated as jest.Mock).mockReset();
    (scoreSegmentApi.equivalent as jest.Mock).mockResolvedValue({
      base: { year: 2025, examType: '物理', score: 600, rank: 12000, percentile: 0.035 },
      equivalents: [],
    });
    (admissionService.getAggregated as jest.Mock).mockResolvedValue({ data: [], total: 0 });
  });

  it('auto-queries from examInfo on mount', async () => {
    (scoreSegmentApi.lookup as jest.Mock).mockResolvedValue({
      year: 2025, examType: '物理', score: 600, rank: 12000, percentile: 0.035,
    });

    render(<ScoresPage />);

    await waitFor(() => {
      expect(scoreSegmentApi.lookup).toHaveBeenCalledWith(
        expect.objectContaining({ year: 2025, examType: '物理', score: 600 }),
      );
    });
    await waitFor(() => {
      expect(admissionService.getAggregated).toHaveBeenCalledWith({
        rank: 12000,
        province: '四川',
        subjects: '物理',
      });
    });
    await waitFor(() => {
      expect(screen.getByText('你的定位')).toBeInTheDocument();
    });
  });

  it('renders a refined error message when lookup rejects', async () => {
    (scoreSegmentApi.lookup as jest.Mock).mockRejectedValue({
      response: { status: 404, data: { message: 'not found' } },
    });

    render(<ScoresPage />);

    await waitFor(() => {
      expect(screen.getByText(/未找到对应数据/)).toBeInTheDocument();
    });
  });
});
