/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react';
import { EquivalentScoreTable } from '../EquivalentScoreTable';

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation((query: string) => ({
    matches: false, media: query, onchange: null,
    addListener: jest.fn(), removeListener: jest.fn(),
    addEventListener: jest.fn(), removeEventListener: jest.fn(), dispatchEvent: jest.fn(),
  })),
});

describe('EquivalentScoreTable', () => {
  it('renders one row per year and marks the baseYear with 本次', () => {
    render(
      <EquivalentScoreTable
        baseYear={2025}
        rows={[
          { year: 2022, examType: '物理', score: 605, rank: 11700, percentile: 0.033 },
          { year: 2023, examType: '物理', score: 602, rank: 11900, percentile: 0.034 },
          { year: 2024, examType: '物理', score: 598, rank: 12100, percentile: 0.036 },
          { year: 2025, examType: '物理', score: 600, rank: 12000, percentile: 0.035 },
        ]}
      />,
    );

    expect(screen.getByText('2024')).toBeInTheDocument();
    expect(screen.getByText('2023')).toBeInTheDocument();
    expect(screen.getByText('2022')).toBeInTheDocument();
    // base year 行: 数字 + Tag 标签
    expect(screen.getByText('本次')).toBeInTheDocument();
  });

  it('formats percentile as 前 X.XX%', () => {
    render(
      <EquivalentScoreTable
        baseYear={2025}
        rows={[
          { year: 2025, examType: '物理', score: 600, rank: 12000, percentile: 0.0354 },
        ]}
      />,
    );
    expect(screen.getByText('前 3.54%')).toBeInTheDocument();
  });
});
