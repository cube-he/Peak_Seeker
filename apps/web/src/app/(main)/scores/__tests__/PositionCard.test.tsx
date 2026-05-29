/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react';
import { PositionCard } from '../PositionCard';

// AntD Row/Col calls window.matchMedia; jsdom doesn't implement it
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation((query: string) => ({
    matches: false, media: query, onchange: null,
    addListener: jest.fn(), removeListener: jest.fn(),
    addEventListener: jest.fn(), removeEventListener: jest.fn(), dispatchEvent: jest.fn(),
  })),
});

describe('PositionCard', () => {
  it('shows the converted rank, percentile (×100, 2 decimals) and tier counts', () => {
    render(
      <PositionCard
        rank={12000}
        percentile={0.035}
        rushCount={4}
        stableCount={9}
        safeCount={6}
        unknownCount={0}
        year={2025}
      />,
    );
    expect(screen.getByText('12000')).toBeInTheDocument();
    expect(screen.getByText(/前 3\.50%/)).toBeInTheDocument();
    expect(screen.getByText(/2025/)).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('9')).toBeInTheDocument();
    expect(screen.getByText('6')).toBeInTheDocument();
  });

  it('appends a 预测位次 note when unknownCount > 0', () => {
    render(
      <PositionCard
        rank={12000}
        percentile={0.035}
        rushCount={4}
        stableCount={9}
        safeCount={6}
        unknownCount={7}
        year={2025}
      />,
    );
    expect(screen.getByText(/另有 7 所院校暂无预测位次数据/)).toBeInTheDocument();
  });

  it('omits the note when unknownCount is 0', () => {
    render(
      <PositionCard
        rank={12000}
        percentile={0.035}
        rushCount={4}
        stableCount={9}
        safeCount={6}
        unknownCount={0}
        year={2025}
      />,
    );
    expect(screen.queryByText(/数据不足|暂无预测位次/)).not.toBeInTheDocument();
  });
});
