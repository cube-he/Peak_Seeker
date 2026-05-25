/** @jest-environment jsdom */
import { render, screen, waitFor } from '@testing-library/react';
import { EquivalentScoreTable } from '../EquivalentScoreTable';
import { scoreSegmentApi } from '@/services/score-segment';

jest.mock('@/services/score-segment', () => ({
  scoreSegmentApi: { equivalent: jest.fn() },
}));

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation((query: string) => ({
    matches: false, media: query, onchange: null,
    addListener: jest.fn(), removeListener: jest.fn(),
    addEventListener: jest.fn(), removeEventListener: jest.fn(), dispatchEvent: jest.fn(),
  })),
});

describe('EquivalentScoreTable', () => {
  beforeEach(() => {
    (scoreSegmentApi.equivalent as jest.Mock).mockReset();
  });

  it('renders one row per equivalent year from the .equivalents array', async () => {
    (scoreSegmentApi.equivalent as jest.Mock).mockResolvedValue({
      base: { year: 2025, examType: '物理', score: 600, rank: 12000, percentile: 3.5 },
      equivalents: [
        { year: 2024, examType: '物理', score: 598, rank: 12100, percentile: 3.6 },
        { year: 2023, examType: '物理', score: 602, rank: 11900, percentile: 3.4 },
        { year: 2022, examType: '物理', score: 605, rank: 11700, percentile: 3.3 },
      ],
    });

    render(<EquivalentScoreTable rank={12000} subjects="物理" />);

    await waitFor(() => {
      expect(screen.getByText('2024')).toBeInTheDocument();
    });
    expect(screen.getByText('2023')).toBeInTheDocument();
    expect(screen.getByText('2022')).toBeInTheDocument();
  });

  it('calls equivalent with baseYear 2025 and the subject as examType', async () => {
    (scoreSegmentApi.equivalent as jest.Mock).mockResolvedValue({
      base: { year: 2025, examType: '历史', score: 550, rank: 12000, percentile: 8.0 },
      equivalents: [],
    });

    render(<EquivalentScoreTable rank={12000} subjects="历史" />);

    await waitFor(() => {
      expect(scoreSegmentApi.equivalent).toHaveBeenCalledWith({
        baseYear: 2025,
        examType: '历史',
        rank: 12000,
      });
    });
  });
});
